from pathlib import Path

from fastapi import APIRouter, Depends, Query

from ..deps import get_storage_root
from ..models import PlotRevertResponse, PlotSnapshotDetail
from ..storage import activity, project_store as store, tree_history
from ..storage.schema import PlotNode, PlotTree, TreeDiffResponse, TreeSnapshotSummary

router = APIRouter(prefix="/api/projects/{project_id}/plot", tags=["plot"])


@router.get("", response_model=PlotTree)
def get_plot(project_id: str, root: Path = Depends(get_storage_root)) -> PlotTree:
    return store.load_plot(root, project_id)


@router.put("", response_model=PlotTree)
def put_plot(project_id: str, body: PlotTree, root: Path = Depends(get_storage_root)) -> PlotTree:
    store.save_plot(root, project_id, body)
    node_dicts = [n.model_dump() for n in body.nodes]
    snapshot = tree_history.maybe_create_snapshot(root, project_id, "plot", node_dicts)
    if snapshot is not None:
        activity.record_daily_activity(root, project_id, plot_saves=1)
    return store.load_plot(root, project_id)


@router.get("/history", response_model=list[TreeSnapshotSummary])
def list_plot_history(project_id: str, root: Path = Depends(get_storage_root)) -> list[TreeSnapshotSummary]:
    snapshots = store.list_tree_snapshots(root, project_id, "plot")
    summaries = tree_history.summarize_snapshots(snapshots, "plot")
    return list(reversed(summaries))


@router.get("/history/diff", response_model=TreeDiffResponse)
def diff_plot_history(
    project_id: str,
    from_: str = Query(alias="from"),
    to: str = Query(default="current"),
    root: Path = Depends(get_storage_root),
) -> TreeDiffResponse:
    from_snapshot = store.load_tree_snapshot(root, project_id, "plot", from_)
    if to == "current":
        to_nodes = [n.model_dump() for n in store.load_plot(root, project_id).nodes]
    else:
        to_nodes = store.load_tree_snapshot(root, project_id, "plot", to).nodes
    entries = tree_history.diff_snapshots(from_snapshot.nodes, to_nodes, "plot")
    return TreeDiffResponse(fromSnapshotId=from_, toSnapshotId=to, entries=entries)


@router.get("/history/{snapshot_id}", response_model=PlotSnapshotDetail)
def get_plot_history_snapshot(
    project_id: str, snapshot_id: str, root: Path = Depends(get_storage_root)
) -> PlotSnapshotDetail:
    snapshot = store.load_tree_snapshot(root, project_id, "plot", snapshot_id)
    return PlotSnapshotDetail(
        snapshotId=snapshot.snapshotId,
        createdAt=snapshot.createdAt,
        trigger=snapshot.trigger,
        nodes=[PlotNode.model_validate(n) for n in snapshot.nodes],
    )


@router.post("/history/{snapshot_id}/revert", response_model=PlotRevertResponse)
def revert_plot_history(
    project_id: str, snapshot_id: str, root: Path = Depends(get_storage_root)
) -> PlotRevertResponse:
    current_nodes = [n.model_dump() for n in store.load_plot(root, project_id).nodes]
    safety, target_nodes = tree_history.revert_to_snapshot(
        root, project_id, "plot", snapshot_id, current_nodes
    )
    restored = PlotTree(nodes=[PlotNode.model_validate(n) for n in target_nodes])
    store.save_plot(root, project_id, restored)
    return PlotRevertResponse(
        safetySnapshotId=safety.snapshotId if safety else None,
        plot=store.load_plot(root, project_id),
    )
