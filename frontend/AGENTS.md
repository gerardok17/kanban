# Frontend guidance

## Purpose

This directory contains the existing Next.js Kanban Studio frontend. It is currently a frontend-only demo with board state held in React memory.

## Stack

- Next.js `16.1.6` with the App Router
- React `19.2.3` and TypeScript
- Tailwind CSS `4`
- `@dnd-kit/core` and `@dnd-kit/sortable` for drag and drop
- Vitest, Testing Library, and jsdom for unit/component tests

## Structure

- `src/app/page.tsx` is the app entry point and renders `KanbanBoard`.
- `src/app/layout.tsx` loads the Manrope body font, Space Grotesk display font, metadata, and global CSS.
- `src/app/globals.css` defines the project color variables and base styles.
- `src/components/KanbanBoard.tsx` owns the in-memory board state, drag handlers, column renaming, and card creation/deletion.
- `src/components/KanbanColumn.tsx` renders a droppable column, its sortable cards, and the "Add a card" button.
- `src/components/KanbanCard.tsx` renders a sortable card: title, a 5-line Markdown preview, and view / edit / delete actions.
- `src/components/KanbanCardPreview.tsx` renders the drag overlay.
- `src/components/CardDialog.tsx` is the card dialog (create / view / edit), opened by `KanbanBoard`; it closes only with Esc, the X, or Cancel/Close.
- `src/components/RichTextEditor.tsx` is the Tiptap description editor; `src/lib/cardEditor.ts` holds its extensions and the card field limits.
- `src/components/UsersView.tsx` is the admin-only user administration page (roles, add, delete); `src/components/AddUserDialog.tsx` adds an allowlisted email with its role. `AppShell` shows Users only to admins.
- `src/components/SharedWithSelector.tsx` sits left of `BoardSelector`: who a board is shared with (owner first), with share/unshare for the owner and a read-only list for everyone else. `BoardSelector` tags boards shared with you.
- `src/components/MarkdownContent.tsx` renders card descriptions. Descriptions are stored as Markdown, never HTML, and rendered without raw HTML.
- `src/lib/kanban.ts` defines `Card`, `Column`, and `BoardData`, provides `initialData`, and contains the pure `moveCard`, `createId`, and `visibleColumns`/`isHiddenColumn` helpers.
- `src/lib/api.ts` contains the same-origin API client for authenticated board reads and mutations.
- `src/**/*.test.{ts,tsx}` contains Vitest tests; `src/test/setup.ts` configures Testing Library matchers.

## Commands

Run these from `frontend/`:

- `npm run dev` starts the Next.js development server.
- `npm run build` creates a production build.
- `npm run lint` runs ESLint.
- `npm run test:unit` runs Vitest tests.

## Current behavior

- `/` displays the sign-in form until the MVP credentials are accepted, then displays the Kanban board. The board data carries five columns; the `Review` column is hidden from the UI (see `visibleColumns` in `src/lib/kanban.ts`), so four are shown.
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
- The frontend development server uses port `3000`. The Dockerized FastAPI application will use port `8000`.
