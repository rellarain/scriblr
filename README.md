# Scriblr

An offline, single-user desktop app for brainstorming, outlining, drafting,
reading, and revising a book.

This README is the comprehensive reference for how the app is built: repo
layout, runtime architecture, backend storage/data model, the API surface,
and the frontend's feature areas. For day-to-day dev/build/run commands, see
[Development](#development) and [Running the desktop app](#running-the-desktop-app)
near the end.

Scriblr was simplified down from a richer original concept (multi-user SaaS,
reader roles, a deeper Plotter/Pantser/Puzzler outline model) — see
[`docs/legacy-concept/`](docs/legacy-concept/) for that archived design, kept
for reference as a plausible v2 direction, not as active code.

## Contents

- [Repo structure](#repo-structure)
- [Architecture](#architecture)
- [Backend design](#backend-design)
- [Frontend design](#frontend-design)
- [The Writer and the other interfaces](#the-writer-and-the-other-interfaces-assetsinterfaces)
- [Known stale docs](#known-stale-docs)
- [Development](#development)
- [Running the desktop app](#running-the-desktop-app)

## Repo structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app factory: exception handlers, routers, SPA static fallback
│   ├── deps.py               # get_storage_root / get_app_data_storage_root (FastAPI Depends)
│   ├── api/                  # one router module per feature — see API surface below
│   ├── models/                # request/response DTOs that aren't part of the persisted schema
│   └── storage/
│       ├── paths.py            # OS app-data dir resolution, SCRIBLR_DATA_DIR override
│       ├── schema.py            # every persisted Pydantic model (SCHEMA_VERSION = 2)
│       ├── project_store.py      # the storage engine: atomic writes, locking, quarantine, migration, compaction
│       ├── tree_history.py        # shared outline/plot snapshot-diff-revert engine
│       ├── activity.py             # daily activity aggregate + unified activity log
│       ├── analytics.py             # word-count/goal/flagged-node rollups
│       ├── scrap.py                  # orphaned-moment detect/restore/permanent-delete
│       ├── presets_store.py           # global (non-project) plot-preset catalog
│       ├── user_settings_store.py      # global user settings: time-of-day theme, UI prefs, Writer UI state (kv)
│       ├── training_schema.py / training_store.py   # Training: the courses (training.json) and one learner's progress (training-progress.json)
│       └── pdf_export.py               # fpdf2 book/chapter PDF export
├── tests/                    # 38 pytest modules, one per feature area (+ conftest.py fixtures)
├── server_main.py            # entrypoint used by Electron / PyInstaller
├── requirements.lock          # exact dependency versions (what CI installs)
└── scriblr.spec               # PyInstaller build spec

frontend/
├── src/
│   ├── main.tsx                # entrypoint: applies the cached theme, then renders App in a BrowserRouter
│   ├── App.tsx / Header.tsx / Sidebar.tsx   # the shell: header, the interface for the URL (/write, /read, /train), the admin/helper sidebar
│   ├── assets/Interfaces/       # the interfaces: writer/ (WUI, the Writer), reader/ (RUI), TUI (Training; training/), VUI, admin/ (AUI), helper/ (HUI), UUI
│   ├── api/                      # fetch client (client.ts) and one module per backend area; types.ts mirrors schema.py
│   ├── components/               # shared pieces: tiles/ (the split-tree grid), ColorRange, ...
│   ├── settings/ theme/          # the settings store (backend-backed, cached in localStorage) and the time-of-day theme engine
│   ├── designSystem/             # the preview app that generates docs/design-system
│   ├── lib/                       # pure helpers (nodeKeys, ...) with unit tests
│   └── test/                      # shared test setup and helpers (setup.ts, mockFetch.ts, makeWorkspace.ts, workspaceBackend.ts)
├── scripts/design-system/      # generates docs/design-system from the code (npm run design-system)
└── vite.config.ts             # dev proxy /api → 127.0.0.1:8000; Vitest config lives here too

electron/                    # desktop shell: spawns the backend as a subprocess, opens a native window
docs/
├── data-model.md              # storage design doc — now stale, see "Known stale docs" below
└── legacy-concept/              # archived original multi-user SaaS concept, not active code
```

## Architecture

Three processes, one desktop app:

- **`electron/`** opens a native window and spawns the FastAPI backend as a
  subprocess (`backend/server_main.py` in dev, or its PyInstaller-built
  executable once packaged), then points the window at it — the same way a
  browser tab would point at a URL.
- In **dev mode**, the frontend runs as its own Vite dev server; Vite proxies
  any `/api/*` request to `http://127.0.0.1:8000` (see `frontend/vite.config.ts`).
  There is no CORS middleware anywhere in the backend — it's never needed,
  since the frontend only ever reaches the backend same-origin (packaged) or
  via this dev proxy (never a real cross-origin browser request).
- In **prod / packaged mode**, there's no separate frontend server: the
  backend itself serves the built `frontend/dist` and falls back to
  `index.html` for any non-`api/*` path, so client-side routing survives a
  hard refresh on a nested route (`app/main.py`'s catch-all route, registered
  last so it only catches what the real routers didn't).
- Every non-dev launch (packaged app, `npm run start:prod`, the desktop
  shortcut) picks a **fresh, dynamically free port** for the backend each
  time, rather than a fixed one — this is what avoids the "port already in
  use" class of error a fixed dev port (8000) is prone to.
- Project data lives under the OS-standard app-data directory
  (`%APPDATA%\Scriblr` on Windows, resolved by `backend/app/storage/paths.py`,
  overridable via `SCRIBLR_DATA_DIR`), independent of wherever the app itself
  is installed.

## Backend design

### Storage model

Each project is **one file**: `<app-data-root>/projects/<project-id>/project.json`,
a single `ProjectFile` (`backend/app/storage/schema.py`) with sectioned
contents — `index`, `outline`, `plot`, `drafts`, `revisions`,
`outlineHistory`, `plotHistory`, `activity`, `schedule`, `maps`, `scrap`. This
replaced an older layout of ~10 separate shard files/dirs per project (still
described, now stale, in `docs/data-model.md`).

- **Atomic writes** (`project_store._atomic_write_json`): serialize to a temp
  file in `<project>/.tmp/`, `fsync`, then `os.replace()` onto the
  destination — atomic on both POSIX and Windows. The JSON is compact and real UTF-8 (`json.dumps`, which takes the C encoder; `json.dump` does
  not), about 40% smaller and several times faster to write than the indented ASCII it used to be; reading accepts either.
- **Locking**: a per-project-id `threading.RLock` registry
  (`_project_locks`, guarded by a module-level `threading.Lock`). `_mutate()`
  acquires the project's lock, loads the whole file, lets a callback mutate
  it in memory, writes it back. Reentrant (`RLock`, not `Lock`) because
  `_mutate` internally triggers a migration check that itself needs the
  lock. Deliberately single-process/single-user — no cross-process lock,
  since this is a local single-user desktop app.
- **Transactions** (`project_store.transaction(root, project_id)`): holds the project's lock, loads the file once, lets every store call made inside
  on that thread work on the one in-memory `ProjectFile` (later calls see earlier changes) and writes it once at the end if anything changed;
  nothing is written if the block raises. The handlers that did several things per request (`PUT` draft, outline, plot, the reverts, a manual
  revision, `PATCH` project) and the read-heavy ones (analytics, activity, PDF export) use it, so a draft save is one load and one write, not eight
  and three.
- **The parsed project is kept in memory** (`project_store._cache`, the last 3 projects used): parsing and validating a 5 MB `project.json` costs about
  130 ms, so a read or a save starts from the kept `ProjectFile` instead of the file. An entry is good while the file has the size and modification
  time it had when the entry was made (from a read or from our own save), so a file changed behind the app's back is read again; a project with a
  quarantined section is never kept. Only `_mutate` and `transaction` change the kept copy, under the project's lock, and if a change or its write
  fails the entry is dropped. A read made outside a transaction (`_read`) returns a copy of what it hands out, so nothing outside the lock holds a
  part of it; readers not taught to share still get a `ProjectFile` of their own from the file (`_load_project_file`). At 108,000 words a draft save
  went from about 290 ms to 175 ms, `GET` outline and plot from about 190 ms to 45 ms. The test suite switches on `_VERIFY_CACHE`
  (`tests/conftest.py`; the `SCRIBLR_VERIFY_CACHE=1` environment variable does the same): every hit is compared with a fresh read, so a test fails if anything changes a kept copy on the side.
- **History storage** (`storage/tree_pack.py`): the outline and plot snapshots are stored *sparse* (a node keeps only the fields that differ from the
  model's defaults) and as a *keyframe* (every node) or a *delta* (`base` + all node ids in order + the sparse nodes that changed); a keyframe comes
  at least every 10 snapshots. Outside the store a snapshot always has its complete `nodes` (`list_tree_snapshots`, `load_tree_snapshot`,
  `last_tree_snapshot` unpack; `save_tree_snapshot` packs). Format 4 converts an older project's history on its first write (keeping the file as
  `project.json.v<N>.bak`, and, once per format version, a copy of the whole data directory at start-up: `storage/backup.py`). Measured on the
  largest real project: 10.4 MB to 0.65 MB with identical snapshots.
- **Corruption isolation** is section-level, not whole-file:
  - Unparseable whole-file JSON, or a corrupt `index` section, is **fatal**
    — the file (or just that raw value) is renamed aside into
    `quarantine/<label>.corrupt-<timestamp>.json`, and `ShardCorruptError`
    is raised (→ HTTP 409, see below).
  - A corrupt `outline` or `plot` section is quarantined and defaulted to an
    empty tree (and `activity`/`schedule`/`scrap` likewise), but **the stored value
    stays in `project.json`** through every other save until something replaces
    that section, so a build that can read it later still finds it; the specific loader (`load_outline`/`load_plot`) still
    raises `ShardCorruptError` so its caller (`GET /api/projects/{id}`) can
    surface it as a warning without failing the rest of the request.
  - A corrupt entry within `drafts` (one chapter), `revisions`, or
    `outlineHistory`/`plotHistory` is dropped individually — siblings
    survive untouched.
  - Corrupt `activity`/`schedule`/`scrap` sections default silently.
- **Guards** (`tests/test_integrity.py`):
  - Every id that becomes part of a path (a project id, a legacy per-moment file)
    goes through `storage/ids.check_id` (no `..`, separators, drive letters,
    leading dots) and is answered with HTTP 400; the SPA fallback serves only
    files inside the built frontend.
  - `ProjectFile.schemaVersion` is `PROJECT_FILE_VERSION` (5: 3 added plot clusters, 4 the packed tree histories, 5 a book's paragraph indent in
    spaces; the first write of an older file keeps it once as `project.json.v<N>.bak`).
    A file from a *newer* build is read but never written over
    (`NewerSchemaError` → HTTP 409); an older one is brought up to date on its
    next write.
  - Each write first copies the file it replaces to `project.json.bak` (the last
    good copy). A section's quarantine copy is made once, and only the newest 20
    copies are kept.
  - Deleting a project moves it to `<projects>/.trash/<id>-<time>/`; trash older
    than 30 days, and temp files a killed process left in `<project>/.tmp/`, are
    removed at start-up.
  - `storage/backup.py` (`python -m app.storage.backup`) copies the whole
    app-data directory beside it (`Scriblr-backups/`, newest 5 kept): run before
    any bulk migration.
  - Electron allows one Scriblr at a time (single-instance lock), since the store
    has no cross-process lock.
- **Legacy migration** (`_ensure_migrated`/`_migrate_legacy_layout`):
  one-time, idempotent (double-checked-locking), folds the old multi-file
  layout into `project.json` on first touch after upgrade. Old files are
  **never deleted** — left on disk as a permanent safety net, matching this
  codebase's existing convention elsewhere (e.g. legacy per-moment draft/
  revision fallbacks).
- **Auto-compaction** (`consolidate_project_history`, triggered on
  `GET /api/projects/{id}` since there's no background scheduler in this
  app): once `outlineHistory` or `plotHistory` exceeds
  `TREE_HISTORY_COMPACT_THRESHOLD = 75` entries, each is independently
  pruned down to the `TREE_HISTORY_KEEP = 50` most recent (by `createdAt`).
  A compaction makes the oldest snapshot kept a keyframe. Manual chapter `revisions` are **never** pruned; a chapter's automatic *session*
  revisions are capped at 100 (oldest first), and the saved-settings map at 5,000 keys. Returns human-readable
  messages folded into the same `warnings` list as corruption warnings.

### Data model

- **Outline tree** (`OutlineNode`/`OutlineTree`) — a flat list with
  `parentId`, seven possible kinds in strict order:
  `series < book < arc < chapter < act < scene < moment`
  (`OutlineNodeKind`/`OUTLINE_KIND_ORDER` in `schema.py`). Nesting is
  flexible: a node's parent may be any strictly-shallower kind, not
  necessarily the adjacent one (e.g. a scene directly under a book). `book`
  and `chapter` are the only required/non-toggleable levels
  (`REQUIRED_OUTLINE_LEVELS`); which other levels are "in play" per project
  is configurable via `ProjectSettings.outlineLevels`. **The moment is the
  writing unit** — only `moment` nodes carry a `draftRef`, pointing at the
  id used to look up its draft content; draft shard creation is lazy (first
  save). Nodes also carry `flag` (`NodeFlag`: `review|edit|add|delete` +
  note), `color`, `chapterCountTarget`, `plotlineIds`, `wordCountGoal`.
- **Plot tree** (`PlotNode`/`PlotTree`) — the same flat-list-with-`parentId`
  shape, five kinds: `category < subcategory < cluster < plotline < plotpoint`
  (`PlotNodeKind`/`PLOT_KIND_ORDER`; a cluster is an optional grouping under a
  subcategory, and a plotline may sit under any of the three). **Fields and values:** any category,
  subcategory, cluster or plotline defines fields (`customFieldDefs`); each field
  holds many **values**, and every value is a plotpoint (`fieldId`; title 1-50
  characters, description up to 255). **Fieldsets:** a node can group some of its
  fields in named, collapsible sets (`customFieldSets`, `{ id, name }`, the name up to 30
  characters, at most 20 per node; a field names its set with `setId`, so it is loose or
  in one set at most). **Links:** a category, subcategory, cluster or plotline can be linked to
  any other of those (never a plotpoint): `links` holds the ids of the others (at most 100),
  kept on **both** ends (`writer/plotLinks.ts`: `syncLinks` runs in `commitPlot`, so a deleted
  node leaves no link behind, and in `migratePlot` on open). The Linked section of each editor
  (`LinkedSection.tsx`) lists them as rows (`PlotNodeChip.tsx`) that open the node, and adds one
  from a picker grouped by kind; taking one away asks first. A node lists its loose fields first, then its sets, then (a
  plotline) its `Scrap` field. A set passes down to the plotlines like its fields (read-only
  there, folded or open as the writer left it, remembered per set); a plotline makes its own
  sets for its own fields; deleting a set keeps its fields, loose. A value defined on a category,
  subcategory or cluster (in its own fields or in ones it **inherits**: a subcategory has its
  category's fields, a cluster its subcategory's and its category's, shown read-only in its editor
  under its own, `FieldBlocks.tsx`'s `InheritedGroups`) is shown on every plotline under it as a **reference** (a
  plotpoint with `refId`, whose text is the original's), which that plotline
  assigns to its own chapters; deleting a category/subcategory/cluster value or field
  turns its assigned references into the plotline's own values in a plotline
  field of the same name, and deleting a plotline field sends its assigned values to
  the plotline's `Scrap` field. **Placements:** a plotpoint is put in the outline by
  its `placements` (`{ id, targetId, paragraphIndex, awareness }`, at most 100, at
  most one to a target): each is a chapter (from the plot editor) or an act/scene/moment
  (from the chapter outline), and the plotpoint can have many, each standing alone
  (removed, moved or stepped on its own; the plotpoint stays in the tray, and a counter
  says how often it is placed). A plotpoint is *placed* once it has one. Placed on a
  moment a placement has an `awareness` (`front` = audience and characters know,
  `back` = audience only, `mid` = characters only, `off` = neither), changed by clicking
  its eye. A plotpoint saved before this held one place in `assignedMomentId` (with
  `assignedParagraphIndex` and `awareness`); the backend reads that into a first
  placement when the file loads (a validator on `PlotNode`, also cutting a second
  placement on one target and any beyond 100), and the old fields are saved empty.
  The rules are in `frontend/src/assets/Interfaces/writer/plotPlacement.ts`.
  **Kinds of field:** a field holds plotpoints (no `kind`, the usual one) or is a
  `multi`-select (any of its `options`), a `dropdown` (one of them) or a short `text`.
  Its `options` are `{ id, label }` (the label up to 30 characters, at most 20 a
  field) and are set by the node that defines the field; the kind can be changed only
  while the field has no values. A choice field's values are **answers**: plotpoints of
  the node that answers (each plotline, and the category, subcategory or cluster that
  defines the field, each answer for themselves; a plotline shows the owner's answer
  read-only beside its own, and a choice field makes no references). An answer to an
  option has that option's id in `optionId` and its label as its title (renaming the
  option retitles it, removing the option removes it); an answer to a short text is a
  plotpoint titled with the text (up to 50 characters). An answer is placed, counted
  and listed in the tray like any plotpoint; taking one away takes its placements
  along, so the editor asks first when it is placed. A kind the backend does not know
  is read as the usual one, labels are cut and repeated option ids dropped (nothing
  here sets the whole plot aside), and the book's *plotting* and *plotpoints placed*
  bars leave answers out. The rules are in `.../writer/plotKinds.ts` (reading a kind,
  repairing what is stored: `repairChoices`, run by `migratePlot`) and `plotAnswers.ts`
  (options and answers). `keywords` (on `plotline`
  nodes) are free-text tags used to detect keyword mentions in prose. The pure
  rules (references, deletion, migration of older plots, assignment) live in
  `frontend/src/assets/Interfaces/writer/plotFields.ts`, and run on load.
  A book has one colour, its `themeHue` (arcs and chapters have their own, within 60 and 30 degrees of their parent's; a series has none).
- **Keyboard shortcuts** (`frontend/src/lib/nodeKeys.ts`, shared by the
  outline, plot, scratchpad and admin config editors): Enter adds a sibling,
  **Shift+Enter adds a child** (one level down; single-line fields only), Ctrl+Enter
  a sibling of the parent, Backspace/Delete in an empty node removes it, Tab moves on.
- **Drafts** — `DraftChapter`: a per-chapter map of `momentId → { body,
  wordCount, updatedAt }`. Body format is always `"markdown"` (a plain
  textarea over markdown text, no rich-text conversion layer).
- **Revisions** — `RevisionSnapshot`: **chapter-scoped**, not per-moment —
  one snapshot captures every moment's body in a chapter at once.
  `trigger` is `"manual"` (explicit save) or `"auto"` (a rolling snapshot
  fixed at id `"auto"`, overwritten each time rather than appended, fired
  client-side after 5 minutes of inactivity on a chapter page). Diffs
  between any two snapshots (or a snapshot and the live draft) are computed
  on read via Python `difflib.SequenceMatcher`, word/whitespace-tokenized,
  and never persisted. Revert always safety-snapshots the current state
  first. Inline comments (`RevisionComment`) are anchored by moment id +
  text offset within that specific snapshot, with a lightweight
  `primary|secondary` flag.
- **Activity** — `DailyActivityLog` (per-day word-count delta + outline/
  plot/draft-revision counts) plus a unified reverse-chronological
  `ActivityLogEntry` log merging tree-history and revision events.
- **Analytics** — `ProjectAnalytics`: totals (book/chapter/scene/moment
  counts, total words), goal echoes, per-book/per-chapter word rollups,
  `nodeWordCounts` (the draft words of every outline node, moments up),
  and every flagged outline/plot node.
- **Schedule** — `ScheduleCompletionLog`: per-date list of completed
  checklist-item ids (items and routines; the backend just
  persists which ids were checked off, and counts a new tick as project
  activity).
- **Faceted activity** (`facets`, project file format 6) — `FacetActivity`:
  every change to the outline, plot, draft, revision flags and project is an
  `ActivityEvent` (local day and 10-minute slot; one per node per slot, so
  autosaves merge), kept in detail for 14 days; `daily` totals per facet
  (outline/plot nodes made, edited or deleted, net draft words and by book,
  flags applied and resolved, project items) for about a year; whole older
  months fold into `monthly` totals (kept for good, with their active days);
  and a 28-day per-slot profile feeds the header ribbon. Opening a project
  compacts it (no scheduler) and folds the older per-day saves in once.
  Trees are compared with the ones they replace (`facet_activity.tree_changes`).
- **Revision flags** — `RevisionFlag`: a flag (review/edit/add/delete, a note)
  on a passage of a moment's draft (it follows the text as it is edited,
  `storage/revision_flags.py`, and goes `stale` if the text is cut) or on the
  project; resolving one (with an outcome note) is activity too.
- **Planner** — `Planner`: goals (per facet; a project, a book or a chapter;
  daily, weekly and total targets; a deadline), shifts (a day and 10-minute
  slots, repeating, paused, skipped, overridden a day at a time, with an
  aim and a target), routines (daily, weekly or after an interval of days,
  weeks or months, optionally a range), tasks (`PlanItem`: a label, a `priority`
  of `high`, `medium`, `low` or `none` (a task saved before priorities reads as
  medium), a `dueDate`, notes, an estimate in minutes, subtasks, an optional
  facet and node with an `aim` counted from `addedOn`, the shift it is on and
  the day it was done; `carried` marks one that came back from a shift that
  ended with it undone; `phaseId` tags the phase it builds to and `processId`
  the process it is a step of, `afterId` the step it follows in an ordered group), shift templates, rest days and the project's
  timeline. A project is also made of **phases** (`Phase`: a title, the
  `result` it builds to, a status of planned, active or done, and dates; it is
  on one row of the plan: the project's, or a book's or chapter's, as `level`
  and `nodeId`, in the sequence `order`, with its start pinned when `fixed`, and
  possibly a pass of a **kind** (`PhaseKind`: a recipe with a result, length and
  milestones, which a pass follows in every field not in its `overrides`)), the
  **milestones** along them (`Milestone`: the sections of a phase, each a
  deliverable (`result`) reached by finishing the work placed in it, which is
  an item's or routine's `milestoneId` and a process's or exercise's
  `milestoneIds`; tickable by hand too; pure logic in `lib/planRows.ts`,
  `planSequence.ts`, `planActions.ts`, `phaseKinds.ts` and `milestoneProgress.ts`; the Project console's **Plan** tile, `plan/PlanTimeline.tsx`, draws the rows, the phase cards and their milestone sections, with the kinds in `plan/KindsPanel.tsx`; `lib/planProjection.ts` projects when the work left would be done, from the time of each piece of work and the shifts scheduled for it),
  **processes** (`Process`: step groups done in order or in any order, several
  phases and facets, required milestones, and links to other processes that
  come before, after or go with it) and **exercises** (`Exercise`: a prompt, a
  length, a times-a-week pace and a log); goals and routines can carry a
  `phaseId` too. A phase in the **project template** has a level (the project, each book or each chapter) and a copy puts a book or chapter phase onto each book or chapter chosen (`lib/template.ts`). A phase or milestone in the **project template** (an account-level planner kept
  in the settings store as `scriblr.writer.projectTemplate`; `lib/template.ts`
  copies picked items into a project, dated from a start day, or saves a project's
  into it) has an offset and a length in days instead of dates. All of it is additive: a planner saved before
  has none, and loads with empty lists. Dates are local days.
- **Scrap** — `ScrapRegistry`: any `moment` node removed from the outline
  that had existing draft content becomes a `ScrapEntry` (captures its
  last-known chapter/book ancestry) instead of silently vanishing; it can
  be restored under a new parent or permanently deleted (which never
  touches that chapter's revision history — "like git history retaining a
  deleted file").
- **Maps** — the project's `maps` section (`MapDoc` in `schema.py`; additive, no version bump): a dict of map id to map. A map is a **square grid** (up to 512 by 512 cells) of terrain, with `cellSize` and a `unit` (miles, paces, feet ...), a palette `terrains` (id, name, `#rrggbb`, `builtIn`; each `kind` — world, town, interior — starts with its own set, copied into the map; at most 64), `layers` (id, name, kind terrain, shapes, symbols, labels or notes, `visible`, `locked`; at most 30; there is always a terrain layer), `parentId` (maps nest, unlimited depth; a cycle is refused, 422) and `order` among its siblings. The painted cells are `cells`, **run pairs** `[terrain index, how many, ...]` row by row that cover exactly width x height cells (`repair_map_runs`: a bad pair is dropped, an index past the palette becomes the first terrain, a surplus is cut, a shortfall is filled with the first terrain, neighbours are joined), so a 512 x 512 map of mostly one terrain is a few hundred numbers. Odd values are repaired, never refused; a map that cannot be read is quarantined (`maps.<id>`) and the others still load; deleting a map moves the maps inside it up. At most 500 maps a project. A map also holds `symbols` (stamps: `kind` is a symbol of the front end's library, `x`/`y` the centre in cells, `size` in cells wide, an optional own `color`; at most 5000) and `labels` (text, centre, `size` its height in cells; at most 1000), each on a layer of its kind (`symbols`, `labels`); an item on a layer that is gone, on a layer of another kind, or with a repeated id is dropped, positions are held to the map and sizes to 0.25-16, an unreadable item is dropped alone. And a `theme` (`parchment`, `modern`, `night`, `blueprint`; bad = modern) and three flags for what is drawn over the map: `scaleBar` and `compass` (on by default) and `legend` (off); all additive, so a map saved earlier loads with the defaults. And `shapes`: lines (rivers, roads, borders, walls, fences) and regions, each on a layer of the kind `shapes` — `type` (`line`, `region`), `points` (cells; each `smooth` or a corner, with an optional dragged handle `hx`/`hy` relative to the point, both or neither; at most 500), `style` (`solid`, `dashed`, `dotted`, `road`, `wall`, `fence`), `color` (none = the look's ink), `width` in cells (0.05-4), and for a region `fill` (none = the line colour), `opacity` (0-1) and `pattern` (`solid`, `hatch`, `cross`, `dots`); at most 2000. A shape with too few points (2 for a line, 3 for a region), on a layer that is gone or of another kind, or with a repeated id is dropped alone, points are held to the map, bad words and numbers are put right.
- **Training** — two global files (`training_schema.py`, `training_store.py`), a **curriculum being a collection of courses**. `training.json`
  (`TrainingContent`, schema v1) holds the authored courses and is seeded on the first load (the five curricula User, Reader, Translator, Writer and Admin, each with a
  placeholder course, with fixed ids): `curricula` (title, description, hue, an ordered `courseIds`; a course may be in several curricula or none) and `courses` (a course has
  `modules` > `lessons` > `exercises`, `projects` that name exercises of the course, and `exams`; a module has `tests` and a lesson `quizzes`; a lesson's `body` is Markdown). A quiz,
  test and exam are an `Assessment` with a pass mark (no question content yet). Ids are unique across the whole document and are checked on save (`curricula` name existing courses,
  a project names exercises of its own course, the caps and lengths); list order is display order. `training-progress.json` (`TrainingProgress`) is one learner's state and is
  separate, so saving the courses never wipes it (it only drops what names something now gone): `enrolled` (course id -> date), `completed` (a course, module, lesson,
  exercise or project id -> date) and `attempts` (an assessment id -> its latest 20 results, `passed` = the score reaches the pass mark; a pass marks the lesson, module or
  course it checks complete). A corrupt file is quarantined (409) and a file from a newer version is refused (409).
- **Presets** — `PresetCatalog` (`presets.json`, schema v2): a global,
  non-project-scoped catalog of ready-made plot categories. A preset is a
  category with its description, keywords, fields and fieldsets (`fieldsets`: a
  name and its fields each, at most 20 per card and 100 fields in all; a field is
  its name, or, for a multi-select, dropdown or short text, `{ name, kind, options }`
  with the labels of its options, which the new field gets ids for), its
  subcategories and their clusters (each with the same). Every `PresetEntry` has a **draft**
  (what Admin > Configuration > Plot edits; autosaved) and, once published, a
  numbered **published** copy plus up to 10 earlier versions (`history`).
  Only published copies are offered by the Plot sidebar's **+ Preset**, which
  adds one to a project as a plain copy (no link back; later edits on either
  side never cross). Publish is per preset, refused while the draft is
  invalid (blank or duplicate name, 422 with the reasons); unpublish keeps
  the versions; discard returns the draft to the published copy (a preset
  with no published copy is cleared to a blank one that keeps its name);
  restore brings a version into the draft. The 10 original built-ins
  (Characters, Settings, Themes, Conflicts, Subplots, World-building, Plot
  Structure, Relationships, Foreshadowing, Objects and Artifacts) are seeded
  on first load as ordinary **unpublished drafts** (ids `preset-<slug>`):
  nothing is offered by `+ Preset` until it is published, and they can be
  renamed or deleted. A v1 file is upgraded on first load (each preset
  becomes an unpublished draft; the old file is kept as `presets.v1.json`).

### API surface

All routes are under `/api`. Every router takes the storage root via a
FastAPI `Depends` (`get_storage_root`, or `get_app_data_storage_root` for
the one project-independent router).

| Router | Prefix | Endpoints |
|---|---|---|
| `projects` | `/api/projects` | `GET ""` list · `GET "/overview"` every project with its outline nodes and book progress, each read once (the shelves' one request) · `POST ""` create (seeds a root book node) · `GET "/{id}"` full summary (index+outline+plot+warnings; also triggers auto-compaction) · `PATCH "/{id}"` update title/settings (a title is trimmed and may not be blank or over 100 characters; a change of title, time systems or colour is logged with what it replaced, so Undo can restore it) · `DELETE "/{id}"` (204) |
| `outline` | `/api/projects/{id}/outline` | `GET`/`PUT ""` load/replace tree (PUT also detects scrap orphans, auto-snapshots, records activity) · `GET "/history"` · `GET "/history/diff"` (`from`,`to=current`) · `GET "/history/{snapshotId}"` · `POST "/history/{snapshotId}/revert"` |
| `plot` | `/api/projects/{id}/plot` | same shape as outline (`GET`/`PUT ""`, `/history`, `/history/diff`, `/history/{id}`, `/history/{id}/revert`) |
| `draft` | `/api/projects/{id}/draft/chapter/{chapterId}` | `GET ""` whole chapter · `GET "/moment/{momentId}"` · `PUT "/moment/{momentId}"` upsert (computes word count, records activity delta) · `DELETE "/moment/{momentId}"` (204) |
| `revisions` | `/api/projects/{id}/revisions/{chapterId}` | `GET ""` list (runs a one-time legacy migration first) · `GET "/diff"` (`momentId`,`from`,`to=current`) · `GET "/{snapshotId}"` · `POST ""` manual snapshot · `POST "/auto"` rolling auto-snapshot · `POST "/{snapshotId}/revert"` (safety-snapshots first) · `POST "/{snapshotId}/notes"` · `PATCH "/{snapshotId}/notes/{noteId}"` · `DELETE "/{snapshotId}/notes/{noteId}"` (204) |
| `activity` | `/api/projects/{id}/activity` | `GET ""` daily aggregate + unified log |
| `analytics` | `/api/projects/{id}/analytics` | `GET ""` totals/goals/rollups/flagged nodes |
| `schedule` | `/api/projects/{id}/schedule` | `GET "/{date}"` · `PUT "/{date}"` replace completed ids (a new tick is project activity) |
| `facets` | `/api/projects/{id}` · `/api/activity` | `GET "/activity/facets"` events, daily and monthly totals (compacts first) · `GET "/planner"` · `PUT "/planner"` (dates and shapes checked) · `GET /api/activity/ribbon` today's events per 10-minute slot across every project, and the 28-day average |
| `revision-flags` | `/api/projects/{id}/revision-flags` | `GET ""` (`includeResolved`) · `POST ""` · `PATCH "/{flagId}"` · `POST "/{flagId}/resolve"` · `DELETE "/{flagId}"` (204) (the Preview's Flag tool, `draft/FlagTool.tsx` and `useRevisionFlags.ts`, is their UI: flag a clicked sentence, `sentenceRanges`, or the project; edit, resolve with an outcome, delete) |
| `scrap` | `/api/projects/{id}/scrap` | `GET ""` registry · `POST "/{momentId}/restore"` · `DELETE "/{momentId}"` (204, permanent) |
| `export` | `/api/projects/{id}/export` | `GET "/book/{bookId}"` PDF · `GET "/chapter/{chapterId}"` PDF (set in a built-in font: typographic punctuation is made plain and anything outside Latin-1 becomes `?` until a Unicode font is bundled; the download name carries the real title in `filename*`) |
| `maps` | `/api/projects/{id}/maps` | `GET ""` summaries without cells (tree order) · `POST ""` `{title, kind, width, height, cellSize, unit, parentId, theme}` -> the new map (201; 422 for a side past 512 or a missing parent) · `GET "/{mapId}"` the whole map (409 if it was quarantined) · `PUT "/{mapId}"` replace it (the id must match, 422; a `parentId` that is itself or inside it is refused, 422; repaired, not refused) · `DELETE "/{mapId}"` (204; the maps inside move up). Unknown id 404 |
| `world publishing` | `/api/projects/{id}`, `/api/reader` | Maps and characters for readers. A map and a character carry a `reader` share (`published`, `revealAt` = a chapter number of the published edition or none, `reveals` per symbol/label/shape id or per character field key, and for a character the public `fields`); it is saved with the document. Publishing a book freezes the published maps and the public side of the published characters into the new `BookEdition` (`maps`, `characters`), as it freezes the chapters. `GET "/reader-extras"` for each book of the project: the chapters of the next edition (the numbers a reveal uses) and the spoiler warnings (a scene whose `location` is a place of a published map, or that a published character is tagged on, in a chapter before the reveal) · `GET "/books/{bookId}/extras-preview?chapter=n"` the saved maps and characters as a reader who has reached chapter n sees them · reader: `GET "/books/{bookId}/extras"` the same for the reader, up to the chapter they last stopped at (all once finished); what is still hidden is only counted (`lockedMaps`, `lockedCharacters`) |
| `map versions, journeys` | `/api/projects/{id}/maps` | A map can be a version of another (`versionOf` = the first map, never a version itself; `appliesFrom` = the outline chapter or scene from which it is the true one): `POST "/{mapId}/versions"` `{title, appliesFrom}` -> a copy of the map as it is (new id, not in the tree, `parentId` none, not published; 422 past 12 versions of a map; a version of a version is a version of the first map); a save cannot change `versionOf`; a version is not in the tree, its symbols are not in `GET "/places/all"` and cannot be linked, and deleting a map deletes its versions. A map holds `journeys` (one per character: `characterId`, `color`, `stops` of `{id, x, y, at, note}`, at most 40 journeys and 200 stops), repaired like the rest and never sent to readers. |
| `characters` | `/api/projects/{id}/characters` | The cast (`CharacterDoc`): a **profile** in words (role, age, appearance fields, personality, fields of your own, possessions), typed **relationships** with changes over the story, **states**, an arc, a life timeline, outline tags (`appearances`), a `reader` share, and a **`portrait`** (`CharacterPortrait` in `schema.py`: the choices a portrait card is drawn from, never an image). A portrait is flat: `age` (infant to elderly), `build`, `chest`, `headShape`, `ears`, `expression`, `eyes`, `brows`, `nose`, `mouth`, the hair as `hairLength` (bald to rapunzel), `hairTexture` (1A to 4C), `hairStyle`, `hairFront`, `hairline`, `hairlineHeight`, `hairEdges`, `greying`, `facialHair`, `top`, ids as text; colours as `#rrggbb` (`skin`, `eyeColor`, `hairColor`, `topColor`, `tileColor`; `browColor`, `lipColor`, `highlightColor`, `facialHairColor` may be none = follow the hair or the skin); and the sliders `headWidth`, `eyeSize`, `eyeSpacing`, `eyeTilt`, `noseSize`, `noseWidth`, `mouthSize` held to `PORTRAIT_RANGES`. It is lenient like every shard: a bad id or colour becomes the default, a slider is clamped, an unknown field is dropped, and nothing raises. A character made before portraits loads with the default portrait; its old `look` (the previous art engine's choices) stays in `project.json` and is passed back untouched, unused. A state may carry a `portrait` (captured at that point; the old `snapshot` stays too); a published edition freezes the portrait with the character. `GET ""` the list · `GET "/all"` every character · `POST ""` create (`name`, optional `portrait`, `look`) · `GET` / `PUT` / `DELETE "/{characterId}"` · errors as for maps (404 unknown, 409 corrupt) |
| `items` | `/api/projects/{id}/items` | The library of things that change hands (`ItemDoc`: name, kind, description, notes, tag colour, `holdings`: who has it from which outline point on, a character, a place or nobody known; the last in book order is the current holder): `GET ""` the list (id, name, kind, order) · `GET /all` every item whole · `POST ""` `{name, kind}` (422 past 400 items) · `GET/PUT/DELETE /{id}` (PUT repairs, never refuses; deleting a character blanks the holder of their holdings). Stored as `items` in `project.json`; an item that cannot be read is set aside (409 on its own read). |
| `world links` | `/api/projects/{id}/world-links` | Links between plot nodes (`plot:<id>`), characters (`char:<id>`), places (`place:<mapId>/<symbolId>`), items (`item:<id>`) and outline chapters or scenes (`scene:<id>`), one record for both ends, never between two of a kind: `GET ""` the links (one whose end is gone is left out) · `POST ""` `{a, b}` links two things that exist (422 for the same kind, a missing end, a bad ref or past 2000 links; the same link again is left as it is) · `DELETE "?a=&b="` takes it away from both ends. Stored as `worldLinks` in `project.json`. |
| `training` | `/api/training` | `GET ""` the courses and the progress · `PUT "/content"` replace the curricula and courses (progress kept, minus what is gone; 422 on a broken id/reference/limit) · `PUT` / `DELETE "/enrolments/{courseId}"` · `PUT` / `DELETE "/completions/{itemId}"` (a course, module, lesson, exercise or project; an assessment is refused, 422) · `POST "/attempts/{assessmentId}"` `{score}` (0-100). Every route returns the whole state; unknown id 404 |
| `presets` | `/api/presets` | `GET ""` whole catalog (drafts, published copies, history) · `PUT ""` replace the drafts, in order (published copies and history of the ids kept; an absent id is deleted) · `GET "/published"` what the Plot sidebar offers · `POST "/{id}/publish"` (422 with the reasons if the draft is invalid) · `POST "/{id}/unpublish"` · `POST "/{id}/discard"` (back to the published copy, or cleared when there is none) · `POST "/{id}/restore/{version}"` — global (`presets.json`, project-independent) |
| `feedback` | `/api/feedback` | Helper Inbox (app-level `feedback.json`, acts as the admin in the `X-Admin-Id` header; every call returns the whole anonymous inbox bundle): `GET ""`, `PUT /messages/{id}/validation`, `PUT /cases/{id}/vote` (yes, no, pass), `POST /cases/{id}/solutions`, `PUT /cases/{id}/solutions/{sid}/vote`, `POST /cases/{id}/close` (Planner), `POST /cases/{id}/reopen` (Configurer), `PUT /admins/{id}/roles`, `POST` / `PATCH` / `DELETE /verb-categories[/{id}]` |
| `user_settings` | `/api/user-settings` | `GET ""` whole doc · `PUT "/theme"` · `PUT "/ui"` · `PUT "/kv/{key}"` / `DELETE "/kv/{key}"` (keys must start `scriblr.`) · `POST "/kv-import"` (one-time localStorage migration; sets only absent keys) — global (`user-settings.json`) |

Plus `GET /api/health` (inline in `main.py`, not part of a router).

### Cross-cutting concerns

- **Exception → HTTP mapping** (`main.py`): `ProjectNotFoundError` /
  `MomentNotFoundError` / `SnapshotNotFoundError` /
  `TreeSnapshotNotFoundError` / `ScrapEntryNotFoundError` /
  `OutlineNodeNotFoundError` → 404; `InvalidRestoreParentError` → 400;
  `ShardCorruptError` → 409 with `"shard corrupt and quarantined: {reason}"`.
- **`SCRIBLR_DATA_DIR`** env var overrides the app-data root everywhere
  (`paths.py`) — used by the test suite and by dev tooling to redirect
  storage away from the real user data directory.
- **Tests** (`backend/tests/`, pytest + `httpx` TestClient, storage root
  overridden to a temp dir via `conftest.py` fixtures) — one module per
  feature area: health, projects, outline, plot, draft, revisions, activity,
  analytics, schedule, scrap, export, presets, plus `test_storage.py`
  (atomic writes, quarantine, compaction) and `test_hierarchy_migration.py`
  (legacy-layout migration).

## Frontend design

- **Shell** (`frontend/src/App.tsx`, React Router): `/` redirects to `/write`; `/write` is the Writer (`assets/Interfaces/writer/WUI.tsx`),
  `/read` the Reader (`RUI`), `/train` Training (`TUI`, below); the header and the sidebar (Admin `AUI`, Helper `HUI`, user `UUI`) are shared.
  The Writer is described in the section after next.
- **State and data**: there is no global query cache. The Writer's workspace hook (`writer/useWriterWorkspace.ts`) loads and saves the project's outline,
  plot and settings through `api/` and keeps them in React state with its own autosave and undo history; other interfaces use small stores
  (`settings/settingsStore.ts`, `reader/readerStore.ts`, `helper/inbox/feedbackStore`). `api/client.ts` is a thin JSON `get/post/put/patch/delete`
  wrapper (same-origin `/api`, throwing `ApiError`); `api/export.ts` is the one raw `fetch` + Blob download, since PDF isn't JSON.
- **Styles** — the Writer's stylesheet, `writer/writer.scss`, is an index of one partial per area in `writer/styles/` (shared, shelves, levels,
  plot, draft level, preview, level tabs, ...), loaded in the order the rules were written in (a later rule overrides an earlier one at equal
  specificity); tests that scan the stylesheet read the partials too (`src/test/readStyles.ts`). The space, radius and type-size scale is a set of CSS custom
  properties (`theme/_tokens.scss`), kept equal to the design system's `tokens.json` by a test, with 11px as the floor for text. The first load is split: the Reader, Training and
  the admin article builder are `React.lazy` chunks, and React and the router are a vendor chunk of their own.
- **Testing** — Vitest (config in `vite.config.ts`) + React Testing Library + `jest-dom`. Tests of plain functions (`*.test.ts`) run in Node, which
  starts much faster than a browser stand-in; the component and hook tests (`*.test.tsx`) run in jsdom, and a `.ts` test that needs a browser says so
  with `// @vitest-environment jsdom` on its first line. `src/test/setup.ts` resets stubbed globals, browser storage and the settings store after
  every test; `mockFetch` stands in for `fetch`; `workspaceBackend` answers the routes the Writer workspace uses (and records what was saved), so
  `useWriterWorkspace` is tested through `renderHook` in files by concern (`.test`: the project list, `.navigation`, `.outline`, `.plot`, `.undo`);
  `api/` has tests of the JSON client, every route's verb, path and body, and the PDF download; `makeWorkspace` builds a partial Writer workspace
  whose keys are checked against the real `WriterWorkspace` type. `npm run typecheck`, `npm run lint` (the hooks rules) and `npm test` run in CI
  (`.github/workflows/ci.yml`, with the backend's ruff and pytest); `npm run test:coverage` reports coverage.

## Tile grids (consoles as tiles)

Every console -- the Writer's levels, the Draft page, the Schedule console, the Reader's pages and the User, Admin and
Helper panels -- is **one global tile** on a grid that always **fills its own container exactly** (no gaps, no ragged
last row, like Claude Code's own resizable panes). The shared system is `frontend/src/components/tiles/`:

- **A binary split tree** (`splitTree.ts`), not a CSS grid: every branch divides its rect into two along one axis at a
  ratio, so dragging a divider resizes only its two neighbours. A leaf can be **fixed** (minimized): a fully-fixed
  subtree (`isAllFixed`) takes no room -- its sibling absorbs all of it -- but it **keeps its slot** in the tree, so
  restoring it puts it back where it was. `syncFixed` makes the tree's flags say which tiles are minimized (the grid, or
  the console, decides that; the saved flags are only what was last written). `reconcile` grafts new tiles onto an
  existing tree and prunes removed ones; `computeGeometry` turns a tree plus a pixel rect into every visible tile's and
  divider's rect in one pass.
- **`TileArea`** (`TileArea.tsx`; the Writer imports it as `writer/SplitArea.tsx`) draws the tiles, their dividers and,
  with `bar`, a tab bar. Every tile has the same **title bar**: a grip, the tile's icon, its name in capitals, the tile's
  own controls (`titleExtras`), then **Maximize** where a tile asks (`maximizable`). A tile has **no Minimize button**: its
  icon in the area's rail turns it off and on. The title bar is the drag handle (a tile's body holds fields and text). A tile's colours are the `--gt-*` variables a console sets
  (`--gt-fill`, `--gt-title-fill`, `--gt-ink`, `--gt-accent`); otherwise the theme's.
- **Dropping (`tileDrop.ts`)**: the tile under the pointer is cut into a 3x3 grid. The middle **swaps** the two tiles; the
  four edge cells put the tile **above, below, left or right** of it; a corner takes whichever of its two edges the
  pointer is nearer (the cell's own diagonal), and when the hovered tile touches that outer edge of the grid it is a **new
  row or column across the whole grid** (`insertAtGridEdge`, the new tile taking 30%), otherwise it is the edge cell
  beside it. A divider is a wedge (`insertAtDivider`). Where there is no room (`canInsertBeside`, `canInsertBelow`,
  `canInsertAt`, `canInsertAtGridEdge`) nothing is offered; in one-column mode nothing goes beside.
- **The preview**: the drag is pointer-driven (`useTileDrag` is inside `TileArea`): the dragged tile follows the pointer
  at full opacity, and the tree the drop would make (`applyDrop`, pure) is laid out *while dragging*, so the other tiles
  **slide** (0.16s) to open a **dashed, accent-tinted gap** where it will land. Hit-testing uses the layout as it was when
  the drag began, so the sliding never moves the target out from under the pointer. Escape cancels. There is no keyboard
  way to rearrange tiles; arrows move focus between title bars, and a divider is nudged with the arrow keys.
- **Two rails, console tabs and tile tabs** (`consoleTiles.tsx`): a panel or level has a rail of **console tabs** (one icon
  per console; **Settings and Help are always consoles, always last**, never tabs of a tile rail). A console that has tiles of
  its own has a rail of **tile tabs in its tile's title bar** (`TileArea`'s `barHost`, the slot `useRailSlots` hands out;
  `consoleTile()` builds such a console). A tile area always has a rail: inline above the tiles (`bar`), in a title bar
  (`barHost`), or in the level's header. A tile that its console turns on and off itself (the Draft level's Settings and Help)
  is `railless`.
- **Turning a tile off**: pressing its icon in the rail, dropping the tile on the **rail**, or (the Writer) pressing an open tab
  all minimize a tile into **an icon in the bar** (`TileTabBar`, `data-tile-bar=<gridId>`; the Writer draws its own bar in
  the level's header with the same attributes, `levels/LevelTabs.tsx`). Pressing the icon restores the tile to its old
  slot; **dragging the icon out** into the layout (`tileDragBus.ts` lets a bar anywhere start the drag in its area)
  restores it where it is dropped. For a grid that does not decide it itself, minimized tiles are remembered with the layout.
- **Container-based:** a grid measures its own width and height (`useContainerSize`) and reflows to one column below
  400px (`flattenOneColumn`) without touching the saved tree -- widening it returns to the saved split.
- **Remembered per user** (`useSplitLayout`, stored with `useStoredState` in the user-settings kv as
  `scriblr.tiles.<gridId>`): the tree, which tiles are minimized (`shapes`) and the maximized tile. A console can control
  minimizing (`minimized` / `onMinimizedChange`) and maximizing (`maximized` / `onMaximizedChange`) itself: the Writer's
  tabs do the first, the Reader the second. Pure logic in `tileLayout.ts` (`applyLayout`) and `tileNav.ts` (`nextFocus`).
- **Writer:** the level tabs (`useTabbedLevel`) are console tabs, a tile each; a closed tab is a minimized tile, and Settings and
  Help are last. The Schedule console's four tiles (Goals, Agenda, Backlog, Analytics; Analytics holds the activity chart with the review and the charts folded under it) have their rail in
  the console tile's title bar. Draft's three tiles have a rail above them; its Settings and Help are `railless` tiles that the
  two console buttons in the chapter tile turn on and off. The Shelves and Shelf screens, the
  Book screen (`writer/tiles/`) and the sidebar's Project, Book and Chapter panels are their own thing; the sidebar is
  **resizable from its right edge** (`scriblr.writer.sidebarWidth`).
- **Reader** (`reader/ReaderPanel.tsx`): a page's consoles are tiles; an icon in the header bar is a minimized console, an
  open one a tile, and Maximize makes it the full console (the others become icons; the URL names it).
- **Training** (`assets/Interfaces/TUI.tsx`, `training/`, `/train`; it replaced the Translator, and it was the User panel's Training console): five stacked levels like the Writer's (`TrainingLevels.tsx`, `trainingPath.ts`):
  the **Desk** (tabs Courses, the ones enrolled in, and Catalog, every course grouped by **curriculum**, a curriculum being a collection of courses; Settings, Help), the open **Course**
  (Modules, Exams, Projects), its **Module** (Lessons, Tests), the **Lesson** (Material, Quizzes, Exercises) and, deepest, the **Practice** (an exercise or a project; a project from the course skips the
  module and lesson levels). The deepest level on the path has the focus (Max), the one above it is Mid and the rest Min, in a side column; a level's title closes what is below it. Where you are, what you enrolled in and the
  Min/Mid toggles are kept (`scriblr.training.*`). The courses and the learner's progress come from the backend (`/api/training`, the Backend design's **Training**): `training/trainingStore.ts` is an external store like the Reader's (loaded when Training opens, each action answers with the new state), `trainingContent.ts` are the pure lookups (course, module, lesson, a course's colour, progress and results) and the levels are not drawn until they have loaded (a loading line, or the error with a retry button). The Desk shows how far through each enrolled course the learner is, a lesson, module, exercise, project or course has a button that marks it complete, the Exams, Tests and Quizzes tabs list the assessments with their pass mark and result, and a lesson's Material is its Markdown. The Catalog groups courses by curriculum, and the courses in none under **Other courses**. (The courses enrolled in before this was kept by the backend, `scriblr.training.enrolled`, are carried over once.)
- **User panel** (`assets/Interfaces/UUI.tsx`): the consoles are Dashboard and Account (each holds its pages as tiles,
  the rail in its title bar), then Settings and Help, one of each for the panel (every section's under its own name). Dashboard's settings are the theme tool on its own (`ThemeSettingsPanel`); Account's
  (`CustomizeControls`) are handedness and autosave plus that same theme tool embedded inline (`showHeader={false}`).
- **Maps console** (`writer/maps/`, the Project level's Maps tab; `MapsConsole.tsx`): a list of maps (nested ones under their map; the New map form takes a kind, a size up to 512 x 512 and a cell scale), the open map on a canvas (`MapCanvas.tsx`; `mapRender.ts` draws a one-pixel-per-cell bitmap scaled without smoothing, then the grid and the brush outline in the ink colour), and beside it the terrains, layers and the map's fields (`MapSide.tsx`). The pure parts are `mapModel.ts` (decoding and encoding the run pairs, the brush, a stroke, the flood fill, terrain and layer changes, the per-map undo log `MapHistory`, the tree of maps) and `mapView.ts` (fit, zoom at a point, pan, pointer to cell, distance), both with tests; `useMaps.ts` holds the list, the open draft and an undo log for each map opened, saves through `useAutosave` (a Save button, autosave off by default, the whole map in one `PUT`) and flushes before another map opens. A paint stroke changes the cells in place and is one undo step. **Symbols and labels** (`mapSymbols.ts`: four sets of one-path SVG silhouettes in a 24 box, so they are code and take any colour; `mapItems.ts`: place, move, edit, remove, the hit test, the legend and the scale bar, all pure; `mapThemes.ts`: the four looks, which re-colour the terrain and set the ink, halo, plate and typeface of everything drawn over it; `mapDrawItems.ts`: drawing them and the scale bar, compass and legend) are laid out in layer order by `mapRender.ts`. **Lines and regions** (`mapShapes.ts`: the geometry, pure: the curve of a shape as Bezier segments whose handles are dragged or made by the neighbouring points, nearest point and hit tests, snapping to grid corners and cell centres, putting in, moving and taking away points, the pens and presets; `mapDrawShapes.ts`: tracing, the six line styles, region fills and patterns, the points and handles of the chosen shape and the shape being drawn) are drawn in layer order too; `MapCanvas.tsx` draws them with clicks (double-click or Enter finishes) and edits the chosen one by dragging its points, handles or body, a double-click curving or straightening a point or putting one in. The Select tool picks and drags an item (a drag is shown by `useMaps.preview` and is one undo step through `commitMove`), arrow keys nudge it, Delete removes it; a new item goes on the top layer of its kind that is shown and not locked. The pretend API for tests and the design system is `designSystem/mockMaps.ts` (`test/mapsBackend.ts`). Painting is by pointer; the wheel zooms at the pointer.
- **Characters console** (`writer/characters/`, the Project level's Characters tab; `CharactersConsole.tsx`): the cast list beside seven sections (Appearance, Portrait, Profile, Relationships, Story, The cast, For readers). The **portrait** is drawn by `characters/portrait/` (`Portrait.tsx` over `scene.ts`: a list of filled `{d, fill, opacity}` paths, no strokes, in a 200 by 200 rounded tile; `rig.ts` holds the measurements of the head, `library.ts` every option list, `registry.ts` the labels, crops and swatches the controls use, `defaults.ts` the default portrait and `normalizePortrait`, which mirrors the server). `PortraitSection.tsx` has five tabs (Face, Features, Hair, Body, Card) of `PreviewSelect` dropdowns (an accessible listbox whose choices are small pictures of that choice drawn on this character, only while open), colour pickers and sliders; the hair styles and fronts offered are the ones the length allows (`stylesFor`, `frontsFor`, `fitHair`). The same `Portrait` draws the cast cards, Compare, Age, the small heads on scenes (Outline cards, Draft chips), the captured states and the reader's card. `describe.ts` turns a portrait into the Appearance words; the character sheet PNG is words only.
- **Admin panel** (`AUI.tsx`): its seven sections (pages as tiles, the rail in the title bar), Resources, an Instructor console (the Training builder: a tree of curricula, courses, modules, lessons and assessments beside the open item, saved whole with `PUT /api/training/content`; code in `admin/instructor/`) and a Help console
  (every section's help under its name); a Resources config page keeps its publish
  badge, Save draft / Publish and lock inside its tile and saves when it is left. AUI's own width is dragged from its outer
  edge (`Sidebar.tsx`'s `AuiResize`, next to the sidebar divider; the drag direction flips with handedness), snapping to
  400px columns and remembered as `scriblr.admin.width`; `min()` in the CSS (`--aui-w`, `App.tsx`) keeps it from exceeding
  the rest of the screen. Below 400px of its own width every tile is a row.
- **Helper panel** (`HUI.tsx`): Inbox, Queue and Settings consoles (plus the open chat's Conversation; Settings stays last) in the 400px panel.
  The sidebar divider's buttons choose the open tile (the grid's `minimized` list is controlled here); the tab bar opens
  the others until the buttons change the choice again.

### One pointer drag for lists (`frontend/src/lib/pointerDrag.ts`)

The option and preset chips, the field and option rows, the fieldsets, the outline cards and the Plot presets console's lists are reordered by the same
pointer drag as the tiles, not the browser's drag and drop (which draws the dragged thing see-through): `beginPointerDrag` (started from a grip by
`gripProps`) clones the thing as a `dragPicture` that follows the pointer at full opacity, and a list is a **zone** (`zoneRef`): of
the zones of the dragged kind under the pointer the innermost is told `over` (the pointer's place, from which it works out the slot), `leave` and `drop`.
The slot maths is unchanged and pure (`chipSlots.ts`, `fieldSlots.ts`, `outlineTree.moveNodeTo`); the hooks are `useChipDrop`, `useFieldGroupDrop`,
`useNodeDnd` and the preset lists' `useReorder`, and the gap they open is drawn by `components/DragGap.tsx`. A placement drag (a plotpoint onto a chapter, a
theme hue, a shift block) is a different thing and still uses its own drag. (`@dnd-kit` is now only used by the unmounted `AuiConfigEditor`.)

## Design system

The Writer's design system is in `docs/design-system/` and published as a Design System artifact: a brand book, tokens in all four zones, the readability audit, icons, and live previews of the real components (the app run against a pretend project). Most of it is generated from the code with `npm run design-system` (in `frontend/`); `docs/design-system/README.md` says how to regenerate and republish it. Read it before UI work.

## Theming (time-of-day palettes)

The shell (`frontend/src/App.tsx`) is themed by four optional time zones —
**Dawn, Day, Dusk, Night**. Any zone can be on or off but at least one is on;
with two or more on the app follows the clock, with one it is always that one.
Each zone has a start time (10-minute steps, set on the day bar; a zone runs until
the next one that is on starts, wrapping past midnight; the zones that are on always
begin in the order dawn, day, dusk, night, which `normalizeTheme`, `enableZone` and
`moveZoneStart` keep; a zone turned on begins at its default time, moved only as far as
that order needs) and four **hues** the user
chooses (from the account's list of up to ten hues, below): **theme** (inert/read-only),
**accent** (interactive/active), **alert** (needs attention), and an admin-only
**admin accent** (admin features). Everything else is the zone's fixed **look**
(`theme/zoneLooks.ts`), so text stays readable:

| Zone | Background | Theme S | Accent S | Alert S | Theme L | Accent L | Alert L |
|---|---|---|---|---|---|---|---|
| Night | dark, light text | 15 | 45 | 70 | 26 | 62 | 66 |
| Dusk | dark, light text | 30 | 80 | 100 | 34 | 62 | 66 |
| Day | light, dark text | 30 | 80 | 100 | 86 | 42 | 46 |
| Dawn | light, dark text | 15 | 45 | 70 | 80 | 42 | 46 |

Saturation always runs theme < accents < alert (the admin accent is the accent's
twin: same saturation, only the hue differs). **Text is always readable, whatever hues the user
picks**: WCAG contrast, 4.5:1 for text and 3:1 for icons and the edges of controls
(`theme/readable.ts`). Lightness is blind to hue (a yellow and a blue at the same lightness differ
several times over in brightness), so the look's lightnesses are only where each colour *starts*:
`resolvePalette` (`zoneLooks.ts`) moves a colour's lightness a half point at a time, only as far as
its hue needs, until text reads on it. The theme's lightness is fitted so the zone's ink (and its
muted and faint tiers) reads on every surface, recess overlays included; each accent, alert and
admin-accent fill is fitted for one of the two inks (the zone's preferred one -- white on a light
zone, dark on a dark one -- if that takes at most `MAX_FILL_SHIFT` points, else the other, which
may already read) and `fillInk` picks the ink that reads best; its hover/dim direction and wash
colour are `--accent-dir`/`--accent-away` (and `alert`/`accent2`), while `--fill-dir`/`--away` are
the zone's own for the theme surfaces. `theme/contrastAudit.ts` lists every documented text/ground
pair (surfaces, fills, the Writer's paper and its nested cards, the reaction hearts, edge tabs, level
panels), measures it over the whole hue range (a 30° grid of the palette hues, every 5° of a level
colour) and `contrastAudit.test.ts` fails if any pair drops under its threshold. The older
45-lightness-point gap (`MIN_TEXT_GAP`) survives only where the sky toggle and the plotpoint shades
size their bands. The Writer's page follows the zone too: a light sheet with dark text by day and
dawn, a dark sheet with light text at dusk and night, with the nested cards' steps (`--paper-pg`,
`--paper-f1..5`), the page's error text and the two reaction hearts (`--paper-error`,
`--paper-like`, `--paper-dislike`) fitted the same way. Hover and dim shades of a fill step *away*
from its text. Settings saved by older
versions (which also held a saturation per colour and a brightness) still load;
only the hues are kept.

- **Pure logic** lives in `frontend/src/theme/` with tests: `zones.ts` (which zone
  applies when, enabling/disabling zones), `zoneLooks.ts` (the look table and
  `resolvePalette`), `readable.ts` (contrast arithmetic and the lightness fitting),
  `contrastAudit.ts` (the readability audit), `paletteRules.ts` (hue clamping), `tokens.ts` (hues +
  look → CSS variables), `contrast.ts` (ink colours).
- **Applying it:** `useThemeEngine()` (mounted in `App.tsx`) writes the variables
  on `<html>`; `theme/theme.scss` registers them with `@property` so a palette
  change cross-fades (~1s), and defines the derived tokens (`--ink`,
  `--surface-*`, `--accent`, `--alert`, `--accent2`, `--ov-lift-*`, `--ov-sink-*`,
  `--paper-*`) that `App.scss` and the Writer's `writer.scss` are styled from —
  don't hard-code whites/black overlays/fixed lightness in new styles, use those.
- **UI:** the **sky toggle** (`theme/SkyToggle.tsx`) sits in the header, right of the
  Writer button: 120x30, a painted sky with two buttons. The left one (sun or moon)
  steps to the next zone that is on (dawn > day > dusk > night)
  and **locks** it; the right one (time and date, dimmed while locked) goes back to
  following the clock. The sky per zone is built
  from the zone's hues in `theme/skyLook.ts` (only the time text is adjusted to keep
  the 45-point gap); `theme/sky.ts` holds the pure parts: the moon's phase (accent-coloured
  and saturated at night; small and muted beside the always-white sun at dawn and dusk), today's zodiac constellation (real star-chart
  outlines, joined by faint lines at night, faint stars only at dawn and dusk), the
  random cloud strips (flat-based stacks of 4px-cornered rounded boxes, each
  shorter and narrower than the one below, with an occasional circle; gaps 0-100px,
  two layers drifting at 1.5 and 0.8 px/s from a random start; still under reduced motion, paused while the window
  is hidden) and the sun/moon heights; `theme/SkyScene.tsx` draws them. The
  customization tool is UUI Dashboard > Settings (`theme/ThemeSettingsPanel.tsx`), also
  embedded in Account > Settings: the account's **list of hues** (up to ten,
  `ThemeSettings.hues`, `theme/HueList.tsx`), the **day bar** (`ThemeTimeline.tsx`, the only
  place a start time is set) and a **card per zone** (`ZoneCard.tsx`) whose header is the
  same sky scaled up (`SkyZoneCard.tsx`; press it to turn the zone on or off, a zone that
  is off is only its header, painted subtly from the theme hue in use), and, while on, a
  slot per colour (`RoleSlot.tsx`: theme, accent, alert and, for admins, admin accent)
  showing ten shades of its hue. A hue is dragged (or clicked, then the colour clicked)
  onto a slot; each zone's `links` say which swatch each colour uses, and the palette's hue
  is always kept equal to its swatch's, so nothing that reads a palette knows about links
  (`theme/themeHues.ts` holds the pure operations: assign, swap within a zone, copy between
  zones, add, edit, move, remove a hue that is not in use). Turning a zone off clears its
  colours; turning one on copies the previous zone's. Edits are staged in a shared draft
  (`theme/themeDraft.ts`) the rest of the app does not see until Save (`SettingsSaveCluster`
  commits it; Undo steps through it; leaving drops it). "View as" is gone (a role
  previewed earlier is let go when the settings load; the role comes from `userSeed.ts`).
- **Persistence:** `user-settings.json` (backend, see the API table) is the source
  of truth; `settings/settingsStore.ts` keeps a synchronous localStorage cache
  (so the first paint is already themed) and writes through, debounced. The
  packaged app's backend port — and so its localStorage origin — changes every
  launch, which is why localStorage alone isn't enough. The Writer's saved UI state
  (`useStoredState`: chapter mode, scratchpad, checklists, reactions) uses the same
  store, and is migrated from localStorage once.

## The Writer and the other interfaces (`assets/Interfaces/`)

This is the live frontend (`main.tsx` renders `./App`, which mounts these). An earlier React Query / `modes/` frontend was removed once nothing
mounted it; it remains in git history.

- **`WUI.tsx`** (`writer/` subfolder) — the Writer: four stacked, tinted **levels**
  (`writer/levels/`) — Dash, Project, Outline (the open book) and Draft (the open
  chapter) — each Min, Mid or Max. One level has the focus (Max); the level above it
  is Mid and everything further up Min, the levels below it are not shown
  (`levelSizes.ts`). Opening a project, book or chapter moves the focus down a level;
  a level's title brings the focus back, its header strip opens a Min level to Mid and
  its chevron toggles Min/Mid (remembered). Beside the Dash the Project level is a
  tile for every project (its books on a shelf, `levelBodies.tsx` `ProjectTiles`), each in its own
  project's colour (`projectHueOf` in the workspace: its own hue, else the default).
  A level's header carries its **tabs** (`levels/LevelTabs.tsx`, `useTabbedLevel`): 30×30 icon
  buttons, ending with Settings and Help, then quick actions (Search, a context-aware New and
  Save). At Mid one tab shows at a time; at Max each tab is a tile that its button opens or
  closes (it is minimized, and keeps its slot), the tiles on a **split grid** (`SplitArea.tsx`, the global tile area on the `components/tiles`
  split-tree engine, see Tile grids): two alternating columns to begin
  with; drag a tile's title bar onto another tile (its 3x3 zones: the middle swaps, the edges put it beside, above or below, a corner a new row or column across
  the whole grid), onto a divider to wedge it in, or onto the tab bar to minimize it, with the others sliding aside to show the gap; drag a divider (or focus it and use the arrow keys) to resize the two tiles it separates. The tree always fills the area (a tile that opens is grafted on), stacks in one column under 400px, and is remembered per level with the open tiles and the
  current tab. A lone open tile has the whole area; every tile scrolls its own body. The Dash's tabs (`levels/dashTabs.tsx`) are Schedule (the console: goals, the agenda, the backlog, analytics (activity, review, charts); `writer/schedule/`; the **Backlog** tile, `Backlog.tsx`, lists Today (the tasks on today's shifts, the one running now first, and the routines due), Overdue, then the tasks by priority (High, Medium, Low, and None in a fold that opens by itself when nothing else waits) and the routines; its order, search, facet and project filters, sorts (priority, due date, newest, manual) and done choices are `lib/backlog.ts`, the quick-add line `Revise ch 3 !high ~2h fri @chapter 3` is `lib/quickAdd.ts`, a task's progress (its subtasks, or the words and nodes done on its node since it was added) is `lib/taskProgress.ts`, and a one-off shift that ends with tasks undone sends them back, marked carried, `lib/carryForward.ts`; how a routine or shift comes round is the shared `RepeatPicker.tsx`; the **Agenda** tile edits a shift in a side panel inside the tile (`ShiftPanel.tsx`: the days a change is for are asked first, every field is applied as it is set from the shift as it was opened, `diffPatch` and `editShift` in `lib/shiftEdit.ts`), a title on its block, with a hover bar of quick actions, lists its days as a checklist below 480px, and takes a task dropped on a shift, an empty slot (`shiftForTask`) or a day of the month or year (its due day); it opens with the next-up bar (`NextUpBar.tsx`, `lib/nextUp.ts`), keeps the now line in view, shows on a block its progress (`lib/shiftProgress.ts`), node and checklist count and marks what is due on the calendar (`dueDays` in `lib/backlog.ts`); at the Dash a project has its colour, one shared project choice and a choice of project for a new shift, and a shift that ends with tasks unticked sends a reminder (`useShiftEndReminders`)),
  Readers, Scratchpad, **Project** (`writer/plan/ProjectConsole.tsx`: where a project's plan is defined, see the design system's Dashboard page; the same console is the Project level's **Project** tab), Settings (the theme panel) and Help (the resource
  articles written for the level in the Resources builder, `levels/HelpArticles.tsx`). The
  Project's (`levels/projectTabs.tsx`): Plot and Outline (at Mid the Plot is its console in one column and the Outline a summary; the editors at Max; the Plot is a console of five tiles, `PlotView.tsx`: Contents, Editor,
  Chapters, Compare and Plotpoints, on a split grid with its rail of tile tabs in the tab's title bar, Compare and Plotpoints off until wanted, the layout
  and what is off kept per user as `scriblr.writer.plot.tiles` and `scriblr.writer.plot.minimized`; Compare turns itself on when a second plotline is ticked;
  in the Editor the parents above a title are chips by level with three states: minimized (title and keywords), expanded (title, keywords and the whole description) and, from expanded only, the editor (its own title, description, colour and keywords to change in place)),
  Schedule (the same console over the project), History, Settings (the project editor and its colour) and Help. The
  Outline's (`levels/outlineTabs.tsx`): Book outline (New chapter), Book details, Settings (the
  book's fields and colour) and Help. At Max the Outline is the book's **cover**, in one column: the book editor strip with the
  title and the tabs, then the sections the tabs open (settings, help, draft stats) and the contents
  (`outline/OutlineNav.tsx`: the arcs and chapters), narrowed by the edge tabs: an arc's tab shows only
  that arc and each of its chapters' outlines, a chapter's tab only that chapter's (choosing the focused tab again goes back to the whole book, every chapter open; adding an arc or chapter, by key or button, never focuses it, a narrowed view goes back to the whole book so the new card shows, and only the tabs focus an arc or chapter), each unfolding its
  title, colour and trash and under them its acts, scenes and moments (`OutlineCards.tsx`; the acts and scenes fold up, and so does the whole chapter section, from the chevron in its tile's top right corner: the chapter's
  title, colour and counts in the contents fold with the tile, down to its banner and counts, all remembered). The page edges and the arcs'
  and chapters' tabs (the book's own hue, the arc and chapter colours as accents) stand at its right,
  as on the Draft level's book, whose pages are the drafting pages. The plotpoints still to place are the Project level's
  **Plotpoints** tile of the Plot console (`levels/PlotpointsTab.tsx`): drag one onto a card in the Outline (the dragged id
  is shared through the workspace, `plotDragId`). Level text is white, and a level's fill is held to a lightness white text reads on, by its hue
  (`theme/bookColors.ts` `fillCap`, from `theme/levelContrast.ts`: yellows and greens come out darker than
  blues and reds); an editor tab (`surface`) sits on a light surface in the ink colour. Alert messages
  (`.wrError`) are the alert colour with an outline and text in `--on-alert`, the ink chosen for it in the zone. The Draft level's Settings (the
  chapter's colour) and Help are icons in the chapter tile that swap the right page.
  Plotpoints already placed in the outline are listed **By time** (the Time of their scene, in the book's
  time system) or **In story** (where they sit in the outline): one stored choice
  (`scriblr.writer.plotOrder`, `writer/plotOrder.tsx`) with a toggle on the Project Plot's plotline
  editor, the Outline Mid tab's placed list and the Draft footnotes (`orderAssignedPlotpoints`'s `mode`).
  A book's **preview formatting** (`OutlineNode.previewFormat`, backend `PreviewFormat`: font, size,
  bold/italic, alignment, line spacing, paragraph indent and spacing, all bounded) is edited in the book's
  Settings tab (the paragraph indent is a whole number of **spaces**, 0 to 16, drawn as that many times the width of a space in the book's font:
  `SPACE_EM`, the same table in `previewFormat.ts` and in the backend, which turns an older book's em indent into spaces on read) and applied to the Draft preview as CSS variables (`writer/previewFormat.ts`). The selected book's spine swivels into its cover
  (`Shelf.tsx`). Levels are tinted by hue (`levelHues.ts`): the project's own
  (`ProjectSettings.themeHue`, any hue unless it inherits the app theme's: `hueInherit`), books within 90° of it, arcs within 60° of
  their book and chapters within 30° of their arc (each node's `themeHue`; a series has no colour and shows the project's, and one
  saved by an older version is cleared when the outline is next saved). The plot's categories are within 90° of the project's hue,
  subcategories within 60° of their category and clusters within 30° of their subcategory (`plotHues.ts`). Those are the **defaults**
  (`HUE_RANGES` in `theme/bookColors.ts`): each node can choose its own range (`hueRange`: 30, 60, 90, 120, 180 or 360, held to its
  parent's range, and set on all its siblings at once, `hueSiblings` / `plotHueSiblings`; the project's is measured from the app theme's hue), and a node can **inherit** (no hue of its own: it shows, and
  follows, its parent's; not at 360). The slider (`writer/HueSlider.tsx`) is the Inherit toggle, a chip with the hue's degrees, the
  track and the range button; the workspace hands out each one's values (`hueSliderOf`, `plotHueSliderOf`, `projectHueSlider`) and the
  setters that keep the rest in line (`setNodeHueRange`, `setNodeInherit`, `setPlotHueRange`, `setPlotInherit`, `setProjectHueRange`,
  `setProjectInherit`). A new arc or chapter takes a hue spread away from its
  siblings' and a new book or category starts at the project's hue; changing a parent, or a node's own range, pulls what is under it
  back inside its range (a colour already outside its range stays until it, or its parent, is changed).
  A colour is one stored number, a hue in degrees, 0..360 (`theme/bookColors.ts`, mirrored in
  `backend/app/storage/schema.py`; 0 and 360 are both red). Every colour has the same saturation and lightness
  (the active time zone's own, kept readable for the hue). The hue slider (`HueSlider.tsx`,
  `components/ColorRange.tsx`) is one track in two forms: the project runs the whole 360° wheel from 0°; every
  other level runs its range either side of the parent's hue, with a square button to its left filled with the
  parent's hue that sets the colour to it. Projects saved with earlier schemes are converted once on load, before validation
  (`hueScheme` 4): plain hues and swatches (1), the desaturated and gray/white stops (2) and the
  darker / base / lighter brightnesses (3; a lighter `361..720` or darker `-720..-361` colour becomes its hue).
  A desaturated hue becomes the same hue, and gray, white and the "of the parent" stops go back to no colour
  of their own (the parent's, or the default).
  A book has just the one colour. The levels are flat, square panels filled with their colour at the accent's
  saturation (a little less loud) and lightness; what sits inside steps one shade deeper each time. At Outline focus the book
  panel bleeds to the top, bottom and right edges; at Draft focus the whole screen is the book's colour (very light by day,
  deeper at night) with the other levels' tiles on its left page. The **Outline level** (`writer/outline/`) at Max is the book: a
  collapsible book editor (title, summary, colour, time system, goals), a column of
  the **unassigned plotpoints** (drag one onto a chapter, act, scene or moment card to
  place it; drag it back, or click its x, to unassign), the draft stats, and the book's
  arcs, chapters, acts, scenes and moments as nested editable cards (drag the grip to
  reorder; Enter, Shift+Enter and Ctrl+Enter add siblings and children). Each card
  shows its draft word count (`ProjectAnalytics.nodeWordCounts`); chapters open and
  close. At Mid it lists the unassigned plotpoints, the book outline and the book
  details. The arcs' and chapters' **edge tabs** (`EdgeTabs.tsx`, tinted by their own
  hues) sit on the right edge of the Outline and Draft pages and jump to a chapter or an
  arc. The **Draft level** (`writer/draft/`) at Max is the chapter as an open book: the left page,
  a strip of paper that runs under the Dash, Project and Outline tiles, the crease right beside them, and the right
  page, three tiles on the same split grid (drag a title bar to move one, a divider to resize; remembered): the
  chapter tile (the series/book/arc above it, its title and synopsis edited in place, dates, draft stats, and the
  Save, Publish and Draft | Preview tools), the chapter's plotpoints (read-only footnote cards), and the draft:
  its acts, scenes and moments as read-only cards (fold up, remembered) each around an
  auto-growing draft input with a live word count, or, from the toggle, the preview with
  its Reaction / Flag / Export tools. A sentence's reaction bars show one heart per level, not a stack
  (`ReactionHeartIcon`): like is an outline, two concentric outlines, a filled heart; dislike is an outline with a
  line down its middle, two separate outlined halves, two separate filled halves. A chapter with no outline is one free draft.
- **`AUI.tsx`** (`feedback/` subfolder) — an admin "feedback pipeline"
  (channel/vote/tone/integrate/implement/sent/explicate tabs). This isn't a
  duplicate of anything above — it has no committed counterpart, is
  currently pure frontend mock state with no backend wiring, and reads
  closer to the archived legacy reader-roles concept
  (`docs/legacy-concept/`) than to anything currently backed by the API.
- **`HUI.tsx`** (`helper/` subfolder) — a helper side panel: chats (frontend-only
  mock state) and the **Inbox**, which is backed by the API. The Inbox validates
  feedback messages in two stages (tone, then the subjects and verbs that build the
  feedback statements; by stage or by case) and processes the statement cases they
  form (yes / no / pass votes with notes, solutions, closing). There is no quorum;
  tone is a six-category score over the validators; access is three roles per
  console (Processor, Configurer, Planner) assigned in Admin > Manager > Assignment;
  the Inbox names nobody. See `backend/app/storage/feedback.py` for the rules and
  `helper/inbox/` for the interface.
- **`RUI.tsx`** / **`UUI.tsx`** — Reader and Home/Dashboard-shaped views
  under the same new mode-switching `App.tsx` shell.

## Known stale docs

`docs/data-model.md` describes the **pre-consolidation** multi-file-per-
project storage layout (separate `index.json`, `outline/tree.json`,
`brainstorm/plot.json`, per-moment draft files, per-moment revision files)
and a 5-level outline / 3-level plot hierarchy. Both are superseded by the
single-`project.json` design and the 7-level outline / 4-level plot
hierarchy documented under [Backend design](#backend-design) above. It's
kept in place for its historical rationale (why shard granularity was
originally chosen per data type), not as a current reference.

## Development

Backend:

```bash
cd backend
python -m venv .venv
./.venv/Scripts/pip install -e ".[dev]"
./.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend tests:

```bash
cd backend
./.venv/Scripts/python -m pytest
```

Frontend tests:

```bash
cd frontend
npm test                    # one-shot run of everything (what CI runs)
npm run test:watch
npm run test:design-system   # just the design system's tests: tokens, contrast, the generated docs' freshness, the page
```

**Dependencies.** `backend/requirements.lock` pins the exact versions the backend is built and tested with (what CI installs:
`pip install -r requirements.lock`, then `pip install -e . --no-deps`); `pyproject.toml` keeps the ranges. To refresh it, make a new
virtual environment, run `pip install -e ".[dev]"`, test, and keep `pip freeze --exclude-editable`. The frontend and the shell pin
theirs in `package-lock.json`. CI runs `npm audit` and `pip-audit` on what ships, weekly and on every push, as an advisory job (it
reports and does not fail the build).

**Releasing.** `scripts/release.ps1` runs the whole chain from a checkout: the three versions must agree (`-Version 0.2.0` sets
them), then ruff, pytest, `tsc`, eslint and vitest, the frontend build, PyInstaller, electron-builder, and a smoke check of the
packaged backend (started on a free port against a scratch data folder: health, the shelves' overview, a deep route, a refused bad
id, and no process left behind), then an end-to-end check of the packaged app itself (`electron/e2e/smoke.mjs`, `npm run e2e` in `electron/`:
Playwright launches `Scriblr.exe` against a scratch folder and checks its window, a project on the shelves after a reload, the
single-instance lock, and that quitting leaves no backend process). `-SkipTests`, `-SkipBuild`, `-SkipSmoke` and `-SkipE2E` leave a step out.

## Running the desktop app

`electron/main.js` opens Scriblr in a native window via
[Electron](https://www.electronjs.org/), spawning the FastAPI backend as a
subprocess (`backend/server_main.py` in dev, or its PyInstaller-built
executable once packaged) and pointing the window at it, the same way a
browser tab would.

**Dev mode** — live-reloading frontend, run from source:

```bash
# terminal 1
cd frontend && npm run dev

# terminal 2
cd electron
npm install
npm start
```

Electron itself starts the backend (using `backend/.venv`, so
`./.venv/Scripts/pip install -e ".[dev]"` must already have been run once)
and points its window at the Vite dev server.

**Prod mode, run from source** — same window, but the backend serves the
built frontend itself (no Node/Vite needed at runtime once built):

```bash
cd frontend && npm run build
cd ../electron
npm run start:prod
```

**Packaged build** — a single distributable installer with no Python or
Node install required on the target machine:

```bash
cd frontend && npm run build

cd ../backend
./.venv/Scripts/pip install -e ".[dev]"
./.venv/Scripts/python -m PyInstaller scriblr.spec --noconfirm

cd ../electron
npm install
npm run dist
```

The PyInstaller step produces the headless backend helper as a **one-dir** build
(`backend/dist/scriblr-backend/`: the exe and an `_internal/` folder, started in under a
second; a one-file exe re-extracted itself to `%TEMP%` on every launch); `electron-builder`
(the last step) copies that folder whole to `resources/backend/` (`extraResources`), keeps
only the `en-US` Chromium locale, and bundles it alongside Electron itself into `electron/dist/`, producing an
NSIS installer (icon included, from `backend/icon.ico` — regenerate with
`./.venv/Scripts/python scripts/generate_icon.py` if the design ever
changes, a build-time-only tool needing Pillow). Closing the window shuts
the backend down cleanly (`taskkill /T`); no process is left running. Only one Scriblr runs at a time
(`requestSingleInstanceLock`); a second launch brings the first window forward. The backend's output goes to `<userData>/logs/backend.log`; if it does not answer within 60 s the app shows an
error with that path instead of a blank window, and a small "Starting…" window covers a slow start. Project data is
stored per-OS under the standard app-data directory (`%APPDATA%\Scriblr`
on Windows), independent of wherever the app is installed, so
rebuilding/reinstalling never touches existing projects.

> **Note:** `electron-builder` fetches a small Windows/macOS/Linux signing
> toolchain (`winCodeSign`) that contains symlinked files, and unpacking it
> requires the ability to create symlinks. On a stock Windows account
> without [Developer Mode](https://learn.microsoft.com/windows/apps/get-started/enable-your-device-for-development)
> enabled, `npm run dist` will fail with `Cannot create symbolic link: A
> required privilege is not held by the client`. Either enable Developer
> Mode once (Settings → Privacy & Security → For developers) or run the
> command from an elevated (Administrator) terminal. With Developer Mode on,
> `npm run dist` produces `electron/dist/Scriblr Setup <version>.exe`, a
> per-user NSIS installer (no admin rights needed to run it) — verified by a
> real silent install/launch/uninstall (`Scriblr Setup 0.1.0.exe /S`, then
> `"Uninstall Scriblr.exe" /S`), which spawns the bundled
> `scriblr-backend.exe` on a fresh dynamic port exactly like the dev-mode
> and shortcut launches do.
>
> The installer is built with electron-builder 26 (its NSIS tools are newer than 24's). Under 24.13 the installer crashed at start (an access
> violation in NSIS's `System.dll`) on Windows 11 build 26200 (25H2), with or without `/S`; the 26.x one installs and runs natively there. If an
> installer ever crashes like that again, `$env:__COMPAT_LAYER = 'WIN7RTM'` for that one process gets it through while the tools are updated.

**Desktop shortcut** — works today even without a full `electron-builder`
package, by launching Electron directly against `electron/` in prod mode
(`--prod`). Create or refresh it with:

```powershell
# Run from the repository root (the folder holding backend, electron and frontend).
$desktop = [Environment]::GetFolderPath('Desktop')
$appDir = (Resolve-Path .\electron).Path
$electronExe = Join-Path $appDir 'node_modules\electron\dist\electron.exe'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop 'Scriblr.lnk'))
$shortcut.TargetPath = $electronExe
$shortcut.Arguments = "`"$appDir`" --prod"
$shortcut.WorkingDirectory = $appDir
$shortcut.IconLocation = (Resolve-Path .\backend\icon.ico).Path
$shortcut.Description = 'Scriblr - offline writing app'
$shortcut.Save()
```

Requires `frontend/dist` to already be built (`cd frontend && npm run
build`) and `electron/node_modules` installed (`cd electron && npm
install`) at least once; rebuild the frontend after future changes for the
shortcut to pick them up.

Every launch that isn't dev mode (this shortcut, `npm run start:prod`, and
the eventual packaged app) gives its backend a **fresh, dynamically-picked
free port** each time, instead of a fixed one — Electron finds a free port
before spawning the backend and only that instance uses it. This is what
eliminates the "port already in use" / stale-process class of error this
project ran into repeatedly during development: the shortcut's server can
never collide with a dev server (or a leftover process) someone left bound
to the fixed dev port 8000, because it never tries to use that port.
