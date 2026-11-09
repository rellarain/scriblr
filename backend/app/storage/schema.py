from datetime import datetime, timezone
from typing import Any, Literal, Optional

import colorsys
import re

from pydantic import BaseModel, Field, PrivateAttr, ValidationError, field_validator, model_validator

SCHEMA_VERSION = 2
# The version of the project.json file as a whole (ProjectFile.schemaVersion), which a build refuses to write over when the file is newer than it
# knows (see project_store). 2: one file per project; 3: plot clusters; 4: tree history as sparse keyframes and deltas (tree_pack);
# 5: a book's paragraph indent in spaces (PreviewFormat.paragraphIndentSpaces) instead of em.
# 6: the Schedule console: faceted activity (events, daily and monthly totals, a 28-day slot profile), revision flags and the planner.
PROJECT_FILE_VERSION = 6


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
# How far (degrees either side of its parent's hue) a level's colour may sit, as the user picks it: one of these. None = the level's own default
# (book 90, arc 60, chapter 30, category 90, subcategory 60, cluster 30; the project 360). A child's range is held to its parent's.
HUE_RANGE_OPTIONS = (30, 60, 90, 120, 180, 360)


def _hue_range_or_none(value: Optional[int]) -> Optional[int]:
    """A stored hue range that is not one of the options is read as none (the default) rather than dropping the node that holds it."""
    return value if value in HUE_RANGE_OPTIONS else None
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
    # a book sits within its own range of it (OutlineNode.hueRange, 90 until another is chosen), an arc within its range of
    # its book and a chapter within its range of its arc (the OutlineNode.themeHue of each). None = the active theme's own
    # colour (plus 120 degrees: the default), unless hueInherit says it follows the app theme's hue.
    themeHue: Optional[int] = Field(default=None, ge=MIN_LEVEL_HUE, le=MAX_LEVEL_HUE)
    # The project's colour follows the app theme's hue (it has no "none" for that: None in themeHue is the default, the theme's plus 120).
    hueInherit: bool = False
    # How far (degrees either side of the app theme's hue) the project's colour may sit; one of HUE_RANGE_OPTIONS, None = 360.
    hueRange: Optional[int] = None

    @field_validator("hueRange")
    @classmethod
    def _hue_range_is_an_option(cls, value: Optional[int]) -> Optional[int]:
        return _hue_range_or_none(value)


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
    # How far (degrees either side of its parent's hue) this colour may sit: one of HUE_RANGE_OPTIONS, None = the kind's default.
    hueRange: Optional[int] = None

    @field_validator("hueRange")
    @classmethod
    def _hue_range_is_an_option(cls, value: Optional[int]) -> Optional[int]:
        return _hue_range_or_none(value)

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
PLOT_MAX_LINKS = 100
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
    # How far (degrees either side of its parent's hue) the colour may sit: one of HUE_RANGE_OPTIONS, None = the kind's default.
    hueRange: Optional[int] = None

    @field_validator("hueRange")
    @classmethod
    def _hue_range_is_an_option(cls, value: Optional[int]) -> Optional[int]:
        return _hue_range_or_none(value)

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
    # Set on a category, subcategory, cluster or plotline: the ids of the other plot nodes (of any of those kinds) it is linked to, for a jump from
    # either end. The client keeps a link on both ends; the server keeps what it is given, cut not refused (a non-text id, a repeat and a surplus
    # beyond PLOT_MAX_LINKS are dropped), so one odd node cannot set the whole plot aside.
    links: list[str] = Field(default_factory=list)

    @field_validator("links", mode="before")
    @classmethod
    def _few_distinct_links(cls, value: Any) -> Any:
        if not isinstance(value, list):
            return []
        kept: list[str] = []
        for item in value:
            if isinstance(item, str) and item and item not in kept:
                kept.append(item)
        return kept[:PLOT_MAX_LINKS]

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
    # The published maps and characters as they were when the book was published (frozen, like the chapters).
    maps: list["EditionMap"] = Field(default_factory=list)
    characters: list["EditionCharacter"] = Field(default_factory=list)
    # The copies of models the characters' figures were made from, frozen with the edition (key -> copy).
    figureModels: dict[str, "FigureModel"] = Field(default_factory=dict)


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
# Character models: the admin-designed assets of the art mannequin (see docs/mannequin-mockup). Global, not project-scoped, in
# %APPDATA%\Scriblr\character-models.json, a sibling of presets.json, with the same draft / published / history shape as the plot presets.
# A model holds shapes (a filled outline of points in the four modes), objects (a layer and a list of shapes) and groups (a list of
# objects), all containers in phase 1: pivots, links, ranges, forms, colour slots and the rest are added by later phases as new fields with
# defaults, so an older file still loads. Coordinates live in the model's space: 0..200 across, 0..400 down (a figure about 390 tall).
# ---------------------------------------------------------------------------

CHARACTER_MODELS_SCHEMA_VERSION = 1
MODEL_NAME_MAX = 60
MODEL_DESCRIPTION_MAX = 400
MODEL_MAX_MODELS = 100
MODEL_HISTORY_MAX = 10
# The limits the user chose: warn above the first number, stop at the second.
MODEL_POINTS_WARN = 24
MODEL_POINTS_MAX = 60
MODEL_OBJECTS_PER_GROUP_WARN = 24
MODEL_OBJECTS_PER_GROUP_MAX = 48
MODEL_SHAPES_PER_OBJECT_WARN = 36
MODEL_SHAPES_PER_OBJECT_MAX = 72
MODEL_COPY_WARN_BYTES = 150 * 1024   # the size of a character's copy of a model
MODEL_COPY_MAX_BYTES = 250 * 1024
# Generous caps on the totals, so the file stays small and one save is bounded.
MODEL_MAX_SHAPES = 600
MODEL_MAX_OBJECTS = 200
MODEL_MAX_GROUPS = 120   # phase 5c: a hand with its fingers is about fifteen groups
MODEL_X_RANGE = (-50.0, 250.0)
MODEL_Y_RANGE = (-50.0, 450.0)
# The rig (phase 2): the user's numbers. The pivot chain of 6 is a stop (publish is refused above it); the counts of sliders and of what one
# slider drives are stops too (max_length), with a warning above the first number.
MODEL_CHAIN_WARN = 6    # phase 5c: torso, arm, forearm, hand and three finger joints is 7 deep: warn above 6, stop above 9
MODEL_CHAIN_MAX = 9
MODEL_RANGES_WARN = 60
MODEL_RANGES_MAX = 120
MODEL_ROLE_MAX = 40
MODEL_GRIPS_WARN = 8   # grip points per model
MODEL_GRIPS_MAX = 16
MODEL_DRIVES_WARN = 12
MODEL_DRIVES_MAX = 24
MODEL_RANGE_NAME_MAX = 40
MODEL_AXIS_RANGE = (40.0, 160.0)   # the line a model mirrors about (the middle of the 0..200 space by default)
MODEL_LINKS_WARN = 100   # point links (a point welded to, following, or locked to the edge of another shape): counted over the whole model
MODEL_LINKS_MAX = 200    # more than this is a publish fault
MODEL_AXES_WARN = 4      # forms: axes per object, forms per axis, presets per model
MODEL_AXES_MAX = 8
MODEL_FORMS_WARN = 24
MODEL_FORMS_MAX = 48
MODEL_PRESETS_WARN = 40
MODEL_PRESETS_MAX = 80
MODEL_KIND_MAX = 24
MODEL_HIDDEN_MAX = 100   # objects and groups one preset may hide
MODEL_CLASSES_WARN = 12  # classes (phase 3b): classes per model, members per class
MODEL_CLASSES_MAX = 24
MODEL_MEMBERS_WARN = 12
MODEL_MEMBERS_MAX = 24   # more than this is a publish fault
MODEL_PRESET_FORMS_MAX = 100   # form choices one style may keep
MODEL_GENRES_WARN = 8    # colour (phase 4): genre tags per model, colour slots per model, default colours per slot, swatches of the starter palette
MODEL_GENRES_MAX = 12
MODEL_SLOTS_WARN = 16
MODEL_SLOTS_MAX = 32
MODEL_COLOURS_WARN = 40
MODEL_COLOURS_MAX = 64
MODEL_PALETTE_MAX = 10
MODEL_SWATCH_NAME_MAX = 30
MODEL_SHADES_WARN = 8    # paint effects (phase 4b): shading shapes per object, cut-outs per shape, paint changes (looks) per form
MODEL_SHADES_MAX = 10
MODEL_CUTS_MAX = 8
MODEL_LOOKS_MAX = 72   # as many as an object has shapes
MODEL_BONES_WARN = 12   # proportions and frames (phase 5a): bones per model, frames per model, the groups and objects a frame may hide
MODEL_BONES_MAX = 24
MODEL_FRAMES_WARN = 8
MODEL_FRAMES_MAX = 16
MODEL_FRAME_HIDE_MAX = 100
MODEL_FRAME_MIN = 8.0    # the smallest a frame is, in the model's units
MODEL_FRAME_BIGGEST = 500.0
MODEL_TILE_DEFAULT = "#e6d6c3"   # the card colour a figure stands on, unless the model says another
MODEL_TINT_RANGE = (0.02, 0.8)
MODEL_TONE_RANGE = (-2, 2)
_MODEL_ID = r"^[A-Za-z0-9_.-]{1,80}$"
ModelPointMode = Literal["c", "s", "cs", "sc"]
ModelLayer = Literal["body", "clothing", "hair"]
ModelView = Literal["both", "front", "back"]
ModelAnchorKind = Literal["point", "edge", "range", "inside"]
ModelRangeUnit = Literal["", "°", "%"]
ModelDriveKind = Literal["turn", "scale", "points", "bend", "length", "fall"]
ModelFallSide = Literal["down", "left", "right", "behind"]
ModelFit = Literal["scale", "keep", "stretch"]
ModelBoneEndKind = Literal["group", "point"]
ModelScaleTarget = Literal["group", "shape", "model"]
ModelScaleAxis = Literal["xy", "x", "y"]
ModelBindKind = Literal["point", "edge"]
ModelTintKind = Literal["shadow", "mid", "highlight"]
ModelGradDir = Literal["down", "up", "left", "right", "radial"]
ModelBlend = Literal["multiply", "screen", "overlay"]


def _keep_valid(cls: Any, value: Any) -> list[Any]:
    """The entries of a list that are valid, one by one: a bad entry is dropped, its siblings stay (as a corrupt entry of a draft list is)."""
    if not isinstance(value, list):
        return []
    kept: list[Any] = []
    for item in value:
        try:
            kept.append(cls.model_validate(item))
        except ValidationError as err:
            # a bad entry is dropped, but a limit that is passed (too many drives, too many points) is refused, not quietly lost
            if any(e["type"] == "too_long" for e in err.errors()):
                raise
        except ValueError:
            continue
    return kept


def _optional_id(value: Any) -> Optional[str]:
    """An id that fits the id pattern, or None."""
    return value if isinstance(value, str) and re.fullmatch(_MODEL_ID, value) else None


class ModelBind(BaseModel):
    """A point link, kept on the point that follows. `kind` "point": the point sits on point `i` of shape `s` plus the offset `d` (a weld has none); kind
    "edge": it sits at `t` (0..1) along the edge from point `e` of shape `s`, `o` units outward (a clothes point locked to the edge of a body part). A
    link is solved when the model is drawn, so the point never has to be kept in step by hand."""

    kind: ModelBindKind = "point"
    s: str = Field(pattern=_MODEL_ID)
    i: int = 0
    d: list[float] = Field(default_factory=lambda: [0.0, 0.0])
    e: int = 0
    t: float = 0.0
    o: float = 0.0
    # An edge link may also leave along the direction of its edge (phase 5b): between two such points locked to different shapes the outline runs on
    # smoothly from one edge to the other, as skin does across a joint (a bridge).
    tan: bool = False

    @field_validator("tan", mode="before")
    @classmethod
    def _tan(cls, value: Any) -> bool:
        return value is True

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, value: Any) -> Any:
        return value if value in ("point", "edge") else "point"

    @field_validator("i", "e", mode="before")
    @classmethod
    def _index(cls, value: Any) -> int:
        return int(_finite(value, 0.0, 0.0, float(MODEL_POINTS_MAX - 1)))

    @field_validator("d", mode="before")
    @classmethod
    def _offset(cls, value: Any) -> list[float]:
        if not isinstance(value, (list, tuple)) or len(value) != 2:
            return [0.0, 0.0]
        return [_finite(value[0], 0.0, -200.0, 200.0), _finite(value[1], 0.0, -200.0, 200.0)]

    @field_validator("t", mode="before")
    @classmethod
    def _spot(cls, value: Any) -> float:
        return _finite(value, 0.0, 0.0, 1.0)

    @field_validator("o", mode="before")
    @classmethod
    def _outward(cls, value: Any) -> float:
        return _finite(value, 0.0, -100.0, 100.0)


class ModelPoint(BaseModel):
    """One point of a shape: c = curve, s = sharp, cs = curve then sharp, sc = sharp then curve. `hi` and `ho` are the in and out handles as offsets
    (None = automatic); `w` is how free the point is for hanging chains (later phases); `bind` links it to another shape."""

    x: float = 0.0
    y: float = 0.0
    m: ModelPointMode = "c"
    hi: Optional[list[float]] = None
    ho: Optional[list[float]] = None
    w: Optional[float] = None
    bind: Optional[ModelBind] = None

    @field_validator("bind", mode="before")
    @classmethod
    def _bind(cls, value: Any) -> Any:
        if value is None or isinstance(value, ModelBind):
            return value
        try:
            return ModelBind.model_validate(value)
        except ValueError:
            return None

    @field_validator("x", mode="before")
    @classmethod
    def _x(cls, value: Any) -> float:
        return _finite(value, 0.0, *MODEL_X_RANGE)

    @field_validator("y", mode="before")
    @classmethod
    def _y(cls, value: Any) -> float:
        return _finite(value, 0.0, *MODEL_Y_RANGE)

    @field_validator("m", mode="before")
    @classmethod
    def _mode(cls, value: Any) -> Any:
        return value if value in ("c", "s", "cs", "sc") else "c"

    @field_validator("hi", "ho", mode="before")
    @classmethod
    def _handle(cls, value: Any) -> Optional[list[float]]:
        if not isinstance(value, (list, tuple)) or len(value) != 2:
            return None
        return [_finite(value[0], 0.0, -200.0, 200.0), _finite(value[1], 0.0, -200.0, 200.0)]

    @field_validator("w", mode="before")
    @classmethod
    def _weight(cls, value: Any) -> Optional[float]:
        return None if value is None else _finite(value, 0.0, 0.0, 1.0)


class ModelTint(BaseModel):
    """A tone of a colour: a `shadow` (darker, a little warmer and fuller), a `mid` tone (half a shadow) or a `highlight` (toward white), by an amount `t`."""

    kind: ModelTintKind = "shadow"
    t: float = 0.12

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, value: Any) -> Any:
        return value if value in ("shadow", "mid", "highlight") else "shadow"

    @field_validator("t", mode="before")
    @classmethod
    def _amount(cls, value: Any) -> float:
        return round(_finite(value, 0.12, *MODEL_TINT_RANGE), 2)


class ModelGradient(BaseModel):
    """A gradient fill: from the shape's colour to the colour of slot `to` (None: a darker tone of its own colour), in a direction."""

    dir: ModelGradDir = "down"
    to: Optional[str] = None

    @field_validator("dir", mode="before")
    @classmethod
    def _dir(cls, value: Any) -> Any:
        return value if value in ("down", "up", "left", "right", "radial") else "down"

    @field_validator("to", mode="before")
    @classmethod
    def _to(cls, value: Any) -> Optional[str]:
        return _optional_id(value)


def _optional_model(cls: Any, value: Any) -> Any:
    """A nested record that is valid, or None."""
    if value is None or isinstance(value, cls):
        return value
    try:
        return cls.model_validate(value)
    except ValueError:
        return None


class ModelFade(BaseModel):
    """A shape that shows with a slider (phase 5b; a crease that appears as a joint bends): fully hidden when the slider is at `hidden`, fully drawn at
    `shown`, in between in proportion (`shown` below `hidden` fades it out as the slider rises)."""

    slider: str = Field(pattern=_MODEL_ID)
    hidden: float = 0.0
    shown: float = 100.0

    @field_validator("hidden", "shown", mode="before")
    @classmethod
    def _at(cls, value: Any) -> float:
        return _finite(value, 0.0, -1000.0, 1000.0)


