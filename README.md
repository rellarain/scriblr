# Scriblr

An offline, single-user desktop app for brainstorming, outlining, drafting, reading, and revising a book.

- `frontend/` — React + TypeScript UI (Vite)
- `backend/` — Python (FastAPI) local API + storage layer
- `electron/` — Electron shell: spawns the backend as a subprocess and shows it in a native window
- `docs/data-model.md` — on-disk JSON storage schema
- `docs/legacy-concept/` — archived sketches from Scriblr's original multi-user SaaS concept (kept for reference, not active)

## Development

Backend:

```bash
cd backend
python -m venv .venv
./.venv/Scripts/pip install -e ".[dev]"
./.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend tests:

```bash
cd backend
./.venv/Scripts/python -m pytest
```

## Running the desktop app

`electron/main.js` opens Scriblr in a native window via
[Electron](https://www.electronjs.org/), spawning the FastAPI backend as a
subprocess (`backend/server_main.py` in dev, or its PyInstaller-built
executable once packaged) and pointing the window at it, the same way a
browser tab would.

**Dev mode** — live-reloading frontend, run from source:

```bash
# terminal 1
cd frontend && npm run dev

# terminal 2
cd electron
npm install
npm start
```

Electron itself starts the backend (using `backend/.venv`, so
`./.venv/Scripts/pip install -e ".[dev]"` must already have been run once)
and points its window at the Vite dev server.

**Prod mode, run from source** — same window, but the backend serves the
built frontend itself (no Node/Vite needed at runtime once built):

```bash
cd frontend && npm run build
cd ../electron
npm run start:prod
```

**Packaged build** — a single distributable installer with no Python or
Node install required on the target machine:

```bash
cd frontend && npm run build

cd ../backend
./.venv/Scripts/pip install -e ".[dev]"
./.venv/Scripts/python -m PyInstaller scriblr.spec --noconfirm

cd ../electron
npm install
npm run dist
```

The PyInstaller step produces the headless backend helper
(`backend/dist/scriblr-backend.exe`); `electron-builder` (the last step)
bundles it alongside Electron itself into `electron/dist/`, producing an
NSIS installer (icon included, from `backend/icon.ico` — regenerate with
`./.venv/Scripts/python scripts/generate_icon.py` if the design ever
changes, a build-time-only tool needing Pillow). Closing the window shuts
the backend down cleanly; no process is left running. Project data is
stored per-OS under the standard app-data directory (`%APPDATA%\Scriblr`
on Windows), independent of wherever the app is installed, so
rebuilding/reinstalling never touches existing projects.

> **Note:** `electron-builder` fetches a small Windows/macOS/Linux signing
> toolchain (`winCodeSign`) that contains symlinked files, and unpacking it
> requires the ability to create symlinks. On a stock Windows account
> without [Developer Mode](https://learn.microsoft.com/windows/apps/get-started/enable-your-device-for-development)
> enabled, `npm run dist` will fail with `Cannot create symbolic link: A
> required privilege is not held by the client`. Either enable Developer
> Mode once (Settings → Privacy & Security → For developers) or run the
> command from an elevated (Administrator) terminal.

**Desktop shortcut** — works today even without a full `electron-builder`
package, by launching Electron directly against `electron/` in prod mode
(`--prod`). Create or refresh it with:

```powershell
$desktop = [Environment]::GetFolderPath('Desktop')
$electronExe = 'C:\Users\rella\scriblr\scriblr\electron\node_modules\electron\dist\electron.exe'
$appDir = 'C:\Users\rella\scriblr\scriblr\electron'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop 'Scriblr.lnk'))
$shortcut.TargetPath = $electronExe
$shortcut.Arguments = "`"$appDir`" --prod"
$shortcut.WorkingDirectory = $appDir
$shortcut.IconLocation = 'C:\Users\rella\scriblr\scriblr\backend\icon.ico'
$shortcut.Description = 'Scriblr - offline writing app'
$shortcut.Save()
```

Requires `frontend/dist` to already be built (`cd frontend && npm run
build`) and `electron/node_modules` installed (`cd electron && npm
install`) at least once; rebuild the frontend after future changes for the
shortcut to pick them up.

Every launch that isn't dev mode (this shortcut, `npm run start:prod`, and
the eventual packaged app) gives its backend a **fresh, dynamically-picked
free port** each time, instead of a fixed one — Electron finds a free port
before spawning the backend and only that instance uses it. This is what
eliminates the "port already in use" / stale-process class of error this
project ran into repeatedly during development: the shortcut's server can
never collide with a dev server (or a leftover process) someone left bound
to the fixed dev port 8000, because it never tries to use that port.
