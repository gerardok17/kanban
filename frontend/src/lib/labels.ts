// The label palette, in the order labels are listed; mirrors LABEL_COLORS in
// backend/app/database.py, which stores only the key. `text` keeps a chip's name
// legible (WCAG AA): dark navy on the light colors, white on red and purple.
export const LABEL_COLORS = {
  blue: { hex: '#009cda', text: '#032147' },
  green: { hex: '#45af35', text: '#032147' },
  yellow: { hex: '#fccf00', text: '#032147' },
  red: { hex: '#e62310', text: '#ffffff' },
  gray: { hex: '#9a9b9c', text: '#032147' },
  purple: { hex: '#800080', text: '#ffffff' },
  pink: { hex: '#ffc0cb', text: '#032147' },
  orange: { hex: '#eb9234', text: '#032147' },
} as const

export type LabelColor = keyof typeof LABEL_COLORS

export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS) as LabelColor[]

// Mirrors LABEL_NAME_MAX_LENGTH in backend/app/main.py, which is the real guard.
export const LABEL_NAME_MAX_LENGTH = 16
