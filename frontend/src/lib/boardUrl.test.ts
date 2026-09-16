import { resolveBoardId } from "@/lib/boardUrl";
import type { BoardSummary } from "@/lib/api";

describe("resolveBoardId", () => {
  const boards: BoardSummary[] = [
    { id: "board-general", title: "General", position: 0 },
    { id: "board-nava", title: "Nava Benefits", position: 1 },
    { id: "board-hyperion", title: "Hyperion", position: 2 },
  ];

  it("resolves a numeric value as a zero-based index", () => {
    expect(resolveBoardId(boards, "0")).toBe("board-general");
    expect(resolveBoardId(boards, "2")).toBe("board-hyperion");
  });

  it("matches a title case-insensitively", () => {
    expect(resolveBoardId(boards, "Hyperion")).toBe("board-hyperion");
    expect(resolveBoardId(boards, "general")).toBe("board-general");
  });

  it("matches a title with spaces (as url-decoded)", () => {
    expect(resolveBoardId(boards, "Nava Benefits")).toBe("board-nava");
    expect(resolveBoardId(boards, "nava benefits")).toBe("board-nava");
  });

  it("falls back to the first board for an out-of-range index", () => {
    expect(resolveBoardId(boards, "9")).toBe("board-general");
  });

  it("falls back to the first board for an unknown title", () => {
    expect(resolveBoardId(boards, "Nope")).toBe("board-general");
  });

  it("falls back to the first board for an empty or missing value", () => {
    expect(resolveBoardId(boards, "")).toBe("board-general");
    expect(resolveBoardId(boards, "   ")).toBe("board-general");
    expect(resolveBoardId(boards, null)).toBe("board-general");
  });

  it("returns null when there are no boards", () => {
    expect(resolveBoardId([], "0")).toBeNull();
    expect(resolveBoardId([], "General")).toBeNull();
  });
});
