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
    kind: Literal["due", "club", "reply", "info"] = "info"
    title: str
    detail: str = ""
    read: bool = False


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
