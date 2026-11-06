from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_storage_root
from ..storage import project_store as store
from ..storage.schema import CHARACTER_MAX_PER_PROJECT, CharacterDoc, CharacterLook, utcnow

router = APIRouter(prefix="/api/projects/{project_id}/characters", tags=["characters"])


class CharacterSummary(BaseModel):
    id: str
    name: str
    order: int
    updatedAt: datetime


class CharacterCreate(BaseModel):
    name: str = Field(default="Unnamed character", max_length=120)
    # A look to start from (a copy of another character, or a file's); none = the default look.
    look: CharacterLook = Field(default_factory=CharacterLook)


@router.get("", response_model=list[CharacterSummary])
def list_characters(project_id: str, root: Path = Depends(get_storage_root)) -> list[dict]:
    """The project's characters (id, name, order): the cast list."""
    return [{"id": c.id, "name": c.name, "order": c.order, "updatedAt": c.updatedAt} for c in store.list_characters(root, project_id)]


@router.post("", response_model=CharacterDoc, status_code=201)
def create_character(project_id: str, body: CharacterCreate, root: Path = Depends(get_storage_root)) -> CharacterDoc:
    with store.transaction(root, project_id):
        existing = store.list_characters(root, project_id)
        if len(existing) >= CHARACTER_MAX_PER_PROJECT:
            raise HTTPException(status_code=422, detail=f"a project holds at most {CHARACTER_MAX_PER_PROJECT} characters")
        doc = CharacterDoc(id=store.new_id("chr"), name=body.name, order=max((c.order for c in existing), default=-1) + 1, look=body.look)
        store.save_character(root, project_id, doc)
    return doc


@router.get("/{character_id}", response_model=CharacterDoc)
def get_character(project_id: str, character_id: str, root: Path = Depends(get_storage_root)) -> CharacterDoc:
    return store.load_character(root, project_id, character_id)


@router.put("/{character_id}", response_model=CharacterDoc)
def put_character(project_id: str, character_id: str, body: CharacterDoc, root: Path = Depends(get_storage_root)) -> CharacterDoc:
    """Replace a character (its name and look). The id in the body must be the one in the path."""
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


@router.delete("/{character_id}", status_code=204)
def delete_character(project_id: str, character_id: str, root: Path = Depends(get_storage_root)) -> None:
    store.delete_character(root, project_id, character_id)