class ModelShape(BaseModel):
    """A filled outline. `half` > 0 marks a symmetric outline: its first `half` points run down the right half and the rest mirror them."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_NAME_MAX)
    closed: bool = True
    z: float = 40.0
    op: float = 1.0
    view: ModelView = "both"
    pts: list[ModelPoint] = Field(default_factory=list, max_length=MODEL_POINTS_MAX)
    half: int = 0
    template: Optional[str] = Field(default=None, pattern=_MODEL_ID)
    # The shape this one is the mirror image of (about the model's axis): a derived twin has no points of its own until the pair is broken.
    mirrorOf: Optional[str] = None
    # An outline of its own for the back view (None: the front outline seen from behind), its own depth in the back view, and the slider that loosens
    # the links of its points (None: they keep their distance).
    back: Optional[list[ModelPoint]] = Field(default=None, max_length=MODEL_POINTS_MAX)
    zBack: Optional[float] = None
    loose: Optional[str] = None
    # A shape of a class member that follows a shape of the class's template (phase 3b): with no points of its own it is drawn as the template's shape is, in
    # the member's own group; with points it has an outline of its own. `hide` leaves an inherited shape out of this member.
    copyOf: Optional[str] = None
    hide: bool = False
    # The colour (phase 4): the slot the shape is painted from (a twin follows its original's, a shape that follows the template its template shape's, when
    # this is None), else a fixed gray 0..100 (an eye white, teeth), else the neutral gray every uncoloured model is drawn in.
    slot: Optional[str] = None
    gray: Optional[int] = None
    # Paint effects (phase 4b). A shape with a slot or a fixed gray of its own is painted from its own fields; a twin and a shape that follows a template take
    # all of them from the shape they copy. `tone` is a step lighter (+) or darker (-) than the colour; `derive` makes it a tone of the colour (a brow is a shadow of the
    # hair); `shade` makes this a shading shape: a tone of its slot's colour kept inside the base shapes of its object; `grad` a gradient to another slot's
    # colour; `blend` how it mixes with what is under it; `clip` the shape it is kept inside; `cut` shapes that cut a hole in it; `helper` a shape that is
    # never drawn and only serves to clip or cut.
    tone: int = 0
    derive: Optional[ModelTint] = None
    shade: Optional[ModelTint] = None
    grad: Optional[ModelGradient] = None
    blend: Optional[ModelBlend] = None
    clip: Optional[str] = None
    cut: list[str] = Field(default_factory=list, max_length=MODEL_CUTS_MAX)
    helper: bool = False
    # Phase 5b: the shape is faded in and out by a slider (a twin and a shape that follows a template take it from the shape they copy, when this is None).
    opBy: Optional[ModelFade] = None

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("opBy", mode="before")
    @classmethod
    def _fade(cls, value: Any) -> Any:
        return _optional_model(ModelFade, value)

    @field_validator("hide", "helper", mode="before")
    @classmethod
    def _hide(cls, value: Any) -> bool:
        return value is True

    @field_validator("mirrorOf", "loose", "copyOf", "slot", "clip", mode="before")
    @classmethod
    def _links(cls, value: Any) -> Optional[str]:
        return _optional_id(value)

    @field_validator("tone", mode="before")
    @classmethod
    def _tone(cls, value: Any) -> int:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return 0
        return int(round(_finite(value, 0.0, float(MODEL_TONE_RANGE[0]), float(MODEL_TONE_RANGE[1]))))

    @field_validator("derive", "shade", mode="before")
    @classmethod
    def _tint(cls, value: Any) -> Any:
        return _optional_model(ModelTint, value)

    @field_validator("grad", mode="before")
    @classmethod
    def _grad(cls, value: Any) -> Any:
        return _optional_model(ModelGradient, value)

    @field_validator("blend", mode="before")
    @classmethod
    def _blend(cls, value: Any) -> Any:
        return value if value in ("multiply", "screen", "overlay") else None

    @field_validator("cut", mode="before")
    @classmethod
    def _cut(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        out: list[str] = []
        for v in value:
            ident = _optional_id(v)
            if ident is not None and ident not in out:
                out.append(ident)
        return out[:MODEL_CUTS_MAX]

    @field_validator("gray", mode="before")
    @classmethod
    def _gray(cls, value: Any) -> Optional[int]:
        if value is None or isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        return int(round(_finite(value, 50.0, 0.0, 100.0)))

    @field_validator("back", mode="before")
    @classmethod
    def _back(cls, value: Any) -> Any:
        return None if not isinstance(value, list) else _keep_valid(ModelPoint, value)

    @field_validator("zBack", mode="before")
    @classmethod
    def _z_back(cls, value: Any) -> Optional[float]:
        return None if value is None else _finite(value, 40.0, 0.0, 100.0)

    @field_validator("z", mode="before")
    @classmethod
    def _z(cls, value: Any) -> float:
        return _finite(value, 40.0, 0.0, 100.0)

    @field_validator("op", mode="before")
    @classmethod
    def _op(cls, value: Any) -> float:
        return _finite(value, 1.0, 0.0, 1.0)

    @field_validator("half", mode="before")
    @classmethod
    def _half(cls, value: Any) -> int:
        return int(_finite(value, 0.0, 0.0, float(MODEL_POINTS_MAX)))

    @field_validator("view", mode="before")
    @classmethod
    def _view(cls, value: Any) -> Any:
        return value if value in ("both", "front", "back") else "both"


class ModelAttach(BaseModel):
    """Where a group is fixed to a shape of its parent (or an ancestor): on one `point` (`i`), at a spot `t` (0..1) along edge `i`, anywhere along edge
    `i` that the slider `slider` moves, or at a relative place `rx`, `ry` inside the shape's box."""

    shape: str = Field(pattern=_MODEL_ID)
    kind: ModelAnchorKind = "point"
    i: int = 0
    t: float = 0.0
    slider: Optional[str] = None
    rx: float = 0.5
    ry: float = 0.5

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, value: Any) -> Any:
        return value if value in ("point", "edge", "range", "inside") else "point"

    @field_validator("i", mode="before")
    @classmethod
    def _i(cls, value: Any) -> int:
        return int(_finite(value, 0.0, 0.0, float(MODEL_POINTS_MAX - 1)))

    @field_validator("t", "rx", "ry", mode="before")
    @classmethod
    def _unit(cls, value: Any) -> float:
        return _finite(value, 0.0, 0.0, 1.0)

    @field_validator("slider", mode="before")
    @classmethod
    def _slider(cls, value: Any) -> Optional[str]:
        return _optional_id(value)


class ModelMove(BaseModel):
    """One point of a `points` drive: how far it moves when the slider is at its maximum (`dx`, `dy`) and at its minimum (`dxMin`, `dyMin`)."""

    i: int = 0
    dx: float = 0.0
    dy: float = 0.0
    dxMin: float = 0.0
    dyMin: float = 0.0

    @field_validator("i", mode="before")
    @classmethod
    def _i(cls, value: Any) -> int:
        return int(_finite(value, 0.0, 0.0, float(MODEL_POINTS_MAX - 1)))

    @field_validator("dx", "dy", "dxMin", "dyMin", mode="before")
    @classmethod
    def _d(cls, value: Any) -> float:
        return _finite(value, 0.0, -200.0, 200.0)


class ModelDrive(BaseModel):
    """What a slider does: `turn` a group about its pivot, `scale` a group, a shape or the whole model, `points` move chosen points of a shape, or
    `bend` a shape smoothly along a length, or change the `length` of a bone (the group it starts at is stretched along it, and what hangs from it follows),
    or let a shape `fall` (phase 5b: the runs of its points that have a weight hang from the point before them, each keeping its length).
    `atMin` and `atMax` are the amount at the slider's minimum and maximum (degrees for turn and bend, percent for scale, length and fall); the amount is 0
    (or 100 %) at the slider's rest value. A mirrored twin does the opposite turn or sideways move unless `mirror` is false (phase 5c: then it does not follow
    this drive, and the twin group may have drives of its own, so the two sides are posed apart)."""

    kind: ModelDriveKind
    group: Optional[str] = None
    target: Optional[ModelScaleTarget] = None
    id: Optional[str] = None
    axis: ModelScaleAxis = "xy"
    shape: Optional[str] = None
    moves: list[ModelMove] = Field(default_factory=list, max_length=MODEL_POINTS_MAX)
    sym: bool = False
    pivot: Optional[list[float]] = None
    y0: float = 0.0
    y1: float = 0.0
    atMin: float = 0.0
    atMax: float = 0.0
    mirror: bool = True

    @field_validator("group", "id", "shape", mode="before")
    @classmethod
    def _ref(cls, value: Any) -> Optional[str]:
        return _optional_id(value)

    @field_validator("target", mode="before")
    @classmethod
    def _target(cls, value: Any) -> Any:
        return value if value in ("group", "shape", "model") else None

    @field_validator("axis", mode="before")
    @classmethod
    def _axis(cls, value: Any) -> Any:
        return value if value in ("xy", "x", "y") else "xy"

    @field_validator("moves", mode="before")
    @classmethod
    def _moves(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelMove, value)

    @field_validator("pivot", mode="before")
    @classmethod
    def _pivot(cls, value: Any) -> Optional[list[float]]:
        if not isinstance(value, (list, tuple)) or len(value) != 2:
            return None
        return [_finite(value[0], 100.0, *MODEL_X_RANGE), _finite(value[1], 200.0, *MODEL_Y_RANGE)]

    @field_validator("y0", "y1", mode="before")
    @classmethod
    def _y(cls, value: Any) -> float:
        return _finite(value, 0.0, *MODEL_Y_RANGE)

    @model_validator(mode="after")
    def _complete(self) -> "ModelDrive":
        if self.kind == "turn" and not self.group:
            raise ValueError("a turn drive needs a group")
        if self.kind == "scale" and (self.target is None or (self.target != "model" and not self.id)):
            raise ValueError("a scale drive needs a target")
        if self.kind in ("points", "bend", "fall") and not self.shape:
            raise ValueError("this drive needs a shape")
        if self.kind == "length" and not self.id:
            raise ValueError("a length drive needs a bone")
        if self.kind in ("scale", "length"):
            # a percentage: 100 is the size at rest
            for name in ("atMin", "atMax"):
                setattr(self, name, 100.0 if name not in self.model_fields_set else _finite(getattr(self, name), 100.0, 5.0, 1000.0))
        elif self.kind == "fall":
            # how much of the way to hanging, in percent: none at rest, all of it at the maximum unless the drive says otherwise
            self.atMin = 0.0 if "atMin" not in self.model_fields_set else _finite(self.atMin, 0.0, 0.0, 100.0)
            self.atMax = 100.0 if "atMax" not in self.model_fields_set else _finite(self.atMax, 100.0, 0.0, 100.0)
        else:
            self.atMin = _finite(self.atMin, 0.0, -360.0, 360.0)
            self.atMax = _finite(self.atMax, 0.0, -360.0, 360.0)
        if self.kind == "bend":
            if self.pivot is None:
                self.pivot = [100.0, 200.0]
            if self.y1 < self.y0:
                self.y0, self.y1 = self.y1, self.y0
        return self


class ModelRange(BaseModel):
    """A slider of the model: from `min` to `max`, resting at `rest` (what is drawn), with what it `drives`. `rand` is the span the random previews
    and the writer's Randomise stay in; `show` says whether the writer's editor offers it."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_RANGE_NAME_MAX)
    scope: Optional[str] = None
    min: float = 0.0
    rest: float = 0.0
    max: float = 100.0
    unit: ModelRangeUnit = ""
    show: bool = True
    rand: Optional[list[float]] = None
    # The span a writer may choose within (phase 5a): inside min..max, ordered, always holding the resting value; None = the whole slider.
    limit: Optional[list[float]] = None
    # What the slider is for, as a short tag (phase 5c: `curl-index`, `spread`, ... for a hand; the other side's slider has `~` added), so the starter hand poses find it.
    role: Optional[str] = Field(default=None, max_length=MODEL_ROLE_MAX)
    drives: list[ModelDrive] = Field(default_factory=list, max_length=MODEL_DRIVES_MAX)

    @field_validator("role", mode="before")
    @classmethod
    def _role(cls, value: Any) -> Optional[str]:
        text = value.strip()[:MODEL_ROLE_MAX] if isinstance(value, str) else ""
        return text or None

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("scope", mode="before")
    @classmethod
    def _scope(cls, value: Any) -> Optional[str]:
        return _optional_id(value)

    @field_validator("limit", mode="before")
    @classmethod
    def _limit(cls, value: Any) -> Any:
        return value if isinstance(value, (list, tuple)) and len(value) == 2 else None

    @field_validator("min", "rest", "max", mode="before")
    @classmethod
    def _value(cls, value: Any) -> float:
        return _finite(value, 0.0, -1000.0, 1000.0)

    @field_validator("unit", mode="before")
    @classmethod
    def _unit(cls, value: Any) -> Any:
        return value if value in ("", "°", "%") else ""

    @field_validator("drives", mode="before")
    @classmethod
    def _drives(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelDrive, value)

    @model_validator(mode="after")
    def _ordered(self) -> "ModelRange":
        if self.max <= self.min:
            self.max = self.min + 1.0
        self.rest = min(self.max, max(self.min, self.rest))
        if self.rand is not None:
            if not isinstance(self.rand, list) or len(self.rand) != 2:
                self.rand = None
            else:
                a, b = (_finite(v, self.rest, self.min, self.max) for v in self.rand)
                self.rand = [min(a, b), max(a, b)]
        if self.limit is not None:
            if not isinstance(self.limit, list) or len(self.limit) != 2:
                self.limit = None
            else:
                a, b = (_finite(v, self.rest, self.min, self.max) for v in self.limit)
                lo, hi = min(a, b, self.rest), max(a, b, self.rest)
                self.limit = None if lo <= self.min and hi >= self.max else [lo, hi]
        return self


class ModelOverride(BaseModel):
    """What one form does to one shape of its object: the outline the shape has in that form. An empty list hides the shape in the form."""

    shape: str = Field(pattern=_MODEL_ID)
    pts: list[ModelPoint] = Field(default_factory=list, max_length=MODEL_POINTS_MAX)

    @field_validator("pts", mode="before")
    @classmethod
    def _pts(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelPoint, value)


class ModelLook(BaseModel):
    """What one form does to the paint of one shape of its object (phase 4b): the colour slot it is painted from, or a fixed gray (no slot), and a tone. None
    leaves the shape's own value. A look with nothing set is dropped."""

    shape: str = Field(pattern=_MODEL_ID)
    slot: Optional[str] = None
    gray: Optional[int] = None
    tone: Optional[int] = None

    @field_validator("slot", mode="before")
    @classmethod
    def _slot(cls, value: Any) -> Optional[str]:
        return _optional_id(value)

    @field_validator("gray", mode="before")
    @classmethod
    def _gray(cls, value: Any) -> Optional[int]:
        if value is None or isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        return int(round(_finite(value, 50.0, 0.0, 100.0)))

    @field_validator("tone", mode="before")
    @classmethod
    def _tone(cls, value: Any) -> Optional[int]:
        if value is None or isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        return int(round(_finite(value, 0.0, float(MODEL_TONE_RANGE[0]), float(MODEL_TONE_RANGE[1]))))

    @model_validator(mode="after")
    def _something(self) -> "ModelLook":
        if self.slot is None and self.gray is None and self.tone is None:
            raise ValueError("a look changes nothing")
        if self.slot is not None:
            self.gray = None   # a slot wins over a fixed gray
        return self


