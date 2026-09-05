import type { BoardData } from "@/lib/kanban";

type ApiError = Error & { status?: number };

const getApiBaseUrl = (): string => {
  // Next.js public env var: allows overriding API base URL for remote backend
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  return "";
};

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const baseUrl = getApiBaseUrl();
  const url = baseUrl ? `${baseUrl}${path}` : path;

  const response = await fetch(url, {
    ...options,
    credentials: "include",
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

export type BoardSummary = {
  id: string;
  title: string;
  position: number;
};

// The API returns the board with its id/title, which BoardData itself omits.
export type Board = BoardData & { id: string; title: string };

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
