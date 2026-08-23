import pytest
from fastapi.testclient import TestClient

from app import database
from app import ai
from app.main import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_database(tmp_path: object) -> None:
    database.DATABASE_PATH = tmp_path / "kanban.sqlite3"  # type: ignore[operator]
    database.initialize_database()
    from app.main import sessions

    sessions.clear()


def test_home_requires_sign_in() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert 'data-testid="column-' not in response.text


def test_hello_api_returns_json() -> None:
    response = client.get("/api/hello")

    assert response.status_code == 200
    assert response.json() == {"message": "Hello, world!"}


def test_health_route_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ai_route_requires_authentication() -> None:
    response = client.post("/api/ai/test", json={"question": "2+2"})

    assert response.status_code == 401


def test_ai_route_returns_provider_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    sign_in()
    calls: dict[str, object] = {}

    def fake_ask(question: str) -> str:
        calls["question"] = question
        return "4"

    monkeypatch.setattr("app.main.ask_openrouter", fake_ask)
    response = client.post("/api/ai/test", json={"question": "2+2"})

    assert response.status_code == 200
    assert response.json() == {"answer": "4"}
    assert calls["question"] == "2+2"


def test_ai_client_sends_expected_openrouter_request(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"choices": [{"message": {"content": "4"}}]}

    def fake_post(url: str, **kwargs: object) -> FakeResponse:
        captured["url"] = url
        captured.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr(ai.httpx, "post", fake_post)
    assert ai.ask_openrouter("2+2") == "4"
    assert captured["url"] == ai.OPENROUTER_URL
    assert captured["headers"] == {
        "Authorization": "Bearer test-key",
        "Content-Type": "application/json",
    }
    assert captured["json"] == {
        "model": ai.MODEL,
        "messages": [{"role": "user", "content": "2+2"}],
    }


def test_ai_client_rejects_missing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(ai.OpenRouterError, match="not configured"):
        ai.ask_openrouter("2+2")


def test_ai_route_returns_provider_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    sign_in()
    monkeypatch.setattr(
        "app.main.ask_openrouter",
        lambda question: (_ for _ in ()).throw(ai.OpenRouterError("provider unavailable")),
    )

    response = client.post("/api/ai/test", json={"question": "2+2"})

    assert response.status_code == 503
    assert response.json() == {"detail": "provider unavailable"}


def test_ai_chat_streams_and_applies_valid_operations(monkeypatch: pytest.MonkeyPatch) -> None:
    sign_in()
    captured: dict[str, object] = {}

    def fake_stream(board: dict, question: str, history: list[dict[str, str]]):
        captured.update(board=board, question=question, history=history)
        yield '{"version":1,"response":"I renamed the column",'
        yield '"operations":[{"operation":"rename_column","columnId":"col-backlog","title":"Ready"}]}'

    monkeypatch.setattr("app.main.stream_structured_response", fake_stream)
    response = client.post(
        "/api/ai/chat",
        json={"question": "Rename backlog", "history": [{"role": "user", "content": "Hi"}]},
    )

    assert response.status_code == 200
    assert "event: text" in response.text
    assert "event: complete" in response.text
    assert '"response": "I renamed the column"' in response.text
    assert captured["question"] == "Rename backlog"
    assert captured["history"] == [{"role": "user", "content": "Hi"}]
    assert captured["board"]["columns"][0]["title"] == "Backlog"  # type: ignore[index]
    assert client.get("/api/board").json()["columns"][0]["title"] == "Ready"


def test_ai_chat_rejects_invalid_operation_without_commit(monkeypatch: pytest.MonkeyPatch) -> None:
    sign_in()

    def fake_stream(board: dict, question: str, history: list[dict[str, str]]):
        yield '{"version":1,"response":"No change","operations":[{"operation":"rename_column","columnId":"unknown","title":"Bad"}]}'

    monkeypatch.setattr("app.main.stream_structured_response", fake_stream)
    response = client.post("/api/ai/chat", json={"question": "Do something"})

    assert response.status_code == 200
    assert "event: error" in response.text
    assert "event: complete" not in response.text
    assert client.get("/api/board").json()["columns"][0]["title"] == "Backlog"


