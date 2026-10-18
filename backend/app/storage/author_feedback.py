"""What an author sees about their published books: how many borrowed and bought them, what they earned, the reviews, and the readers' anonymous
reactions to each chapter. Money is simulated: an author's share of a loan is $3.00 for its first credit and $1.00 for each further one (the
Reader's split), and of a sale 70% of the price. The only reader on this machine is the reader account itself, so the numbers are its own."""

from datetime import datetime
from pathlib import Path

from . import book_publishing, library, project_store, reading_text, social_views
from .reader_schema import BookFeedback, BookSummary, ChapterFeedback, ReaderFile, SentenceTotal

BASE_SHARE_CENTS = 300
EXTRA_SHARE_CENTS = 100
SALE_SHARE_PERCENT = 70


def local_id(project_id: str, book_id: str) -> str:
    return f"local-{project_id}-{book_id}"


def _loans_and_sales(rf: ReaderFile, book_id: str, price_cents: int) -> tuple[int, int, int, int, int]:
    """(loans, active loans, sales, the author's share of loans, of sales), in cents."""
    refunded: dict[str, int] = {}
    for e in rf.ledger:
        if e.kind == "refund" and e.holdingId:
            refunded[e.holdingId] = refunded.get(e.holdingId, 0) + e.delta
    loans = active = sales = loan_share = 0
    for h in rf.holdings:
        if h.bookId != book_id:
            continue
        if h.kind == "borrowed" and h.status != "cancelled":
            credits = h.credits - refunded.get(h.id, 0)
            if credits > 0:
                loans += 1
                loan_share += BASE_SHARE_CENTS + EXTRA_SHARE_CENTS * (credits - 1)
                active += 1 if h.status == "active" else 0
        elif h.kind == "owned":
            sales += 1
    return loans, active, sales, loan_share, round(sales * price_cents * SALE_SHARE_PERCENT / 100)


def book_feedback(rf: ReaderFile, projects_root: Path, project_id: str, book_id: str, now: datetime) -> BookFeedback:
    pf, _errors = project_store._load_project_file(projects_root, project_id)
    book_publishing.book_node(pf, book_id)
    listing = pf.bookListings.get(book_id)
    full = local_id(project_id, book_id)
    edition = listing.editions[-1] if listing and listing.editions else None
    price = listing.meta.buyPriceCents if listing else 900
    loans, active, sales, loan_share, sale_share = _loans_and_sales(rf, full, price)
    chapters: list[ChapterFeedback] = []
    marks = rf.marks.get(full, {}) if rf.settings.shareReactions else {}
    for c in edition.chapters if edition else []:
        mine = {k: m for k, m in marks.items() if reading_text.chapter_of_key(k) == c.n and (m.like or m.dislike)}
        top = sorted(
            (SentenceTotal(key=k, pleasant=1 if m.like else 0, unpleasant=1 if m.dislike else 0) for k, m in mine.items()),
            key=lambda t: t.key,
        )[:5]
        chapters.append(
            ChapterFeedback(n=c.n, title=c.title, readers=1 if mine else 0, pleasant=sum(1 for m in mine.values() if m.like), unpleasant=sum(1 for m in mine.values() if m.dislike), top=top)
        )
    try:
        card = social_views.book_card(rf, library.get_book(projects_root, full), now)
        reviews = [r for r in card.reviews if r.mine]
        rating, ratings = (reviews[0].score, 1) if reviews else (0.0, 0)
    except library.BookNotFoundError:
        reviews, rating, ratings = [], 0.0, 0
    touched = any(h.bookId == full for h in rf.holdings) or full in rf.progress or full in rf.marks
    return BookFeedback(
        bookId=full,
        listed=bool(listing and listing.listed),
        editions=len(listing.editions) if listing else 0,
        loans=loans,
        activeLoans=active,
        sales=sales,
        loanShareCents=loan_share,
        saleShareCents=sale_share,
        readers=1 if touched else 0,
        rating=float(rating),
        ratings=ratings,
        reviews=reviews,
        chapters=chapters,
        invites=dict(listing.invites) if listing else {},
    )


def all_summaries(rf: ReaderFile, projects_root: Path, now: datetime) -> list[BookSummary]:
    out: list[BookSummary] = []
    for pf in project_store.iter_project_files(projects_root):
        index = pf.index
        for node in (n for n in pf.outline.nodes if n.kind == "book"):
            listing = pf.bookListings.get(node.id)
            if listing is None or not listing.editions:
                continue
            fb = book_feedback(rf, projects_root, index.projectId, node.id, now)
            out.append(
                BookSummary(
                    projectId=index.projectId,
                    bookId=node.id,
                    title=node.title or "Untitled",
                    listed=fb.listed,
                    editions=fb.editions,
                    loans=fb.loans,
                    sales=fb.sales,
                    earningsCents=fb.loanShareCents + fb.saleShareCents,
                    rating=fb.rating,
                    ratings=fb.ratings,
                    reviews=len(fb.reviews),
                )
            )
    return out
