from typing import Literal, Optional

from pydantic import BaseModel

from ..storage.schema import OutlineNodeKind, OutlineTree, PlotNodeKind, PlotTree, ProjectIndex


class CreateProjectRequest(BaseModel):
    title: str


class UpdateProjectRequest(BaseModel):
    title: Optional[str] = None
    wordCountTarget: Optional[int] = None
    outlineLevels: Optional[list[OutlineNodeKind]] = None
    plotLevels: Optional[list[PlotNodeKind]] = None


class ProjectSummaryResponse(BaseModel):
    index: ProjectIndex
    outline: Optional[OutlineTree] = None
    plot: Optional[PlotTree] = None
    warnings: list[str] = []


class UpsertDraftRequest(BaseModel):
    outlineNodeId: str
    body: str


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
