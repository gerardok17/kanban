import os
from contextlib import contextmanager
from datetime import datetime, timezone
from secrets import token_urlsafe
from typing import Any, Iterator

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

# Bootstrap allowlist email for the seed user, read from the environment so the
# public repo never carries credentials. The app is Google-only, so a seed user
# only makes sense with an allowlist email; unset means no user is seeded (and no
# default, previously guessable, account ever ships).
SEED_EMAIL = os.getenv("SEED_EMAIL", "").strip()

# App-level roles (who administers users) — separate from any future per-board
# permissions.
USER_ROLES = ("admin", "user")


class OwnerOnlyError(Exception):
    """The user can open the board, but only its owner may do this."""


class ShareError(Exception):
    """A share request that cannot be applied; the message is shown to the user."""


class LabelError(Exception):
    """A label change that cannot be applied; the message is shown to the user."""


# Label colors, in the order labels are listed. A board uses each color once,
# so it has at most eight labels. Only the key is stored; the UI owns the hex.
LABEL_COLORS = ("blue", "green", "yellow", "red", "gray", "purple", "pink", "orange")

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
    # Migration v2: a completed card is archived off the board. `completed_at`
    # NULL means active; a timestamp means completed (and its card_positions row
    # is removed so it no longer appears in any column).
    """
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL
    """,
    # Migration v3: move toward "Sign in with Google" (OIDC). `email` is the
    # allowlist key for Google login; `password_hash` becomes nullable so a
    # future google-only user can exist without a local password. Additive and
    # backward-compatible — the existing password login keeps working.
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL
    """,
    """
    ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL
    """,
    """
    ALTER TABLE users ADD UNIQUE INDEX IF NOT EXISTS uq_users_email (email)
    """,
    # Migration v4: app-level roles. `admin` manages users; `user` only uses the
    # boards. Existing and new users default to `user`; the first user is made
    # an admin on every startup (see initialize_database).
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'user'
    """,
    # Migration v5: shared boards. `boards.user_id` stays the one owner; this
    # table only lists the other users a board is shared with.
    """
    CREATE TABLE IF NOT EXISTS board_shares (
        board_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (board_id, user_id),
        FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_board_shares_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    # Migration v6: who created each card. NULL once that user is deleted (the
    # card stays on its board). Existing cards are backfilled once, in
    # initialize_database.
    """
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS created_by VARCHAR(64) NULL
    """,
    """
    ALTER TABLE cards ADD CONSTRAINT fk_cards_created_by FOREIGN KEY IF NOT EXISTS (created_by)
        REFERENCES users(id) ON DELETE SET NULL
    """,
    # Migration v7: labels. Each board has its own; a color is used at most once
    # per board. `card_labels` holds which labels each card carries.
    """
    CREATE TABLE IF NOT EXISTS labels (
        id VARCHAR(64) PRIMARY KEY,
        board_id VARCHAR(64) NOT NULL,
        name VARCHAR(64) NOT NULL,
        color VARCHAR(16) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
        UNIQUE KEY uq_labels_board_color (board_id, color)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS card_labels (
        card_id VARCHAR(64) NOT NULL,
        label_id VARCHAR(64) NOT NULL,
        PRIMARY KEY (card_id, label_id),
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
        FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE,
        INDEX idx_card_labels_label (label_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
]


def utc_now() -> datetime:
    """Naive UTC datetime, stored directly in DATETIME columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso_utc(value: datetime | None) -> str | None:
    """ISO string for a stored (naive UTC) DATETIME. The explicit offset matters:
    browsers read an ISO string without one as local time."""
    return value.replace(tzinfo=timezone.utc).isoformat() if value else None


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
        _exec(
            connection,
            "INSERT IGNORE INTO schema_migrations(version, applied_at) VALUES (2, %s)",
            (utc_now(),),
        )
        _exec(
            connection,
            "INSERT IGNORE INTO schema_migrations(version, applied_at) VALUES (3, %s)",
            (utc_now(),),
        )
        _exec(
            connection,
            "INSERT IGNORE INTO schema_migrations(version, applied_at) VALUES (4, %s)",
            (utc_now(),),
        )
        _exec(
            connection,
            "INSERT IGNORE INTO schema_migrations(version, applied_at) VALUES (5, %s)",
            (utc_now(),),
        )
        # v6 credits existing cards to their board's owner, the only one who could
        # add cards before boards were shared. It runs once: afterwards a NULL
        # creator means that user was deleted, so it must never be refilled.
        if _one(connection, "SELECT version FROM schema_migrations WHERE version = 6") is None:
            _exec(
                connection,
                """
                UPDATE cards JOIN boards ON boards.id = cards.board_id
                SET cards.created_by = boards.user_id
                WHERE cards.created_by IS NULL
                """,
            )
            _exec(
                connection,
                "INSERT INTO schema_migrations(version, applied_at) VALUES (6, %s)",
                (utc_now(),),
            )
        _exec(
            connection,
            "INSERT IGNORE INTO schema_migrations(version, applied_at) VALUES (7, %s)",
            (utc_now(),),
        )
        # Seed a single Google-only owner, keyed on the allowlist email. No user
        # is seeded without SEED_EMAIL, so the public repo never ships a default
        # (previously guessable) account. Keyed on email — not a username — so an
        # already-seeded database (e.g. production) is recognised and never
        # re-seeded, and no local password is ever created.
        if SEED_EMAIL:
            existing = _one(
                connection,
                "SELECT id FROM users WHERE LOWER(email) = %s",
                (SEED_EMAIL.lower(),),
            )
            if existing is None:
                _seed_initial(connection, SEED_EMAIL)
        # The first user is the owner: always an admin (restored here on every
        # start, so the owner can never be locked out) and never deletable.
        first_user_id = _first_user_id(connection)
        if first_user_id is not None:
            _exec(connection, "UPDATE users SET role = 'admin' WHERE id = %s", (first_user_id,))


def _seed_initial(connection: Connection, email: str) -> None:
    """Seed the first owner as a Google-only user (no local password) plus an
    empty starter board — mirrors create_allowlisted_user for the bootstrap user."""
    now = utc_now()
    normalized = email.strip().lower()
    user_id = f"user-{token_urlsafe(12)}"
    _exec(
        connection,
        "INSERT INTO users(id, username, password_hash, email, created_at) VALUES (%s, %s, NULL, %s, %s)",
        (user_id, normalized, normalized, now),
    )
    board_id = f"board-{token_urlsafe(12)}"
    _exec(
        connection,
        "INSERT INTO boards(id, user_id, title, position, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s)",
        (board_id, user_id, "My Board", 0, now, now),
    )
    with connection.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO `columns`(id, board_id, title, position) VALUES (%s, %s, %s, %s)",
            [
                (f"{board_id}-{col_id}", board_id, col_title, col_pos)
                for col_id, col_title, col_pos in DEFAULT_COLUMNS
            ],
        )


def list_users() -> list[dict[str, Any]]:
    # Ordered by creation so the row index is stable and the seed user is always
    # first (row 1) — the UI shows the index instead of the DB id, and the first
    # user is protected from deletion.
    with connect() as connection:
        users = _all(
            connection,
            "SELECT id, username, email, role, created_at FROM users ORDER BY created_at, username",
        )
    return [
        {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
            "created_at": iso_utc(user["created_at"]),
        }
        for user in users
    ]


def _first_user_id(connection: Connection) -> str | None:
    """The oldest user — protected from deletion (matches the UI's first row)."""
    row = _one(
        connection,
        "SELECT id FROM users ORDER BY created_at, username LIMIT 1",
    )
    return row["id"] if row else None


def user_for_email(email: str) -> str | None:
    """Username for an allowlisted email (case-insensitive), or None if the email
    is not on the allowlist. Backs the Google (OIDC) sign-in check."""
    normalized = email.strip().lower()
    if not normalized:
        return None
    with connect() as connection:
        row = _one(
            connection,
            "SELECT username FROM users WHERE LOWER(email) = %s",
            (normalized,),
        )
    return row["username"] if row else None


def email_for_username(username: str) -> str | None:
    """The allowlist email for a signed-in username, for display in the UI."""
    with connect() as connection:
        row = _one(
            connection,
            "SELECT email FROM users WHERE username = %s",
            (username,),
        )
    return row["email"] if row and row["email"] else None


def role_for_username(username: str) -> str | None:
    """The app role of a signed-in username, or None if the user no longer exists."""
    with connect() as connection:
        row = _one(connection, "SELECT role FROM users WHERE username = %s", (username,))
    return row["role"] if row else None


def create_allowlisted_user(user_id: str, email: str, role: str = "user") -> None:
    """Add an email to the allowlist. The user signs in with Google only, so no
    password is stored; username mirrors the email so board ownership works, and
    a starter board is created just like the seed user."""
    normalized = email.strip().lower()
    with connect() as connection:
        existing = _one(
            connection,
            "SELECT id FROM users WHERE LOWER(email) = %s OR username = %s",
            (normalized, normalized),
        )
        if existing is not None:
            raise ValueError("Email already exists")
        now = utc_now()
        _exec(
            connection,
            "INSERT INTO users(id, username, password_hash, email, role, created_at) VALUES (%s, %s, NULL, %s, %s, %s)",
            (user_id, normalized, normalized, role, now),
        )
        board_id = f"board-{token_urlsafe(12)}"
        _exec(
            connection,
            "INSERT INTO boards(id, user_id, title, position, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s)",
            (board_id, user_id, "My Board", 0, now, now),
        )
        with connection.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO `columns`(id, board_id, title, position) VALUES (%s, %s, %s, %s)",
                [
                    (f"{board_id}-{col_id}", board_id, col_title, col_pos)
                    for col_id, col_title, col_pos in DEFAULT_COLUMNS
                ],
            )


def set_user_role(user_id: str, role: str) -> None:
    with connect() as connection:
        target = _one(connection, "SELECT id FROM users WHERE id = %s", (user_id,))
        if target is None:
            raise ValueError("User not found")
        if user_id == _first_user_id(connection) and role != "admin":
            raise ValueError("The first user is always an admin")
        _exec(connection, "UPDATE users SET role = %s WHERE id = %s", (role, user_id))


def delete_user(user_id: str) -> str:
    """Delete a user and return their username (so their sessions can be revoked)."""
    with connect() as connection:
        target = _one(connection, "SELECT id, username FROM users WHERE id = %s", (user_id,))
        if target is None:
            raise ValueError("User not found")
        if user_id == _first_user_id(connection):
            raise ValueError("The first user cannot be deleted")
        # Boards (and their columns/cards) cascade-delete via the FK.
        _exec(connection, "DELETE FROM users WHERE id = %s", (user_id,))
    return target["username"]


# --- Access helpers --------------------------------------------------------
# Every read and mutation resolves the affected board from the target entity and
# confirms the signed-in user may open it, so client-supplied IDs are never
# trusted. A user may open a board they own or one shared with them; only the
# owner may share it, rename it, or delete it.

# SQL predicate over a joined `boards` row and the signed-in `users` row.
_CAN_OPEN_BOARD = """(
    boards.user_id = users.id
    OR EXISTS (
        SELECT 1 FROM board_shares
        WHERE board_shares.board_id = boards.id AND board_shares.user_id = users.id
    )
)"""


def _user_id(connection: Connection, username: str) -> str:
    row = _one(connection, "SELECT id FROM users WHERE username = %s", (username,))
    if row is None:
        raise ValueError("User not found")
    return row["id"]


def board_id_for_user(connection: Connection, username: str) -> str:
    """The user's first board — backs the legacy GET /api/board default."""
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


def _is_board_owner(connection: Connection, username: str, board_id: str) -> bool:
    """Whether the user owns the board; raises ValueError if they cannot open it."""
    row = _one(
        connection,
        f"""
        SELECT boards.user_id = users.id AS is_owner FROM boards
        JOIN users ON users.username = %s
        WHERE boards.id = %s AND {_CAN_OPEN_BOARD}
        """,
        (username, board_id),
    )
    if row is None:
        raise ValueError("Board not found")
    return bool(row["is_owner"])


def _assert_board_access(connection: Connection, username: str, board_id: str) -> None:
    _is_board_owner(connection, username, board_id)


def _assert_board_owner(connection: Connection, username: str, board_id: str) -> None:
    if not _is_board_owner(connection, username, board_id):
        raise OwnerOnlyError("Only the board's owner can do that")


def _board_id_for_column(connection: Connection, username: str, column_id: str) -> str:
    row = _one(
        connection,
        f"""
        SELECT `columns`.board_id FROM `columns`
        JOIN boards ON boards.id = `columns`.board_id
        JOIN users ON users.username = %s
        WHERE `columns`.id = %s AND {_CAN_OPEN_BOARD}
        """,
        (username, column_id),
    )
    if row is None:
        raise ValueError("Column not found")
    return row["board_id"]


def _board_id_for_card(connection: Connection, username: str, card_id: str) -> str:
    row = _one(
        connection,
        f"""
        SELECT cards.board_id FROM cards
        JOIN boards ON boards.id = cards.board_id
        JOIN users ON users.username = %s
        WHERE cards.id = %s AND {_CAN_OPEN_BOARD}
        """,
        (username, card_id),
    )
    if row is None:
        raise ValueError("Card not found")
    return row["board_id"]


# --- Board CRUD ------------------------------------------------------------


def list_boards(username: str) -> list[dict[str, Any]]:
    """The boards the user can open: their own first, then those shared with them."""
    with connect() as connection:
        boards = _all(
            connection,
            f"""
            SELECT boards.id, boards.title, boards.position,
                boards.user_id = users.id AS is_owner,
                COALESCE(owners.email, owners.username) AS owner_email
            FROM boards
            JOIN users ON users.username = %s
            JOIN users AS owners ON owners.id = boards.user_id
            WHERE {_CAN_OPEN_BOARD}
            ORDER BY is_owner DESC, boards.position, boards.created_at
            """,
            (username,),
        )
    return [
        {
            "id": b["id"],
            "title": b["title"],
            "position": b["position"],
            "isOwner": bool(b["is_owner"]),
            "ownerEmail": b["owner_email"],
        }
        for b in boards
    ]


def create_board(username: str, board_id: str, title: str) -> str:
    with connect() as connection:
        user_id = _user_id(connection, username)
        now = utc_now()
        next_position = _one(
            connection,
            "SELECT COALESCE(MAX(position) + 1, 0) AS position FROM boards WHERE user_id = %s",
            (user_id,),
        )["position"]
        _exec(
            connection,
            "INSERT INTO boards(id, user_id, title, position, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s)",
            (board_id, user_id, title, next_position, now, now),
        )
        with connection.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO `columns`(id, board_id, title, position) VALUES (%s, %s, %s, %s)",
                [
                    (f"{board_id}-{col_id}", board_id, col_title, col_pos)
                    for col_id, col_title, col_pos in DEFAULT_COLUMNS
                ],
            )
    return board_id


def rename_board(username: str, board_id: str, title: str) -> None:
    with connect() as connection:
        _assert_board_owner(connection, username, board_id)
        _exec(
            connection,
            "UPDATE boards SET title = %s, updated_at = %s WHERE id = %s",
            (title, utc_now(), board_id),
        )


def delete_board(username: str, board_id: str) -> None:
    with connect() as connection:
        _assert_board_owner(connection, username, board_id)
        # Only an empty board can go; its completed (archived) cards go with it.
        active_cards = _one(
            connection,
            "SELECT COUNT(*) AS count FROM cards WHERE board_id = %s AND completed_at IS NULL",
            (board_id,),
        )["count"]
        if active_cards:
            raise ValueError("Only a board without cards can be deleted")
        remaining = _one(
            connection,
            """
            SELECT COUNT(*) AS count FROM boards
            JOIN users ON users.id = boards.user_id
            WHERE users.username = %s
            """,
            (username,),
        )["count"]
        if remaining <= 1:
            raise ValueError("Cannot delete the only board")
        _exec(connection, "DELETE FROM boards WHERE id = %s", (board_id,))


# --- Board sharing ---------------------------------------------------------


def _board_members(connection: Connection, board_id: str) -> list[dict[str, Any]]:
    """Everyone who can open the board: the owner first, then shares by date."""
    rows = _all(
        connection,
        """
        SELECT users.id, COALESCE(users.email, users.username) AS email,
            1 AS is_owner, boards.created_at AS since
        FROM boards JOIN users ON users.id = boards.user_id
        WHERE boards.id = %s
        UNION ALL
        SELECT users.id, COALESCE(users.email, users.username) AS email,
            0 AS is_owner, board_shares.created_at AS since
        FROM board_shares JOIN users ON users.id = board_shares.user_id
        WHERE board_shares.board_id = %s
        ORDER BY is_owner DESC, since
        """,
        (board_id, board_id),
    )
    return [
        {"id": row["id"], "email": row["email"], "isOwner": bool(row["is_owner"])}
        for row in rows
    ]


def list_board_members(username: str, board_id: str) -> list[dict[str, Any]]:
    with connect() as connection:
        _assert_board_access(connection, username, board_id)
        return _board_members(connection, board_id)


def share_board(username: str, board_id: str, email: str) -> list[dict[str, Any]]:
    """Share a board with an existing user, by email. Owner only."""
    normalized = email.strip().lower()
    with connect() as connection:
        _assert_board_owner(connection, username, board_id)
        target = _one(connection, "SELECT id FROM users WHERE LOWER(email) = %s", (normalized,))
        if target is None:
            raise ShareError(
                "This email hasn't been added as a user yet. Only an admin can add users."
            )
        owner = _one(connection, "SELECT user_id FROM boards WHERE id = %s", (board_id,))
        if target["id"] == owner["user_id"]:
            raise ShareError("You already own this board.")
        existing = _one(
            connection,
            "SELECT board_id FROM board_shares WHERE board_id = %s AND user_id = %s",
            (board_id, target["id"]),
        )
        if existing is not None:
            raise ShareError("This board is already shared with that email.")
        _exec(
            connection,
            "INSERT INTO board_shares(board_id, user_id, created_at) VALUES (%s, %s, %s)",
            (board_id, target["id"], utc_now()),
        )
        return _board_members(connection, board_id)


def unshare_board(username: str, board_id: str, user_id: str) -> list[dict[str, Any]]:
    """Stop sharing a board with a user. Owner only."""
    with connect() as connection:
        _assert_board_owner(connection, username, board_id)
        removed = _exec(
            connection,
            "DELETE FROM board_shares WHERE board_id = %s AND user_id = %s",
            (board_id, user_id),
        )
        if not removed:
            raise ValueError("This board is not shared with that user")
        return _board_members(connection, board_id)


# --- Labels ----------------------------------------------------------------
# Everyone who can open a board manages its labels, owner or not.


def _board_labels(connection: Connection, board_id: str) -> list[dict[str, Any]]:
    """The board's labels in palette order, with how many cards carry each."""
    rows = _all(
        connection,
        """
        SELECT labels.id, labels.name, labels.color, COUNT(card_labels.card_id) AS card_count
        FROM labels
        LEFT JOIN card_labels ON card_labels.label_id = labels.id
        WHERE labels.board_id = %s
        GROUP BY labels.id, labels.name, labels.color
        """,
        (board_id,),
    )
    rows.sort(key=lambda row: LABEL_COLORS.index(row["color"]))
    return [
        {"id": row["id"], "name": row["name"], "color": row["color"], "cardCount": row["card_count"]}
        for row in rows
    ]


def _assert_color_free(
    connection: Connection, board_id: str, color: str, label_id: str | None = None
) -> None:
    """A color belongs to one label per board; the label being edited keeps its own."""
    taken = _one(
        connection,
        "SELECT id FROM labels WHERE board_id = %s AND color = %s",
        (board_id, color),
    )
    if taken is not None and taken["id"] != label_id:
        raise LabelError("That color is already used on this board.")


def list_labels(username: str, board_id: str) -> list[dict[str, Any]]:
    with connect() as connection:
        _assert_board_access(connection, username, board_id)
        return _board_labels(connection, board_id)


def create_label(username: str, board_id: str, name: str, color: str) -> list[dict[str, Any]]:
    with connect() as connection:
        _assert_board_access(connection, username, board_id)
        _assert_color_free(connection, board_id, color)
        _exec(
            connection,
            "INSERT INTO labels(id, board_id, name, color, created_at) VALUES (%s, %s, %s, %s, %s)",
            (f"label-{token_urlsafe(12)}", board_id, name, color, utc_now()),
        )
        return _board_labels(connection, board_id)


def update_label(
    username: str, board_id: str, label_id: str, name: str, color: str
) -> list[dict[str, Any]]:
    with connect() as connection:
        _assert_board_access(connection, username, board_id)
        label = _one(
            connection,
            "SELECT id FROM labels WHERE id = %s AND board_id = %s",
            (label_id, board_id),
        )
        if label is None:
            raise ValueError("Label not found")
        _assert_color_free(connection, board_id, color, label_id)
        _exec(
            connection,
            "UPDATE labels SET name = %s, color = %s WHERE id = %s",
            (name, color, label_id),
        )
        return _board_labels(connection, board_id)


def delete_label(username: str, board_id: str, label_id: str) -> list[dict[str, Any]]:
    """Delete a label; the cards that carry it lose it (card_labels cascades)."""
    with connect() as connection:
        _assert_board_access(connection, username, board_id)
        removed = _exec(
            connection,
            "DELETE FROM labels WHERE id = %s AND board_id = %s",
            (label_id, board_id),
        )
        if not removed:
            raise ValueError("Label not found")
        return _board_labels(connection, board_id)


# --- Board read ------------------------------------------------------------


def get_board_for_user(username: str) -> dict[str, Any]:
    with connect() as connection:
        board_id = board_id_for_user(connection, username)
        return _read_board(connection, board_id)


def get_board(username: str, board_id: str) -> dict[str, Any]:
    with connect() as connection:
        _assert_board_access(connection, username, board_id)
        return _read_board(connection, board_id)


def _read_board(connection: Connection, board_id: str) -> dict[str, Any]:
    board = _one(connection, "SELECT id, title FROM boards WHERE id = %s", (board_id,))
    columns = _all(
        connection,
        "SELECT id, title FROM `columns` WHERE board_id = %s ORDER BY position",
        (board_id,),
    )
    cards = _all(
        connection,
        """
        SELECT cards.id, cards.title, cards.details, cards.created_at,
            COALESCE(creators.email, creators.username) AS created_by
        FROM cards
        LEFT JOIN users AS creators ON creators.id = cards.created_by
        WHERE cards.board_id = %s AND cards.completed_at IS NULL
        """,
        (board_id,),
    )
    completed = _all(
        connection,
        """
        SELECT id, title, completed_at FROM cards
        WHERE board_id = %s AND completed_at IS NOT NULL
        ORDER BY completed_at DESC
        """,
        (board_id,),
    )
    positions = _all(
        connection,
        "SELECT column_id, card_id, position FROM card_positions WHERE board_id = %s ORDER BY position",
        (board_id,),
    )
    card_labels = _all(
        connection,
        """
        SELECT card_labels.card_id, card_labels.label_id FROM card_labels
        JOIN cards ON cards.id = card_labels.card_id
        WHERE cards.board_id = %s AND cards.completed_at IS NULL
        """,
        (board_id,),
    )

    card_ids_by_column: dict[str, list[str]] = {column["id"]: [] for column in columns}
    for position in positions:
        card_ids_by_column[position["column_id"]].append(position["card_id"])
    label_ids_by_card: dict[str, list[str]] = {card["id"]: [] for card in cards}
    for card_label in card_labels:
        label_ids_by_card[card_label["card_id"]].append(card_label["label_id"])

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
                # The creator's email; None once that user is deleted.
                "createdBy": card["created_by"],
                "createdAt": iso_utc(card["created_at"]),
                "labelIds": label_ids_by_card[card["id"]],
            }
            for card in cards
        },
        "labels": _board_labels(connection, board_id),
        "completed": [
            {
                "id": card["id"],
                "title": card["title"],
                "completedAt": iso_utc(card["completed_at"]),
            }
            for card in completed
        ],
    }


