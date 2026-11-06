from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import get_storage_root
from ..storage import world_links as links
from ..storage.schema import WorldLink

router = APIRouter(prefix="/api/projects/{project_id}/world-links", tags=["world-links"])


class LinkBody(BaseModel):
    a: str
    b: str


@router.get("", response_model=list[WorldLink])
def list_world_links(project_id: str, root: Path = Depends(get_storage_root)) -> list[WorldLink]:
    """Every link between a plot node (`plot:<id>`), a character (`char:<id>`) and a place (`place:<mapId>/<symbolId>`), each once, the ends in order."""
    return links.list_links(root, project_id)


@router.post("", response_model=list[WorldLink])
def add_world_link(project_id: str, body: LinkBody, root: Path = Depends(get_storage_root)) -> list[WorldLink]:
    """Link two things of different kinds (a link that is there already is left as it is). Returns the links."""
    try:
        return links.add_link(root, project_id, body.a, body.b)
    except links.InvalidWorldLinkError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("", response_model=list[WorldLink])
def remove_world_link(project_id: str, a: str, b: str, root: Path = Depends(get_storage_root)) -> list[WorldLink]:
    """Take a link away from both ends. Returns the links."""
    try:
        return links.remove_link(root, project_id, a, b)
    except links.InvalidWorldLinkError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
