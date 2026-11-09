from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..deps import get_app_data_storage_root, get_storage_root
from ..storage import character_models_store as catalog
from ..storage import figure_models as figures
from ..storage import project_store as store
from ..storage.schema import FigureModel, ModelContent

router = APIRouter(prefix="/api/projects/{project_id}/figure-models", tags=["figure-models"])


class FigureModelCreate(BaseModel):
    """Keep a copy of a model in the project: of the published model `modelId` (its current published version), or, for a character file that carries one, of `content`."""

    modelId: str = Field(min_length=1, max_length=80)
    version: Optional[int] = Field(default=None, ge=0)
    name: str = Field(default="", max_length=60)
    content: Optional[ModelContent] = None

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, value: Any) -> str:
        return value.strip()[:60] if isinstance(value, str) else ""


@router.get("", response_model=list[FigureModel])
def list_figure_models(project_id: str, root: Path = Depends(get_storage_root)) -> list[FigureModel]:
    """Every copy of a model the project holds: what the cast list, the scene heads and the editor draw the characters' figures from."""
    return store.list_figure_models(root, project_id)


@router.post("", response_model=FigureModel, status_code=201)
def add_figure_model(
    project_id: str, body: FigureModelCreate, root: Path = Depends(get_storage_root), models: Path = Depends(get_app_data_storage_root)
) -> FigureModel:
    if body.content is not None:
        copy_args = (body.content, body.modelId, body.version or 0, body.name)
    else:
        published = next((m for m in catalog.published_models(models).models if m.id == body.modelId), None)
        if published is None:
            raise HTTPException(status_code=404, detail=f"no published model {body.modelId!r}")
        copy_args = (published.content, published.id, published.version, published.content.name, published.publishedAt)
    try:
        return store.add_figure_model(root, project_id, figures.copy_of(*copy_args))
    except figures.FigureModelTooBigError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except store.FigureModelLimitError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
