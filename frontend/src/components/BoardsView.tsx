'use client'

import { useCallback, useEffect, useState } from 'react'
import { KanbanBoard } from '@/components/KanbanBoard'
import { BoardSelector } from '@/components/BoardSelector'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
  createBoard,
  deleteBoard,
  listBoards,
  type BoardSummary,
} from '@/lib/api'
import type { BoardData } from '@/lib/kanban'

type BoardsViewProps = {
  onLogout?: () => void
  remote?: boolean
}

export const BoardsView = ({ onLogout, remote = false }: BoardsViewProps) => {
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
  const [cardCount, setCardCount] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const handleUnauthorized = useCallback(
    (requestError: { status?: number }) => {
      if (requestError.status === 401) {
        onLogout?.()
        return true
      }
      return false
    },
    [onLogout],
  )

  useEffect(() => {
    if (!remote) {
      return
    }
    listBoards()
      .then((list) => {
        setBoards(list)
        setActiveBoardId((prev) => prev ?? list[0]?.id ?? null)
      })
      .catch((requestError: { status?: number }) => {
        if (!handleUnauthorized(requestError)) {
          setError('Unable to load boards.')
        }
      })
  }, [remote, handleUnauthorized])

  const handleBoardLoaded = useCallback((board: BoardData) => {
    setCardCount(Object.keys(board.cards).length)
  }, [])

  const handleSelect = (boardId: string) => {
    setActiveBoardId(boardId)
    setCardCount(null)
  }

  const handleCreate = async (title: string) => {
    try {
      const board = await createBoard(title)
      const list = await listBoards()
      setBoards(list)
      setActiveBoardId(board.id)
      setCardCount(null)
    } catch (requestError) {
      if (!handleUnauthorized(requestError as { status?: number })) {
        setError('Unable to create the board.')
      }
    }
  }

  const handleConfirmDelete = async () => {
    if (!activeBoardId) {
      return
    }
    try {
      const list = await deleteBoard(activeBoardId)
      setBoards(list)
      setActiveBoardId(list[0]?.id ?? null)
      setCardCount(null)
    } catch (requestError) {
      if (!handleUnauthorized(requestError as { status?: number })) {
        setError('Unable to delete the board.')
      }
    } finally {
      setConfirmDelete(false)
    }
  }

  // Demo mode (no backend): the in-memory board, no selector.
  if (!remote) {
    return <KanbanBoard onLogout={onLogout} remote={false} />
  }

  const activeBoard = boards.find((board) => board.id === activeBoardId)

  return (
    <>
      <div className='mx-auto flex max-w-[1500px] items-center justify-end gap-3 px-6 pt-4'>
        <BoardSelector
          boards={boards}
          activeBoardId={activeBoardId}
          onSelect={handleSelect}
          onCreate={handleCreate}
        />
        {cardCount === 0 ? (
          <button
            type='button'
            onClick={() => setConfirmDelete(true)}
            className='rounded-xl border border-[var(--accent-red)] px-4 py-2 text-sm font-semibold text-[var(--accent-red)] transition hover:bg-[var(--accent-red)] hover:text-white'
          >
            Delete Board
          </button>
        ) : null}
      </div>

      {error ? (
        <p
          role='alert'
          className='mx-auto max-w-[1500px] px-6 pt-3 text-sm font-semibold text-[var(--accent-red)]'
        >
          {error}
        </p>
      ) : null}

      {activeBoardId ? (
        <KanbanBoard
          key={activeBoardId}
          boardId={activeBoardId}
          remote
          onLogout={onLogout}
          onBoardLoaded={handleBoardLoaded}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title='Delete board'
        message={`"${activeBoard?.title ?? 'This board'}" will be permanently deleted.`}
        confirmLabel='Delete'
        cancelLabel='Cancel'
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}
