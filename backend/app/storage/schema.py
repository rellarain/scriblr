from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = 2


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Structural depth, shallowest first. Nesting is flexible: a node's parent
# may be any node of a strictly shallower kind, not necessarily the adjacent
# one (e.g. a scene may nest directly under a book, skipping arc/chapter).
OutlineNodeKind = Literal["book", "arc", "chapter", "act", "scene", "moment"]
OUTLINE_KIND_ORDER: list[OutlineNodeKind] = ["book", "arc", "chapter", "act", "scene", "moment"]

# Plot tree: category -> plotline -> plotpoint, mirroring the outline tree's
# flat-list-with-parentId shape. Plotpoints are the leaf/content unit and may
# be assigned to a moment in the outline tree.
PlotNodeKind = Literal["category", "plotline", "plotpoint"]
PLOT_KIND_ORDER: list[PlotNodeKind] = ["category", "plotline", "plotpoint"]


class ProjectManifest(BaseModel):
    outline: str = "outline/tree.json"
    plot: str = "brainstorm/plot.json"
    draftMoments: list[str] = Field(default_factory=list)
    revisionMoments: list[str] = Field(default_factory=list)


class ProjectPriority(BaseModel):
    id: str
    label: str
    order: int


class ProjectRoutine(BaseModel):
    id: str
    label: str
    # 0=Monday .. 6=Sunday
    daysOfWeek: list[int] = Field(default_factory=list)
    targetWordCount: Optional[int] = None


class ProjectSettings(BaseModel):
    wordCountTarget: Optional[int] = None
    bookCountTarget: Optional[int] = None
    bookWordCountTarget: Optional[int] = None
    chapterWordCountTarget: Optional[int] = None
    priorities: list[ProjectPriority] = Field(default_factory=list)
    routines: list[ProjectRoutine] = Field(default_factory=list)
    # Which structural levels this project uses, and in what order. Governs
    # what kind a new node gets when created via Tab (child)/Enter (sibling)
    # in the Plan UI -- new nodes no longer have their kind picked manually.
    # A subset of OUTLINE_KIND_ORDER/PLOT_KIND_ORDER, in the same relative
    # order; "book" and "category" are always included as the required roots.
    outlineLevels: list[OutlineNodeKind] = Field(default_factory=lambda: list(OUTLINE_KIND_ORDER))
    plotLevels: list[PlotNodeKind] = Field(default_factory=lambda: list(PLOT_KIND_ORDER))
    # Which levels render as visible headings in Read mode. Independent of
    # outlineLevels (which governs what kinds exist at all) -- "chapter" is
    # always included here since Read mode navigates at the chapter level.
    readLevels: list[OutlineNodeKind] = Field(default_factory=lambda: list(OUTLINE_KIND_ORDER))


