from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = 2


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProjectManifest(BaseModel):
    outline: str = "outline/tree.json"
    plot: str = "brainstorm/plot.json"
    draftMoments: list[str] = Field(default_factory=list)
    revisionMoments: list[str] = Field(default_factory=list)


class ProjectSettings(BaseModel):
    wordCountTarget: Optional[int] = None


class ProjectIndex(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    projectId: str
    title: str
    createdAt: datetime
    updatedAt: datetime
    settings: ProjectSettings = Field(default_factory=ProjectSettings)
    manifest: ProjectManifest = Field(default_factory=ProjectManifest)


# Structural depth, shallowest first. Nesting is flexible: a node's parent
# may be any node of a strictly shallower kind, not necessarily the adjacent
# one (e.g. a scene may nest directly under a book, skipping arc/chapter).
OutlineNodeKind = Literal["book", "arc", "chapter", "scene", "moment"]
OUTLINE_KIND_ORDER: list[OutlineNodeKind] = ["book", "arc", "chapter", "scene", "moment"]


class OutlineNode(BaseModel):
    id: str
    kind: OutlineNodeKind
    parentId: Optional[str] = None
    order: int
    title: str
    synopsis: str = ""
    # Set only on "moment" nodes: the moment IS the writing/draftRef unit, so
    # this is always equal to the node's own id once a draft has been
    # created for it. Kept as an explicit field (rather than assuming
    # id === draftRef) so a moment can exist in the outline before any draft
    # content is written.
    draftRef: Optional[str] = None


class OutlineTree(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    nodes: list[OutlineNode] = Field(default_factory=list)


# Plot tree: category -> plotline -> plotpoint, mirroring the outline tree's
# flat-list-with-parentId shape. Plotpoints are the leaf/content unit and may
# be assigned to a moment in the outline tree.
PlotNodeKind = Literal["category", "plotline", "plotpoint"]
PLOT_KIND_ORDER: list[PlotNodeKind] = ["category", "plotline", "plotpoint"]


class PlotNode(BaseModel):
    id: str
    kind: PlotNodeKind
    parentId: Optional[str] = None
    order: int
    title: str
    # Plotpoint body text; unused for category/plotline nodes.
    body: str = ""
    # Set only on "plotpoint" nodes: the moment (outline node id) this
    # plotpoint is assigned to, if any.
    assignedMomentId: Optional[str] = None


class PlotTree(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    nodes: list[PlotNode] = Field(default_factory=list)


class DraftMoment(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    momentId: str
    outlineNodeId: str
    updatedAt: datetime
    wordCount: int = 0
    format: Literal["markdown"] = "markdown"
    body: str = ""


class CommentAnchor(BaseModel):
    type: Literal["text-offset"] = "text-offset"
    start: int
    end: int


CommentFlag = Optional[Literal["primary", "secondary"]]


class RevisionComment(BaseModel):
    id: str
    anchor: CommentAnchor
    body: str
    flag: CommentFlag = None
    createdAt: datetime


RevisionTrigger = Literal["manual", "session-close"]


class RevisionSnapshot(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    snapshotId: str
    momentId: str
    createdAt: datetime
    label: str = ""
    trigger: RevisionTrigger = "manual"
    body: str = ""
    wordCount: int = 0
    notes: list[RevisionComment] = Field(default_factory=list)


class RevisionSummary(BaseModel):
    snapshotId: str
    createdAt: datetime
    label: str
    trigger: RevisionTrigger
    wordCount: int
