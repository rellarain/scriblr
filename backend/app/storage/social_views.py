"""Reads over the reader's social state, with no writes: the levels a reader has been invited to, the clubs with their posts, the feed, what
readers say about a book (the seeded readers' reviews and the reader's own), and the notifications the community generates."""

from datetime import datetime, timedelta
from typing import Optional

from . import social_seed
from .library_seed import seed_authors
from .reader_schema import (
    BookCard,
    CatalogBook,
    ClubView,
    CriterionAverage,
    FeedItem,
    LevelInfo,
    Notification,
    PublicReview,
    ReaderFile,
    Review,
    ReviewRead,
)

ME = "me"
FEED_LIMIT = 40
CLUB_SOON_DAYS = 2
AUTHOR_NEWS_DAYS = 3


def effective_levels(rf: ReaderFile) -> dict[str, LevelInfo]:
    """The level of every book the reader was invited to or switched by hand; a book not listed is read at omega (its final edition)."""
    out = {bid: LevelInfo(level=level, invitedBy=by) for bid, (level, by) in social_seed.invites().items()}
    for bid, level in rf.levelOverrides.items():
        invited = out.get(bid)
        out[bid] = LevelInfo(level=level, invitedBy=invited.invitedBy if invited else None, override=True)
    return out


def names_by_id() -> dict[str, str]:
    names = {r.id: r.name for r in social_seed.readers()}
    names.update({a.id: a.name for a in seed_authors()})
    return names


def latest_posted(review: Review) -> Optional[ReviewRead]:
    posted = [r for r in review.reads if r.status == "posted"]
    return posted[-1] if posted else None


def find_review(rf: ReaderFile, book_id: str) -> Optional[Review]:
    for r in rf.reviews:
        if r.bookId == book_id:
            return r
    return None


def all_clubs(rf: ReaderFile, now: datetime):
    return social_seed.clubs(now) + list(rf.myClubs)


def clubs_view(rf: ReaderFile, now: datetime) -> list[ClubView]:
    posts = social_seed.club_posts(now) + list(rf.clubPosts)
    out: list[ClubView] = []
    for club in all_clubs(rf, now):
        joined = club.id in rf.joinedClubs or club.mine
        mine_extra = 1 if joined and ME not in club.members and not club.mine else 0
        mine_creator = 1 if club.mine else 0
        out.append(
            ClubView(
                club=club,
                joined=joined,
                memberCount=len(club.members) + mine_extra + mine_creator,
                posts=sorted((p for p in posts if p.clubId == club.id), key=lambda p: p.at),
            )
        )
    return out


def feed(rf: ReaderFile, now: datetime) -> list[FeedItem]:
    names = names_by_id()
    items: list[FeedItem] = []
    for ev in social_seed.feed_events(now, names):
        if ev.whoId in rf.following and ev.whoId not in rf.blocked:
            items.append(ev)
    for view in clubs_view(rf, now):
        if view.joined and view.club.nextMeetingAt is not None:
            items.append(
                FeedItem(
                    id=f"club-{view.club.id}",
                    at=now - timedelta(hours=1),
                    kind="club",
                    who=view.club.name,
                    whoId=view.club.id,
                    title=f"{view.club.name}: {view.club.meets}",
                    detail=f"Next meeting {view.club.nextMeetingAt.strftime('%b %d')}",
                    bookId=view.club.bookId,
                )
            )
    for rv in rf.reviews:
        posted = latest_posted(rv)
        if posted and posted.postedAt:
            items.append(FeedItem(id=f"mine-review-{rv.bookId}", at=posted.postedAt, kind="mine", who="You", whoId=ME, title="You reviewed a book", detail=f"{posted.score} of 10", bookId=rv.bookId))
    for bid, pos in rf.progress.items():
        if pos.finishedAt:
            items.append(FeedItem(id=f"mine-finish-{bid}", at=pos.finishedAt, kind="mine", who="You", whoId=ME, title="You finished a book", bookId=bid))
    items.sort(key=lambda i: i.at, reverse=True)
    return items[:FEED_LIMIT]


def social_notifications(rf: ReaderFile, now: datetime) -> list[Notification]:
    """New notifications from what the reader follows and the clubs they joined (none already in the file)."""
    known = {n.id for n in rf.notifications}
    names = names_by_id()
    out: list[Notification] = []
    for ev in social_seed.feed_events(now, names):
        nid = f"follow-{ev.id}"
        if ev.whoId in rf.following and ev.whoId not in rf.blocked and ev.kind == "author" and now - ev.at <= timedelta(days=AUTHOR_NEWS_DAYS) and nid not in known:
            out.append(Notification(id=nid, at=now, kind="follow", title=ev.title, detail=ev.detail))
    for view in clubs_view(rf, now):
        meeting = view.club.nextMeetingAt
        nid = f"club-{view.club.id}-{meeting.date().isoformat() if meeting else ''}"
        if view.joined and meeting is not None and meeting - now <= timedelta(days=CLUB_SOON_DAYS) and nid not in known:
            out.append(Notification(id=nid, at=now, kind="club", title=f"{view.club.name} meets soon", detail=view.club.meets))
    return out


def book_card(rf: ReaderFile, book: CatalogBook, now: datetime) -> BookCard:
    reviews = social_seed.seed_reviews(book, now)
    mine = find_review(rf, book.id)
    mine_read = latest_posted(mine) if mine else None
    rating, ratings = book.rating, book.ratings
    criteria_scores: dict[str, list[int]] = {}
    for r in reviews:
        for name, value in r.criteria.items():
            criteria_scores.setdefault(name, []).append(value)
    if mine and mine_read and mine_read.score is not None:
        rating = round((book.rating * book.ratings + mine_read.score) / (book.ratings + 1), 1)
        ratings = book.ratings + 1
        for name, value in mine_read.criteria.items():
            criteria_scores.setdefault(name, []).append(value)
        reviews.insert(
            0,
            PublicReview(
                id=f"mine-{book.id}",
                readerId=ME,
                name="You",
                initials="Y",
                score=mine_read.score,
                criteria=mine_read.criteria,
                comment=mine_read.comment,
                spoilerEssay=mine_read.spoilerEssay,
                reads=sum(1 for r in mine.reads if r.status == "posted"),
                at=mine_read.postedAt or now,
                edited=mine_read.editedAt is not None,
                mine=True,
            ),
        )
    criteria = [CriterionAverage(name=n, average=round(sum(v) / len(v), 1), count=len(v)) for n, v in criteria_scores.items()]
    return BookCard(bookId=book.id, rating=rating, ratings=ratings, criteria=criteria, reviews=reviews)
