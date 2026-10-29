from datetime import datetime, timezone
from typing import Any, Literal, Optional

import colorsys
import re

from pydantic import BaseModel, Field, PrivateAttr, field_validator, model_validator

SCHEMA_VERSION = 2
# The version of the project.json file as a whole (ProjectFile.schemaVersion), which a build refuses to write over when the file is newer than it
# knows (see project_store). 2: one file per project; 3: plot clusters; 4: tree history as sparse keyframes and deltas (tree_pack);
# 5: a book's paragraph indent in spaces (PreviewFormat.paragraphIndentSpaces) instead of em.
PROJECT_FILE_VERSION = 5


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# A level colour (OutlineNode.themeHue, ProjectSettings.themeHue, PlotNode.hue) is a hue in degrees, 0 to 360
# (0 and 360 are both red; mirrors the frontend's theme/bookColors.ts). Every colour has the same saturation and
# lightness (the active time-of-day zone's own, kept readable for the hue). Earlier schemes are converted once on
# load (see project_store): hueScheme 1 held a plain hue 0-360 plus swatches 361-364 (brown, black, gray, white);
# hueScheme 2 packed a brightness in as well and had a desaturated band (-360..0) and neutral stops (+-721..723);
# hueScheme 3 kept the brightness only (1..360 base, 361..720 lighter, -720..-361 darker). Neither the neutrals
# nor the brightnesses exist any more: a lighter or darker colour is now its plain hue.
MIN_LEVEL_HUE = 0
MAX_LEVEL_HUE = 360
# The longest name a project can be given when it is renamed (the Writer's Name field stops at the same length).
PROJECT_TITLE_MAX = 100
HUE_SCHEME = 4

_HEX_COLOR = re.compile(r"^#?([0-9a-fA-F]{6})$")


def hex_to_hue(value: Optional[str]) -> Optional[int]:
    """Hue (0-359 degrees) of a #rrggbb colour, or None if it is not one."""
    match = _HEX_COLOR.match((value or "").strip())
    if not match:
        return None
    digits = match.group(1)
    r, g, b = (int(digits[i:i + 2], 16) / 255 for i in (0, 2, 4))
    hue, _lightness, _saturation = colorsys.rgb_to_hls(r, g, b)
    return round(hue * 360) % 360


# Structural depth, shallowest first. Nesting is flexible: a node's parent
# may be any node of a strictly shallower kind, not necessarily the adjacent
# one (e.g. a scene may nest directly under a book, skipping arc/chapter).
# "series" is optional (a book need not have one); "book" and "chapter" are
# the only two required/non-toggleable levels (see ProjectSettings.outlineLevels).
OutlineNodeKind = Literal["series", "book", "arc", "chapter", "act", "scene", "moment"]
OUTLINE_KIND_ORDER: list[OutlineNodeKind] = ["series", "book", "arc", "chapter", "act", "scene", "moment"]
REQUIRED_OUTLINE_LEVELS: list[OutlineNodeKind] = ["book", "chapter"]

# Plot tree: category -> subcategory -> cluster -> plotline -> plotpoint, mirroring the
# outline tree's flat-list-with-parentId shape. Plotpoints are the leaf/
# content unit and may be assigned to a moment (and, optionally, a specific
# paragraph within that moment's draft) in the outline tree.
PlotNodeKind = Literal["category", "subcategory", "cluster", "plotline", "plotpoint"]
PLOT_KIND_ORDER: list[PlotNodeKind] = ["category", "subcategory", "cluster", "plotline", "plotpoint"]


class ProjectManifest(BaseModel):
    outline: str = "outline/tree.json"
    plot: str = "brainstorm/plot.json"
    draftMoments: list[str] = Field(default_factory=list)
    revisionChapters: list[str] = Field(default_factory=list)


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


# A project's time systems: how a scene's Time is structured and ordered. A
# system is an ordered list of units, largest to smallest (e.g. Year > Month >
# Day > Time of day, or Week > Day). A unit is a number ("Day"), a named list
# ("Month": January..December, "Season") or a clock time (minutes after
# midnight). A scene stores one value per unit (any may be absent) and scenes
# sort by comparing units in order. Standard date & time is the default.
TimeUnitKind = Literal["number", "named", "clock"]

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


class TimeUnit(BaseModel):
    id: str
    label: str
    kind: TimeUnitKind = "number"
    # Only for kind == "named": the names, in order (a value is an index into them).
    names: list[str] = Field(default_factory=list)


class TimeSystem(BaseModel):
    id: str
    name: str
    units: list[TimeUnit] = Field(default_factory=list)


def default_time_systems() -> list[TimeSystem]:
    return [
        TimeSystem(
            id="standard",
            name="Standard date & time",
            units=[
                TimeUnit(id="year", label="Year", kind="number"),
                TimeUnit(id="month", label="Month", kind="named", names=list(MONTH_NAMES)),
                TimeUnit(id="day", label="Day", kind="number"),
                TimeUnit(id="time", label="Time", kind="clock"),
            ],
        )
    ]


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
    # order; "book" and "chapter" (see REQUIRED_OUTLINE_LEVELS) and "category"
    # are always included as the required levels.
    outlineLevels: list[OutlineNodeKind] = Field(default_factory=lambda: list(OUTLINE_KIND_ORDER))
    plotLevels: list[PlotNodeKind] = Field(default_factory=lambda: list(PLOT_KIND_ORDER))
    # Which levels render as visible headings in Read mode. Independent of
    # outlineLevels (which governs what kinds exist at all) -- "chapter" is
    # always included here since Read mode navigates at the chapter level.
    readLevels: list[OutlineNodeKind] = Field(default_factory=lambda: list(OUTLINE_KIND_ORDER))
    # How scenes' Time is structured (see TimeSystem). Books pick one by id.
    timeSystems: list[TimeSystem] = Field(default_factory=default_time_systems)
    # The project's own colour (a hue code, see MIN_LEVEL_HUE), the root of the Writer's level colours:
    # series sit within 60 degrees of it, books anywhere, arcs within 60 of their book and
    # chapters within 60 of their arc (the OutlineNode.themeHue of each). None = the
    # active theme's own colour.
    themeHue: Optional[int] = Field(default=None, ge=MIN_LEVEL_HUE, le=MAX_LEVEL_HUE)


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


