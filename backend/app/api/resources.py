from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import get_app_data_storage_root
from ..storage import feedback as feedback_store
from ..storage import resources as store

router = APIRouter(prefix="/api/resources", tags=["resources"])


def _error(exc: store.ResourcesError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail=str(exc))


class AddNodeBody(BaseModel):
    parentId: Optional[str] = None
    kind: store.NodeKind
    name: str = ""


class RenameNodeBody(BaseModel):
    name: str


class ReorderBody(BaseModel):
    parentId: Optional[str] = None
    orderedIds: list[str]


class GuideBody(BaseModel):
    guide: str


class TutorialsBody(BaseModel):
    tutorials: list[store.Tutorial]


class FaqBody(BaseModel):
    faq: list[store.FaqEntry]


class AssessmentBody(BaseModel):
    questions: list[store.Question]


@router.get("")
def get_resources(root: Path = Depends(get_app_data_storage_root)) -> store.ResourcesFile:
    return store.load_resources(root)


@router.post("/nodes")
def post_node(body: AddNodeBody, root: Path = Depends(get_app_data_storage_root)) -> store.ResourcesFile:
    try:
        return store.add_node(root, body.parentId, body.kind, body.name)
    except store.ResourcesError as exc:
        raise _error(exc) from exc


@router.put("/nodes/{node_id:path}/name")
def put_node_name(node_id: str, body: RenameNodeBody, root: Path = Depends(get_app_data_storage_root)) -> store.ResourcesFile:
    try:
        return store.rename_node(root, node_id, body.name)
    except store.ResourcesError as exc:
        raise _error(exc) from exc


@router.put("/nodes/reorder")
def put_reorder(body: ReorderBody, root: Path = Depends(get_app_data_storage_root)) -> store.ResourcesFile:
    return store.reorder_nodes(root, body.parentId, body.orderedIds)


@router.delete("/nodes/{node_id:path}")
def delete_node(node_id: str, root: Path = Depends(get_app_data_storage_root)) -> store.ResourcesFile:
    try:
        return store.delete_node(root, node_id)
    except store.ResourcesError as exc:
        raise _error(exc) from exc


@router.put("/nodes/{node_id:path}/guide")
def put_guide(node_id: str, body: GuideBody, root: Path = Depends(get_app_data_storage_root)) -> store.ResourcesFile:
    try:
        return store.set_guide(root, node_id, body.guide)
    except store.ResourcesError as exc:
        raise _error(exc) from exc


@router.put("/nodes/{node_id:path}/tutorials")
def put_tutorials(node_id: str, body: TutorialsBody, root: Path = Depends(get_app_data_storage_root)) -> store.ResourcesFile:
    try:
        return store.set_tutorials(root, node_id, body.tutorials)
    except store.ResourcesError as exc:
        raise _error(exc) from exc


@router.put("/nodes/{node_id:path}/faq")
def put_faq(node_id: str, body: FaqBody, root: Path = Depends(get_app_data_storage_root)) -> store.ResourcesFile:
    try:
        return store.set_faq(root, node_id, body.faq)
    except store.ResourcesError as exc:
        raise _error(exc) from exc


@router.put("/nodes/{node_id:path}/assessment")
def put_assessment(node_id: str, body: AssessmentBody, root: Path = Depends(get_app_data_storage_root)) -> store.ResourcesFile:
    try:
        return store.set_assessment(root, node_id, body.questions)
    except store.ResourcesError as exc:
        raise _error(exc) from exc


@router.get("/nodes/{node_id:path}/promotable-feedback")
def get_promotable(node_id: str, root: Path = Depends(get_app_data_storage_root)) -> list[dict]:
    """Real Feedback messages that match this node's own channel -- FAQ candidates to promote."""
    try:
        file = store.load_resources(root)
        fb_file = feedback_store.load(root)
        matches = store.promotable_messages(file, node_id, fb_file.messages)
    except store.ResourcesError as exc:
        raise _error(exc) from exc
    return [{"id": m.id, "text": m.text} for m in matches]
