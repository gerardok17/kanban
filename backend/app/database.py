import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

import bcrypt
import pymysql
from pymysql.connections import Connection
from pymysql.cursors import DictCursor


DB_CONFIG: dict[str, Any] = {
    "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
    "port": int(os.getenv("MYSQL_PORT", "3306")),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": os.getenv("MYSQL_DATABASE", "kanbanpmdb"),
    "charset": "utf8mb4",
    "cursorclass": DictCursor,
    "autocommit": False,
}

SEED_USERNAME = "gerardok17"
SEED_PASSWORD = "gerardok17"

# Default columns every new board starts with (renameable in the UI).
DEFAULT_COLUMNS = [
    ("col-backlog", "Backlog", 0),
    ("col-discovery", "To Do", 1),
    ("col-progress", "In Progress", 2),
    ("col-review", "Review", 3),
    ("col-done", "Done", 4),
]

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT PRIMARY KEY,
        applied_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(120) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS boards (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        title VARCHAR(200) NOT NULL,
        position INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_boards_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS `columns` (
        id VARCHAR(64) PRIMARY KEY,
        board_id VARCHAR(64) NOT NULL,
        title VARCHAR(200) NOT NULL,
        position INT NOT NULL,
        FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
        UNIQUE KEY uq_columns_board_pos (board_id, position)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS cards (
        id VARCHAR(64) PRIMARY KEY,
        board_id VARCHAR(64) NOT NULL,
        title VARCHAR(300) NOT NULL,
        details TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS card_positions (
        board_id VARCHAR(64) NOT NULL,
        column_id VARCHAR(64) NOT NULL,
        card_id VARCHAR(64) NOT NULL UNIQUE,
        position INT NOT NULL,
        PRIMARY KEY (board_id, card_id),
        FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
        FOREIGN KEY (column_id) REFERENCES `columns`(id) ON DELETE CASCADE,
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
        UNIQUE KEY uq_cardpos_col_pos (column_id, position),
        UNIQUE KEY uq_cardpos_col_card (column_id, card_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
]


def utc_now() -> datetime:
    """Naive UTC datetime, stored directly in DATETIME columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


@contextmanager
def connect() -> Iterator[Connection]:
    connection = pymysql.connect(**DB_CONFIG)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _one(connection: Connection, sql: str, params: tuple = ()) -> dict[str, Any] | None:
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchone()


def _all(connection: Connection, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        return list(cursor.fetchall())


def _exec(connection: Connection, sql: str, params: tuple = ()) -> int:
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.rowcount


def initialize_database() -> None:
    with connect() as connection:
        for statement in SCHEMA_STATEMENTS:
            _exec(connection, statement)
        _exec(
            connection,
            "INSERT IGNORE INTO schema_migrations(version, applied_at) VALUES (1, %s)",
            (utc_now(),),
        )
        existing = _one(
            connection, "SELECT id FROM users WHERE username = %s", (SEED_USERNAME,)
        )
        if existing is None:
            _seed_initial(connection)


def _seed_initial(connection: Connection) -> None:
    now = utc_now()
    _exec(
        connection,
        "INSERT INTO users(id, username, password_hash, created_at) VALUES (%s, %s, %s, %s)",
        ("user-gerardok17", SEED_USERNAME, hash_password(SEED_PASSWORD), now),
    )
    _exec(
        connection,
        "INSERT INTO boards(id, user_id, title, position, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s)",
        ("board-1", "user-gerardok17", "My Board", 0, now, now),
    )
    with connection.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO `columns`(id, board_id, title, position) VALUES (%s, 'board-1', %s, %s)",
            DEFAULT_COLUMNS,
        )


def authenticate(username: str, password: str) -> str | None:
    with connect() as connection:
        user = _one(
            connection,
            "SELECT username, password_hash FROM users WHERE username = %s",
            (username,),
        )
    if user is None or not verify_password(password, user["password_hash"]):
        return None
    return user["username"]


def board_id_for_user(connection: Connection, username: str) -> str:
    # Phase 1: a user still resolves to a single board (the first one). Phase 2
    # replaces these callers with explicit board_id + ownership checks.
    board = _one(
        connection,
        """
        SELECT boards.id FROM boards
        JOIN users ON users.id = boards.user_id
        WHERE users.username = %s
        ORDER BY boards.position, boards.created_at
        LIMIT 1
        """,
        (username,),
    )
    if board is None:
        raise ValueError("Board not found")
    return board["id"]


def get_board_for_user(username: str) -> dict[str, Any]:
    with connect() as connection:
        board = _one(
            connection,
            """
            SELECT boards.id, boards.title FROM boards
            JOIN users ON users.id = boards.user_id
            WHERE users.username = %s
            ORDER BY boards.position, boards.created_at
            LIMIT 1
            """,
            (username,),
        )
        if board is None:
            raise ValueError("Board not found")
        columns = _all(
            connection,
            "SELECT id, title FROM `columns` WHERE board_id = %s ORDER BY position",
            (board["id"],),
        )
        cards = _all(
            connection,
            "SELECT id, title, details FROM cards WHERE board_id = %s",
            (board["id"],),
        )
        positions = _all(
            connection,
            "SELECT column_id, card_id, position FROM card_positions WHERE board_id = %s ORDER BY position",
            (board["id"],),
        )

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


def rename_column(username: str, column_id: str, title: str) -> None:
    with connect() as connection:
        board_id = board_id_for_user(connection, username)
        changed = _exec(
            connection,
            "UPDATE `columns` SET title = %s WHERE id = %s AND board_id = %s",
            (title, column_id, board_id),
        )
        if changed == 0:
            raise ValueError("Column not found")
        _exec(
            connection,
            "UPDATE boards SET updated_at = %s WHERE id = %s",
            (utc_now(), board_id),
        )


def create_card(
    username: str, card_id: str, column_id: str, title: str, details: str
) -> None:
    with connect() as connection:
        board_id = board_id_for_user(connection, username)
        column = _one(
            connection,
            "SELECT id FROM `columns` WHERE id = %s AND board_id = %s",
            (column_id, board_id),
        )
        if column is None:
            raise ValueError("Column not found")
        existing_card = _one(
            connection, "SELECT id FROM cards WHERE id = %s", (card_id,)
        )
        if existing_card is not None:
            raise ValueError("Card ID already exists")
        now = utc_now()
        _exec(
            connection,
            "INSERT INTO cards(id, board_id, title, details, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s)",
            (card_id, board_id, title, details, now, now),
        )
        next_position = _one(
            connection,
            "SELECT COALESCE(MAX(position) + 1, 0) AS position FROM card_positions WHERE column_id = %s",
            (column_id,),
        )["position"]
        _exec(
            connection,
            "INSERT INTO card_positions(board_id, column_id, card_id, position) VALUES (%s, %s, %s, %s)",
            (board_id, column_id, card_id, next_position),
        )
        _exec(
            connection,
            "UPDATE boards SET updated_at = %s WHERE id = %s",
            (now, board_id),
        )


def update_card(username: str, card_id: str, title: str, details: str | None) -> None:
    with connect() as connection:
        board_id = board_id_for_user(connection, username)
        changed = _exec(
            connection,
            "UPDATE cards SET title = %s, details = %s, updated_at = %s WHERE id = %s AND board_id = %s",
            (title, details, utc_now(), card_id, board_id),
        )
        if changed == 0:
            raise ValueError("Card not found")
        _exec(
            connection,
            "UPDATE boards SET updated_at = %s WHERE id = %s",
            (utc_now(), board_id),
        )


def delete_card(username: str, card_id: str) -> None:
    with connect() as connection:
        board_id = board_id_for_user(connection, username)
        changed = _exec(
            connection,
            "DELETE FROM cards WHERE id = %s AND board_id = %s",
            (card_id, board_id),
        )
        if changed == 0:
            raise ValueError("Card not found")
        _exec(
            connection,
            "UPDATE boards SET updated_at = %s WHERE id = %s",
            (utc_now(), board_id),
        )
        normalize_positions(connection, board_id)


def move_card(username: str, card_id: str, column_id: str, position: int) -> None:
    with connect() as connection:
        board_id = board_id_for_user(connection, username)
        card = _one(
            connection,
            "SELECT card_id FROM card_positions WHERE card_id = %s AND board_id = %s",
            (card_id, board_id),
        )
        column = _one(
            connection,
            "SELECT id FROM `columns` WHERE id = %s AND board_id = %s",
            (column_id, board_id),
        )
        if card is None or column is None or position < 0:
            raise ValueError("Invalid card move")
        _exec(
            connection,
            "DELETE FROM card_positions WHERE card_id = %s AND board_id = %s",
            (card_id, board_id),
        )
        normalize_positions(connection, board_id)
        count = _one(
            connection,
            "SELECT COUNT(*) AS count FROM card_positions WHERE column_id = %s",
            (column_id,),
        )["count"]
        insert_position = min(position, count)
        # Large-offset shuffle to sidestep the UNIQUE(column_id, position)
        # constraint mid-update, then normalize back to contiguous positions.
        _exec(
            connection,
            "UPDATE card_positions SET position = position + 1000000 WHERE column_id = %s AND position >= %s",
            (column_id, insert_position),
        )
        _exec(
            connection,
            "UPDATE card_positions SET position = position - 999999 WHERE column_id = %s AND position >= %s",
            (column_id, insert_position + 1000000),
        )
        _exec(
            connection,
            "INSERT INTO card_positions(board_id, column_id, card_id, position) VALUES (%s, %s, %s, %s)",
            (board_id, column_id, card_id, insert_position),
        )
        normalize_positions(connection, board_id)
        _exec(
            connection,
            "UPDATE boards SET updated_at = %s WHERE id = %s",
            (utc_now(), board_id),
        )


def normalize_positions(connection: Connection, board_id: str) -> None:
    columns = _all(
        connection, "SELECT id FROM `columns` WHERE board_id = %s", (board_id,)
    )
    for column in columns:
        ordered = _all(
            connection,
            "SELECT card_id FROM card_positions WHERE column_id = %s ORDER BY position",
            (column["id"],),
        )
        for position, card in enumerate(ordered):
            _exec(
                connection,
                "UPDATE card_positions SET position = %s WHERE board_id = %s AND card_id = %s",
                (position, board_id, card["card_id"]),
            )