# How wide one space is in each of the preview's font families, as a fraction of the font size: the paragraph indent is a number of
# spaces, drawn as that many times this width. The frontend (previewFormat.ts, SPACE_EM) has the same table.
SPACE_EM = {"serif": 0.25, "sans": 0.28, "mono": 0.6}
MAX_INDENT_SPACES = 16


class PreviewFormat(BaseModel):
    """How a book's chapters are laid out in the Draft level's preview (all optional: the defaults
    are the preview's own look). Sizes are bounded so a bad value cannot make the page unreadable."""

    fontFamily: Literal["serif", "sans", "mono"] = "serif"
    fontSize: int = Field(default=17, ge=10, le=32)  # px
    fontStyle: Literal["normal", "italic"] = "normal"
    fontWeight: Literal["normal", "bold"] = "normal"
    textAlign: Literal["left", "justify"] = "justify"
    lineSpacing: float = Field(default=1.65, ge=1.0, le=3.0)  # multiple of the font size
    paragraphIndentSpaces: int = Field(default=0, ge=0, le=MAX_INDENT_SPACES)  # the width of this many spaces in the font
    paragraphSpacing: float = Field(default=0.0, ge=0.0, le=3.0)  # em between paragraphs

    @model_validator(mode="before")
    @classmethod
    def _indent_in_em(cls, data):
        """Before format 5 the indent was `paragraphIndent`, in em (0 to 4): it becomes the same width in spaces of the book's font."""
        if isinstance(data, dict) and "paragraphIndent" in data:
            data = dict(data)
            em = data.pop("paragraphIndent")
            if "paragraphIndentSpaces" not in data:
                width = SPACE_EM.get(data.get("fontFamily", "serif"), SPACE_EM["serif"])
                # A value that is not a number is passed on as it is, for the field to refuse.
                data["paragraphIndentSpaces"] = int(em / width + 0.5) if isinstance(em, (int, float)) and not isinstance(em, bool) else em
        return data


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
    # The Writer's level colours: `themeHue` is also set on series, arcs and chapters (each
    # within 60 degrees of its parent's hue; none = the parent's hue). On a book it is
    # the book's one colour (0-360): the cover / spine colour, and the tint of the book's
    # editors' surfaces and active items. A legacy hex `color` becomes the theme hue.
    # (Books used to have a second, accent hue; files that still carry one load fine and
    # drop it when next saved.)
    themeHue: Optional[int] = Field(default=None, ge=MIN_LEVEL_HUE, le=MAX_LEVEL_HUE)
    chapterCountTarget: Optional[int] = None
    plotlineIds: list[str] = Field(default_factory=list)
    # Book's total word-count ambition -- drives bookshelf spine width/fill.
    wordCountGoal: Optional[int] = None
    # Set only on "book" nodes: which of the project's time systems this
    # book's scenes use (None = the project's first system).
    timeSystemId: Optional[str] = None
    # Set only on "book" nodes: the layout of its chapters in the preview (None = the defaults).
    previewFormat: Optional[PreviewFormat] = None
    # Set only on "scene" nodes: a scene is described by where and when it
    # happens and what happens, rather than by a title/synopsis. Same
    # convention as the book-only fields above (generic OutlineNode, unused
    # elsewhere). `timeValue` is one number per unit of the book's time system
    # (clock = minutes after midnight, named = index into the names); units
    # left blank are absent. The UI highlights whichever of these changed from
    # the previous scene in outline order. (The old free-text `time` is gone:
    # it is dropped when a tree is next saved.)
    location: str = ""
    timeValue: dict[str, int] = Field(default_factory=dict)
    action: str = ""
    # When the node was created (None on nodes made before this existed: the UI
    # falls back to the project's own creation date).
    createdAt: Optional[datetime] = None
    # Set only on the one "moment" placed directly under a chapter for free
    # drafting (writing without acts or scenes). Never numbered; sorts first.
    freeDraft: bool = False

    @model_validator(mode="after")
    def _theme_hue_from_legacy_color(self) -> "OutlineNode":
        # Books picked one of 20 hex colours before hues existed: keep the colour
        # family by turning the hex into the theme hue.
        if self.themeHue is None:
            hue = hex_to_hue(self.color)
            if hue is not None:
                # A base hue (0 degrees is 360 here: 0 itself is not a hue code).
                self.themeHue = hue or 360
        return self


