# Backend guidance

The backend is a FastAPI application packaged with `uv` and served by Uvicorn.
The current Part 2 scaffold lives in `app/main.py` and provides temporary HTML
at `/`, JSON at `/api/hello`, and a health check at `/health`. Backend tests use
pytest and FastAPI's `TestClient`.

The Dockerized application listens on port `8000`.

The backend has SQLite persistence, authentication, and board routes. Keep pure
validation and board transformations isolated from HTTP handlers where
practical, and favor integration tests for behavior crossing the API, database,
and frontend boundaries.