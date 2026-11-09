"""The frozen copies of models that characters' figures point at (phase 6). A copy is made from a published model, or from a character file, and kept once in the
project under a key that is a hash of its content: the same model version copied twice (by two characters, an import and an edition) is one entry, and it never
changes when the admin publishes the model again."""

import hashlib
import json

from .character_models_store import copy_bytes
from .schema import MODEL_COPY_MAX_BYTES, FigureModel, ModelContent, PublishedModelOut


class FigureModelTooBigError(Exception):
    """A copy of a model larger than a character may keep."""


def content_key(content: ModelContent) -> str:
    """12 hex digits of a hash of the content as it is stored (sorted, compact), so equal content has an equal key."""
    text = json.dumps(content.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def copy_of(content: ModelContent, model_id: str, version: int, name: str = "", published_at=None) -> FigureModel:
    """A copy of some model content, ready to keep in a project (refused when it is over the size a character's copy may be)."""
    if copy_bytes(content) > MODEL_COPY_MAX_BYTES:
        raise FigureModelTooBigError(f"a copy of a model may be at most {MODEL_COPY_MAX_BYTES // 1024} KB")
    return FigureModel(id=content_key(content), modelId=model_id, version=version, name=name or content.name, publishedAt=published_at, content=content.model_copy(deep=True))


def copy_of_published(published: PublishedModelOut) -> FigureModel:
    return copy_of(published.content, published.id, published.version, published.content.name, published.publishedAt)