class ModelForm(BaseModel):
    """One form of an axis (round eyes, almond eyes): the shapes of the object it changes, with their outlines. A form with no overrides is the base outline.
    `looks` change the paint of some of the shapes in that form (a different colour slot, a tone)."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_NAME_MAX)
    ovr: list[ModelOverride] = Field(default_factory=list, max_length=MODEL_SHAPES_PER_OBJECT_MAX)
    looks: list[ModelLook] = Field(default_factory=list, max_length=MODEL_LOOKS_MAX)

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("ovr", mode="before")
    @classmethod
    def _ovr(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelOverride, value)

    @field_validator("looks", mode="before")
    @classmethod
    def _looks(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelLook, value)

    @model_validator(mode="after")
    def _one_per_shape(self) -> "ModelForm":
        seen: set[str] = set()
        self.ovr = [o for o in self.ovr if not (o.shape in seen or seen.add(o.shape))]
        seen_look: set[str] = set()
        self.looks = [lk for lk in self.looks if not (lk.shape in seen_look or seen_look.add(lk.shape))]
        return self


class ModelAxis(BaseModel):
    """A way an object can vary (eye shape, expression, style): its forms, and which one it shows unless told otherwise. Axes are independent: an object
    shows one form of each. An axis with no form is dropped."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_NAME_MAX)
    options: list[ModelForm] = Field(default_factory=list, max_length=MODEL_FORMS_MAX)
    # the form shown unless another is chosen
    initial: str = ""

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("options", mode="before")
    @classmethod
    def _options(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelForm, value)

    @model_validator(mode="after")
    def _repair(self) -> "ModelAxis":
        seen: set[str] = set()
        self.options = [o for o in self.options if not (o.id in seen or seen.add(o.id))]
        if not self.options:
            raise ValueError("an axis needs a form")
        if self.initial not in {o.id for o in self.options}:
            self.initial = self.options[0].id
        return self


class ModelObject(BaseModel):
    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_NAME_MAX)
    layer: ModelLayer = "body"
    shapes: list[str] = Field(default_factory=list, max_length=MODEL_SHAPES_PER_OBJECT_MAX)
    mirrorOf: Optional[str] = None
    # The ways the object can vary (phase 3): each axis has forms, and the object shows one form of every axis.
    axes: list[ModelAxis] = Field(default_factory=list, max_length=MODEL_AXES_MAX)
    # The class this object is a member of (phase 3b): its shapes follow the shapes of the class's template, and it chooses among the template's forms.
    classOf: Optional[str] = None
    # How the object fits the body when proportions change (phase 5a): it moves and scales with its group (`scale`), moves and turns with it but keeps its
    # own size (`keep`), or is stretched to follow the box of the shape `fitTo` (`stretch`). Only the drawing changes: anchors and links read the outline as it is.
    fit: ModelFit = "scale"
    fitTo: Optional[str] = None

    @field_validator("axes", mode="before")
    @classmethod
    def _axes(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelAxis, value)

    @model_validator(mode="after")
    def _unique_axes(self) -> "ModelObject":
        seen: set[str] = set()
        self.axes = [a for a in self.axes if not (a.id in seen or seen.add(a.id))]
        return self

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("mirrorOf", "classOf", "fitTo", mode="before")
    @classmethod
    def _twin(cls, value: Any) -> Optional[str]:
        return _optional_id(value)

    @field_validator("fit", mode="before")
    @classmethod
    def _fit(cls, value: Any) -> Any:
        return value if value in ("scale", "keep", "stretch") else "scale"

    @model_validator(mode="after")
    def _fit_target(self) -> "ModelObject":
        if self.fit != "stretch":
            self.fitTo = None
        return self

    @field_validator("layer", mode="before")
    @classmethod
    def _layer(cls, value: Any) -> Any:
        return value if value in ("body", "clothing", "hair") else "body"


class ModelGroup(BaseModel):
    """A group of objects that move together. `parent` is the group it hangs from (the rig), `pivot` the point it turns about (in the model's space at
    rest), `attach` where on a shape of its parent it is fixed."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_NAME_MAX)
    parent: Optional[str] = None
    objects: list[str] = Field(default_factory=list, max_length=MODEL_OBJECTS_PER_GROUP_MAX)
    pivot: Optional[list[float]] = None
    attach: Optional[ModelAttach] = None
    mirrorOf: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("mirrorOf", mode="before")
    @classmethod
    def _twin(cls, value: Any) -> Optional[str]:
        return _optional_id(value)

    @field_validator("pivot", mode="before")
    @classmethod
    def _pivot(cls, value: Any) -> Optional[list[float]]:
        if not isinstance(value, (list, tuple)) or len(value) != 2:
            return None
        return [_finite(value[0], 100.0, *MODEL_X_RANGE), _finite(value[1], 200.0, *MODEL_Y_RANGE)]

    @field_validator("attach", mode="before")
    @classmethod
    def _attach(cls, value: Any) -> Any:
        if value is None or isinstance(value, ModelAttach):
            return value
        try:
            return ModelAttach.model_validate(value)
        except ValueError:
            return None


class ModelClass(BaseModel):
    """A template object and the members built from it (phase 3b). The template is a pattern, not drawn once it has members; each member follows its shapes
    until it is given an outline of its own. A family (`exclusive`) shows one member at a time; otherwise every member is drawn (copies in several places)."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_NAME_MAX)
    template: str = Field(pattern=_MODEL_ID)
    exclusive: bool = False

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("exclusive", mode="before")
    @classmethod
    def _exclusive(cls, value: Any) -> bool:
        return value is True


class ModelPreset(BaseModel):
    """A named set of slider values and of hidden objects (a pose, an expression, an age, a build, an outfit): `kind` says which slot it fills, so applying
    one puts back whatever any other preset of its kind controls. `values` lists only the sliders it moves; `hidden` the objects and groups it hides.
    A style (phase 3b) is a preset with a `scope` (an object or a group): it also keeps the forms chosen for what is in the scope (`forms`: "objectId.axisId"
    to a form id, "class:classId" to the member shown), and only controls what the scope holds."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_NAME_MAX)
    kind: str = Field(default="Pose", max_length=MODEL_KIND_MAX)
    values: dict[str, float] = Field(default_factory=dict)
    hidden: list[str] = Field(default_factory=list, max_length=MODEL_HIDDEN_MAX)
    scope: Optional[str] = None
    forms: dict[str, str] = Field(default_factory=dict, max_length=MODEL_PRESET_FORMS_MAX)
    # Phase 5b: the side hanging things fall to, when the preset keeps one (None: it leaves the side as it is).
    fall: Optional[ModelFallSide] = None
    # Phase 5c: the grip point a hand pose holds with (None: none).
    grip: Optional[str] = None

    @field_validator("grip", mode="before")
    @classmethod
    def _grip(cls, value: Any) -> Optional[str]:
        return _optional_id(value)

    @field_validator("scope", mode="before")
    @classmethod
    def _scope(cls, value: Any) -> Optional[str]:
        return _optional_id(value)

    @field_validator("fall", mode="before")
    @classmethod
    def _fall_side(cls, value: Any) -> Any:
        return value if value in ("down", "left", "right", "behind") else None

    @field_validator("forms", mode="before")
    @classmethod
    def _forms(cls, value: Any) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        return {k: v for k, v in value.items() if isinstance(k, str) and 3 <= len(k) <= 170 and _optional_id(v) is not None}

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, value: Any) -> str:
        text = value.strip() if isinstance(value, str) else ""
        return text[:MODEL_KIND_MAX] or "Pose"

    @field_validator("values", mode="before")
    @classmethod
    def _values(cls, value: Any) -> dict[str, float]:
        if not isinstance(value, dict):
            return {}
        return {k: _finite(v, 0.0, -1000.0, 1000.0) for k, v in value.items() if _optional_id(k) is not None and isinstance(v, (int, float)) and not isinstance(v, bool)}

    @field_validator("hidden", mode="before")
    @classmethod
    def _hidden(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        out: list[str] = []
        for v in value:
            ident = _optional_id(v)
            if ident is not None and ident not in out:
                out.append(ident)
        return out


def _model_hex(value: Any) -> str:
    """A colour as #rrggbb in lower case; anything else is a mid gray."""
    return value.lower() if isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value) else "#808080"


def _percent(value: Any, default: int) -> int:
    return int(round(_finite(value, float(default), 0.0, 100.0)))


class ModelGenre(BaseModel):
    """A genre tag of the model (Fiction, Fantasy, Non-fiction...): a default colour says which genres it fits, so a character made for a project of that genre
    only draws its random colours from those."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_SWATCH_NAME_MAX)

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip()[:MODEL_SWATCH_NAME_MAX] if isinstance(value, str) else value


class ModelSwatch(BaseModel):
    """A swatch of the starter palette a new character gets: a hue and a saturation (brightness and opacity belong to the object using it)."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_SWATCH_NAME_MAX)
    h: int = 0
    s: int = 50

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip()[:MODEL_SWATCH_NAME_MAX] if isinstance(value, str) else value

    @field_validator("h", mode="before")
    @classmethod
    def _hue(cls, value: Any) -> int:
        return int(round(_finite(value, 0.0, 0.0, 359.0)))

    @field_validator("s", mode="before")
    @classmethod
    def _sat(cls, value: Any) -> int:
        return _percent(value, 50)


class ModelColour(BaseModel):
    """A default colour of a slot (an eye colour, a skin tone): `hex` is the colour exactly, `genres` the genre tags it fits (none: every genre)."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_NAME_MAX)
    hex: str = "#808080"
    genres: list[str] = Field(default_factory=list, max_length=MODEL_GENRES_MAX)

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip()[:MODEL_NAME_MAX] if isinstance(value, str) else value

    @field_validator("hex", mode="before")
    @classmethod
    def _hex(cls, value: Any) -> str:
        return _model_hex(value)

    @field_validator("genres", mode="before")
    @classmethod
    def _genres(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        out: list[str] = []
        for v in value:
            ident = _optional_id(v)
            if ident is not None and ident not in out:
                out.append(ident)
        return out[:MODEL_GENRES_MAX]


class ModelSlot(BaseModel):
    """A colour slot (Skin, Hair, Eye...): the default colours the admin offers, and how bright (`l`, 0..100) and how opaque (`a`, 0..100) a colour in it may
    be, each as a smallest, a resting and a largest value. A shape picks a slot; the character picks the colour."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_NAME_MAX)
    lMin: int = 0
    lRest: int = 50
    lMax: int = 100
    aMin: int = 100
    aRest: int = 100
    aMax: int = 100
    colours: list[ModelColour] = Field(default_factory=list, max_length=MODEL_COLOURS_MAX)

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip()[:MODEL_NAME_MAX] if isinstance(value, str) else value

    @field_validator("lMin", "lRest", "lMax", mode="before")
    @classmethod
    def _l(cls, value: Any) -> int:
        return _percent(value, 50)

    @field_validator("aMin", "aRest", "aMax", mode="before")
    @classmethod
    def _a(cls, value: Any) -> int:
        return _percent(value, 100)

    @field_validator("colours", mode="before")
    @classmethod
    def _colours(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelColour, value)

    @model_validator(mode="after")
    def _repair(self) -> "ModelSlot":
        self.lMax = max(self.lMax, self.lMin)
        self.lRest = min(self.lMax, max(self.lMin, self.lRest))
        self.aMax = max(self.aMax, self.aMin)
        self.aRest = min(self.aMax, max(self.aMin, self.aRest))
        seen: set[str] = set()
        self.colours = [c for c in self.colours if not (c.id in seen or seen.add(c.id))]
        return self


class ModelBoneEnd(BaseModel):
    """The far end of a bone: the pivot of a group (`kind` group, `id` the group), or point `i` of a shape's own outline (`kind` point, `id` the shape)."""

    kind: ModelBoneEndKind = "group"
    id: str = Field(pattern=_MODEL_ID)
    i: int = 0

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, value: Any) -> Any:
        return value if value in ("group", "point") else "group"

    @field_validator("i", mode="before")
    @classmethod
    def _index(cls, value: Any) -> int:
        return int(_finite(value, 0.0, 0.0, float(MODEL_POINTS_MAX - 1)))


