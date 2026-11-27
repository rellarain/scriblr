"""A project, a book or a chapter as JSON: the outline of what is exported, its drafts and, by choice, the project's plot, the revision flags on it
and its chapters' saved revisions. Meant for a backup or another tool; it is plain data with the app's own field names."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import project_store as store
from .export_content import ExportScope, OutlineNodeNotFoundError, _children, _descendants

FORMAT = "scriblr-export"
VERSION = 1


@dataclass
class JsonOptions:
    plot: bool = True
    flags: bool = True
    revisions: bool = False


def build_json(root: Path, project_id: str, scope: ExportScope, target_id: str | None = None, options: JsonOptions | None = None,
               now: datetime | None = None) -> dict[str, Any]:
    opts = options or JsonOptions()
    pf = store.load_project(root, project_id)
    nodes = pf.outline.nodes
    by_parent = _children(nodes)
    if scope == "project":
        chosen = list(nodes)
        title = pf.index.title
    else:
        target = next((n for n in nodes if n.id == target_id and n.kind == scope), None)
        if target is None:
            raise OutlineNodeNotFoundError(project_id, target_id or "")
        chosen = [target, *_descendants(by_parent, target.id)]
        title = target.title
    chapters = {n.id for n in chosen if n.kind == "chapter"}
    out: dict[str, Any] = {
        "format": FORMAT,
        "version": VERSION,
        "exportedAt": (now or datetime.now(timezone.utc)).isoformat(),
        "scope": scope,
        "title": title,
        "project": {"id": project_id, "title": pf.index.title},
        "outline": [n.model_dump(mode="json") for n in chosen],
        "drafts": {
            cid: {mid: m.body for mid, m in pf.drafts[cid].moments.items()}
            for cid in sorted(chapters) if cid in pf.drafts
        },
    }
    if opts.plot:
        out["plot"] = [n.model_dump(mode="json") for n in pf.plot.nodes]
    if opts.flags:
        out["revisionFlags"] = [
            f.model_dump(mode="json") for f in pf.revisionFlags if f.scope == "project" or (f.chapterId is not None and f.chapterId in chapters)
        ]
    if opts.revisions:
        out["revisions"] = {cid: [s.model_dump(mode="json") for s in pf.revisions.get(cid, [])] for cid in sorted(chapters) if pf.revisions.get(cid)}
    return out
