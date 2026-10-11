"""One reader's account: %APPDATA%\\Scriblr\\reader.json (a sibling of user-settings.json), reusing project_store's atomic write and
quarantine-on-corruption helpers. Money and lending are simulated.

Credits are a ledger: each month grants `1 + extraCredits` credits that never expire (a month with no borrow adds to the bank), and
the balance is the sum of the ledger. One credit lends one book for one month; credits stack (spend 2 for 2 months on one book). A
book returned unopened, or in under 14 days with less than half read, gives its credits back.

Every mutation is a read-modify-write and FastAPI runs sync endpoints on a threadpool, so a module lock serializes them."""

import calendar
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from . import project_store, social_views
from .reader_schema import (
    BASE_PRICE_CENTS,
    EXTRA_CREDIT_PRICE_CENTS,
    MAX_BORROW_CREDITS,
    MAX_EXTRA_CREDITS,
    REFUND_UNDER_PERCENT,
    REFUND_WITHIN_DAYS,
    ActivityDay,
    FlagClass,
    Holding,
    LedgerEntry,
    Notification,
    ReaderFile,
    ReaderState,
    ReadingPosition,
)

_lock = threading.RLock()


class InsufficientCreditsError(Exception):
    def __init__(self, needed: int, balance: int) -> None:
        super().__init__(f"{needed} credit(s) needed, {balance} available")
        self.needed = needed
        self.balance = balance


class AlreadyHeldError(Exception):
    pass


class HoldingNotFoundError(Exception):
    pass


class InvalidReaderOperationError(ValueError):
    pass


def _now() -> datetime:
    # A function, so a test can move the clock.
    return datetime.now(timezone.utc)


def _path(root: Path) -> Path:
    return root / "reader.json"


def add_months(moment: datetime, months: int) -> datetime:
    index = moment.month - 1 + months
    year, month = moment.year + index // 12, index % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)


def _month_key(moment: datetime) -> str:
    return f"{moment.year:04d}-{moment.month:02d}"


def _next_month(key: str) -> str:
    year, month = int(key[:4]), int(key[5:7])
    return f"{year + 1:04d}-01" if month == 12 else f"{year:04d}-{month + 1:02d}"


def _new_entry(kind, delta: int, note: str, now: datetime, *, book_id: Optional[str] = None, holding_id: Optional[str] = None) -> LedgerEntry:
    return LedgerEntry(id=project_store.new_id("led"), at=now, kind=kind, delta=delta, note=note, bookId=book_id, holdingId=holding_id)


def _balance(rf: ReaderFile) -> int:
    return sum(e.delta for e in rf.ledger)


def _sync(rf: ReaderFile, now: datetime) -> bool:
    """Bring the file up to `now`: grant each month's credits, return what is overdue, end lending, note what is due soon. True if changed."""
    changed = False
    current = _month_key(now)
    if rf.grantedThrough != current:
        month = current if rf.grantedThrough is None else _next_month(rf.grantedThrough)
        while True:
            rf.ledger.append(_new_entry("grant", 1 + rf.plan.extraCredits, f"Monthly credits for {month}", now))
            if month == current:
                break
            month = _next_month(month)
        rf.grantedThrough = current
        changed = True
    known = {n.id for n in rf.notifications}
    for h in rf.holdings:
        if h.status == "active" and h.kind == "borrowed" and h.dueAt is not None:
            if h.dueAt <= now:
                h.status, h.endedAt = "returned", h.dueAt
                changed = True
            elif h.dueAt - now <= timedelta(days=7) and f"due-{h.id}" not in known:
                rf.notifications.append(Notification(id=f"due-{h.id}", at=now, kind="due", title="A borrowed book is due soon", detail=h.bookId))
                changed = True
        if h.lentTo and h.lentUntil is not None and h.lentUntil <= now:
            h.lentTo, h.lentUntil = None, None
            changed = True
    fresh = social_views.social_notifications(rf, now)
    if fresh:
        rf.notifications.extend(fresh)
        changed = True
    return changed


def _load(root: Path) -> ReaderFile:
    path = _path(root)
    if not path.exists():
        return ReaderFile()
    return project_store._read_shard(path, ReaderFile)


