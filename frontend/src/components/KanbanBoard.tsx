'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  MeasuringStrategy,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { KanbanColumn } from '@/components/KanbanColumn'
import { KanbanCardPreview } from '@/components/KanbanCardPreview'
import {
  addCard,
  deleteCard,
  editCard,
  getBoard,
  getBoardById,
  moveCard as moveRemoteCard,
  renameColumn,
} from '@/lib/api'
import {
  createId,
  initialData,
  moveCard,
  visibleColumns,
  type BoardData,
} from '@/lib/kanban'

export const KanbanBoard = ({
  onLogout,
  remote = false,
  boardId,
  onBoardLoaded,
}: {
  onLogout?: () => void
  remote?: boolean
  boardId?: string
  onBoardLoaded?: (board: BoardData) => void
}) => {
  const [board, setBoard] = useState<BoardData>(() => initialData)
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(remote)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!remote) {
      return
    }
    setIsLoading(true)
    const load = boardId ? getBoardById(boardId) : getBoard()
    void load
      .then((nextBoard) => setBoard(nextBoard))
      .catch((requestError: { status?: number }) => {
        if (requestError.status === 401) {
          onLogout?.()
          return
        }
        setError('Unable to load the board. Please try again.')
      })
      .finally(() => setIsLoading(false))
  }, [onLogout, remote, boardId])

  useEffect(() => {
    onBoardLoaded?.(board)
  }, [board, onBoardLoaded])

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

  const handleEditCard = (cardId: string, title: string, details: string) => {
    if (remote) {
      void applyRemoteChange(() => editCard(cardId, title, details))
      return
    }
    setBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: {
          ...prev.cards[cardId],
          title,
          details: details || 'No details yet.',
        },
      },
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
      <main className='flex min-h-[60vh] items-center justify-center text-sm text-[var(--gray-text)]'>
        Loading board...
      </main>
    )
  }

  return (
    <main className='relative mx-auto flex max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-10'>
      {error ? (
        <p role='alert' className='text-sm font-semibold text-[var(--accent-red)]'>
          {error}
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <section className='grid gap-3 lg:grid-cols-4'>
          {visibleColumns(board.columns).map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              cards={column.cardIds.map((cardId) => board.cards[cardId])}
              onRename={handleRenameColumn}
              onAddCard={handleAddCard}
              onEditCard={handleEditCard}
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
  )
}
