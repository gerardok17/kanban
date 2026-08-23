import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { streamChat } from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  streamChat: vi.fn(),
}));

const mockedStreamChat = vi.mocked(streamChat);

describe("AIChatSidebar", () => {
  it("streams a response and applies the returned board", async () => {
    const updatedBoard = {
      ...initialData,
      columns: initialData.columns.map((column) =>
        column.id === "col-backlog" ? { ...column, title: "Ready" } : column
      ),
    };
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: text\ndata: "I renamed"\n\n'));
        controller.enqueue(
          new TextEncoder().encode(
            `event: complete\ndata: ${JSON.stringify({ response: "I renamed it.", board: updatedBoard })}\n\n`
          )
        );
        controller.close();
      },
    });
    mockedStreamChat.mockResolvedValue({ body: stream } as Response);
    const onBoardUpdate = vi.fn();

    render(<AIChatSidebar onBoardUpdate={onBoardUpdate} onUnauthorized={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Ask the board assistant"), "Rename backlog");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByText("I renamed it.")).toBeInTheDocument();
    expect(onBoardUpdate).toHaveBeenCalledWith(updatedBoard);
  });

  it("shows stream errors", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: error\ndata: "Provider unavailable"\n\n'));
        controller.close();
      },
    });
    mockedStreamChat.mockResolvedValue({ body: stream } as Response);

    render(<AIChatSidebar onBoardUpdate={vi.fn()} onUnauthorized={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Ask the board assistant"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Provider unavailable");
  });
});