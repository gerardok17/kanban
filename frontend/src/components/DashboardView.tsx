'use client'

import { useCallback, useEffect, useState } from 'react'
import { deleteCard, getBoardById, listBoards, type Board } from '@/lib/api'
import { initialData, visibleColumns } from '@/lib/kanban'
import { ConfirmDialog } from './ConfirmDialog'

type DashboardViewProps = {
  onLogout?: () => void
  remote?: boolean
}

type BoardStats = {
  id: string
  title: string
  total: number
  byStatus: { title: string; count: number }[]
  completedCount: number
  completedCards: { id: string; title: string }[]
}

// A card's "status/category" is the column it sits in. Per-board totals and
// per-status counts are derived from each board's full data. listBoards() only
// returns id/title/position, so the dashboard fetches every board once and
// aggregates client-side; a dedicated /api/stats endpoint would be the upgrade
// if the board count ever grew large. Completed cards are archived off the
// board and arrive in board.completed, separate from the column counts.
const toStats = (board: Board): BoardStats => {
  const columns = visibleColumns(board.columns)
  const completed = board.completed ?? []
  return {
    id: board.id,
    title: board.title,
    total: columns.reduce((sum, column) => sum + column.cardIds.length, 0),
    byStatus: columns.map((column) => ({
      title: column.title,
      count: column.cardIds.length,
    })),
    completedCount: completed.length,
    completedCards: completed.map((card) => ({ id: card.id, title: card.title })),
  }
}

const StatTile = ({ label, value }: { label: string; value: number }) => (
  <div className='flex flex-col gap-1 rounded-xl border border-[var(--card-border-light)] bg-[var(--card-white)] px-5 py-4 shadow-[var(--shadow)]'>
    <span className='text-3xl font-semibold text-[var(--secondary-purple)]'>
      {value}
    </span>
    <span className='text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)]'>
      {label}
    </span>
  </div>
)

