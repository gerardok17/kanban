# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-user Kanban project-management MVP built while following Ed Donner's "AI Coder" course.
It is a monorepo with a Next.js frontend, a FastAPI backend, and Docker packaging. The backend
serves both the API and the statically exported frontend from one container on port `8000`.

`docs/` holds the working documentation: `DATABASE.md` + `database-schema.json` (the approved data
model) and `SETUP.md`. Each top-level directory also has an `AGENTS.md` with local guidance.

## Commands

### Frontend (run from `frontend/`)

- `npm run dev` - Next.js dev server on port `3000` (frontend-only demo mode)
- `npm run build` - static export to `frontend/out/`
- `npm run lint` - ESLint
- `npm run test:unit` - Vitest (jsdom); single file: `npx vitest run src/lib/kanban.test.ts`; single test: `npx vitest run -t "moves a card"`
- `npm run test:e2e` - Playwright; it auto-starts the port `3000` dev server. Single test: `npx playwright test -g "sign in"`
- `npm run test:all` - unit then e2e

### Backend (run from `backend/`)

Packaged with `uv` (the Docker image installs with `uv pip install`). Locally, use `uv run --extra test pytest`
or a venv with `pip install -e ".[test]"` then `pytest`. `pyproject.toml` sets `pythonpath` and `testpaths`,
so `pytest` alone discovers `tests/`. Single test: `pytest tests/test_main.py::test_health_route_returns_ok`.

Set `DATA_DIR` to a writable path when running the backend outside Docker (it defaults to `/app/data`).
The test suite overrides `database.DATABASE_PATH` to a tmp dir per test.

### Docker (run from repo root)

- `sh scripts/start-mac.sh` / `start-linux.sh` / `start-windows.ps1` - build the image and run it detached on port `8000`
- matching `stop-*` scripts remove the container

## Architecture

### Two runtime modes

The frontend branches on `window.location.port`:

- **Port 3000 (frontend-only demo):** `KanbanBoard` holds board state in memory from `src/lib/kanban.ts`
  `initialData`, `AuthGate` gates on a `localStorage` marker, and nothing persists.
- **Port 8000 (integrated):** `AuthGate` calls the backend session endpoints, and `KanbanBoard` (in `remote` mode)
  loads and persists every mutation through `src/lib/api.ts`.

Keep this split intact. Presentational components must not make network calls directly; route them through
`src/lib/api.ts`, and keep pure board transformations in `src/lib/kanban.ts`.

### Backend request flow

`app/main.py` defines all routes. Auth is a hardcoded `user`/`password` check that mints an in-memory
session token (`sessions: set[str]`, not persisted, cleared on restart) stored in an httponly cookie.
Every board route calls `require_session`, then resolves the board through the authenticated username -
client-supplied ownership IDs are never trusted. Mutation routes return the full board in the same shape
as `GET /api/board`.

`app/main.py` mounts `StaticFiles` at `/` from `<repo>/frontend`. In Docker this directory is the copied
static export; running uvicorn locally would serve the `frontend/` source tree instead, so the integrated
app is only fully correct when run from the Docker image.

### Database (`app/database.py`)

SQLite at `DATA_DIR/kanban.sqlite3`, created and seeded once on startup (`initialize_database`); later
startups never reseed. Schema and rules are documented in `docs/DATABASE.md`.

`card_positions` is the source of truth for card ordering (the relational form of `column.cardIds`).
`normalize_positions` rewrites every column's positions to contiguous zero-based integers, and is called
after any delete or move so the returned board always has clean ordering. Moves use a large-offset shuffle
to sidestep the `UNIQUE(column_id, position)` constraint mid-update.

## Coding standards (from AGENTS.md)

- Use current, idiomatic library versions.
- Keep it simple. Do not over-engineer, do not add speculative defensive code, do not add unrequested features.
- Be concise. Keep the README minimal. No emojis, ever.
- When something breaks, find the root cause with evidence before attempting a fix. Do not guess.
- Preserve existing frontend behavior and visual design unless a task requires a change.
- Prefer integration tests for behavior crossing the frontend/backend/database/auth boundaries;
  keep focused unit tests for pure helpers.

## Color scheme

- Accent yellow `#ecad0a` - accent lines, highlights
- Blue primary `#209dd7` - links, key sections
- Purple secondary `#753991` - submit buttons, important actions
- Dark navy `#032147` - main headings
- Gray text `#888888` - supporting text, labels
