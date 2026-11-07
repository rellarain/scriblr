"""Maps and characters for readers. The author switches a map or a character to published, says from which chapter of the published edition it is shown (the whole
thing, or a part: a symbol of a map, a field of a character), and which fields of a character are public. A book's edition freezes the published maps and the public
side of the published characters when the book is published, as it does the chapters; the Reader shows the frozen copy, filtered to the chapters the reader has reached.
The author can preview any chapter, and is warned when a reveal comes later than a scene that uses the map's place or the character."""

from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .book_publishing import chapters_in_order, latest_publication
from .schema import (
    CHARACTER_SHARE_FIELDS,
    CharacterDoc,
    CharacterPortrait,
    EditionCharacter,
    EditionCharacterField,
    EditionMap,
    EditionRelationship,
    MapDoc,
    OutlineNode,
    ProjectFile,
    ReaderShare,
)

MAX_WARNINGS = 60

_LABELS = {
    "role": "Role", "age": "Age", "occupation": "Occupation", "aliases": "Also known as", "summary": "Summary", "personality": "Personality", "goal": "Goal",
    "motivation": "Motivation", "fear": "Fear", "flaw": "Flaw", "strength": "Strength", "background": "Background", "possessions": "Possessions",
    "appearance": "Appearance", "height": "Height", "build": "Build", "skin": "Skin", "hair": "Hair", "eyes": "Eyes", "face": "Face", "voice": "Voice",
    "bearing": "Bearing", "style": "How they dress", "marks": "Distinguishing marks",
}


# ------------------------------------------------------------------------------------------------------------------------------ what the reader gets

class ReaderCharacterField(BaseModel):
    key: str
    label: str
    value: str


class ReaderCharacterLink(BaseModel):
    targetId: str
    targetName: str
    label: str
    description: str = ""


class ReaderCharacter(BaseModel):
    id: str
    name: str
    portrait: CharacterPortrait
    fields: list[ReaderCharacterField] = Field(default_factory=list)
    relationships: list[ReaderCharacterLink] = Field(default_factory=list)


class BookExtras(BaseModel):
    """The maps and characters a reader may see of a book, up to the chapter they have reached. `lockedMaps` and `lockedCharacters` count what is still to be revealed."""

    bookId: str
    reach: int = 0
    maps: list[MapDoc] = Field(default_factory=list)
    characters: list[ReaderCharacter] = Field(default_factory=list)
    lockedMaps: int = 0
    lockedCharacters: int = 0


# ------------------------------------------------------------------------------------------------------------------------------ what the author sees

class ExtrasChapter(BaseModel):
    n: int
    chapterId: str
    title: str


class ExtrasWarning(BaseModel):
    kind: Literal["map", "place", "character"]
    targetId: str
    name: str
    revealAt: int
    sceneId: str
    sceneTitle: str
    chapter: int


class BookExtrasInfo(BaseModel):
    """For one book: the chapters of the edition (the numbers a reveal uses) and the scenes that come before a reveal."""

    bookId: str
    title: str
    chapters: list[ExtrasChapter] = Field(default_factory=list)
    warnings: list[ExtrasWarning] = Field(default_factory=list)


# ------------------------------------------------------------------------------------------------------------------------------ freezing

def shown(reveal: Optional[int], reach: int) -> bool:
    """Is something revealed at chapter `reveal` (none = from the start) shown to a reader who has reached chapter `reach`?"""
    return reveal is None or reveal <= reach


def _character_fields(doc: CharacterDoc) -> list[EditionCharacterField]:
    share = doc.reader
    profile = doc.profile
    out: list[EditionCharacterField] = []
    for key in CHARACTER_SHARE_FIELDS:
        if key not in share.fields or key == "relationships":
            continue
        if key == "possessions":
            value = "\n".join(f"{p.name}: {p.description}" if p.description else p.name for p in doc.possessions if p.name)
        else:
            value = getattr(profile, key, "")
        if value:
            out.append(EditionCharacterField(key=key, label=_LABELS[key], value=value, revealAt=share.reveals.get(key)))
    for field in profile.fields:
        key = f"field:{field.id}"
        if key in share.fields and field.value:
            out.append(EditionCharacterField(key=key, label=field.label or "Note", value=field.value, revealAt=share.reveals.get(key)))
    return out


