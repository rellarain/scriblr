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
    feedback,
    library,
    outline,
    plot,
    presets,
    projects,
    publications,
    reader,
    reader_reading,
    reader_social,
    resources,
    revisions,
    schedule,
    scrap,
    user_settings,
)
from .storage.ids import InvalidIdError
from .storage.backup import ensure_pre_migration_backup
from .storage.paths import get_app_data_root, get_projects_root
from .storage.schema import PROJECT_FILE_VERSION
from .storage.pdf_export import OutlineNodeNotFoundError
from .storage.project_store import (
    InvalidRestoreParentError,
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

    @app.exception_handler(OutlineNodeNotFoundError)
    async def _outline_node_not_found(_: Request, exc: OutlineNodeNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    app.include_router(projects.router)
    app.include_router(outline.router)
    app.include_router(plot.router)
    app.include_router(draft.router)
    app.include_router(revisions.router)
    app.include_router(publications.router)
    app.include_router(activity.router)
    app.include_router(analytics.router)
    app.include_router(book_progress.router)
    app.include_router(schedule.router)
    app.include_router(scrap.router)
    app.include_router(export.router)
    app.include_router(presets.router)
    app.include_router(admin_config.router)
    app.include_router(user_settings.router)
    app.include_router(feedback.router)
    app.include_router(resources.router)
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
