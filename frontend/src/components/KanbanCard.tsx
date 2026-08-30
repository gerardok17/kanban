import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import type { Card } from '@/lib/kanban'
import { ConfirmDialog } from '@/components/ConfirmDialog'

type KanbanCardProps = {
  card: Card
  onDelete: (cardId: string) => void
}

export const KanbanCard = ({ card, onDelete }: KanbanCardProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false)
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

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        'rounded-2xl border border-[var(--card-border-light)] bg-[var(--card-white)] px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.28)] backdrop-blur',
        'transition-all duration-150 hover:border-[var(--primary-blue)]',
        isDragging && 'opacity-70 shadow-[0_18px_32px_rgba(3,33,71,0.4)]',
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h4 className='font-display text-base font-semibold text-[var(--primary-blue)]'>
            {card.title}
          </h4>
          <p className='mt-2 text-sm leading-6 text-black/70'>{card.details}</p>
        </div>
        <button
          type='button'
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setConfirmOpen(true)}
          className='rounded-full border border-white/15 p-2 text-black/50 transition hover:border-[var(--accent-red)] hover:text-[var(--accent-red)]'
          aria-label={`Delete ${card.title}`}
        >
          <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='h-4 w-4'
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