def freeze_character(doc: CharacterDoc) -> EditionCharacter:
    share = doc.reader
    links = (
        [EditionRelationship(targetId=r.targetId, label=r.label or r.kind.capitalize(), description=r.description) for r in doc.relationships]
        if "relationships" in share.fields
        else []
    )
    return EditionCharacter(
        characterId=doc.id,
        name=doc.name,
        revealAt=share.revealAt,
        look=doc.look,
        portrait=doc.portrait.model_copy(deep=True),
        fields=_character_fields(doc),
        relationships=links,
        relationshipsRevealAt=share.reveals.get("relationships"),
    )


def freeze_world(pf: ProjectFile) -> tuple[list[EditionMap], list[EditionCharacter]]:
    """The published maps and characters of the project, copied as they are now (what a new edition holds)."""
    maps = [EditionMap(mapId=m.id, doc=m.model_copy(deep=True)) for m in sorted(pf.maps.values(), key=lambda m: (m.order, m.title)) if m.reader.published]
    characters = [freeze_character(c) for c in sorted(pf.characters.values(), key=lambda c: (c.order, c.name)) if c.reader.published]
    return maps, characters


# ------------------------------------------------------------------------------------------------------------------------------ the reader's view

def _visible_map(frozen: EditionMap, reach: int, public_ids: set[str]) -> MapDoc:
    doc = frozen.doc
    reveals = doc.reader.reveals
    symbols = [
        s.model_copy(update={"mapIds": [i for i in s.mapIds if i in public_ids]})
        for s in doc.symbols
        if shown(reveals.get(s.id), reach)
    ]
    return doc.model_copy(
        update={
            "symbols": symbols,
            "labels": [l for l in doc.labels if shown(reveals.get(l.id), reach)],
            "shapes": [s for s in doc.shapes if shown(reveals.get(s.id), reach)],
            "parentId": doc.parentId if doc.parentId in public_ids else None,
            "pace": None,
            "journeys": [],
            "reader": ReaderShare(published=True, revealAt=doc.reader.revealAt),
        }
    )


def extras_view(book_id: str, maps: list[EditionMap], characters: list[EditionCharacter], reach: int) -> BookExtras:
    """What a reader who has reached chapter `reach` sees: what is revealed by then, with what is not left out."""
    open_maps = [m for m in maps if shown(m.doc.reader.revealAt, reach)]
    open_chars = [c for c in characters if shown(c.revealAt, reach)]
    public_maps = {m.mapId for m in open_maps}
    names = {c.characterId: c.name for c in open_chars}
    cards = [
        ReaderCharacter(
            id=c.characterId,
            name=c.name,
            portrait=c.portrait or CharacterPortrait(),
            fields=[ReaderCharacterField(key=f.key, label=f.label, value=f.value) for f in c.fields if shown(f.revealAt, reach)],
            relationships=(
                [ReaderCharacterLink(targetId=r.targetId, targetName=names[r.targetId], label=r.label, description=r.description) for r in c.relationships if r.targetId in names and r.targetId != c.characterId]
                if shown(c.relationshipsRevealAt, reach)
                else []
            ),
        )
        for c in open_chars
    ]
    return BookExtras(
        bookId=book_id,
        reach=reach,
        maps=[_visible_map(m, reach, public_maps) for m in open_maps],
        characters=cards,
        lockedMaps=len(maps) - len(open_maps),
        lockedCharacters=len(characters) - len(open_chars),
    )


def preview(pf: ProjectFile, book_id: str, chapter: int) -> BookExtras:
    """The author's preview: the maps and characters as they are now, shown as a reader who has reached `chapter` would see them."""
    maps, characters = freeze_world(pf)
    return extras_view(book_id, maps, characters, max(0, chapter))


