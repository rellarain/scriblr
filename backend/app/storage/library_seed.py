"""The demo shelf: a seeded catalog of other authors' books (lorem ipsum where text is needed), so the Reader can be explored in a
single-user, offline app. The shapes are the ones a networked library would serve; only the source is local and fixed."""

from .reader_schema import Author, AuthorFlag, CatalogBook, SeriesRef

_LOREM = [
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
    "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
    "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
]

_AUTHORS = [
    ("mara-quill", "Mara Quill", 1402),
    ("idris-vale", "Idris Vale", 910),
    ("noor-haddad", "Noor Haddad", 820),
    ("ines-okoro", "Ines Okoro", 230),
    ("wren-alder", "Wren Alder", 510),
    ("tomas-beck", "Tomas Beck", 1900),
    ("calla-reyes", "Calla Reyes", 640),
    ("odile-hart", "Odile Hart", 380),
]

_FLAGS = {
    "grief": ("Grief", "The death of a parent is discussed, mostly in the early chapters.", "marked"),
    "violence": ("Mild violence", "A short fight; one character is cut. Not graphic.", "highlight"),
    "alcohol": ("Alcohol", "Present throughout, never central.", "marked"),
    "war": ("War", "An old war is remembered; no battles are shown.", "marked"),
    "ending": ("The ending", "Lorem ipsum: the narrator was the author of the letters all along.", "spoiler"),
}

# (id, title, author id, type, genres, tags, tropes, flag keys, words, rating, ratings, readers, series (id, title, order), hue, price, published)
_BOOKS = [
    ("cold-harbor", "Cold Harbor", "mara-quill", "novel", ["Literary"], ["harbor", "ledgers"], ["Slow burn", "Found family"], ["grief", "violence", "ending"], 80000, 8.8, 1208, 1402, None, 28, 900, "2026-03-04"),
    ("thaw", "Thaw", "mara-quill", "novel", ["Literary"], ["winter"], ["Slow burn"], ["grief"], 60000, 8.6, 940, 940, ("ember-cycle", "The Ember Cycle", 1), 330, 900, "2025-11-12"),
    ("ember", "Ember", "mara-quill", "novel", ["Literary", "Fantasy"], ["fire"], ["Slow burn", "Chosen one"], ["violence"], 120000, 9.2, 610, 610, ("ember-cycle", "The Ember Cycle", 2), 10, 1200, "2026-06-20"),
    ("ash", "Ash", "mara-quill", "novel", ["Literary", "Fantasy"], ["fire"], ["Slow burn"], [], 0, 0.0, 0, 90, ("ember-cycle", "The Ember Cycle", 3), 20, 1200, None),
    ("the-salt-ledger", "The Salt Ledger", "idris-vale", "essays", ["Essays"], ["work", "sea"], [], [], 42000, 9.4, 610, 610, None, 210, 700, "2024-09-01"),
    ("small-weather", "Small Weather", "idris-vale", "essays", ["Essays"], ["weather"], [], [], 31000, 8.4, 300, 300, None, 200, 700, "2025-05-15"),
    ("lantern-hours", "Lantern Hours", "noor-haddad", "novel", ["Literary", "Mystery"], ["night", "lighthouse"], ["Locked room", "Unreliable narrator"], ["alcohol", "ending"], 96000, 8.2, 820, 820, None, 270, 900, "2025-08-30"),
    ("field-notes-on-weather", "Field Notes on Weather", "ines-okoro", "magazine", ["Science", "Essays"], ["weather", "fieldwork"], [], [], 18000, 8.0, 230, 230, None, 150, 400, "2026-09-02"),
    ("the-orchard-clause", "The Orchard Clause", "wren-alder", "novel", ["Mystery"], ["orchard", "law"], ["Found family", "Heist"], ["alcohol"], 88000, 7.4, 510, 510, None, 12, 900, "2025-02-18"),
    ("a-short-history-of-rope", "A Short History of Rope", "tomas-beck", "article", ["History"], ["rope", "trade"], [], [], 6000, 8.2, 1900, 1900, None, 35, 200, "2024-04-10"),
    ("knots-and-nations", "Knots and Nations", "tomas-beck", "essays", ["History", "Essays"], ["rope", "empire"], [], ["war"], 54000, 7.8, 420, 420, None, 40, 800, "2025-10-01"),
    ("river-clerks", "River Clerks", "calla-reyes", "novel", ["Literary", "Historical"], ["river", "ledgers"], ["Slow burn", "Enemies to lovers"], ["war"], 105000, 8.0, 640, 640, ("river-books", "The River Books", 1), 160, 1000, "2025-06-06"),
    ("river-wardens", "River Wardens", "calla-reyes", "novel", ["Literary", "Historical"], ["river"], ["Slow burn"], ["war", "violence"], 112000, 8.3, 360, 360, ("river-books", "The River Books", 2), 165, 1000, "2026-04-14"),
    ("the-glass-orchard", "The Glass Orchard", "odile-hart", "novella", ["Fantasy"], ["glass", "orchard"], ["Chosen one", "Found family"], [], 34000, 7.6, 380, 380, None, 300, 600, "2025-12-02"),
    ("quiet-engines", "Quiet Engines", "odile-hart", "novel", ["Science fiction"], ["machines", "quiet"], ["Found family", "Heist"], ["grief"], 92000, 8.1, 260, 260, None, 190, 900, "2026-01-22"),
    ("the-tide-tables", "The Tide Tables", "ines-okoro", "article", ["Science"], ["tides"], [], [], 4800, 7.9, 150, 150, None, 205, 200, "2026-02-11"),
    ("paper-moons", "Paper Moons", "noor-haddad", "novel", ["Literary"], ["childhood"], ["Coming of age"], ["grief"], 71000, 8.5, 700, 700, None, 320, 900, "2024-12-05"),
    ("what-the-fog-owes", "What the Fog Owes", "mara-quill", "novella", ["Literary"], ["harbor", "fog"], ["Slow burn"], [], 28000, 8.7, 330, 330, None, 28, 500, "2026-08-08"),
    ("salt-and-rope", "Salt and Rope", "idris-vale", "essays", ["Essays", "History"], ["sea", "rope"], [], [], 39000, 8.1, 280, 280, None, 205, 700, "2026-05-03"),
    ("the-weir", "The Weir", "wren-alder", "novel", ["Mystery", "Literary"], ["river", "weir"], ["Locked room"], ["violence"], 83000, 7.9, 290, 290, None, 140, 900, "2026-07-17"),
    ("hours-between", "Hours Between", "calla-reyes", "essays", ["Essays"], ["time"], [], [], 26000, 8.3, 170, 170, None, 175, 600, "2026-03-25"),
    ("lamp-oil", "Lamp Oil", "tomas-beck", "magazine", ["History", "Science"], ["light", "trade"], [], [], 15000, 7.7, 210, 210, None, 45, 400, "2026-09-20"),
    ("the-long-winter", "The Long Winter Mail", "odile-hart", "novel", ["Literary", "Historical"], ["winter", "letters"], ["Slow burn", "Epistolary"], ["ending"], 99000, 8.9, 450, 450, None, 340, 1000, "2025-03-28"),
    ("a-map-of-the-quay", "A Map of the Quay", "ines-okoro", "essays", ["Essays", "Science"], ["maps", "harbor"], [], [], 22000, 7.8, 120, 120, None, 195, 600, "2026-10-01"),
]