# --- Column / card mutations (return the affected board id) ----------------


def rename_column(username: str, column_id: str, title: str) -> str:
    with connect() as connection:
        board_id = _board_id_for_column(connection, username, column_id)
        _exec(
            connection,
            "UPDATE `columns` SET title = %s WHERE id = %s AND board_id = %s",
            (title, column_id, board_id),
        )
        _exec(
            connection,
            "UPDATE boards SET updated_at = %s WHERE id = %s",
            (utc_now(), board_id),
        )
    return board_id


def _set_card_labels(
    connection: Connection, board_id: str, card_id: str, label_ids: list[str]
) -> None:
    """Replace a card's labels; each one must be a label of the card's board."""
    wanted = set(label_ids)
    if wanted:
        placeholders = ", ".join(["%s"] * len(wanted))
        found = _one(
            connection,
            f"SELECT COUNT(*) AS count FROM labels WHERE board_id = %s AND id IN ({placeholders})",
            (board_id, *wanted),
        )["count"]
        if found != len(wanted):
            raise ValueError("Label not found")
    _exec(connection, "DELETE FROM card_labels WHERE card_id = %s", (card_id,))
    with connection.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO card_labels(card_id, label_id) VALUES (%s, %s)",
            [(card_id, label_id) for label_id in wanted],
        )


