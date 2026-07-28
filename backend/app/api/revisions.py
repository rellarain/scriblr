import difflib
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import get_storage_root
from ..models import AddCommentRequest, CreateSnapshotRequest, DiffOp, DiffResponse, UpdateCommentRequest
from ..storage import project_store as store
from ..storage.schema import CommentAnchor, RevisionComment, RevisionSnapshot, RevisionSummary, utcnow

router = APIRouter(prefix="/api/projects/{project_id}/revisions/{moment_id}", tags=["revisions"])

_TOKEN_RE = re.compile(r"\S+|\s+")


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


@router.get("", response_model=list[RevisionSummary])
def list_revisions(
    project_id: str, moment_id: str, root: Path = Depends(get_storage_root)
) -> list[RevisionSummary]:
    snapshots = store.list_revisions(root, project_id, moment_id)
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
    moment_id: str,
    from_: str = Query(alias="from"),
    to: str = Query(default="current"),
    root: Path = Depends(get_storage_root),
) -> DiffResponse:
    from_snapshot = store.load_revision(root, project_id, moment_id, from_)
    if to == "current":
        to_body = store.load_draft(root, project_id, moment_id).body
    else:
        to_body = store.load_revision(root, project_id, moment_id, to).body
    return DiffResponse(ops=_diff_texts(from_snapshot.body, to_body))


@router.get("/{snapshot_id}", response_model=RevisionSnapshot)
def get_revision(
    project_id: str, moment_id: str, snapshot_id: str, root: Path = Depends(get_storage_root)
) -> RevisionSnapshot:
    return store.load_revision(root, project_id, moment_id, snapshot_id)


@router.post("", response_model=RevisionSnapshot)
def create_revision(
    project_id: str,
    moment_id: str,
    body: CreateSnapshotRequest,
    root: Path = Depends(get_storage_root),
) -> RevisionSnapshot:
    draft = store.load_draft(root, project_id, moment_id)
    snapshot = RevisionSnapshot(
        snapshotId=store.new_id("snap"),
        momentId=moment_id,
        createdAt=utcnow(),
        label=body.label,
        trigger="manual",
        body=draft.body,
        wordCount=draft.wordCount,
    )
    store.save_revision(root, project_id, snapshot)
    return snapshot


@router.post("/{snapshot_id}/revert", response_model=RevisionSnapshot)
def revert_to_revision(
    project_id: str, moment_id: str, snapshot_id: str, root: Path = Depends(get_storage_root)
) -> RevisionSnapshot:
    target = store.load_revision(root, project_id, moment_id, snapshot_id)

    current_draft = store.load_draft(root, project_id, moment_id)
    safety_snapshot = RevisionSnapshot(
        snapshotId=store.new_id("snap"),
        momentId=moment_id,
        createdAt=utcnow(),
        label=f"before revert to {snapshot_id}",
        trigger="manual",
        body=current_draft.body,
        wordCount=current_draft.wordCount,
    )
    store.save_revision(root, project_id, safety_snapshot)

    current_draft.body = target.body
    current_draft.wordCount = target.wordCount
    current_draft.updatedAt = utcnow()
    store.save_draft(root, project_id, moment_id, current_draft)
    return safety_snapshot


@router.post("/{snapshot_id}/notes", response_model=RevisionComment)
def add_comment(
    project_id: str,
    moment_id: str,
    snapshot_id: str,
    body: AddCommentRequest,
    root: Path = Depends(get_storage_root),
) -> RevisionComment:
    snapshot = store.load_revision(root, project_id, moment_id, snapshot_id)
    comment = RevisionComment(
        id=store.new_id("cmt"),
        anchor=CommentAnchor(start=body.anchorStart, end=body.anchorEnd),
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
    moment_id: str,
    snapshot_id: str,
    note_id: str,
    body: UpdateCommentRequest,
    root: Path = Depends(get_storage_root),
) -> RevisionComment:
    snapshot = store.load_revision(root, project_id, moment_id, snapshot_id)
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
    moment_id: str,
    snapshot_id: str,
    note_id: str,
    root: Path = Depends(get_storage_root),
) -> None:
    snapshot = store.load_revision(root, project_id, moment_id, snapshot_id)
    remaining = [c for c in snapshot.notes if c.id != note_id]
    if len(remaining) == len(snapshot.notes):
        raise HTTPException(status_code=404, detail=f"comment not found: {note_id}")
    snapshot.notes = remaining
    store.save_revision(root, project_id, snapshot)
