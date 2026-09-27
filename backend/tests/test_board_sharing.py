import os
from secrets import token_hex

import pymysql
import pytest
from fastapi.testclient import TestClient

from app import database
from app.main import app, sessions

# Board access is enforced in SQL, so these tests run against a real MariaDB: a
# disposable database created here and dropped at the end. Inside the dev stack:
#   docker exec kanban-backend-1 sh -c "cd /app/backend && \
#     KANBAN_TEST_DATABASE=kanbanpmdb_test python -m pytest -q tests/test_board_sharing.py"
TEST_DATABASE = os.getenv("KANBAN_TEST_DATABASE", "")
if not TEST_DATABASE:
    pytest.skip("Set KANBAN_TEST_DATABASE to run the MariaDB tests.", allow_module_level=True)
# The database is dropped afterwards, so refuse anything that is not clearly a
# throwaway test database.
if not TEST_DATABASE.endswith("_test") or TEST_DATABASE == database.DB_CONFIG["database"]:
    pytest.exit(f"Refusing to use {TEST_DATABASE!r}: the name must end in _test.", returncode=2)

client = TestClient(app)  # no lifespan: the fixture below initialises the database


@pytest.fixture(scope="module", autouse=True)
def test_database():
    server = {key: value for key, value in database.DB_CONFIG.items() if key != "database"}
    connection = pymysql.connect(**server)
    with connection.cursor() as cursor:
        cursor.execute(f"DROP DATABASE IF EXISTS `{TEST_DATABASE}`")
        cursor.execute(f"CREATE DATABASE `{TEST_DATABASE}` CHARACTER SET utf8mb4")
    original = database.DB_CONFIG["database"]
    database.DB_CONFIG["database"] = TEST_DATABASE
    database.initialize_database()
    yield
    database.DB_CONFIG["database"] = original
    with connection.cursor() as cursor:
        cursor.execute(f"DROP DATABASE IF EXISTS `{TEST_DATABASE}`")
    connection.close()
    sessions.clear()


def make_user(name: str) -> str:
    """An allowlisted user with a starter board, signed in; returns their username."""
    email = f"{name}-{token_hex(4)}@example.com"
    database.create_allowlisted_user(f"user-{token_hex(8)}", email)
    sessions[email] = email  # the session token is the username, for readability
    return email


def as_user(username: str) -> None:
    client.cookies.set("session", username)


def own_board(username: str) -> str:
    as_user(username)
    return next(board["id"] for board in client.get("/api/boards").json() if board["isOwner"])


def member_id(board_id: str, email: str) -> str:
    return next(m["id"] for m in client.get(f"/api/boards/{board_id}/members").json() if m["email"] == email)


def add_card(board_id: str, title: str) -> str:
    board = client.post(
        "/api/board/cards", json={"columnId": f"{board_id}-col-backlog", "title": title}
    ).json()
    return next(card_id for card_id, card in board["cards"].items() if card["title"] == title)


def test_a_board_is_private_until_shared() -> None:
    owner, stranger = make_user("owner"), make_user("stranger")
    board_id = own_board(owner)

    as_user(stranger)
    assert board_id not in [board["id"] for board in client.get("/api/boards").json()]
    assert client.get(f"/api/boards/{board_id}").status_code == 404
    assert client.get(f"/api/boards/{board_id}/members").status_code == 404
    response = client.post(
        "/api/board/cards", json={"columnId": f"{board_id}-col-backlog", "title": "Sneaky"}
    )
    assert response.status_code == 404


def test_the_owner_shares_by_email_and_the_member_works_on_the_board() -> None:
    owner, member = make_user("owner"), make_user("member")
    board_id = own_board(owner)

    response = client.post(f"/api/boards/{board_id}/members", json={"email": member.upper()})
    assert response.status_code == 201
    assert [(m["email"], m["isOwner"]) for m in response.json()] == [(owner, True), (member, False)]

    as_user(member)
    shared = next(board for board in client.get("/api/boards").json() if board["id"] == board_id)
    assert shared["isOwner"] is False
    assert shared["ownerEmail"] == owner
    assert client.get(f"/api/boards/{board_id}").status_code == 200

    card_id = add_card(board_id, "Member card")
    assert client.patch(f"/api/board/cards/{card_id}", json={"title": "Edited"}).status_code == 200
    move = {"columnId": f"{board_id}-col-progress", "position": 0}
    assert client.post(f"/api/board/cards/{card_id}/move", json=move).status_code == 200
    rename = client.patch(f"/api/board/columns/{board_id}-col-backlog", json={"title": "Ideas"})
    assert rename.status_code == 200
    assert client.post(f"/api/board/cards/{card_id}/complete").status_code == 200
    other_id = add_card(board_id, "Another")
    assert client.delete(f"/api/board/cards/{other_id}").status_code == 200