def create_card(
    username: str,
    card_id: str,
    column_id: str,
    title: str,
    details: str,
    label_ids: list[str] | None = None,
) -> str:
    with connect() as connection:
        board_id = _board_id_for_column(connection, username, column_id)
        existing_card = _one(
            connection, "SELECT id FROM cards WHERE id = %s", (card_id,)
        )
        if existing_card is not None:
            raise ValueError("Card ID already exists")
        now = utc_now()
        _exec(
            connection,
            """
            INSERT INTO cards(id, board_id, title, details, created_by, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (card_id, board_id, title, details, _user_id(connection, username), now, now),
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
        if label_ids:
            _set_card_labels(connection, board_id, card_id, label_ids)
        _exec(
            connection,
            "UPDATE boards SET updated_at = %s WHERE id = %s",
            (now, board_id),
        )
    return board_id


def update_card(
    username: str,
    card_id: str,
    title: str,
    details: str | None,
    column_id: str | None = None,
    label_ids: list[str] | None = None,
) -> str:
    with connect() as connection:
        board_id = _board_id_for_card(connection, username, card_id)
        _exec(
            connection,
            "UPDATE cards SET title = %s, details = %s, updated_at = %s WHERE id = %s AND board_id = %s",
            (title, details, utc_now(), card_id, board_id),
        )
        # A new status moves the card to the end of that column; its current
        # column keeps the card where it is.
        if column_id is not None:
            current = _one(
                connection, "SELECT column_id FROM card_positions WHERE card_id = %s", (card_id,)
            )
            if current is None or current["column_id"] != column_id:
                _place_card(connection, board_id, card_id, column_id)
        # None keeps the card's labels; a list replaces them.
        if label_ids is not None:
            _set_card_labels(connection, board_id, card_id, label_ids)
        _exec(
            connection,
            "UPDATE boards SET updated_at = %s WHERE id = %s",
            (utc_now(), board_id),
        )
    return board_id


def delete_card(username: str, card_id: str) -> str:
    with connect() as connection:
        board_id = _board_id_for_card(connection, username, card_id)
        _exec(
            connection,
            "DELETE FROM cards WHERE id = %s AND board_id = %s",
            (card_id, board_id),
        )
        _exec(
            connection,
            "UPDATE boards SET updated_at = %s WHERE id = %s",
            (utc_now(), board_id),
        )
        normalize_positions(connection, board_id)
    return board_id


def complete_card(username: str, card_id: str) -> str:
    """Archive a card off the board: stamp completed_at and drop its position so
    it leaves every column. One-way; the card survives only in dashboard stats."""
    with connect() as connection:
        board_id = _board_id_for_card(connection, username, card_id)
        now = utc_now()
        _exec(
            connection,
            """
            UPDATE cards SET completed_at = %s, updated_at = %s
            WHERE id = %s AND board_id = %s AND completed_at IS NULL
            """,
            (now, now, card_id, board_id),
        )
        _exec(
            connection,
            "DELETE FROM card_positions WHERE card_id = %s AND board_id = %s",
            (card_id, board_id),
        )
        normalize_positions(connection, board_id)
        _exec(
            connection,
            "UPDATE boards SET updated_at = %s WHERE id = %s",
            (now, board_id),
        )
    return board_id


def move_card(username: str, card_id: str, column_id: str, position: int) -> str:
    with connect() as connection:
        board_id = _board_id_for_card(connection, username, card_id)
        _place_card(connection, board_id, card_id, column_id, position)
        _exec(
            connection,
            "UPDATE boards SET updated_at = %s WHERE id = %s",
            (utc_now(), board_id),
        )
    return board_id


def _place_card(
    connection: Connection, board_id: str, card_id: str, column_id: str, position: int | None = None
) -> None:
    """Put a card at `position` in a column of its board; None means at the end."""
    column = _one(
        connection,
        "SELECT id FROM `columns` WHERE id = %s AND board_id = %s",
        (column_id, board_id),
    )
    if column is None or (position is not None and position < 0):
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
    insert_position = count if position is None else min(position, count)
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
