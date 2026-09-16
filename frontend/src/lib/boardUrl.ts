import type { BoardSummary } from "@/lib/api";

// Resolve a `?board=` URL value to a concrete board id.
//
// A numeric value is a zero-based index into the board list (`0` = first).
// Anything else is matched against the board title, case-insensitively, so a
// url-decoded title such as "Nava Benefits" finds its board. An empty value,
// an out-of-range index, or an unknown title all fall back to the first board.
// Returns null only when there are no boards.
export const resolveBoardId = (
  boards: BoardSummary[],
  raw: string | null,
): string | null => {
  if (boards.length === 0) {
    return null;
  }

  const value = (raw ?? "").trim();
  if (value === "") {
    return boards[0].id;
  }

  if (/^\d+$/.test(value)) {
    const board = boards[Number(value)];
    return (board ?? boards[0]).id;
  }

  const target = value.toLowerCase();
  const match = boards.find(
    (board) => board.title.trim().toLowerCase() === target,
  );
  return (match ?? boards[0]).id;
};
