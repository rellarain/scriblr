"""The reader's social writes: levels, reviews (with re-reads), notes, follows, clubs and posts, and reports. Each is a read-modify-write
on reader.json through reader_store's lock, and returns the new ReaderState. Nothing leaves the machine: a post or a report is kept in the
file, and the seeded readers never answer."""

from datetime import datetime
from pathlib import Path
from typing import Optional

from . import project_store, social_seed
from .reader_schema import (
    REPORT_REASONS,
    Club,
    ClubPost,
    Note,
    ReaderFile,
    ReaderLevel,
    ReaderState,
    Report,
    ReportKind,
    Review,
    ReviewRead,
)
from .reader_store import InvalidReaderOperationError, _mutate
from .social_views import ME, all_clubs, find_review, latest_posted

MAX_CRITERIA = 12
MAX_CRITERION_LENGTH = 40


class NotFoundError(Exception):
    pass


def set_level(root: Path, book_id: str, level: Optional[ReaderLevel]) -> ReaderState:
    """Switch the level the reader reads a book at (the simulation's level switcher); None goes back to the invited level."""

    def apply(rf: ReaderFile, now: datetime) -> None:
        if level is None:
            rf.levelOverrides.pop(book_id, None)
        else:
            rf.levelOverrides[book_id] = level

    return _mutate(root, apply)


def set_criteria(root: Path, names: list[str]) -> ReaderState:
    cleaned: list[str] = []
    for name in names:
        name = name.strip()
        if not name:
            continue
        if len(name) > MAX_CRITERION_LENGTH:
            raise InvalidReaderOperationError(f"a criterion is at most {MAX_CRITERION_LENGTH} characters")
        if name not in cleaned:
            cleaned.append(name)
    if not 1 <= len(cleaned) <= MAX_CRITERIA:
        raise InvalidReaderOperationError(f"keep 1 to {MAX_CRITERIA} criteria")

    def apply(rf: ReaderFile, now: datetime) -> None:
        rf.criteriaNames = cleaned

    return _mutate(root, apply)


def _check_scores(score: Optional[int], criteria: dict[str, int]) -> None:
    if score is not None and not 1 <= score <= 10:
        raise InvalidReaderOperationError("a score is 1 to 10")
    for name, value in criteria.items():
        if not 1 <= value <= 10:
            raise InvalidReaderOperationError(f"{name}: a score is 1 to 10")


def save_review(root: Path, book_id: str, score: Optional[int], criteria: dict[str, int], comment: str, spoiler_essay: str, note_ids: list[str]) -> ReaderState:
    """Autosave the current read's review: a draft stays private until it is posted; a posted read is edited in place (and marked edited)."""
    _check_scores(score, criteria)

    def apply(rf: ReaderFile, now: datetime) -> None:
        review = find_review(rf, book_id)
        if review is None:
            review = Review(bookId=book_id)
            rf.reviews.append(review)
        if not review.reads:
            review.reads.append(ReviewRead(n=1, startedAt=now))
        read = review.reads[-1]
        known = {n.id for n in rf.notes if n.bookId == book_id}
        read.score, read.criteria, read.comment, read.spoilerEssay = score, dict(criteria), comment, spoiler_essay
        read.noteIds = [n for n in note_ids if n in known]
        if read.status == "posted":
            read.editedAt = now

    return _mutate(root, apply)


