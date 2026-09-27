import pytest
from fastapi.testclient import TestClient

from app import main
from app.main import app, sessions

# The database layer is replaced with an in-memory fake, so these tests need no
# MariaDB. Without the `with` block the app lifespan (database init) never runs.
client = TestClient(app)

ROLES = {"owner@example.com": "admin", "friend@example.com": "user"}


@pytest.fixture(autouse=True)
def fake_database(monkeypatch: pytest.MonkeyPatch) -> dict[str, list]:
    calls: dict[str, list] = {"create": [], "set_role": [], "delete": []}

    def set_role(user_id: str, role: str) -> None:
        if user_id == "user-owner":
            raise ValueError("The first user is always an admin")
        calls["set_role"].append((user_id, role))

    def delete(user_id: str) -> str:
        calls["delete"].append(user_id)
        return "friend@example.com"

    monkeypatch.setattr(main.database, "role_for_username", ROLES.get)
    monkeypatch.setattr(main.database, "email_for_username", lambda username: username)
    monkeypatch.setattr(main.database, "list_users", lambda: [])
    monkeypatch.setattr(
        main.database,
        "create_allowlisted_user",
        lambda user_id, email, role: calls["create"].append((email, role)),
    )
    monkeypatch.setattr(main.database, "set_user_role", set_role)
    monkeypatch.setattr(main.database, "delete_user", delete)

    sessions.clear()
    sessions["owner-token"] = "owner@example.com"
    sessions["friend-token"] = "friend@example.com"
    yield calls
    sessions.clear()
    client.cookies.clear()


def sign_in_as(token: str) -> None:
    client.cookies.set("session", token)


def test_session_reports_the_role() -> None:
    sign_in_as("friend-token")
    assert client.get("/api/auth/session").json()["role"] == "user"


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/api/users", None),
        ("POST", "/api/users", {"email": "new@example.com"}),
        ("PATCH", "/api/users/user-2", {"role": "admin"}),
        ("DELETE", "/api/users/user-2", None),
    ],
)
def test_user_administration_is_admin_only(
    method: str, path: str, body: dict | None, fake_database: dict[str, list]
) -> None:
    sign_in_as("friend-token")
    response = client.request(method, path, json=body)
    assert response.status_code == 403
    assert fake_database == {"create": [], "set_role": [], "delete": []}


def test_admin_adds_a_user_with_the_chosen_role(fake_database: dict[str, list]) -> None:
    sign_in_as("owner-token")
    assert client.post("/api/users", json={"email": "New@Example.com", "role": "admin"}).status_code == 201
    assert fake_database["create"] == [("new@example.com", "admin")]


def test_new_users_default_to_the_user_role(fake_database: dict[str, list]) -> None:
    sign_in_as("owner-token")
    client.post("/api/users", json={"email": "new@example.com"})
    assert fake_database["create"] == [("new@example.com", "user")]


def test_unknown_roles_are_rejected() -> None:
    sign_in_as("owner-token")
    assert client.post("/api/users", json={"email": "new@example.com", "role": "owner"}).status_code == 422
    assert client.patch("/api/users/user-2", json={"role": "superuser"}).status_code == 422


def test_admin_changes_a_role(fake_database: dict[str, list]) -> None:
    sign_in_as("owner-token")
    assert client.patch("/api/users/user-2", json={"role": "admin"}).status_code == 200
    assert fake_database["set_role"] == [("user-2", "admin")]


def test_the_first_user_cannot_be_demoted() -> None:
    sign_in_as("owner-token")
    response = client.patch("/api/users/user-owner", json={"role": "user"})
    assert response.status_code == 400
    assert response.json()["detail"] == "The first user is always an admin"


def test_deleting_a_user_signs_them_out_everywhere() -> None:
    sessions["friend-token-2"] = "friend@example.com"
    sign_in_as("owner-token")
    assert client.delete("/api/users/user-2").status_code == 200
    assert "friend-token" not in sessions
    assert "friend-token-2" not in sessions
    assert sessions == {"owner-token": "owner@example.com"}
