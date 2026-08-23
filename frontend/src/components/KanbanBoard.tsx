"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { addCard, deleteCard, getBoard, moveCard as moveRemoteCard, renameColumn } from "@/lib/api";
import { createId, initialData, moveCard, type BoardData } from "@/lib/kanban";

export const KanbanBoard = ({ onLogout, remote = false }: { onLogout?: () => void; remote?: boolean }) => {
  const [board, setBoard] = useState<BoardData>(() => initialData);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(remote);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!remote) {
      return;
    }
    void getBoard()
      .then((nextBoard) => setBoard(nextBoard))
      .catch((requestError: { status?: number }) => {
        if (requestError.status === 401) {
          onLogout?.();
          return;
        }
        setError("Unable to load the board. Please try again.");
      })
      .finally(() => setIsLoading(false));
  }, [onLogout, remote]);

  const applyRemoteChange = async (change: () => Promise<BoardData>) => {
    try {
      const nextBoard = await change();
      setBoard(nextBoard);
      setError("");
    } catch (requestError) {
      if ((requestError as { status?: number }).status === 401) {
        onLogout?.();
        return;
      }
      setError("Unable to save that change. Your board was not updated.");
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board.cards, [board.cards]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    if (remote) {
      const sortableColumnId = over.data.current?.sortable?.containerId as
        | string
        | undefined;
      const targetColumn = board.columns.find(
        (column) =>
          column.id === sortableColumnId ||
          column.id === over.id ||
          column.cardIds.includes(over.id as string)
      );
      if (targetColumn) {
        const position = over.id === targetColumn.id || !sortableColumnId
          ? targetColumn.cardIds.length
          : Math.max(0, targetColumn.cardIds.indexOf(over.id as string));
        void applyRemoteChange(() =>
          moveRemoteCard(active.id as string, targetColumn.id, position)
        );
      }
      return;
    }

    setBoard((prev) => ({ ...prev, columns: moveCard(prev.columns, active.id as string, over.id as string) }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    if (remote) {
      void applyRemoteChange(() => renameColumn(columnId, title));
      return;
    }
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    if (remote) {
      void applyRemoteChange(() => addCard(columnId, title, details));
      return;
    }
    const id = createId("card");
    setBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    if (remote) {
      void applyRemoteChange(() => deleteCard(cardId));
      return;
    }
    setBoard((prev) => {
      return {
        ...prev,
        cards: Object.fromEntries(
          Object.entries(prev.cards).filter(([id]) => id !== cardId)
        ),
        columns: prev.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                cardIds: column.cardIds.filter((id) => id !== cardId),
              }
            : column
        ),
      };
    });
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-[var(--gray-text)]">Loading board...</main>;
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
              {onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                >
                  Log out
                </button>
              ) : null}
            </div>
          </div>
          {error ? <p role="alert" className="text-sm font-semibold text-[var(--secondary-purple)]">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className={remote ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" : "block"}>
            <section className="grid gap-6 lg:grid-cols-5">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
            </section>
            {remote ? (
              <AIChatSidebar
                onBoardUpdate={setBoard}
                onUnauthorized={() => onLogout?.()}
              />
            ) : null}
          </div>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
};
