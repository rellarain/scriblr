from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..deps import get_storage_root
from ..storage import figure_conversion
from ..storage import project_store as store
from ..storage.figure_conversion import ConvertBody, FigureConversionError, FrozenPortrait
from ..storage.schema import CHARACTER_MAX_PER_PROJECT, CharacterDoc, CharacterFigure, CharacterLook, CharacterPortrait, _figure_or_none, utcnow

router = APIRouter(prefix="/api/projects/{project_id}/characters", tags=["characters"])


class CharacterSummary(BaseModel):
    id: str
    name: str
    order: int
    updatedAt: datetime
    # The portrait, for the card each character has in the cast list, and the figure (the choices only: the model copies come from /figure-models).
    portrait: CharacterPortrait
    figure: Optional[CharacterFigure] = None


class CharacterCreate(BaseModel):
    name: str = Field(default="Unnamed character", max_length=120)
    # A portrait to start from (a copy of another character, or a file's); none = the default portrait.
    portrait: CharacterPortrait = Field(default_factory=CharacterPortrait)
    # The old figure's look, kept for a copy or a file that carries one; nothing draws it any more.
    look: CharacterLook = Field(default_factory=CharacterLook)
    # A figure to start from (a copy of another character, or a file's; its model copy is already in the project); none = a character without one.
    figure: Optional[CharacterFigure] = None

    @field_validator("figure", mode="before")
    @classmethod
    def _figure(cls, value: Any) -> Any:
        return _figure_or_none(value)

    @field_validator("portrait", mode="before")
    @classmethod
    def _portrait(cls, value: Any) -> Any:
        return value if isinstance(value, (dict, CharacterPortrait)) else {}


@router.get("", response_model=list[CharacterSummary])
def list_characters(project_id: str, root: Path = Depends(get_storage_root)) -> list[dict]:
    """The project's characters (id, name, order, portrait, figure): the cast list."""
    return [{"id": c.id, "name": c.name, "order": c.order, "updatedAt": c.updatedAt, "portrait": c.portrait, "figure": c.figure} for c in store.list_characters(root, project_id)]


@router.get("/all", response_model=list[CharacterDoc])
def all_characters(project_id: str, root: Path = Depends(get_storage_root)) -> list[CharacterDoc]:
    """Every character, whole, in order: what the Outline and the Draft read to show who is in a scene."""
    return store.list_characters(root, project_id)


@router.post("", response_model=CharacterDoc, status_code=201)
def create_character(project_id: str, body: CharacterCreate, root: Path = Depends(get_storage_root)) -> CharacterDoc:
    with store.transaction(root, project_id):
        existing = store.list_characters(root, project_id)
        if len(existing) >= CHARACTER_MAX_PER_PROJECT:
            raise HTTPException(status_code=422, detail=f"a project holds at most {CHARACTER_MAX_PER_PROJECT} characters")
        doc = CharacterDoc(id=store.new_id("chr"), name=body.name, order=max((c.order for c in existing), default=-1) + 1, look=body.look, portrait=body.portrait, figure=body.figure)
        store.save_character(root, project_id, doc)
    return doc


@router.get("/{character_id}", response_model=CharacterDoc)
def get_character(project_id: str, character_id: str, root: Path = Depends(get_storage_root)) -> CharacterDoc:
    return store.load_character(root, project_id, character_id)


@router.put("/{character_id}", response_model=CharacterDoc)
def put_character(project_id: str, character_id: str, body: CharacterDoc, root: Path = Depends(get_storage_root)) -> CharacterDoc:
    """Replace a character (its name and portrait, and the rest). The id in the body must be the one in the path."""
    if body.id != character_id:
        raise HTTPException(status_code=422, detail="the character's id does not match the address")
    with store.transaction(root, project_id):
        store.load_character(root, project_id, character_id)
        # A relationship is with another character that is there, not with oneself.
        known = {c.id for c in store.list_characters(root, project_id)}
        body.relationships = [r for r in body.relationships if r.targetId in known and r.targetId != character_id]
        body.updatedAt = utcnow()
        store.save_character(root, project_id, body)
    return body


@router.get("/{character_id}/frozen", response_model=list[FrozenPortrait])
def frozen_portraits(project_id: str, character_id: str, root: Path = Depends(get_storage_root)) -> list[FrozenPortrait]:
    """The portraits of this character frozen in the published editions (what Convert has to turn into figures besides the character's own)."""
    return figure_conversion.frozen_portraits(root, project_id, character_id)


@router.post("/{character_id}/convert", response_model=CharacterDoc)
def convert_character(project_id: str, character_id: str, body: ConvertBody, root: Path = Depends(get_storage_root)) -> CharacterDoc:
    """Keep a character's portrait converted to a mannequin: its figure, those of its captured story looks and those frozen in its editions, in one write. The portraits stay."""
    try:
        return figure_conversion.convert_character(root, project_id, character_id, body)
    except FigureConversionError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.post("/{character_id}/revert", response_model=CharacterDoc)
def revert_character(project_id: str, character_id: str, root: Path = Depends(get_storage_root)) -> CharacterDoc:
    """Back to the old portrait: drop the figures that Convert made (the character's, its story looks' and its editions')."""
    try:
        return figure_conversion.revert_character(root, project_id, character_id)
    except FigureConversionError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err


@router.delete("/{character_id}", status_code=204)
def delete_character(project_id: str, character_id: str, root: Path = Depends(get_storage_root)) -> None:
    store.delete_character(root, project_id, character_id)
