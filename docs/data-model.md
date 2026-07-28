# Data model — sharded per-project JSON storage

Each project is a folder under an OS app-data directory (resolved by `backend/app/storage/paths.py`;
on Windows: `%APPDATA%\Scriblr\projects\<project-id>\`).

```
<project-id>/
├── index.json                 # metadata + manifest listing which shards exist
├── outline/tree.json          # whole outline tree, one shard (small, rewritten as a unit)
├── brainstorm/plot.json       # whole plot tree, one shard (small)
├── draft/<moment-id>.json     # one shard PER MOMENT — the large content, sharded fine-grained
├── revisions/<moment-id>/<snapshot-id>.json   # one shard per snapshot, append-only
└── .tmp/                      # scratch dir for atomic-write staging
```

The sharding is deliberately asymmetric: outline and plot data are small and change as a
structural unit (reorder, rename), so one shard each is simplest. Moment drafts are the actual large
prose content and are edited independently, so each moment gets its own shard — editing one moment
never touches another moment's file or rewrites the whole book. Revision snapshots are immutable once
written, so one file per snapshot gives cheap listing/deletion without touching siblings.

## `index.json`

```json
{
  "schemaVersion": 2,
  "projectId": "prj_9f2a3b7c",
  "title": "Working Title",
  "createdAt": "2026-07-27T10:00:00Z",
  "updatedAt": "2026-07-27T14:32:11Z",
  "settings": { "wordCountTarget": 90000 },
  "manifest": {
    "outline": "outline/tree.json",
    "plot": "brainstorm/plot.json",
    "draftMoments": ["moment_001", "moment_002"],
    "revisionMoments": ["moment_001"]
  }
}
```

`manifest.draftMoments` / `manifest.revisionMoments` let the backend know what shards *should* exist
without a directory scan on every request; a directory scan is still used as a consistency check /
fallback, and for the top-level `GET /api/projects` listing.

## `outline/tree.json`

Five-level structural hierarchy: **book → arc → chapter → scene → moment**. Nesting is
**flexible**: a node's parent may be any node of a strictly shallower kind, not necessarily the
adjacent one — e.g. a scene may nest directly under a book, skipping arc and chapter, for writers
who don't need every level. Nodes form a tree via `parentId`:

```json
{
  "schemaVersion": 2,
  "nodes": [
    { "id": "book_root", "kind": "book", "parentId": null, "order": 0, "title": "Working Title", "synopsis": "" },
    { "id": "arc_001", "kind": "arc", "parentId": "book_root", "order": 0, "title": "Arc One", "synopsis": "" },
    { "id": "ch_001", "kind": "chapter", "parentId": "arc_001", "order": 0, "title": "Chapter 1", "synopsis": "" },
    { "id": "scene_001", "kind": "scene", "parentId": "ch_001", "order": 0, "title": "Opening", "synopsis": "" },
    { "id": "moment_001", "kind": "moment", "parentId": "scene_001", "order": 0, "title": "First line", "synopsis": "", "draftRef": "moment_001" }
  ]
}
```

- `order` is a sibling-local integer, renormalized on every write (no sparse floats — the whole tree
  rewrites atomically anyway, so renumbering siblings is cheap and keeps ordering unambiguous).
- **The moment is the writing unit.** `draftRef` is set only on `moment`-kind nodes and points at the
  moment id used for `draft/<moment-id>.json` and `revisions/<moment-id>/`. It's a separate field
  (not assumed equal to `id`) so a moment can exist in the outline before any draft content is
  written — draft shard creation is lazy, on first save. Book/arc/chapter/scene nodes are pure
  structural containers with no draft content of their own.
- Frontend helpers live in `frontend/src/lib/nodeTree.ts` (generic flat-list-with-parentId tree
  operations shared with the plot tree below) and `frontend/src/modes/outline/outlineTree.ts`
  (outline-specific: `kindsDeeperThan`, `documentOrder`/`getAllMoments` for depth-first traversal).
- **v2 extension point (not built yet):** a parallel content-linkage model beyond the current
  plot-tree's `assignedMomentId` (e.g. multiple plotpoints per moment with typed relationships) can
  be added without a breaking schema change.

## `brainstorm/plot.json`

Three-level content hierarchy: **category → plotline → plotpoint**, mirroring the outline tree's
flat-list-with-parentId shape (same generic tree helpers, different domain). A plotpoint is the leaf
"note" and may be assigned to a moment in the outline tree.

```json
{
  "schemaVersion": 2,
  "nodes": [
    { "id": "cat_001", "kind": "category", "parentId": null, "order": 0, "title": "Betrayal", "body": "", "assignedMomentId": null, "customFieldDefs": [{ "id": "field_001", "name": "POV character" }], "customFieldValues": {}, "keywords": [] },
    { "id": "pl_001", "kind": "plotline", "parentId": "cat_001", "order": 0, "title": "The mole", "body": "", "assignedMomentId": null, "customFieldDefs": [], "customFieldValues": { "field_001": "Dana" }, "keywords": ["double agent", "trust"] },
    { "id": "pp_001", "kind": "plotpoint", "parentId": "pl_001", "order": 0, "title": "Reveal", "body": "What if the villain is the narrator's future self?", "assignedMomentId": "moment_001", "customFieldDefs": [], "customFieldValues": {}, "keywords": [] }
  ]
}
```

- `body` is only meaningful on `plotpoint` nodes (the actual note text); category/plotline nodes use
  `body: ""`.
- `assignedMomentId` is only meaningful on `plotpoint` nodes — nullable, set by dragging the plotpoint
  card onto a moment row in the Outline tree (native HTML5 drag-and-drop). Categories and plotlines
  are pure organizational containers.
- `customFieldDefs` is only meaningful on `category` nodes: an optional list of `{id, name}` field
  definitions that plotlines within that category can fill in (e.g. "POV character", "Stakes").
- `customFieldValues` is only meaningful on `plotline` nodes: a map of `customFieldDefs.id` (from the
  parent category) to the plotline's free-text value for that field. A plotline's parent is always its
  category — the only shallower plot kind — so lookup is a direct parent walk.
- `keywords` is only meaningful on `plotline` nodes: free-text words/phrases the user attaches to a
  plotline (e.g. for later cross-referencing), edited as removable chips plus an add-on-Enter input.
- Rendered in the app as a sidebar alongside the focal Outline editor on the combined **Plan** page
  (`frontend/src/modes/plan/`), not as a separate tab.

## `draft/<moment-id>.json`

```json
{
  "schemaVersion": 2,
  "momentId": "moment_001",
  "outlineNodeId": "moment_001",
  "updatedAt": "2026-07-27T14:32:11Z",
  "wordCount": 842,
  "format": "markdown",
  "body": "The rain started before the funeral did.\n\n..."
}
```

`format` is currently always `"markdown"` — the editor is a plain textarea over markdown text, so
there's no rich-text-to-markdown conversion layer to keep in sync.

## `revisions/<moment-id>/<snapshot-id>.json`

```json
{
  "schemaVersion": 2,
  "snapshotId": "snap_20260727_143211",
  "momentId": "moment_001",
  "createdAt": "2026-07-27T14:32:11Z",
  "label": "before rewriting opening line",
  "trigger": "manual",
  "body": "The rain started before the funeral did.\n\n...",
  "wordCount": 842,
  "notes": [
    { "id": "cmt_001", "anchor": { "type": "text-offset", "start": 0, "end": 27 }, "body": "too on-the-nose?", "flag": "primary", "createdAt": "2026-07-27T14:33:00Z" }
  ]
}
```

- `trigger` is `"manual"` (user clicked "snapshot this") or `"session-close"` (automatic snapshot
  taken once per changed moment when a project is closed).
- Revision history is **snapshot-based, not diff-based**: each snapshot stores the full `body`. Diffs
  between two snapshots (or a snapshot and the current draft) are computed on read, via Python
  `difflib`, and never persisted.
- Revert never silently overwrites: it creates a *new* snapshot of the current state first (a safety
  net), then copies the target snapshot's body into `draft/<moment-id>.json`.
- Inline comments (`notes`) are anchored by simple text-offset ranges within that specific snapshot's
  body — anchors are only meaningful relative to the snapshot they were created on; comments don't
  need to survive re-anchoring across edits. `flag` is a lightweight string enum
  (`"primary" | "secondary" | null`), a nod to the original color-coded flag system without a full
  flag-definition CRUD system (still a v2 extension point).

## Atomic writes

All shard writes go through one helper in `backend/app/storage/project_store.py`:

1. Serialize to a temp file in `<project>/.tmp/` (same volume as the destination, required for atomic
   rename to work).
2. `fsync` the temp file's descriptor before closing it.
3. `os.replace(tmp_path, dest_path)` — atomic rename/replace on both POSIX and Windows.
4. `index.json`'s manifest/`updatedAt` is only touched on *structural* writes (new moment shard, new
   revision moment folder) — routine content saves to an existing shard don't rewrite `index.json`.

On load, if a shard fails to parse (e.g. a truncated file from a crash mid-write — which
temp-then-rename should prevent, but defense in depth matters for a local app with no cloud backup),
the corrupt file is renamed to `<name>.corrupt-<timestamp>.json` and a warning is surfaced to the
frontend. Sibling shards are never dropped as a result of one shard's corruption.

## Schema versioning note

`schemaVersion` bumped 1 → 2 with this restructure (3-level outline + freeform brainstorm notes →
5-level flexible outline + structured plot tree, scene-keyed → moment-keyed draft/revisions). There
is no migration path from v1 projects — this was a pre-launch breaking change with no real user data
at stake. Any future schema change with real projects in the wild would need an actual migration
step keyed off `schemaVersion`.
