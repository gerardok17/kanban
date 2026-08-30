import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import type { Card } from '@/lib/kanban'

type KanbanCardProps = {
  card: Card
  onDelete: (cardId: string) => void
}

export const KanbanCard = ({ card, onDelete }: KanbanCardProps) => {
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
          onClick={() => onDelete(card.id)}
          className='rounded-full border border-white/15 px-2 py-1 text-xs font-semibold text-black/60 transition hover:border-[var(--primary-blue)] hover:text-black/80'
          aria-label={`Delete ${card.title}`}
        >
          Remove
        </button>
      </div>
    </article>
  )
}
