"""Draft saves in today's activity log: every save of a chapter's draft writes a revision entry, one per editing session.

Saves within SESSION_GAP_MINUTES of the last one update the same "session" entry (its text and word count, and `updatedAt`); a longer pause
starts a new one. The first entry of a chapter that has no revisions yet is preceded by one that holds the text as it was before the edit,
so the first change can be undone too. Undo reads these entries (a revision's text is a whole chapter's moments)."""

from datetime import timedelta
from pathlib import Path

from . import project_store as store
from .schema import DraftChapter, RevisionSnapshot, utcnow

SESSION_GAP_MINUTES = 10


def _snapshot(chapter_id: str, snapshot_id: str, label: str, draft: DraftChapter, created_at, *, session: bool) -> RevisionSnapshot:
    return RevisionSnapshot(
        snapshotId=snapshot_id,
        chapterId=chapter_id,
        createdAt=created_at,
        # Only a session is kept up to date by later saves; the text before the first one is fixed.
        updatedAt=created_at if session else None,
        label=label,
        trigger="session",
        moments={moment_id: m.body for moment_id, m in draft.moments.items()},
        wordCount=sum(m.wordCount for m in draft.moments.values()),
    )


def record_session(root: Path, project_id: str, chapter_id: str, before: DraftChapter) -> None:
    """Call after a draft was saved; `before` is the chapter's draft as it was just before that save."""
    now = utcnow()
    after = store.load_draft_chapter(root, project_id, chapter_id)
    revisions = store.list_revisions(root, project_id, chapter_id)
    sessions = [r for r in revisions if r.trigger == "session" and r.updatedAt is not None]
    latest = max(sessions, key=lambda r: r.updatedAt, default=None)
    if latest is not None and now - latest.updatedAt < timedelta(minutes=SESSION_GAP_MINUTES):
        latest.moments = {moment_id: m.body for moment_id, m in after.moments.items()}
        latest.wordCount = sum(m.wordCount for m in after.moments.values())
        latest.updatedAt = now
        store.save_revision(root, project_id, latest)
        return
    if not revisions:
        store.save_revision(
            root, project_id, _snapshot(chapter_id, store.new_id("snap"), "Before this session", before, now - timedelta(seconds=1), session=False)
        )
    store.save_revision(root, project_id, _snapshot(chapter_id, store.new_id("snap"), "Editing session", after, now, session=True))