def _save(root: Path, rf: ReaderFile) -> None:
    project_store._write_shard(root, _path(root), rf)


def _state(rf: ReaderFile) -> ReaderState:
    return ReaderState(
        plan=rf.plan,
        planPriceCents=BASE_PRICE_CENTS + EXTRA_CREDIT_PRICE_CENTS * rf.plan.extraCredits,
        creditsPerMonth=1 + rf.plan.extraCredits,
        balance=_balance(rf),
        ledger=list(reversed(sorted(rf.ledger, key=lambda e: e.at))),
        holdings=rf.holdings,
        toRead=rf.toRead,
        wishlist=rf.wishlist,
        progress=rf.progress,
        activity=rf.activity,
        flagClasses=rf.flagClasses,
        notifications=list(reversed(sorted(rf.notifications, key=lambda n: n.at))),
        levels=social_views.effective_levels(rf),
        criteriaNames=rf.criteriaNames,
        reviews=rf.reviews,
        notes=rf.notes,
        following=rf.following,
        joinedClubs=rf.joinedClubs,
        reports=rf.reports,
        blocked=rf.blocked,
        settings=rf.settings,
        myFlags=rf.myFlags,
        positions=rf.positions,
    )


def load_file(root: Path) -> ReaderFile:
    """The reader's file brought up to date (for recommendations and other reads)."""
    with _lock:
        rf = _load(root)
        if _sync(rf, _now()) or not _path(root).exists():
            _save(root, rf)
        return rf


def get_state(root: Path) -> ReaderState:
    return _state(load_file(root))


def _mutate(root: Path, fn) -> ReaderState:
    with _lock:
        rf = _load(root)
        now = _now()
        _sync(rf, now)
        fn(rf, now)
        _save(root, rf)
        return _state(rf)


def _find_holding(rf: ReaderFile, holding_id: str) -> Holding:
    for h in rf.holdings:
        if h.id == holding_id:
            return h
    raise HoldingNotFoundError(holding_id)


def _active_for(rf: ReaderFile, book_id: str) -> list[Holding]:
    return [h for h in rf.holdings if h.bookId == book_id and h.status == "active"]


def set_plan(root: Path, extra_credits: int) -> ReaderState:
    if not 0 <= extra_credits <= MAX_EXTRA_CREDITS:
        raise InvalidReaderOperationError(f"extra credits must be 0 to {MAX_EXTRA_CREDITS}")

    def apply(rf: ReaderFile, now: datetime) -> None:
        rf.plan.extraCredits = extra_credits  # takes effect with the next month's grant; banked credits are untouched

    return _mutate(root, apply)


def borrow(root: Path, book_id: str, credits: int) -> ReaderState:
    if not 1 <= credits <= MAX_BORROW_CREDITS:
        raise InvalidReaderOperationError(f"spend 1 to {MAX_BORROW_CREDITS} credits (a month each)")

    def apply(rf: ReaderFile, now: datetime) -> None:
        if _active_for(rf, book_id):
            raise AlreadyHeldError(book_id)
        balance = _balance(rf)
        if balance < credits:
            raise InsufficientCreditsError(credits, balance)
        holding = Holding(id=project_store.new_id("hold"), bookId=book_id, kind="borrowed", startedAt=now, dueAt=add_months(now, credits), credits=credits)
        rf.holdings.append(holding)
        rf.ledger.append(_new_entry("borrow", -credits, f"Borrowed {credits} month{'s' if credits != 1 else ''}", now, book_id=book_id, holding_id=holding.id))

    return _mutate(root, apply)


