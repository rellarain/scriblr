"""The demo community: seeded readers, clubs, club posts, reviews, feed events, author invites and the details of each book (its front and
back matter, planning and reading statistics). Everything is fixed or derived from a book's id, so the Reader can be explored in a
single-user, offline app. The shapes are the ones a networked service would serve; only the source is local."""

import zlib
from datetime import datetime, timedelta
from typing import Optional

from .reader_schema import (
    BookDetail,
    BookPlanning,
    BookStats,
    CatalogBook,
    Chapter,
    Club,
    ClubPost,
    FeedItem,
    PlanRow,
    PublicReview,
    ReaderLevel,
    ReaderProfile,
)

_LOREM = [
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
    "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
    "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
]

# (id, name, bio)
_READERS = [
    ("r-sol", "Sol Marsh", "Reads on the night bus."),
    ("r-rue", "Rue Tanner", "Slow burns and long series."),
    ("r-jun", "Jun Okafor", "Essays before breakfast."),
    ("r-pia", "Pia Lund", "Mysteries, in order."),
    ("r-oz", "Oz Calder", "A book a week since 2019."),
    ("r-lio", "Lio Vance", "Historical fiction and maps."),
    ("r-meg", "Meg Ruiz", "Reads the endings first."),
    ("r-tav", "Tav Brandt", "Science and magazines."),
    ("r-bee", "Bee Arden", "Re-reads everything twice."),
    ("r-kit", "Kit Navarro", "Fantasy, mostly quiet."),
    ("r-lan", "Lan Whitcomb", "Annotates in three colours."),
    ("r-dov", "Dov Keane", "Lends more than borrows."),
]

# (id, name, description, book id, meets, days until the next meeting, member reader ids)
_CLUBS = [
    ("rope-readers", "Rope Readers", "Reads a book in two-chapter bites and meets to talk it through.", "river-clerks", "Thursdays: chapters 5 and 6", 3, ["r-sol", "r-rue", "r-oz", "r-lan"]),
    ("slow-burners", "Slow Burners", "Quiet novels where not much happens, beautifully.", "cold-harbor", "Sundays: chapters 3 and 4", 5, ["r-rue", "r-bee", "r-kit", "r-meg", "r-sol"]),
    ("night-shift", "Night Shift", "Mysteries read after dark, no spoilers before the reveal.", "lantern-hours", "Fridays: the first half", 6, ["r-pia", "r-oz", "r-dov"]),
    ("essay-hour", "The Essay Hour", "One essay a week, read aloud in the chat.", "the-salt-ledger", "Mondays: one essay", 1, ["r-jun", "r-tav", "r-lio", "r-bee"]),
    ("ember-circle", "Ember Circle", "Following the Ember Cycle from the first book to the last.", "ember", "Saturdays: chapters 1 to 4", 4, ["r-kit", "r-rue", "r-sol", "r-lan", "r-meg"]),
]

# (club id, reader id, text, days ago, spoiler)
_POSTS = [
    ("rope-readers", "r-sol", "Chapter 5 turned on the rope maker's offer. Did anyone else read it twice?", 2, False),
    ("rope-readers", "r-lan", "The knot in chapter 6 is the same one drawn on the first page. I think it is the whole plot.", 1, True),
    ("slow-burners", "r-bee", "Nothing happens for forty pages and I did not want it to stop.", 3, False),
    ("slow-burners", "r-kit", "The early tide is doing a lot of work. The weir note in the footnotes explains it.", 1, False),
    ("slow-burners", "r-meg", "I looked ahead. The painted name comes back in chapter 9.", 1, True),
    ("night-shift", "r-pia", "Who has a theory about the third lamp?", 4, False),
    ("essay-hour", "r-jun", "This week's essay has the best first line of the year.", 2, False),
    ("ember-circle", "r-kit", "Thaw ends on a thaw. Ember starts in a fire. The cycle is exact.", 1, False),
]

