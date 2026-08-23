# Backend guidance

The backend is a FastAPI application packaged with `uv` and served by Uvicorn.
The current Part 2 scaffold lives in `app/main.py` and provides temporary HTML
at `/`, JSON at `/api/hello`, and a health check at `/health`. Backend tests use
pytest and FastAPI's `TestClient`.

The Dockerized application listens on port `8000`. Keep secrets such as
`OPENROUTER_API_KEY` in the backend environment; never expose them to the
frontend or commit them to the repository.

The backend now has SQLite persistence, authentication, board routes, and a
protected OpenRouter connectivity route at `POST /api/ai/test`. Keep the API
key in the backend environment only. Keep pure validation and board
transformations isolated from HTTP handlers where practical, and favor
integration tests for behavior crossing the API, database, and frontend
boundaries.