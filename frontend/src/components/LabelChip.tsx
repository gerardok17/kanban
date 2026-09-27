import clsx from 'clsx'
import { LABEL_COLORS, type Label, type LabelColor } from '@/lib/labels'

type LabelChipProps = { name: string; color: LabelColor }

// A label as it shows on cards: its name on its color.
export const LabelChip = ({ name, color }: LabelChipProps) => (
  <span
    className='inline-flex max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-xs font-semibold'
    style={{ backgroundColor: LABEL_COLORS[color].hex, color: LABEL_COLORS[color].text }}
  >
    {name}
  </span>
)

type LabelChipsProps = { labels: Label[]; className?: string }

// A card's labels in a row that wraps; nothing when it has none.
export const LabelChips = ({ labels, className }: LabelChipsProps) =>
  labels.length > 0 ? (
    <div className={clsx('flex flex-wrap gap-1.5', className)}>
      {labels.map((label) => (
        <LabelChip key={label.id} name={label.name} color={label.color} />
      ))}
    </div>
  ) : null
