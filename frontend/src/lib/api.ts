import type { BoardData } from "@/lib/kanban";
import type { Label, LabelColor } from "@/lib/labels";

// `detail` carries the server's human-readable reason when it sends one (e.g.
// why a board could not be shared), so the UI can show it as-is.
export type ApiError = Error & { status?: number; detail?: string };

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error: ApiError = new Error("The server could not complete that request.");
    error.status = response.status;
    const body = await response.json().catch(() => null);
    if (typeof body?.detail === "string") {
      error.detail = body.detail;
    }
    throw error;
  }

  return response.json() as Promise<T>;
};

export const getSession = () =>
  request<{ username: string; email: string | null; role: Role | null }>("/api/auth/session");

export const getBoard = () => request<BoardData>("/api/board");

export const renameColumn = (columnId: string, title: string) =>
  request<BoardData>(`/api/board/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const addCard = (
  columnId: string,
  title: string,
  details: string,
  labelIds: string[],
) =>
  request<BoardData>("/api/board/cards", {
    method: "POST",
    body: JSON.stringify({ columnId, title, details, labelIds }),
  });

// `columnId` is the card's status: a different column moves the card to its end.
// `labelIds` replaces the card's labels.
export const editCard = (
  cardId: string,
  title: string,
  details: string,
  columnId: string,
  labelIds: string[],
) =>
  request<BoardData>(`/api/board/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify({ title, details, columnId, labelIds }),
  });

export const deleteCard = (cardId: string) =>
  request<BoardData>(`/api/board/cards/${cardId}`, { method: "DELETE" });

export const moveCard = (cardId: string, columnId: string, position: number) =>
  request<BoardData>(`/api/board/cards/${cardId}/move`, {
    method: "POST",
    body: JSON.stringify({ columnId, position }),
  });

export const completeCard = (cardId: string) =>
  request<BoardData>(`/api/board/cards/${cardId}/complete`, { method: "POST" });

export type BoardSummary = {
  id: string;
  title: string;
  position: number;
  // False for a board someone else owns and shared with the signed-in user.
  isOwner: boolean;
  ownerEmail: string;
};

// A card archived off the board via the "complete" action. Surfaced in the
// board payload for the dashboard; the board view itself ignores it.
export type CompletedCard = { id: string; title: string; completedAt: string | null };

// The API returns the board with its id/title, which BoardData itself omits,
// plus the list of completed (archived) cards.
export type Board = BoardData & {
  id: string;
  title: string;
  completed: CompletedCard[];
};

export const listBoards = () => request<BoardSummary[]>("/api/boards");

export const getBoardById = (boardId: string) =>
  request<Board>(`/api/boards/${boardId}`);

export const createBoard = (title: string) =>
  request<Board>("/api/boards", {
    method: "POST",
    body: JSON.stringify({ title }),
  });

export const deleteBoard = (boardId: string) =>
  request<BoardSummary[]>(`/api/boards/${boardId}`, { method: "DELETE" });

// Everyone who can open a board: the owner first, then the users it is shared
// with. Only the owner may share or unshare; both return the refreshed list.
export type BoardMember = {
  id: string;
  email: string;
  isOwner: boolean;
};

export const listBoardMembers = (boardId: string) =>
  request<BoardMember[]>(`/api/boards/${boardId}/members`);

export const shareBoard = (boardId: string, email: string) =>
  request<BoardMember[]>(`/api/boards/${boardId}/members`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const unshareBoard = (boardId: string, userId: string) =>
  request<BoardMember[]>(`/api/boards/${boardId}/members/${userId}`, {
    method: "DELETE",
  });

// A board's labels, in palette order. Everyone who can open the board manages
// them; each change returns the refreshed list.

export const listLabels = (boardId: string) =>
  request<Label[]>(`/api/boards/${boardId}/labels`);

export const createLabel = (boardId: string, name: string, color: LabelColor) =>
  request<Label[]>(`/api/boards/${boardId}/labels`, {
    method: "POST",
    body: JSON.stringify({ name, color }),
  });

export const updateLabel = (
  boardId: string,
  labelId: string,
  name: string,
  color: LabelColor,
) =>
  request<Label[]>(`/api/boards/${boardId}/labels/${labelId}`, {
    method: "PATCH",
    body: JSON.stringify({ name, color }),
  });

export const deleteLabel = (boardId: string, labelId: string) =>
  request<Label[]>(`/api/boards/${boardId}/labels/${labelId}`, {
    method: "DELETE",
  });

// App-level roles: admins manage users; users only use their boards.
export type Role = "admin" | "user";

export type User = {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  created_at: string | null;
};

export const listUsers = (signal?: AbortSignal) =>
  request<User[]>("/api/users", { signal });

// User administration is admin-only. Create, role change, and delete return the
// refreshed user list. Users are added by email (the Google sign-in allowlist);
// no password is stored.
export const createUser = (email: string, role: Role) =>
  request<User[]>("/api/users", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });

export const updateUserRole = (userId: string, role: Role) =>
  request<User[]>(`/api/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });

export const deleteUser = (userId: string) =>
  request<User[]>(`/api/users/${userId}`, { method: "DELETE" });
