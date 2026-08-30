# Frontend guidance

## Purpose

This directory contains the existing Next.js Kanban Studio frontend. It is currently a frontend-only demo with board state held in React memory.

## Stack

- Next.js `16.1.6` with the App Router
- React `19.2.3` and TypeScript
- Tailwind CSS `4`
- `@dnd-kit/core` and `@dnd-kit/sortable` for drag and drop
- Vitest, Testing Library, and jsdom for unit/component tests
- Playwright for browser tests

## Structure

- `src/app/page.tsx` is the app entry point and renders `KanbanBoard`.
- `src/app/layout.tsx` loads the Manrope body font, Space Grotesk display font, metadata, and global CSS.
- `src/app/globals.css` defines the project color variables and base styles.
- `src/components/KanbanBoard.tsx` owns the in-memory board state, drag handlers, column renaming, and card creation/deletion.
- `src/components/KanbanColumn.tsx` renders a droppable column, its sortable cards, and `NewCardForm`.
- `src/components/KanbanCard.tsx` renders a sortable card with a remove action.
- `src/components/KanbanCardPreview.tsx` renders the drag overlay.
- `src/components/NewCardForm.tsx` owns the add-card form state and validation.
- `src/lib/kanban.ts` defines `Card`, `Column`, and `BoardData`, provides `initialData`, and contains the pure `moveCard` and `createId` helpers.
- `src/lib/api.ts` contains the same-origin API client for authenticated board reads and mutations.
- `src/**/*.test.{ts,tsx}` contains Vitest tests; `src/test/setup.ts` configures Testing Library matchers.
- `tests/kanban.spec.ts` contains Playwright browser tests.

## Commands

Run these from `frontend/`:

- `npm run dev` starts the Next.js development server.
- `npm run build` creates a production build.
- `npm run lint` runs ESLint.
- `npm run test:unit` runs Vitest tests.
- `npm run test:e2e` runs Playwright tests and starts the configured dev server on port `3000` when needed.
- `npm run test:all` runs unit and browser tests.

## Current behavior

- `/` displays the sign-in form until the MVP credentials are accepted, then displays the five-column Kanban board.
- The board starts from `initialData` on every page load and is not persisted.
- Columns can be renamed in place.
- Cards can be added and removed.
- Cards can be reordered within a column or moved between columns with drag and drop.
- There is no database yet.
- The Part 4 client gate stores a signed-in marker in `localStorage` for the frontend-only development server. The backend exposes HTTP-only session endpoints for the integrated application and future protected API routes.
- On the integrated port `8000`, `AuthGate` creates and clears the backend session, and `KanbanBoard` loads and persists board changes through `src/lib/api.ts`. On port `3000`, the existing local-state demo remains available.

## Conventions for planned work

- Preserve the current behavior and visual design unless a plan step requires a change.
- Keep pure board transformations in `src/lib/kanban.ts` and keep network concerns out of presentational components.
- Prefer integration tests for frontend/backend and user workflows; retain focused unit tests for pure helpers.
- The frontend development server and existing Playwright configuration use port `3000`. The Dockerized FastAPI application will use port `8000`.
