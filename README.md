# Scriblr

An offline, single-user desktop app for brainstorming, outlining, drafting, reading, and revising a book.

- `frontend/` — React + TypeScript UI (Vite)
- `backend/` — Python (FastAPI) local API + storage layer, packaged as a desktop app via pywebview
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

`backend/desktop_main.py` opens Scriblr in a native OS window (via
[pywebview](https://pywebview.flowrl.com/)) instead of a browser tab, running
the FastAPI backend in a background thread of the same process.

**Dev mode** — live-reloading frontend, run from source:

```bash
# terminal 1
cd frontend && npm run dev

# terminal 2
cd backend
./.venv/Scripts/pip install -e ".[dev]"
./.venv/Scripts/python desktop_main.py --dev
```

**Prod mode** — same window, but the backend serves the built frontend
itself (no Node/Vite needed at runtime):

```bash
cd frontend && npm run build
cd ../backend && ./.venv/Scripts/python desktop_main.py
```

**Packaged build** — a single distributable `.exe` with no Python or Node
install required on the target machine:

```bash
cd frontend && npm run build
cd ../backend
./.venv/Scripts/pip install -e ".[dev]"
./.venv/Scripts/python -m PyInstaller scriblr.spec --noconfirm
```

Produces `backend/dist/Scriblr.exe`, icon included (`backend/icon.ico`,
regenerate with `./.venv/Scripts/python scripts/generate_icon.py` if the
design ever changes — that script needs Pillow, a build-time-only tool not
required to run the packaged app). Double-click it (or run it from a
shell) to launch — it needs no arguments and no other files alongside it,
since the built frontend is bundled inside. Closing the window shuts the
backend down cleanly; no process is left running. Project data is stored
per-OS under the standard app-data directory (`%APPDATA%\Scriblr` on
Windows), independent of wherever the `.exe` itself lives, so rebuilding
or moving it never touches existing projects.

**Desktop shortcut** — for everyday use, a Windows shortcut (`Scriblr.lnk`)
pointing at `backend/dist/Scriblr.exe` is the simplest way to launch, same
as any other installed app (e.g. Slack): double-click the icon, the window
opens, no terminal involved. Create or refresh it after rebuilding the exe
with:

```powershell
$desktop = [Environment]::GetFolderPath('Desktop')
$exePath = 'C:\Users\rella\scriblr\scriblr\backend\dist\Scriblr.exe'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop 'Scriblr.lnk'))
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = Split-Path $exePath -Parent
$shortcut.IconLocation = $exePath
$shortcut.Description = 'Scriblr - offline writing app'
$shortcut.Save()
```

(Pin the shortcut to the Start Menu or taskbar the usual way — right-click
it — if you want it there too.)
