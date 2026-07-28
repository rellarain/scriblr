"""Automatic, git-like snapshot/diff/revert history for the Outline and Plot
trees, shared by both since they're structurally identical (flat node list
with id/parentId/title/flag) aside from which field holds body content."""

from pathlib import Path
from typing import Optional

from . import project_store as store
from .schema import TreeDiffEntry, TreeSnapshot, TreeSnapshotSummary, TreeSnapshotTrigger, TreeType, utcnow

_COMPARE_FIELDS = ("title", "parentId", "flag")


def _content_field_for(tree_type: TreeType) -> str:
    return "synopsis" if tree_type == "outline" else "body"


def maybe_create_snapshot(
    root: Path,
    project_id: str,
    tree_type: TreeType,
    nodes: list[dict],
    trigger: TreeSnapshotTrigger = "auto",
) -> Optional[TreeSnapshot]:
    """Creates a new snapshot unless `nodes` is identical to the most
    recently stored snapshot, so repeated saves of unchanged content don't
    spam the history."""
    existing = store.list_tree_snapshots(root, project_id, tree_type)
    previous = existing[-1] if existing else None
    if previous is not None and previous.nodes == nodes:
        return None
    snapshot = TreeSnapshot(
        snapshotId=store.new_id("tsnap"),
        treeType=tree_type,
        createdAt=utcnow(),
        trigger=trigger,
        nodes=nodes,
    )
    store.save_tree_snapshot(root, project_id, snapshot)
    return snapshot


def diff_snapshots(nodes_from: list[dict], nodes_to: list[dict], tree_type: TreeType) -> list[TreeDiffEntry]:
    content_field = _content_field_for(tree_type)
    compare_fields = (*_COMPARE_FIELDS, content_field)
    from_by_id = {n["id"]: n for n in nodes_from}
    to_by_id = {n["id"]: n for n in nodes_to}

    entries: list[TreeDiffEntry] = []
    for node_id, from_node in from_by_id.items():
        if node_id not in to_by_id:
            entries.append(
                TreeDiffEntry(nodeId=node_id, kind="removed", title=from_node.get("title", ""))
            )
            continue
        to_node = to_by_id[node_id]
        changed = [f for f in compare_fields if from_node.get(f) != to_node.get(f)]
        entries.append(
            TreeDiffEntry(
                nodeId=node_id,
                kind="modified" if changed else "unchanged",
                title=to_node.get("title", ""),
                changedFields=changed,
            )
        )
    for node_id, to_node in to_by_id.items():
        if node_id not in from_by_id:
            entries.append(TreeDiffEntry(nodeId=node_id, kind="added", title=to_node.get("title", "")))
    return entries


def summarize(entries: list[TreeDiffEntry]) -> str:
    added = sum(1 for e in entries if e.kind == "added")
    removed = sum(1 for e in entries if e.kind == "removed")
    modified = sum(1 for e in entries if e.kind == "modified")
    parts = []
    if added:
        parts.append(f"+{added} added")
    if removed:
        parts.append(f"-{removed} removed")
    if modified:
        parts.append(f"{modified} modified")
    return ", ".join(parts) if parts else "No changes"


def summarize_snapshots(snapshots: list[TreeSnapshot], tree_type: TreeType) -> list[TreeSnapshotSummary]:
    """Pairs each snapshot with its predecessor (empty tree for the first)
    to build the list-view summary text, in the same order as `snapshots`."""
    summaries: list[TreeSnapshotSummary] = []
    previous_nodes: list[dict] = []
    for snapshot in snapshots:
        entries = diff_snapshots(previous_nodes, snapshot.nodes, tree_type)
        summaries.append(
            TreeSnapshotSummary(
                snapshotId=snapshot.snapshotId,
                treeType=snapshot.treeType,
                createdAt=snapshot.createdAt,
                trigger=snapshot.trigger,
                nodeCount=len(snapshot.nodes),
                summary=summarize(entries),
            )
        )
        previous_nodes = snapshot.nodes
    return summaries


def revert_to_snapshot(
    root: Path,
    project_id: str,
    tree_type: TreeType,
    snapshot_id: str,
    current_nodes: list[dict],
) -> tuple[Optional[TreeSnapshot], list[dict]]:
    """Loads the target snapshot (raises TreeSnapshotNotFoundError if
    missing), safety-snapshots the current live tree first (dedup-aware, so
    reverting to the tree's own current state is a no-op), and returns the
    target's nodes for the caller to write back via the tree's normal save
    path. No further auto-snapshot is needed afterward -- the live tree will
    simply equal an already-recorded historical snapshot."""
    target = store.load_tree_snapshot(root, project_id, tree_type, snapshot_id)
    safety = maybe_create_snapshot(root, project_id, tree_type, current_nodes, trigger="revert-safety")
    return safety, target.nodes
