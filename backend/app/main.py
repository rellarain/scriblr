from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from .api import (
    activity,
    admin_config,
    analytics,
    book_progress,
    book_publishing,
    draft,
    export,
    facets,
    feedback,
    library,
    character_models,
    characters,
    figure_models,
    items,
    world_links,
    map_biomes,
    maps,
    outline,
    plot,
    presets,
    projects,
    publications,
    reader,
    reader_reading,
    reader_social,
    resources,
    revision_flags,
    revisions,
    schedule,
    scrap,
    training,
    user_settings,
)
from .storage.ids import InvalidIdError
from .storage import character_models_store
from .storage.backup import ensure_pre_migration_backup
from .storage.paths import get_app_data_root, get_projects_root
from .storage.schema import PROJECT_FILE_VERSION
from .storage.pdf_export import OutlineNodeNotFoundError
from .storage.project_store import (
    InvalidRestoreParentError,
    CharacterNotFoundError,
    ItemNotFoundError,
    MapNotFoundError,
    MomentNotFoundError,
    NewerSchemaError,
    purge_trash,
    sweep_temp_files,
    ProjectNotFoundError,
    ScrapEntryNotFoundError,
    ShardCorruptError,
    SnapshotNotFoundError,
    TreeSnapshotNotFoundError,
)


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    """At start-up: clear the temp files a killed process left behind, and the trashed projects that are old enough to go."""
    try:
        ensure_pre_migration_backup(get_app_data_root(), PROJECT_FILE_VERSION)  # before any project is converted to a newer format
        root = get_projects_root()
        sweep_temp_files(root)
        purge_trash(root)
    except OSError:
        pass
    try:
        character_models_store.seed_on_first_start(get_app_data_root())  # a fresh install gets the basic adult, published
        character_models_store.update_basic_on_start(get_app_data_root())  # a newer bundled basic adult is published as its next version, unless the admin changed it
    except (OSError, ValueError):
        pass
    yield


def create_app(static_dir: Optional[Path] = None) -> FastAPI:
    """`static_dir`, when given, is the built frontend (`frontend/dist`) to
    serve for the packaged desktop app. Left unset for dev/test, where the
    frontend is served separately by the Vite dev server."""
    app = FastAPI(title="Scriblr", lifespan=_lifespan)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.exception_handler(ProjectNotFoundError)
    async def _project_not_found(_: Request, exc: ProjectNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(MomentNotFoundError)
    async def _moment_not_found(_: Request, exc: MomentNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(SnapshotNotFoundError)
    async def _snapshot_not_found(_: Request, exc: SnapshotNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(TreeSnapshotNotFoundError)
    async def _tree_snapshot_not_found(_: Request, exc: TreeSnapshotNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ScrapEntryNotFoundError)
    async def _scrap_entry_not_found(_: Request, exc: ScrapEntryNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(InvalidRestoreParentError)
    async def _invalid_restore_parent(_: Request, exc: InvalidRestoreParentError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(InvalidIdError)
    async def _invalid_id(_: Request, exc: InvalidIdError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(NewerSchemaError)
    async def _newer_schema(_: Request, exc: NewerSchemaError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(ShardCorruptError)
    async def _shard_corrupt(_: Request, exc: ShardCorruptError) -> JSONResponse:
        return JSONResponse(
            status_code=409,
            content={"detail": f"shard corrupt and quarantined: {exc.reason}"},
        )

    @app.exception_handler(CharacterNotFoundError)
    async def _character_not_found(_: Request, exc: CharacterNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ItemNotFoundError)
    async def _item_not_found(_: Request, exc: ItemNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(MapNotFoundError)
    async def _map_not_found(_: Request, exc: MapNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(OutlineNodeNotFoundError)
    async def _outline_node_not_found(_: Request, exc: OutlineNodeNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    app.include_router(projects.router)
    app.include_router(outline.router)
    app.include_router(plot.router)
    app.include_router(maps.router)
    app.include_router(map_biomes.router)
    app.include_router(map_biomes.project_router)
    app.include_router(characters.router)
    app.include_router(figure_models.router)
    app.include_router(items.router)
    app.include_router(world_links.router)
    app.include_router(draft.router)
    app.include_router(revisions.router)
    app.include_router(publications.router)
    app.include_router(activity.router)
    app.include_router(analytics.router)
    app.include_router(book_progress.router)
    app.include_router(schedule.router)
    app.include_router(facets.project_router)
    app.include_router(facets.account_router)
    app.include_router(revision_flags.router)
    app.include_router(scrap.router)
    app.include_router(export.router)
    app.include_router(presets.router)
    app.include_router(character_models.router)
    app.include_router(character_models.my_router)
    app.include_router(admin_config.router)
    app.include_router(user_settings.router)
    app.include_router(feedback.router)
    app.include_router(resources.router)
    app.include_router(training.router)
    app.include_router(library.router)
    app.include_router(reader.router)
    app.include_router(reader_social.router)
    app.include_router(reader_reading.router)
    app.include_router(book_publishing.router)

    if static_dir is not None:
        # Registered last so it only catches what the routers above didn't --
        # Starlette matches routes in registration order. Falls back to
        # index.html for any non-file path so client-side routing works on a
        # hard refresh/direct load of a nested route.
        @app.get("/{full_path:path}")
        async def spa(full_path: str) -> FileResponse:
            if full_path.startswith("api/"):
                raise HTTPException(status_code=404)
            candidate = (static_dir / full_path).resolve()
            # Only files inside the built frontend are served; anything else (a path that climbs out with '..') is the app's index.
            if full_path and candidate.is_file() and candidate.is_relative_to(static_dir.resolve()):
                return FileResponse(candidate)
            return FileResponse(static_dir / "index.html")

    return app


app = create_app()
