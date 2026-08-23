from pathlib import Path
from secrets import token_urlsafe
import json

from fastapi import Cookie, FastAPI, HTTPException, Response, status
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from . import database
from .ai import OpenRouterError, ask_openrouter, stream_structured_response
from .structured_ai import StructuredAiResponse

app = FastAPI(title="Project Management MVP")
sessions: set[str] = set()
database.initialize_database()


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


class AiTestRequest(BaseModel):
    question: str = "2+2"


class AiChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=50)


def require_session(session: str | None) -> str:
    if session is None or session not in sessions:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return "user"


@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response) -> dict[str, str]:
    if payload.username != "user" or payload.password != "password":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    session = token_urlsafe(32)
    sessions.add(session)
    response.set_cookie("session", session, httponly=True, samesite="lax", max_age=86400)
    return {"username": "user"}


@app.get("/api/auth/session")
def get_session(session: str | None = Cookie(default=None)) -> dict[str, str]:
    return {"username": require_session(session)}


@app.post("/api/auth/logout")
def logout(response: Response, session: str | None = Cookie(default=None)) -> dict[str, str]:
    if session is not None:
        sessions.discard(session)
    response.delete_cookie("session")
    return {"status": "signed_out"}

@app.get("/api/hello")
def read_hello() -> dict[str, str]:
    return {"message": "Hello, world!"}


@app.get("/health")
def read_health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/ai/test")
def test_ai_connection(
    payload: AiTestRequest,
    session: str | None = Cookie(default=None),
) -> dict[str, str]:
    require_session(session)
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question is required")
    try:
        return {"answer": ask_openrouter(question)}
    except OpenRouterError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/api/ai/chat")
def ai_chat(
    payload: AiChatRequest,
    session: str | None = Cookie(default=None),
) -> StreamingResponse:
    username = require_session(session)
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question is required")
    board = database.get_board_for_user(username)

    def events():
        chunks: list[str] = []
        try:
            for chunk in stream_structured_response(board, question, payload.history):
                chunks.append(chunk)
                yield f"event: text\ndata: {json.dumps(chunk)}\n\n"
            structured_response = StructuredAiResponse.model_validate_json("".join(chunks))
            updated_board = database.apply_operations(username, structured_response.operations)
            yield f"event: complete\ndata: {json.dumps({'response': structured_response.response, 'board': updated_board})}\n\n"
        except (OpenRouterError, ValueError, TypeError) as error:
            yield f"event: error\ndata: {json.dumps(str(error))}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


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
        database.rename_column(username, column_id, title)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return database.get_board_for_user(username)


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
        database.create_card(username, card_id, payload.columnId, title, payload.details.strip())
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return database.get_board_for_user(username)


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
        database.update_card(username, card_id, title, payload.details)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return database.get_board_for_user(username)


@app.delete("/api/board/cards/{card_id}")
def remove_board_card(
    card_id: str,
    session: str | None = Cookie(default=None),
) -> dict:
    username = require_session(session)
    try:
        database.delete_card(username, card_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return database.get_board_for_user(username)


@app.post("/api/board/cards/{card_id}/move")
def move_board_card(
    card_id: str,
    payload: CardMoveRequest,
    session: str | None = Cookie(default=None),
) -> dict:
    username = require_session(session)
    try:
        database.move_card(username, card_id, payload.columnId, payload.position)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return database.get_board_for_user(username)


frontend_directory = Path(__file__).resolve().parents[2] / "frontend"
app.mount("/", StaticFiles(directory=frontend_directory, html=True), name="frontend")