class OutlineTree(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    nodes: list[OutlineNode] = Field(default_factory=list)


# The longest name of a fieldset, and the most a node can have (the Writer's Plot editor and the presets console stop at the same limits).
PLOT_FIELDSET_NAME_MAX = 30
PLOT_MAX_FIELDSETS = 20
PLOT_MAX_PLACEMENTS = 100
# The longest label of an option of a choice field, and the most a field can have.
PLOT_OPTION_LABEL_MAX = 30
PLOT_MAX_OPTIONS = 20
# The kinds of field other than the usual one (a list of plotpoints, which is what a field without a kind is).
PlotFieldKind = Literal["multi", "dropdown", "text"]
_FIELD_KINDS = ("multi", "dropdown", "text")


class PlotFieldOption(BaseModel):
    """One choice of a multi-select or dropdown field. An answer (a plotpoint with this `optionId`) is titled with its label."""

    id: str
    label: str = ""

    @field_validator("label", mode="before")
    @classmethod
    def _cut_label(cls, value: Any) -> Any:
        # Cut, not refused: a label too long must not set the whole plot aside.
        return value[:PLOT_OPTION_LABEL_MAX] if isinstance(value, str) else value


class PlotCustomFieldDef(BaseModel):
    id: str
    name: str
    # The fieldset (a PlotFieldSet of the same node) this field is listed under; None = a loose field, outside any set.
    setId: Optional[str] = None
    # What the field holds. None (or "points") = a list of plotpoints, the usual field. "multi" = any of its options, "dropdown" = one of
    # them, "text" = a short text; the answer of each plotline (and of the node that defines the field) is then a plotpoint of that node.
    # A kind this version does not know reads as the usual one, so a field never sets the whole plot aside.
    kind: Optional[PlotFieldKind] = None
    # The choices of a "multi" or "dropdown" field, in order (empty otherwise).
    options: list[PlotFieldOption] = Field(default_factory=list)

    @field_validator("kind", mode="before")
    @classmethod
    def _known_kind(cls, value: Any) -> Any:
        return value if value in _FIELD_KINDS else None

    @field_validator("options", mode="before")
    @classmethod
    def _few_distinct_options(cls, value: Any) -> Any:
        # The first of two options with one id stays; the surplus past the limit is cut, not refused.
        if not isinstance(value, list):
            return value
        seen: set[Any] = set()
        kept: list[Any] = []
        for item in value:
            key = item.get("id") if isinstance(item, dict) else getattr(item, "id", None)
            if key in seen:
                continue
            seen.add(key)
            kept.append(item)
        return kept[:PLOT_MAX_OPTIONS]


class PlotFieldSet(BaseModel):
    """A named group of the fields a node defines. A set shows on every plotline under the node, as its fields do."""

    id: str
    name: str = ""

    @field_validator("name", mode="before")
    @classmethod
    def _cut_name(cls, value: Any) -> Any:
        # Cut, not refused: a name too long must not set the whole plot aside.
        return value[:PLOT_FIELDSET_NAME_MAX] if isinstance(value, str) else value


PlotAwareness = Literal["front", "back", "mid", "off"]


class PlotPlacement(BaseModel):
    """One place a plotpoint (a value of a field) is put in the outline: a chapter, act, scene or moment. A plotpoint can have many, each
    standing alone (its own awareness and paragraph); it is placed once it has at least one."""

    id: str
    # The outline node it is put on (the backend treats it as an opaque id).
    targetId: str
    # Which paragraph (0-indexed, split on blank lines) of the moment's draft this placement is anchored to. Like CommentAnchor below, a
    # fragile, unreconciled anchor -- clamp out-of-range indices to the last paragraph rather than erroring.
    paragraphIndex: Optional[int] = None
    # Set only on a placement on a moment: what the audience and the characters know of it. front = both, back = the audience only, mid =
    # the characters only, off = neither.
    awareness: Optional[PlotAwareness] = None


class PlotNode(BaseModel):
    id: str
    kind: PlotNodeKind
    parentId: Optional[str] = None
    order: int
    title: str
    # The description: a plotpoint's body text, and the description of a category, subcategory or cluster (a plot preset's description fills it).
    body: str = ""
    # Set only on "plotpoint" nodes: the moment (outline node id) this
    # plotpoint is assigned to, if any.
    assignedMomentId: Optional[str] = None
    # Set only on "plotpoint" nodes, and only meaningful alongside
    # assignedMomentId: which paragraph (0-indexed, split on blank lines)
    # within that moment's draft body this plotpoint is anchored to. Like
    # CommentAnchor below, this is a fragile, unreconciled anchor -- clamp
    # out-of-range indices to the last paragraph rather than erroring.
    # (Both are the way a plotpoint was placed once, before it could be placed many times: they are read into `placements` when a plot
    # is loaded, and stored empty.)
    assignedParagraphIndex: Optional[int] = None
    # Set only on "plotpoint" nodes that are a live mirror of a plotline's
    # custom field value: the PlotCustomFieldDef.id it mirrors. Used to find
    # the existing mirror plotpoint idempotently on every keystroke rather
    # than creating duplicates. None for ordinary, manually-created plotpoints.
    sourceFieldId: Optional[str] = None
    # Set only on "category", "subcategory" or "cluster" nodes: custom field definitions
    # that plotlines within this category/subcategory/cluster can fill in.
    customFieldDefs: list[PlotCustomFieldDef] = Field(default_factory=list)
    # The fieldsets this node defines (on a category, subcategory, cluster or plotline), in order: named groups its fields can be listed
    # under (PlotCustomFieldDef.setId). Absent in a plot saved before there were fieldsets.
    customFieldSets: list[PlotFieldSet] = Field(default_factory=list, max_length=PLOT_MAX_FIELDSETS)
    # Set only on "plotline" nodes: values for the parent category's custom
    # fields, keyed by PlotCustomFieldDef.id.
    customFieldValues: dict[str, str] = Field(default_factory=dict)
    # Keywords/phrases connected to this node (set on a category, subcategory, cluster or plotline).
    keywords: list[str] = Field(default_factory=list)
    # Flags this item for revision (review/edit/add/delete), with an optional note.
    flag: Optional[NodeFlag] = None
    # Set only on "category", "subcategory" and "cluster" nodes: the colour hue (0-360). A
    # category is drawn with the theme's saturation/brightness, a subcategory or cluster with
    # the accent's and kept within 60 degrees of its category's hue. None = the
    # app theme's hue (categories) or the parent's hue (subcategories, clusters).
    hue: Optional[int] = Field(default=None, ge=MIN_LEVEL_HUE, le=MAX_LEVEL_HUE)
    # Set only on "plotpoint" nodes, which are the values of fields: the
    # PlotCustomFieldDef.id (defined on a category, subcategory, cluster or plotline)
    # this value belongs to. None on plotpoints saved before fields had values;
    # the client moves those into a "Default" plotline field on load.
    fieldId: Optional[str] = None
    # Set only on a plotpoint that is a plotline's reference to a value defined
    # on its category or subcategory: the id of that original value. Its title
    # and body are then read from the original. Each plotline assigns its own
    # reference to its own chapters.
    refId: Optional[str] = None
    # Set only on a plotpoint placed on a moment, before placements had an awareness each; read into the placement like assignedMomentId.
    awareness: Optional[PlotAwareness] = None
    # Set only on a plotpoint that is an answer to a "multi" or "dropdown" field: the option (PlotFieldOption.id of that field) it answers
    # with. Its title is the option's label. (The answer to a "text" field is a plotpoint whose title is the text.)
    optionId: Optional[str] = None
    # Set only on "plotpoint" nodes: where the value is put in the outline, in the order they were made. Up to PLOT_MAX_PLACEMENTS, at most one
    # to a target (the first wins; a surplus is cut, not refused, so one odd node cannot set the whole plot aside). Placed = at least one.
    placements: list[PlotPlacement] = Field(default_factory=list)

    @field_validator("placements", mode="before")
    @classmethod
    def _one_to_a_target(cls, value: Any) -> Any:
        if not isinstance(value, list):
            return value
        seen: set[Any] = set()
        kept: list[Any] = []
        for item in value:
            target = item.get("targetId") if isinstance(item, dict) else getattr(item, "targetId", None)
            if target in seen:
                continue
            seen.add(target)
            kept.append(item)
        return kept[:PLOT_MAX_PLACEMENTS]

    @model_validator(mode="after")
    def _single_placement_to_placements(self) -> "PlotNode":
        # A plotpoint saved before values could be placed many times holds its one place in assignedMomentId (with its paragraph and
        # awareness): it becomes the first placement, and the old fields are left empty. Idempotent.
        target = self.assignedMomentId
        if target and len(self.placements) < PLOT_MAX_PLACEMENTS and not any(p.targetId == target for p in self.placements):
            self.placements = [
                PlotPlacement(id=f"{self.id}@{target}", targetId=target, paragraphIndex=self.assignedParagraphIndex, awareness=self.awareness),
                *self.placements,
            ]
        self.assignedMomentId = None
        self.assignedParagraphIndex = None
        self.awareness = None
        return self


class PlotTree(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    nodes: list[PlotNode] = Field(default_factory=list)


# Per-moment draft shape -- still the API response/request unit for a single
# moment's prose (GET/PUT .../draft/chapter/{chapterId}/moment/{momentId}),
# even though storage on disk moved to one shared file per chapter (see
# DraftChapter below). Keeping this as the per-moment API shape means
# existing per-moment autosave/analytics/plotpoint-anchoring logic needs no
# redesign, only a retargeted endpoint.
class DraftMoment(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    momentId: str
    outlineNodeId: str
    updatedAt: datetime
    wordCount: int = 0
    format: Literal["markdown"] = "markdown"
    body: str = ""


class DraftChapterMoment(BaseModel):
    body: str = ""
    wordCount: int = 0
    updatedAt: datetime


# Storage shape for draft/<chapter-id>.json -- one file per chapter, keyed by
# moment, replacing the old one-file-per-moment layout. Moments stay
# individually addressable inside the map so per-moment autosave, analytics,
# and plotpoint-paragraph anchoring keep working against a single entry.
class DraftChapter(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    chapterId: str
    updatedAt: datetime
    moments: dict[str, DraftChapterMoment] = Field(default_factory=dict)


class CommentAnchor(BaseModel):
    type: Literal["text-offset"] = "text-offset"
    # Which moment (within the chapter-scoped revision snapshot) this
    # comment's start/end offsets are measured against -- necessary now that
    # a snapshot spans a whole chapter's moments rather than a single body.
    momentId: str
    start: int
    end: int


CommentFlag = Optional[Literal["primary", "secondary"]]


class RevisionComment(BaseModel):
    id: str
    anchor: CommentAnchor
    body: str
    flag: CommentFlag = None
    createdAt: datetime


# "manual" = floppy-disk button, no naming step, label is always the save's
# formatted date/time. "auto" = fires after 5 minutes of inactivity on a
# chapter's page and overwrites a single rolling slot per chapter rather than
# appending -- at most one "auto"-trigger snapshot exists per chapter at a
# time. (Reintroduced deliberately -- unlike the "session-close" trigger
# value removed earlier as dead code, "auto" here has real, specified
# behavior and is actually wired up.)
# "session": one entry per editing session, kept up to date by every draft save (see storage/draft_sessions.py).
RevisionTrigger = Literal["manual", "auto", "session"]


# Snapshots moved from per-moment to per-chapter, consistent with drafts
# becoming chapter-scoped (DraftChapter above) -- a snapshot captures a
# chapter's whole moments-map at once.
class RevisionSnapshot(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    snapshotId: str
    chapterId: str
    createdAt: datetime
    # When a "session" entry was last brought up to date by a save (the session's end so far).
    updatedAt: Optional[datetime] = None
    label: str = ""
    trigger: RevisionTrigger = "manual"
    moments: dict[str, str] = Field(default_factory=dict)  # momentId -> body, at snapshot time
    wordCount: int = 0
    notes: list[RevisionComment] = Field(default_factory=list)


class PublicationSection(BaseModel):
    momentId: str
    body: str = ""


# One publication of a chapter: a frozen copy of its draft in outline order.
# Only the newest few are kept per chapter (see project_store.MAX_PUBLICATIONS).
class Publication(BaseModel):
    id: str
    chapterId: str
    publishedAt: datetime
    wordCount: int = 0
    title: str = ""
    sections: list[PublicationSection] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Publishing a book: its listing in the Reader's library (metadata, numbered editions, who is invited at which
# level), and the author's footnotes and flagged passages on a chapter's sentences. A sentence is addressed by its
# paragraph and sentence number in the chapter (the Writer's preview splits text the same way the Reader does).
# ---------------------------------------------------------------------------

BookTypeName = Literal["novel", "novella", "essays", "magazine", "article"]
ReaderLevelName = Literal["alpha", "delta", "beta", "omega"]
FlagClassName = Literal["hidden", "marked", "highlight", "spoiler"]


class BookFlagMeta(BaseModel):
    """A content flag the author puts on a book: a warning with its details, and the class it has by default (a reader may change it)."""

    key: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=60)
    detail: str = Field(default="", max_length=500)
    defaultClass: FlagClassName = "marked"


class BookMeta(BaseModel):
    type: BookTypeName = "novel"
    blurb: str = Field(default="", max_length=2000)
    genres: list[str] = Field(default_factory=list, max_length=8)
    tags: list[str] = Field(default_factory=list, max_length=12)
    tropes: list[str] = Field(default_factory=list, max_length=12)
    flags: list[BookFlagMeta] = Field(default_factory=list, max_length=12)
    buyPriceCents: int = Field(default=900, ge=100, le=10000)
    # A cover colour of the book's own; none uses the book's level colour.
    coverHue: Optional[int] = Field(default=None, ge=0, le=360)


class EditionFootnote(BaseModel):
    id: str
    key: str
    title: str
    text: str


class EditionFlagPassage(BaseModel):
    key: str
    flagKey: str


class EditionChapter(BaseModel):
    chapterId: str
    n: int
    title: str
    words: int = 0
    paragraphs: list[str] = Field(default_factory=list)
    footnotes: list[EditionFootnote] = Field(default_factory=list)
    flags: list[EditionFlagPassage] = Field(default_factory=list)


class BookEdition(BaseModel):
    """One numbered edition: a frozen copy of the chapters that were published when the book was, with their footnotes and flagged passages."""

    n: int
    publishedAt: datetime
    wordCount: int = 0
    chapters: list[EditionChapter] = Field(default_factory=list)


class BookListing(BaseModel):
    # In the library for sale and loan. Unlisting keeps the editions: copies readers own and loans already made go on working.
    listed: bool = False
    editions: list[BookEdition] = Field(default_factory=list)
    meta: BookMeta = Field(default_factory=BookMeta)
    # Reader id -> the level the author invited them to (alpha, delta or beta). "me" is this reader account.
    invites: dict[str, ReaderLevelName] = Field(default_factory=dict)


class AuthorFootnote(BaseModel):
    id: str
    paragraph: int = Field(ge=0)
    sentence: int = Field(ge=0)
    title: str = Field(max_length=120)
    text: str = Field(default="", max_length=2000)
    published: bool = True


class AuthorFlagPassage(BaseModel):
    id: str
    paragraph: int = Field(ge=0)
    sentence: int = Field(ge=0)
    flagKey: str


class ChapterAuthorNotes(BaseModel):
    footnotes: list[AuthorFootnote] = Field(default_factory=list, max_length=60)
    flags: list[AuthorFlagPassage] = Field(default_factory=list, max_length=60)


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
    # Outside the store `nodes` is the complete tree. Stored (see tree_pack): a keyframe holds its nodes sparse; a delta holds `base` (the
    # snapshot it is against), `ids` (every node id, in order) and `changed` (the sparse nodes that are new or differ from the base's).
    nodes: list[dict] = Field(default_factory=list)
    base: Optional[str] = None
    ids: Optional[list[str]] = None
    changed: list[dict] = Field(default_factory=list)


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


ActivityEntryType = Literal["outline", "plot", "draft", "settings"]


class ActivityLogEntry(BaseModel):
    id: str
    type: ActivityEntryType
    createdAt: datetime
    label: str
    trigger: str
    # Set for "draft" entries -- which chapter's revision this is (drafts/
    # revisions are chapter-scoped; see DraftChapter/RevisionSnapshot).
    chapterId: Optional[str] = None
    wordCount: Optional[int] = None


# A change to settings (the project's time systems and colour, or the user's theme and UI), kept with the value it replaced so it can be
# undone. The log keeps a short history (SETTINGS_LOG_DAYS days, at most SETTINGS_LOG_MAX entries).
SETTINGS_LOG_DAYS = 7
SETTINGS_LOG_MAX = 100
SettingsLogKind = Literal["theme", "ui", "project"]


class SettingsLogEntry(BaseModel):
    id: str
    createdAt: datetime = Field(default_factory=utcnow)
    kind: SettingsLogKind
    label: str
    # The settings as they were before the change: the fields that kind covers, as JSON.
    before: dict[str, Any] = Field(default_factory=dict)


# One progress bar of a book's spine: `done` of `total` (a total of 0 = nothing to measure against yet).
class Measure(BaseModel):
    done: int = 0
    total: int = 0


class BookProgress(BaseModel):
    plotting: Measure = Field(default_factory=Measure)  # the book's plotlines that have plotpoints
    outlining: Measure = Field(default_factory=Measure)  # chapters with acts, scenes or moments below them
    planning: Measure = Field(default_factory=Measure)  # synopsis, word-count goal, chapter target and time system set
    assignment: Measure = Field(default_factory=Measure)  # plotpoints placed on a moment
    revision: Measure = Field(default_factory=Measure)  # chapters with a manual revision
    published: Measure = Field(default_factory=Measure)  # chapters published at least once
    words: Measure = Field(default_factory=Measure)  # draft words against the word-count goal (total 0 = no goal)


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
    # Every outline node's draft word count (a moment's own; any node above it, the sum of its moments),
    # keyed by node id: nodes with no draft text are absent.
    nodeWordCounts: dict[str, int] = Field(default_factory=dict)
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


# ---------------------------------------------------------------------------
# Presets: a global (not project-scoped) catalog of ready-made plot categories
# for the Plot sidebar's "+ Preset" selector, configured in the admin panel
# (Configuration > Plot). A preset is a category with its description,
# keywords, fields, and subcategories and clusters (each with the same).
# Every preset has a DRAFT (what the admin edits; autosaved) and, once
# published, a frozen PUBLISHED copy (what the Writer's selector reads) plus
# the earlier published versions. Adding a preset to a project is a plain copy:
# nothing here is ever linked to, or changed in, a project.
# Lives at %APPDATA%\Scriblr\presets.json, a sibling of the projects/
# directory. Its own schema version, independent of SCHEMA_VERSION, since it's
# an unrelated shard. Version 1 held only a name and field names per preset.
# ---------------------------------------------------------------------------

PRESETS_SCHEMA_VERSION = 2
# The same limits as the Plot editor (frontend plotFields.ts: TITLE_MAX, FIELD_NAME_MAX, BODY_MAX), so a preset never holds anything the
# Writer would cut off, and generous caps on counts so the file stays small.
PRESET_NAME_MAX = 50
PRESET_FIELD_MAX = 30
PRESET_DESCRIPTION_MAX = 255
PRESET_KEYWORD_MAX = 50
PRESET_MAX_PRESETS = 200
PRESET_MAX_FIELDS = 100
PRESET_MAX_KEYWORDS = 50
PRESET_MAX_CHILDREN = 100
PRESET_HISTORY_MAX = 10
_PRESET_ID = r"^[A-Za-z0-9_-]{1,80}$"


class PresetChoiceField(BaseModel):
    """A field of a preset that is not a plain list of plotpoints: it becomes a multi-select, dropdown or short-text field. (A plain field is
    just its name.) The options of a choice field are labels; the new field gets an id for each."""

    name: str
    kind: PlotFieldKind
    options: list[str] = Field(default_factory=list, max_length=PLOT_MAX_OPTIONS)

    @field_validator("name", mode="before")
    @classmethod
    def _trim_name(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("name")
    @classmethod
    def _name_fits(cls, value: str) -> str:
        if len(value) > PRESET_FIELD_MAX:
            raise ValueError(f"a field name is over {PRESET_FIELD_MAX} characters")
        return value

    @field_validator("options")
    @classmethod
    def _clean_options(cls, value: list[str]) -> list[str]:
        # No two options differ only by case (the Plot editor refuses a repeat the same way).
        out: list[str] = []
        for text in _clean_list(value, PLOT_OPTION_LABEL_MAX, "option", unique=True):
            if text.casefold() not in {o.casefold() for o in out}:
                out.append(text)
        return out

    @model_validator(mode="after")
    def _only_choices_have_options(self) -> "PresetChoiceField":
        if self.kind == "text":
            self.options = []
        return self


# A field of a preset: its name (a plain field) or a choice field.
PresetField = str | PresetChoiceField


def _clean_field_entries(values: list[PresetField]) -> list[PresetField]:
    """The same as _clean_list for field names, for fields that can also be choice fields: a blank one is dropped, a repeat is allowed."""
    out: list[PresetField] = []
    for value in values:
        if isinstance(value, str):
            text = value.strip()
            if not text:
                continue
            if len(text) > PRESET_FIELD_MAX:
                raise ValueError(f"a field name is over {PRESET_FIELD_MAX} characters")
            out.append(text)
        elif value.name:
            out.append(value)
    return out


def _clean_list(values: list[str], limit: int, what: str, *, unique: bool) -> list[str]:
    """Trim each entry, drop the blank ones (and, for keywords, the repeats), and refuse one that is over `limit`."""
    out: list[str] = []
    for value in values:
        text = value.strip()
        if not text:
            continue
        if len(text) > limit:
            raise ValueError(f"a {what} is over {limit} characters")
        if unique and text in out:
            continue
        out.append(text)
    return out


class PresetFieldset(BaseModel):
    """A named group of field names on a preset's node: it becomes a fieldset (PlotFieldSet) holding those fields."""

    name: str = Field(default="", max_length=PLOT_FIELDSET_NAME_MAX)
    fields: list[PresetField] = Field(default_factory=list, max_length=PRESET_MAX_FIELDS)

    @field_validator("name", mode="before")
    @classmethod
    def _trim_name(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("fields")
    @classmethod
    def _clean_fields(cls, value: list[PresetField]) -> list[PresetField]:
        return _clean_field_entries(value)


class _PresetNode(BaseModel):
    """What a category, subcategory and cluster of a preset share. A name may be blank in a draft (a new, unfinished card) but not when published."""

    name: str = Field(default="", max_length=PRESET_NAME_MAX)
    description: str = Field(default="", max_length=PRESET_DESCRIPTION_MAX)
    keywords: list[str] = Field(default_factory=list, max_length=PRESET_MAX_KEYWORDS)
    # Field names; each becomes a field (PlotCustomFieldDef) on the node made from this one. Order is kept; a repeat is allowed. A field that is
    # not a plain list of plotpoints (a multi-select, dropdown or short text) is a PresetChoiceField instead of a name.
    fields: list[PresetField] = Field(default_factory=list, max_length=PRESET_MAX_FIELDS)
    # Named groups of field names (each becomes a fieldset on that node, holding those fields). `fields` above are the loose ones, listed
    # before the sets. Absent in a preset saved before there were fieldsets.
    fieldsets: list[PresetFieldset] = Field(default_factory=list, max_length=PLOT_MAX_FIELDSETS)

    @field_validator("name", "description", mode="before")
    @classmethod
    def _trim_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("fieldsets")
    @classmethod
    def _clean_fieldsets(cls, value: list[PresetFieldset]) -> list[PresetFieldset]:
        # A set with no name and no fields is an unfinished card: left out. A set that has fields but no name is kept (a draft).
        return [s for s in value if s.name or s.fields]

    @model_validator(mode="after")
    def _fields_in_all(self) -> "_PresetNode":
        total = len(self.fields) + sum(len(s.fields) for s in self.fieldsets)
        if total > PRESET_MAX_FIELDS:
            raise ValueError(f"a node has more than {PRESET_MAX_FIELDS} fields (loose ones and the ones in its fieldsets together)")
        return self

    @field_validator("keywords")
    @classmethod
    def _clean_keywords(cls, value: list[str]) -> list[str]:
        return _clean_list(value, PRESET_KEYWORD_MAX, "keyword", unique=True)

    @field_validator("fields")
    @classmethod
    def _clean_fields(cls, value: list[PresetField]) -> list[PresetField]:
        return _clean_field_entries(value)


class PresetCluster(_PresetNode):
    id: str = Field(pattern=_PRESET_ID)


class PresetSubcategory(_PresetNode):
    id: str = Field(pattern=_PRESET_ID)
    clusters: list[PresetCluster] = Field(default_factory=list, max_length=PRESET_MAX_CHILDREN)


class PresetContent(_PresetNode):
    """A preset's category and everything under it (its id is its PresetEntry's)."""

    subcategories: list[PresetSubcategory] = Field(default_factory=list, max_length=PRESET_MAX_CHILDREN)


class PublishedPreset(BaseModel):
    """One numbered, frozen copy of a preset's content."""

    version: int
    publishedAt: datetime = Field(default_factory=utcnow)
    content: PresetContent


class PresetEntry(BaseModel):
    id: str = Field(pattern=_PRESET_ID)
    draft: PresetContent
    # The copy the Writer offers; None until published, and again after Unpublish.
    published: Optional[PublishedPreset] = None
    # Earlier published versions, newest first (the current one is `published`, not here).
    history: list[PublishedPreset] = Field(default_factory=list, max_length=PRESET_HISTORY_MAX)
    # The version the next publish gets; it only ever goes up, so an unpublished preset keeps counting.
    nextVersion: int = 1


class PresetCatalog(BaseModel):
    schemaVersion: int = PRESETS_SCHEMA_VERSION
    presets: list[PresetEntry] = Field(default_factory=list, max_length=PRESET_MAX_PRESETS)


class PresetDraftIn(BaseModel):
    id: str = Field(pattern=_PRESET_ID)
    draft: PresetContent


class PresetDraftList(BaseModel):
    """What the admin page saves: just the drafts, in order. Published copies and history are never touched by a save, and a preset left out is deleted."""

    presets: list[PresetDraftIn] = Field(default_factory=list, max_length=PRESET_MAX_PRESETS)

    @model_validator(mode="after")
    def _unique(self) -> "PresetDraftList":
        ids = [p.id for p in self.presets]
        if len(set(ids)) != len(ids):
            raise ValueError("two presets share an id")
        names = [p.draft.name.casefold() for p in self.presets if p.draft.name]
        if len(set(names)) != len(names):
            raise ValueError("two presets share a name")
        return self


class PublishedPresetOut(BaseModel):
    """What the Writer's selector reads: a published preset, with its id."""

    id: str
    version: int
    publishedAt: datetime
    content: PresetContent


class PublishedPresetList(BaseModel):
    presets: list[PublishedPresetOut] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# AUI Configuration: a global (not project-scoped), admin-editable outline of
# Console -> Component -> Feature ideas for each of AUI's Configuration
# sub-tabs (Project Plan, Visitor, User, Reader, Translator, Writer, Helper,
# Admin). One flat list for all 8 tabs combined, partitioned by `tab` and
# nested via `parentId`/`order` -- the same shape as OutlineNode, just with
# `kind` narrowed to 3 values and `title`/`synopsis` replaced by `name`/
# `idea`. Lives at %APPDATA%\Scriblr\admin-config.json, a sibling of
# presets.json. Its own schema version, independent of SCHEMA_VERSION.
# ---------------------------------------------------------------------------

AuiConfigNodeKind = Literal["console", "component", "feature"]


class AuiConfigNode(BaseModel):
    id: str
    tab: str
    kind: AuiConfigNodeKind
    parentId: Optional[str]
    order: int
    name: str
    idea: str = ""  # only meaningful for kind == "feature"; empty otherwise


class PublishedTab(BaseModel):
    """A frozen copy of one Configuration tab, made by Publish. `nodes` (on
    AuiConfig) is the editable DRAFT; this is what read-only consumers show."""

    version: int = 1
    publishedAt: datetime = Field(default_factory=utcnow)
    nodes: list[AuiConfigNode] = Field(default_factory=list)


class AuiConfig(BaseModel):
    schemaVersion: int = 1
    # The working draft (all tabs, flat).
    nodes: list[AuiConfigNode] = Field(default_factory=list)
    # Per-tab published snapshots, keyed by tab. A tab never published is absent.
    published: dict[str, PublishedTab] = Field(default_factory=dict)


class AuiConfigDraft(BaseModel):
    """What a client saves: just the draft nodes. Kept separate from AuiConfig
    so a save can never overwrite (or wipe) the published snapshots."""

    schemaVersion: int = 1
    nodes: list[AuiConfigNode] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# ProjectFile: the single on-disk file a project is stored as (project.json),
# consolidating what used to be ~10 separate shard files (index, outline,
# plot, per-chapter drafts, per-chapter revisions, outline/plot history,
# activity, schedule, scrap) into one. Every field reuses an existing
# per-section model unchanged -- this is purely a container.
# ---------------------------------------------------------------------------


class ProjectFile(BaseModel):
    schemaVersion: int = PROJECT_FILE_VERSION
    # Which scheme the stored level colours use (HUE_SCHEME); a file without it is scheme 1.
    hueScheme: int = HUE_SCHEME
    index: ProjectIndex
    outline: OutlineTree = Field(default_factory=OutlineTree)
    plot: PlotTree = Field(default_factory=PlotTree)
    drafts: dict[str, DraftChapter] = Field(default_factory=dict)
    revisions: dict[str, list[RevisionSnapshot]] = Field(default_factory=dict)
    publications: dict[str, list[Publication]] = Field(default_factory=dict)
    # Book id -> how it is published in the Reader's library; chapter id -> the author's footnotes and flagged passages.
    bookListings: dict[str, BookListing] = Field(default_factory=dict)
    chapterNotes: dict[str, ChapterAuthorNotes] = Field(default_factory=dict)
    outlineHistory: list[TreeSnapshot] = Field(default_factory=list)
    plotHistory: list[TreeSnapshot] = Field(default_factory=list)
    activity: DailyActivityLog = Field(default_factory=DailyActivityLog)
    schedule: ScheduleCompletionLog = Field(default_factory=ScheduleCompletionLog)
    scrap: ScrapRegistry = Field(default_factory=ScrapRegistry)
    # Changes to the project's settings (time systems, colour), newest last; see SettingsLogEntry.
    settingsLog: list[SettingsLogEntry] = Field(default_factory=list)
    # Sections that could not be read, as they were stored: key -> (raw value, the default put in their place). Not persisted by itself: the
    # store writes the raw value back unless the section was replaced, so an unreadable section is kept for a build that can read it.
    _unreadable: dict[str, tuple[Any, Any]] = PrivateAttr(default_factory=dict)


# ---------------------------------------------------------------------------
# User settings: per-user look-and-feel that must survive relaunches of the
# packaged app (whose backend port -- and so the browser localStorage origin
# -- changes every launch): time-of-day theme palettes, UI preferences, and a
# small key/value map of the Writer's saved UI state (the things that used to
# live only in localStorage). Global (not project-scoped), at
# %APPDATA%\Scriblr\user-settings.json, a sibling of presets.json. Its own
# schema version, independent of SCHEMA_VERSION.
#
# A zone's palette is just four hues (theme, accent, alert, admin accent): the
# zone's saturation and lightness are a fixed look the frontend owns
# (frontend/src/theme/zoneLooks.ts). Files saved by older versions also hold a
# saturation per colour and a brightness; they still load (extra fields are
# ignored) and are dropped the next time the settings are saved.
#
# The account's hue list (ThemeSettings.hues, up to ten swatches) and each zone's links (which swatch each role uses) are optional with
# defaults, so a file saved without them still loads; the frontend seeds them from the hues in use (frontend/src/theme/zones.ts).
# A role's hue in the palette is always kept equal to its linked swatch's, so nothing that reads the palette needs to know about links.
#
# Only value RANGES are validated here. A validation failure would quarantine
# the whole file, so anything subtler is left to the client to normalize on load.
# ---------------------------------------------------------------------------

ZoneKey = Literal["dawn", "day", "dusk", "night"]


class ThemeHue(BaseModel):
    h: int = Field(ge=0, le=360)


class ZonePalette(BaseModel):
    theme: ThemeHue
    accent: ThemeHue
    alert: ThemeHue
    accent2: ThemeHue


THEME_HUES_MAX = 10


class ThemeSwatch(BaseModel):
    """A hue in the account's list: roles are dropped onto it, and editing it changes every role that uses it."""

    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,40}$")
    h: int = Field(ge=0, le=360)


class ZoneLinks(BaseModel):
    """The id of the swatch each role of a zone uses (None = not linked to one)."""

    theme: Optional[str] = None
    accent: Optional[str] = None
    alert: Optional[str] = None
    accent2: Optional[str] = None


class ZoneConfig(BaseModel):
    configured: bool
    # Minutes after midnight, in 10-minute steps.
    startMinute: int = Field(ge=0, le=1430)
    palette: ZonePalette
    links: ZoneLinks = Field(default_factory=ZoneLinks)

    @field_validator("startMinute")
    @classmethod
    def _ten_minute_steps(cls, v: int) -> int:
        if v % 10 != 0:
            raise ValueError("startMinute must be a multiple of 10")
        return v


class ThemeZones(BaseModel):
    dawn: ZoneConfig
    day: ZoneConfig
    dusk: ZoneConfig
    night: ZoneConfig


class ThemeSettings(BaseModel):
    timeBasedEnabled: bool = False
    override: Optional[ZoneKey] = None
    zones: ThemeZones
    hues: list[ThemeSwatch] = Field(default_factory=list, max_length=THEME_HUES_MAX)


class UiSettings(BaseModel):
    viewAs: Optional[Literal["user", "admin"]] = None
    handedness: Literal["left", "right"] = "right"
    # Autosave preference: on/off, and how long the editors wait without a
    # change before saving (the app offers 1, 5 or 10 minutes; older values of 30 seconds up to 10 minutes stay valid).
    autosaveEnabled: bool = False
    autosaveSeconds: int = Field(default=60, ge=30, le=600, multiple_of=30)


class UserSettings(BaseModel):
    schemaVersion: int = 1
    theme: ThemeSettings
    ui: UiSettings = Field(default_factory=UiSettings)
    kv: dict[str, Any] = Field(default_factory=dict)
    migratedFromLocal: bool = False
    # Changes to the theme and UI settings, newest last (see SettingsLogEntry): what Undo reads.
    activityLog: list[SettingsLogEntry] = Field(default_factory=list)
