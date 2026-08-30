# Local setup

## Part 2 backend

The Part 2 Docker image runs the FastAPI scaffolding on port `8000`.

```sh
docker build -t project-management-mvp .
docker run --rm -p 8000:8000 project-management-mvp
```

Verify the Kanban page at `http://127.0.0.1:8000/`, the API response at `http://127.0.0.1:8000/api/hello`, and the health response at `http://127.0.0.1:8000/health`.

The Docker build compiles the static Next.js frontend before packaging it with
FastAPI. The frontend-only development server remains available from
`frontend/` on port `3000` with `npm run dev`.
