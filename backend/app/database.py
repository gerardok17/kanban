import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .structured_ai import (
    BoardOperation,
    CreateCardOperation,
    DeleteCardOperation,
    EditCardOperation,
    MoveCardOperation,
    RenameColumnOperation,
)


DEFAULT_DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
DATABASE_PATH = DEFAULT_DATA_DIR / "kanban.sqlite3"

SEED_COLUMNS = [
    ("col-backlog", "Backlog", 0),
    ("col-discovery", "To Do", 1),
    ("col-progress", "In Progress", 2),
    ("col-review", "Review", 3),
    ("col-done", "Done", 4),
]

SEED_CARDS = [
    ("card-1", "Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
    ("card-2", "Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    ("card-3", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    ("card-4", "Refine status language", "Standardize column labels and tone across the board."),
    ("card-5", "Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    ("card-6", "QA micro-interactions", "Verify hover, focus, and loading states."),
    ("card-7", "Ship marketing page", "Final copy approved and asset pack delivered."),
    ("card-8", "Close onboarding sprint", "Document release notes and share internally."),
]

SEED_CARD_COLUMNS = {
    "card-1": "col-backlog",
    "card-2": "col-backlog",
    "card-3": "col-discovery",
    "card-4": "col-progress",
    "card-5": "col-progress",
    "card-6": "col-review",
    "card-7": "col-done",
    "card-8": "col-done",
}


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    with connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS columns (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                position INTEGER NOT NULL,
                UNIQUE(board_id, position)
            );
            CREATE TABLE IF NOT EXISTS cards (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                details TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS card_positions (
                board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
                card_id TEXT NOT NULL UNIQUE REFERENCES cards(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                PRIMARY KEY(board_id, card_id),
                UNIQUE(column_id, position),
                UNIQUE(column_id, card_id)
            );
            INSERT OR IGNORE INTO schema_migrations(version, applied_at)
            VALUES (1, '2026-08-23T00:00:00+00:00');
            """
        )
        user = connection.execute(
            "SELECT id FROM users WHERE username = ?", ("user",)
        ).fetchone()
        if user is None:
            now = utc_now()
            connection.execute(
                "INSERT INTO users(id, username, created_at) VALUES (?, ?, ?)",
                ("user-1", "user", now),
            )
            connection.execute(
                "INSERT INTO boards(id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                ("board-1", "user-1", "Kanban Studio", now, now),
            )
            connection.executemany(
                "INSERT INTO columns(id, board_id, title, position) VALUES (?, 'board-1', ?, ?)",
                SEED_COLUMNS,
            )
            connection.executemany(
                "INSERT INTO cards(id, board_id, title, details, created_at, updated_at) VALUES (?, 'board-1', ?, ?, ?, ?)",
                [(card_id, title, details, now, now) for card_id, title, details in SEED_CARDS],
            )
            column_positions: dict[str, int] = {}
            for card_id, column_id in SEED_CARD_COLUMNS.items():
                position = column_positions.get(column_id, 0)
                connection.execute(
                    "INSERT INTO card_positions(board_id, column_id, card_id, position) VALUES ('board-1', ?, ?, ?)",
                    (column_id, card_id, position),
                )
                column_positions[column_id] = position + 1


def get_board_for_user(username: str) -> dict[str, Any]:
    with connect() as connection:
        board = connection.execute(
            """
            SELECT boards.* FROM boards
            JOIN users ON users.id = boards.user_id
            WHERE users.username = ?
            """,
            (username,),
        ).fetchone()
        if board is None:
            raise ValueError("Board not found")
        columns = connection.execute(
            "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
            (board["id"],),
        ).fetchall()
        cards = connection.execute(
            "SELECT id, title, details FROM cards WHERE board_id = ?",
            (board["id"],),
        ).fetchall()
        positions = connection.execute(
            "SELECT column_id, card_id, position FROM card_positions WHERE board_id = ? ORDER BY position",
            (board["id"],),
        ).fetchall()

    card_ids_by_column: dict[str, list[str]] = {column["id"]: [] for column in columns}
    for position in positions:
        card_ids_by_column[position["column_id"]].append(position["card_id"])

    return {
        "id": board["id"],
        "title": board["title"],
        "columns": [
            {
                "id": column["id"],
                "title": column["title"],
                "cardIds": card_ids_by_column[column["id"]],
            }
            for column in columns
        ],
        "cards": {
            card["id"]: {
                "id": card["id"],
                "title": card["title"],
                "details": card["details"] or "",
            }
            for card in cards
        },
    }


def board_id_for_user(connection: sqlite3.Connection, username: str) -> str:
    board = connection.execute(
        """
        SELECT boards.id FROM boards
        JOIN users ON users.id = boards.user_id
        WHERE users.username = ?
        """,
        (username,),
    ).fetchone()
    if board is None:
        raise ValueError("Board not found")
    return board["id"]


def rename_column(username: str, column_id: str, title: str) -> None:
    with connect() as connection:
        board_id = board_id_for_user(connection, username)
        result = connection.execute(
            "UPDATE columns SET title = ? WHERE id = ? AND board_id = ?",
            (title, column_id, board_id),
        )
        if result.rowcount == 0:
            raise ValueError("Column not found")
        connection.execute(
            "UPDATE boards SET updated_at = ? WHERE id = ?", (utc_now(), board_id)
        )


def create_card(
    username: str, card_id: str, column_id: str, title: str, details: str
) -> None:
    with connect() as connection:
        board_id = board_id_for_user(connection, username)
        column = connection.execute(
            "SELECT id FROM columns WHERE id = ? AND board_id = ?", (column_id, board_id)
        ).fetchone()
        if column is None:
            raise ValueError("Column not found")
        existing_card = connection.execute(
            "SELECT id FROM cards WHERE id = ?", (card_id,)
        ).fetchone()
        if existing_card is not None:
            raise ValueError("Card ID already exists")
        now = utc_now()
        connection.execute(
            "INSERT INTO cards(id, board_id, title, details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (card_id, board_id, title, details, now, now),
        )
        next_position = connection.execute(
            "SELECT COALESCE(MAX(position) + 1, 0) AS position FROM card_positions WHERE column_id = ?",
            (column_id,),
        ).fetchone()["position"]
        connection.execute(
            "INSERT INTO card_positions(board_id, column_id, card_id, position) VALUES (?, ?, ?, ?)",
            (board_id, column_id, card_id, next_position),
        )
        connection.execute(
            "UPDATE boards SET updated_at = ? WHERE id = ?", (now, board_id)
        )


def update_card(username: str, card_id: str, title: str, details: str | None) -> None:
    with connect() as connection:
        board_id = board_id_for_user(connection, username)
        result = connection.execute(
            "UPDATE cards SET title = ?, details = ?, updated_at = ? WHERE id = ? AND board_id = ?",
            (title, details, utc_now(), card_id, board_id),
        )
        if result.rowcount == 0:
            raise ValueError("Card not found")
        connection.execute(
            "UPDATE boards SET updated_at = ? WHERE id = ?", (utc_now(), board_id)
        )


def delete_card(username: str, card_id: str) -> None:
    with connect() as connection:
        board_id = board_id_for_user(connection, username)
        result = connection.execute(
            "DELETE FROM cards WHERE id = ? AND board_id = ?", (card_id, board_id)
        )
        if result.rowcount == 0:
            raise ValueError("Card not found")
        connection.execute(
            "UPDATE boards SET updated_at = ? WHERE id = ?", (utc_now(), board_id)
        )
        normalize_positions(connection, board_id)


def move_card(username: str, card_id: str, column_id: str, position: int) -> None:
    with connect() as connection:
        board_id = board_id_for_user(connection, username)
        card = connection.execute(
            "SELECT card_id FROM card_positions WHERE card_id = ? AND board_id = ?",
            (card_id, board_id),
        ).fetchone()
        column = connection.execute(
            "SELECT id FROM columns WHERE id = ? AND board_id = ?", (column_id, board_id)
        ).fetchone()
        if card is None or column is None or position < 0:
            raise ValueError("Invalid card move")
        connection.execute(
            "DELETE FROM card_positions WHERE card_id = ? AND board_id = ?", (card_id, board_id)
        )
        normalize_positions(connection, board_id)
        count = connection.execute(
            "SELECT COUNT(*) AS count FROM card_positions WHERE column_id = ?", (column_id,)
        ).fetchone()["count"]
        insert_position = min(position, count)
        connection.execute(
            "UPDATE card_positions SET position = position + 1000000 WHERE column_id = ? AND position >= ?",
            (column_id, insert_position),
        )
        connection.execute(
            "UPDATE card_positions SET position = position - 999999 WHERE column_id = ? AND position >= ?",
            (column_id, insert_position + 1000000),
        )
        connection.execute(
            "INSERT INTO card_positions(board_id, column_id, card_id, position) VALUES (?, ?, ?, ?)",
            (board_id, column_id, card_id, insert_position),
        )
        normalize_positions(connection, board_id)
        connection.execute(
            "UPDATE boards SET updated_at = ? WHERE id = ?", (utc_now(), board_id)
        )


def normalize_positions(connection: sqlite3.Connection, board_id: str) -> None:
    columns = connection.execute(
        "SELECT id FROM columns WHERE board_id = ?", (board_id,)
    ).fetchall()
    for column in columns:
        positions = connection.execute(
            "SELECT card_id FROM card_positions WHERE column_id = ? ORDER BY position",
            (column["id"],),
        ).fetchall()
        for position, card in enumerate(positions):
            connection.execute(
                "UPDATE card_positions SET position = ? WHERE board_id = ? AND card_id = ?",
                (position, board_id, card["card_id"]),
            )


def apply_operations(username: str, operations: list[BoardOperation]) -> dict[str, Any]:
    with connect() as connection:
        board_id = board_id_for_user(connection, username)
        now = utc_now()
        for operation in operations:
            if isinstance(operation, RenameColumnOperation):
                title = operation.title.strip()
                result = connection.execute(
                    "UPDATE columns SET title = ? WHERE id = ? AND board_id = ?",
                    (title, operation.columnId, board_id),
                )
                if not title or result.rowcount == 0:
                    raise ValueError("Invalid column rename")
            elif isinstance(operation, CreateCardOperation):
                title = operation.title.strip()
                column = connection.execute(
                    "SELECT id FROM columns WHERE id = ? AND board_id = ?",
                    (operation.columnId, board_id),
                ).fetchone()
                if not title or column is None:
                    raise ValueError("Invalid card creation")
                card_id = f"ai-{token_for_operation(operation.title)}"
                if connection.execute("SELECT id FROM cards WHERE id = ?", (card_id,)).fetchone():
                    raise ValueError("Generated card ID already exists")
                connection.execute(
                    "INSERT INTO cards(id, board_id, title, details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (card_id, board_id, title, operation.details, now, now),
                )
                position = connection.execute(
                    "SELECT COALESCE(MAX(position) + 1, 0) AS position FROM card_positions WHERE column_id = ?",
                    (operation.columnId,),
                ).fetchone()["position"]
                connection.execute(
                    "INSERT INTO card_positions(board_id, column_id, card_id, position) VALUES (?, ?, ?, ?)",
                    (board_id, operation.columnId, card_id, position),
                )
            elif isinstance(operation, EditCardOperation):
                title = operation.title.strip()
                result = connection.execute(
                    "UPDATE cards SET title = ?, details = ?, updated_at = ? WHERE id = ? AND board_id = ?",
                    (title, operation.details, now, operation.cardId, board_id),
                )
                if not title or result.rowcount == 0:
                    raise ValueError("Invalid card edit")
            elif isinstance(operation, DeleteCardOperation):
                result = connection.execute(
                    "DELETE FROM cards WHERE id = ? AND board_id = ?",
                    (operation.cardId, board_id),
                )
                if result.rowcount == 0:
                    raise ValueError("Invalid card deletion")
                normalize_positions(connection, board_id)
            elif isinstance(operation, MoveCardOperation):
                _move_card_in_connection(connection, board_id, operation.cardId, operation.columnId, operation.position)
        connection.execute("UPDATE boards SET updated_at = ? WHERE id = ?", (now, board_id))
    return get_board_for_user(username)


def token_for_operation(title: str) -> str:
    import hashlib

    return hashlib.sha256(title.encode()).hexdigest()[:16]


def _move_card_in_connection(
    connection: sqlite3.Connection, board_id: str, card_id: str, column_id: str, position: int
) -> None:
    card = connection.execute(
        "SELECT card_id FROM card_positions WHERE card_id = ? AND board_id = ?", (card_id, board_id)
    ).fetchone()
    column = connection.execute(
        "SELECT id FROM columns WHERE id = ? AND board_id = ?", (column_id, board_id)
    ).fetchone()
    if card is None or column is None:
        raise ValueError("Invalid card move")
    connection.execute("DELETE FROM card_positions WHERE card_id = ? AND board_id = ?", (card_id, board_id))
    normalize_positions(connection, board_id)
    count = connection.execute("SELECT COUNT(*) AS count FROM card_positions WHERE column_id = ?", (column_id,)).fetchone()["count"]
    insert_position = min(position, count)
    connection.execute("UPDATE card_positions SET position = position + 1000000 WHERE column_id = ? AND position >= ?", (column_id, insert_position))
    connection.execute("UPDATE card_positions SET position = position - 999999 WHERE column_id = ? AND position >= ?", (column_id, insert_position + 1000000))
    connection.execute("INSERT INTO card_positions(board_id, column_id, card_id, position) VALUES (?, ?, ?, ?)", (board_id, column_id, card_id, insert_position))
    normalize_positions(connection, board_id)
