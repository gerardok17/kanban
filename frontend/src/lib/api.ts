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
