import { useState, type FormEvent } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import type { Card } from '@/lib/kanban'
import { ConfirmDialog } from '@/components/ConfirmDialog'

type KanbanCardProps = {
  card: Card
  onEdit: (cardId: string, title: string, details: string) => void
  onDelete: (cardId: string) => void
}

export const KanbanCard = ({ card, onEdit, onDelete }: KanbanCardProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState({ title: card.title, details: card.details })
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const startEditing = () => {
    setDraft({ title: card.title, details: card.details })
    setIsEditing(true)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = draft.title.trim()
    if (!title) {
      return
    }
    onEdit(card.id, title, draft.details.trim())
    setIsEditing(false)
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        'rounded-xl border border-[var(--card-border-light)] bg-[var(--card-white)] px-3 py-3 shadow-[0_4px_4px_rgba(3,33,71,0.28)] backdrop-blur',
        'transition-all duration-150 hover:border-[var(--primary-blue)]',
        isDragging && 'opacity-70 shadow-[0_4px_4px_rgba(3,33,71,0.4)]',
      )}
      {...attributes}
      {...(isEditing ? {} : listeners)}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form
          onSubmit={handleSubmit}
          onPointerDown={(event) => event.stopPropagation()}
          className='space-y-3'
        >
          <input
            value={draft.title}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, title: event.target.value }))
            }
            placeholder='Card title'
            className='w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-semibold text-[var(--primary-blue)] outline-none transition focus:border-[var(--primary-blue)]'
            aria-label='Card title'
            required
            autoFocus
          />
          <textarea
            value={draft.details}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, details: event.target.value }))
            }
            placeholder='Details'
            rows={3}
            className='w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-black/70 outline-none transition focus:border-[var(--primary-blue)]'
            aria-label='Card details'
          />
          <div className='flex items-center gap-2'>
            <button
              type='submit'
              className='rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110'
            >
              Save
            </button>
            <button
              type='button'
              onClick={() => setIsEditing(false)}
              className='rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]'
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className='min-w-0'>
            <h4 className='font-display text-base font-semibold break-words text-[var(--primary-blue)]'>
              {card.title}
            </h4>
            <p className='mt-2 text-sm leading-6 break-words text-black/70'>
              {card.details}
            </p>
          </div>
          <div className='mt-3 flex items-center justify-end gap-1 border-t border-black/5 pt-3'>
            <button
              type='button'
              onPointerDown={(event) => event.stopPropagation()}
              onClick={startEditing}
              className='rounded-full border border-black/10 p-1.5 text-black/50 transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]'
              aria-label={`Edit ${card.title}`}
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
                <path d='M12 20h9' />
                <path d='M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z' />
              </svg>
            </button>
            <button
              type='button'
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setConfirmOpen(true)}
              className='rounded-full border border-black/10 p-1.5 text-black/50 transition hover:border-[var(--accent-red)] hover:text-[var(--accent-red)]'
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
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title='Delete card'
        message={`"${card.title}" will be permanently removed.`}
        confirmLabel='Delete'
        cancelLabel='Cancel'
        onConfirm={() => {
          onDelete(card.id)
          setConfirmOpen(false)
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </article>
  )
}
