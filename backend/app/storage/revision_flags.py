"""Revision flags on draft passages (and on the project): keeping a flag on its text while the text is edited."""

from difflib import SequenceMatcher

from .schema import FlagPassage, ProjectFile, RevisionFlag

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


# A passage whose text is found again somewhere else only when it is long enough to be that text and not a common phrase.
FIND_ELSEWHERE_MIN = 12


def _occurrences(body: str, snippet: str) -> list[int]:
    out: list[int] = []
    at = body.find(snippet)
    while at >= 0:
        out.append(at)
        at = body.find(snippet, at + 1)
    return out


def _nearest(occurrences: list[int], near: int) -> int:
    return min(occurrences, key=lambda at: abs(at - near))


def rescue(pf: ProjectFile, chapter_id: str, moment_id: str) -> bool:
    """Keep the open passage flags on their text when it moves as a whole (a paragraph moved up or down, or to another moment, by the Draft's
    paragraph tools). After a save of `moment_id`:
    - a flag of this moment whose text left the place it was followed to is put where the text now is in the moment (the nearest copy), or else
      where it alone appears in another moment of the chapter, or else of the project (the text at least FIND_ELSEWHERE_MIN characters long);
      a merge's second passage looks only in its own chapter, as a merge is within one chapter;
    - a flag marked gone anywhere in the project whose text now appears once in this moment comes back, here.
    True if any changed."""
    bodies = {(cid, mid): m.body for cid, chapter in pf.drafts.items() for mid, m in chapter.moments.items()}
    here = bodies.get((chapter_id, moment_id), "")
    changed = False

    def place(passage: RevisionFlag | FlagPassage, at: int) -> None:
        passage.start, passage.end, passage.stale = at, at + len(passage.snippet), False

    def elsewhere(snippet: str, same_chapter_only: bool) -> tuple[str, str, int] | None:
        if len(snippet) < FIND_ELSEWHERE_MIN:
            return None
        tiers = [[k for k in bodies if k[0] == chapter_id and k[1] != moment_id]]
        if not same_chapter_only:
            tiers.append([k for k in bodies if k[0] != chapter_id])
        for keys in tiers:
            found = [(k, at) for k in keys for at in _occurrences(bodies[k], snippet)]
            if len(found) == 1:
                (cid, mid), at = found[0]
                return cid, mid, at
            if found:
                return None  # more than one copy: no way to tell which is the flag's
        return None

    for flag in pf.revisionFlags:
        if flag.scope != "passage" or flag.resolvedAt is not None:
            continue
        passages: list[tuple[RevisionFlag | FlagPassage, bool]] = []
        if flag.momentId == moment_id and flag.chapterId == chapter_id:
            passages.append((flag, False))
        if flag.mergeWith is not None and flag.mergeWith.momentId == moment_id and flag.chapterId == chapter_id:
            passages.append((flag.mergeWith, True))
        for passage, is_second in passages:
            if not passage.snippet or here[passage.start:passage.start + len(passage.snippet)] == passage.snippet:
                continue
            copies = _occurrences(here, passage.snippet)
            if copies:
                place(passage, _nearest(copies, passage.start))
                changed = True
                continue
            found = elsewhere(passage.snippet, same_chapter_only=is_second)
            if found is None:
                if not passage.stale:
                    passage.stale = True
                    changed = True
                continue
            cid, mid, at = found
            if is_second:
                passage.momentId = mid
            else:
                flag.chapterId, flag.momentId = cid, mid
            place(passage, at)
            changed = True

    # Passages marked gone whose text turns up, once, in the moment just saved (a merge's second passage only within its chapter).
    for flag in pf.revisionFlags:
        if flag.scope != "passage" or flag.resolvedAt is not None:
            continue
        if flag.stale and flag.snippet:
            if (flag.chapterId, flag.momentId) == (chapter_id, moment_id) or len(flag.snippet) >= FIND_ELSEWHERE_MIN:
                copies = _occurrences(here, flag.snippet)
                if len(copies) == 1:
                    flag.chapterId, flag.momentId = chapter_id, moment_id
                    place(flag, copies[0])
                    changed = True
        second = flag.mergeWith
        if second is not None and second.stale and second.snippet and flag.chapterId == chapter_id:
            if second.momentId == moment_id or len(second.snippet) >= FIND_ELSEWHERE_MIN:
                copies = _occurrences(here, second.snippet)
                if len(copies) == 1:
                    second.momentId = moment_id
                    place(second, copies[0])
                    changed = True
    return changed
