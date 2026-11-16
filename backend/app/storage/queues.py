"""The support queues (one per console of the channel list), kept in support.json beside the chats.

How the pieces fit:
  - Helper time: a person with helper hours (staff.py allotment) schedules them by the week, as blocks (a day, a start hour
    and a number of hours). Only next week's schedule can change, so this week's coverage is fixed; a week with no schedule
    of its own repeats the latest one before it. A person has helper time while now is inside one of this week's blocks.
  - A queue's level comes from how many users are waiting, by ranges the queue's channel support set (one default, and
    per queue if they like): low, medium, high, urgent. A temporary override can raise a queue's level for some hours.
  - The switchboard: on a console where a person has a tier (staff.tier_for), the queue is required up to a tier set by
    its level (low: tier 1; medium: tiers 1-2; high: tiers 1-3; urgent: every tier) and optional above it (the person turns
    it on or off). Without helper time every queue is off. A console where they have no tier is not on their switchboard.
  - The next chat for a person: from the queues that are on for them, a chat at their own tier first (an escalation from the
    tier below); a chat of a lower tier only when its queue is high or urgent or nobody of the tiers between is covering
    it; then by level (urgent first) and the oldest.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from . import feedback, staff

if TYPE_CHECKING:
    from .support import Chat, SupportFile


def SupportError(message: str) -> Exception:  # noqa: N802 (raised like the class it makes)
    # support.py keeps these settings in its file, so it is imported here only when a change is refused.
    from .support import SupportError as Refused
    return Refused(message)

Level = Literal["low", "medium", "high", "urgent"]
LEVELS: tuple[str, ...] = ("low", "medium", "high", "urgent")
# The highest tier a queue at this level requires.
REQUIRED_UP_TO = {"low": 1, "medium": 2, "high": 3, "urgent": 4}
WEEKS_KEPT = 8
OVERRIDE_HOURS_MAX = 24


class Block(BaseModel):
    day: int = Field(ge=0, le=6)  # Monday 0
    start: int = Field(ge=0, le=23)
    hours: int = Field(ge=1, le=12)


class Ranges(BaseModel):
    """How many waiting users make a queue medium, high and urgent (fewer than `medium` is low)."""

    medium: int = Field(default=3, ge=1, le=999)
    high: int = Field(default=6, ge=1, le=999)
    urgent: int = Field(default=10, ge=1, le=999)

    @model_validator(mode="after")
    def _ordered(self) -> "Ranges":
        if not (self.medium < self.high < self.urgent):
            raise ValueError("The ranges go up: medium below high below urgent.")
        return self


class Override(BaseModel):
    level: Level
    until: datetime


class QueueSettings(BaseModel):
    """What support.json keeps about the queues and helper time."""

    # person id -> week (its Monday, YYYY-MM-DD) -> blocks
    schedules: dict[str, dict[str, list[Block]]] = Field(default_factory=dict)
    # person id -> the optional queues they turned on
    switchboard: dict[str, list[str]] = Field(default_factory=dict)
    levels: Ranges = Field(default_factory=Ranges)
    queueLevels: dict[str, Ranges] = Field(default_factory=dict)
    overrides: dict[str, Override] = Field(default_factory=dict)


# --------------------------------------------------------------------------
# Helper time
# --------------------------------------------------------------------------


def week_of(when: datetime) -> str:
    return (when.date() - timedelta(days=when.weekday())).isoformat()


def schedule_for(q: QueueSettings, pid: str, week: str) -> tuple[list[Block], bool]:
    """A person's blocks for a week, and whether that week has its own (else the latest one before it repeats)."""
    weeks = q.schedules.get(pid, {})
    if week in weeks:
        return weeks[week], True
    earlier = sorted(k for k in weeks if k < week)
    return (weeks[earlier[-1]] if earlier else []), False


