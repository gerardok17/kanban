# Project Plan

## Working agreements

- Keep the existing frontend behavior and visual design unchanged unless a later part explicitly requires a change.
- Use FastAPI for the backend and serve the statically exported Next.js site from the backend at `/` in the production container.
- Use port `8000` for the Dockerized FastAPI application. Keep the existing frontend development and Playwright port, `3000`, for local frontend-only work.
- Use SQLite for runtime persistence. The schema proposal will be documented as JSON and in `docs/`; it is not a second database format.
- Keep the OpenRouter key on the backend. Never expose it to browser code or static assets.
- Prefer integration tests for behavior that crosses frontend, backend, database, authentication, or AI boundaries. Add focused unit tests for pure transformations and isolated helpers where they reduce debugging cost.
- AI chat uses streaming responses. The backend will expose a streaming endpoint, and the browser will consume the stream while applying any structured Kanban update only after the complete response has been validated.
- Use the hardcoded MVP credentials `user` / `password`, while keeping the data model ready for multiple users.
- No part is considered complete until its checklist and success criteria pass. Parts 1, 5, and any later design decision requiring sign-off pause for user approval.

## Part 1: Plan and frontend inventory

### Checklist

- [x] Review the repository guidance and the existing frontend.
- [x] Record the frontend framework, scripts, state model, component boundaries, and test setup in `frontend/AGENTS.md`.
- [x] Expand this document with implementation steps, tests, and success criteria for every part.
- [x] Record the agreed streaming behavior, integration-test preference, and port choice.
- [x] Get user approval for this plan before starting Part 2.

### Tests and checks

- Confirm the existing frontend test commands and configuration are accurately documented.
- After documentation changes, verify the new guidance files exist and contain the agreed decisions.

### Success criteria

- The plan is detailed enough to execute one part at a time without silently changing scope.
- `frontend/AGENTS.md` describes the current code as it exists today.
- The user explicitly approves the plan before implementation begins.

## Part 2: Docker and backend scaffolding

### Checklist

- [x] Add a minimal FastAPI application in `backend/` with a health or hello-world route.
- [x] Add the Dockerfile and supporting configuration needed to install Python dependencies with `uv`.
- [x] Configure the application to serve a temporary static HTML response at `/`.
- [x] Add the start and stop scripts for macOS, Windows, and Linux in `scripts/`.
- [x] Document required environment variables and the selected port.
- [x] Keep the OpenRouter key optional for this scaffolding stage and out of image layers and client code.

### Tests and checks

- Backend integration test starts the app and verifies the hello-world route.
- Backend integration test verifies the health route and expected status/content types.
- Build and run the Docker image, then call `/` and the API route through port `8000`.
- Run each applicable start/stop script in a documented local setup.

### Success criteria

- A fresh checkout can build and start the container on port `8000`.
- `/` serves the temporary static response and an API request succeeds.
- Stopping the server leaves no managed process running.

## Part 3: Serve the existing frontend

### Checklist

- [x] Configure Next.js for a static export compatible with FastAPI serving.
- [x] Copy or mount the generated frontend assets into the container image without changing the current board behavior.
- [x] Configure FastAPI fallback/static routing so `/` loads the Kanban page and asset paths resolve.
- [x] Preserve the frontend-only development workflow on port `3000`.
- [x] Add the minimum API origin/configuration needed for later backend integration without exposing secrets.

### Tests and checks

- Frontend unit tests remain green.
- Build the static frontend and verify the output contains the board entry point and assets.
- Integration test runs the container and verifies `/` renders `Kanban Studio` and five columns.
- Integration test verifies a browser can load CSS, JavaScript, and the page without console errors.

### Success criteria

- The demo Kanban board is available at `http://127.0.0.1:8000/` from the container.
- Existing frontend behavior and design remain unchanged.
- The container serves both the page and its assets successfully.

## Part 4: Fake sign-in experience

### Checklist

- [x] Add a login view shown before the board for unauthenticated visitors.
- [x] Accept only `user` / `password` for the MVP.
- [x] Establish a backend-compatible session or auth state that can identify the signed-in user.
- [x] Protect the board route and provide a logout action.
- [x] Handle invalid credentials and loading/submission states clearly.
- [x] Keep the implementation replaceable when real users are introduced.

### Tests and checks

- Integration test verifies a new visitor sees login instead of the board.
- Integration test verifies valid credentials reveal the board.
- Integration test verifies invalid credentials keep the board hidden and show an error.
- Integration test verifies logout returns to login and prevents board access.
- Integration test verifies a refresh preserves or rejects the session according to the chosen session design.

### Success criteria

- No unauthenticated user can view or modify the board through the UI or protected API.
- The documented credentials work consistently in local Docker runs.
- Logout reliably ends the MVP session.

## Part 5: Database model and approval

### Checklist

- [x] Define JSON schema examples for users, boards, columns, cards, and ordering.
- [x] Define identifiers, ownership, timestamps, nullable fields, and update semantics.
- [x] Decide how the single MVP board maps to a future multi-user model.
- [x] Document SQLite initialization, file location, migrations/versioning, and transaction boundaries in `docs/`.
- [x] Specify validation rules for board mutations and AI-generated updates.
- [x] Ask the user to review and approve the schema before implementation.

