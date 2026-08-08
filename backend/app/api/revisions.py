import difflib
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import get_storage_root
from ..models import AddCommentRequest, DiffOp, DiffResponse, UpdateCommentRequest
from ..storage import activity, project_store as store
from ..storage.schema import (
    CommentAnchor,
    DraftChapter,
    DraftMoment,
    OutlineNode,
    RevisionComment,
    RevisionSnapshot,
    RevisionSummary,
    RevisionTrigger,
    utcnow,
)

router = APIRouter(prefix="/api/projects/{project_id}/revisions/{chapter_id}", tags=["revisions"])

_TOKEN_RE = re.compile(r"\S+|\s+")


def _word_count(body: str) -> int:
    return len(body.split())


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text)


def _diff_texts(a: str, b: str) -> list[DiffOp]:
    a_tokens = _tokenize(a)
    b_tokens = _tokenize(b)
    matcher = difflib.SequenceMatcher(None, a_tokens, b_tokens, autojunk=False)
    ops: list[DiffOp] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            ops.append(DiffOp(op="equal", text="".join(a_tokens[i1:i2])))
        elif tag == "delete":
            ops.append(DiffOp(op="delete", text="".join(a_tokens[i1:i2])))
        elif tag == "insert":
            ops.append(DiffOp(op="insert", text="".join(b_tokens[j1:j2])))
        elif tag == "replace":
            ops.append(DiffOp(op="delete", text="".join(a_tokens[i1:i2])))
            ops.append(DiffOp(op="insert", text="".join(b_tokens[j1:j2])))
    return ops


def _format_label(dt) -> str:
    return dt.strftime("%Y-%m-%d %H:%M")


def _snapshot_from_chapter_draft(
    chapter_id: str,
    snapshot_id: str,
    label: str,
    trigger: RevisionTrigger,
    chapter_draft: DraftChapter,
) -> RevisionSnapshot:
    return RevisionSnapshot(
        snapshotId=snapshot_id,
        chapterId=chapter_id,
        createdAt=utcnow(),
        label=label,
        trigger=trigger,
        moments={moment_id: m.body for moment_id, m in chapter_draft.moments.items()},
        wordCount=sum(m.wordCount for m in chapter_draft.moments.values()),
    )


def _live_moment_ids_in_chapter(root: Path, project_id: str, chapter_id: str) -> list[str]:
    outline = store.load_outline(root, project_id)
    nodes_by_id: dict[str, OutlineNode] = {n.id: n for n in outline.nodes}

    def _chapter_ancestor(node_id: str) -> str | None:
        current = nodes_by_id.get(node_id)
        while current is not None and current.parentId:
            parent = nodes_by_id.get(current.parentId)
            if parent is None:
                return None
            if parent.kind == "chapter":
                return parent.id
            current = parent
        return None

    return [n.id for n in outline.nodes if n.kind == "moment" and _chapter_ancestor(n.id) == chapter_id]


@router.get("", response_model=list[RevisionSummary])
def list_revisions(project_id: str, chapter_id: str, root: Path = Depends(get_storage_root)) -> list[RevisionSummary]:
    # One-time, idempotent fold-in of any old-shape per-moment revision
    # history for this chapter's live moments (see migrate_legacy_revisions).
    store.migrate_legacy_revisions(root, project_id, chapter_id, _live_moment_ids_in_chapter(root, project_id, chapter_id))
    snapshots = store.list_revisions(root, project_id, chapter_id)
    return [
        RevisionSummary(
            snapshotId=s.snapshotId,
            createdAt=s.createdAt,
            label=s.label,
            trigger=s.trigger,
            wordCount=s.wordCount,
        )
        for s in snapshots
    ]


@router.get("/diff", response_model=DiffResponse)
def diff_revisions(
    project_id: str,
    chapter_id: str,
    moment_id: str = Query(alias="momentId"),
    from_: str = Query(alias="from"),
    to: str = Query(default="current"),
    root: Path = Depends(get_storage_root),
) -> DiffResponse:
    from_snapshot = store.load_revision(root, project_id, chapter_id, from_)
    from_body = from_snapshot.moments.get(moment_id, "")
    if to == "current":
        try:
            to_body = store.load_draft(root, project_id, chapter_id, moment_id).body
        except store.MomentNotFoundError:
            to_body = ""
    else:
        to_snapshot = store.load_revision(root, project_id, chapter_id, to)
        to_body = to_snapshot.moments.get(moment_id, "")
    return DiffResponse(ops=_diff_texts(from_body, to_body))


@router.get("/{snapshot_id}", response_model=RevisionSnapshot)
def get_revision(
    project_id: str, chapter_id: str, snapshot_id: str, root: Path = Depends(get_storage_root)
) -> RevisionSnapshot:
    return store.load_revision(root, project_id, chapter_id, snapshot_id)


