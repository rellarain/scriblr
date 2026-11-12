"""Converting a character's portrait to a mannequin (phase 6c-4). The portrait is turned into a figure on the writer's machine (the mapping from the old choices to a model's forms,
sliders and colours is the frontend's); this module keeps the result: the character's own figure, the figures of its captured story looks and the figures of the portraits frozen in
the published editions, all in one write. The old portrait stays where it is, so a converted character can go back to it (`revert_character`)."""

from pydantic import BaseModel, Field

from . import project_store as store
from .schema import CharacterDoc, CharacterFigure, CharacterPortrait, ProjectFile, utcnow


class FigureConversionError(Exception):
    """The conversion cannot be kept (the model copy is not in the project, or the character has no figure of its own to go back from)."""


class FrozenPortrait(BaseModel):
    """The portrait of a character frozen in one edition of a book, and what is known of its figure there."""

    bookId: str
    n: int
    portrait: CharacterPortrait
    hasFigure: bool = False
    converted: bool = False


class EditionFigure(BaseModel):
    bookId: str
    n: int
    figure: CharacterFigure


class ConvertBody(BaseModel):
    """The figure for the character, for each of its captured story looks that holds a portrait (state id -> figure) and for the portrait frozen in each edition."""

    figure: CharacterFigure
    states: dict[str, CharacterFigure] = Field(default_factory=dict)
    editions: list[EditionFigure] = Field(default_factory=list)


def _converted(figure: CharacterFigure) -> CharacterFigure:
    return figure.model_copy(update={"converted": True})


def _frozen_of(pf: ProjectFile, character_id: str):
    """Every frozen copy of the character: (book id, edition, its character)."""
    for book_id, listing in pf.bookListings.items():
        for edition in listing.editions:
            for frozen in edition.characters:
                if frozen.characterId == character_id:
                    yield book_id, edition, frozen


def frozen_portraits(root, project_id: str, character_id: str) -> list[FrozenPortrait]:
    """The portraits of the character frozen in editions (in the order of the books and their editions)."""
    pf, _errors = store._load_project_file(root, project_id)
    store.load_character(root, project_id, character_id)
    return [
        FrozenPortrait(bookId=book_id, n=edition.n, portrait=(frozen.portrait or CharacterPortrait()), hasFigure=frozen.figure is not None, converted=bool(frozen.figure and frozen.figure.converted))
        for book_id, edition, frozen in _frozen_of(pf, character_id)
    ]


def convert_character(root, project_id: str, character_id: str, body: ConvertBody) -> CharacterDoc:
    """Keep the converted figures: the character's own (the figure it had is replaced), the story looks named (only one that holds a portrait), the editions named (only a card
    that had no figure of its own, or one that was converted before). Every figure points at a copy of a model that is in the project; an edition takes a copy of that copy."""
    result: list[CharacterDoc] = []

    def _do(pf: ProjectFile) -> None:
        doc = pf.characters.get(character_id)
        if doc is None:
            raise store.CharacterNotFoundError(project_id, character_id)
        copies = {body.figure.model, *(f.model for f in body.states.values()), *(e.figure.model for e in body.editions)}
        missing = [key for key in copies if key not in pf.figureModels]
        if missing:
            raise FigureConversionError("the model the figure was made from is not in this project")
        doc.figure = _converted(body.figure)
        for state in doc.states:
            figure = body.states.get(state.id)
            if figure is not None and state.portrait is not None:
                state.figure = _converted(figure)
        wanted = {(e.bookId, e.n): e.figure for e in body.editions}
        for book_id, edition, frozen in _frozen_of(pf, character_id):
            figure = wanted.get((book_id, edition.n))
            if figure is None or (frozen.figure is not None and not frozen.figure.converted):
                continue
            frozen.figure = _converted(figure)
            if figure.model not in edition.figureModels:
                edition.figureModels[figure.model] = pf.figureModels[figure.model].model_copy(deep=True)
        doc.updatedAt = utcnow()
        pf.index.updatedAt = utcnow()
        result.append(doc)

    store._mutate(root, project_id, _do)
    return result[0]


def revert_character(root, project_id: str, character_id: str) -> CharacterDoc:
    """Back to the old portrait: the converted figure of the character, of its story looks (that hold a portrait) and of its frozen cards goes, and an edition drops the model copies
    no card of it points at any more. A figure the writer made from nothing (it was not converted) is never touched."""
    result: list[CharacterDoc] = []

    def _do(pf: ProjectFile) -> None:
        doc = pf.characters.get(character_id)
        if doc is None:
            raise store.CharacterNotFoundError(project_id, character_id)
        if doc.figure is None or not doc.figure.converted:
            raise FigureConversionError("this character's mannequin was not made by converting its portrait")
        doc.figure = None
        for state in doc.states:
            if state.figure is not None and state.figure.converted and state.portrait is not None:
                state.figure = None
        for _book_id, edition, frozen in _frozen_of(pf, character_id):
            if frozen.figure is not None and frozen.figure.converted:
                frozen.figure = None
            used = {c.figure.model for c in edition.characters if c.figure is not None}
            for key in [k for k in edition.figureModels if k not in used]:
                del edition.figureModels[key]
        doc.updatedAt = utcnow()
        pf.index.updatedAt = utcnow()
        result.append(doc)

    store._mutate(root, project_id, _do)
    return result[0]


__all__ = ["ConvertBody", "EditionFigure", "FigureConversionError", "FrozenPortrait", "convert_character", "frozen_portraits", "revert_character"]
