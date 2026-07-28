"""Detects draft content orphaned by outline node deletion and records it in
a per-project scrap registry, with restore (reattach to a live outline node,
reusing the original moment id so the draft shard and revision history need
no copying) and permanent delete."""

from pathlib import Path
from typing import Optional

from . import activity, tree_history
from . import project_store as store
from .schema import OUTLINE_KIND_ORDER, OutlineNode, OutlineTree, ScrapEntry, utcnow


def _ancestor_of_kind(nodes_by_id: dict[str, OutlineNode], node_id: str, kind: str) -> Optional[OutlineNode]:
    current = nodes_by_id.get(node_id)
    while current is not None and current.parentId:
        parent = nodes_by_id.get(current.parentId)
        if parent is None:
            return None
        if parent.kind == kind:
            return parent
        current = parent
    return None


def detect_and_record_orphans(
    root: Path, project_id: str, old_nodes: list[OutlineNode], new_nodes: list[OutlineNode]
) -> None:
    old_ids = {n.id for n in old_nodes}
    new_ids = {n.id for n in new_nodes}
    removed_ids = old_ids - new_ids
    if not removed_ids:
        return

    old_by_id = {n.id: n for n in old_nodes}
    index = store.load_index(root, project_id)
    registry = store.load_scrap_registry(root, project_id)
    existing_ids = {e.momentId for e in registry.entries}

    changed = False
    for node_id in removed_ids:
        node = old_by_id[node_id]
        if node.kind != "moment" or node_id in existing_ids:
            continue
        if node_id not in index.manifest.draftMoments:
            continue  # never had draft content, nothing worth scrapping

        chapter = _ancestor_of_kind(old_by_id, node_id, "chapter")
        book = _ancestor_of_kind(old_by_id, node_id, "book")
        try:
            word_count = store.load_draft(root, project_id, node_id).wordCount
        except (store.MomentNotFoundError, store.ShardCorruptError):
            word_count = 0

        registry.entries.append(
            ScrapEntry(
                momentId=node_id,
                title=node.title,
                wordCount=word_count,
                orphanedAt=utcnow(),
                lastChapterId=chapter.id if chapter else None,
                lastChapterTitle=chapter.title if chapter else None,
                lastBookId=book.id if book else None,
                lastBookTitle=book.title if book else None,
            )
        )
        changed = True

    if changed:
        store.save_scrap_registry(root, project_id, registry)


def restore_entry(
    root: Path, project_id: str, moment_id: str, parent_id: str, title: Optional[str] = None
) -> OutlineTree:
    registry = store.load_scrap_registry(root, project_id)
    entry = next((e for e in registry.entries if e.momentId == moment_id), None)
    if entry is None:
        raise store.ScrapEntryNotFoundError(project_id, moment_id)

    outline = store.load_outline(root, project_id)
    parent = next((n for n in outline.nodes if n.id == parent_id), None)
    if parent is None or OUTLINE_KIND_ORDER.index(parent.kind) >= OUTLINE_KIND_ORDER.index("moment"):
        raise store.InvalidRestoreParentError(project_id, parent_id)

    siblings = [n for n in outline.nodes if n.parentId == parent_id]
    order = 0 if not siblings else max(n.order for n in siblings) + 1
    new_node = OutlineNode(
        id=moment_id,
        kind="moment",
        parentId=parent_id,
        order=order,
        title=title or entry.title,
        draftRef=moment_id,
    )
    outline.nodes.append(new_node)
    store.save_outline(root, project_id, outline)

    # Restore bypasses the outline PUT route's handler, so its usual
    # auto-snapshot/activity side effects must be triggered here explicitly.
    node_dicts = [n.model_dump() for n in outline.nodes]
    snapshot = tree_history.maybe_create_snapshot(root, project_id, "outline", node_dicts)
    if snapshot is not None:
        activity.record_daily_activity(root, project_id, outline_saves=1)

    registry.entries = [e for e in registry.entries if e.momentId != moment_id]
    store.save_scrap_registry(root, project_id, registry)
    return store.load_outline(root, project_id)


def delete_entry_permanently(root: Path, project_id: str, moment_id: str) -> None:
    registry = store.load_scrap_registry(root, project_id)
    remaining = [e for e in registry.entries if e.momentId != moment_id]
    if len(remaining) == len(registry.entries):
        raise store.ScrapEntryNotFoundError(project_id, moment_id)
    registry.entries = remaining
    store.save_scrap_registry(root, project_id, registry)

    try:
        store.delete_draft(root, project_id, moment_id)
    except store.MomentNotFoundError:
        pass
    store.delete_revision_history(root, project_id, moment_id)
