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
- [Frontend design (canonical — git HEAD)](#frontend-design-canonical--git-head)
- [In-progress / not yet integrated](#in-progress--not-yet-integrated)
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
│       └── pdf_export.py               # fpdf2 book/chapter PDF export
├── tests/                    # 16 pytest modules, one per feature area (+ conftest.py fixtures)
├── server_main.py            # entrypoint used by Electron / PyInstaller
└── scriblr.spec               # PyInstaller build spec

frontend/
├── src/
│   ├── main.tsx                # entrypoint (imports App from ./app/App at HEAD)
│   ├── app/                     # App.tsx (QueryClient + BrowserRouter) + routes.tsx (route tree)
│   ├── components/shared/        # Bookshelf, ProjectPicker, ProjectShell, NodeFlagControl, icon set
│   ├── modes/                     # one folder per feature area — outline, plan, workspace, draft, revise, dashboard, admin, shelf
│   ├── lib/                        # nodeTree, paragraphs, sanitizeFilename, textAnalytics (all unit-tested)
│   ├── api/                         # React Query hooks + fetch client, one module per backend router
│   └── hooks/                        # small shared hooks (useWindowDimensions)
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
`outlineHistory`, `plotHistory`, `activity`, `schedule`, `scrap`. This
replaced an older layout of ~10 separate shard files/dirs per project (still
described, now stale, in `docs/data-model.md`).

- **Atomic writes** (`project_store._atomic_write_json`): serialize to a temp
  file in `<project>/.tmp/`, `fsync`, then `os.replace()` onto the
  destination — atomic on both POSIX and Windows.
- **Locking**: a per-project-id `threading.RLock` registry
  (`_project_locks`, guarded by a module-level `threading.Lock`). `_mutate()`
  acquires the project's lock, loads the whole file, lets a callback mutate
  it in memory, writes it back. Reentrant (`RLock`, not `Lock`) because
  `_mutate` internally triggers a migration check that itself needs the
  lock. Deliberately single-process/single-user — no cross-process lock,
  since this is a local single-user desktop app.
- **Corruption isolation** is section-level, not whole-file:
  - Unparseable whole-file JSON, or a corrupt `index` section, is **fatal**
    — the file (or just that raw value) is renamed aside into
    `quarantine/<label>.corrupt-<timestamp>.json`, and `ShardCorruptError`
    is raised (→ HTTP 409, see below).
  - A corrupt `outline` or `plot` section is quarantined and defaulted to an
    empty tree; the specific loader (`load_outline`/`load_plot`) still
    raises `ShardCorruptError` so its caller (`GET /api/projects/{id}`) can
    surface it as a warning without failing the rest of the request.
  - A corrupt entry within `drafts` (one chapter), `revisions`, or
    `outlineHistory`/`plotHistory` is dropped individually — siblings
    survive untouched.
  - Corrupt `activity`/`schedule`/`scrap` sections default silently.
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
  Manual chapter `revisions` are **never** pruned. Returns human-readable
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
  shape, four kinds: `category < subcategory < plotline < plotpoint`
  (`PlotNodeKind`/`PLOT_KIND_ORDER`). **Fields and values:** any category,
  subcategory or plotline defines fields (`customFieldDefs`); each field
  holds many **values**, and every value is a plotpoint (`fieldId`; title 1-50
  characters, description up to 255). A value defined on a category or
  subcategory is shown on every plotline under it as a **reference** (a
  plotpoint with `refId`, whose text is the original's), which that plotline
  assigns to its own chapters; deleting a category/subcategory value or field
  turns its assigned references into the plotline's own values in a plotline
  field of the same name, and deleting a plotline field sends its assigned values to
  the plotline's `Scrap` field. `assignedMomentId` (on `plotpoint` nodes) is a
  chapter (from the plot editor) or an act/scene/moment of it (from the chapter
  outline); placed on a moment a plotpoint has an `awareness` (`front` =
  audience and characters know, `back` = audience only, `mid` = characters only,
  `off` = neither), changed by clicking its eye. `keywords` (on `plotline`
  nodes) are free-text tags used to detect keyword mentions in prose. The pure
  rules (references, deletion, migration of older plots, assignment) live in
  `frontend/src/assets/Interfaces/writer/plotFields.ts`, and run on load.
  Book outline nodes always have both hues: `accentHue` defaults to `themeHue`.
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
  and every flagged outline/plot node.
- **Schedule** — `ScheduleCompletionLog`: per-date list of completed
  checklist-item ids (derived client-side from routines/priorities/goals/
  flags; the backend just persists which ids were checked off).
- **Scrap** — `ScrapRegistry`: any `moment` node removed from the outline
  that had existing draft content becomes a `ScrapEntry` (captures its
  last-known chapter/book ancestry) instead of silently vanishing; it can
  be restored under a new parent or permanently deleted (which never
  touches that chapter's revision history — "like git history retaining a
  deleted file").
- **Presets** — `PresetCatalog`: a global, non-project-scoped catalog of
  preset plot categories (10 built-ins seeded on first load — Characters,
  Settings, Themes, Conflicts, Subplots, World-building, Plot Structure,
  Relationships, Foreshadowing, Objects and Artifacts), offered when adding
  a new plot category in any project; editing/deleting a preset only
  affects future categories, never ones already instantiated from it.

### API surface

All routes are under `/api`. Every router takes the storage root via a
FastAPI `Depends` (`get_storage_root`, or `get_app_data_storage_root` for
the one project-independent router).

| Router | Prefix | Endpoints |
|---|---|---|
| `projects` | `/api/projects` | `GET ""` list · `POST ""` create (seeds a root book node) · `GET "/{id}"` full summary (index+outline+plot+warnings; also triggers auto-compaction) · `PATCH "/{id}"` update title/settings · `DELETE "/{id}"` (204) |
| `outline` | `/api/projects/{id}/outline` | `GET`/`PUT ""` load/replace tree (PUT also detects scrap orphans, auto-snapshots, records activity) · `GET "/history"` · `GET "/history/diff"` (`from`,`to=current`) · `GET "/history/{snapshotId}"` · `POST "/history/{snapshotId}/revert"` |
| `plot` | `/api/projects/{id}/plot` | same shape as outline (`GET`/`PUT ""`, `/history`, `/history/diff`, `/history/{id}`, `/history/{id}/revert`) |
| `draft` | `/api/projects/{id}/draft/chapter/{chapterId}` | `GET ""` whole chapter · `GET "/moment/{momentId}"` · `PUT "/moment/{momentId}"` upsert (computes word count, records activity delta) · `DELETE "/moment/{momentId}"` (204) |
| `revisions` | `/api/projects/{id}/revisions/{chapterId}` | `GET ""` list (runs a one-time legacy migration first) · `GET "/diff"` (`momentId`,`from`,`to=current`) · `GET "/{snapshotId}"` · `POST ""` manual snapshot · `POST "/auto"` rolling auto-snapshot · `POST "/{snapshotId}/revert"` (safety-snapshots first) · `POST "/{snapshotId}/notes"` · `PATCH "/{snapshotId}/notes/{noteId}"` · `DELETE "/{snapshotId}/notes/{noteId}"` (204) |
| `activity` | `/api/projects/{id}/activity` | `GET ""` daily aggregate + unified log |
| `analytics` | `/api/projects/{id}/analytics` | `GET ""` totals/goals/rollups/flagged nodes |
| `schedule` | `/api/projects/{id}/schedule` | `GET "/{date}"` · `PUT "/{date}"` replace completed ids |
| `scrap` | `/api/projects/{id}/scrap` | `GET ""` registry · `POST "/{momentId}/restore"` · `DELETE "/{momentId}"` (204, permanent) |
| `export` | `/api/projects/{id}/export` | `GET "/book/{bookId}"` PDF · `GET "/chapter/{chapterId}"` PDF |
| `presets` | `/api/presets` | `GET ""` / `PUT ""` — global catalog (project-independent) |
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

## Frontend design (canonical — git HEAD)

The description below is of the app as currently committed at `HEAD` — see
[In-progress / not yet integrated](#in-progress--not-yet-integrated) for how
the working tree currently differs.

- **Routing** (`frontend/src/app/routes.tsx`, React Router):
  - `/` → `ProjectPicker` — list/create/delete projects, plus an Admin
    toggle exposing `AdminPresetsPanel`.
  - `/project/:projectId` → `ProjectShell` — the persistent per-project
    layout (collapsible `Bookshelf` sidebar, persisted to `localStorage`),
    hosting nested routes via `<Outlet/>`, plus global overlays for the
    Plot drawer, Dashboard, Settings, and Scrap bin regardless of which
    nested route is active.
    - `book/:bookId` → `BookFaceWorkspace` — the open-book "face": title,
      word-count/chapter-count goals, a 20-color swatch picker,
      relevant-plotlines checkboxes, a chapter tab strip, "Manage
      chapters" (`ScopedOutlineEditor`), Export PDF, delete book.
    - `book/:bookId/chapter/:chapterId` → `ChapterPageWorkspace` — one
      continuous scrollable "page" combining every act/scene heading and
      moment (replacing an earlier tabbed Draft/Read/History editor), with
      per-project "read levels" config, a Preview toggle (clean markdown,
      read-only), a Manage-structure toggle, and a `ChapterPlotpoints`
      side panel.
  - `App.tsx` wraps all of this in a React Query `QueryClient` (retries
    disabled) + `BrowserRouter`.
- **Feature areas** (`frontend/src/modes/`):
  - **`outline/`** — the structural tree: `outlineTree.ts` (books/chapters/
    moments operations, escalate-to-child on double-Enter) atop the generic
    `lib/nodeTree.ts`; `OutlineTreeView`/`OutlineNodeRow` (dnd-kit sortable,
    keyboard nav, native drag-and-drop for both reparenting and
    plotpoint→moment assignment).
  - **`plan/`** — the Plot sidebar (parallel structure to outline):
    `plotTree.ts` (category→subcategory→plotline→plotpoint operations,
    custom fields, keywords, moment/paragraph assignment);
    `PlotSidebar`/`PlotTreeView`/`PlotNodeRow`.
  - **`plot/`** — `PlotDrawer`: a partial-width slide-over wrapping
    `PlotSidebar`, so the plot tree can sit alongside a book/chapter view
    (enabling plotpoint drag-out onto a paragraph).
  - **`workspace/`** — `BookFaceWorkspace`, `ChapterPageWorkspace`,
    `ChapterPageParagraph` (click-to-edit paragraphs with separate
    preview/editing states), `ConfigurationPanel` (goals, outline/plot
    levels, priorities, routines), `ProjectStatsPanel`, `SchedulePanel`
    (today's checklist derived from routines/priorities/goals/flags),
    `ScopedOutlineEditor` (the reusable Tab/Enter/drag/flag editing state
    machine, parameterized by root + levels, used for both book-scoped and
    chapter-scoped structure editing), `TreeDiffView`.
  - **`draft/`** — `ChapterPlotpoints` (read-only reference tree scoped to
    the current chapter's assigned plotpoints), `DraftAnalyticsPanel`
    (word/sentence/readability stats, sentence-structure breakdown,
    plotline-keyword mention counts), `ScrapBinPanel` (orphaned moments:
    view/restore/permanently-delete), `useAutosaveDraft` (debounced 1.5s
    autosave, flush-on-unmount).
  - **`revise/`** — `MomentRevisions` (chapter snapshot list, manual save,
    diff, revert), `DiffView` (colored equal/insert/delete spans),
    `CommentsPanel` (select text in a snapshot, attach/list/delete flagged
    comments).
  - **`dashboard/`** — `BulletinBoardOverlay` + `BulletinNote`: one screen
    consolidating goals/activity (`ProjectStatsPanel`), draft analytics,
    and revision history into pinned cards.
  - **`admin/`** — `AdminPresetsPanel`: global CRUD editor for the preset
    plot-category catalog.
  - **`shelf/`** — `BookSpine` (+ test): one book rendered as a shelf
    "spine" whose width scales with its word-count goal and whose fill
    height shows progress toward it.
- **Shared components** (`components/shared/`) — `Bookshelf` (the sidebar
  shelf of `BookSpine`s), `ProjectPicker`, `ProjectShell`,
  `NodeFlagControl` (review/edit/add/delete flag popover), and a small icon
  set (`DashboardIcon`, `ExportIcon`, `EyeIcon`, `OutlineIcon`, `PlotIcon`,
  `SaveIcon`, `SettingsIcon`, `TrashIcon`).
- **Shared libs** (`lib/`, all with matching `.test.ts` files) —
  `nodeTree.ts` (generic flat-list-with-`parentId` tree ops shared by
  outline and plot), `paragraphs.ts` (`splitParagraphs`/
  `clampParagraphIndex`), `sanitizeFilename.ts`, `textAnalytics.ts`
  (dependency-free readability/sentence-structure heuristics + keyword
  occurrence counting).
- **API client layer** (`api/`) — `client.ts` exports a small `api`
  object (`get/post/put/patch/delete`, JSON-only, `/api`-relative,
  throwing `ApiError` on non-OK responses) with no hooks of its own; every
  other module (`projects.ts`, `outline.ts`, `plot.ts`, `draft.ts`,
  `revisions.ts`, `activity.ts`, `analytics.ts`, `schedule.ts`, `scrap.ts`,
  `presets.ts`) wraps it in React Query hooks (`useX`/`useSaveX`/etc.),
  invalidating the relevant query keys on mutation. `export.ts` is the one
  exception — a raw `fetch` + Blob download, since PDF isn't JSON.
- **Testing** — Vitest (jsdom environment, config lives directly in
  `vite.config.ts`) + React Testing Library + `@testing-library/user-event`
  + `jest-dom` matchers (`src/test/setup.ts`). Covers all four `lib/`
  modules plus `BookSpine`.

## Theming (time-of-day palettes)

The shell (`frontend/src/App.tsx`) is themed by four optional time zones —
**Dawn, Day, Dusk, Night**. Day is always on (and is the palette used when
time-based theming is off); the others are opt-in. Each zone has a start time
(10-minute steps; a zone runs until the next configured zone starts, wrapping
past midnight) and four **hues** the user chooses: **theme** (inert/read-only),
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
twin: same saturation and lightness, only the hue differs), and **text is at
least 30 HSL lightness points from what it sits on** (`MIN_TEXT_GAP`; enforced
for the theme surfaces, the accent/alert fills and their hover/dim shades, the
muted and faint ink, and the Writer page by `theme/zoneLooks.test.ts`). The
Writer's page follows the zone too: a light sheet with dark text by day and dawn,
a dark sheet with light text at dusk and night. Hover and dim shades of a fill
step *away* from its text. The text on each accent, alert and admin-accent fill is picked per fill (`fillInk` in `zoneLooks.ts`): the light or dark ink, whichever reads better, always 30+ points away (at least 4.2:1 for any hue, tested); its hover/dim direction and wash colour are `--accent-dir`/`--accent-away` (and `alert`/`accent2`), while `--fill-dir`/`--away` are the zone's own for the theme surfaces. Settings saved by older
versions (which also held a saturation per colour and a brightness) still load;
only the hues are kept.

- **Pure logic** lives in `frontend/src/theme/` with tests: `zones.ts` (which zone
  applies when, enabling/disabling zones), `zoneLooks.ts` (the look table and
  `resolvePalette`), `paletteRules.ts` (hue clamping), `tokens.ts` (hues + look →
  CSS variables), `contrast.ts` (ink colours).
- **Applying it:** `useThemeEngine()` (mounted in `App.tsx`) writes the variables
  on `<html>`; `theme/theme.scss` registers them with `@property` so a palette
  change cross-fades (~1s), and defines the derived tokens (`--ink`,
  `--surface-*`, `--accent`, `--alert`, `--accent2`, `--ov-lift-*`, `--ov-sink-*`,
  `--paper-*`) that `App.scss` and the Writer's `writer.scss` are styled from —
  don't hard-code whites/black overlays/fixed lightness in new styles, use those.
- **UI:** the override icons (one per configured zone; click to force, click again
  to release) are on the UUI Dashboard; the customization tool is UUI
  Dashboard > Settings (`theme/ThemeSettingsPanel.tsx`). "View as: User/Admin"
  there previews the other role (there are no real accounts yet: the role comes
  from `userSeed.ts`).
- **Persistence:** `user-settings.json` (backend, see the API table) is the source
  of truth; `settings/settingsStore.ts` keeps a synchronous localStorage cache
  (so the first paint is already themed) and writes through, debounced. The
  packaged app's backend port — and so its localStorage origin — changes every
  launch, which is why localStorage alone isn't enough. The Writer's saved UI state
  (`useStoredState`: chapter mode, scratchpad, checklists, reactions) uses the same
  store, and is migrated from localStorage once.

## In-progress / not yet integrated

This section is a description of current state, not a decision about what
to keep, merge, or discard.

The working tree right now has `frontend/src/main.tsx` pointing at
`./App` instead of the real `./app/App` above, and `git status` shows the
entire committed frontend described in the previous section — `app/`,
`components/shared/`, every `modes/*` folder, `lib/`, `api/*.ts`,
`hooks/useWindowDimensions.ts` — as **deleted**. In its place is a smaller,
untracked stack under `frontend/src/assets/Interfaces/`, built without
awareness that the app above already existed:

- **`WUI.tsx`** (`writer/` subfolder) — a "bookshelf" drill-down editor for
  projects/outline: one focused node at a time, a read-only ancestry
  breadcrumb, book-spine/page-thumb visuals. It duplicates a smaller subset
  of what `outline/` + `workspace/` already do above — no plot tree, no
  chapter drafting/moments, no revisions, no analytics/schedule/scrap/
  export.
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
npm test          # one-shot run
npm run test:watch
```

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

The PyInstaller step produces the headless backend helper
(`backend/dist/scriblr-backend.exe`); `electron-builder` (the last step)
bundles it alongside Electron itself into `electron/dist/`, producing an
NSIS installer (icon included, from `backend/icon.ico` — regenerate with
`./.venv/Scripts/python scripts/generate_icon.py` if the design ever
changes, a build-time-only tool needing Pillow). Closing the window shuts
the backend down cleanly; no process is left running. Project data is
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

**Desktop shortcut** — works today even without a full `electron-builder`
package, by launching Electron directly against `electron/` in prod mode
(`--prod`). Create or refresh it with:

```powershell
$desktop = [Environment]::GetFolderPath('Desktop')
$electronExe = 'C:\Users\rella\scriblr\scriblr\electron\node_modules\electron\dist\electron.exe'
$appDir = 'C:\Users\rella\scriblr\scriblr\electron'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop 'Scriblr.lnk'))
$shortcut.TargetPath = $electronExe
$shortcut.Arguments = "`"$appDir`" --prod"
$shortcut.WorkingDirectory = $appDir
$shortcut.IconLocation = 'C:\Users\rella\scriblr\scriblr\backend\icon.ico'
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
