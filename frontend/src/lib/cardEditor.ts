import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Markdown } from '@tiptap/markdown'

// Card field limits — mirror CARD_*_MAX_LENGTH in backend/app/main.py, which is
// the real guard. `details` is Markdown, so the limit counts markup characters.
export const CARD_TITLE_MAX_LENGTH = 64
export const CARD_DETAILS_MAX_LENGTH = 5000

// The card description editor. Content is stored as Markdown (never HTML), so
// nothing a user types is ever rendered as live markup — see MarkdownContent.
export const cardEditorExtensions = (): Extensions => [
  StarterKit.configure({
    heading: false,
    horizontalRule: false,
    blockquote: false,
    codeBlock: false,
    // Markdown has no underline; keep the shortcut from creating unsaveable marks.
    underline: false,
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ['http', 'https', 'mailto'],
      defaultProtocol: 'https',
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  // `breaks`: a single newline is a line break, so plain-text descriptions
  // written before rich text keep their line layout.
  Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
]
