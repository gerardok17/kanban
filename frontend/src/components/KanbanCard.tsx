import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import type { Card } from '@/lib/kanban'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LabelChips } from '@/components/LabelChip'
import { MarkdownContent } from '@/components/MarkdownContent'
import type { Label } from '@/lib/labels'

type KanbanCardProps = {
  card: Card
  // The card's labels, shown between its description and its actions.
  labels: Label[]
  onView: (cardId: string) => void
  onEdit: (cardId: string) => void
  onDelete: (cardId: string) => void
  // Only cards in the Done column can be completed (archived off the board).
  canComplete?: boolean
  onComplete?: (cardId: string) => void
}

export const KanbanCard = ({
  card,
  labels,
  onView,
  onEdit,
  onDelete,
  canComplete = false,
  onComplete,
}: KanbanCardProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
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
        'rounded-xl border border-[var(--card-border-light)] bg-[var(--card-white)] px-3 py-3 shadow-[0_4px_4px_rgba(3,33,71,0.28)] backdrop-blur',
        'transition-all duration-150 hover:border-[var(--primary-blue)]',
        isDragging && 'opacity-70 shadow-[0_4px_4px_rgba(3,33,71,0.4)]',
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className='min-w-0'>
        <h4 className='font-display text-base font-semibold break-words text-[var(--primary-blue)]'>
          {card.title}
        </h4>
        {card.details ? (
          <MarkdownContent markdown={card.details} className='mt-2 line-clamp-5' />
        ) : null}
      </div>
      <LabelChips labels={labels} className='mt-3' />
      <div className='mt-3 flex items-center justify-between gap-1 border-t border-black/5 pt-3'>
        <div className='flex items-center gap-1'>
          {canComplete && onComplete ? (
            <button
              type='button'
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setCompleteOpen(true)}
              className='inline-flex items-center gap-1 rounded-full border border-black/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent-green)] transition hover:border-[var(--accent-green)] hover:bg-[var(--accent-green)]/10'
              aria-label={`Complete ${card.title}`}
            >
              <svg
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2.5'
                strokeLinecap='round'
                strokeLinejoin='round'
                className='h-3.5 w-3.5'
                aria-hidden='true'
              >
                <path d='M20 6 9 17l-5-5' />
              </svg>
              Complete
            </button>
          ) : null}
        </div>
        <div className='flex items-center gap-1'>
        <button
          type='button'
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onView(card.id)}
          className='rounded-full border border-black/10 p-1.5 text-black/50 transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]'
          aria-label={`View ${card.title}`}
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
            <path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z' />
            <circle cx='12' cy='12' r='3' />
          </svg>
        </button>
        <button
          type='button'
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onEdit(card.id)}
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
      <ConfirmDialog
        open={completeOpen}
        title='Complete card'
        message={`"${card.title}" will be archived and removed from the board.`}
        confirmLabel='Complete'
        cancelLabel='Cancel'
        confirmTone='positive'
        onConfirm={() => {
          onComplete?.(card.id)
          setCompleteOpen(false)
        }}
        onCancel={() => setCompleteOpen(false)}
      />
    </article>
  )
}
