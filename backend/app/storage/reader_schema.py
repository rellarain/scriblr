"""The Reader's data: the library's books (a catalog merged from the author's own published books and a seeded demo shelf) and one
reader's account (plan, credits, holdings, wishlist, reading activity). Money and lending are simulated: nothing here talks to a
network, and a "credit" is a counter in a ledger."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

READER_SCHEMA_VERSION = 1

BookType = Literal["novel", "novella", "essays", "magazine", "article"]
HoldingKind = Literal["owned", "borrowed"]
HoldingStatus = Literal["active", "returned", "cancelled"]
LedgerKind = Literal["grant", "borrow", "extend", "refund"]
# How a reader treats a flag (the four classes): hidden, marked, highlight, spoiler.
FlagClass = Literal["hidden", "marked", "highlight", "spoiler"]
# How far into a book's making a reader is invited: alpha (the plan, read-only), delta (work-in-progress drafts), beta (final-draft chapters
# as they publish) and omega (final editions, for sale or borrowing). Alpha and delta are free; beta pays like omega.
ReaderLevel = Literal["alpha", "delta", "beta", "omega"]
ReportKind = Literal["review", "post"]
REPORT_REASONS = ("hide", "spoiler", "abuse", "spam", "other")
DEFAULT_CRITERIA = ["Plot", "Prose", "Characters", "Pacing"]

MAX_EXTRA_CREDITS = 10
MAX_BORROW_CREDITS = 4
# A credit lends one book for one month. Returning inside this many days with less than half read gives the credit back.
REFUND_WITHIN_DAYS = 14
REFUND_UNDER_PERCENT = 50.0
BASE_PRICE_CENTS = 600
EXTRA_CREDIT_PRICE_CENTS = 200


# ---------------------------------------------------------------------------------------------------------------------- the library


class AuthorFlag(BaseModel):
    """A content flag an author put on a book: a warning, with its details (and, for a spoiler flag, a spoiler description)."""

    key: str
    name: str
    detail: str = ""
    defaultClass: FlagClass = "marked"


class SeriesRef(BaseModel):
    id: str
    title: str
    order: int = 1


class Author(BaseModel):
    id: str
    name: str
    bio: str = ""
    books: int = 0
    readers: int = 0


class CatalogBook(BaseModel):
    id: str
    title: str
    authorId: str
    authorName: str
    type: BookType = "novel"
    genres: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    tropes: list[str] = Field(default_factory=list)
    flags: list[AuthorFlag] = Field(default_factory=list)
    wordCount: int = 0
    # Average of readers' general scores (1 to 10) and how many scored it.
    rating: float = 0.0
    ratings: int = 0
    readers: int = 0
    popularity: int = 0
    series: Optional[SeriesRef] = None
    hue: int = 28
    blurb: str = ""
    buyPriceCents: int = 900
    # Numbered editions published for sale or borrowing (omega); 0 is a book not yet in its first edition.
    editions: int = 1
    publishedAt: Optional[str] = None
    source: Literal["seed", "local"] = "seed"
    projectId: Optional[str] = None
    bookId: Optional[str] = None


class BookPage(BaseModel):
    total: int
    books: list[CatalogBook]


class AuthorDetail(BaseModel):
    author: Author
    books: list[CatalogBook]


class Recommendation(BaseModel):
    book: CatalogBook
    # 0 to 100: how well the book fits what this reader has read, kept and finished.
    match: int
    why: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------------------------------------------------- the reader


class Plan(BaseModel):
    """The subscription: $6 a month with one credit, and $2 more for every extra credit."""

    extraCredits: int = Field(default=0, ge=0, le=MAX_EXTRA_CREDITS)


class LedgerEntry(BaseModel):
    id: str
    at: datetime
    kind: LedgerKind
    delta: int
    note: str = ""
    bookId: Optional[str] = None
    holdingId: Optional[str] = None


class Holding(BaseModel):
    """A book the reader owns or has borrowed (one credit is one month on a book; credits stack)."""

    id: str
    bookId: str
    kind: HoldingKind
    status: HoldingStatus = "active"
    startedAt: datetime
    dueAt: Optional[datetime] = None
    endedAt: Optional[datetime] = None
    credits: int = 0
    opened: bool = False
    openedAt: Optional[datetime] = None
    lentTo: Optional[str] = None
    lentUntil: Optional[datetime] = None


class ReadingPosition(BaseModel):
    pct: float = Field(default=0.0, ge=0.0, le=100.0)
    pages: int = 0
    updatedAt: Optional[datetime] = None
    finishedAt: Optional[datetime] = None


class ActivityDay(BaseModel):
    pages: int = 0
    minutes: int = 0
    sessions: int = 0


class Notification(BaseModel):
    id: str
    at: datetime
    kind: Literal["due", "club", "reply", "follow", "review", "info"] = "info"
    title: str
    detail: str = ""
    read: bool = False


class LevelInfo(BaseModel):
    level: ReaderLevel
    invitedBy: Optional[str] = None
    # True when the reader switched this book's level by hand (the simulation's level switcher).
    override: bool = False


class ReviewRead(BaseModel):
    """One read of a book: its own score, criteria, comment, spoiler essay and the notes included. A re-read adds another."""

    n: int
    status: Literal["draft", "posted"] = "draft"
    score: Optional[int] = Field(default=None, ge=1, le=10)
    criteria: dict[str, int] = Field(default_factory=dict)
    comment: str = Field(default="", max_length=5000)
    spoilerEssay: str = Field(default="", max_length=20000)
    noteIds: list[str] = Field(default_factory=list)
    startedAt: datetime
    postedAt: Optional[datetime] = None
    editedAt: Optional[datetime] = None


class Review(BaseModel):
    bookId: str
    reads: list[ReviewRead] = Field(default_factory=list)


class Note(BaseModel):
    """A highlight or note the reader kept on a book (the e-reader adds them; the Bookcard and Journal list them)."""

    id: str
    bookId: str
    quote: str = Field(default="", max_length=2000)
    note: str = Field(default="", max_length=2000)
    at: datetime


class ClubPost(BaseModel):
    id: str
    clubId: str
    # A seeded reader's id, or "me".
    authorId: str
    text: str = Field(max_length=2000)
    at: datetime
    spoiler: bool = False
    replyTo: Optional[str] = None


class Club(BaseModel):
    id: str
    name: str
    description: str = ""
    bookId: Optional[str] = None
    meets: str = ""
    nextMeetingAt: Optional[datetime] = None
    members: list[str] = Field(default_factory=list)
    mine: bool = False


class ClubView(BaseModel):
    club: Club
    joined: bool
    memberCount: int
    posts: list[ClubPost]


class Report(BaseModel):
    """A review or club post the reader reported or hid. Local only: nothing is sent anywhere. A reported item is hidden until undone."""

    id: str
    kind: ReportKind
    targetId: str
    reason: str
    at: datetime


class ReaderProfile(BaseModel):
    id: str
    name: str
    initials: str
    bio: str = ""


class PublicReview(BaseModel):
    id: str
    readerId: str
    name: str
    initials: str
    score: int
    criteria: dict[str, int] = Field(default_factory=dict)
    comment: str = ""
    spoilerEssay: str = ""
    # How many times the reader has read the book; older reads are on tabs.
    reads: int = 1
    at: datetime
    edited: bool = False
    mine: bool = False


class CriterionAverage(BaseModel):
    name: str
    average: float
    count: int


class BookCard(BaseModel):
    """What readers say about a book: the average of every general score (the seeded readers' and the reader's own) and the criteria."""

    bookId: str
    rating: float
    ratings: int
    criteria: list[CriterionAverage]
    reviews: list[PublicReview]


class FeedItem(BaseModel):
    id: str
    at: datetime
    kind: Literal["finished", "reviewed", "club", "author", "followed", "mine"] = "finished"
    who: str
    whoId: str
    title: str
    detail: str = ""
    bookId: Optional[str] = None


class Chapter(BaseModel):
    n: int
    title: str
    words: int


class PlanRow(BaseModel):
    title: str
    meta: str = ""
    indent: int = 0


class BookPlanning(BaseModel):
    """What an alpha reader sees, read-only: the book's outline, plot, plan and revisions."""

    outline: list[PlanRow]
    plot: list[PlanRow]
    plotPath: str
    goalWords: int
    wordsNow: int
    chaptersOutlined: int
    chaptersTotal: int
    publishTarget: str
    revisions: list[PlanRow]