class ProjectIndex(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    projectId: str
    title: str
    createdAt: datetime
    updatedAt: datetime
    settings: ProjectSettings = Field(default_factory=ProjectSettings)
    manifest: ProjectManifest = Field(default_factory=ProjectManifest)


FlagType = Literal["review", "edit", "add", "delete"]


class NodeFlag(BaseModel):
    type: FlagType
    note: str = ""


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
    # Flags this item for revision (review/edit/add/delete), with an optional note.
    flag: Optional[NodeFlag] = None
    # The following three fields are set only on "book" nodes -- stored
    # generically on OutlineNode by the same convention as draftRef (moment-
    # only) rather than a separate book model, since books are still plain
    # OutlineNodes structurally.
    color: Optional[str] = None
    chapterCountTarget: Optional[int] = None
    plotlineIds: list[str] = Field(default_factory=list)


class OutlineTree(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    nodes: list[OutlineNode] = Field(default_factory=list)


class PlotCustomFieldDef(BaseModel):
    id: str
    name: str


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
    # Set only on "category" nodes: custom field definitions that plotlines
    # within this category can fill in.
    customFieldDefs: list[PlotCustomFieldDef] = Field(default_factory=list)
    # Set only on "plotline" nodes: values for the parent category's custom
    # fields, keyed by PlotCustomFieldDef.id.
    customFieldValues: dict[str, str] = Field(default_factory=dict)
    # Set only on "plotline" nodes: keywords/phrases connected to this plotline.
    keywords: list[str] = Field(default_factory=list)
    # Flags this item for revision (review/edit/add/delete), with an optional note.
    flag: Optional[NodeFlag] = None


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


RevisionTrigger = Literal["manual"]


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


# ---------------------------------------------------------------------------
# Outline/Plot tree history: an automatic, git-like snapshot/diff/revert
# system for whole-tree structure, parallel to (but separate from) the
# manual, prose-focused RevisionSnapshot system above for draft moments.
# Nodes are stored as raw dicts rather than OutlineNode/PlotNode so one
# implementation can serve both tree types, which don't share a content
# field (synopsis vs body); API routes re-validate into the specific model.
# ---------------------------------------------------------------------------

TreeType = Literal["outline", "plot"]
TreeSnapshotTrigger = Literal["auto", "revert-safety"]


class TreeSnapshot(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    snapshotId: str
    treeType: TreeType
    createdAt: datetime
    trigger: TreeSnapshotTrigger = "auto"
    nodes: list[dict] = Field(default_factory=list)


class TreeSnapshotSummary(BaseModel):
    snapshotId: str
    treeType: TreeType
    createdAt: datetime
    trigger: TreeSnapshotTrigger
    nodeCount: int
    summary: str


class TreeDiffEntry(BaseModel):
    nodeId: str
    kind: Literal["added", "removed", "modified", "unchanged"]
    title: str
    changedFields: list[str] = Field(default_factory=list)


class TreeDiffResponse(BaseModel):
    fromSnapshotId: str
    toSnapshotId: str
    entries: list[TreeDiffEntry]


# ---------------------------------------------------------------------------
# Activity: a lightweight daily aggregate (feeds the calendar heatmap) plus a
# unified, reverse-chronological feed merging outline/plot tree snapshots and
# every moment's draft revision snapshots (feeds the activity log).
# ---------------------------------------------------------------------------


class DailyActivityEntry(BaseModel):
    date: str  # YYYY-MM-DD
    wordCountDelta: int = 0
    outlineSaves: int = 0
    plotSaves: int = 0
    draftRevisions: int = 0


class DailyActivityLog(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    days: dict[str, DailyActivityEntry] = Field(default_factory=dict)


ActivityEntryType = Literal["outline", "plot", "draft"]


class ActivityLogEntry(BaseModel):
    id: str
    type: ActivityEntryType
    createdAt: datetime
    label: str
    trigger: str
    momentId: Optional[str] = None
    wordCount: Optional[int] = None


class ActivityResponse(BaseModel):
    daily: DailyActivityLog
    log: list[ActivityLogEntry]


# ---------------------------------------------------------------------------
# Analytics: aggregated counts/word-counts, goal deltas, and outstanding
# flags across the whole project -- feeds both the Plan and Analytics panels.
# ---------------------------------------------------------------------------


class ProjectAnalyticsTotals(BaseModel):
    bookCount: int = 0
    chapterCount: int = 0
    sceneCount: int = 0
    momentCount: int = 0
    totalWordCount: int = 0


class ProjectAnalyticsGoals(BaseModel):
    wordCountTarget: Optional[int] = None
    bookCountTarget: Optional[int] = None
    bookWordCountTarget: Optional[int] = None
    chapterWordCountTarget: Optional[int] = None


class BookWordCount(BaseModel):
    nodeId: str
    title: str
    wordCount: int
    chapterCount: int
    chapterCountTarget: Optional[int] = None


class ChapterWordCount(BaseModel):
    nodeId: str
    title: str
    bookId: Optional[str] = None
    wordCount: int


class FlaggedNode(BaseModel):
    nodeId: str
    treeType: TreeType
    kind: str
    title: str
    flag: NodeFlag


class ProjectAnalytics(BaseModel):
    totals: ProjectAnalyticsTotals
    goals: ProjectAnalyticsGoals
    perBook: list[BookWordCount] = Field(default_factory=list)
    perChapter: list[ChapterWordCount] = Field(default_factory=list)
    flaggedNodes: list[FlaggedNode] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Schedule: which of a day's (frontend-generated) task-list item ids have
# been checked off. The item set itself is derived on the frontend from
# settings + analytics, not stored -- only completion state is persisted.
# ---------------------------------------------------------------------------


class ScheduleCompletionLog(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    days: dict[str, list[str]] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Scrap: a registry of draft content orphaned when its outline node was
# deleted. The draft shard and revision history are left untouched on disk --
# this registry only tracks which moment ids are currently orphaned, plus
# enough last-known ancestry (captured at deletion time, since it's
# unrecoverable afterward) to group them under a chapter/book in the UI.
# ---------------------------------------------------------------------------


class ScrapEntry(BaseModel):
    momentId: str
    title: str
    wordCount: int = 0
    orphanedAt: datetime
    lastChapterId: Optional[str] = None
    lastChapterTitle: Optional[str] = None
    lastBookId: Optional[str] = None
    lastBookTitle: Optional[str] = None


class ScrapRegistry(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    entries: list[ScrapEntry] = Field(default_factory=list)
