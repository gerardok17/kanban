'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { KanbanColumn } from '@/components/KanbanColumn'
import { KanbanCardPreview } from '@/components/KanbanCardPreview'
import {
  addCard,
  deleteCard,
  getBoard,
  moveCard as moveRemoteCard,
  renameColumn,
} from '@/lib/api'
import { createId, initialData, moveCard, type BoardData } from '@/lib/kanban'

export const KanbanBoard = ({
  onLogout,
  remote = false,
}: {
  onLogout?: () => void
  remote?: boolean
}) => {
  const [board, setBoard] = useState<BoardData>(() => initialData)
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(remote)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!remote) {
      return
    }
    void getBoard()
      .then((nextBoard) => setBoard(nextBoard))
      .catch((requestError: { status?: number }) => {
        if (requestError.status === 401) {
          onLogout?.()
          return
        }
        setError('Unable to load the board. Please try again.')
      })
      .finally(() => setIsLoading(false))
  }, [onLogout, remote])

  const applyRemoteChange = async (change: () => Promise<BoardData>) => {
    try {
      const nextBoard = await change()
      setBoard(nextBoard)
      setError('')
    } catch (requestError) {
      if ((requestError as { status?: number }).status === 401) {
        onLogout?.()
        return
      }
      setError('Unable to save that change. Your board was not updated.')
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )

  const cardsById = useMemo(() => board.cards, [board.cards])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveCardId(null)

    if (!over || active.id === over.id) {
      return
    }

    if (remote) {
      const sortableColumnId = over.data.current?.sortable?.containerId as
        | string
        | undefined
      const targetColumn = board.columns.find(
        (column) =>
          column.id === sortableColumnId ||
          column.id === over.id ||
          column.cardIds.includes(over.id as string),
      )
      if (targetColumn) {
        const position =
          over.id === targetColumn.id || !sortableColumnId
            ? targetColumn.cardIds.length
            : Math.max(0, targetColumn.cardIds.indexOf(over.id as string))
        void applyRemoteChange(() =>
          moveRemoteCard(active.id as string, targetColumn.id, position),
        )
      }
      return
    }

    setBoard((prev) => ({
      ...prev,
      columns: moveCard(prev.columns, active.id as string, over.id as string),
    }))
  }

  const handleRenameColumn = (columnId: string, title: string) => {
    if (remote) {
      void applyRemoteChange(() => renameColumn(columnId, title))
      return
    }
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column,
      ),
    }))
  }

  const handleAddCard = (columnId: string, title: string, details: string) => {
    if (remote) {
      void applyRemoteChange(() => addCard(columnId, title, details))
      return
    }
    const id = createId('card')
    setBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || 'No details yet.' },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column,
      ),
    }))
  }

  const handleDeleteCard = (columnId: string, cardId: string) => {
    if (remote) {
      void applyRemoteChange(() => deleteCard(cardId))
      return
    }
    setBoard((prev) => {
      return {
        ...prev,
        cards: Object.fromEntries(
          Object.entries(prev.cards).filter(([id]) => id !== cardId),
        ),
        columns: prev.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                cardIds: column.cardIds.filter((id) => id !== cardId),
              }
            : column,
        ),
      }
    })
  }

  const activeCard = activeCardId ? cardsById[activeCardId] : null

  if (isLoading) {
    return (
      <main className='flex min-h-screen items-center justify-center text-sm text-[var(--gray-text)]'>
        Loading board...
      </main>
    )
  }

  return (
    <div className='relative h-screen overflow-hidden'>
      <nav className='absolute inset-x-0 top-0 z-50 border-b border-[var(--card-border-light)] bg-[var(--card-dark)] shadow-[0_4px_20px_rgba(0,0,0,0.16)] backdrop-blur'>
        <div className='mx-auto flex h-20 max-w-[1500px] items-center justify-between px-6'>
          <span className='font-display text-2xl font-semibold text-[var(--accent-yellow)]'>
            Kanban
          </span>
          {onLogout ? (
            <button
              type='button'
              onClick={onLogout}
              className='rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/70 transition hover:border-white/40 hover:text-white'
            >
              Log out
            </button>
          ) : null}
        </div>
      </nav>

      <div className='h-full overflow-y-auto pt-20 [scrollbar-gutter:stable]'>
      <main className='relative mx-auto flex max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-10'>
        {error ? (
          <p
            role='alert'
            className='text-sm font-semibold text-[var(--accent-red)]'
          >
            {error}
          </p>
        ) : null}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className='grid gap-6 lg:grid-cols-5'>
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
          <DragOverlay>
            {activeCard ? (
              <div className='w-[260px]'>
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
      </div>
    </div>
  )
}
