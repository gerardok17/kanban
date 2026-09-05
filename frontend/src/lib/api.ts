import type { BoardData } from "@/lib/kanban";

type ApiError = Error & { status?: number };

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
    throw error;
  }

  return response.json() as Promise<T>;
};

export const getSession = () => request<{ username: string }>("/api/auth/session");

export const getBoard = () => request<BoardData>("/api/board");

export const renameColumn = (columnId: string, title: string) =>
  request<BoardData>(`/api/board/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const addCard = (columnId: string, title: string, details: string) =>
  request<BoardData>("/api/board/cards", {
    method: "POST",
    body: JSON.stringify({ columnId, title, details }),
  });

export const editCard = (cardId: string, title: string, details: string) =>
  request<BoardData>(`/api/board/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify({ title, details }),
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

export type User = {
  id: string;
  username: string;
  created_at: string | null;
};

export const listUsers = (signal?: AbortSignal) =>
  request<User[]>("/api/users", { signal });

// Create and delete return the refreshed user list.
export const createUser = (username: string, password: string) =>
  request<User[]>("/api/users", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const deleteUser = (userId: string) =>
  request<User[]>(`/api/users/${userId}`, { method: "DELETE" });
