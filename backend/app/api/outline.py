from pathlib import Path

from fastapi import APIRouter, Depends, Query

from ..deps import get_storage_root
from ..models import OutlineRevertResponse, OutlineSnapshotDetail
from ..storage import activity, project_store as store, scrap, tree_history
from ..storage.schema import OutlineNode, OutlineTree, TreeDiffResponse, TreeSnapshotSummary

router = APIRouter(prefix="/api/projects/{project_id}/outline", tags=["outline"])


@router.get("", response_model=OutlineTree)
def get_outline(project_id: str, root: Path = Depends(get_storage_root)) -> OutlineTree:
    return store.load_outline(root, project_id)


@router.put("", response_model=OutlineTree)
def put_outline(
    project_id: str, body: OutlineTree, root: Path = Depends(get_storage_root)
) -> OutlineTree:
    old_outline = store.load_outline(root, project_id)
    store.save_outline(root, project_id, body)
    scrap.detect_and_record_orphans(root, project_id, old_outline.nodes, body.nodes)
    node_dicts = [n.model_dump() for n in body.nodes]
    snapshot = tree_history.maybe_create_snapshot(root, project_id, "outline", node_dicts)
    if snapshot is not None:
        activity.record_daily_activity(root, project_id, outline_saves=1)
    return store.load_outline(root, project_id)


@router.get("/history", response_model=list[TreeSnapshotSummary])
def list_outline_history(
    project_id: str, root: Path = Depends(get_storage_root)
) -> list[TreeSnapshotSummary]:
    snapshots = store.list_tree_snapshots(root, project_id, "outline")
    summaries = tree_history.summarize_snapshots(snapshots, "outline")
    return list(reversed(summaries))


@router.get("/history/diff", response_model=TreeDiffResponse)
def diff_outline_history(
    project_id: str,
    from_: str = Query(alias="from"),
    to: str = Query(default="current"),
    root: Path = Depends(get_storage_root),
) -> TreeDiffResponse:
    from_snapshot = store.load_tree_snapshot(root, project_id, "outline", from_)
    if to == "current":
        to_nodes = [n.model_dump() for n in store.load_outline(root, project_id).nodes]
    else:
        to_nodes = store.load_tree_snapshot(root, project_id, "outline", to).nodes
    entries = tree_history.diff_snapshots(from_snapshot.nodes, to_nodes, "outline")
    return TreeDiffResponse(fromSnapshotId=from_, toSnapshotId=to, entries=entries)


@router.get("/history/{snapshot_id}", response_model=OutlineSnapshotDetail)
def get_outline_history_snapshot(
    project_id: str, snapshot_id: str, root: Path = Depends(get_storage_root)
) -> OutlineSnapshotDetail:
    snapshot = store.load_tree_snapshot(root, project_id, "outline", snapshot_id)
    return OutlineSnapshotDetail(
        snapshotId=snapshot.snapshotId,
        createdAt=snapshot.createdAt,
        trigger=snapshot.trigger,
        nodes=[OutlineNode.model_validate(n) for n in snapshot.nodes],
    )


@router.post("/history/{snapshot_id}/revert", response_model=OutlineRevertResponse)
def revert_outline_history(
    project_id: str, snapshot_id: str, root: Path = Depends(get_storage_root)
) -> OutlineRevertResponse:
    current_nodes = [n.model_dump() for n in store.load_outline(root, project_id).nodes]
    safety, target_nodes = tree_history.revert_to_snapshot(
        root, project_id, "outline", snapshot_id, current_nodes
    )
    restored = OutlineTree(nodes=[OutlineNode.model_validate(n) for n in target_nodes])
    store.save_outline(root, project_id, restored)
    return OutlineRevertResponse(
        safetySnapshotId=safety.snapshotId if safety else None,
        outline=store.load_outline(root, project_id),
    )
