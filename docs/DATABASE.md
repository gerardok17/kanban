# Database proposal

## Storage

Use SQLite as the runtime database. The backend will create the database file
when it does not exist. The default location will be a configurable
`DATA_DIR/kanban.sqlite3`, with `DATA_DIR` defaulting to `/app/data` in Docker.
The data directory should be mounted as a volume so container replacement does
not remove user data.

The JSON contract is in [database-schema.json](database-schema.json). It is a
normalized export shape: users, boards, columns, and cards are separate
collections, with `column.cardIds` preserving card order.

## Relational model

- `users`: `id` primary key, unique `username`, and `created_at`.
- `boards`: `id` primary key, `user_id` foreign key to `users`, `title`,
  `created_at`, and `updated_at`. Add a unique constraint on `user_id` for the
  MVP's one-board-per-user rule.
- `columns`: `id` primary key, `board_id` foreign key to `boards`, `title`, and
  `position`. A unique `(board_id, position)` constraint preserves column order.
- `cards`: `id` primary key, `board_id` foreign key to `boards`, `title`,
  nullable `details`, `created_at`, and `updated_at`.
- `card_positions`: `board_id`, `column_id`, `card_id`, and `position`, with
  foreign keys and unique `(column_id, position)` and `(column_id, card_id)`
  constraints. This is the relational equivalent of `column.cardIds` and makes
  moving a card an explicit ordered update.

The MVP seed user has a stable internal ID such as `user-1` and username
`user`. The password remains the hardcoded MVP credential and should not be
stored as a plaintext database field. Future users can be added without
changing board ownership or the API shape.

## Initialization and versioning

On application startup, open the configured SQLite file, enable foreign keys,
create the tables if absent, and apply numbered migrations in one transaction.
Seed the MVP user and initial board only when those records do not exist. Do not
reseed or overwrite user changes on later startups.

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
- AI-generated updates use the same validation and transaction path as normal
  API mutations.

## Validation examples

The current frontend `initialData` maps directly to one user, one board, five
columns, and eight cards. The second column is displayed as `To Do` and keeps
the stable ID `col-discovery` for existing data. Empty columns are valid and
are represented with an empty `cardIds` array. Renaming a column changes only
its title; moving a card changes only its position membership and ordering.
Unknown or duplicate card references are invalid.

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
