from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from ..storage.schema import (
    MAX_LEVEL_HUE,
    PROJECT_TITLE_MAX,
    BookProgress,
    MIN_LEVEL_HUE,
    OutlineNode,
    OutlineNodeKind,
    OutlineTree,
    PlotNode,
    PlotNodeKind,
    PlotTree,
    ProjectIndex,
    ProjectPriority,
    ProjectRoutine,
    TimeSystem,
)


class CreateProjectRequest(BaseModel):
    title: str


class UpdateProjectRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=PROJECT_TITLE_MAX)
    wordCountTarget: Optional[int] = None
    bookCountTarget: Optional[int] = None
    bookWordCountTarget: Optional[int] = None
    chapterWordCountTarget: Optional[int] = None
    priorities: Optional[list[ProjectPriority]] = None
    routines: Optional[list[ProjectRoutine]] = None
    outlineLevels: Optional[list[OutlineNodeKind]] = None
    plotLevels: Optional[list[PlotNodeKind]] = None
    readLevels: Optional[list[OutlineNodeKind]] = None
    timeSystems: Optional[list[TimeSystem]] = None
    themeHue: Optional[int] = Field(default=None, ge=MIN_LEVEL_HUE, le=MAX_LEVEL_HUE)

    @field_validator("title")
    @classmethod
    def _title_is_a_name(cls, value: Optional[str]) -> Optional[str]:
        """A project's name is kept without the spaces round it, and cannot be blank."""
        if value is None:
            return None
        name = value.strip()
        if not name:
            raise ValueError("a project needs a name")
        return name


class ScheduleCompletionsRequest(BaseModel):
    completedItemIds: list[str]


class ProjectSummaryResponse(BaseModel):
    index: ProjectIndex
    outline: Optional[OutlineTree] = None
    plot: Optional[PlotTree] = None
    warnings: list[str] = []


class ProjectOverview(BaseModel):
    """What the shelves need of one project: its index, its outline nodes and the progress bars of its books."""

    index: ProjectIndex
    outline: list[OutlineNode] = []
    progress: dict[str, BookProgress] = {}


class UpsertDraftRequest(BaseModel):
    outlineNodeId: str
    body: str


class AddCommentRequest(BaseModel):
    momentId: str
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
