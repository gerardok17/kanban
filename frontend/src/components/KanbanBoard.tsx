'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { CardDialog, type CardDialogMode } from '@/components/CardDialog'
import { KanbanColumn } from '@/components/KanbanColumn'
import { KanbanCardPreview } from '@/components/KanbanCardPreview'
import {
  addCard,
  completeCard,
  deleteCard,
  editCard,
  getBoard,
  getBoardById,
  moveCard as moveRemoteCard,
  renameColumn,
} from '@/lib/api'
import {
  createId,
  findColumnId,
  initialData,
  isDoneColumn,
  moveCard,
  visibleColumns,
  type BoardData,
} from '@/lib/kanban'
import { labelsOf } from '@/lib/labels'

// Which card dialog is open: a new card for a column, or an existing card.
type CardDialogState =
  | { mode: 'create'; columnId: string }
  | { mode: Exclude<CardDialogMode, 'create'>; cardId: string }

export const KanbanBoard = ({
  onLogout,
  remote = false,
  boardId,
  onBoardLoaded,
  labelsVersion = 0,
}: {
  onLogout?: () => void
  remote?: boolean
  boardId?: string
  onBoardLoaded?: (board: BoardData) => void
  // Bumped after the board's labels change in the header, to reload the board.
  labelsVersion?: number
}) => {
  const [board, setBoard] = useState<BoardData>(() => initialData)
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(remote)
  const [error, setError] = useState('')
  const [cardDialog, setCardDialog] = useState<CardDialogState | null>(null)

  useEffect(() => {
    if (!remote) {
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the loading state while the board fetch below is in flight
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

  // Pick up label changes made in the header, without the loading screen. The
  // version seen at mount is skipped: that board was just loaded.
  const seenLabelsVersion = useRef(labelsVersion)
  useEffect(() => {
    if (!remote || labelsVersion === seenLabelsVersion.current) {
      return
    }
    seenLabelsVersion.current = labelsVersion
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
  }, [onLogout, remote, boardId, labelsVersion])

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

  const handleAddCard = (
    columnId: string,
    title: string,
    details: string,
    labelIds: string[],
  ) => {
    if (remote) {
      void applyRemoteChange(() => addCard(columnId, title, details, labelIds))
      return
    }
    const id = createId('card')
    setBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || 'No details yet.', labelIds },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column,
      ),
    }))
  }

  const handleEditCard = (
    cardId: string,
    title: string,
    details: string,
    columnId: string,
    labelIds: string[],
  ) => {
    if (remote) {
      void applyRemoteChange(() => editCard(cardId, title, details, columnId, labelIds))
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
          labelIds,
        },
      },
      // Like the server: a new status moves the card to the end of that column.
      columns:
        findColumnId(prev.columns, cardId) === columnId
          ? prev.columns
          : moveCard(prev.columns, cardId, columnId),
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

  // Completing archives the card off the board; remote mode only (see product
  // decision), so there is no in-memory demo branch.
  const handleCompleteCard = (cardId: string) => {
    if (!remote) {
      return
    }
    void applyRemoteChange(() => completeCard(cardId))
  }

  const activeCard = activeCardId ? cardsById[activeCardId] : null
  const labels = board.labels ?? []
  const dialogCard =
    cardDialog && cardDialog.mode !== 'create' ? board.cards[cardDialog.cardId] : undefined
  // The dialog's status: the column a new card goes to, or the card's column.
  const dialogColumnId =
    cardDialog?.mode === 'create'
      ? cardDialog.columnId
      : dialogCard && findColumnId(board.columns, dialogCard.id)

  const handleSaveCardDialog = (
    title: string,
    details: string,
    columnId: string,
    labelIds: string[],
  ) => {
    if (!cardDialog) {
      return
    }
    if (cardDialog.mode === 'create') {
      handleAddCard(columnId, title, details, labelIds)
    } else {
      handleEditCard(cardDialog.cardId, title, details, columnId, labelIds)
    }
  }

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
              labels={labels}
              onRename={handleRenameColumn}
              onAddCard={(columnId) => setCardDialog({ mode: 'create', columnId })}
              onViewCard={(cardId) => setCardDialog({ mode: 'view', cardId })}
              onEditCard={(cardId) => setCardDialog({ mode: 'edit', cardId })}
              onDeleteCard={handleDeleteCard}
              canComplete={remote && isDoneColumn(column.id)}
              onCompleteCard={handleCompleteCard}
            />
          ))}
        </section>
        <DragOverlay>
          {activeCard ? (
            <div className='w-[260px]'>
              <KanbanCardPreview card={activeCard} labels={labelsOf(labels, activeCard.labelIds)} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {cardDialog && dialogColumnId ? (
        <CardDialog
          key={cardDialog.mode === 'create' ? `new-${cardDialog.columnId}` : cardDialog.cardId}
          initialMode={cardDialog.mode}
          card={dialogCard}
          columns={visibleColumns(board.columns)}
          initialColumnId={dialogColumnId}
          labels={labels}
          onSave={handleSaveCardDialog}
          onClose={() => setCardDialog(null)}
        />
      ) : null}
    </main>
  )
}
