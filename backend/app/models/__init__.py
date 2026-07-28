from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

from ..storage.schema import (
    OutlineNode,
    OutlineNodeKind,
    OutlineTree,
    PlotNode,
    PlotNodeKind,
    PlotTree,
    ProjectIndex,
    ProjectPriority,
    ProjectRoutine,
)


class CreateProjectRequest(BaseModel):
    title: str


class UpdateProjectRequest(BaseModel):
    title: Optional[str] = None
    wordCountTarget: Optional[int] = None
    bookCountTarget: Optional[int] = None
    chapterCountTarget: Optional[int] = None
    bookWordCountTarget: Optional[int] = None
    chapterWordCountTarget: Optional[int] = None
    priorities: Optional[list[ProjectPriority]] = None
    routines: Optional[list[ProjectRoutine]] = None
    outlineLevels: Optional[list[OutlineNodeKind]] = None
    plotLevels: Optional[list[PlotNodeKind]] = None
    readLevels: Optional[list[OutlineNodeKind]] = None


class ScheduleCompletionsRequest(BaseModel):
    completedItemIds: list[str]


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


class OutlineSnapshotDetail(BaseModel):
    snapshotId: str
    createdAt: datetime
    trigger: str
    nodes: list[OutlineNode]


class OutlineRevertResponse(BaseModel):
    safetySnapshotId: Optional[str] = None
    outline: OutlineTree


class PlotSnapshotDetail(BaseModel):
    snapshotId: str
    createdAt: datetime
    trigger: str
    nodes: list[PlotNode]


class PlotRevertResponse(BaseModel):
    safetySnapshotId: Optional[str] = None
    plot: PlotTree


class RestoreScrapRequest(BaseModel):
    parentId: str
    title: Optional[str] = None
