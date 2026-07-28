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
