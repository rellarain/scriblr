from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_storage_root
from ..storage import project_store as store
from ..storage.schema import ITEM_MAX_PER_PROJECT, ItemDoc, utcnow

router = APIRouter(prefix="/api/projects/{project_id}/items", tags=["items"])


class ItemSummary(BaseModel):
    id: str
    name: str
    kind: str
    order: int
    updatedAt: datetime


class ItemCreate(BaseModel):
    name: str = Field(default="Unnamed item", max_length=120)
    kind: str = "other"


@router.get("", response_model=list[ItemSummary])
def list_items(project_id: str, root: Path = Depends(get_storage_root)) -> list[dict]:
    """The project's items (id, name, kind, order): the library list."""
    return [{"id": i.id, "name": i.name, "kind": i.kind, "order": i.order, "updatedAt": i.updatedAt} for i in store.list_items(root, project_id)]


@router.get("/all", response_model=list[ItemDoc])
def all_items(project_id: str, root: Path = Depends(get_storage_root)) -> list[ItemDoc]:
    """Every item, whole, in order: what the characters' pages read to show what they carry."""
    return store.list_items(root, project_id)


@router.post("", response_model=ItemDoc, status_code=201)
def create_item(project_id: str, body: ItemCreate, root: Path = Depends(get_storage_root)) -> ItemDoc:
    with store.transaction(root, project_id):
        existing = store.list_items(root, project_id)
        if len(existing) >= ITEM_MAX_PER_PROJECT:
            raise HTTPException(status_code=422, detail=f"a project holds at most {ITEM_MAX_PER_PROJECT} items")
        doc = ItemDoc(id=store.new_id("itm"), name=body.name, kind=body.kind, order=max((i.order for i in existing), default=-1) + 1)
        store.save_item(root, project_id, doc)
    return doc


@router.get("/{item_id}", response_model=ItemDoc)
def get_item(project_id: str, item_id: str, root: Path = Depends(get_storage_root)) -> ItemDoc:
    return store.load_item(root, project_id, item_id)


@router.put("/{item_id}", response_model=ItemDoc)
def put_item(project_id: str, item_id: str, body: ItemDoc, root: Path = Depends(get_storage_root)) -> ItemDoc:
    """Replace an item. The id in the body must be the one in the path."""
    if body.id != item_id:
        raise HTTPException(status_code=422, detail="the item's id does not match the address")
    with store.transaction(root, project_id):
        store.load_item(root, project_id, item_id)
        body.updatedAt = utcnow()
        store.save_item(root, project_id, body)
    return body


@router.delete("/{item_id}", status_code=204)
def delete_item(project_id: str, item_id: str, root: Path = Depends(get_storage_root)) -> None:
    store.delete_item(root, project_id, item_id)
