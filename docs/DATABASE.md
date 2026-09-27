# Database proposal

## Storage

Use MariaDB as the runtime database — the `kanbanpmdb` database inside the shared
`homelab-db` container. The backend connects with PyMySQL using the `MYSQL_*`
environment variables (see `.env.example`) and creates the tables on startup if
they do not exist. Data persists in the `homelab-db` volume, so replacing the app
container never removes user data.

The JSON contract is in [database-schema.json](database-schema.json). It is a
normalized export shape: users, boards, columns, and cards are separate
collections, with `column.cardIds` preserving card order.

## Relational model

- `users`: `id` primary key, unique `username` (mirrors the email), unique `email`
  (the Google sign-in allowlist key), nullable `password_hash` (unused since sign-in
  became Google-only), `role` (`admin` or `user`, default `user`), and `created_at`.
- `boards`: `id` primary key, `user_id` foreign key to `users`, `title`,
  `position`, `created_at`, and `updated_at`. There is no unique constraint on
  `user_id` — a user can own multiple boards.
- `columns`: `id` primary key, `board_id` foreign key to `boards`, `title`, and
  `position`. A unique `(board_id, position)` constraint preserves column order.
- `cards`: `id` primary key, `board_id` foreign key to `boards`, `title`,
  nullable `details`, nullable `created_by` (foreign key to `users`: who created
  the card, set to `NULL` when that user is deleted so the card stays on its
  board), `created_at`, `updated_at`, and nullable `completed_at`.
- `board_shares`: `board_id` and `user_id` (composite primary key, both foreign
  keys, cascading), and `created_at`. The users a board is shared with;
  `boards.user_id` remains its one owner.
- `labels`: `id` primary key, `board_id` foreign key to `boards` (cascading),
  `name`, `color` (a palette key such as `blue`; the UI owns the hex), and
  `created_at`. A unique `(board_id, color)` constraint gives each color to one
  label per board, so a board has at most eight labels.
- `card_labels`: `card_id` and `label_id` (composite primary key, both foreign
  keys, cascading). Which labels each card carries.
- `card_positions`: `board_id`, `column_id`, `card_id`, and `position`, with
  foreign keys and unique `(column_id, position)` and `(column_id, card_id)`
  constraints. This is the relational equivalent of `column.cardIds` and makes
  moving a card an explicit ordered update.

The seed user comes from `SEED_EMAIL`: a Google-only user (no password) with one
empty starter board. The first user (oldest `created_at`) is the owner: always an
`admin` (restored on every startup) and never deletable. Admins manage the other
users; `role` is an app-level role, separate from any per-board permission.

## Initialization and versioning

On application startup (from the FastAPI lifespan), connect to MariaDB, create the
tables if absent (InnoDB, `utf8mb4`, `DATETIME` timestamps), and record the schema
version. Seed the user and one empty starter board only when those records do not
exist. Do not reseed or overwrite user changes on later startups.

Timestamps are stored in UTC and returned as ISO 8601 strings with an explicit
`+00:00` offset, so browsers show them in the viewer's local time.

Migrations are additive, recorded in `schema_migrations`, and applied in order
before serving requests: `1` the base schema, `2` `cards.completed_at`, `3`
`users.email` with a nullable `password_hash` (Google sign-in), `4` `users.role`,
`5` `board_shares`, `6` `cards.created_by`, and `7` `labels` with `card_labels`.
Migration 6 credits existing cards to their board's owner, once; afterwards a `NULL`
creator means a deleted user.

## Mutation rules

- Every board read or write resolves the board through the authenticated user;
  client-supplied ownership IDs are never trusted. A user can open a board they own
  or one shared with them; members work with its cards and columns, while sharing,
  unsharing, renaming, and deleting the board are owner-only.
- A board can be deleted only when it has no active cards; its completed cards are
  deleted with it. Sharing is by the email of an existing user.
- Everyone who can open a board manages its labels. Names are trimmed, required,
  and at most 16 characters, and may repeat; a color already used on the board is
  rejected. Deleting a label takes it off every card that carries it.
- User administration (list, add, change role, delete) is admin-only; the role is
  read from the database on every request. Deleting a user also ends their sessions.
- IDs must be non-empty and unique within their entity type.
- Column positions and card positions are zero-based, contiguous integers when
  a board is returned.
- Every card belongs to exactly one column in its board.
- A card move and its position updates occur in one transaction.
- Renaming a column trims surrounding whitespace and rejects an empty title.
- Card titles are required and trimmed; details may be empty or null.
- Unknown IDs, duplicate IDs, cross-board references, malformed ordering, and
  attempts to mutate another user's board are rejected without partial writes.

## Validation examples

A fresh database seeds one user and one empty board with five columns and no
cards. The second column is displayed as `To Do` and keeps the stable ID
`col-discovery`. Empty columns are valid and are represented with an empty
`cardIds` array. Renaming a column changes only its title; moving a card changes
only its position membership and ordering. Unknown or duplicate card references
are invalid.

## Part 6 API contract

All board routes require the `session` cookie created by `POST /api/auth/login`.
Successful mutation routes return the complete current board using the same
shape as `GET /api/board`.

- `GET /api/board` reads the signed-in user's board.
- `PATCH /api/board/columns/{column_id}` accepts `{ "title": "..." }`.
- `POST /api/board/cards` accepts `{ "columnId": "...", "title": "...", "details": "..." }`.
- `PATCH /api/board/cards/{card_id}` accepts `{ "title": "...", "details": "...", "columnId": "..." }`;
  the optional `columnId` is the card's status, and a different column moves the card to its end
  in the same transaction.
- `DELETE /api/board/cards/{card_id}` removes a card and normalizes positions.
- `POST /api/board/cards/{card_id}/move` accepts `{ "columnId": "...", "position": 0 }`.

Unauthenticated requests return `401`. Unknown board-owned IDs return `404`;
empty titles and other invalid payloads return `422`. Failed mutations do not
partially update the database.

## Approval

The user approved this schema and storage approach before Part 6
implementation began.
