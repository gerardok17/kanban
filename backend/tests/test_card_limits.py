from fastapi.testclient import TestClient

from app.main import CARD_DETAILS_MAX_LENGTH, CARD_TITLE_MAX_LENGTH, app

# Request-body validation runs before the route handler, so these checks need
# neither a session nor a database. Without the `with` block the app lifespan
# (database initialisation) never runs.
client = TestClient(app)


def create_card(title: str, details: str = "") -> int:
    response = client.post(
        "/api/board/cards",
        json={"columnId": "col-1", "title": title, "details": details},
    )
    return response.status_code


def update_card(title: str, details: str | None = None) -> int:
    response = client.patch("/api/board/cards/card-1", json={"title": title, "details": details})
    return response.status_code


def test_create_card_rejects_title_over_limit() -> None:
    assert create_card("x" * (CARD_TITLE_MAX_LENGTH + 1)) == 422


def test_create_card_rejects_details_over_limit() -> None:
    assert create_card("ok", "x" * (CARD_DETAILS_MAX_LENGTH + 1)) == 422


def test_create_card_at_limits_passes_validation() -> None:
    # Reaches the handler, which rejects the request for having no session.
    assert create_card("x" * CARD_TITLE_MAX_LENGTH, "x" * CARD_DETAILS_MAX_LENGTH) == 401


def test_update_card_rejects_title_over_limit() -> None:
    assert update_card("x" * (CARD_TITLE_MAX_LENGTH + 1)) == 422


def test_update_card_rejects_details_over_limit() -> None:
    assert update_card("ok", "x" * (CARD_DETAILS_MAX_LENGTH + 1)) == 422


def test_update_card_at_limits_passes_validation() -> None:
    assert update_card("x" * CARD_TITLE_MAX_LENGTH, "x" * CARD_DETAILS_MAX_LENGTH) == 401
