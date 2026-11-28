from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi import Path as PathParam
from pydantic import BaseModel

from ..deps import get_app_data_storage_root
from ..storage import body_templates, model_traces
from ..storage import character_models_store as store
from ..storage.schema import _MODEL_ID, BodyPartList, BodyTemplate, BodyTemplateList, ModelCatalog, ModelTrace, ModelTraceSettings, ModelDraftList, PublishedModelList, WriterModelLimits


ModelIdPath = PathParam(pattern=_MODEL_ID)


def _library_router(prefix: str, tag: str, library: str, who: str) -> APIRouter:
    """The routes of one library of models: the admin's catalog (/api/character-models) or the writer's own models (/api/my-models). They do the same things; only the file
    and who the page belongs to differ."""
    router = APIRouter(prefix=prefix, tags=[tag])

    @router.get("", response_model=ModelCatalog, description=f"The whole catalog as {who} page edits it: every model's draft, its published copy and its earlier versions.")
    def get_models(root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
        return store.load_models(root, library)

    @router.put("", response_model=ModelCatalog, description="Save the drafts (in order). Published copies and history are kept; a model left out is deleted.")
    def put_models(body: ModelDraftList, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
        try:
            return store.save_drafts(root, body, library)
        except (store.InvalidModelIdError, store.LibraryFullError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @router.get("/published", response_model=PublishedModelList, description="What the Writer's editor offers: the published copies only.")
    def get_published_models(root: Path = Depends(get_app_data_storage_root)) -> PublishedModelList:
        return store.published_models(root, library)

    # A picture to trace (slice 9b): kept beside the draft, never in the model.
    @router.get("/{model_id}/trace", response_model=Optional[ModelTrace], description="The model's picture to trace with its settings, or null.")
    def get_trace(model_id: str = ModelIdPath, root: Path = Depends(get_app_data_storage_root)) -> Optional[ModelTrace]:
        return model_traces.get_trace(root, library, model_id)

    @router.put("/{model_id}/trace", response_model=ModelTrace, description="Choose or replace the model's picture to trace.")
    def put_trace(body: ModelTrace, model_id: str = ModelIdPath, root: Path = Depends(get_app_data_storage_root)) -> ModelTrace:
        return model_traces.put_trace(root, library, model_id, body)

    @router.patch("/{model_id}/trace", response_model=ModelTrace, description="Change how the picture is shown. 404 when the model has no picture.")
    def patch_trace(body: ModelTraceSettings, model_id: str = ModelIdPath, root: Path = Depends(get_app_data_storage_root)) -> ModelTrace:
        try:
            return model_traces.set_trace_settings(root, library, model_id, body)
        except model_traces.NoTraceError as exc:
            raise HTTPException(status_code=404, detail="This model has no picture to trace.") from exc

    @router.delete("/{model_id}/trace", status_code=204, description="Take the picture away.")
    def delete_trace(model_id: str = ModelIdPath, root: Path = Depends(get_app_data_storage_root)) -> None:
        model_traces.delete_trace(root, library, model_id)

    @router.post("/{model_id}/publish", response_model=ModelCatalog)
    def publish_model(model_id: str, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
        try:
            return store.publish_model(root, model_id, library)
        except store.UnknownModelError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except store.PublishRefusedError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @router.post("/{model_id}/unpublish", response_model=ModelCatalog)
    def unpublish_model(model_id: str, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
        try:
            return store.unpublish_model(root, model_id, library)
        except store.UnknownModelError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except store.NotPublishedError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @router.post("/{model_id}/discard", response_model=ModelCatalog)
    def discard_model_changes(model_id: str, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
        try:
            return store.discard_changes(root, model_id, library)
        except store.UnknownModelError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.post("/{model_id}/restore/{version}", response_model=ModelCatalog)
    def restore_model_version(model_id: str, version: int, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
        try:
            return store.restore_version(root, model_id, version, library)
        except (store.UnknownModelError, store.UnknownVersionError) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    return router


class BasicUpdateOut(BaseModel):
    available: bool


router = _library_router("/api/character-models", "character-models", store.ADMIN_LIBRARY, "the admin's")


@router.post("/basic", response_model=ModelCatalog)
def add_basic_model(root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
    """Add the basic adult that comes with the app (published when its name is free). 409 when it is already in the catalog."""
    try:
        return store.add_basic_model(root)
    except store.BasicModelPresentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/basic/update", response_model=BasicUpdateOut)
def basic_update(root: Path = Depends(get_app_data_storage_root)) -> BasicUpdateOut:
    """Whether a newer basic model came with this build and waits, because the admin had changed the basic model (phase O4a)."""
    return BasicUpdateOut(available=store.basic_update_available(root))


@router.post("/basic/update", response_model=ModelCatalog)
def update_basic_model(root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
    """Replace the basic model's draft with the one this build bundles and publish it as the next version. 404 when there is no basic model."""
    try:
        return store.update_basic_model(root)
    except store.UnknownModelError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/body-templates", response_model=BodyTemplateList)
def list_body_templates() -> BodyTemplateList:
    """The bodies a new model can start from (WUI slice 9a), without their content."""
    return body_templates.list_templates()


@router.get("/body-parts", response_model=BodyPartList)
def list_body_parts() -> BodyPartList:
    """The parts the Body part menu adds to a model (slice 9a): a head, a torso, an arm ..., each as its shapes."""
    return body_templates.list_parts()


@router.get("/body-templates/{template_id}", response_model=BodyTemplate)
def get_body_template(template_id: str) -> BodyTemplate:
    """One body template with the model it starts: its shapes, rig and proportion guide. 404 when there is no such template."""
    try:
        return body_templates.get_template(template_id)
    except body_templates.UnknownBodyTemplateError as exc:
        raise HTTPException(status_code=404, detail=f"There is no body template {exc.args[0]!r}.") from exc


# The models a writer designs for themselves (the Characters console's Models section): a second catalog in my-models.json, with ids that start with "my-".
my_router = _library_router("/api/my-models", "my-models", store.MY_LIBRARY, "the writer's")


@my_router.get("/limits", response_model=WriterModelLimits, description="The limits for the writer's own models, as the admin has set them (each at its ceiling, the admin's own limit, until set).")
def get_writer_limits(root: Path = Depends(get_app_data_storage_root)) -> WriterModelLimits:
    return store.load_writer_limits(root)


@my_router.put("/limits", response_model=WriterModelLimits, description="Set the limits for the writer's own models. Each is held between its floor and its ceiling; the answer is what was kept.")
def put_writer_limits(body: WriterModelLimits, root: Path = Depends(get_app_data_storage_root)) -> WriterModelLimits:
    return store.save_writer_limits(root, body)
