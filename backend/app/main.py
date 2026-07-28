from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from .api import activity, analytics, draft, outline, plot, projects, revisions, schedule, scrap
from .storage.project_store import (
    InvalidRestoreParentError,
    MomentNotFoundError,
    ProjectNotFoundError,
    ScrapEntryNotFoundError,
    ShardCorruptError,
    SnapshotNotFoundError,
    TreeSnapshotNotFoundError,
)


def create_app(static_dir: Optional[Path] = None) -> FastAPI:
    """`static_dir`, when given, is the built frontend (`frontend/dist`) to
    serve for the packaged desktop app. Left unset for dev/test, where the
    frontend is served separately by the Vite dev server."""
    app = FastAPI(title="Scriblr")

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

    @app.exception_handler(ShardCorruptError)
    async def _shard_corrupt(_: Request, exc: ShardCorruptError) -> JSONResponse:
        return JSONResponse(
            status_code=409,
            content={"detail": f"shard corrupt and quarantined: {exc.reason}"},
        )

    app.include_router(projects.router)
    app.include_router(outline.router)
    app.include_router(plot.router)
    app.include_router(draft.router)
    app.include_router(revisions.router)
    app.include_router(activity.router)
    app.include_router(analytics.router)
    app.include_router(schedule.router)
    app.include_router(scrap.router)

    if static_dir is not None:
        # Registered last so it only catches what the routers above didn't --
        # Starlette matches routes in registration order. Falls back to
        # index.html for any non-file path so client-side routing works on a
        # hard refresh/direct load of a nested route.
        @app.get("/{full_path:path}")
        async def spa(full_path: str) -> FileResponse:
            if full_path.startswith("api/"):
                raise HTTPException(status_code=404)
            candidate = static_dir / full_path
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(static_dir / "index.html")

    return app


app = create_app()
