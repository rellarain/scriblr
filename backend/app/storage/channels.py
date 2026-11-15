"""The channel list: the app's one Interface > Console > Component > Feature tree, with stable ids, that
feedback, plans, support chats and queues all point at. It is kept as the node tree of resources.json (the
Resources guides hang off the same ids) and edited by admins in Configuration > Channels.

`APP_SCREENS` names what the app really shows (its interfaces, their consoles and the tiles of each) under
fixed ids. It is merged into the tree once per `SCREENS_VERSION`: missing nodes are added, nothing is renamed
or removed, so an admin's edits survive and a new screen arrives with the next version. Features are the
admins' own.

Other stores say which nodes they point at through `register_use_check`, so a node something still uses
cannot be deleted.
"""

import re
from pathlib import Path
from typing import Callable, Literal, Optional

NodeKind = Literal["interface", "console", "component", "feature"]

CHILD_KIND: dict[str, Optional[str]] = {"interface": "console", "console": "component", "component": "feature", "feature": None}

SCREENS_VERSION = 1

# Interface -> its consoles -> the tiles (components) of each console, in screen order.
_SCREENS: list[tuple[str, list[tuple[str, list[str]]]]] = [
    ("Writer", [
        ("Dashboard", ["Schedule", "Readers", "Scratchpad", "Project", "Settings"]),
        ("Project", ["Plot", "Outline", "Schedule", "Project", "Maps", "Characters", "Items", "History", "Settings"]),
        ("Book", ["Book outline", "Book details", "Publish", "Settings"]),
        ("Draft", ["Chapter", "Plotpoints", "Draft", "Settings"]),
    ]),
    ("Reader", [
        ("Nook", ["Stack", "Journal", "Analytics", "Feed"]),
        ("Library", ["Catalog", "Shelves", "Shelf", "History"]),
        ("Book", ["Bookcover", "Bookface", "Bookcard", "Frontmatter", "Backmatter", "Maps", "Cast", "Outline", "Plot", "Plan", "Revisions"]),
        ("Pages", ["Flags", "Reactions", "Body", "Footnotes", "Annotations", "Settings"]),
    ]),
    ("Training", [
        ("Desk", ["Courses", "Catalog", "Settings"]),
        ("Course", ["Modules", "Exams", "Projects"]),
        ("Module", ["Lessons", "Tests"]),
        ("Lesson", ["Material", "Quizzes", "Exercises"]),
    ]),
    ("User", [
        ("Dashboard", ["Activity Log", "Schedule", "Notifications"]),
        ("Account", ["Profile", "Subscription", "Portfolio", "Flags"]),
    ]),
    ("Helper", [
        ("Inbox", ["Check", "Configuration"]),
        ("Queue", ["Switchboard", "Overview"]),
        ("Chat", ["Conversation"]),
        ("Settings", ["Schedule"]),
    ]),
    ("Admin", [
        ("Dashboard", ["Notifications", "Schedule"]),
        ("Project Plan", ["Plans", "My work", "Timeline", "Board"]),
        ("Organizer", ["Bookclub Management"]),
        ("Office", [
            "Allotment", "Assignment", "Team Schedule", "Department Details", "Department Roster", "Department Analytics",
            "Department", "Monitor Training", "Department Schedules", "Hire/Term Admin", "Voting", "Channel Management",
        ]),
        ("Configuration", ["Overview", "Plot", "Maps", "Channels"]),
        ("Designer", ["Shape editor"]),
        ("Resources", ["Article Builder", "Quiz Builder"]),
        ("Instructor", ["Courses"]),
    ]),
]


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "node"


def child_id(parent_id: Optional[str], name: str) -> str:
    return f"{parent_id}/{slug(name)}" if parent_id else slug(name)


def _screens() -> list[tuple[str, str, Optional[str], str, int]]:
    """Every screen node as (id, kind, parentId, name, order), parents before children."""
    out: list[tuple[str, str, Optional[str], str, int]] = []
    for ii, (iname, consoles) in enumerate(_SCREENS):
        iid = child_id(None, iname)
        out.append((iid, "interface", None, iname, ii))
        for ci, (cname, components) in enumerate(consoles):
            cid = child_id(iid, cname)
            out.append((cid, "console", iid, cname, ci))
            for ki, kname in enumerate(components):
                out.append((child_id(cid, kname), "component", cid, kname, ki))
    return out


APP_SCREENS = _screens()
SCREEN_IDS = frozenset(s[0] for s in APP_SCREENS)


def merge_screens(nodes: list, make) -> int:
    """Add every screen node missing from `nodes` (by id), after the siblings already there. `make(id, kind,
    parentId, name, order)` builds a node. Returns how many were added."""
    have = {n.id for n in nodes}
    next_order: dict[Optional[str], int] = {}
    for n in nodes:
        next_order[n.parentId] = max(next_order.get(n.parentId, 0), n.order + 1)
    added = 0
    for node_id, kind, parent_id, name, order in APP_SCREENS:
        if node_id in have:
            continue
        if parent_id is not None and parent_id not in have:
            continue  # its parent was deleted by an admin: leave the whole branch out
        place = next_order.get(parent_id)
        at = order if place is None else place
        nodes.append(make(node_id, kind, parent_id, name, at))
        next_order[parent_id] = at + 1
        have.add(node_id)
        added += 1
    return added


def kind_fits(parent_kind: Optional[str], kind: str) -> bool:
    """An interface sits at the top; every other kind sits under the kind one level up."""
    if parent_kind is None:
        return kind == "interface"
    return CHILD_KIND.get(parent_kind) == kind


# --------------------------------------------------------------------------
# What points at a node
# --------------------------------------------------------------------------

UseCheck = Callable[[Path, set[str]], list[str]]
_use_checks: list[UseCheck] = []


def register_use_check(check: UseCheck) -> None:
    """`check(root, ids)` returns a short description of each thing that points at any of `ids`
    ("2 feedback messages"), or nothing."""
    if check not in _use_checks:
        _use_checks.append(check)


def uses(root: Path, ids: set[str]) -> list[str]:
    found: list[str] = []
    for check in _use_checks:
        found.extend(check(root, ids))
    return found