export const DashboardView = ({ onLogout, remote = false }: DashboardViewProps) => {
  // Demo mode has one static in-memory board, so seed it as initial state
  // rather than in an effect; the effect only runs for the remote fetch.
  const [stats, setStats] = useState<BoardStats[] | null>(() =>
    remote
      ? null
      : [toStats({ id: 'demo', title: 'Demo Board', completed: [], ...initialData })],
  )
  const [error, setError] = useState('')
  // The completed card queued for deletion; non-null opens the confirm dialog.
  const [pendingDelete, setPendingDelete] = useState<
    { id: string; title: string } | null
  >(null)

  // Fetch every board and aggregate it into dashboard stats. Extracted so it
  // can run both on mount and after a completed card is deleted.
  const loadStats = useCallback(async () => {
    const summaries = await listBoards()
    const boards = await Promise.all(
      summaries.map((summary) => getBoardById(summary.id)),
    )
    return boards.map(toStats)
  }, [])

  useEffect(() => {
    if (!remote) {
      return
    }
    let cancelled = false
    loadStats()
      .then((next) => {
        if (!cancelled) {
          setStats(next)
        }
      })
      .catch((requestError: { status?: number }) => {
        if (cancelled) {
          return
        }
        if (requestError.status === 401) {
          onLogout?.()
          return
        }
        setError('Unable to load dashboard statistics.')
      })
    return () => {
      cancelled = true
    }
  }, [remote, onLogout, loadStats])

  // Confirmed deletion of a completed card: remove it, then reload stats so the
  // completed counts and this list stay in sync with the server.
  const handleConfirmDelete = async () => {
    if (!pendingDelete) {
      return
    }
    const target = pendingDelete
    setPendingDelete(null)
    try {
      await deleteCard(target.id)
      setStats(await loadStats())
    } catch (requestError) {
      if ((requestError as { status?: number }).status === 401) {
        onLogout?.()
        return
      }
      setError('Unable to delete that card.')
    }
  }

  const totalBoards = stats?.length ?? 0
  const totalCards = stats?.reduce((sum, board) => sum + board.total, 0) ?? 0
  const totalCompleted =
    stats?.reduce((sum, board) => sum + board.completedCount, 0) ?? 0

  // Aggregate card counts by status title across every board.
  const globalByStatus = new Map<string, number>()
  stats?.forEach((board) =>
    board.byStatus.forEach(({ title, count }) =>
      globalByStatus.set(title, (globalByStatus.get(title) ?? 0) + count),
    ),
  )

  return (
    <div className='admin-page'>
      <h1>Dashboard</h1>

      {error ? (
        <p role='alert' className='text-sm font-semibold text-[var(--accent-red)]'>
          {error}
        </p>
      ) : null}

      {stats === null ? (
        <p className='text-sm text-[var(--gray-text)]'>Loading statistics...</p>
      ) : (
        <div className='mt-6 flex flex-col gap-8'>
          <section className='flex flex-wrap gap-4'>
            <StatTile label='Boards' value={totalBoards} />
            <StatTile label='Total cards' value={totalCards} />
          </section>

          {globalByStatus.size > 0 ? (
            <section>
              <h2 className='mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)]'>
                Cards by status
              </h2>
              <div className='flex flex-wrap gap-3'>
                {[...globalByStatus.entries()].map(([title, count]) => (
                  <div
                    key={title}
                    className='flex items-center gap-3 rounded-full border border-[var(--stroke)] bg-[var(--card-white)] px-4 py-2 shadow-[var(--shadow)]'
                  >
                    <span className='h-2 w-2 rounded-full bg-[var(--accent-yellow)]' />
                    <span className='text-sm font-medium text-[var(--navy-dark)]'>
                      {title}
                    </span>
                    <span className='text-sm font-semibold text-[var(--primary-blue)]'>
                      {count}
                    </span>
                  </div>
                ))}
                <div className='flex items-center gap-3 rounded-full border border-[var(--stroke)] bg-[var(--card-white)] px-4 py-2 shadow-[var(--shadow)]'>
                  <span className='h-2 w-2 rounded-full bg-[var(--accent-green)]' />
                  <span className='text-sm font-medium text-[var(--navy-dark)]'>
                    Completed
                  </span>
                  <span className='text-sm font-semibold text-[var(--accent-green)]'>
                    {totalCompleted}
                  </span>
                </div>
              </div>
            </section>
          ) : null}

          <section>
            <h2 className='mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)]'>
              Boards overview
            </h2>
            {stats.length === 0 ? (
              <p className='text-sm text-[var(--gray-text)]'>No boards yet.</p>
            ) : (
              <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                {stats.map((board) => (
                  <article
                    key={board.id}
                    className='rounded-xl border border-[var(--card-border-light)] bg-[var(--card-white)] p-5 shadow-[var(--shadow)]'
                  >
                    <div className='flex items-baseline justify-between gap-3'>
                      <h3 className='font-display text-lg font-semibold text-[var(--navy-dark)]'>
                        {board.title}
                      </h3>
                      <span className='text-sm font-semibold text-[var(--secondary-purple)]'>
                        {board.total} {board.total === 1 ? 'card' : 'cards'}
                      </span>
                    </div>
                    <ul className='mt-4 flex flex-col gap-2'>
                      {board.byStatus.map((status) => (
                        <li
                          key={status.title}
                          className='flex items-center justify-between text-sm'
                        >
                          <span className='text-[var(--gray-text)]'>
                            {status.title}
                          </span>
                          <span className='font-semibold text-[var(--primary-blue)]'>
                            {status.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className='mt-3 border-t border-black/5 pt-3'>
                      <div className='flex items-center justify-between text-sm'>
                        <span className='font-semibold text-[var(--accent-green)]'>
                          Completed
                        </span>
                        <span className='font-semibold text-[var(--accent-green)]'>
                          {board.completedCount}
                        </span>
                      </div>
                      {board.completedCards.length > 0 ? (
                        <ul className='mt-2 overflow-hidden rounded-lg border border-[var(--stroke)]'>
                          {board.completedCards.map((card) => (
                            <li
                              key={card.id}
                              className='flex items-center justify-between gap-2 px-3 py-1.5 odd:bg-white even:bg-[var(--surface)]'
                            >
                              <span className='truncate text-xs text-[var(--gray-text)]'>
                                {card.title}
                              </span>
                              <button
                                type='button'
                                onClick={() =>
                                  setPendingDelete({ id: card.id, title: card.title })
                                }
                                className='shrink-0 rounded-full border border-black/10 p-1.5 text-black/50 transition hover:border-[var(--accent-red)] hover:text-[var(--accent-red)]'
                                aria-label={`Delete ${card.title}`}
                              >
                                <svg
                                  viewBox='0 0 24 24'
                                  fill='none'
                                  stroke='currentColor'
                                  strokeWidth='2'
                                  strokeLinecap='round'
                                  strokeLinejoin='round'
                                  className='h-3.5 w-3.5'
                                  aria-hidden='true'
                                >
                                  <path d='M3 6h18' />
                                  <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
                                  <path d='M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' />
                                  <path d='M10 11v6' />
                                  <path d='M14 11v6' />
                                </svg>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title='Delete completed card?'
        message={
          pendingDelete
            ? `"${pendingDelete.title}" will be permanently removed. This can't be undone.`
            : undefined
        }
        confirmLabel='Delete'
        cancelLabel='Cancel'
        confirmTone='danger'
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
