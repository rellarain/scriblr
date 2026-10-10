"""How far each book of a project has come, for the bars on its spine (the shelf): plotting, outlining and planning (the top bars),
plotpoint assignment, revision and publishing (the bottom bars) and the words written against the book's goal (the vertical bar)."""

from pathlib import Path

from . import project_store as store
from .schema import BookProgress, Measure, OutlineNode

_BODY_KINDS = ("act", "scene", "moment")


def _ancestor_of_kind(nodes_by_id: dict[str, OutlineNode], node_id: str, kind: str) -> str | None:
    current = nodes_by_id.get(node_id)
    while current is not None and current.parentId:
        parent = nodes_by_id.get(current.parentId)
        if parent is None:
            return None
        if parent.kind == kind:
            return parent.id
        current = parent
    return None


def _has_outline_below(nodes: list[OutlineNode], chapter_id: str) -> bool:
    """Does the chapter have an act, a scene or a moment of its own below it (a moment made for free drafting does not count)?"""
    by_parent: dict[str | None, list[OutlineNode]] = {}
    for n in nodes:
        by_parent.setdefault(n.parentId, []).append(n)
    stack = list(by_parent.get(chapter_id, []))
    while stack:
        node = stack.pop()
        if node.kind in _BODY_KINDS and not node.freeDraft:
            return True
        stack.extend(by_parent.get(node.id, []))
    return False


def get_book_progress(root: Path, project_id: str) -> dict[str, BookProgress]:
    pf, _errors = store._load_project_file(root, project_id)
    nodes = pf.outline.nodes
    by_id = {n.id: n for n in nodes}
    plot_nodes = pf.plot.nodes
    plotpoints_by_line: dict[str, list] = {}
    for p in plot_nodes:
        if p.kind == "plotpoint" and p.parentId:
            plotpoints_by_line.setdefault(p.parentId, []).append(p)
    plotline_ids = {p.id for p in plot_nodes if p.kind == "plotline"}

    words_by_node: dict[str, int] = {}
    for moment_id in pf.index.manifest.draftMoments:
        if moment_id not in by_id:
            continue
        chapter_id = _ancestor_of_kind(by_id, moment_id, "chapter")
        if chapter_id is None:
            continue
        for chapter_draft in (pf.drafts.get(chapter_id),):
            moment = chapter_draft.moments.get(moment_id) if chapter_draft else None
            if moment is None:
                continue
            current = by_id.get(moment_id)
            while current is not None:
                words_by_node[current.id] = words_by_node.get(current.id, 0) + moment.wordCount
                current = by_id.get(current.parentId) if current.parentId else None

    result: dict[str, BookProgress] = {}
    for book in (n for n in nodes if n.kind == "book"):
        chapters = [c for c in nodes if c.kind == "chapter" and _ancestor_of_kind(by_id, c.id, "book") == book.id]
        lines = [pid for pid in book.plotlineIds if pid in plotline_ids]
        points = [p for pid in lines for p in plotpoints_by_line.get(pid, [])]
        planning_items = [
            bool(book.synopsis.strip()),
            bool(book.wordCountGoal),
            bool(book.chapterCountTarget),
            bool(book.timeSystemId),
        ]
        # Planning is measured once the book has a goal (a word count or a chapter target) to plan toward.
        has_goal = bool(book.wordCountGoal or book.chapterCountTarget)
        result[book.id] = BookProgress(
            plotting=Measure(done=sum(1 for pid in lines if plotpoints_by_line.get(pid)), total=len(lines)),
            outlining=Measure(done=sum(1 for c in chapters if _has_outline_below(nodes, c.id)), total=len(chapters)),
            planning=Measure(done=sum(planning_items) if has_goal else 0, total=len(planning_items) if has_goal else 0),
            assignment=Measure(done=sum(1 for p in points if p.assignedMomentId), total=len(points)),
            revision=Measure(
                done=sum(1 for c in chapters if any(r.trigger == "manual" for r in pf.revisions.get(c.id, []))), total=len(chapters)
            ),
            published=Measure(done=sum(1 for c in chapters if pf.publications.get(c.id)), total=len(chapters)),
            words=Measure(done=words_by_node.get(book.id, 0), total=book.wordCountGoal or 0),
        )
    return result
