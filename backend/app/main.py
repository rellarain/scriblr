from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from .api import draft, outline, plot, projects, revisions
from .storage.project_store import (
    MomentNotFoundError,
    ProjectNotFoundError,
    ShardCorruptError,
    SnapshotNotFoundError,
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