# ------------------------------------------------------------------------------------------------------------------------------ the author's chapters and warnings

def edition_numbers(pf: ProjectFile, book_id: str) -> list[ExtrasChapter]:
    """The chapters a new edition would hold, with the numbers a reveal uses (the chapters published so far, in book order)."""
    out: list[ExtrasChapter] = []
    for chapter in chapters_in_order(pf.outline.nodes, book_id):
        pub = latest_publication(pf, chapter.id)
        if pub is None:
            continue
        out.append(ExtrasChapter(n=len(out) + 1, chapterId=chapter.id, title=pub.title or chapter.title or f"Chapter {len(out) + 1}"))
    return out


def _chapter_of(nodes: dict[str, OutlineNode], node_id: str) -> Optional[str]:
    seen: set[str] = set()
    node = nodes.get(node_id)
    while node is not None and node.id not in seen:
        if node.kind == "chapter":
            return node.id
        seen.add(node.id)
        node = nodes.get(node.parentId) if node.parentId else None
    return None


def warnings_for(pf: ProjectFile, chapters: list[ExtrasChapter]) -> list[ExtrasWarning]:
    """A scene that uses a map's place, or a character, in a chapter before the chapter where it is revealed gives away more than the reader knows yet."""
    numbers = {c.chapterId: c.n for c in chapters}
    nodes = {n.id: n for n in pf.outline.nodes}

    def chapter_number(node_id: str) -> Optional[int]:
        chapter_id = _chapter_of(nodes, node_id)
        return numbers.get(chapter_id) if chapter_id else None

    out: list[ExtrasWarning] = []
    shared_maps = {m.id: m for m in pf.maps.values() if m.reader.published}
    for node in pf.outline.nodes:
        map_id, _, symbol_id = node.location.partition("/")
        doc = shared_maps.get(map_id)
        if doc is None or not symbol_id:
            continue
        n = chapter_number(node.id)
        if n is None:
            continue
        symbol = next((s for s in doc.symbols if s.id == symbol_id), None)
        whole, part = doc.reader.revealAt or 0, doc.reader.reveals.get(symbol_id) or 0
        reveal = max(whole, part)
        if reveal > n:
            name = (symbol.name if symbol and symbol.name else "") or doc.title
            out.append(ExtrasWarning(kind="map" if whole > n else "place", targetId=doc.id if whole > n else f"{doc.id}/{symbol_id}", name=doc.title if whole > n else name,
                                     revealAt=reveal, sceneId=node.id, sceneTitle=node.title, chapter=n))
    for character in pf.characters.values():
        reveal = character.reader.revealAt
        if not character.reader.published or not reveal:
            continue
        for node_id in character.appearances:
            node = nodes.get(node_id)
            n = chapter_number(node_id) if node else None
            if node is not None and n is not None and reveal > n:
                out.append(ExtrasWarning(kind="character", targetId=character.id, name=character.name, revealAt=reveal, sceneId=node.id, sceneTitle=node.title, chapter=n))
    out.sort(key=lambda w: (w.chapter, w.name, w.sceneTitle))
    return out[:MAX_WARNINGS]


def book_infos(pf: ProjectFile) -> list[BookExtrasInfo]:
    infos: list[BookExtrasInfo] = []
    for book in (n for n in pf.outline.nodes if n.kind == "book"):
        chapters = edition_numbers(pf, book.id)
        infos.append(BookExtrasInfo(bookId=book.id, title=book.title or "Untitled", chapters=chapters, warnings=warnings_for(pf, chapters)))
    return infos


def project_infos(root: Path, project_id: str) -> list[BookExtrasInfo]:
    from . import project_store as store

    pf, _errors = store._load_project_file(root, project_id)
    return book_infos(pf)


def project_preview(root: Path, project_id: str, book_id: str, chapter: int) -> BookExtras:
    from . import project_store as store
    from .book_publishing import book_node

    pf, _errors = store._load_project_file(root, project_id)
    book_node(pf, book_id)
    return preview(pf, book_id, chapter)