def buy(root: Path, book_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        for h in _active_for(rf, book_id):
            if h.kind == "owned":
                raise AlreadyHeldError(book_id)
            h.status, h.endedAt = "returned", now  # buying a borrowed book ends the loan, with no refund
        rf.holdings.append(Holding(id=project_store.new_id("hold"), bookId=book_id, kind="owned", startedAt=now))
        if book_id in rf.wishlist:
            rf.wishlist.remove(book_id)

    return _mutate(root, apply)


def mark_opened(root: Path, holding_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        h = _find_holding(rf, holding_id)
        if not h.opened:
            h.opened, h.openedAt = True, now

    return _mutate(root, apply)


def return_holding(root: Path, holding_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        h = _find_holding(rf, holding_id)
        if h.kind != "borrowed" or h.status != "active":
            raise InvalidReaderOperationError("only an active loan can be returned")
        pct = rf.progress[h.bookId].pct if h.bookId in rf.progress else 0.0
        if not h.opened:
            refund, note, status = h.credits, "Cancelled before opening: credits returned", "cancelled"
        elif (now - h.startedAt).days < REFUND_WITHIN_DAYS and pct < REFUND_UNDER_PERCENT:
            refund, note, status = h.credits, f"Returned in {(now - h.startedAt).days} days with {pct:.0f}% read: credits returned", "returned"
        else:
            refund, note, status = 0, "Returned", "returned"
        h.status, h.endedAt = status, now
        if refund:
            rf.ledger.append(_new_entry("refund", refund, note, now, book_id=h.bookId, holding_id=h.id))

    return _mutate(root, apply)


def extend(root: Path, holding_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        h = _find_holding(rf, holding_id)
        if h.kind != "borrowed" or h.status != "active" or h.dueAt is None:
            raise InvalidReaderOperationError("only an active loan can be extended")
        balance = _balance(rf)
        if balance < 1:
            raise InsufficientCreditsError(1, balance)
        h.dueAt = add_months(h.dueAt, 1)
        h.credits += 1
        rf.ledger.append(_new_entry("extend", -1, "Extended by 1 month", now, book_id=h.bookId, holding_id=h.id))

    return _mutate(root, apply)


def lend(root: Path, holding_id: str, to: str, months: int) -> ReaderState:
    if not 1 <= months <= 3:
        raise InvalidReaderOperationError("lend for 1 to 3 months")
    if not to.strip():
        raise InvalidReaderOperationError("say who to lend it to")

    def apply(rf: ReaderFile, now: datetime) -> None:
        h = _find_holding(rf, holding_id)
        if h.kind != "owned" or h.status != "active":
            raise InvalidReaderOperationError("only a book you own can be lent")
        if h.lentTo:
            raise InvalidReaderOperationError("this copy is already lent out")
        h.lentTo, h.lentUntil = to.strip(), add_months(now, months)

    return _mutate(root, apply)


def recall(root: Path, holding_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        h = _find_holding(rf, holding_id)
        h.lentTo, h.lentUntil = None, None

    return _mutate(root, apply)


def record_progress(root: Path, book_id: str, pct: float, pages: int, minutes: int, new_session: bool) -> ReaderState:
    """Reading goes on a book the reader holds: the position, and the day's pages and minutes for the activity calendar."""

    def apply(rf: ReaderFile, now: datetime) -> None:
        held = _active_for(rf, book_id)
        if not held:
            raise HoldingNotFoundError(book_id)
        for h in held:
            if not h.opened:
                h.opened, h.openedAt = True, now
        position = rf.progress.get(book_id) or ReadingPosition()
        position.pct = max(0.0, min(100.0, pct))
        position.pages += max(0, pages)
        position.updatedAt = now
        if position.pct >= 90.0 and position.finishedAt is None:
            position.finishedAt = now
        rf.progress[book_id] = position
        day = rf.activity.setdefault(now.date().isoformat(), ActivityDay())
        day.pages += max(0, pages)
        day.minutes += max(0, minutes)
        if new_session:
            day.sessions += 1

    return _mutate(root, apply)


def add_to_list(root: Path, which: str, book_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        target = rf.wishlist if which == "wishlist" else rf.toRead
        if book_id not in target:
            target.append(book_id)

    return _mutate(root, apply)


def remove_from_list(root: Path, which: str, book_id: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        target = rf.wishlist if which == "wishlist" else rf.toRead
        if book_id in target:
            target.remove(book_id)

    return _mutate(root, apply)


def set_flag_class(root: Path, key: str, flag_class: FlagClass) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        rf.flagClasses[key] = flag_class

    return _mutate(root, apply)


def mark_notifications_read(root: Path) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        for n in rf.notifications:
            n.read = True

    return _mutate(root, apply)
