"""Desktop entry point: runs the FastAPI backend in a background thread and
shows it in a native OS webview window via pywebview.

Dev mode (``python desktop_main.py --dev``): the window points at the Vite
dev server (``npm run dev`` must already be running on port 5173); its proxy
config forwards /api calls to this backend. Live-reload works as usual.

Prod mode (``python desktop_main.py``, the default): the backend itself
serves the built frontend (``frontend/dist``, or the copy bundled by
PyInstaller) and the window points directly at the backend's own port --
no Node/npm involved at runtime.
"""

import argparse
import sys
import threading
import time
import urllib.request
from pathlib import Path

import uvicorn
import webview

HOST = "127.0.0.1"
PORT = 8000
DEV_FRONTEND_URL = "http://127.0.0.1:5173"


def frontend_dist_path() -> Path:
    """Resolve the built frontend directory.

    PyInstaller (see scriblr.spec) unpacks it as `frontend_dist` next to this
    file under `sys._MEIPASS`. Run from source (no `npm run build` copy step),
    it's simply `../frontend/dist`.
    """
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "frontend_dist"
    return Path(__file__).resolve().parent.parent / "frontend" / "dist"


def build_server() -> uvicorn.Server:
    from app.main import create_app

    frontend_dist = frontend_dist_path()
    static_dir = frontend_dist if frontend_dist.is_dir() else None
    app = create_app(static_dir=static_dir)
    config = uvicorn.Config(app, host=HOST, port=PORT, log_level="warning")
    return uvicorn.Server(config)


def wait_until_healthy(url: str, timeout: float = 10.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=0.5) as resp:
                if resp.status == 200:
                    return True
        except OSError:
            time.sleep(0.1)
    return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Point the window at the Vite dev server (npm run dev) instead of the built frontend",
    )
    args = parser.parse_args()

    server = build_server()
    server_thread = threading.Thread(target=server.run, daemon=True)
    server_thread.start()

    if not wait_until_healthy(f"http://{HOST}:{PORT}/api/health"):
        raise RuntimeError("Backend did not become healthy in time")

    window_url = DEV_FRONTEND_URL if args.dev else f"http://{HOST}:{PORT}/"
    window = webview.create_window(
        "Scriblr",
        window_url,
        width=1280,
        height=860,
        min_size=(960, 640),
    )

    def _on_closed() -> None:
        server.should_exit = True

    window.events.closed += _on_closed

    webview.start()

    # Give uvicorn a moment to unwind after should_exit before the process
    # exits, so no orphaned python.exe is left running.
    server_thread.join(timeout=5)


if __name__ == "__main__":
    main()