def on_shift(q: QueueSettings, p: staff.Person, now: datetime) -> bool:
    if not p.active or not p.allotment:
        return False
    hour = now.hour + now.minute / 60
    blocks, _ = schedule_for(q, p.id, week_of(now))
    return any(b.day == now.weekday() and b.start <= hour < b.start + b.hours for b in blocks)


def set_schedule(q: QueueSettings, sf: staff.StaffFile, me: str, blocks: list[dict], now: datetime) -> None:
    """Next week's schedule (this week's is fixed): one block a day at most, inside the day, within the allotment."""
    p = staff.person(sf, me)
    if not p.allotment:
        raise SupportError("No helper hours are allotted to you.")
    try:
        clean = sorted((Block(**b) for b in blocks), key=lambda b: b.day)
    except ValueError as exc:
        raise SupportError("A block is a day, a start hour and 1 to 12 hours.") from exc
    if len({b.day for b in clean}) != len(clean):
        raise SupportError("One block a day.")
    if any(b.start + b.hours > 24 for b in clean):
        raise SupportError("A block ends by midnight.")
    total = sum(b.hours for b in clean)
    if total > p.allotment:
        raise SupportError(f"That is {total} hours; you have {p.allotment} a week.")
    weeks = q.schedules.setdefault(me, {})
    weeks[week_of(now + timedelta(days=7))] = clean
    for old in sorted(weeks)[:-WEEKS_KEPT]:
        del weeks[old]


