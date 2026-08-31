'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import type { BoardSummary } from '@/lib/api'

type BoardSelectorProps = {
  boards: BoardSummary[]
  activeBoardId: string | null
  onSelect: (boardId: string) => void
  onCreate: (title: string) => void
}

export const BoardSelector = ({
  boards,
  activeBoardId,
  onSelect,
  onCreate,
}: BoardSelectorProps) => {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const active = boards.find((board) => board.id === activeBoardId)

  const submitCreate = (event: FormEvent) => {
    event.preventDefault()
    const title = newTitle.trim()
    if (!title) {
      return
    }
    onCreate(title)
    setNewTitle('')
    setCreating(false)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className='relative'>
      <button
        type='button'
        onClick={() => setOpen((value) => !value)}
        className='flex min-w-[180px] items-center justify-between gap-3 rounded-xl border border-[var(--stroke)] bg-white px-4 py-2 text-sm font-semibold text-[var(--navy-dark)] shadow-[var(--shadow)] transition hover:border-[var(--primary-blue)]'
      >
        <span className='truncate'>{active?.title ?? 'Select board'}</span>
        <span className='text-[var(--gray-text)]'>▾</span>
      </button>

      {open ? (
        <div className='absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-[var(--stroke)] bg-white shadow-[var(--shadow)]'>
          <ul className='max-h-72 overflow-y-auto py-1'>
            {boards.map((board) => (
              <li key={board.id}>
                <button
                  type='button'
                  onClick={() => {
                    onSelect(board.id)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition hover:bg-[var(--surface)] ${
                    board.id === activeBoardId
                      ? 'font-semibold text-[var(--primary-blue)]'
                      : 'text-[var(--navy-dark)]'
                  }`}
                >
                  <span className='truncate'>{board.title}</span>
                  {board.id === activeBoardId ? <span>✓</span> : null}
                </button>
              </li>
            ))}
          </ul>

          <div className='border-t border-[var(--stroke)] p-2'>
            {creating ? (
              <form onSubmit={submitCreate} className='flex items-center gap-2'>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder='Board name'
                  className='w-full rounded-lg border border-[var(--stroke)] px-2 py-1.5 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]'
                />
                <button
                  type='submit'
                  className='rounded-lg bg-[var(--primary-blue)] px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110'
                >
                  Add
                </button>
              </form>
            ) : (
              <button
                type='button'
                onClick={() => setCreating(true)}
                className='w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[var(--primary-blue)] transition hover:bg-[var(--surface)]'
              >
                + New board
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
