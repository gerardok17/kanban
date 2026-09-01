import type { Card } from '@/lib/kanban'

type KanbanCardPreviewProps = {
  card: Card
}

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className='rounded-xl border border-[var(--card-border-light)] bg-[var(--card-white)/60] px-3 py-3 shadow-[0_18px_32px_rgba(3,33,71,0.4)] backdrop-blur'>
    <div className='flex items-start justify-between gap-3'>
      <div className='min-w-0'>
        <h4 className='font-display text-base font-semibold break-words text-[var(--primary-blue)]'>
          {card.title}
        </h4>
        <p className='mt-2 text-sm leading-6 break-words text-black/70'>{card.details}</p>
      </div>
    </div>
  </article>
)