def seed_schedules(q: QueueSettings, sf: staff.StaffFile, now: datetime) -> None:
    """The sample staff's weekday hours, this week (first use)."""
    starts = {"hlp-ari": 9, "hlp-noor": 13, "adm-sam": 10, "adm-lee": 15}
    week = week_of(now)
    for p in sf.people:
        if p.allotment and p.id in starts:
            per_day = max(1, min(12, p.allotment // 5))
            q.schedules[p.id] = {week: [Block(day=d, start=starts[p.id], hours=per_day) for d in range(5)]}


# --------------------------------------------------------------------------
# Levels
# --------------------------------------------------------------------------


def ranges_of(q: QueueSettings, queue: str) -> Ranges:
    return q.queueLevels.get(queue, q.levels)


def auto_level(r: Ranges, pending: int) -> str:
    if pending >= r.urgent:
        return "urgent"
    if pending >= r.high:
        return "high"
    if pending >= r.medium:
        return "medium"
    return "low"


def active_override(q: QueueSettings, queue: str, now: datetime) -> Optional[Override]:
    o = q.overrides.get(queue)
    return o if o is not None and o.until > now else None


def level_of(q: QueueSettings, queue: str, pending: int, now: datetime) -> str:
    level = auto_level(ranges_of(q, queue), pending)
    o = active_override(q, queue, now)
    if o is not None and LEVELS.index(o.level) > LEVELS.index(level):
        level = o.level
    return level


def _pending(file: SupportFile) -> dict[str, list[Chat]]:
    out: dict[str, list[Chat]] = {}
    for c in file.chats:
        if c.status == "pending":
            out.setdefault(c.queue, []).append(c)
    for chats in out.values():
        chats.sort(key=lambda c: c.waitingSince)
    return out


def levels_now(file: SupportFile, q: QueueSettings, consoles: list[str], now: datetime) -> dict[str, str]:
    pending = _pending(file)
    return {c: level_of(q, c, len(pending.get(c, [])), now) for c in consoles}


# --------------------------------------------------------------------------
# The switchboard
# --------------------------------------------------------------------------


def state(q: QueueSettings, p: staff.Person, queue: str, level: str, shift: bool) -> Optional[str]:
    """required / on / off / unavailable (no helper time now), or None: no tier on this console."""
    tier = staff.tier_for(p, queue)
    if tier is None:
        return None
    if not shift:
        return "unavailable"
    if tier <= REQUIRED_UP_TO[level]:
        return "required"
    return "on" if queue in q.switchboard.get(p.id, []) else "off"


def set_switch(file: SupportFile, q: QueueSettings, sf: staff.StaffFile, me: str, queue: str, on: bool, consoles: list[str], now: datetime) -> None:
    p = staff.person(sf, me)
    if queue not in consoles:
        raise SupportError(f"No console queue {queue}.")
    if staff.tier_for(p, queue) is None:
        raise SupportError("You have no tier on this console.")
    level = levels_now(file, q, [queue], now)[queue]
    if not on and state(q, p, queue, level, True) == "required":
        raise SupportError("This queue is required at its level.")
    chosen = [x for x in q.switchboard.get(me, []) if x != queue and x in consoles]
    if on:
        chosen.append(queue)
    q.switchboard[me] = chosen


def _manages(p: staff.Person, queue: Optional[str]) -> bool:
    # the owner (universal access) manages every queue
    return bool(p.active and (p.id == feedback.OWNER_ID or (queue in p.supports if queue else p.supports)))


def set_ranges(q: QueueSettings, sf: staff.StaffFile, me: str, queue: Optional[str], ranges: Optional[dict], consoles: list[str]) -> None:
    """The default ranges (any channel support) or one queue's (its channel support; none = back to the default)."""
    p = staff.person(sf, me)
    if queue is not None and queue not in consoles:
        raise SupportError(f"No console queue {queue}.")
    if not _manages(p, queue):
        raise SupportError("Only the queue's channel support sets its levels." if queue else "Only channel support sets the default levels.")
    try:
        r = Ranges(**ranges) if ranges is not None else None
    except ValueError as exc:
        raise SupportError("The ranges go up: medium below high below urgent.") from exc
    if queue is None:
        if r is None:
            raise SupportError("The default needs its ranges.")
        q.levels = r
    elif r is None:
        q.queueLevels.pop(queue, None)
    else:
        q.queueLevels[queue] = r


def set_override(q: QueueSettings, sf: staff.StaffFile, me: str, queue: str, level: Optional[str], hours: int, consoles: list[str], now: datetime) -> None:
    p = staff.person(sf, me)
    if queue not in consoles:
        raise SupportError(f"No console queue {queue}.")
    if not _manages(p, queue):
        raise SupportError("Only the queue's channel support raises its level.")
    if level is None:
        q.overrides.pop(queue, None)
        return
    if level not in LEVELS:
        raise SupportError("No such level.")
    if not 1 <= hours <= OVERRIDE_HOURS_MAX:
        raise SupportError(f"An override lasts 1 to {OVERRIDE_HOURS_MAX} hours.")
    q.overrides[queue] = Override(level=level, until=now + timedelta(hours=hours))  # type: ignore[arg-type]


# --------------------------------------------------------------------------
# The next chat
# --------------------------------------------------------------------------


def _on_for(q: QueueSettings, p: staff.Person, levels: dict[str, str], now: datetime) -> dict[str, int]:
    """The queues that are on for a person now, with their tier there."""
    shift = on_shift(q, p, now)
    out: dict[str, int] = {}
    for queue, level in levels.items():
        if state(q, p, queue, level, shift) in ("required", "on"):
            out[queue] = staff.tier_for(p, queue) or 0
    return out


def next_for(file: SupportFile, q: QueueSettings, sf: staff.StaffFile, me: str, consoles: list[str], now: datetime) -> Optional[str]:
    p = next((x for x in sf.people if x.id == me), None)
    if p is None:
        return None
    levels = levels_now(file, q, consoles, now)
    mine = _on_for(q, p, levels, now)
    if not mine:
        return None
    others = [_on_for(q, x, levels, now) for x in sf.people if x.id != me]

    def covered(queue: str, low: int, high: int) -> bool:
        return any(low <= on.get(queue, 0) <= high for on in others)

    picks: list[tuple[tuple, Chat]] = []
    for queue, chats in _pending(file).items():
        tier = mine.get(queue)
        if not tier:
            continue
        rank = LEVELS.index(levels[queue])
        for c in chats:
            if c.tier > tier:
                continue
            own = c.tier == tier
            if not own and rank < LEVELS.index("high") and covered(queue, c.tier, tier - 1):
                continue
            picks.append(((not own, -rank, c.waitingSince), c))
    if not picks:
        return None
    return min(picks, key=lambda x: x[0])[1].id


# --------------------------------------------------------------------------
# The view
# --------------------------------------------------------------------------


def _week(q: QueueSettings, pid: str, week: str) -> dict:
    blocks, own = schedule_for(q, pid, week)
    return {"start": week, "blocks": [b.model_dump() for b in blocks], "hours": sum(b.hours for b in blocks), "own": own}


def view(file: SupportFile, q: QueueSettings, sf: staff.StaffFile, me: str, consoles: list[str], now: datetime) -> dict:
    """The Queue console: my helper time and switchboard; for admins, each queue's staff, chats (never their messages)
    and waiting users, and everyone's helper time this week and next (the Office's Schedule tabs); the levels."""
    p = staff.person(sf, me)
    names = {x.id: x.name for x in sf.people}
    pending = _pending(file)
    levels = levels_now(file, q, consoles, now)
    shifts = {x.id: on_shift(q, x, now) for x in sf.people}
    active = [c for c in file.chats if c.status == "active"]
    chatting = {c.staffId for c in active}
    admin = p.kind == "admin"
    queues = []
    for queue in consoles:
        level = levels[queue]
        row: dict = {
            "id": queue,
            "pending": len(pending.get(queue, [])),
            "level": level,
            "autoLevel": auto_level(ranges_of(q, queue), len(pending.get(queue, []))),
            "override": (o.model_dump(mode="json") if (o := active_override(q, queue, now)) else None),
            "ranges": ranges_of(q, queue).model_dump(),
            "ownRanges": queue in q.queueLevels,
            "myTier": staff.tier_for(p, queue),
            "myState": state(q, p, queue, level, shifts.get(p.id, False)),
            "canManage": _manages(p, queue),
            "staff": [],
            "chats": [],
            "waiting": [],
        }
        if admin:
            for x in sf.people:
                tier = staff.tier_for(x, queue)
                if tier is None:
                    continue
                st = state(q, x, queue, level, shifts[x.id])
                busy = any(c.staffId == x.id and c.queue == queue for c in active)
                status = "active" if busy else "idle" if st in ("required", "on") and x.id not in chatting else "inactive"
                row["staff"].append({"id": x.id, "name": x.name, "tier": tier, "state": status})
            row["staff"].sort(key=lambda s: (("active", "idle", "inactive").index(s["state"]), s["tier"], s["name"].lower()))
            row["chats"] = [{
                "id": c.id, "staffId": c.staffId, "staffName": names.get(c.staffId, c.staffId), "userName": c.userName,
                "focal": c.focal, "stage": c.stage, "tier": c.tier, "createdAt": c.createdAt.isoformat(),
                "actions": [e.kind for e in c.events if e.by != "user"],
            } for c in active if c.queue == queue]
            row["waiting"] = [{"id": c.id, "userName": c.userName, "focal": c.focal, "tier": c.tier, "waitingSince": c.waitingSince.isoformat()} for c in pending.get(queue, [])]
        queues.append(row)
    return {
        "me": {
            "id": p.id, "name": p.name, "kind": p.kind, "allotment": p.allotment, "onShift": shifts.get(p.id, False),
            "thisWeek": _week(q, p.id, week_of(now)), "nextWeek": _week(q, p.id, week_of(now + timedelta(days=7))),
            "managesAny": _manages(p, None),
        },
        "today": now.weekday(),
        # every active person with helper hours, their week and the next (admins only)
        "weeks": [
            {"id": x.id, "thisWeek": _week(q, x.id, week_of(now)), "nextWeek": _week(q, x.id, week_of(now + timedelta(days=7)))}
            for x in sf.people if admin and x.active and x.allotment
        ],
        "levels": q.levels.model_dump(),
        "queues": queues,
        "next": next_for(file, q, sf, me, consoles, now),
    }