@router.post("", response_model=RevisionSnapshot)
def create_revision(project_id: str, chapter_id: str, root: Path = Depends(get_storage_root)) -> RevisionSnapshot:
    """Manual save -- a floppy-disk button with no naming step; the label is
    always the save's own formatted date/time."""
    chapter_draft = store.load_draft_chapter(root, project_id, chapter_id)
    now = utcnow()
    snapshot = _snapshot_from_chapter_draft(chapter_id, store.new_id("snap"), _format_label(now), "manual", chapter_draft)
    store.save_revision(root, project_id, snapshot)
    activity.record_daily_activity(root, project_id, draft_revisions=1)
    return snapshot


@router.post("/auto", response_model=RevisionSnapshot)
def save_auto_revision(project_id: str, chapter_id: str, root: Path = Depends(get_storage_root)) -> RevisionSnapshot:
    """Fires after 5 minutes of inactivity on a chapter's page (client-side
    timer). Always writes to the same fixed snapshotId, so this overwrites a
    single rolling slot per chapter instead of appending to the timeline."""
    chapter_draft = store.load_draft_chapter(root, project_id, chapter_id)
    now = utcnow()
    snapshot = _snapshot_from_chapter_draft(chapter_id, "auto", _format_label(now), "auto", chapter_draft)
    store.save_revision(root, project_id, snapshot)
    return snapshot


@router.post("/{snapshot_id}/revert", response_model=RevisionSnapshot)
def revert_to_revision(
    project_id: str, chapter_id: str, snapshot_id: str, root: Path = Depends(get_storage_root)
) -> RevisionSnapshot:
    target = store.load_revision(root, project_id, chapter_id, snapshot_id)
    current_chapter_draft = store.load_draft_chapter(root, project_id, chapter_id)

    safety_snapshot = _snapshot_from_chapter_draft(
        chapter_id,
        store.new_id("snap"),
        f"Before revert to {target.label or snapshot_id}",
        "manual",
        current_chapter_draft,
    )
    store.save_revision(root, project_id, safety_snapshot)
    activity.record_daily_activity(root, project_id, draft_revisions=1)

    word_count_before = sum(m.wordCount for m in current_chapter_draft.moments.values())
    for moment_id, body in target.moments.items():
        draft = DraftMoment(
            momentId=moment_id,
            outlineNodeId=moment_id,
            updatedAt=utcnow(),
            wordCount=_word_count(body),
            body=body,
        )
        store.save_draft(root, project_id, chapter_id, moment_id, draft)
    updated_chapter_draft = store.load_draft_chapter(root, project_id, chapter_id)
    word_count_after = sum(m.wordCount for m in updated_chapter_draft.moments.values())
    activity.record_daily_activity(root, project_id, word_count_delta=word_count_after - word_count_before)
    return safety_snapshot


@router.post("/{snapshot_id}/notes", response_model=RevisionComment)
def add_comment(
    project_id: str,
    chapter_id: str,
    snapshot_id: str,
    body: AddCommentRequest,
    root: Path = Depends(get_storage_root),
) -> RevisionComment:
    snapshot = store.load_revision(root, project_id, chapter_id, snapshot_id)
    comment = RevisionComment(
        id=store.new_id("cmt"),
        anchor=CommentAnchor(momentId=body.momentId, start=body.anchorStart, end=body.anchorEnd),
        body=body.body,
        flag=body.flag,
        createdAt=utcnow(),
    )
    snapshot.notes.append(comment)
    store.save_revision(root, project_id, snapshot)
    return comment


@router.patch("/{snapshot_id}/notes/{note_id}", response_model=RevisionComment)
def update_comment(
    project_id: str,
    chapter_id: str,
    snapshot_id: str,
    note_id: str,
    body: UpdateCommentRequest,
    root: Path = Depends(get_storage_root),
) -> RevisionComment:
    snapshot = store.load_revision(root, project_id, chapter_id, snapshot_id)
    for comment in snapshot.notes:
        if comment.id == note_id:
            if body.body is not None:
                comment.body = body.body
            if body.flag is not None:
                comment.flag = body.flag
            store.save_revision(root, project_id, snapshot)
            return comment
    raise HTTPException(status_code=404, detail=f"comment not found: {note_id}")


@router.delete("/{snapshot_id}/notes/{note_id}", status_code=204)
def delete_comment(
    project_id: str,
    chapter_id: str,
    snapshot_id: str,
    note_id: str,
    root: Path = Depends(get_storage_root),
) -> None:
    snapshot = store.load_revision(root, project_id, chapter_id, snapshot_id)
    remaining = [c for c in snapshot.notes if c.id != note_id]
    if len(remaining) == len(snapshot.notes):
        raise HTTPException(status_code=404, detail=f"comment not found: {note_id}")
    snapshot.notes = remaining
    store.save_revision(root, project_id, snapshot)
