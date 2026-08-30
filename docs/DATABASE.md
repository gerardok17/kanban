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

- `users`: `id` primary key, unique `username`, bcrypt `password_hash`, and `created_at`.
- `boards`: `id` primary key, `user_id` foreign key to `users`, `title`,
  `position`, `created_at`, and `updated_at`. There is no unique constraint on
  `user_id` — a user can own multiple boards.
- `columns`: `id` primary key, `board_id` foreign key to `boards`, `title`, and
  `position`. A unique `(board_id, position)` constraint preserves column order.
- `cards`: `id` primary key, `board_id` foreign key to `boards`, `title`,
  nullable `details`, `created_at`, and `updated_at`.
- `card_positions`: `board_id`, `column_id`, `card_id`, and `position`, with
  foreign keys and unique `(column_id, position)` and `(column_id, card_id)`
  constraints. This is the relational equivalent of `column.cardIds` and makes
  moving a card an explicit ordered update.

The seed user has a stable internal ID (`user-gerardok17`) and username
`gerardok17`, with a bcrypt-hashed password stored in `password_hash`. Future
users can be added without changing board ownership or the API shape.

## Initialization and versioning

On application startup (from the FastAPI lifespan), connect to MariaDB, create the
tables if absent (InnoDB, `utf8mb4`, `DATETIME` timestamps), and record the schema
version. Seed the user and one empty starter board only when those records do not
exist. Do not reseed or overwrite user changes on later startups.

Schema version `1` is the contract currently proposed. Future migrations should
be additive where possible, recorded in a migrations table, and applied in
order before serving requests.

## Mutation rules

- Every board read or write resolves the board through the authenticated user;
  client-supplied ownership IDs are never trusted.
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
- `PATCH /api/board/cards/{card_id}` accepts `{ "title": "...", "details": "..." }`.
- `DELETE /api/board/cards/{card_id}` removes a card and normalizes positions.
- `POST /api/board/cards/{card_id}/move` accepts `{ "columnId": "...", "position": 0 }`.

Unauthenticated requests return `401`. Unknown board-owned IDs return `404`;
empty titles and other invalid payloads return `422`. Failed mutations do not
partially update the database.

## Approval

The user approved this schema and storage approach before Part 6
implementation began.
