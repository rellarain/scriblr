from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_storage_root
from ..storage import facet_activity, project_store as store
from ..storage.schema import FlagPassage, FlagType, ProjectFile, RevisionFlag, utcnow

router = APIRouter(prefix="/api/projects/{project_id}/revision-flags", tags=["revision-flags"])


class PassageRange(BaseModel):
    momentId: str
    start: int = Field(default=0, ge=0)
    end: int = Field(default=0, ge=0)


class CreateRevisionFlagRequest(BaseModel):
    scope: Literal["passage", "project"]
    type: FlagType
    note: str = Field(default="", max_length=1000)
    chapterId: Optional[str] = None
    momentId: Optional[str] = None
    start: int = Field(default=0, ge=0)
    end: int = Field(default=0, ge=0)
    # For a merge flag on a passage: the passage to merge it with, in the same chapter.
    mergeWith: Optional[PassageRange] = None


class UpdateRevisionFlagRequest(BaseModel):
    type: Optional[FlagType] = None
    note: Optional[str] = Field(default=None, max_length=1000)


class ResolveRevisionFlagRequest(BaseModel):
    outcome: str = Field(default="", max_length=1000)


def _snippet(root: Path, project_id: str, chapter_id: str, moment_id: str, start: int, end: int) -> str:
    """The text [start, end) of a moment's draft, refused when the range is past its end."""
    text = store.load_draft(root, project_id, chapter_id, moment_id).body
    if end > len(text):
        raise HTTPException(status_code=422, detail="the range is past the end of the text")
    return text[start:end][:2000]


def _find(flags: list[RevisionFlag], flag_id: str) -> RevisionFlag:
    for flag in flags:
        if flag.id == flag_id:
            return flag
    raise HTTPException(status_code=404, detail=f"revision flag not found: {flag_id}")


@router.get("", response_model=list[RevisionFlag])
def list_revision_flags(
    project_id: str, includeResolved: bool = False, root: Path = Depends(get_storage_root)
) -> list[RevisionFlag]:
    flags = store.load_revision_flags(root, project_id)
    return [f for f in flags if includeResolved or f.resolvedAt is None]


@router.post("", response_model=RevisionFlag)
def create_revision_flag(
    project_id: str, body: CreateRevisionFlagRequest, root: Path = Depends(get_storage_root)
) -> RevisionFlag:
    snippet = ""
    merge_with: Optional[FlagPassage] = None
    if body.scope == "passage":
        if not body.chapterId or not body.momentId or body.end <= body.start:
            raise HTTPException(status_code=422, detail="a passage flag needs chapterId, momentId and a range")
        snippet = _snippet(root, project_id, body.chapterId, body.momentId, body.start, body.end)
        if body.mergeWith is not None:
            if body.type != "merge":
                raise HTTPException(status_code=422, detail="only a merge flag has a passage to merge with")
            other = body.mergeWith
            if other.end <= other.start:
                raise HTTPException(status_code=422, detail="the passage to merge with needs a range")
            if other.momentId == body.momentId and other.start < body.end and other.end > body.start:
                raise HTTPException(status_code=422, detail="the passage to merge with overlaps the flagged one")
            merge_with = FlagPassage(
                momentId=other.momentId, start=other.start, end=other.end,
                snippet=_snippet(root, project_id, body.chapterId, other.momentId, other.start, other.end),
            )
    elif body.mergeWith is not None:
        raise HTTPException(status_code=422, detail="a project flag has no passage to merge with")
    flag = RevisionFlag(
        id=store.new_id("flag"), scope=body.scope, type=body.type, note=body.note, chapterId=body.chapterId,
        momentId=body.momentId, start=body.start, end=body.end, snippet=snippet, mergeWith=merge_with,
    )
    with store.transaction(root, project_id):
        def _do(pf: ProjectFile) -> None:
            pf.revisionFlags.append(flag)

        store.mutate(root, project_id, _do)
        facet_activity.record(
            root, project_id, "revision", "flag", node_id=flag.id, kind=f"{flag.scope}-flag", label=snippet[:60] or body.note[:60] or None
        )
    return flag


@router.patch("/{flag_id}", response_model=RevisionFlag)
def update_revision_flag(
    project_id: str, flag_id: str, body: UpdateRevisionFlagRequest, root: Path = Depends(get_storage_root)
) -> RevisionFlag:
    result: list[RevisionFlag] = []

    def _do(pf: ProjectFile) -> None:
        flag = _find(pf.revisionFlags, flag_id)
        if body.type is not None:
            flag.type = body.type
            if body.type != "merge":
                flag.mergeWith = None
        if body.note is not None:
            flag.note = body.note
        result.append(flag)

    store.mutate(root, project_id, _do)
    return result[0]


@router.post("/{flag_id}/resolve", response_model=RevisionFlag)
def resolve_revision_flag(
    project_id: str, flag_id: str, body: ResolveRevisionFlagRequest, root: Path = Depends(get_storage_root)
) -> RevisionFlag:
    result: list[RevisionFlag] = []
    with store.transaction(root, project_id):
        def _do(pf: ProjectFile) -> None:
            flag = _find(pf.revisionFlags, flag_id)
            if flag.resolvedAt is None:
                flag.resolvedAt = utcnow()
                flag.outcome = body.outcome
                facet_activity.apply_event(
                    pf.facets, facet_activity.local_now(), "revision", "resolve", node_id=flag.id, kind=f"{flag.scope}-flag",
                    label=flag.snippet[:60] or flag.note[:60] or None,
                )
            result.append(flag)

        store.mutate(root, project_id, _do)
    return result[0]


@router.delete("/{flag_id}", status_code=204)
def delete_revision_flag(project_id: str, flag_id: str, root: Path = Depends(get_storage_root)) -> None:
    def _do(pf: ProjectFile) -> None:
        _find(pf.revisionFlags, flag_id)
        pf.revisionFlags = [f for f in pf.revisionFlags if f.id != flag_id]

    store.mutate(root, project_id, _do)
