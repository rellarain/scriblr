"""Revision flags on draft passages (and on the project): keeping a flag on its text while the text is edited."""

from difflib import SequenceMatcher

from .schema import RevisionFlag

SNIPPET_MAX = 2000


def _map(opcodes, pos: int, new_length: int, side: str) -> tuple[int, str]:
    """Where character `pos` of the old text is in the new, and how it got there ('equal' = unchanged text)."""
    for tag, i1, i2, j1, j2 in opcodes:
        if i1 <= pos < i2:
            if tag == "equal":
                return j1 + (pos - i1), tag
            return (j1 if side == "start" else j2), tag
    return new_length, "end"


def reanchor(flags: list[RevisionFlag], moment_id: str, old_body: str, new_body: str) -> bool:
    """Move the open passage flags of a moment with its text. A flag whose text is gone keeps its place and is marked stale. True if any changed."""
    mine = [f for f in flags if f.scope == "passage" and f.momentId == moment_id and f.resolvedAt is None]
    if not mine or old_body == new_body:
        return False
    opcodes = SequenceMatcher(None, old_body, new_body, autojunk=False).get_opcodes()
    changed = False
    for flag in mine:
        start, _ = _map(opcodes, flag.start, len(new_body), "start")
        if flag.end > flag.start:
            last, tag = _map(opcodes, flag.end - 1, len(new_body), "end")
            end = last + 1 if tag == "equal" else last
        else:
            end = start
        end = max(start, min(end, len(new_body)))
        start = min(start, len(new_body))
        stale = end <= start and flag.end > flag.start
        snippet = flag.snippet if stale else new_body[start:end][:SNIPPET_MAX]
        if (start, end, snippet, stale) != (flag.start, flag.end, flag.snippet, flag.stale):
            flag.start, flag.end, flag.snippet, flag.stale = start, end, snippet, stale
            changed = True
    return changed
