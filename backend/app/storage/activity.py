"""Daily activity aggregate (feeds the calendar heatmap) plus a unified,
reverse-chronological activity log merging Outline/Plot tree history with
every moment's draft revision snapshots."""

from pathlib import Path

from . import project_store as store
from . import tree_history
from .schema import ActivityLogEntry, ActivityResponse, DailyActivityEntry, utcnow


def _today_str() -> str:
    return utcnow().date().isoformat()


def record_daily_activity(
    root: Path,
    project_id: str,
    *,
    word_count_delta: int = 0,
    outline_saves: int = 0,
    plot_saves: int = 0,
    draft_revisions: int = 0,
) -> None:
    if not (word_count_delta or outline_saves or plot_saves or draft_revisions):
        return
    log = store.load_daily_activity(root, project_id)
    today = _today_str()
    entry = log.days.get(today) or DailyActivityEntry(date=today)
    entry.wordCountDelta += word_count_delta
    entry.outlineSaves += outline_saves
    entry.plotSaves += plot_saves
    entry.draftRevisions += draft_revisions
    log.days[today] = entry
    store.save_daily_activity(root, project_id, log)


def get_activity(root: Path, project_id: str) -> ActivityResponse:
    daily = store.load_daily_activity(root, project_id)

    entries: list[ActivityLogEntry] = []

    for tree_type in ("outline", "plot"):
        snapshots = store.list_tree_snapshots(root, project_id, tree_type)
        summaries = tree_history.summarize_snapshots(snapshots, tree_type)
        for snapshot, summary in zip(snapshots, summaries):
            entries.append(
                ActivityLogEntry(
                    id=snapshot.snapshotId,
                    type=tree_type,
                    createdAt=snapshot.createdAt,
                    label=summary.summary,
                    trigger=snapshot.trigger,
                )
            )

    index = store.load_index(root, project_id)
    for moment_id in index.manifest.revisionMoments:
        for revision in store.list_revisions(root, project_id, moment_id):
            entries.append(
                ActivityLogEntry(
                    id=revision.snapshotId,
                    type="draft",
                    createdAt=revision.createdAt,
                    label=revision.label or "Snapshot",
                    trigger=revision.trigger,
                    momentId=moment_id,
                    wordCount=revision.wordCount,
                )
            )

    entries.sort(key=lambda e: e.createdAt, reverse=True)
    return ActivityResponse(daily=daily, log=entries)