### Tests and checks

- Validate the example JSON against the documented shape.
- Review examples for empty columns, card ordering, renamed columns, and unknown IDs.
- Confirm the schema can represent the existing `initialData` without losing information.

### Success criteria

- A user-approved JSON schema and SQLite approach exist in `docs/`.
- The model supports one board per user now and multiple users later.
- Invalid or cross-user board references have an explicit rejection behavior.

## Part 6: Persistent backend API

### Checklist

- [x] Create the SQLite database automatically when it does not exist.
- [x] Add schema initialization and seed the MVP user's initial board exactly once.
- [x] Add authenticated read and mutation routes for the current user's board.
- [x] Support column renames, card creation, card edits/deletes, and card moves.
- [x] Validate payloads and enforce board ownership on every route.
- [x] Return stable JSON representations and useful error statuses.

### Tests and checks

- Backend integration tests cover first-run database creation and idempotent startup.
- Backend integration tests cover reading, renaming, creating, editing, deleting, and moving cards.
- Tests cover empty columns, invalid IDs, malformed payloads, and unauthorized access.
- Tests verify data survives application restart.

### Success criteria

- All supported board changes persist in SQLite and are isolated to the signed-in user.
- A missing database is created without manual setup.
- API behavior is documented well enough for the frontend to consume it.

## Part 7: Connect frontend and backend

### Checklist

- [x] Replace local board initialization and mutation persistence with API calls.
- [x] Load the authenticated user's board on entry and show loading/error states.
- [x] Persist every user mutation and reconcile the returned board with UI state.
- [x] Handle request failures without silently losing the user's local changes.
- [x] Add a small API client layer that keeps request details out of presentational components.

### Tests and checks

- Full-stack integration tests sign in, load the seeded board, mutate it, reload, and verify persistence.
- Tests cover each board mutation through the browser and verify the corresponding backend state.
- Tests cover backend errors, expired/invalid sessions, and recovery by reload.
- Run the existing unit suite and browser suite against the integrated app.

### Success criteria

- The UI displays and modifies the backend-backed board at port `8000`.
- Refreshing or restarting the app preserves successful changes.
- Existing board workflows remain usable and visually consistent.

## Part 8: OpenRouter connectivity

### Checklist

- [x] Add a backend-only OpenRouter client using the configured model `openai/gpt-oss-120b`.
- [x] Add configuration validation and clear errors when the API key is missing.
- [x] Add a minimal diagnostic route or test seam for the `2+2` connectivity check.
- [x] Set request timeouts and avoid logging secrets or full sensitive prompts.
- [x] Keep provider calls isolated so later structured chat behavior can reuse the client.

### Tests and checks

- Mocked integration test verifies the expected OpenRouter request and response handling.
- A separately documented opt-in live test sends `2+2` when `OPENROUTER_API_KEY` is available.
- Tests cover provider errors, malformed responses, timeouts, and missing configuration.

### Success criteria

- A configured local environment can complete the `2+2` call through the backend.
- The API key never reaches the frontend.
- Provider failures become actionable backend errors.

## Part 9: Structured AI board operations

### Checklist

- [x] Define a versioned structured response containing the assistant message and optional board update.
- [x] Send the complete current board JSON, the user's question, and conversation history on every AI request.
- [x] Define allowed operations for creating, editing, moving, deleting cards, and renaming columns.
- [x] Validate structured output server-side before applying any update.
- [x] Apply valid updates transactionally and preserve board ownership rules.
- [x] Stream assistant text/events to the client while ensuring board updates are emitted only after validation.
- [x] Bound conversation history and payload size without dropping the current board state.

### Tests and checks

- Mocked integration tests verify prompts include board JSON, question, and history.
- Tests verify valid structured responses update the board correctly.
- Tests verify responses without updates leave the board unchanged.
- Tests reject malformed, unknown, cross-board, and unauthorized operations.
- Streaming integration tests verify ordered events, completion, provider errors, and persistence of a valid update.
- Tests verify conversation history is preserved across successive requests.

### Success criteria

- Every AI call has the current board context and conversation context.
- Only validated structured operations can change the board.
- The client receives a streaming response and a deterministic final board state.

## Part 10: AI chat sidebar

### Checklist

- [x] Add the sidebar widget while preserving the existing board layout and visual language.
- [x] Display conversation history, streaming assistant text, errors, and a sending state.
- [x] Allow the user to submit questions and cancel or recover from failed requests.
- [x] Consume the backend stream and refresh the board automatically after a validated update.
- [x] Keep chat state scoped to the signed-in user/session as appropriate for the MVP.
- [x] Ensure the sidebar and board remain usable on desktop and mobile widths.

### Tests and checks

- Full-stack integration test sends a question and verifies streamed assistant content appears.
- Test verifies an AI-created, edited, moved, or renamed item appears on the board without a manual reload.
- Test verifies a response with no board update leaves board data unchanged.
- Test verifies stream errors, malformed final events, retry/recovery, and logout behavior.
- Run frontend unit, backend, and end-to-end integration suites together.

### Success criteria

- A signed-in user can conduct a complete streamed AI conversation from the sidebar.
- Valid AI board changes appear automatically and persist after reload.
- The feature is responsive, accessible, and does not regress existing Kanban workflows.