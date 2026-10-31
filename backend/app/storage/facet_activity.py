"""Faceted activity: what the Schedule console's grid, line graph and charts and the header ribbon are drawn from.

Every change to the outline, plot, draft, revision flags or project is an ActivityEvent, kept for FACET_EVENT_DAYS days (one per node per
10-minute slot: autosaving the same node again inside a slot adds to it, it is not a new event). The days' totals per facet are kept for about a
year; whole months older than that fold into monthly totals, kept for good. A 28-day profile of how many events fell in each slot of the day, per
facet, lets the ribbon say whether a slot of today was busier than usual. All days are the machine's local days. Nothing runs in the background:
`compact_project` is called when a project is opened, like the tree history's compaction.
"""

from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable, Optional

from . import project_store as store
from .schema import (
    DAILY_KEEP_DAYS,
    FACET_EVENT_DAYS,
    FACETS,
    SLOT_PROFILE_DAYS,
    SLOTS_PER_DAY,
    ActivityEvent,
    DayTotals,
    FacetActivity,
    MonthTotals,
    ProjectFile,
)

# A safety cap on the detail kept, whatever the days: the oldest events go first.
MAX_EVENTS = 20000
SLOT_MINUTES = 10


def local_now() -> datetime:
    return datetime.now().astimezone()


def slot_of(moment: datetime) -> int:
    return (moment.hour * 60 + moment.minute) // SLOT_MINUTES


def book_of(nodes, node_id: Optional[str]) -> Optional[str]:
    """The id of the book an outline node sits under (itself when it is one), or None."""
    if node_id is None:
        return None
    by_id = {n.id: n for n in nodes}
    seen: set[str] = set()
    current = by_id.get(node_id)
    while current is not None and current.id not in seen:
        if current.kind == "book":
            return current.id
        seen.add(current.id)
        current = by_id.get(current.parentId) if current.parentId else None
    return None


def _add_to_totals(totals: DayTotals, facet: str, action: str, amount: int, kind: Optional[str], book_id: Optional[str]) -> None:
    if facet == "draft":
        totals.draft += amount
        if book_id:
            totals.books[book_id] = totals.books.get(book_id, 0) + amount
    else:
        setattr(totals, facet, getattr(totals, facet) + 1)
    if action == "flag":
        totals.flagsApplied += 1
    elif action == "resolve":
        totals.flagsResolved += 1
    elif action == "create" and kind:
        totals.kinds[kind] = totals.kinds.get(kind, 0) + 1


def apply_event(
    fa: FacetActivity,
    now: datetime,
    facet: str,
    action: str,
    *,
    node_id: Optional[str] = None,
    kind: Optional[str] = None,
    label: Optional[str] = None,
    amount: int = 1,
    book_id: Optional[str] = None,
) -> None:
    """Record one event in `fa`. The same node doing the same thing again inside one slot is merged into the first."""
    day = now.date().isoformat()
    slot = slot_of(now)
    if node_id is not None:
        for earlier in reversed(fa.events):
            if (earlier.date, earlier.slot) < (day, slot):
                break
            if earlier.date == day and earlier.slot == slot and earlier.facet == facet and earlier.action == action and earlier.nodeId == node_id:
                if action == "words":
                    earlier.amount += amount
                    _add_to_totals(fa.daily.setdefault(day, DayTotals()), facet, action, amount, kind, book_id)
                return
    fa.events.append(
        ActivityEvent(
            ts=now.isoformat(timespec="seconds"), date=day, slot=slot, facet=facet, action=action,
            nodeId=node_id, kind=kind, label=(label or None) and label[:120], amount=amount,
        )
    )
    if len(fa.events) > MAX_EVENTS:
        del fa.events[: len(fa.events) - MAX_EVENTS]
    _add_to_totals(fa.daily.setdefault(day, DayTotals()), facet, action, amount, kind, book_id)
    counts = fa.slots.setdefault(day, {}).setdefault(facet, [0] * SLOTS_PER_DAY)
    counts[slot] += 1


def record(
    root: Path,
    project_id: str,
    facet: str,
    action: str,
    *,
    node_id: Optional[str] = None,
    kind: Optional[str] = None,
    label: Optional[str] = None,
    amount: int = 1,
    book_id: Optional[str] = None,
    when: Optional[datetime] = None,
) -> None:
    now = when or local_now()

    def _do(pf: ProjectFile) -> None:
        apply_event(pf.facets, now, facet, action, node_id=node_id, kind=kind, label=label, amount=amount, book_id=book_id)

    store.mutate(root, project_id, _do)


# ---------------------------------------------------------------------------
# Tree changes: a saved tree is compared with the one it replaces, node by node.
# ---------------------------------------------------------------------------


def tree_changes(tree_type: str, old_nodes: Iterable[dict], new_nodes: Iterable[dict]) -> list[tuple[str, str, dict]]:
    """(facet, action, node) for every node created, edited or deleted, and every flag put on or taken off one. A plotpoint that mirrors a
    field's value (sourceFieldId) is not a change of its own."""
    old = {n["id"]: n for n in old_nodes}
    new = {n["id"]: n for n in new_nodes}
    out: list[tuple[str, str, dict]] = []
    for node_id, node in new.items():
        if node.get("sourceFieldId"):
            continue
        before = old.get(node_id)
        if before is None:
            out.append((tree_type, "create", node))
            if node.get("flag"):
                out.append(("revision", "flag", node))
            continue
        if before == node:
            continue
        if {k: v for k, v in before.items() if k != "flag"} != {k: v for k, v in node.items() if k != "flag"}:
            out.append((tree_type, "edit", node))
        had, has = before.get("flag"), node.get("flag")
        if has and not had:
            out.append(("revision", "flag", node))
        elif had and not has:
            out.append(("revision", "resolve", node))
    for node_id, node in old.items():
        if node_id not in new and not node.get("sourceFieldId"):
            out.append((tree_type, "delete", node))
    return out


