import {
  isHiddenColumn,
  moveCard,
  visibleColumns,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("visibleColumns", () => {
  it("hides the review column by bare and board-scoped id", () => {
    expect(isHiddenColumn("col-review")).toBe(true);
    expect(isHiddenColumn("board-2-col-review")).toBe(true);
    expect(isHiddenColumn("col-done")).toBe(false);

    const columns: Column[] = [
      { id: "col-backlog", title: "Backlog", cardIds: [] },
      { id: "col-review", title: "Review", cardIds: [] },
      { id: "board-2-col-review", title: "Review", cardIds: [] },
      { id: "col-done", title: "Done", cardIds: [] },
    ];
    expect(visibleColumns(columns).map((column) => column.id)).toEqual([
      "col-backlog",
      "col-done",
    ]);
  });
});