def test_ai_chat_requires_authentication() -> None:
    response = client.post("/api/ai/chat", json={"question": "Hello"})

    assert response.status_code == 401


def test_ai_chat_rejects_oversized_context() -> None:
    sign_in()
    response = client.post(
        "/api/ai/chat",
        json={"question": "x" * 4001, "history": []},
    )

    assert response.status_code == 422

    response = client.post(
        "/api/ai/chat",
        json={"question": "Hello", "history": [{"role": "user", "content": "Hi"}] * 51},
    )
    assert response.status_code == 422


def test_invalid_login_is_rejected() -> None:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "wrong"}
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}


def test_login_session_and_logout() -> None:
    login_response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert login_response.status_code == 200
    assert login_response.json() == {"username": "user"}

    session_response = client.get("/api/auth/session")
    assert session_response.status_code == 200
    assert session_response.json() == {"username": "user"}

    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 200
    assert client.get("/api/auth/session").status_code == 401


def sign_in() -> None:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200


def test_board_requires_authentication() -> None:
    assert client.get("/api/board").status_code == 401
    assert client.patch("/api/board/columns/col-backlog", json={"title": "Work"}).status_code == 401


def test_board_mutations_persist_and_preserve_ordering() -> None:
    sign_in()

    board_response = client.get("/api/board")
    assert board_response.status_code == 200
    board = board_response.json()
    assert len(board["columns"]) == 5
    assert len(board["cards"]) == 8

    rename_response = client.patch(
        "/api/board/columns/col-backlog", json={"title": "Ready"}
    )
    assert rename_response.status_code == 200
    assert rename_response.json()["columns"][0]["title"] == "Ready"

    add_response = client.post(
        "/api/board/cards",
        json={
            "columnId": "col-review",
            "title": "New card",
            "details": "New details",
        },
    )
    assert add_response.status_code == 201
    added_board = add_response.json()
    added_card_id = next(card_id for card_id in added_board["cards"] if card_id not in board["cards"])
    assert added_card_id in next(column["cardIds"] for column in added_board["columns"] if column["id"] == "col-review")

    edit_response = client.patch(
        f"/api/board/cards/{added_card_id}",
        json={"title": "Updated card", "details": "Updated details"},
    )
    assert edit_response.status_code == 200
    assert edit_response.json()["cards"][added_card_id]["title"] == "Updated card"

    move_response = client.post(
        "/api/board/cards/card-1/move",
        json={"columnId": "col-done", "position": 0},
    )
    assert move_response.status_code == 200
    moved_board = move_response.json()
    done_column = next(column for column in moved_board["columns"] if column["id"] == "col-done")
    assert done_column["cardIds"][0] == "card-1"

    delete_response = client.delete(f"/api/board/cards/{added_card_id}")
    assert delete_response.status_code == 200
    assert added_card_id not in delete_response.json()["cards"]

    empty_response = client.delete("/api/board/cards/card-6")
    assert empty_response.status_code == 200
    review_column = next(
        column for column in empty_response.json()["columns"] if column["id"] == "col-review"
    )
    assert review_column["cardIds"] == []

    database.initialize_database()
    persisted_board = client.get("/api/board").json()
    assert persisted_board["columns"][0]["title"] == "Ready"
    assert persisted_board["cards"]["card-1"]["title"] == "Align roadmap themes"
    assert persisted_board["columns"][-1]["cardIds"][0] == "card-1"


def test_invalid_board_mutations_are_rejected_without_partial_writes() -> None:
    sign_in()
    original_board = client.get("/api/board").json()

    assert client.patch(
        "/api/board/columns/col-backlog", json={"title": "   "}
    ).status_code == 422
    assert client.patch(
        "/api/board/columns/unknown", json={"title": "Work"}
    ).status_code == 404
    assert client.post(
        "/api/board/cards", json={"columnId": "unknown", "title": "Card"}
    ).status_code == 404
    assert client.patch(
        "/api/board/cards/card-1", json={"title": "   "}
    ).status_code == 422
    assert client.post(
        "/api/board/cards/card-1/move",
        json={"columnId": "unknown", "position": 0},
    ).status_code == 404
    assert client.delete("/api/board/cards/unknown").status_code == 404
    assert client.get("/api/board").json() == original_board
