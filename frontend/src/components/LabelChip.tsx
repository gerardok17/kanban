import { LABEL_COLORS, type LabelColor } from '@/lib/labels'

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
