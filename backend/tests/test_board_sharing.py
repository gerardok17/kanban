import os
from datetime import datetime, timedelta, timezone
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


def card_creators(board_id: str) -> dict[str, str | None]:
    cards = client.get(f"/api/boards/{board_id}").json()["cards"].values()
    return {card["title"]: card["createdBy"] for card in cards}


def column_titles(board: dict, column_id: str) -> list[str]:
    column = next(column for column in board["columns"] if column["id"] == column_id)
    return [board["cards"][card_id]["title"] for card_id in column["cardIds"]]


def run_sql(sql: str, params: tuple = ()) -> None:
    with database.connect() as connection, connection.cursor() as cursor:
        cursor.execute(sql, params)


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


def test_cards_record_who_created_them_and_when() -> None:
    owner, member = make_user("owner"), make_user("member")
    board_id = own_board(owner)
    client.post(f"/api/boards/{board_id}/members", json={"email": member})
    add_card(board_id, "Owner card")
    as_user(member)
    card_id = add_card(board_id, "Member card")
    assert card_creators(board_id) == {"Owner card": owner, "Member card": member}

    # An explicit UTC offset, so browsers convert it to local time.
    created_at = datetime.fromisoformat(
        client.get(f"/api/boards/{board_id}").json()["cards"][card_id]["createdAt"]
    )
    assert created_at.utcoffset() == timedelta(0)
    assert abs(datetime.now(timezone.utc) - created_at) < timedelta(minutes=1)


def test_the_v6_backfill_runs_only_once() -> None:
    owner, member = make_user("owner"), make_user("member")
    board_id = own_board(owner)
    client.post(f"/api/boards/{board_id}/members", json={"email": member})
    as_user(member)
    add_card(board_id, "By a deleted user")
    database.delete_user(member_id(board_id, member))

    # The card stays on the board, and later startups never credit it to anyone.
    database.initialize_database()
    as_user(owner)
    assert card_creators(board_id) == {"By a deleted user": None}

    # On a database from before v6, existing cards go to the board's owner.
    legacy_id = add_card(board_id, "From before v6")
    run_sql("UPDATE cards SET created_by = NULL WHERE id = %s", (legacy_id,))
    run_sql("DELETE FROM schema_migrations WHERE version = 6")
    database.initialize_database()
    assert card_creators(board_id)["From before v6"] == owner


def test_editing_a_card_can_change_its_status() -> None:
    owner = make_user("owner")
    board_id = own_board(owner)
    progress = f"{board_id}-col-progress"
    first, second = add_card(board_id, "First"), add_card(board_id, "Second")
    client.post(f"/api/board/cards/{second}/move", json={"columnId": progress, "position": 0})

    # A new status moves the card to the end of that column, along with the edit.
    edit = {"title": "First, moved", "columnId": progress}
    board = client.patch(f"/api/board/cards/{first}", json=edit).json()
    assert column_titles(board, progress) == ["Second", "First, moved"]

    # Its current status keeps the card where it is.
    board = client.patch(f"/api/board/cards/{second}", json={"title": "Second", "columnId": progress}).json()
    assert column_titles(board, progress) == ["Second", "First, moved"]

    # A column of another board is rejected, and nothing is saved, not even the title.
    other_column = f"{own_board(make_user('other'))}-col-progress"
    as_user(owner)
    sneaky = {"title": "Sneaky", "columnId": other_column}
    assert client.patch(f"/api/board/cards/{first}", json=sneaky).status_code == 404
    board = client.get(f"/api/boards/{board_id}").json()
    assert column_titles(board, progress) == ["Second", "First, moved"]


def labels_url(board_id: str) -> str:
    return f"/api/boards/{board_id}/labels"


def test_every_member_manages_the_board_labels() -> None:
    owner, member, stranger = make_user("owner"), make_user("member"), make_user("stranger")
    board_id = own_board(owner)
    client.post(f"/api/boards/{board_id}/members", json={"email": member})

    created = client.post(labels_url(board_id), json={"name": " Bug ", "color": "red"})
    assert created.status_code == 201
    [bug] = created.json()
    assert (bug["name"], bug["color"], bug["cardCount"]) == ("Bug", "red", 0)

    # A member who is not the owner adds, edits, and deletes labels too.
    as_user(member)
    client.post(labels_url(board_id), json={"name": "Feature", "color": "blue"})
    recolor = {"name": "Bugfix", "color": "orange"}
    labels = client.patch(f"{labels_url(board_id)}/{bug['id']}", json=recolor).json()
    # Listed in palette order: blue before orange.
    assert [(label["name"], label["color"]) for label in labels] == [
        ("Feature", "blue"),
        ("Bugfix", "orange"),
    ]
    remaining = client.delete(f"{labels_url(board_id)}/{bug['id']}").json()
    assert [label["name"] for label in remaining] == ["Feature"]

    # Someone who cannot open the board learns nothing about its labels.
    as_user(stranger)
    assert client.get(labels_url(board_id)).status_code == 404
    sneaky = {"name": "Sneaky", "color": "green"}
    assert client.post(labels_url(board_id), json=sneaky).status_code == 404


def test_label_rules() -> None:
    owner = make_user("owner")
    board_id = own_board(owner)
    url = labels_url(board_id)

    assert client.post(url, json={"name": "x" * 17, "color": "red"}).status_code == 422
    assert client.post(url, json={"name": "   ", "color": "red"}).status_code == 422
    assert client.post(url, json={"name": "Teal", "color": "teal"}).status_code == 422
    assert client.delete(f"{url}/label-unknown").status_code == 404

    # Each color once per board, so eight labels at most; names may repeat.
    for color in database.LABEL_COLORS:
        assert client.post(url, json={"name": "Same", "color": color}).status_code == 201
    ninth = client.post(url, json={"name": "Ninth", "color": "red"})
    assert ninth.status_code == 422
    assert ninth.json()["detail"] == "That color is already used on this board."

    # Taking another label's color is refused; saving a label unchanged is fine.
    red = next(label for label in client.get(url).json() if label["color"] == "red")
    assert client.patch(f"{url}/{red['id']}", json={"name": "Red", "color": "blue"}).status_code == 422
    assert client.patch(f"{url}/{red['id']}", json={"name": "Same", "color": "red"}).status_code == 200

    # Another board's colors are its own.
    other_id = client.post("/api/boards", json={"title": "Other"}).json()["id"]
    assert client.post(labels_url(other_id), json={"name": "Bug", "color": "red"}).status_code == 201


def test_deleting_a_label_takes_it_off_its_cards() -> None:
    owner = make_user("owner")
    board_id = own_board(owner)
    card_id = add_card(board_id, "Labelled")
    [label] = client.post(labels_url(board_id), json={"name": "Bug", "color": "red"}).json()
    # The card dialog applies labels in a later change; attach this one directly.
    run_sql("INSERT INTO card_labels(card_id, label_id) VALUES (%s, %s)", (card_id, label["id"]))
    assert client.get(labels_url(board_id)).json()[0]["cardCount"] == 1

    assert client.delete(f"{labels_url(board_id)}/{label['id']}").json() == []
    with database.connect() as connection, connection.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS count FROM card_labels WHERE card_id = %s", (card_id,))
        assert cursor.fetchone()["count"] == 0
