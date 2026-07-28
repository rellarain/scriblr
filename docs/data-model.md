# Data model — sharded per-project JSON storage

Each project is a folder under an OS app-data directory (resolved by `backend/app/storage/paths.py`;
on Windows: `%APPDATA%\Scriblr\projects\<project-id>\`).

```
<project-id>/
├── index.json              # metadata + manifest listing which shards exist
├── outline/tree.json       # whole outline tree, one shard (small, rewritten as a unit)
├── brainstorm/notes.json   # whole notes list, one shard (small)
├── draft/<scene-id>.json   # one shard PER SCENE — the large content, sharded fine-grained
├── revisions/<scene-id>/<snapshot-id>.json   # one shard per snapshot, append-only
└── .tmp/                   # scratch dir for atomic-write staging
```

The sharding is deliberately asymmetric: outline and brainstorm data are small and change as a
structural unit (reorder, rename), so one shard each is simplest. Scene drafts are the actual large
prose content and are edited independently, so each scene gets its own shard — editing one scene
never touches another scene's file or rewrites the whole book. Revision snapshots are immutable once
written, so one file per snapshot gives cheap listing/deletion without touching siblings.

## `index.json`

```json
{
  "schemaVersion": 1,
  "projectId": "prj_9f2a3b7c",
  "title": "Working Title",
  "createdAt": "2026-07-27T10:00:00Z",
  "updatedAt": "2026-07-27T14:32:11Z",
  "settings": { "wordCountTarget": 90000 },
  "manifest": {
    "outline": "outline/tree.json",
    "brainstorm": "brainstorm/notes.json",
    "draftScenes": ["scene_001", "scene_002"],
    "revisionScenes": ["scene_001"]
  }
}
```

`manifest.draftScenes` / `manifest.revisionScenes` let the backend know what shards *should* exist
without a directory scan on every request; a directory scan is still used as a consistency check /
fallback, and for the top-level `GET /api/projects` listing.

## `outline/tree.json`

Simplified hierarchy: **book → chapter → scene**, flattened from the original book → arc → subarc →
chapter → act → scene → moment concept (see `docs/legacy-concept/`). Nodes form a tree via
`parentId`:

```json
{
  "schemaVersion": 1,
  "nodes": [
    { "id": "book_root", "kind": "book", "parentId": null, "order": 0, "title": "Working Title", "synopsis": "" },
    { "id": "ch_001", "kind": "chapter", "parentId": "book_root", "order": 0, "title": "Chapter 1", "synopsis": "" },
    { "id": "scene_001", "kind": "scene", "parentId": "ch_001", "order": 0, "title": "Opening", "synopsis": "", "draftRef": "scene_001" }
  ]
}
```

- `order` is a sibling-local integer, renormalized on every write (no sparse floats — the whole tree
  rewrites atomically anyway, so renumbering siblings is cheap and keeps ordering unambiguous).
- `draftRef` on scene-kind nodes points at the scene id used for `draft/<scene-id>.json` and
  `revisions/<scene-id>/`. It's a separate field (not assumed equal to `id`) so a scene can exist in
  the outline before any draft content is written — draft shard creation is lazy, on first save.
- **v2 extension point (not built in v1):** `kind` can grow to include `arc`, `subarc`, `act`,
  `moment`; a parallel content model (categories/plotlines/sequences/plotpoints) can be added via an
  optional `contentRefs: string[]` field on nodes. Both are additive, not breaking, changes to this
  schema.

## `brainstorm/notes.json`

```json
{
  "schemaVersion": 1,
  "notes": [
    {
      "id": "note_001",
      "createdAt": "2026-07-20T09:00:00Z",
      "updatedAt": "2026-07-20T09:00:00Z",
      "body": "What if the villain is the narrator's future self?",
      "tags": ["twist", "villain"],
      "linkedOutlineNodeId": null
    }
  ]
}
```

`linkedOutlineNodeId` is nullable — notes start freeform and can later be pinned to an outline node.

## `draft/<scene-id>.json`

```json
{
  "schemaVersion": 1,
  "sceneId": "scene_001",
  "outlineNodeId": "scene_001",
  "updatedAt": "2026-07-27T14:32:11Z",
  "wordCount": 842,
  "format": "markdown",
  "body": "The rain started before the funeral did.\n\n..."
}
```

`format` is currently always `"markdown"` — the v1 editor is a plain textarea over markdown text, so
there's no rich-text-to-markdown conversion layer to keep in sync.

## `revisions/<scene-id>/<snapshot-id>.json`

```json
{
  "schemaVersion": 1,
  "snapshotId": "snap_20260727_143211",
  "sceneId": "scene_001",
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
  taken once per changed scene when a project is closed).
- Revision history is **snapshot-based, not diff-based**: each snapshot stores the full `body`. Diffs
  between two snapshots (or a snapshot and the current draft) are computed on read, via Python
  `difflib`, and never persisted.
- Revert never silently overwrites: it creates a *new* snapshot of the current state first (a safety
  net), then copies the target snapshot's body into `draft/<scene-id>.json`.
- Inline comments (`notes`) are anchored by simple text-offset ranges within that specific snapshot's
  body — anchors are only meaningful relative to the snapshot they were created on; comments don't
  need to survive re-anchoring across edits in v1. `flag` is a lightweight string enum
  (`"primary" | "secondary" | null`), a nod to the original color-coded flag system without a full
  flag-definition CRUD system (v2 extension point).

## Atomic writes

All shard writes go through one helper in `backend/app/storage/project_store.py`:

1. Serialize to a temp file in `<project>/.tmp/` (same volume as the destination, required for atomic
   rename to work).
2. `fsync` the temp file's descriptor before closing it.
3. `os.replace(tmp_path, dest_path)` — atomic rename/replace on both POSIX and Windows.
4. `index.json`'s manifest/`updatedAt` is only touched on *structural* writes (new scene shard, new
   revision scene folder) — routine content saves to an existing shard don't rewrite `index.json`.

On load, if a shard fails to parse (e.g. a truncated file from a crash mid-write — which
temp-then-rename should prevent, but defense in depth matters for a local app with no cloud backup),
the corrupt file is renamed to `<name>.corrupt-<timestamp>.json` and a warning is surfaced to the
frontend. Sibling shards are never dropped as a result of one shard's corruption.
