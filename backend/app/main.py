import os
from contextlib import asynccontextmanager
from typing import Literal
from pathlib import Path
from secrets import token_urlsafe

from authlib.integrations.starlette_client import OAuth
from fastapi import Cookie, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

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

# --- Google OIDC ("Sign in with Google") -----------------------------------
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "")
# Signs the short-lived cookie that carries the OAuth state/nonce between the
# login redirect and the callback. Set a real random value in production.
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-insecure-session-secret")
# Mark auth cookies Secure (HTTPS-only) in production. Off by default so local
# http://localhost development still works; set SESSION_COOKIE_SECURE=true wherever
# the app is served over HTTPS (e.g. behind the Cloudflare tunnel).
COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "false").lower() in ("1", "true", "yes")

# Distinct cookie name: the app's own auth cookie is "session"; this one only
# carries the transient OAuth state/nonce, so they must not collide.
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="oauth_state",
    same_site="lax",
    https_only=COOKIE_SECURE,
)

oauth = OAuth()
google_enabled = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
if google_enabled:
    oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        # Only the email: it is all the app keeps, and the login page says so.
        client_kwargs={"scope": "openid email"},
    )


class ColumnRenameRequest(BaseModel):
    title: str


# Card field limits. Enforced here, not only in the UI, so every client (the web
# app today, API/MCP clients later) gets the same 422 on oversized input.
# `details` is Markdown, so its limit counts the markup characters too.
CARD_TITLE_MAX_LENGTH = 64
CARD_DETAILS_MAX_LENGTH = 5000


class CardCreateRequest(BaseModel):
    columnId: str
    title: str = Field(max_length=CARD_TITLE_MAX_LENGTH)
    details: str = Field(default="", max_length=CARD_DETAILS_MAX_LENGTH)
    labelIds: list[str] = Field(default_factory=list)


class CardUpdateRequest(BaseModel):
    title: str = Field(max_length=CARD_TITLE_MAX_LENGTH)
    details: str | None = Field(default=None, max_length=CARD_DETAILS_MAX_LENGTH)
    # The card's status is its column: a different one moves the card to its end.
    columnId: str | None = None
    # The card's labels, replacing the ones it has; None leaves them as they are.
    labelIds: list[str] | None = None


class CardMoveRequest(BaseModel):
    columnId: str
    position: int


class BoardCreateRequest(BaseModel):
    title: str


class BoardRenameRequest(BaseModel):
    title: str


class BoardShareRequest(BaseModel):
    email: str


# Label names show as chips on cards, so they stay short.
LABEL_NAME_MAX_LENGTH = 16
# Mirrors database.LABEL_COLORS.
LabelColor = Literal["blue", "green", "yellow", "red", "gray", "purple", "pink", "orange"]


class LabelRequest(BaseModel):
    name: str = Field(max_length=LABEL_NAME_MAX_LENGTH)
    color: LabelColor


# App-level roles; mirrors database.USER_ROLES.
UserRole = Literal["admin", "user"]


class UserCreateRequest(BaseModel):
    email: str
    role: UserRole = "user"


class UserRoleRequest(BaseModel):
    role: UserRole


def require_session(session: str | None) -> str:
    if session is None or session not in sessions:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return sessions[session]


def require_admin(session: str | None) -> str:
    # The role is read from the database on every request, so a role change or a
    # deleted user takes effect immediately rather than when the session expires.
    username = require_session(session)
    if database.role_for_username(username) != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")
    return username


def revoke_sessions(username: str) -> None:
    for token in [token for token, owner in sessions.items() if owner == username]:
        sessions.pop(token, None)


@app.get("/api/auth/session")
def get_session(session: str | None = Cookie(default=None)) -> dict[str, str | None]:
    username = require_session(session)
    return {
        "username": username,
        "email": database.email_for_username(username),
        "role": database.role_for_username(username),
    }


@app.post("/api/auth/logout")
def logout(response: Response, session: str | None = Cookie(default=None)) -> dict[str, str]:
    if session is not None:
        sessions.pop(session, None)
    response.delete_cookie("session", samesite="lax", secure=COOKIE_SECURE)
    return {"status": "signed_out"}


@app.get("/api/auth/google/login")
async def google_login(request: Request):
    if not google_enabled:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    redirect_uri = GOOGLE_REDIRECT_URI or str(request.url_for("google_callback"))
    return await oauth.google.authorize_redirect(request, redirect_uri)


