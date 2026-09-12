import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "@/lib/api";
import { DashboardView } from "@/components/DashboardView";

// A mutable board the mocked API reads from, so that the reload DashboardView
// performs after a successful delete reflects the removed card. Declared via
// vi.hoisted so it is initialised before the hoisted vi.mock factory runs.
const api = vi.hoisted(() => {
  const state: { board: Board } = { board: null as unknown as Board };
  return {
    state,
    listBoards: vi.fn(async () => [
      { id: "board-1", title: "My Board", position: 0 },
    ]),
    getBoardById: vi.fn(async () => state.board),
    deleteCard: vi.fn(async (cardId: string) => {
      state.board = {
        ...state.board,
        completed: state.board.completed.filter((card) => card.id !== cardId),
      };
    }),
  };
});

vi.mock("@/lib/api", () => ({
  listBoards: api.listBoards,
  getBoardById: api.getBoardById,
  deleteCard: api.deleteCard,
}));

const makeBoard = (): Board => ({
  id: "board-1",
  title: "My Board",
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1"] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
  cards: {},
  completed: [
    { id: "done-1", title: "Ship the mission board", completedAt: null },
    { id: "done-2", title: "Archive stale tasks", completedAt: null },
  ],
});

beforeEach(() => {
  api.state.board = makeBoard();
  api.listBoards.mockClear();
  api.getBoardById.mockClear();
  api.deleteCard.mockClear();
});

describe("DashboardView completed-card deletion", () => {
  it("deletes a completed card after confirming", async () => {
    render(<DashboardView remote />);

    // Both completed cards are listed once the boards load.
    expect(
      await screen.findByText("Ship the mission board"),
    ).toBeInTheDocument();
    expect(screen.getByText("Archive stale tasks")).toBeInTheDocument();

    // Trash button for the first completed card opens the confirm dialog.
    await userEvent.click(
      screen.getByRole("button", { name: /delete ship the mission board/i }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Confirm the deletion (the dialog's confirm button is exactly "Delete").
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(api.deleteCard).toHaveBeenCalledWith("done-1");
    await waitFor(() =>
      expect(
        screen.queryByText("Ship the mission board"),
      ).not.toBeInTheDocument(),
    );
    // The card we did not delete is still there.
    expect(screen.getByText("Archive stale tasks")).toBeInTheDocument();
  });

  it("does not delete when the dialog is cancelled", async () => {
    render(<DashboardView remote />);
    await screen.findByText("Ship the mission board");

    await userEvent.click(
      screen.getByRole("button", { name: /delete ship the mission board/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(api.deleteCard).not.toHaveBeenCalled();
    expect(screen.getByText("Ship the mission board")).toBeInTheDocument();
  });
});