def record_tree_changes(
    root: Path, project_id: str, tree_type: str, old_nodes: Iterable[dict], new_nodes: Iterable[dict], when: Optional[datetime] = None
) -> int:
    changes = tree_changes(tree_type, old_nodes, new_nodes)
    if not changes:
        return 0
    now = when or local_now()

    def _do(pf: ProjectFile) -> None:
        for facet, action, node in changes:
            apply_event(
                pf.facets, now, facet, action, node_id=node["id"], kind=node.get("kind"),
                label=node.get("title") or None, book_id=None,
            )

    store.mutate(root, project_id, _do)
    return len(changes)


# ---------------------------------------------------------------------------
# Compaction
# ---------------------------------------------------------------------------


def _is_active(day: DayTotals) -> bool:
    return bool(day.outline or day.plot or day.revision or day.project or day.draft > 0)


def _fold_day(month: MonthTotals, day: DayTotals) -> None:
    for facet in FACETS:
        setattr(month, facet, getattr(month, facet) + getattr(day, facet))
    month.flagsApplied += day.flagsApplied
    month.flagsResolved += day.flagsResolved
    for book, words in day.books.items():
        month.books[book] = month.books.get(book, 0) + words
    for kind, count in day.kinds.items():
        month.kinds[kind] = month.kinds.get(kind, 0) + count
    if _is_active(day):
        month.activeDays += 1


def fold_legacy(pf: ProjectFile, today: date) -> bool:
    """Fold the older per-day saves (DailyActivityLog) into the daily totals, once. Today and any day the faceted log already has are left
    out: the older counters are still kept beside the new events, so those days would be counted twice."""
    fa = pf.facets
    if fa.legacyFolded:
        return False
    for day, entry in pf.activity.days.items():
        if day >= today.isoformat() or day in fa.daily:
            continue
        totals = fa.daily.setdefault(day, DayTotals())
        totals.outline += entry.outlineSaves
        totals.plot += entry.plotSaves
        totals.draft += entry.wordCountDelta
        totals.revision += entry.draftRevisions
    fa.legacyFolded = True
    return True


def compact(fa: FacetActivity, today: date) -> bool:
    """Drop the detail that has aged out: events after FACET_EVENT_DAYS, slot profiles after SLOT_PROFILE_DAYS, and fold whole months of daily
    totals older than DAILY_KEEP_DAYS into monthly totals. True when anything changed."""
    changed = False
    events_from = (today - timedelta(days=FACET_EVENT_DAYS)).isoformat()
    kept = [e for e in fa.events if e.date > events_from]
    if len(kept) != len(fa.events):
        fa.events = kept
        changed = True
    slots_from = (today - timedelta(days=SLOT_PROFILE_DAYS)).isoformat()
    for day in [d for d in fa.slots if d <= slots_from]:
        del fa.slots[day]
        changed = True
    boundary = (today - timedelta(days=DAILY_KEEP_DAYS)).replace(day=1).isoformat()
    for day in sorted(d for d in fa.daily if d < boundary):
        _fold_day(fa.monthly.setdefault(day[:7], MonthTotals()), fa.daily.pop(day))
        changed = True
    return changed


def compact_project(root: Path, project_id: str, today: Optional[date] = None) -> bool:
    today = today or local_now().date()
    with store.transaction(root, project_id) as pf:
        changed = fold_legacy(pf, today)
        changed = compact(pf.facets, today) or changed
        if changed:
            store.mutate(root, project_id, lambda _pf: None)  # mark the file for writing
        return changed


# ---------------------------------------------------------------------------
# The ribbon: today's events per slot against the average of the last SLOT_PROFILE_DAYS days.
# ---------------------------------------------------------------------------


def slot_profile(fa: FacetActivity, today: date) -> tuple[dict[str, list[int]], dict[str, list[float]]]:
    """(today's events per slot per facet, the average per slot per facet over the previous SLOT_PROFILE_DAYS days)."""
    today_s = today.isoformat()
    now_counts = {f: list(fa.slots.get(today_s, {}).get(f, [0] * SLOTS_PER_DAY)) for f in FACETS}
    totals = {f: [0.0] * SLOTS_PER_DAY for f in FACETS}
    for back in range(1, SLOT_PROFILE_DAYS + 1):
        day = fa.slots.get((today - timedelta(days=back)).isoformat())
        if not day:
            continue
        for facet, counts in day.items():
            if facet in totals:
                for i, n in enumerate(counts):
                    totals[facet][i] += n
    average = {f: [round(n / SLOT_PROFILE_DAYS, 4) for n in totals[f]] for f in FACETS}
    return now_counts, average


def ribbon(root: Path, today: Optional[date] = None) -> dict:
    """The account's slots for today (every project added together): events per slot per facet, and their average."""
    today = today or local_now().date()
    now_total = {f: [0] * SLOTS_PER_DAY for f in FACETS}
    avg_total = {f: [0.0] * SLOTS_PER_DAY for f in FACETS}
    for project in store.list_projects(root):
        try:
            fa = store.load_facets(root, project.projectId)
        except (store.ShardCorruptError, store.ProjectNotFoundError):  # a project that cannot be read adds nothing to the ribbon
            continue
        now_counts, average = slot_profile(fa, today)
        for facet in FACETS:
            for i in range(SLOTS_PER_DAY):
                now_total[facet][i] += now_counts[facet][i]
                avg_total[facet][i] += average[facet][i]
    return {"date": today.isoformat(), "today": now_total, "average": {f: [round(n, 4) for n in avg_total[f]] for f in FACETS}}
