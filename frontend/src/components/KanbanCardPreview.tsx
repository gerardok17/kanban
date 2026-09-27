import { LabelChips } from '@/components/LabelChip'
import { MarkdownContent } from '@/components/MarkdownContent'
import type { Card } from '@/lib/kanban'
import type { Label } from '@/lib/labels'

type KanbanCardPreviewProps = {
  card: Card
  labels: Label[]
}

export const KanbanCardPreview = ({ card, labels }: KanbanCardPreviewProps) => (
  <article className='rounded-xl border border-[var(--card-border-light)] bg-[var(--card-white)/60] px-3 py-3 shadow-[0_18px_32px_rgba(3,33,71,0.4)] backdrop-blur'>
    <div className='flex items-start justify-between gap-3'>
      <div className='min-w-0'>
        <h4 className='font-display text-base font-semibold break-words text-[var(--primary-blue)]'>
          {card.title}
        </h4>
        {card.details ? (
          <MarkdownContent markdown={card.details} className='mt-2 line-clamp-5' />
        ) : null}
        <LabelChips labels={labels} className='mt-3' />
      </div>
    </div>
  </article>
)
