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

The OpenRouter key is not needed for the scaffolding and board stages. For Part
8, provide it only to the backend container:

```sh
docker run --rm -p 8000:8000 \
	-e OPENROUTER_API_KEY="$OPENROUTER_API_KEY" \
	project-management-mvp
```

After signing in, an opt-in connectivity check can be made with:

```sh
curl -b cookies.txt -X POST http://127.0.0.1:8000/api/ai/test \
	-H 'content-type: application/json' -d '{"question":"2+2"}'
```

The key must not be committed, included in image layers, or exposed to
frontend code. The endpoint returns `503` when the key is missing or the
provider fails.