# (reader id or author id, kind, book id, title, detail, days ago)
_EVENTS = [
    ("r-sol", "finished", "lantern-hours", "Sol Marsh finished Lantern Hours", "4 stars", 0),
    ("r-rue", "reviewed", "thaw", "Rue Tanner reviewed Thaw", "9 of 10: the quietest ending I have read.", 1),
    ("mara-quill", "author", "cold-harbor", "Mara Quill added 4 footnotes to Cold Harbor", "Author update", 2),
    ("ines-okoro", "author", "field-notes-on-weather", "Ines Okoro published Field Notes on Weather", "Magazine, available to borrow", 3),
    ("r-oz", "finished", "the-orchard-clause", "Oz Calder finished The Orchard Clause", "3 stars", 3),
    ("r-jun", "reviewed", "the-salt-ledger", "Jun Okafor reviewed The Salt Ledger", "10 of 10: I read it in one sitting.", 4),
    ("r-pia", "finished", "the-weir", "Pia Lund finished The Weir", "4 stars", 5),
    ("idris-vale", "author", "salt-and-rope", "Idris Vale published Salt and Rope", "Essays, available to borrow", 6),
    ("r-bee", "reviewed", "cold-harbor", "Bee Arden re-read Cold Harbor", "Second read: 10 of 10.", 7),
    ("calla-reyes", "author", "river-wardens", "Calla Reyes added a glossary to River Wardens", "Author update", 9),
]

# Authors invite readers to a book before its omega release. Alpha and delta are free; beta pays like omega.
_INVITES: dict[str, tuple[ReaderLevel, str]] = {
    "ash": ("alpha", "Mara Quill"),
    "what-the-fog-owes": ("delta", "Mara Quill"),
    "the-weir": ("beta", "Wren Alder"),
}

_CHAPTER_TITLES = [
    "The harbor at dawn", "Two sets of books", "The ledger of tides", "A name painted over", "The clerk's first winter", "Salt on the page", "What the weir keeps",
    "The third lamp", "The early tide", "A debt in rope", "Fog for a week", "The quay at night", "Letters not sent", "The long arithmetic", "A boat that is not there",
    "The master's hand", "Low water", "What the ledger owes", "A door in the sea wall", "The count", "Slack tide", "The reading of the books", "Spring tide", "The last entry",
]
_CRITERIA = ["Plot", "Prose", "Characters", "Pacing"]


def _h(*parts: object) -> int:
    return zlib.crc32("|".join(str(p) for p in parts).encode("utf-8"))


def readers() -> list[ReaderProfile]:
    return [ReaderProfile(id=i, name=n, initials="".join(w[0] for w in n.split()[:2]).upper(), bio=b) for i, n, b in _READERS]


def reader_by_id() -> dict[str, ReaderProfile]:
    return {r.id: r for r in readers()}


def clubs(now: datetime) -> list[Club]:
    return [
        Club(id=cid, name=name, description=desc, bookId=book, meets=meets, nextMeetingAt=(now + timedelta(days=days)).replace(hour=19, minute=0, second=0, microsecond=0), members=members)
        for cid, name, desc, book, meets, days, members in _CLUBS
    ]


def club_posts(now: datetime) -> list[ClubPost]:
    return [
        ClubPost(id=f"seed-{i}", clubId=cid, authorId=who, text=text, at=now - timedelta(days=ago, hours=i), spoiler=spoiler)
        for i, (cid, who, text, ago, spoiler) in enumerate(_POSTS)
    ]


def feed_events(now: datetime, names: dict[str, str]) -> list[FeedItem]:
    return [
        FeedItem(id=f"seed-ev-{i}", at=now - timedelta(days=ago, hours=i), kind=kind, who=names.get(who, who), whoId=who, title=title, detail=detail, bookId=book)
        for i, (who, kind, book, title, detail, ago) in enumerate(_EVENTS)
    ]


def invite_for(book_id: str) -> Optional[tuple[ReaderLevel, str]]:
    return _INVITES.get(book_id)


def invites() -> dict[str, tuple[ReaderLevel, str]]:
    return dict(_INVITES)