class BookStats(BaseModel):
    readingNow: int
    averageMinutes: int
    finishPercent: int
    # Share of readers (0 to 100) who stop in each eighth of the book, then finish.
    leaveBars: list[int]
    clubs: int


class BookDetail(BaseModel):
    bookId: str
    authorNote: str
    contents: list[Chapter]
    glossary: list[PlanRow]
    bibliography: list[str]
    index: list[str]
    appendix: list[str]
    planning: BookPlanning
    stats: BookStats


class ReaderFile(BaseModel):
    schemaVersion: int = READER_SCHEMA_VERSION
    plan: Plan = Field(default_factory=Plan)
    # "YYYY-MM" of the last month whose credits were granted (None before the first grant).
    grantedThrough: Optional[str] = None
    ledger: list[LedgerEntry] = Field(default_factory=list)
    holdings: list[Holding] = Field(default_factory=list)
    toRead: list[str] = Field(default_factory=list)
    wishlist: list[str] = Field(default_factory=list)
    progress: dict[str, ReadingPosition] = Field(default_factory=dict)
    # "YYYY-MM-DD" (UTC) -> that day's reading.
    activity: dict[str, ActivityDay] = Field(default_factory=dict)
    flagClasses: dict[str, FlagClass] = Field(default_factory=dict)
    notifications: list[Notification] = Field(default_factory=list)
    levelOverrides: dict[str, ReaderLevel] = Field(default_factory=dict)
    criteriaNames: list[str] = Field(default_factory=lambda: list(DEFAULT_CRITERIA))
    reviews: list[Review] = Field(default_factory=list)
    notes: list[Note] = Field(default_factory=list)
    following: list[str] = Field(default_factory=list)
    joinedClubs: list[str] = Field(default_factory=list)
    myClubs: list[Club] = Field(default_factory=list)
    clubPosts: list[ClubPost] = Field(default_factory=list)
    reports: list[Report] = Field(default_factory=list)
    blocked: list[str] = Field(default_factory=list)


class ReaderState(BaseModel):
    """What the Reader's pages show: the file plus what is derived from it."""

    plan: Plan
    planPriceCents: int
    creditsPerMonth: int
    balance: int
    ledger: list[LedgerEntry]
    holdings: list[Holding]
    toRead: list[str]
    wishlist: list[str]
    progress: dict[str, ReadingPosition]
    activity: dict[str, ActivityDay]
    flagClasses: dict[str, FlagClass]
    notifications: list[Notification]
    levels: dict[str, LevelInfo] = Field(default_factory=dict)
    criteriaNames: list[str] = Field(default_factory=list)
    reviews: list[Review] = Field(default_factory=list)
    notes: list[Note] = Field(default_factory=list)
    following: list[str] = Field(default_factory=list)
    joinedClubs: list[str] = Field(default_factory=list)
    reports: list[Report] = Field(default_factory=list)
    blocked: list[str] = Field(default_factory=list)
