from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .api import draft, outline, plot, projects, revisions
from .storage.project_store import (
    MomentNotFoundError,
    ProjectNotFoundError,
    ShardCorruptError,
    SnapshotNotFoundError,
)


def create_app() -> FastAPI:
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

    return app


app = create_app()
