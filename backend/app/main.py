from contextlib import asynccontextmanager
from pathlib import Path
from secrets import token_urlsafe

from fastapi import Cookie, FastAPI, HTTPException, Response, status
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from . import database


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Create tables and seed on startup — not at import, so the module can be
    # imported without a live database.
    database.initialize_database()
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)
# In-memory session tokens mapped to their username (cleared on restart).
sessions: dict[str, str] = {}


class LoginRequest(BaseModel):
    username: str
    password: str


class ColumnRenameRequest(BaseModel):
    title: str


class CardCreateRequest(BaseModel):
    columnId: str
    title: str
    details: str = ""


class CardUpdateRequest(BaseModel):
    title: str
    details: str | None = None


class CardMoveRequest(BaseModel):
    columnId: str
    position: int


class BoardCreateRequest(BaseModel):
    title: str


class BoardRenameRequest(BaseModel):
    title: str


def require_session(session: str | None) -> str:
    if session is None or session not in sessions:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return sessions[session]


@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response) -> dict[str, str]:
    username = database.authenticate(payload.username, payload.password)
    if username is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    session = token_urlsafe(32)
    sessions[session] = username
    response.set_cookie("session", session, httponly=True, samesite="lax", max_age=86400)
    return {"username": username}


@app.get("/api/auth/session")
def get_session(session: str | None = Cookie(default=None)) -> dict[str, str]:
    return {"username": require_session(session)}


@app.post("/api/auth/logout")
def logout(response: Response, session: str | None = Cookie(default=None)) -> dict[str, str]:
    if session is not None:
        sessions.pop(session, None)
    response.delete_cookie("session")
    return {"status": "signed_out"}

@app.get("/api/hello")
def read_hello() -> dict[str, str]:
    return {"message": "Hello, world!"}


@app.get("/health")
def read_health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/users")
def list_users(session: str | None = Cookie(default=None)) -> list[dict]:
    require_session(session)
    return database.list_users()


@app.get("/api/boards")
def list_boards(session: str | None = Cookie(default=None)) -> list[dict]:
    username = require_session(session)
    return database.list_boards(username)


@app.post("/api/boards", status_code=201)
def create_board(
    payload: BoardCreateRequest,
    session: str | None = Cookie(default=None),
) -> dict:
    username = require_session(session)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Board title is required")
    board_id = f"board-{token_urlsafe(12)}"
    database.create_board(username, board_id, title)
    return database.get_board(username, board_id)


@app.get("/api/boards/{board_id}")
def read_board_by_id(
    board_id: str,
    session: str | None = Cookie(default=None),
) -> dict:
    username = require_session(session)
    try:
        return database.get_board(username, board_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.patch("/api/boards/{board_id}")
def rename_board(
    board_id: str,
    payload: BoardRenameRequest,
    session: str | None = Cookie(default=None),
) -> dict:
    username = require_session(session)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Board title is required")
    try:
        database.rename_board(username, board_id, title)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return database.get_board(username, board_id)


@app.delete("/api/boards/{board_id}")
def delete_board(
    board_id: str,
    session: str | None = Cookie(default=None),
) -> list[dict]:
    username = require_session(session)
    try:
        database.delete_board(username, board_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return database.list_boards(username)


@app.get("/api/board")
def read_board(session: str | None = Cookie(default=None)) -> dict:
    username = require_session(session)
    return database.get_board_for_user(username)


@app.patch("/api/board/columns/{column_id}")
def rename_board_column(
    column_id: str,
    payload: ColumnRenameRequest,
    session: str | None = Cookie(default=None),
) -> dict:
    username = require_session(session)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Column title is required")
    try:
        board_id = database.rename_column(username, column_id, title)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return database.get_board(username, board_id)


@app.post("/api/board/cards", status_code=201)
def add_board_card(
    payload: CardCreateRequest,
    session: str | None = Cookie(default=None),
) -> dict:
    username = require_session(session)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Card title is required")
    card_id = token_urlsafe(12)
    try:
        board_id = database.create_card(username, card_id, payload.columnId, title, payload.details.strip())
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return database.get_board(username, board_id)


@app.patch("/api/board/cards/{card_id}")
def edit_board_card(
    card_id: str,
    payload: CardUpdateRequest,
    session: str | None = Cookie(default=None),
) -> dict:
    username = require_session(session)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Card title is required")
    try:
        board_id = database.update_card(username, card_id, title, payload.details)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return database.get_board(username, board_id)


@app.delete("/api/board/cards/{card_id}")
def remove_board_card(
    card_id: str,
    session: str | None = Cookie(default=None),
) -> dict:
    username = require_session(session)
    try:
        board_id = database.delete_card(username, card_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return database.get_board(username, board_id)


@app.post("/api/board/cards/{card_id}/move")
def move_board_card(
    card_id: str,
    payload: CardMoveRequest,
    session: str | None = Cookie(default=None),
) -> dict:
    username = require_session(session)
    try:
        board_id = database.move_card(username, card_id, payload.columnId, payload.position)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return database.get_board(username, board_id)


@app.post("/api/board/cards/{card_id}/complete")
def complete_board_card(
    card_id: str,
    session: str | None = Cookie(default=None),
) -> dict:
    username = require_session(session)
    try:
        board_id = database.complete_card(username, card_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return database.get_board(username, board_id)


frontend_directory = Path(__file__).resolve().parents[2] / "frontend"
app.mount("/", StaticFiles(directory=frontend_directory, html=True), name="frontend")