@app.get("/api/auth/google/callback", name="google_callback")
async def google_callback(request: Request):
    if not google_enabled:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    # A rejected/failed exchange must never 500 the user onto a blank page; send
    # them back to the login screen with an error the UI can explain.
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception:
        return RedirectResponse(url="/?auth_error=google", status_code=status.HTTP_303_SEE_OTHER)
    userinfo = token.get("userinfo") or {}
    email = (userinfo.get("email") or "").strip()
    if not email or not userinfo.get("email_verified"):
        return RedirectResponse(url="/?auth_error=google", status_code=status.HTTP_303_SEE_OTHER)
    # Allowlist gate: only emails added under Users may sign in.
    username = database.user_for_email(email)
    if username is None:
        return RedirectResponse(url="/?auth_error=not_allowed", status_code=status.HTTP_303_SEE_OTHER)
    session_token = token_urlsafe(32)
    sessions[session_token] = username
    response = RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)
    response.set_cookie(
        "session",
        session_token,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=86400,
    )
    return response


@app.get("/api/hello")
def read_hello() -> dict[str, str]:
    return {"message": "Hello, world!"}


@app.get("/health")
def read_health() -> dict[str, str]:
    return {"status": "ok"}


# User administration (the Google sign-in allowlist) is admin-only.
@app.get("/api/users")
def list_users(session: str | None = Cookie(default=None)) -> list[dict]:
    require_admin(session)
    return database.list_users()


@app.post("/api/users", status_code=201)
def create_user(
    payload: UserCreateRequest,
    session: str | None = Cookie(default=None),
) -> list[dict]:
    require_admin(session)
    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="A valid email is required")
    user_id = f"user-{token_urlsafe(12)}"
    try:
        database.create_allowlisted_user(user_id, email, payload.role)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return database.list_users()


@app.patch("/api/users/{user_id}")
def change_user_role(
    user_id: str,
    payload: UserRoleRequest,
    session: str | None = Cookie(default=None),
) -> list[dict]:
    require_admin(session)
    try:
        database.set_user_role(user_id, payload.role)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return database.list_users()


@app.delete("/api/users/{user_id}")
def delete_user(
    user_id: str,
    session: str | None = Cookie(default=None),
) -> list[dict]:
    require_admin(session)
    try:
        username = database.delete_user(user_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    # Sign the deleted user out everywhere instead of leaving a dead session.
    revoke_sessions(username)
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
    except database.OwnerOnlyError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
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
    except database.OwnerOnlyError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return database.list_boards(username)


# Sharing: anyone who can open a board sees who has access; only the owner can
# share it or stop sharing it.
@app.get("/api/boards/{board_id}/members")
def list_board_members(
    board_id: str,
    session: str | None = Cookie(default=None),
) -> list[dict]:
    username = require_session(session)
    try:
        return database.list_board_members(username, board_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/api/boards/{board_id}/members", status_code=201)
def share_board(
    board_id: str,
    payload: BoardShareRequest,
    session: str | None = Cookie(default=None),
) -> list[dict]:
    username = require_session(session)
    try:
        return database.share_board(username, board_id, payload.email)
    except database.OwnerOnlyError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except database.ShareError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.delete("/api/boards/{board_id}/members/{user_id}")
def unshare_board(
    board_id: str,
    user_id: str,
    session: str | None = Cookie(default=None),
) -> list[dict]:
    username = require_session(session)
    try:
        return database.unshare_board(username, board_id, user_id)
    except database.OwnerOnlyError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


# Labels: everyone who can open a board manages its labels. Each change returns
# the refreshed list.
@app.get("/api/boards/{board_id}/labels")
def list_labels(
    board_id: str,
    session: str | None = Cookie(default=None),
) -> list[dict]:
    username = require_session(session)
    try:
        return database.list_labels(username, board_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/api/boards/{board_id}/labels", status_code=201)
def create_label(
    board_id: str,
    payload: LabelRequest,
    session: str | None = Cookie(default=None),
) -> list[dict]:
    username = require_session(session)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Label name is required")
    try:
        return database.create_label(username, board_id, name, payload.color)
    except database.LabelError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.patch("/api/boards/{board_id}/labels/{label_id}")
def update_label(
    board_id: str,
    label_id: str,
    payload: LabelRequest,
    session: str | None = Cookie(default=None),
) -> list[dict]:
    username = require_session(session)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Label name is required")
    try:
        return database.update_label(username, board_id, label_id, name, payload.color)
    except database.LabelError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.delete("/api/boards/{board_id}/labels/{label_id}")
def delete_label(
    board_id: str,
    label_id: str,
    session: str | None = Cookie(default=None),
) -> list[dict]:
    username = require_session(session)
    try:
        return database.delete_label(username, board_id, label_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


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
        board_id = database.create_card(
            username, card_id, payload.columnId, title, payload.details.strip(), payload.labelIds
        )
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
        board_id = database.update_card(
            username, card_id, title, payload.details, payload.columnId, payload.labelIds
        )
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
