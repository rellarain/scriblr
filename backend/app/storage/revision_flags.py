"""Revision flags on draft passages (and on the project): keeping a flag on its text while the text is edited."""

from difflib import SequenceMatcher

from .schema import FlagPassage, RevisionFlag

SNIPPET_MAX = 2000


def _map(opcodes, pos: int, new_length: int, side: str) -> tuple[int, str]:
    """Where character `pos` of the old text is in the new, and how it got there ('equal' = unchanged text)."""
    for tag, i1, i2, j1, j2 in opcodes:
        if i1 <= pos < i2:
            if tag == "equal":
                return j1 + (pos - i1), tag
            return (j1 if side == "start" else j2), tag
    return new_length, "end"


def _follow(opcodes, passage: RevisionFlag | FlagPassage, new_body: str) -> bool:
    """Move one passage [start, end) with its text; a passage whose text is gone keeps its place and is marked stale. True if it changed."""
    start, _ = _map(opcodes, passage.start, len(new_body), "start")
    if passage.end > passage.start:
        last, tag = _map(opcodes, passage.end - 1, len(new_body), "end")
        end = last + 1 if tag == "equal" else last
    else:
        end = start
    end = max(start, min(end, len(new_body)))
    start = min(start, len(new_body))
    stale = end <= start and passage.end > passage.start
    snippet = passage.snippet if stale else new_body[start:end][:SNIPPET_MAX]
    if (start, end, snippet, stale) == (passage.start, passage.end, passage.snippet, passage.stale):
        return False
    passage.start, passage.end, passage.snippet, passage.stale = start, end, snippet, stale
    return True


def reanchor(flags: list[RevisionFlag], moment_id: str, old_body: str, new_body: str) -> bool:
    """Move the open passage flags of a moment with its text, and the second passages of merge flags that are in it. True if any changed."""
    open_flags = [f for f in flags if f.scope == "passage" and f.resolvedAt is None]
    passages: list[RevisionFlag | FlagPassage] = [f for f in open_flags if f.momentId == moment_id]
    passages += [f.mergeWith for f in open_flags if f.mergeWith is not None and f.mergeWith.momentId == moment_id]
    if not passages or old_body == new_body:
        return False
    opcodes = SequenceMatcher(None, old_body, new_body, autojunk=False).get_opcodes()
    changed = False
    for passage in passages:
        changed = _follow(opcodes, passage, new_body) or changed
    return changed
