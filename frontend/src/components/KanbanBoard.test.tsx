import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders the visible columns and hides col-review", () => {
    render(<KanbanBoard />);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(4);
    expect(screen.queryByTestId("column-col-review")).not.toBeInTheDocument();
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds a card through the dialog and removes it", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i }),
    );

    const dialog = await screen.findByRole("dialog", { name: "New card" });
    await userEvent.type(within(dialog).getByLabelText("Card title"), "New card");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add card" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(column).getByText("New card")).toBeInTheDocument();

    await userEvent.click(
      within(column).getByRole("button", { name: /delete new card/i }),
    );
    // A confirmation dialog appears; confirm the deletion.
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("views a card, switches to edit, and saves a new title", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: "View Align roadmap themes" }),
    );

    const view = await screen.findByRole("dialog", { name: "Card details" });
    expect(
      within(view).getByText(/draft quarterly themes/i),
    ).toBeInTheDocument();
    await userEvent.click(within(view).getByRole("button", { name: "Edit" }));

    const edit = await screen.findByRole("dialog", { name: "Edit card" });
    const title = within(edit).getByLabelText("Card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Roadmap themes v2");
    await userEvent.click(within(edit).getByRole("button", { name: "Save" }));

    expect(within(column).getByText("Roadmap themes v2")).toBeInTheDocument();
  });
});