class ModelBone(BaseModel):
    """A measured length of the skeleton (phase 5a): from the pivot of the group `start` to `end`. Its length is read off the drawn model (in units, and in
    head heights when the model has a head bone), and a `length` drive of a slider changes it."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_RANGE_NAME_MAX)
    start: str = Field(pattern=_MODEL_ID)
    end: ModelBoneEnd

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip()[:MODEL_RANGE_NAME_MAX] if isinstance(value, str) else value

    @field_validator("end", mode="before")
    @classmethod
    def _end(cls, value: Any) -> Any:
        return value if isinstance(value, ModelBoneEnd) else ModelBoneEnd.model_validate(value)


class ModelGrip(BaseModel):
    """A grip point (phase 5c): the spot of a hand where a held item is taken, in the model's space at rest, carried by the group `group` (it moves with the hand), and the
    direction the held item points, in degrees (0 = straight down, positive toward the picture's right)."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_RANGE_NAME_MAX)
    group: Optional[str] = None
    x: float = 100.0
    y: float = 200.0
    angle: float = 0.0

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip()[:MODEL_RANGE_NAME_MAX] if isinstance(value, str) else value

    @field_validator("group", mode="before")
    @classmethod
    def _group(cls, value: Any) -> Optional[str]:
        return _optional_id(value)

    @field_validator("x", mode="before")
    @classmethod
    def _x(cls, value: Any) -> float:
        return _finite(value, 100.0, *MODEL_X_RANGE)

    @field_validator("y", mode="before")
    @classmethod
    def _y(cls, value: Any) -> float:
        return _finite(value, 200.0, *MODEL_Y_RANGE)

    @field_validator("angle", mode="before")
    @classmethod
    def _angle(cls, value: Any) -> float:
        return _finite(value, 0.0, -180.0, 180.0)


class ModelFrame(BaseModel):
    """A named crop of the figure (phase 5a): a box in the model's space and the groups and objects that are left out when the figure is seen through it."""

    id: str = Field(pattern=_MODEL_ID)
    name: str = Field(default="", max_length=MODEL_RANGE_NAME_MAX)
    x: float = 0.0
    y: float = 0.0
    w: float = 200.0
    h: float = 400.0
    hide: list[str] = Field(default_factory=list, max_length=MODEL_FRAME_HIDE_MAX)

    @field_validator("name", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip()[:MODEL_RANGE_NAME_MAX] if isinstance(value, str) else value

    @field_validator("x", mode="before")
    @classmethod
    def _x(cls, value: Any) -> float:
        return _finite(value, 0.0, *MODEL_X_RANGE)

    @field_validator("y", mode="before")
    @classmethod
    def _y(cls, value: Any) -> float:
        return _finite(value, 0.0, *MODEL_Y_RANGE)

    @field_validator("w", "h", mode="before")
    @classmethod
    def _size(cls, value: Any) -> float:
        return _finite(value, 100.0, MODEL_FRAME_MIN, MODEL_FRAME_BIGGEST)

    @field_validator("hide", mode="before")
    @classmethod
    def _hide(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        out: list[str] = []
        for v in value:
            ident = _optional_id(v)
            if ident is not None and ident not in out:
                out.append(ident)
        return out[:MODEL_FRAME_HIDE_MAX]


class ModelContent(BaseModel):
    """A model and everything in it. A draft may be unfinished (no name, dangling ids); publish_faults says what stops it being published."""

    name: str = Field(default="", max_length=MODEL_NAME_MAX)
    description: str = Field(default="", max_length=MODEL_DESCRIPTION_MAX)
    shapes: list[ModelShape] = Field(default_factory=list, max_length=MODEL_MAX_SHAPES)
    objects: list[ModelObject] = Field(default_factory=list, max_length=MODEL_MAX_OBJECTS)
    groups: list[ModelGroup] = Field(default_factory=list, max_length=MODEL_MAX_GROUPS)
    # The line the model mirrors about (left/right twins and mirror editing), and its sliders.
    axis: float = 100.0
    ranges: list[ModelRange] = Field(default_factory=list, max_length=MODEL_RANGES_MAX)
    # Named sets of slider values and hidden objects (phase 3).
    presets: list[ModelPreset] = Field(default_factory=list, max_length=MODEL_PRESETS_MAX)
    # Template objects and their members (phase 3b).
    classes: list[ModelClass] = Field(default_factory=list, max_length=MODEL_CLASSES_MAX)
    # Colour (phase 4): the genre tags, the starter palette a new character gets, and the colour slots shapes are painted from.
    genres: list[ModelGenre] = Field(default_factory=list, max_length=MODEL_GENRES_MAX)
    palette: list[ModelSwatch] = Field(default_factory=list, max_length=MODEL_PALETTE_MAX)
    slots: list[ModelSlot] = Field(default_factory=list, max_length=MODEL_SLOTS_MAX)
    # Proportions and frames (phase 5a): the skeleton's bones, the bone that is one head high, the named crops, and the card colour a figure stands on.
    bones: list[ModelBone] = Field(default_factory=list, max_length=MODEL_BONES_MAX)
    headBone: Optional[str] = None
    frames: list[ModelFrame] = Field(default_factory=list, max_length=MODEL_FRAMES_MAX)
    tile: str = MODEL_TILE_DEFAULT
    # Hands (phase 5c): the grip points where a held item is taken.
    grips: list[ModelGrip] = Field(default_factory=list, max_length=MODEL_GRIPS_MAX)

    @field_validator("grips", mode="before")
    @classmethod
    def _grips(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelGrip, value)

    @field_validator("bones", mode="before")
    @classmethod
    def _bones(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelBone, value)

    @field_validator("frames", mode="before")
    @classmethod
    def _frames(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelFrame, value)

    @field_validator("headBone", mode="before")
    @classmethod
    def _head_bone(cls, value: Any) -> Optional[str]:
        return _optional_id(value)

    @field_validator("tile", mode="before")
    @classmethod
    def _tile(cls, value: Any) -> str:
        return value.lower() if isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value) else MODEL_TILE_DEFAULT

    @field_validator("genres", mode="before")
    @classmethod
    def _genres(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelGenre, value)

    @field_validator("palette", mode="before")
    @classmethod
    def _palette(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelSwatch, value)

    @field_validator("slots", mode="before")
    @classmethod
    def _slots(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelSlot, value)

    @field_validator("classes", mode="before")
    @classmethod
    def _classes(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelClass, value)

    @field_validator("presets", mode="before")
    @classmethod
    def _presets(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelPreset, value)

    @field_validator("name", "description", mode="before")
    @classmethod
    def _trim(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("axis", mode="before")
    @classmethod
    def _axis(cls, value: Any) -> float:
        return _finite(value, 100.0, *MODEL_AXIS_RANGE)

    @field_validator("ranges", mode="before")
    @classmethod
    def _ranges(cls, value: Any) -> list[Any]:
        return _keep_valid(ModelRange, value)

    @model_validator(mode="after")
    def _unique_ids(self) -> "ModelContent":
        for label, items in (("shape", self.shapes), ("object", self.objects), ("group", self.groups), ("slider", self.ranges), ("preset", self.presets), ("class", self.classes), ("genre", self.genres), ("swatch", self.palette), ("slot", self.slots), ("bone", self.bones), ("frame", self.frames)):
            ids = [i.id for i in items]
            if len(set(ids)) != len(ids):
                raise ValueError(f"two {label}s share an id")
        return self


class PublishedModel(BaseModel):
    """One numbered, frozen copy of a model's content."""

    version: int
    publishedAt: datetime = Field(default_factory=utcnow)
    content: ModelContent


class ModelEntry(BaseModel):
    id: str = Field(pattern=_MODEL_ID)
    draft: ModelContent
    # The copy the Writer's editor will offer; None until published, and again after Unpublish.
    published: Optional[PublishedModel] = None
    # Earlier published versions, newest first (the current one is `published`, not here).
    history: list[PublishedModel] = Field(default_factory=list, max_length=MODEL_HISTORY_MAX)
    # The version the next publish gets; it only ever goes up, so an unpublished model keeps counting.
    nextVersion: int = 1


class ModelCatalog(BaseModel):
    schemaVersion: int = CHARACTER_MODELS_SCHEMA_VERSION
    models: list[ModelEntry] = Field(default_factory=list, max_length=MODEL_MAX_MODELS)


class ModelDraftIn(BaseModel):
    id: str = Field(pattern=_MODEL_ID)
    draft: ModelContent


class ModelDraftList(BaseModel):
    """What the admin page saves: just the drafts, in order. Published copies and history are never touched by a save, and a model left out is deleted."""

    models: list[ModelDraftIn] = Field(default_factory=list, max_length=MODEL_MAX_MODELS)

    @model_validator(mode="after")
    def _unique(self) -> "ModelDraftList":
        ids = [m.id for m in self.models]
        if len(set(ids)) != len(ids):
            raise ValueError("two models share an id")
        return self


class PublishedModelOut(BaseModel):
    """What the Writer's editor will read: a published model, with its id."""

    id: str
    version: int
    publishedAt: datetime
    content: ModelContent


class PublishedModelList(BaseModel):
    models: list[PublishedModelOut] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# AUI Configuration: a global (not project-scoped), admin-editable outline of
# Console -> Component -> Feature ideas for each of AUI's Configuration
# sub-tabs (Project Plan, Visitor, User, Reader, Training, Writer, Helper,
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
# Faceted activity (the Schedule console and the header ribbon). Every change is an ActivityEvent for FACET_EVENT_DAYS days; daily totals per
# facet are kept for about a year (DAILY_KEEP_DAYS), whole months older than that fold into monthly totals, which are kept for good. A
# 28-day profile of how many events fell in each 10-minute slot of the day, per facet, feeds the ribbon's "higher or lower than usual".
# Days are the machine's local days. See storage/facet_activity.py.
# ---------------------------------------------------------------------------

Facet = Literal["outline", "plot", "draft", "revision", "project"]
FACETS: tuple[str, ...] = ("outline", "plot", "draft", "revision", "project")
SLOTS_PER_DAY = 144
FACET_EVENT_DAYS = 14
SLOT_PROFILE_DAYS = 28
DAILY_KEEP_DAYS = 372
EventAction = Literal["create", "edit", "delete", "words", "flag", "resolve", "tick", "setting"]


class ActivityEvent(BaseModel):
    ts: str  # ISO 8601 with the machine's UTC offset
    date: str  # the local day, YYYY-MM-DD
    slot: int = Field(ge=0, lt=SLOTS_PER_DAY)  # the local 10-minute slot of the day
    facet: Facet
    action: EventAction
    nodeId: Optional[str] = None
    kind: Optional[str] = None
    label: Optional[str] = None
    # Words changed for a "words" event (negative when words were cut); 1 for the rest.
    amount: int = 1


class DayTotals(BaseModel):
    outline: int = 0
    plot: int = 0
    draft: int = 0  # net words
    revision: int = 0
    project: int = 0
    flagsApplied: int = 0
    flagsResolved: int = 0
    books: dict[str, int] = Field(default_factory=dict)  # book id -> net words
    kinds: dict[str, int] = Field(default_factory=dict)  # node kind -> nodes created


class MonthTotals(DayTotals):
    activeDays: int = 0


class FacetActivity(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    events: list[ActivityEvent] = Field(default_factory=list)
    daily: dict[str, DayTotals] = Field(default_factory=dict)
    monthly: dict[str, MonthTotals] = Field(default_factory=dict)
    slots: dict[str, dict[str, list[int]]] = Field(default_factory=dict)  # date -> facet -> events per slot
    # Whether the older DailyActivityLog (saves per day) has been folded into `daily`.
    legacyFolded: bool = False


# ---------------------------------------------------------------------------
# Revision flags on a draft passage or on the project itself (the outline and plot nodes carry their own NodeFlag).
# ---------------------------------------------------------------------------


class RevisionFlag(BaseModel):
    id: str
    scope: Literal["passage", "project"]
    type: FlagType
    note: str = ""
    # A passage flag: the characters [start, end) of the moment's body. `snippet` is the flagged text, kept so the flag can follow it when the
    # text is edited; `stale` says the text is gone.
    chapterId: Optional[str] = None
    momentId: Optional[str] = None
    start: int = Field(default=0, ge=0)
    end: int = Field(default=0, ge=0)
    snippet: str = Field(default="", max_length=2000)
    stale: bool = False
    createdAt: datetime = Field(default_factory=utcnow)
    resolvedAt: Optional[datetime] = None
    outcome: str = ""


# ---------------------------------------------------------------------------
# The planner: goals, shifts, routines and checklist items. Times are 10-minute slots of the day (0 = midnight, 144 = the next midnight);
# dates are local YYYY-MM-DD. Which items were ticked on a day is the older ScheduleCompletionLog.
# ---------------------------------------------------------------------------

RecurrenceKind = Literal["once", "daily", "weekly", "interval"]
RecurrenceUnit = Literal["day", "week", "month"]
GoalScope = Literal["project", "book", "chapter"]
TargetTree = Literal["outline", "plot"]


class Recurrence(BaseModel):
    kind: RecurrenceKind = "once"
    # weekly: every N weeks (2 = biweekly) on `days`; interval: every N `unit`s counted from the last time it was done (or the anchor).
    every: int = Field(default=1, ge=1, le=365)
    unit: RecurrenceUnit = "day"
    days: list[int] = Field(default_factory=list)  # 0 = Monday .. 6 = Sunday
    # interval only: an irregular range, `every` to `rangeMax` units. Inside the range the routine is low priority but can be ticked;
    # past `rangeMax` it is put on the schedule.
    rangeMax: Optional[int] = Field(default=None, ge=1, le=365)
    anchor: str  # the first day it applies, YYYY-MM-DD
    until: Optional[str] = None

    @model_validator(mode="after")
    def _check(self) -> "Recurrence":
        if any(d < 0 or d > 6 for d in self.days):
            raise ValueError("days must be 0 (Monday) to 6 (Sunday)")
        if self.rangeMax is not None and self.rangeMax < self.every:
            raise ValueError("rangeMax must not be below every")
        return self


class Pause(BaseModel):
    start: str
    end: str


class ShiftOverride(BaseModel):
    """One occurrence of a repeating shift that was changed alone."""

    title: Optional[str] = None
    startSlot: Optional[int] = Field(default=None, ge=0, lt=SLOTS_PER_DAY)
    endSlot: Optional[int] = Field(default=None, gt=0, le=SLOTS_PER_DAY)


TaskPriority = Literal["high", "medium", "low", "none"]


class Subtask(BaseModel):
    id: str
    label: str = Field(max_length=300)
    done: bool = False


class PlanItem(BaseModel):
    """A task. `shiftId` assigns it to a shift; with none it waits in the backlog."""

    id: str
    label: str = Field(max_length=300)
    facet: Optional[Facet] = None
    targetNodeId: Optional[str] = None
    targetTree: Optional[TargetTree] = None
    shiftId: Optional[str] = None
    doneOn: Optional[str] = None  # a one-off item, done on this day
    # How soon it matters: high comes first in the backlog, none waits in a fold. A task saved before priorities existed is medium.
    priority: TaskPriority = "none"
    dueDate: Optional[str] = None  # YYYY-MM-DD
    notes: str = Field(default="", max_length=2000)
    estimateMinutes: Optional[int] = Field(default=None, ge=1, le=24 * 60)
    # An amount of the facet's work the task is for (words for a draft chapter, nodes for an outline or plot node), counted from `addedOn`.
    aim: Optional[int] = Field(default=None, ge=1)
    subtasks: list[Subtask] = Field(default_factory=list)
    addedOn: Optional[str] = None  # YYYY-MM-DD
    # It was on a shift that ended with it undone, and came back to the backlog.
    carried: bool = False
    # The phase it builds to, and the process it is a step of (a task made from a process when it is put on the Agenda).
    phaseId: Optional[str] = None
    # The milestone it is placed in (a section of a phase), which it helps to achieve.
    milestoneId: Optional[str] = None
    processId: Optional[str] = None
    # The step it follows, in an ordered group of a process: it can be ticked once that one is.
    afterId: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _legacy_priority(cls, data: Any) -> Any:
        if isinstance(data, dict) and "priority" not in data:
            return {**data, "priority": "medium"}
        return data


class Routine(BaseModel):
    """An item that comes back: on a pattern, or after an interval (optionally a range)."""

    id: str
    label: str = Field(max_length=300)
    facet: Optional[Facet] = None
    targetNodeId: Optional[str] = None
    targetTree: Optional[TargetTree] = None
    shiftId: Optional[str] = None
    recurrence: Recurrence
    pauses: list[Pause] = Field(default_factory=list)
    lastDone: Optional[str] = None
    phaseId: Optional[str] = None
    milestoneId: Optional[str] = None


class Shift(BaseModel):
    id: str
    title: str = Field(max_length=200)
    facet: Facet
    date: str  # the day of a one-off shift, or the first day of a repeating one
    startSlot: int = Field(ge=0, lt=SLOTS_PER_DAY)
    endSlot: int = Field(gt=0, le=SLOTS_PER_DAY)
    targetNodeId: Optional[str] = None
    targetTree: Optional[TargetTree] = None
    # The amount to do inside the block: words for draft, nodes for outline and plot, flags for revision, items for project.
    target: Optional[int] = Field(default=None, ge=0)
    recurrence: Optional[Recurrence] = None
    pauses: list[Pause] = Field(default_factory=list)
    skipped: list[str] = Field(default_factory=list)  # days of a repeating shift that are not held
    overrides: dict[str, ShiftOverride] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check(self) -> "Shift":
        if self.endSlot <= self.startSlot:
            raise ValueError("a shift must end after it starts")
        return self


class ShiftTemplate(BaseModel):
    id: str
    name: str = Field(max_length=100)
    facet: Facet
    startSlot: int = Field(ge=0, lt=SLOTS_PER_DAY)
    endSlot: int = Field(gt=0, le=SLOTS_PER_DAY)
    target: Optional[int] = Field(default=None, ge=0)
    days: list[int] = Field(default_factory=list)


class Goal(BaseModel):
    id: str
    facet: Facet
    scope: GoalScope = "project"
    nodeId: Optional[str] = None  # the book or chapter of a book/chapter goal
    kind: Optional[str] = None  # outline/plot: count only nodes of this kind
    daily: Optional[int] = Field(default=None, ge=0)
    weekly: Optional[int] = Field(default=None, ge=0)
    total: Optional[int] = Field(default=None, ge=0)
    deadline: Optional[str] = None
    phaseId: Optional[str] = None


class RestRange(BaseModel):
    id: str
    start: str
    end: str
    label: str = Field(default="", max_length=100)


PhaseStatus = Literal["planned", "active", "done"]
PhaseLevel = Literal["project", "book", "chapter"]
ProcessRelation = Literal["before", "after", "with"]


class Phase(BaseModel):
    """A stage of the project, defined by the result it builds to. In a project it has real dates; in the template, an offset from the start and a length."""

    id: str
    title: str = Field(max_length=200)
    result: str = Field(default="", max_length=1000)
    description: str = Field(default="", max_length=2000)
    status: PhaseStatus = "planned"
    start: Optional[str] = None
    end: Optional[str] = None
    offsetDays: Optional[int] = Field(default=None, ge=0, le=3650)
    lengthDays: Optional[int] = Field(default=None, ge=1, le=3650)
    # Which row of the plan it is on: the project, or one of its books or chapters (`nodeId`). A phase saved before levels existed is the project's.
    level: PhaseLevel = "project"
    nodeId: Optional[str] = None
    # The kind of phase it is a pass of ("Revision"), the place in its row's sequence, whether its start is pinned to its date, and which of the kind's
    # fields it has changed on its own (the others follow the kind).
    kindId: Optional[str] = None
    order: int = Field(default=0, ge=0)
    fixed: bool = False
    overrides: list[str] = Field(default_factory=list)


class Milestone(BaseModel):
    """A section of a phase, reached by finishing the work placed in it: a deliverable, with a date (or a length in the sequence), tickable."""

    id: str
    title: str = Field(max_length=200)
    # What is delivered when the milestone is achieved.
    result: str = Field(default="", max_length=1000)
    date: Optional[str] = None
    offsetDays: Optional[int] = Field(default=None, ge=0, le=3650)
    phaseId: Optional[str] = None
    done: bool = False
    doneOn: Optional[str] = None
    order: int = Field(default=0, ge=0)
    lengthDays: Optional[int] = Field(default=None, ge=1, le=3650)
    fixed: bool = False
    kindMilestoneId: Optional[str] = None
    overrides: list[str] = Field(default_factory=list)


class PhaseKindMilestone(BaseModel):
    id: str
    title: str = Field(max_length=200)
    result: str = Field(default="", max_length=1000)
    lengthDays: Optional[int] = Field(default=None, ge=1, le=3650)


class PhaseKind(BaseModel):
    """A recipe for a phase that comes round (a Revision pass): its result, length and milestones. A pass starts from it and follows it in what it has not changed."""

    id: str
    title: str = Field(max_length=200)
    result: str = Field(default="", max_length=1000)
    description: str = Field(default="", max_length=2000)
    lengthDays: Optional[int] = Field(default=None, ge=1, le=3650)
    milestones: list[PhaseKindMilestone] = Field(default_factory=list)


class ProcessStep(BaseModel):
    id: str
    label: str = Field(max_length=300)
    estimateMinutes: Optional[int] = Field(default=None, ge=1, le=24 * 60)
    facet: Optional[Facet] = None


class StepGroup(BaseModel):
    """Steps done in order (one then the next) or in any order (a set to tick off)."""

    id: str
    ordered: bool = True
    steps: list[ProcessStep] = Field(default_factory=list)


class ProcessLink(BaseModel):
    """How a process relates to another: this one comes `before` or `after` it (ordered), or `with` it (unordered: related, or done at the same time)."""

    otherId: str
    relation: ProcessRelation


class Process(BaseModel):
    """A repeatable recipe of steps, for several phases and facets, which may need milestones first."""

    id: str
    title: str = Field(max_length=200)
    description: str = Field(default="", max_length=2000)
    phaseIds: list[str] = Field(default_factory=list)
    milestoneIds: list[str] = Field(default_factory=list)  # the milestones it is placed in
    facets: list[Facet] = Field(default_factory=list)
    requiredMilestoneIds: list[str] = Field(default_factory=list)
    groups: list[StepGroup] = Field(default_factory=list)
    links: list[ProcessLink] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check(self) -> "Process":
        if any(link.otherId == self.id for link in self.links):
            raise ValueError("a process cannot be linked to itself")
        return self


class Exercise(BaseModel):
    """A writing drill: a prompt, a length, how often it is suggested and how often it has been done."""

    id: str
    title: str = Field(max_length=200)
    description: str = Field(default="", max_length=2000)  # the prompt
    durationMinutes: int = Field(default=15, ge=1, le=24 * 60)
    facets: list[Facet] = Field(default_factory=list)
    phaseIds: list[str] = Field(default_factory=list)
    milestoneIds: list[str] = Field(default_factory=list)
    perWeek: Optional[int] = Field(default=None, ge=1, le=21)
    timesDone: int = Field(default=0, ge=0)
    lastDone: Optional[str] = None


class Planner(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    timelineStart: Optional[str] = None
    timelineEnd: Optional[str] = None
    goals: list[Goal] = Field(default_factory=list)
    shifts: list[Shift] = Field(default_factory=list)
    routines: list[Routine] = Field(default_factory=list)
    items: list[PlanItem] = Field(default_factory=list)
    templates: list[ShiftTemplate] = Field(default_factory=list)
    restDays: list[RestRange] = Field(default_factory=list)
    reminderLeadMinutes: Optional[int] = Field(default=None, ge=0, le=240)
    # What the project is made of: the phases that build to its results, the milestones along them, the processes and exercises it uses.
    phases: list[Phase] = Field(default_factory=list)
    milestones: list[Milestone] = Field(default_factory=list)
    processes: list[Process] = Field(default_factory=list)
    exercises: list[Exercise] = Field(default_factory=list)
    # The recipes for phases that come round.
    phaseKinds: list[PhaseKind] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# ProjectFile: the single on-disk file a project is stored as (project.json),
# consolidating what used to be ~10 separate shard files (index, outline,
# plot, per-chapter drafts, per-chapter revisions, outline/plot history,
# activity, schedule, scrap) into one. Every field reuses an existing
# per-section model unchanged -- this is purely a container.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Maps (the setting): a map is a grid of terrain cells (painted, run-length encoded) with layers; maps nest (a place on a map opens a child map).
# Like every section, a bad value is cut or repaired, never refused, so one odd map cannot take the project's other maps down with it.
# ---------------------------------------------------------------------------

MAP_MAX_SIDE = 512
MAP_MAX_TERRAINS = 64
MAP_MAX_LAYERS = 30
MAP_MAX_PER_PROJECT = 500
MapKind = Literal["world", "town", "interior"]
MapLayerKind = Literal["terrain", "shapes", "symbols", "labels", "notes"]
_MAP_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")

# The terrain a new map starts with, by kind (the first is what a new map is filled with). Copied into the map, so a map keeps its own palette.
MAP_TERRAIN_SETS: dict[str, list[tuple[str, str, str]]] = {
    "world": [
        ("ocean", "Ocean", "#3b6ea5"), ("plains", "Plains", "#a8c66c"), ("forest", "Forest", "#4f8a4a"), ("hills", "Hills", "#c9a36a"),
        ("mountains", "Mountains", "#8a8f98"), ("desert", "Desert", "#e3c77a"), ("snow", "Snow", "#eef3f7"), ("swamp", "Swamp", "#5f7d62"),
    ],
    "town": [("ground", "Ground", "#d8cfb4"), ("road", "Road", "#8a8076"), ("building", "Building", "#b5654a"), ("park", "Park", "#7fb069"), ("water", "Water", "#4a86b8")],
    "interior": [("void", "Outside", "#2a2330"), ("floor", "Floor", "#d9c8a8"), ("wall", "Wall", "#5a4a42"), ("door", "Door", "#9a6a3a"), ("water", "Water", "#4a86b8")],
}
# The layers a new map starts with, bottom to top.
MAP_DEFAULT_LAYERS: list[tuple[str, str, str]] = [
    ("terrain", "Terrain", "terrain"), ("shapes", "Regions and lines", "shapes"), ("symbols", "Symbols", "symbols"), ("labels", "Labels", "labels"), ("notes", "Notes", "notes"),
]


class MapTerrain(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    name: str = Field(default="", max_length=40)
    color: str = "#888888"
    builtIn: bool = False

    @field_validator("name", mode="before")
    @classmethod
    def _cut_name(cls, value: Any) -> Any:
        return value.strip()[:40] if isinstance(value, str) else ""

    @field_validator("color", mode="before")
    @classmethod
    def _color_or_grey(cls, value: Any) -> Any:
        return value if isinstance(value, str) and _MAP_HEX_COLOR.match(value) else "#888888"


class MapLayer(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    name: str = Field(default="", max_length=40)
    kind: MapLayerKind = "shapes"
    visible: bool = True
    locked: bool = False

    @field_validator("name", mode="before")
    @classmethod
    def _cut_layer_name(cls, value: Any) -> Any:
        return value.strip()[:40] if isinstance(value, str) else ""


def repair_map_runs(runs: Any, total: int, terrains: int) -> list[int]:
    """The painted cells as run pairs [terrain index, count, ...] that cover exactly `total` cells: a bad pair is dropped, an index past the palette
    becomes the first terrain, a surplus is cut and a shortfall is filled with the first terrain; neighbouring runs of one terrain are joined."""
    pairs: list[tuple[int, int]] = []
    left = total
    items = runs if isinstance(runs, list) else []
    for i in range(0, len(items) - 1, 2):
        value, count = items[i], items[i + 1]
        if not (isinstance(value, int) and isinstance(count, int)) or isinstance(value, bool) or isinstance(count, bool) or count < 1 or value < 0:
            continue
        count = min(count, left)
        if count < 1:
            break
        pairs.append((value if 0 <= value < terrains else 0, count))
        left -= count
    if left > 0:
        pairs.append((0, left))
    out: list[int] = []
    for value, count in pairs:
        if out and out[-2] == value:
            out[-1] += count
        else:
            out.extend((value, count))
    return out


MAP_MAX_SYMBOLS = 5000
MAP_MAX_PLACE_MAPS = 20
MAP_MAX_LABELS = 1000
MapThemeName = Literal["parchment", "modern", "night", "blueprint"]


def _finite(value: Any, default: float, low: float, high: float) -> float:
    """A number held to a range; anything that is not a finite number is the default."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value or value in (float("inf"), float("-inf")):
        return default
    return min(high, max(low, float(value)))


class MapSymbol(BaseModel):
    """A stamp on a map (a town, a tree, a door ...): `kind` names a symbol of the front end's library, `x` and `y` are its centre in cells."""

    id: str = Field(min_length=1, max_length=40)
    layerId: str = Field(min_length=1, max_length=40)
    kind: str = Field(min_length=1, max_length=40)
    x: float = 0.0
    y: float = 0.0
    # How many cells wide it is drawn.
    size: float = 2.0
    # Its own colour (#rrggbb); none = the map theme's symbol colour.
    color: Optional[str] = None
    # A symbol with a name is a place: a scene's location can be it, and `mapIds` are the maps that open from it (a town's map, the floors of a building).
    name: str = Field(default="", max_length=80)
    mapIds: list[str] = Field(default_factory=list)

    @field_validator("x", "y", mode="before")
    @classmethod
    def _coordinate(cls, value: Any) -> Any:
        return _finite(value, 0.0, -1.0, 100000.0)

    @field_validator("size", mode="before")
    @classmethod
    def _size(cls, value: Any) -> Any:
        return _finite(value, 2.0, 0.25, 16.0)

    @field_validator("color", mode="before")
    @classmethod
    def _color_or_none(cls, value: Any) -> Any:
        return value if isinstance(value, str) and _MAP_HEX_COLOR.match(value) else None

    @field_validator("name", mode="before")
    @classmethod
    def _cut_name(cls, value: Any) -> Any:
        return value.strip()[:80] if isinstance(value, str) else ""

    @field_validator("mapIds", mode="before")
    @classmethod
    def _map_ids(cls, value: Any) -> Any:
        out: list[str] = []
        for item in value if isinstance(value, list) else []:
            if isinstance(item, str) and 0 < len(item) <= 80 and item not in out:
                out.append(item)
        return out[:MAP_MAX_PLACE_MAPS]


class MapLabel(BaseModel):
    """A line of text on a map, centred on `x`, `y` (cells); `size` is its height in cells."""

    id: str = Field(min_length=1, max_length=40)
    layerId: str = Field(min_length=1, max_length=40)
    text: str = Field(default="", max_length=120)
    x: float = 0.0
    y: float = 0.0
    size: float = 1.0

    @field_validator("text", mode="before")
    @classmethod
    def _cut_text(cls, value: Any) -> Any:
        return value.strip()[:120] if isinstance(value, str) else ""

    @field_validator("x", "y", mode="before")
    @classmethod
    def _coordinate(cls, value: Any) -> Any:
        return _finite(value, 0.0, -1.0, 100000.0)

    @field_validator("size", mode="before")
    @classmethod
    def _size(cls, value: Any) -> Any:
        return _finite(value, 1.0, 0.25, 16.0)


MAP_MAX_SHAPES = 2000
MAP_MAX_SHAPE_POINTS = 500
MapShapeType = Literal["line", "region"]
MapLineStyle = Literal["solid", "dashed", "dotted", "road", "wall", "fence"]
MapPattern = Literal["solid", "hatch", "cross", "dots"]
_SHAPE_MIN_POINTS = {"line": 2, "region": 3}


class MapShapePoint(BaseModel):
    """A point of a line or the outline of a region, in cells. A smooth point is a curve through it: `hx`, `hy` is the handle (where the curve leaves it,
    relative to the point; the curve arrives on the opposite side), or none for the handle the neighbouring points make."""

    x: float = 0.0
    y: float = 0.0
    smooth: bool = False
    hx: Optional[float] = None
    hy: Optional[float] = None

    @field_validator("x", "y", mode="before")
    @classmethod
    def _coordinate(cls, value: Any) -> Any:
        return _finite(value, 0.0, -1.0, 100000.0)

    @field_validator("smooth", mode="before")
    @classmethod
    def _smooth_flag(cls, value: Any) -> Any:
        return value if isinstance(value, bool) else False

    @field_validator("hx", "hy", mode="before")
    @classmethod
    def _handle(cls, value: Any) -> Any:
        return None if value is None else _finite(value, 0.0, -1000.0, 1000.0)

    @model_validator(mode="after")
    def _both_or_neither(self) -> "MapShapePoint":
        if self.hx is None or self.hy is None:
            self.hx = self.hy = None
        return self


class MapShape(BaseModel):
    """A line (a river, a road, a border, a wall, a fence) or a region (a closed outline, filled) drawn over the terrain."""

    id: str = Field(min_length=1, max_length=40)
    layerId: str = Field(min_length=1, max_length=40)
    type: MapShapeType
    points: list[MapShapePoint] = Field(default_factory=list)
    # How the line, or the outline of a region, is drawn: its style, its colour (#rrggbb; none = the map look's ink) and how wide, in cells.
    style: MapLineStyle = "solid"
    color: Optional[str] = None
    width: float = 0.25
    # A region's fill: its colour (none = the line colour), how solid it is (0-1) and a pattern over it.
    fill: Optional[str] = None
    opacity: float = 0.35
    pattern: MapPattern = "solid"

    @field_validator("points", mode="before")
    @classmethod
    def _points_read(cls, value: Any) -> Any:
        return _valid_items(value, MapShapePoint)[:MAP_MAX_SHAPE_POINTS]

    @field_validator("style", mode="before")
    @classmethod
    def _style_or_solid(cls, value: Any) -> Any:
        return value if value in ("solid", "dashed", "dotted", "road", "wall", "fence") else "solid"

    @field_validator("pattern", mode="before")
    @classmethod
    def _pattern_or_solid(cls, value: Any) -> Any:
        return value if value in ("solid", "hatch", "cross", "dots") else "solid"

    @field_validator("color", "fill", mode="before")
    @classmethod
    def _color_or_none(cls, value: Any) -> Any:
        return value if isinstance(value, str) and _MAP_HEX_COLOR.match(value) else None

    @field_validator("width", mode="before")
    @classmethod
    def _width(cls, value: Any) -> Any:
        return _finite(value, 0.25, 0.05, 4.0)

    @field_validator("opacity", mode="before")
    @classmethod
    def _opacity(cls, value: Any) -> Any:
        return _finite(value, 0.35, 0.0, 1.0)


def _valid_items(value: Any, model: Any) -> list[Any]:
    """The items of a list that read as `model`; one that does not is dropped, so it cannot refuse the whole map."""
    out: list[Any] = []
    for item in value if isinstance(value, list) else []:
        try:
            out.append(model.model_validate(item))
        except ValueError:
            continue
    return out


READER_MAX_CHAPTER = 10000
READER_MAX_REVEALS = 2000
READER_MAX_FIELDS = 60
# The parts of a character's profile that can be shown to readers (a field of the author's own is "field:<its id>"). The look is always shown with a published character.
CHARACTER_SHARE_FIELDS = (
    "role", "age", "occupation", "aliases", "summary", "appearance", "height", "build", "skin", "hair", "eyes", "face", "voice", "bearing", "style", "marks",
    "personality", "goal", "motivation", "fear", "flaw", "strength", "background", "possessions", "relationships",
)


class ReaderShare(BaseModel):
    """What the author lets readers see of a map or a character. Nothing is shown until `published`. `revealAt` is the chapter, by the numbers of the published edition,
    from which it is shown (none = from the start). `reveals` holds the same for a part of it: a map's symbols, labels and shapes (by id), a character's fields (by key).
    `fields` (a character) are the fields shown."""

    published: bool = False
    revealAt: Optional[int] = None
    reveals: dict[str, int] = Field(default_factory=dict)
    fields: list[str] = Field(default_factory=list)

    @field_validator("published", mode="before")
    @classmethod
    def _published(cls, value: Any) -> Any:
        return value is True

    @field_validator("revealAt", mode="before")
    @classmethod
    def _reveal_or_none(cls, value: Any) -> Any:
        return value if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= READER_MAX_CHAPTER else None

    @field_validator("reveals", mode="before")
    @classmethod
    def _reveals(cls, value: Any) -> Any:
        out: dict[str, int] = {}
        for key, chapter in (value.items() if isinstance(value, dict) else []):
            if isinstance(key, str) and 0 < len(key) <= 80 and isinstance(chapter, int) and not isinstance(chapter, bool) and 1 <= chapter <= READER_MAX_CHAPTER:
                out[key] = chapter
            if len(out) >= READER_MAX_REVEALS:
                break
        return out

    @field_validator("fields", mode="before")
    @classmethod
    def _fields(cls, value: Any) -> Any:
        out: list[str] = []
        for item in value if isinstance(value, list) else []:
            if isinstance(item, str) and 0 < len(item) <= 60 and item not in out:
                out.append(item)
            if len(out) >= READER_MAX_FIELDS:
                break
        return out


def _share_of(value: Any) -> Any:
    return value if isinstance(value, (dict, ReaderShare)) else {}


MAP_MAX_JOURNEYS = 40
MAP_MAX_STOPS = 200
MAP_MAX_VERSIONS = 12


class MapJourneyStop(BaseModel):
    """Where a character is at a point of the story: a cell position (`x`, `y`), `at` the outline chapter or scene from which they are there, and a note."""

    id: str = Field(min_length=1, max_length=40)
    x: float = 0.0
    y: float = 0.0
    at: str = Field(default="", max_length=80)
    note: str = Field(default="", max_length=200)

    @field_validator("x", "y", mode="before")
    @classmethod
    def _coordinate(cls, value: Any) -> Any:
        return _finite(value, 0.0, -1.0, 100000.0)

    @field_validator("at", "note", mode="before")
    @classmethod
    def _text(cls, value: Any) -> Any:
        return value.strip()[:200] if isinstance(value, str) else ""


class MapJourney(BaseModel):
    """The path of a character over the map: stops in the order of the story. `color` draws it (none = a colour from the map look's palette)."""

    id: str = Field(min_length=1, max_length=40)
    characterId: str = Field(min_length=1, max_length=80)
    color: Optional[str] = None
    stops: list[MapJourneyStop] = Field(default_factory=list)

    @field_validator("color", mode="before")
    @classmethod
    def _color_or_none(cls, value: Any) -> Any:
        return value if isinstance(value, str) and _MAP_HEX_COLOR.match(value) else None

    @field_validator("stops", mode="before")
    @classmethod
    def _stops(cls, value: Any) -> Any:
        seen: set[str] = set()
        out: list[MapJourneyStop] = []
        for item in _valid_items(value, MapJourneyStop):
            if item.id not in seen:
                seen.add(item.id)
                out.append(item)
        return out[:MAP_MAX_STOPS]


class MapDoc(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    id: str = Field(min_length=1, max_length=80)
    title: str = Field(default="Untitled map", max_length=120)
    kind: MapKind = "world"
    # The map this one is inside (a place on the parent opens this map), and its place among its siblings.
    parentId: Optional[str] = None
    order: int = 0
    width: int = Field(default=32, ge=1, le=MAP_MAX_SIDE)
    height: int = Field(default=24, ge=1, le=MAP_MAX_SIDE)
    # What one cell is, in `unit` (miles, paces, feet ...).
    cellSize: float = Field(default=1.0, gt=0, le=1_000_000)
    unit: str = Field(default="cells", max_length=20)
    # How far a traveller goes in a day, in `unit` (none = not set): the Measure tool turns a distance into days with it.
    pace: Optional[float] = None
    terrains: list[MapTerrain] = Field(default_factory=list)
    layers: list[MapLayer] = Field(default_factory=list)
    # The terrain of every cell, row by row, as run pairs [index into `terrains`, how many cells, ...].
    cells: list[int] = Field(default_factory=list)
    # The stamps and the text on the map, each on a layer of the matching kind (symbols, labels).
    symbols: list[MapSymbol] = Field(default_factory=list)
    labels: list[MapLabel] = Field(default_factory=list)
    # The lines and regions drawn over the terrain, each on a layer of the kind `shapes`.
    shapes: list[MapShape] = Field(default_factory=list)
    # The look of the map (how the terrain colours and the text are drawn) and what is drawn over it.
    theme: MapThemeName = "modern"
    scaleBar: bool = True
    compass: bool = True
    legend: bool = False
    # What readers may see of this map (see ReaderShare); `reveals` is keyed by the ids of its symbols, labels and shapes.
    reader: ReaderShare = Field(default_factory=ReaderShare)
    # A version of another map as it is later in the story: `versionOf` is the map it is a version of (the first one, never a version itself), `appliesFrom` the outline
    # chapter or scene from which it is the map that is true. A version is not in the tree of maps and its symbols are not places (the first map's are).
    versionOf: Optional[str] = None
    appliesFrom: Optional[str] = None
    # The paths of characters over the map (never shown to readers).
    journeys: list[MapJourney] = Field(default_factory=list)
    updatedAt: datetime = Field(default_factory=utcnow)

    @field_validator("versionOf", "appliesFrom", mode="before")
    @classmethod
    def _id_or_none(cls, value: Any) -> Any:
        return value.strip()[:80] if isinstance(value, str) and value.strip() else None

    @field_validator("journeys", mode="before")
    @classmethod
    def _journeys(cls, value: Any) -> Any:
        seen: set[str] = set()
        out: list[MapJourney] = []
        for item in _valid_items(value, MapJourney):
            if item.id not in seen:
                seen.add(item.id)
                out.append(item)
        return out[:MAP_MAX_JOURNEYS]

    @field_validator("reader", mode="before")
    @classmethod
    def _reader_share(cls, value: Any) -> Any:
        return _share_of(value)

    @field_validator("pace", mode="before")
    @classmethod
    def _pace_or_none(cls, value: Any) -> Any:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value or not 0 < value <= 1_000_000:
            return None
        return float(value)

    @field_validator("symbols", mode="before")
    @classmethod
    def _symbols_read(cls, value: Any) -> Any:
        return _valid_items(value, MapSymbol)

    @field_validator("labels", mode="before")
    @classmethod
    def _labels_read(cls, value: Any) -> Any:
        return _valid_items(value, MapLabel)

    @field_validator("shapes", mode="before")
    @classmethod
    def _shapes_read(cls, value: Any) -> Any:
        return _valid_items(value, MapShape)

    @field_validator("theme", mode="before")
    @classmethod
    def _theme_or_modern(cls, value: Any) -> Any:
        return value if value in ("parchment", "modern", "night", "blueprint") else "modern"

    @field_validator("scaleBar", "compass", "legend", mode="before")
    @classmethod
    def _flag(cls, value: Any, info: Any) -> Any:
        return value if isinstance(value, bool) else info.field_name != "legend"

    @field_validator("cells", mode="before")
    @classmethod
    def _cells_as_numbers(cls, value: Any) -> Any:
        # Anything that is not a whole number becomes -1, which repair_map_runs drops with its pair, so a stray value cannot refuse the whole map.
        if not isinstance(value, list):
            return []
        return [v if isinstance(v, int) and not isinstance(v, bool) else -1 for v in value]

    @field_validator("title", mode="before")
    @classmethod
    def _title_or_default(cls, value: Any) -> Any:
        text = value.strip()[:120] if isinstance(value, str) else ""
        return text or "Untitled map"

    @field_validator("unit", mode="before")
    @classmethod
    def _unit_or_default(cls, value: Any) -> Any:
        text = value.strip()[:20] if isinstance(value, str) else ""
        return text or "cells"

    @model_validator(mode="after")
    def _repair(self) -> "MapDoc":
        seen: set[str] = set()
        terrains: list[MapTerrain] = []
        for t in self.terrains[:MAP_MAX_TERRAINS]:
            if t.id not in seen:
                seen.add(t.id)
                terrains.append(t)
        if not terrains:
            terrains = [MapTerrain(id=i, name=n, color=c, builtIn=True) for i, n, c in MAP_TERRAIN_SETS[self.kind]]
        self.terrains = terrains
        layers: list[MapLayer] = []
        seen = set()
        for layer in self.layers[:MAP_MAX_LAYERS]:
            if layer.id not in seen:
                seen.add(layer.id)
                layers.append(layer)
        if not any(layer.kind == "terrain" for layer in layers):
            layers.insert(0, MapLayer(id="terrain", name="Terrain", kind="terrain", locked=False))
        self.layers = layers
        self.cells = repair_map_runs(self.cells, self.width * self.height, len(terrains))
        self.symbols = self._kept(self.symbols, "symbols", MAP_MAX_SYMBOLS)
        self.labels = self._kept(self.labels, "labels", MAP_MAX_LABELS)
        self.shapes = self._kept_shapes()
        return self

    def _kept_shapes(self) -> list[MapShape]:
        """The shapes that sit on a shapes layer and have enough points (2 for a line, 3 for a region), each id once, at most MAP_MAX_SHAPES, held to the map."""
        layer_ids = {layer.id for layer in self.layers if layer.kind == "shapes"}
        seen: set[str] = set()
        out: list[MapShape] = []
        for shape in self.shapes:
            if shape.layerId not in layer_ids or shape.id in seen or len(shape.points) < _SHAPE_MIN_POINTS[shape.type]:
                continue
            seen.add(shape.id)
            for p in shape.points:
                p.x = min(float(self.width), max(0.0, p.x))
                p.y = min(float(self.height), max(0.0, p.y))
            out.append(shape)
            if len(out) >= MAP_MAX_SHAPES:
                break
        return out

    def _kept(self, items: list[Any], kind: str, limit: int) -> list[Any]:
        """The items that sit on a layer of their kind, each id once, at most `limit`, held to the map."""
        layer_ids = {layer.id for layer in self.layers if layer.kind == kind}
        seen: set[str] = set()
        out: list[Any] = []
        for item in items:
            if item.layerId not in layer_ids or item.id in seen:
                continue
            seen.add(item.id)
            item.x = min(float(self.width), max(0.0, item.x))
            item.y = min(float(self.height), max(0.0, item.y))
            out.append(item)
            if len(out) >= limit:
                break
        return out


# ---------------------------------------------------------------------------
# Characters (the cast): a character is its look (the parameters the front end draws it from: part ids, colours, sliders, marks, an outfit and a pose; no
# images are stored). The ids name entries of the front end's part library, which falls back to a default for one it does not know, so a look from a newer
# build still draws. Like every section, a bad value is cut or repaired, never refused.
# ---------------------------------------------------------------------------

CHARACTER_MAX_PER_PROJECT = 300
CHARACTER_MAX_MARKS = 40
CHARACTER_MAX_STROKES = 12
CHARACTER_MAX_STROKE_POINTS = 48
CHARACTER_MAX_ACCESSORIES = 8
CharacterMarkKind = Literal["freckles", "mole", "scar", "birthmark", "tattoo", "blush", "makeup", "paint"]


def _part_id(value: Any, default: Optional[str]) -> Optional[str]:
    """The id of an entry of the part library: a short trimmed string (the default when it is not one)."""
    text = value.strip()[:40] if isinstance(value, str) else ""
    return text or default


def _hex_or(value: Any, default: Optional[str]) -> Optional[str]:
    return value if isinstance(value, str) and _MAP_HEX_COLOR.match(value) else default


class CharacterMark(BaseModel):
    """A mark on the body: freckles, a mole, a scar, a birthmark, a tattoo, blush, make-up or face paint, `design` from the library, on an `area`.

    `x` and `y` place it on the area (0 to 1 across and down); `strokes` are the lines of a tattoo the author drew (points 0 to 1 on the area)."""

    id: str = Field(min_length=1, max_length=40)
    kind: CharacterMarkKind = "freckles"
    design: str = Field(default="", max_length=40)
    area: str = Field(default="cheeks", max_length=40)
    x: float = 0.5
    y: float = 0.5
    size: float = 1.0
    color: Optional[str] = None
    strokes: list[list[list[float]]] = Field(default_factory=list)

    @field_validator("design", "area", mode="before")
    @classmethod
    def _ids(cls, value: Any) -> Any:
        return _part_id(value, "")

    @field_validator("x", "y", mode="before")
    @classmethod
    def _unit(cls, value: Any) -> Any:
        return _finite(value, 0.5, 0.0, 1.0)

    @field_validator("size", mode="before")
    @classmethod
    def _size(cls, value: Any) -> Any:
        return _finite(value, 1.0, 0.2, 3.0)

    @field_validator("color", mode="before")
    @classmethod
    def _color(cls, value: Any) -> Any:
        return _hex_or(value, None)

    @field_validator("strokes", mode="before")
    @classmethod
    def _strokes(cls, value: Any) -> Any:
        out: list[list[list[float]]] = []
        for stroke in value if isinstance(value, list) else []:
            points: list[list[float]] = []
            for pt in stroke if isinstance(stroke, list) else []:
                if isinstance(pt, (list, tuple)) and len(pt) == 2:
                    points.append([_finite(pt[0], 0.5, 0.0, 1.0), _finite(pt[1], 0.5, 0.0, 1.0)])
                if len(points) >= CHARACTER_MAX_STROKE_POINTS:
                    break
            if len(points) >= 2:
                out.append(points)
            if len(out) >= CHARACTER_MAX_STROKES:
                break
        return out


class CharacterOutfit(BaseModel):
    """What the character wears: one garment for each slot (none = nothing), the accessories, and a colour for each slot."""

    top: Optional[str] = "tee"
    bottom: Optional[str] = "trousers"
    shoes: Optional[str] = "shoes"
    outer: Optional[str] = None
    accessories: list[str] = Field(default_factory=list)
    colors: dict[str, str] = Field(default_factory=lambda: {"top": "#4a6fa5", "bottom": "#3b3f4a", "shoes": "#4a3a30", "outer": "#6b5b4a", "accessory": "#c9a227"})

    @field_validator("top", "bottom", "shoes", "outer", mode="before")
    @classmethod
    def _slot(cls, value: Any) -> Any:
        return _part_id(value, None)

    @field_validator("accessories", mode="before")
    @classmethod
    def _accessories(cls, value: Any) -> Any:
        out: list[str] = []
        for item in value if isinstance(value, list) else []:
            text = _part_id(item, None)
            if text and text not in out:
                out.append(text)
            if len(out) >= CHARACTER_MAX_ACCESSORIES:
                break
        return out

    @field_validator("colors", mode="before")
    @classmethod
    def _colors(cls, value: Any) -> Any:
        out: dict[str, str] = {}
        for key, color in (value.items() if isinstance(value, dict) else []):
            if isinstance(key, str) and 0 < len(key) <= 20 and isinstance(color, str) and _MAP_HEX_COLOR.match(color):
                out[key] = color
            if len(out) >= 12:
                break
        return out


class CharacterLook(BaseModel):
    """Everything the figure is drawn from. A slider is a number within a range; an id names an entry of the part library; a colour is #rrggbb."""

    skin: str = "#e0b08a"
    build: str = "average"
    height: float = 1.0
    width: float = 1.0
    shoulders: float = 1.0
    headShape: str = "oval"
    headWidth: float = 1.0
    ears: str = "small"
    earSize: float = 1.0
    eyes: str = "round"
    eyeColor: str = "#5b3a29"
    eyeSize: float = 1.0
    eyeSpacing: float = 1.0
    eyeTilt: float = 0.0
    brows: str = "soft"
    browColor: str = "#3b2a20"
    browThickness: float = 1.0
    browTilt: float = 0.0
    nose: str = "straight"
    noseSize: float = 1.0
    noseWidth: float = 1.0
    mouth: str = "medium"
    mouthSize: float = 1.0
    lipColor: str = "#b5655a"
    facialHair: str = "none"
    facialHairColor: str = "#3b2a20"
    hair: str = "short"
    hairColor: str = "#3b2a20"
    hairLength: float = 0.5
    streakColor: Optional[str] = None
    streakAmount: float = 0.3
    expression: str = "neutral"
    pose: str = "standing"
    # An item in a hand (an id of the library), or none.
    heldLeft: Optional[str] = None
    heldRight: Optional[str] = None
    outfit: CharacterOutfit = Field(default_factory=CharacterOutfit)
    marks: list[CharacterMark] = Field(default_factory=list)

    @field_validator(
        "build", "headShape", "ears", "eyes", "brows", "nose", "mouth", "facialHair", "hair", "expression", "pose", mode="before",
    )
    @classmethod
    def _ids(cls, value: Any, info: Any) -> Any:
        return _part_id(value, CharacterLook.model_fields[info.field_name].default)

    @field_validator("heldLeft", "heldRight", mode="before")
    @classmethod
    def _held(cls, value: Any) -> Any:
        return _part_id(value, None)

    @field_validator("skin", "eyeColor", "browColor", "lipColor", "facialHairColor", "hairColor", mode="before")
    @classmethod
    def _colors(cls, value: Any, info: Any) -> Any:
        return _hex_or(value, CharacterLook.model_fields[info.field_name].default)

    @field_validator("streakColor", mode="before")
    @classmethod
    def _streak(cls, value: Any) -> Any:
        return _hex_or(value, None)

    @field_validator("height", "width", mode="before")
    @classmethod
    def _body(cls, value: Any, info: Any) -> Any:
        return _finite(value, 1.0, 0.7, 1.3 if info.field_name == "height" else 1.4)

    @field_validator("shoulders", mode="before")
    @classmethod
    def _shoulders(cls, value: Any) -> Any:
        return _finite(value, 1.0, 0.8, 1.3)

    @field_validator("headWidth", mode="before")
    @classmethod
    def _head_width(cls, value: Any) -> Any:
        return _finite(value, 1.0, 0.8, 1.2)

    @field_validator("earSize", "eyeSize", "eyeSpacing", "noseSize", "noseWidth", "mouthSize", mode="before")
    @classmethod
    def _feature(cls, value: Any, info: Any) -> Any:
        low, high = {"earSize": (0.6, 1.6), "eyeSize": (0.6, 1.5), "eyeSpacing": (0.7, 1.4)}.get(info.field_name, (0.6, 1.5))
        return _finite(value, 1.0, low, high)

    @field_validator("browThickness", mode="before")
    @classmethod
    def _brow_thickness(cls, value: Any) -> Any:
        return _finite(value, 1.0, 0.5, 2.0)

    @field_validator("eyeTilt", "browTilt", mode="before")
    @classmethod
    def _tilt(cls, value: Any) -> Any:
        return _finite(value, 0.0, -20.0, 20.0)

    @field_validator("hairLength", "streakAmount", mode="before")
    @classmethod
    def _unit(cls, value: Any, info: Any) -> Any:
        return _finite(value, 0.5 if info.field_name == "hairLength" else 0.3, 0.0, 1.0)

    @field_validator("marks", mode="before")
    @classmethod
    def _marks(cls, value: Any) -> Any:
        marks = _valid_items(value, CharacterMark)
        seen: set[str] = set()
        out: list[CharacterMark] = []
        for mark in marks:
            if mark.id in seen:
                continue
            seen.add(mark.id)
            out.append(mark)
            if len(out) >= CHARACTER_MAX_MARKS:
                break
        return out


# The portrait: how the character looks, drawn as a head-and-shoulders card from these choices (front view, flat colour). Every id names an entry of the front end's
# portrait library (an unknown one is kept, and the library falls back to a default when it draws), a colour is #rrggbb (a nullable one follows the hair or the skin when
# it is none), a slider is a number within its range. The ranges are the front end's (`portrait/defaults.ts`); a test keeps the two lists the same.
PORTRAIT_VERSION = 1
PORTRAIT_RANGES: dict[str, tuple[float, float]] = {
    "headWidth": (0.88, 1.12),
    "eyeSize": (0.75, 1.3),
    "eyeSpacing": (0.85, 1.18),
    "eyeTilt": (-10.0, 10.0),
    "noseSize": (0.75, 1.3),
    "noseWidth": (0.75, 1.35),
    "mouthSize": (0.8, 1.25),
    "shoulderWidth": (0.8, 1.25),
    "neckWidth": (0.8, 1.3),
}


class CharacterPortrait(BaseModel):
    version: int = PORTRAIT_VERSION
    age: str = "adult"
    build: str = "average"
    chest: str = "average"
    headShape: str = "oval"
    headWidth: float = 1.0
    ears: str = "average"
    skin: str = "#d9a07a"
    expression: str = "neutral"
    eyes: str = "almond"
    eyeColor: str = "#5a3a24"
    eyeSize: float = 1.0
    eyeSpacing: float = 1.0
    eyeTilt: float = 0.0
    brows: str = "soft"
    browColor: Optional[str] = None
    nose: str = "straight"
    noseSize: float = 1.0
    noseWidth: float = 1.0
    mouth: str = "medium"
    mouthSize: float = 1.0
    shoulderWidth: float = 1.0
    neckWidth: float = 1.0
    lipColor: Optional[str] = None
    hairLength: str = "short"
    hairTexture: str = "1B"
    hairStyle: str = "plain"
    hairFront: str = "none"
    hairline: str = "rounded"
    hairlineHeight: str = "average"
    hairEdges: str = "none"
    hairEnds: str = "straight"
    hairPlacement: str = "front"
    hairColor: str = "#3a2a20"
    highlightColor: Optional[str] = None
    greying: str = "auto"
    facialHair: str = "none"
    facialHairColor: Optional[str] = None
    top: str = "crew"
    topColor: str = "#2f4a5a"
    tileColor: str = "#e6d6c3"
    # Jewellery worn at the neck.
    necklace: str = "none"
    necklaceColor: str = "#cfa83f"
    # The fantasy elements: ears, horns, the style of the eyes (and the colour of the second one) and how many there are, a crown, a hood, and a thing held in a hand raised at
    # the shoulder (on the picture's left or right).
    fantasyEars: str = "none"
    horns: str = "none"
    hornColor: str = "#d8cdb4"
    eyeStyle: str = "normal"
    eyeColor2: str = "#6a8fb3"
    eyeCount: str = "two"
    crown: str = "none"
    crownColor: str = "#d9b04a"
    hood: str = "none"
    hoodColor: str = "#4a3f5e"
    heldItem: str = "none"
    heldSide: str = "right"
    itemColor: str = "#8a5a2b"

    @field_validator(
        "age", "build", "chest", "headShape", "ears", "expression", "eyes", "brows", "nose", "mouth", "hairLength", "hairTexture", "hairStyle", "hairFront",
        "hairline", "hairlineHeight", "hairEdges", "hairEnds", "hairPlacement", "greying", "facialHair", "top",
        "necklace", "fantasyEars", "horns", "eyeStyle", "eyeCount", "crown", "hood", "heldItem", "heldSide", mode="before",
    )
    @classmethod
    def _ids(cls, value: Any, info: Any) -> Any:
        return _part_id(value, CharacterPortrait.model_fields[info.field_name].default)

    @field_validator(
        "skin", "eyeColor", "hairColor", "topColor", "tileColor", "necklaceColor", "hornColor", "eyeColor2", "crownColor", "hoodColor", "itemColor", mode="before",
    )
    @classmethod
    def _colors(cls, value: Any, info: Any) -> Any:
        return _hex_or(value, CharacterPortrait.model_fields[info.field_name].default)

    @field_validator("browColor", "lipColor", "highlightColor", "facialHairColor", mode="before")
    @classmethod
    def _optional_colors(cls, value: Any) -> Any:
        return _hex_or(value, None)

    @field_validator(*PORTRAIT_RANGES, mode="before")
    @classmethod
    def _sliders(cls, value: Any, info: Any) -> Any:
        low, high = PORTRAIT_RANGES[info.field_name]
        return _finite(value, 0.0 if info.field_name == "eyeTilt" else 1.0, low, high)

    @field_validator("version", mode="before")
    @classmethod
    def _version(cls, value: Any) -> Any:
        return value if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 999 else PORTRAIT_VERSION


def _portrait_or_default(value: Any) -> Any:
    return value if isinstance(value, (dict, CharacterPortrait)) else {}


def _portrait_or_none(value: Any) -> Any:
    return value if isinstance(value, (dict, CharacterPortrait)) else None


# ---- the figure of a character (the art mannequin, phase 6) ----
#
# A character may hold a figure: a frozen copy of a published model plus the writer's own choices. The copies are kept once in the project (`ProjectFile.figureModels`,
# keyed by a hash of the content, so the same model version copied twice, by an import or by an edition, is one entry) and every figure points at one of them; the
# choices are small. Nothing here refuses what a writer made: a value, form or colour the copy no longer has is cut when the figure is read, and a list that is too
# long is cut to its limit (the figure is the writer's own data, the way the portrait is).

FIGURE_MODEL_KEY = r"^[0-9a-f]{12}$"
FIGURE_MAX_MODELS = 40       # frozen copies of models in one project
FIGURE_MAX_MINE = 40         # the writer's own styles and presets on one figure
FIGURE_MAX_LOCKS = 300       # objects and groups kept as they are when the look is randomised
FIGURE_MAX_ENTRIES = 600     # sliders, forms, colours and layer offsets on one figure


class FigureModel(BaseModel):
    """A frozen copy of a published model, kept once in the project and shared by every figure that points at it. `id` is a hash of the content; `modelId` and `version`
    say which published model it was copied from (so a writer can tell it from a newer one); the copy never changes when the admin publishes again."""

    id: str = Field(pattern=FIGURE_MODEL_KEY)
    modelId: str = Field(default="", max_length=80)
    version: int = Field(default=0, ge=0)
    name: str = Field(default="", max_length=MODEL_NAME_MAX)
    publishedAt: Optional[datetime] = None
    content: ModelContent

    @field_validator("name", mode="before")
    @classmethod
    def _model_name(cls, value: Any) -> str:
        return _cut(value, MODEL_NAME_MAX)


class FigureColour(BaseModel):
    """The colour chosen for a slot of the model: one of its default colours (`colour`) or a swatch of the character's palette (`swatch`), with the brightness and the
    opacity the writer set inside the slot's range (none: the slot's resting values)."""

    src: Literal["colour", "swatch"] = "colour"
    id: str = Field(pattern=_MODEL_ID)
    l: Optional[float] = None
    a: Optional[float] = None

    @field_validator("l", "a", mode="before")
    @classmethod
    def _percent_or_none(cls, value: Any) -> Optional[float]:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        return _finite(value, 0.0, 0.0, 100.0)


def _figure_ids(value: Any, limit: int) -> list[str]:
    out: list[str] = []
    for v in value if isinstance(value, list) else []:
        ident = _optional_id(v)
        if ident is not None and ident not in out:
            out.append(ident)
        if len(out) >= limit:
            break
    return out


class CharacterFigure(BaseModel):
    """What a writer chose for a character's figure (the model copy itself is `figureModels[model]`): the sliders away from rest (a pose and an expression are values), the
    form on each axis and the member of each family (`objectId.axisId` -> form id, `class:classId` -> member id), the objects not worn, the colour of each slot, the character's
    own palette (none: the model's starter palette), the card colour, the side hanging things fall to, the objects and groups kept as they are when the look is randomised,
    layer offsets (`zoff`), the writer's own styles (`mine`, presets of the same shape the model has) and the genre the look is randomised within."""

    model: str = Field(default="", pattern=r"^([0-9a-f]{12})?$")
    values: dict[str, float] = Field(default_factory=dict)
    forms: dict[str, str] = Field(default_factory=dict)
    hidden: list[str] = Field(default_factory=list)
    colours: dict[str, FigureColour] = Field(default_factory=dict)
    palette: Optional[list[ModelSwatch]] = None
    tile: str = MODEL_TILE_DEFAULT
    fall: ModelFallSide = "down"
    locks: list[str] = Field(default_factory=list)
    zoff: dict[str, int] = Field(default_factory=dict)
    mine: list[ModelPreset] = Field(default_factory=list)
    genre: Optional[str] = None

    @field_validator("model", mode="before")
    @classmethod
    def _figure_model(cls, value: Any) -> str:
        return value if isinstance(value, str) and re.fullmatch(FIGURE_MODEL_KEY, value) else ""

    @field_validator("values", mode="before")
    @classmethod
    def _figure_values(cls, value: Any) -> dict[str, float]:
        if not isinstance(value, dict):
            return {}
        out = {k: _finite(v, 0.0, -1000.0, 1000.0) for k, v in value.items() if _optional_id(k) is not None and isinstance(v, (int, float)) and not isinstance(v, bool)}
        return dict(list(out.items())[:FIGURE_MAX_ENTRIES])

    @field_validator("forms", mode="before")
    @classmethod
    def _figure_forms(cls, value: Any) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        out = {k: v for k, v in value.items() if isinstance(k, str) and 3 <= len(k) <= 170 and _optional_id(v) is not None}
        return dict(list(out.items())[:FIGURE_MAX_ENTRIES])

    @field_validator("hidden", mode="before")
    @classmethod
    def _figure_hidden(cls, value: Any) -> list[str]:
        return _figure_ids(value, FIGURE_MAX_ENTRIES)

    @field_validator("locks", mode="before")
    @classmethod
    def _figure_locks(cls, value: Any) -> list[str]:
        return _figure_ids(value, FIGURE_MAX_LOCKS)

    @field_validator("colours", mode="before")
    @classmethod
    def _figure_colours(cls, value: Any) -> dict[str, Any]:
        if not isinstance(value, dict):
            return {}
        out: dict[str, Any] = {}
        for slot, choice in value.items():
            if _optional_id(slot) is None or len(out) >= FIGURE_MAX_ENTRIES:
                continue
            try:
                out[slot] = FigureColour.model_validate(choice)
            except ValueError:
                continue
        return out

    @field_validator("palette", mode="before")
    @classmethod
    def _figure_palette(cls, value: Any) -> Optional[list[Any]]:
        if not isinstance(value, list):
            return None
        out: list[Any] = []
        for item in value:
            try:
                out.append(ModelSwatch.model_validate(item))
            except ValueError:
                continue
            if len(out) >= MODEL_PALETTE_MAX:
                break
        return out or None

    @field_validator("tile", mode="before")
    @classmethod
    def _figure_tile(cls, value: Any) -> str:
        return value.lower() if isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value) else MODEL_TILE_DEFAULT

    @field_validator("fall", mode="before")
    @classmethod
    def _figure_fall(cls, value: Any) -> str:
        return value if value in ("down", "left", "right", "behind") else "down"

    @field_validator("zoff", mode="before")
    @classmethod
    def _figure_zoff(cls, value: Any) -> dict[str, int]:
        if not isinstance(value, dict):
            return {}
        out = {k: int(round(_finite(v, 0.0, -50.0, 50.0))) for k, v in value.items() if _optional_id(k) is not None and isinstance(v, (int, float)) and not isinstance(v, bool)}
        return dict(list((k, v) for k, v in out.items() if v != 0)[:FIGURE_MAX_ENTRIES])

    @field_validator("mine", mode="before")
    @classmethod
    def _figure_mine(cls, value: Any) -> list[Any]:
        if not isinstance(value, list):
            return []
        out: list[Any] = []
        seen: set[str] = set()
        for item in value:
            try:
                preset = ModelPreset.model_validate(item)
            except ValueError:
                continue
            if preset.id in seen:
                continue
            seen.add(preset.id)
            out.append(preset)
            if len(out) >= FIGURE_MAX_MINE:
                break
        return out

    @field_validator("genre", mode="before")
    @classmethod
    def _figure_genre(cls, value: Any) -> Optional[str]:
        return _optional_id(value)


def _figure_or_none(value: Any) -> Any:
    """A figure as it was stored (a dict or the model), else none; a figure that does not point at a model copy is none."""
    if isinstance(value, CharacterFigure):
        return value if value.model else None
    if isinstance(value, dict) and isinstance(value.get("model"), str) and re.fullmatch(FIGURE_MODEL_KEY, value["model"]):
        return value
    return None


# ---- the profile, the relationships and the story of a character ----

CHARACTER_MAX_FIELDS = 30
CHARACTER_MAX_RELATIONSHIPS = 80
CHARACTER_MAX_CHANGES = 20
CHARACTER_MAX_STATES = 300
CHARACTER_MAX_STAGES = 20
CHARACTER_MAX_EVENTS = 100
CHARACTER_MAX_POSSESSIONS = 80
CHARACTER_MAX_APPEARANCES = 600
RelationshipKind = Literal["family", "friend", "ally", "rival", "enemy", "romance", "mentor", "other"]
FamilyRole = Literal["parent", "child", "spouse", "sibling"]


def _cut(value: Any, limit: int) -> str:
    """A text trimmed and held to a length (anything that is not a text is empty)."""
    return value.strip()[:limit] if isinstance(value, str) else ""


def _unique_items(value: Any, model: Any, limit: int) -> list[Any]:
    """The items of a list that read as `model`, each id once, at most `limit`."""
    seen: set[str] = set()
    out: list[Any] = []
    for item in _valid_items(value, model):
        if item.id in seen:
            continue
        seen.add(item.id)
        out.append(item)
        if len(out) >= limit:
            break
    return out


class CharacterField(BaseModel):
    """A field of the author's own in a profile: a label and its text."""

    id: str = Field(min_length=1, max_length=40)
    label: str = Field(default="", max_length=60)
    value: str = Field(default="", max_length=2000)

    @field_validator("label", mode="before")
    @classmethod
    def _label(cls, value: Any) -> Any:
        return _cut(value, 60)

    @field_validator("value", mode="before")
    @classmethod
    def _value(cls, value: Any) -> Any:
        return _cut(value, 2000)


class CharacterProfile(BaseModel):
    """Who the character is: identity, personality and psychology, background, and fields of the author's own."""

    role: str = ""
    age: str = ""
    occupation: str = ""
    aliases: str = ""
    summary: str = ""
    personality: str = ""
    goal: str = ""
    motivation: str = ""
    fear: str = ""
    flaw: str = ""
    strength: str = ""
    background: str = ""
    # How the character looks, in words (the text side of the look: the art is drawn from the look's numbers, this is what the author writes down or has written from them).
    appearance: str = ""
    height: str = ""
    build: str = ""
    skin: str = ""
    hair: str = ""
    eyes: str = ""
    face: str = ""
    voice: str = ""
    bearing: str = ""
    style: str = ""
    marks: str = ""
    fields: list[CharacterField] = Field(default_factory=list)

    @field_validator("role", "age", "occupation", "aliases", "height", "build", mode="before")
    @classmethod
    def _short(cls, value: Any) -> Any:
        return _cut(value, 120)

    @field_validator("summary", "goal", "motivation", "fear", "flaw", "strength", "skin", "hair", "eyes", "face", "voice", "bearing", "style", "marks", mode="before")
    @classmethod
    def _medium(cls, value: Any) -> Any:
        return _cut(value, 1000)

    @field_validator("personality", "background", "appearance", mode="before")
    @classmethod
    def _long(cls, value: Any) -> Any:
        return _cut(value, 8000)

    @field_validator("fields", mode="before")
    @classmethod
    def _fields(cls, value: Any) -> Any:
        return _unique_items(value, CharacterField, CHARACTER_MAX_FIELDS)


class CharacterPossession(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    name: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=1000)

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, value: Any) -> Any:
        return _cut(value, 80)

    @field_validator("description", mode="before")
    @classmethod
    def _description(cls, value: Any) -> Any:
        return _cut(value, 1000)


class RelationshipChange(BaseModel):
    """How a relationship changes at a point of the story (`at` is an outline chapter or scene)."""

    id: str = Field(min_length=1, max_length=40)
    at: str = Field(default="", max_length=80)
    label: str = Field(default="", max_length=60)
    note: str = Field(default="", max_length=500)

    @field_validator("at", mode="before")
    @classmethod
    def _at(cls, value: Any) -> Any:
        return _cut(value, 80)

    @field_validator("label", mode="before")
    @classmethod
    def _label(cls, value: Any) -> Any:
        return _cut(value, 60)

    @field_validator("note", mode="before")
    @classmethod
    def _note(cls, value: Any) -> Any:
        return _cut(value, 500)


class CharacterRelationship(BaseModel):
    """A typed link to another character, with a description. For a family link, `family` says who the other is to this character (their parent, child, spouse, sibling)."""

    id: str = Field(min_length=1, max_length=40)
    targetId: str = Field(min_length=1, max_length=80)
    kind: RelationshipKind = "other"
    family: Optional[FamilyRole] = None
    label: str = Field(default="", max_length=60)
    description: str = Field(default="", max_length=1000)
    changes: list[RelationshipChange] = Field(default_factory=list)

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, value: Any) -> Any:
        return value if value in ("family", "friend", "ally", "rival", "enemy", "romance", "mentor", "other") else "other"

    @field_validator("family", mode="before")
    @classmethod
    def _family(cls, value: Any) -> Any:
        return value if value in ("parent", "child", "spouse", "sibling") else None

    @field_validator("label", mode="before")
    @classmethod
    def _label(cls, value: Any) -> Any:
        return _cut(value, 60)

    @field_validator("description", mode="before")
    @classmethod
    def _description(cls, value: Any) -> Any:
        return _cut(value, 1000)

    @field_validator("changes", mode="before")
    @classmethod
    def _changes(cls, value: Any) -> Any:
        return _unique_items(value, RelationshipChange, CHARACTER_MAX_CHANGES)


class CharacterState(BaseModel):
    """What is true of the character from a point of the story (`at`, an outline chapter or scene) until the next state: how they are, what they want, where they are,
    what they carry, and optionally how they look then (a copy of the look)."""

    id: str = Field(min_length=1, max_length=40)
    at: str = Field(default="", max_length=80)
    storyTime: str = Field(default="", max_length=80)
    mood: str = Field(default="", max_length=120)
    goal: str = Field(default="", max_length=500)
    where: str = Field(default="", max_length=120)
    note: str = Field(default="", max_length=2000)
    inventory: list[str] = Field(default_factory=list)
    snapshot: Optional[CharacterLook] = None
    # How the character looks in this state (a copy of the portrait); none = not captured.
    portrait: Optional[CharacterPortrait] = None
    # The same for a figure: the choices (the model copy is the character's, in `figureModels`).
    figure: Optional[CharacterFigure] = None

    @field_validator("portrait", mode="before")
    @classmethod
    def _state_portrait(cls, value: Any) -> Any:
        return _portrait_or_none(value)

    @field_validator("figure", mode="before")
    @classmethod
    def _state_figure(cls, value: Any) -> Any:
        return _figure_or_none(value)

    @field_validator("at", "storyTime", mode="before")
    @classmethod
    def _short(cls, value: Any) -> Any:
        return _cut(value, 80)

    @field_validator("mood", "where", mode="before")
    @classmethod
    def _medium(cls, value: Any) -> Any:
        return _cut(value, 120)

    @field_validator("goal", mode="before")
    @classmethod
    def _goal(cls, value: Any) -> Any:
        return _cut(value, 500)

    @field_validator("note", mode="before")
    @classmethod
    def _note(cls, value: Any) -> Any:
        return _cut(value, 2000)

    @field_validator("inventory", mode="before")
    @classmethod
    def _inventory(cls, value: Any) -> Any:
        out: list[str] = []
        for item in value if isinstance(value, list) else []:
            text = _cut(item, 80)
            if text and text not in out:
                out.append(text)
            if len(out) >= 12:
                break
        return out

    @field_validator("snapshot", mode="before")
    @classmethod
    def _snapshot(cls, value: Any) -> Any:
        return value if isinstance(value, (dict, CharacterLook)) else None


class ArcStage(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    name: str = Field(default="", max_length=80)
    note: str = Field(default="", max_length=1000)
    at: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, value: Any) -> Any:
        return _cut(value, 80)

    @field_validator("note", mode="before")
    @classmethod
    def _note(cls, value: Any) -> Any:
        return _cut(value, 1000)

    @field_validator("at", mode="before")
    @classmethod
    def _at(cls, value: Any) -> Any:
        text = _cut(value, 80)
        return text or None


class LifeEvent(BaseModel):
    """An event of the character's life, in story time (`when` is text on the project's time system)."""

    id: str = Field(min_length=1, max_length=40)
    when: str = Field(default="", max_length=80)
    title: str = Field(default="", max_length=120)
    note: str = Field(default="", max_length=1000)

    @field_validator("when", mode="before")
    @classmethod
    def _when(cls, value: Any) -> Any:
        return _cut(value, 80)

    @field_validator("title", mode="before")
    @classmethod
    def _title(cls, value: Any) -> Any:
        return _cut(value, 120)

    @field_validator("note", mode="before")
    @classmethod
    def _note(cls, value: Any) -> Any:
        return _cut(value, 1000)


class CharacterDoc(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(default="Unnamed character", max_length=120)
    order: int = 0
    # The old figure's look, no longer drawn: it is kept as it was so that nothing the author made is lost.
    look: CharacterLook = Field(default_factory=CharacterLook)
    portrait: CharacterPortrait = Field(default_factory=CharacterPortrait)
    # The art mannequin (phase 6): a copy of a model with the writer's choices. A character with a figure is drawn from it; one without is drawn from the portrait.
    figure: Optional[CharacterFigure] = None
    profile: CharacterProfile = Field(default_factory=CharacterProfile)
    possessions: list[CharacterPossession] = Field(default_factory=list)
    relationships: list[CharacterRelationship] = Field(default_factory=list)
    states: list[CharacterState] = Field(default_factory=list)
    arc: list[ArcStage] = Field(default_factory=list)
    events: list[LifeEvent] = Field(default_factory=list)
    # The chapters and scenes of the outline the author has tagged this character on (outline node ids, in the order they were tagged).
    appearances: list[str] = Field(default_factory=list)
    # What readers may see of this character (see ReaderShare); `fields` and `reveals` are keyed by CHARACTER_SHARE_FIELDS and "field:<id>".
    reader: ReaderShare = Field(default_factory=ReaderShare)
    updatedAt: datetime = Field(default_factory=utcnow)

    @field_validator("reader", mode="before")
    @classmethod
    def _reader_share(cls, value: Any) -> Any:
        return _share_of(value)

    @field_validator("name", mode="before")
    @classmethod
    def _name_or_default(cls, value: Any) -> Any:
        text = value.strip()[:120] if isinstance(value, str) else ""
        return text or "Unnamed character"

    @field_validator("profile", mode="before")
    @classmethod
    def _profile(cls, value: Any) -> Any:
        return value if isinstance(value, (dict, CharacterProfile)) else {}

    @field_validator("possessions", mode="before")
    @classmethod
    def _possessions(cls, value: Any) -> Any:
        return _unique_items(value, CharacterPossession, CHARACTER_MAX_POSSESSIONS)

    @field_validator("relationships", mode="before")
    @classmethod
    def _relationships(cls, value: Any) -> Any:
        return _unique_items(value, CharacterRelationship, CHARACTER_MAX_RELATIONSHIPS)

    @field_validator("states", mode="before")
    @classmethod
    def _states(cls, value: Any) -> Any:
        return _unique_items(value, CharacterState, CHARACTER_MAX_STATES)

    @field_validator("arc", mode="before")
    @classmethod
    def _arc(cls, value: Any) -> Any:
        return _unique_items(value, ArcStage, CHARACTER_MAX_STAGES)

    @field_validator("events", mode="before")
    @classmethod
    def _events(cls, value: Any) -> Any:
        return _unique_items(value, LifeEvent, CHARACTER_MAX_EVENTS)

    @field_validator("appearances", mode="before")
    @classmethod
    def _appearances(cls, value: Any) -> Any:
        out: list[str] = []
        for item in value if isinstance(value, list) else []:
            text = _cut(item, 80)
            if text and text not in out:
                out.append(text)
            if len(out) >= CHARACTER_MAX_APPEARANCES:
                break
        return out

    @field_validator("look", mode="before")
    @classmethod
    def _look(cls, value: Any) -> Any:
        return value if isinstance(value, (dict, CharacterLook)) else {}

    @field_validator("portrait", mode="before")
    @classmethod
    def _portrait(cls, value: Any) -> Any:
        return _portrait_or_default(value)

    @field_validator("figure", mode="before")
    @classmethod
    def _figure(cls, value: Any) -> Any:
        return _figure_or_none(value)


class EditionMap(BaseModel):
    """A published map as it was when the edition was made; `doc.reader` says what is shown from which chapter."""

    mapId: str
    doc: MapDoc


class EditionCharacterField(BaseModel):
    key: str
    label: str
    value: str
    revealAt: Optional[int] = None


class EditionRelationship(BaseModel):
    targetId: str
    label: str
    description: str = ""


class EditionCharacter(BaseModel):
    """A published character as it was when the edition was made: the portrait, the public fields only (not the rest of the profile) and the links."""

    characterId: str
    name: str
    revealAt: Optional[int] = None
    look: CharacterLook
    # How the card is drawn; an edition made before portraits has none (the reader's view then draws the default portrait).
    portrait: Optional[CharacterPortrait] = None
    # The figure as it was (its model copy is in the edition's `figureModels`); a card with one is drawn from it.
    figure: Optional[CharacterFigure] = None
    fields: list[EditionCharacterField] = Field(default_factory=list)
    relationships: list[EditionRelationship] = Field(default_factory=list)
    relationshipsRevealAt: Optional[int] = None

    @field_validator("portrait", mode="before")
    @classmethod
    def _edition_portrait(cls, value: Any) -> Any:
        return _portrait_or_none(value)

    @field_validator("figure", mode="before")
    @classmethod
    def _edition_figure(cls, value: Any) -> Any:
        return _figure_or_none(value)


BookEdition.model_rebuild()
BookListing.model_rebuild()


ITEM_MAX_PER_PROJECT = 400
ITEM_MAX_HOLDINGS = 200
ITEM_KINDS = ("weapon", "tool", "clothing", "jewel", "document", "vehicle", "treasure", "other")
ITEM_HOLDER = re.compile(r"^(char|place):[A-Za-z0-9_/-]{1,160}$")


class ItemHolding(BaseModel):
    """Who has an item from a point of the story: a character (`char:<id>`), a place (`place:<mapId>/<symbolId>`) or nobody known (empty: lost, hidden or not yet made).
    `at` is the outline chapter or scene the item changes hands at (empty: from the start of the story). The last holding of the list is the item's current holder."""

    id: str = Field(min_length=1, max_length=40)
    holder: str = ""
    at: str = Field(default="", max_length=80)
    note: str = Field(default="", max_length=500)

    @field_validator("holder", mode="before")
    @classmethod
    def _holder(cls, value: Any) -> Any:
        return value if isinstance(value, str) and ITEM_HOLDER.match(value) else ""

    @field_validator("at", mode="before")
    @classmethod
    def _at(cls, value: Any) -> Any:
        return _cut(value, 80)

    @field_validator("note", mode="before")
    @classmethod
    def _note(cls, value: Any) -> Any:
        return _cut(value, 500)


class ItemDoc(BaseModel):
    """A thing of the story that can pass from hand to hand: a sword, a letter, a ring. The library is shared by the whole cast; who has it, and when, is its `holdings`."""

    schemaVersion: int = SCHEMA_VERSION
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(default="Unnamed item", max_length=120)
    order: int = 0
    kind: str = "other"
    description: str = Field(default="", max_length=4000)
    notes: str = Field(default="", max_length=4000)
    # A colour for its tag, `#rrggbb` (the author's own; empty = none).
    color: str = ""
    holdings: list[ItemHolding] = Field(default_factory=list)
    updatedAt: datetime = Field(default_factory=utcnow)

    @field_validator("name", mode="before")
    @classmethod
    def _name_or_default(cls, value: Any) -> Any:
        text = value.strip()[:120] if isinstance(value, str) else ""
        return text or "Unnamed item"

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, value: Any) -> Any:
        text = value.strip().lower() if isinstance(value, str) else ""
        return text if text in ITEM_KINDS else "other"

    @field_validator("description", "notes", mode="before")
    @classmethod
    def _long(cls, value: Any) -> Any:
        return _cut(value, 4000)

    @field_validator("color", mode="before")
    @classmethod
    def _color(cls, value: Any) -> Any:
        return value.lower() if isinstance(value, str) and re.match(r"^#[0-9a-fA-F]{6}$", value) else ""

    @field_validator("holdings", mode="before")
    @classmethod
    def _holdings(cls, value: Any) -> Any:
        return _unique_items(value, ItemHolding, ITEM_MAX_HOLDINGS)


WORLD_LINK_REF = re.compile(r"^(plot|char|place|item|scene):[A-Za-z0-9_/-]{1,160}$")
WORLD_MAX_LINKS = 2000


class WorldLink(BaseModel):
    """A link between two things of different kinds: a plot node (`plot:<id>`), a character (`char:<id>`), a place, a named symbol of a map (`place:<mapId>/<symbolId>`),
    an item of the library (`item:<id>`) or a chapter or scene of the outline (`scene:<id>`).
    It is one record for both ends, so it reads the same from either."""

    a: str
    b: str

    @model_validator(mode="after")
    def _refs(self) -> "WorldLink":
        if not WORLD_LINK_REF.match(self.a) or not WORLD_LINK_REF.match(self.b) or self.a.split(":")[0] == self.b.split(":")[0]:
            raise ValueError("a link joins two refs of different kinds")
        if self.a > self.b:
            self.a, self.b = self.b, self.a
        return self


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
    facets: FacetActivity = Field(default_factory=FacetActivity)
    revisionFlags: list[RevisionFlag] = Field(default_factory=list)
    planner: Planner = Field(default_factory=Planner)
    # Map id -> the map. A map that cannot be read is dropped from here (and kept in quarantine), so the other maps still load.
    maps: dict[str, MapDoc] = Field(default_factory=dict)
    # Character id -> the character (the cast). Read the way the maps are: one that cannot be read is dropped and kept in quarantine.
    characters: dict[str, CharacterDoc] = Field(default_factory=dict)
    # Key -> a frozen copy of a published model, shared by the figures of the characters that use it (see FigureModel). One that cannot be read is dropped and kept in quarantine.
    figureModels: dict[str, FigureModel] = Field(default_factory=dict)
    # Links between plot nodes, characters and places (see WorldLink); one that points at something that is gone is not shown and goes at the next change.
    worldLinks: list[WorldLink] = Field(default_factory=list)
    # Item id -> the item (the library of things that pass from hand to hand). Read the way the characters are.
    items: dict[str, ItemDoc] = Field(default_factory=dict)
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