def seed_authors() -> list[Author]:
    counts: dict[str, int] = {}
    for b in _BOOKS:
        counts[b[2]] = counts.get(b[2], 0) + 1
    return [
        Author(id=aid, name=name, bio=_LOREM[i % len(_LOREM)], books=counts.get(aid, 0), readers=readers)
        for i, (aid, name, readers) in enumerate(_AUTHORS)
    ]


def seed_books() -> list[CatalogBook]:
    names = {aid: name for aid, name, _ in _AUTHORS}
    out: list[CatalogBook] = []
    for i, (bid, title, author, kind, genres, tags, tropes, flags, words, rating, ratings, readers, series, hue, price, published) in enumerate(_BOOKS):
        out.append(
            CatalogBook(
                id=bid,
                title=title,
                authorId=author,
                authorName=names[author],
                type=kind,
                genres=genres,
                tags=tags,
                tropes=tropes,
                flags=[AuthorFlag(key=k, name=_FLAGS[k][0], detail=_FLAGS[k][1], defaultClass=_FLAGS[k][2]) for k in flags],
                wordCount=words,
                rating=rating,
                ratings=ratings,
                readers=readers,
                popularity=readers + ratings,
                series=SeriesRef(id=series[0], title=series[1], order=series[2]) if series else None,
                hue=hue,
                blurb=_LOREM[i % len(_LOREM)],
                buyPriceCents=price,
                # A book with no words yet is a coming-soon entry: no edition to borrow or buy.
                editions=1 if published else 0,
                publishedAt=published,
                source="seed",
            )
        )
    return out