def seed_reviews(book: CatalogBook, now: datetime) -> list[PublicReview]:
    """Three readers' public reviews of a book that has been rated, each deterministic from the book's id."""
    if book.ratings <= 0:
        return []
    people = readers()
    out: list[PublicReview] = []
    for k in range(3):
        who = people[_h(book.id, "who", k) % len(people)]
        if any(r.readerId == who.id for r in out):
            who = people[(_h(book.id, "who", k) + 1 + k) % len(people)]
        base = book.rating + ((_h(book.id, "score", k) % 7) - 3) * 0.5
        score = max(1, min(10, round(base)))
        criteria = {name: max(1, min(10, score + (_h(book.id, name, k) % 3) - 1)) for name in _CRITERIA}
        out.append(
            PublicReview(
                id=f"seed-{book.id}-{k}",
                readerId=who.id,
                name=who.name,
                initials="".join(w[0] for w in who.name.split()[:2]).upper(),
                score=score,
                criteria=criteria,
                comment=_LOREM[_h(book.id, "text", k) % len(_LOREM)],
                spoilerEssay=_LOREM[(_h(book.id, "essay", k)) % len(_LOREM)] if k == 0 else "",
                reads=1 + (_h(book.id, "reads", k) % 3 == 0) + (k == 2),
                at=now - timedelta(days=3 + k * 5 + _h(book.id, "ago", k) % 4),
            )
        )
    return out


def _chapters(book: CatalogBook) -> list[Chapter]:
    total = max(1, min(len(_CHAPTER_TITLES), (book.wordCount or 7000) // 7000))
    if book.wordCount <= 0:
        total = 1
    per = max(1, (book.wordCount or 0) // total)
    return [Chapter(n=i + 1, title=_CHAPTER_TITLES[(i + _h(book.id) % 5) % len(_CHAPTER_TITLES)], words=per) for i in range(total)]


# A book's chapters, as its contents list and the e-reader show them.
chapters = _chapters


def book_detail(book: CatalogBook, readers_now: int, club_count: int) -> BookDetail:
    chapters = _chapters(book)
    total = len(chapters)
    outlined = max(1, round(total * (0.4 + (_h(book.id, "outl") % 5) / 10)))
    first = book.title.split()[0].lower()
    stats_seed = _h(book.id, "stats")
    leave = [max(2, 28 - i * 3 + (_h(book.id, "bar", i) % 6)) for i in range(8)]
    outline = [PlanRow(title="Act 1", meta=f"{min(4, total)} chapters")]
    for c in chapters[:5]:
        outline.append(PlanRow(title=f"Chapter {c.n}: {c.title}", meta=f"{c.words:,} words", indent=18))
    outline.append(PlanRow(title="Act 2", meta=f"{max(0, total - 4)} chapters"))
    return BookDetail(
        bookId=book.id,
        authorNote=f"I wrote {book.title} over a long winter. {_LOREM[stats_seed % len(_LOREM)]}",
        contents=chapters,
        glossary=[PlanRow(title=t, meta=_LOREM[i % len(_LOREM)][:70] + ".") for i, t in enumerate([first.capitalize(), "Weir", "Ledger"])],
        bibliography=[f"{book.authorName}. Notes toward {book.title}. Self-published, {2018 + stats_seed % 6}.", "Lorem Ipsum. A Small History of Tides. Dolor Press, 1998.", "Sit Amet. Harbors of the North. Consectetur, 2007."],
        index=[f"{first} 3, 7", "ledger 1, 3, 9", "tide 3, 4, 11"],
        appendix=["A. Tide table", "B. Map of the quay", "C. Reading list"],
        planning=BookPlanning(
            outline=outline,
            plot=[PlanRow(title="A secret is shared", meta=f"Placed on chapter {min(3, total)}"), PlanRow(title="The first lie is found", meta=f"Placed on chapter {min(5, total)}"), PlanRow(title="The ledgers are read together", meta="Not yet placed")],
            plotPath="Romance › Slow Burn",
            goalWords=max(book.wordCount, 20000),
            wordsNow=int(max(book.wordCount, 20000) * 0.59),
            chaptersOutlined=outlined,
            chaptersTotal=total,
            publishTarget="First edition, spring",
            revisions=[PlanRow(title="Tighten the fog paragraph", meta="Chapter 3 · Oct 6 · -42 words, +58 words"), PlanRow(title="Cut the second letter", meta="Chapter 5 · Oct 2 · -210 words"), PlanRow(title="Reorder scenes 2 and 3", meta="Chapter 1 · Sep 28")],
        ),
        stats=BookStats(
            readingNow=readers_now,
            averageMinutes=int(max(book.wordCount, 3000) / 250),
            finishPercent=50 + stats_seed % 40,
            leaveBars=leave,
            clubs=club_count,
        ),
    )
