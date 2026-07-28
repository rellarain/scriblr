from typing import Literal, Optional

from pydantic import BaseModel

from ..storage.schema import OutlineTree, ProjectIndex


class CreateProjectRequest(BaseModel):
    title: str


class UpdateProjectRequest(BaseModel):
    title: Optional[str] = None
    wordCountTarget: Optional[int] = None


class ProjectSummaryResponse(BaseModel):
    index: ProjectIndex
    outline: Optional[OutlineTree] = None
    warnings: list[str] = []


class UpsertDraftRequest(BaseModel):
    outlineNodeId: str
    body: str


class CreateNoteRequest(BaseModel):
    body: str
    tags: list[str] = []
    linkedOutlineNodeId: Optional[str] = None


class UpdateNoteRequest(BaseModel):
    body: Optional[str] = None
    tags: Optional[list[str]] = None
    linkedOutlineNodeId: Optional[str] = None


class CreateSnapshotRequest(BaseModel):
    label: str = ""


class AddCommentRequest(BaseModel):
    body: str
    anchorStart: int
    anchorEnd: int
    flag: Optional[Literal["primary", "secondary"]] = None


class UpdateCommentRequest(BaseModel):
    body: Optional[str] = None
    flag: Optional[Literal["primary", "secondary"]] = None


class DiffOp(BaseModel):
    op: Literal["equal", "insert", "delete"]
    text: str


class DiffResponse(BaseModel):
    ops: list[DiffOp]
