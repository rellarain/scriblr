"""Headless backend entry point for the Electron shell.

Runs the FastAPI app under uvicorn on a fixed host/port with no window of
its own -- Electron's main process spawns this (or, when packaged, the
PyInstaller-built executable of this same module) as a subprocess and points
its own BrowserWindow at the resulting HTTP server. See electron/main.js.

Dev: `python server_main.py` -- serves only the API; the built frontend
directory won't exist yet, so `static_dir` is left unset and Electron's
window instead points at the Vite dev server.

Prod / packaged: the built frontend (`frontend/dist`, or the copy bundled by
PyInstaller alongside this file) is served directly, and Electron's window
points at this server's own port -- no Node/npm involved at runtime.
"""

import os
import sys
from pathlib import Path

import uvicorn

HOST = os.environ.get("SCRIBLR_HOST", "127.0.0.1")
PORT = int(os.environ.get("SCRIBLR_PORT", "8000"))


def frontend_dist_path() -> Path:
    """Resolve the built frontend directory.

    PyInstaller (see scriblr.spec) unpacks it as `frontend_dist` next to this
    file under `sys._MEIPASS`. Run from source (no `npm run build` copy step),
    it's simply `../frontend/dist`.
    """
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "frontend_dist"
    return Path(__file__).resolve().parent.parent / "frontend" / "dist"


def main() -> None:
    from app.main import create_app

    frontend_dist = frontend_dist_path()
    static_dir = frontend_dist if frontend_dist.is_dir() else None
    app = create_app(static_dir=static_dir)
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