def test_only_the_owner_manages_the_board() -> None:
    owner, member, third = make_user("owner"), make_user("member"), make_user("third")
    board_id = own_board(owner)
    client.post(f"/api/boards/{board_id}/members", json={"email": member})
    member_user_id = member_id(board_id, member)

    as_user(member)
    assert client.post(f"/api/boards/{board_id}/members", json={"email": third}).status_code == 403
    assert client.delete(f"/api/boards/{board_id}/members/{member_user_id}").status_code == 403
    assert client.patch(f"/api/boards/{board_id}", json={"title": "Mine now"}).status_code == 403
    assert client.delete(f"/api/boards/{board_id}").status_code == 403
    assert client.get(f"/api/boards/{board_id}").status_code == 200


def test_share_requests_are_validated() -> None:
    owner, member, stranger = make_user("owner"), make_user("member"), make_user("stranger")
    board_id = own_board(owner)
    members_url = f"/api/boards/{board_id}/members"

    unknown = client.post(members_url, json={"email": "nobody@example.com"})
    assert unknown.status_code == 422
    assert unknown.json()["detail"] == (
        "This email hasn't been added as a user yet. Only an admin can add users."
    )
    assert client.post(members_url, json={"email": owner}).json()["detail"] == "You already own this board."
    assert client.post(members_url, json={"email": member}).status_code == 201
    duplicate = client.post(members_url, json={"email": member})
    assert duplicate.status_code == 422
    assert duplicate.json()["detail"] == "This board is already shared with that email."

    # Someone who cannot open the board learns nothing about it.
    as_user(stranger)
    assert client.post(members_url, json={"email": stranger}).status_code == 404


def test_unsharing_removes_access() -> None:
    owner, member = make_user("owner"), make_user("member")
    board_id = own_board(owner)
    client.post(f"/api/boards/{board_id}/members", json={"email": member})
    member_user_id = member_id(board_id, member)

    response = client.delete(f"/api/boards/{board_id}/members/{member_user_id}")
    assert response.status_code == 200
    assert [m["email"] for m in response.json()] == [owner]
    assert client.delete(f"/api/boards/{board_id}/members/{member_user_id}").status_code == 404

    as_user(member)
    assert board_id not in [board["id"] for board in client.get("/api/boards").json()]
    assert client.get(f"/api/boards/{board_id}").status_code == 404


def test_only_a_board_without_active_cards_can_be_deleted() -> None:
    owner = make_user("owner")
    as_user(owner)
    board_id = client.post("/api/boards", json={"title": "Temporary"}).json()["id"]
    card_id = add_card(board_id, "Still active")

    blocked = client.delete(f"/api/boards/{board_id}")
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Only a board without cards can be deleted"

    # Completed (archived) cards do not block deletion; they go with the board.
    client.post(f"/api/board/cards/{card_id}/complete")
    assert client.delete(f"/api/boards/{board_id}").status_code == 200
    assert board_id not in [board["id"] for board in client.get("/api/boards").json()]


def test_deleting_users_cleans_up_shares_and_owned_boards() -> None:
    owner, member = make_user("owner"), make_user("member")
    board_id = own_board(owner)
    client.post(f"/api/boards/{board_id}/members", json={"email": member})

    database.delete_user(member_id(board_id, member))
    assert [m["email"] for m in client.get(f"/api/boards/{board_id}/members").json()] == [owner]

    second = make_user("second")
    as_user(owner)
    client.post(f"/api/boards/{board_id}/members", json={"email": second})
    database.delete_user(member_id(board_id, owner))
    as_user(second)
    assert board_id not in [board["id"] for board in client.get("/api/boards").json()]
