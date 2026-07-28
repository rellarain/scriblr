"""Aggregated counts, per-book/per-chapter word counts, goal deltas, and
outstanding flags across the whole project. Feeds both the Plan panel (open
task items = goal deltas + flagged nodes) and the Analytics panel."""

from pathlib import Path

from . import project_store as store
from .schema import (
    BookWordCount,
    ChapterWordCount,
    FlaggedNode,
    OutlineNode,
    ProjectAnalytics,
    ProjectAnalyticsGoals,
    ProjectAnalyticsTotals,
)


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


def get_analytics(root: Path, project_id: str) -> ProjectAnalytics:
    index = store.load_index(root, project_id)
    outline = store.load_outline(root, project_id)
    plot = store.load_plot(root, project_id)

    nodes_by_id = {n.id: n for n in outline.nodes}

    moment_word_counts: dict[str, int] = {}
    for moment_id in index.manifest.draftMoments:
        if moment_id not in nodes_by_id:
            continue  # orphaned (scrapped) -- excluded from the live project total
        try:
            draft = store.load_draft(root, project_id, moment_id)
        except (store.MomentNotFoundError, store.ShardCorruptError):
            continue
        moment_word_counts[moment_id] = draft.wordCount

    # Roll each moment's word count up to every ancestor (book, chapter, etc).
    rollup: dict[str, int] = {}
    for moment_id, word_count in moment_word_counts.items():
        rollup[moment_id] = rollup.get(moment_id, 0) + word_count
        current = nodes_by_id.get(moment_id)
        while current is not None and current.parentId:
            rollup[current.parentId] = rollup.get(current.parentId, 0) + word_count
            current = nodes_by_id.get(current.parentId)

    total_word_count = sum(moment_word_counts.values())

    books = [n for n in outline.nodes if n.kind == "book"]
    chapters = [n for n in outline.nodes if n.kind == "chapter"]
    scenes = [n for n in outline.nodes if n.kind == "scene"]
    moments = [n for n in outline.nodes if n.kind == "moment"]

    per_book = [
        BookWordCount(
            nodeId=book.id,
            title=book.title,
            wordCount=rollup.get(book.id, 0),
            chapterCount=sum(1 for c in chapters if _ancestor_of_kind(nodes_by_id, c.id, "book") == book.id),
        )
        for book in books
    ]
    per_chapter = [
        ChapterWordCount(
            nodeId=chapter.id,
            title=chapter.title,
            bookId=_ancestor_of_kind(nodes_by_id, chapter.id, "book"),
            wordCount=rollup.get(chapter.id, 0),
        )
        for chapter in chapters
    ]

    flagged_nodes: list[FlaggedNode] = []
    for node in outline.nodes:
        if node.flag is not None:
            flagged_nodes.append(
                FlaggedNode(nodeId=node.id, treeType="outline", kind=node.kind, title=node.title, flag=node.flag)
            )
    for node in plot.nodes:
        if node.flag is not None:
            flagged_nodes.append(
                FlaggedNode(nodeId=node.id, treeType="plot", kind=node.kind, title=node.title, flag=node.flag)
            )

    totals = ProjectAnalyticsTotals(
        bookCount=len(books),
        chapterCount=len(chapters),
        sceneCount=len(scenes),
        momentCount=len(moments),
        totalWordCount=total_word_count,
    )
    goals = ProjectAnalyticsGoals(
        wordCountTarget=index.settings.wordCountTarget,
        bookCountTarget=index.settings.bookCountTarget,
        chapterCountTarget=index.settings.chapterCountTarget,
        bookWordCountTarget=index.settings.bookWordCountTarget,
        chapterWordCountTarget=index.settings.chapterWordCountTarget,
    )
    return ProjectAnalytics(
        totals=totals,
        goals=goals,
        perBook=per_book,
        perChapter=per_chapter,
        flaggedNodes=flagged_nodes,
    )