def post_review(root: Path, book_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        review = find_review(rf, book_id)
        if review is None or not review.reads:
            raise InvalidReaderOperationError("write a review first")
        read = review.reads[-1]
        if read.score is None:
            raise InvalidReaderOperationError("give a general score (1 to 10) before posting")
        if read.status == "posted":
            return
        read.status, read.postedAt = "posted", now

    return _mutate(root, apply)


def start_reread(root: Path, book_id: str) -> ReaderState:
    """A re-read adds a tab to the review (its own score, criteria, comment and essay) and resets the book's reading position."""

    def apply(rf: ReaderFile, now: datetime) -> None:
        review = find_review(rf, book_id)
        if review is None or latest_posted(review) is None or review.reads[-1].status != "posted":
            raise InvalidReaderOperationError("post your review of this read before starting a re-read")
        review.reads.append(ReviewRead(n=review.reads[-1].n + 1, startedAt=now))
        position = rf.progress.get(book_id)
        if position is not None:
            position.pct, position.pages, position.finishedAt, position.updatedAt = 0.0, 0, None, now

    return _mutate(root, apply)


def discard_draft(root: Path, book_id: str) -> ReaderState:
    """Drop the current read's unposted draft (a posted review is never removed this way)."""

    def apply(rf: ReaderFile, now: datetime) -> None:
        review = find_review(rf, book_id)
        if review is None or not review.reads or review.reads[-1].status != "draft":
            return
        review.reads.pop()
        if not review.reads:
            rf.reviews.remove(review)

    return _mutate(root, apply)


def add_note(root: Path, book_id: str, quote: str, note: str) -> ReaderState:
    if not quote.strip() and not note.strip():
        raise InvalidReaderOperationError("a note needs a quote or some text")

    def apply(rf: ReaderFile, now: datetime) -> None:
        rf.notes.append(Note(id=project_store.new_id("note"), bookId=book_id, quote=quote.strip(), note=note.strip(), at=now))

    return _mutate(root, apply)


def delete_note(root: Path, note_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        rf.notes = [n for n in rf.notes if n.id != note_id]
        for review in rf.reviews:
            for read in review.reads:
                read.noteIds = [n for n in read.noteIds if n != note_id]

    return _mutate(root, apply)


def follow(root: Path, whom: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        if whom not in rf.following:
            rf.following.append(whom)

    return _mutate(root, apply)


def unfollow(root: Path, whom: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        if whom in rf.following:
            rf.following.remove(whom)

    return _mutate(root, apply)


def _club(rf: ReaderFile, club_id: str, now: datetime) -> Club:
    for club in all_clubs(rf, now):
        if club.id == club_id:
            return club
    raise NotFoundError(club_id)


def join_club(root: Path, club_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        _club(rf, club_id, now)
        if club_id not in rf.joinedClubs:
            rf.joinedClubs.append(club_id)

    return _mutate(root, apply)


def leave_club(root: Path, club_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        club = _club(rf, club_id, now)
        if club.mine:
            raise InvalidReaderOperationError("you started this club; delete it instead")
        if club_id in rf.joinedClubs:
            rf.joinedClubs.remove(club_id)

    return _mutate(root, apply)


def create_club(root: Path, name: str, description: str, book_id: Optional[str], meets: str) -> ReaderState:
    name = name.strip()
    if not name:
        raise InvalidReaderOperationError("name the club")

    def apply(rf: ReaderFile, now: datetime) -> None:
        club = Club(id=project_store.new_id("club"), name=name, description=description.strip(), bookId=book_id, meets=meets.strip(), mine=True)
        rf.myClubs.append(club)
        rf.joinedClubs.append(club.id)

    return _mutate(root, apply)


def delete_club(root: Path, club_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        club = _club(rf, club_id, now)
        if not club.mine:
            raise InvalidReaderOperationError("you can delete only a club you started")
        rf.myClubs = [c for c in rf.myClubs if c.id != club_id]
        rf.joinedClubs = [c for c in rf.joinedClubs if c != club_id]
        rf.clubPosts = [p for p in rf.clubPosts if p.clubId != club_id]

    return _mutate(root, apply)


def add_post(root: Path, club_id: str, text: str, spoiler: bool, reply_to: Optional[str]) -> ReaderState:
    if not text.strip():
        raise InvalidReaderOperationError("write something first")

    def apply(rf: ReaderFile, now: datetime) -> None:
        club = _club(rf, club_id, now)
        if club.id not in rf.joinedClubs:
            raise InvalidReaderOperationError("join the club to post in it")
        posts = social_seed.club_posts(now) + rf.clubPosts
        if reply_to is not None and not any(p.id == reply_to and p.clubId == club_id for p in posts):
            raise NotFoundError(reply_to)
        rf.clubPosts.append(ClubPost(id=project_store.new_id("post"), clubId=club_id, authorId=ME, text=text.strip(), at=now, spoiler=spoiler, replyTo=reply_to))

    return _mutate(root, apply)


def delete_post(root: Path, post_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        if not any(p.id == post_id for p in rf.clubPosts):
            raise NotFoundError(post_id)
        rf.clubPosts = [p for p in rf.clubPosts if p.id != post_id and p.replyTo != post_id]

    return _mutate(root, apply)


def report(root: Path, kind: ReportKind, target_id: str, reason: str) -> ReaderState:
    """Report or hide a review or a post: it disappears for this reader until they undo it."""
    if reason not in REPORT_REASONS:
        raise InvalidReaderOperationError(f"reason is one of {', '.join(REPORT_REASONS)}")

    def apply(rf: ReaderFile, now: datetime) -> None:
        if any(r.kind == kind and r.targetId == target_id for r in rf.reports):
            return
        rf.reports.append(Report(id=project_store.new_id("rep"), kind=kind, targetId=target_id, reason=reason, at=now))

    return _mutate(root, apply)


def unreport(root: Path, report_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        rf.reports = [r for r in rf.reports if r.id != report_id]

    return _mutate(root, apply)


def block(root: Path, reader_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        if reader_id not in {r.id for r in social_seed.readers()}:
            raise NotFoundError(reader_id)
        if reader_id not in rf.blocked:
            rf.blocked.append(reader_id)
        if reader_id in rf.following:
            rf.following.remove(reader_id)

    return _mutate(root, apply)


def unblock(root: Path, reader_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        if reader_id in rf.blocked:
            rf.blocked.remove(reader_id)

    return _mutate(root, apply)
