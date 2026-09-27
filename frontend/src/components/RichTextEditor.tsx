'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Extension } from '@tiptap/core'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import clsx from 'clsx'
import { cardEditorExtensions } from '@/lib/cardEditor'

// Mod-Enter belongs to the dialog (save). Swallow it here so the editor does
// not insert a hard break first; the key event still bubbles to the dialog.
const ReserveSubmitShortcut = Extension.create({
  name: 'reserveSubmitShortcut',
  priority: 1000,
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => true }
  },
})

type RichTextEditorProps = {
  initialMarkdown: string
  // Fires once the editor has loaded `initialMarkdown`, with its normalised
  // Markdown — the baseline for detecting unsaved changes.
  onReady: (markdown: string) => void
  onChange: (markdown: string) => void
  ariaLabel: string
  placeholder?: string
}

type ToolbarButtonProps = {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}

const ToolbarButton = ({ label, active, onClick, children }: ToolbarButtonProps) => (
  <button
    type='button'
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={label}
    className={clsx(
      'flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm transition',
      active
        ? 'bg-[var(--primary-blue)] text-white'
        : 'text-black/60 hover:bg-black/5 hover:text-black',
    )}
  >
    {children}
  </button>
)

export const RichTextEditor = ({
  initialMarkdown,
  onReady,
  onChange,
  ariaLabel,
  placeholder = 'Add a description...',
}: RichTextEditorProps) => {
  // Callbacks go through refs: useEditor only reads its options once.
  const onReadyRef = useRef(onReady)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onReadyRef.current = onReady
    onChangeRef.current = onChange
  }, [onReady, onChange])

  const editor = useEditor({
    extensions: [
      ...cardEditorExtensions(),
      Placeholder.configure({ placeholder }),
      ReserveSubmitShortcut,
    ],
    content: initialMarkdown,
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: { 'aria-label': ariaLabel, role: 'textbox', 'aria-multiline': 'true' },
    },
    onCreate: ({ editor }) => onReadyRef.current(editor.getMarkdown()),
    onUpdate: ({ editor }) => onChangeRef.current(editor.getMarkdown()),
  })

  const active = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive('bold'),
            italic: editor.isActive('italic'),
            strike: editor.isActive('strike'),
            code: editor.isActive('code'),
            bulletList: editor.isActive('bulletList'),
            orderedList: editor.isActive('orderedList'),
            taskList: editor.isActive('taskList'),
            link: editor.isActive('link'),
          }
        : null,
  })

  const editLink = () => {
    if (!editor) {
      return
    }
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL (leave empty to remove)', previous ?? 'https://')
    if (url === null) {
      return
    }
    const chain = editor.chain().focus().extendMarkRange('link')
    if (url.trim() === '') {
      chain.unsetLink().run()
      return
    }
    chain.setLink({ href: url.trim() }).run()
  }

  return (
    <div className='card-editor rounded-xl border border-[var(--stroke)] bg-white transition focus-within:border-[var(--primary-blue)]'>
      <div
        className='flex flex-wrap items-center gap-0.5 border-b border-[var(--stroke)] px-2 py-1'
        role='toolbar'
        aria-label='Formatting'
      >
        <ToolbarButton label='Bold' active={!!active?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton label='Italic' active={!!active?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <em className='font-serif'>I</em>
        </ToolbarButton>
        <ToolbarButton label='Strikethrough' active={!!active?.strike} onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <s>S</s>
        </ToolbarButton>
        <ToolbarButton label='Inline code' active={!!active?.code} onClick={() => editor?.chain().focus().toggleCode().run()}>
          <span className='font-mono text-xs'>{'</>'}</span>
        </ToolbarButton>
        <span className='mx-1 h-5 w-px bg-black/10' aria-hidden='true' />
        <ToolbarButton label='Bullet list' active={!!active?.bulletList} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' className='h-4 w-4' aria-hidden='true'>
            <path d='M9 6h11M9 12h11M9 18h11' />
            <circle cx='4' cy='6' r='1' fill='currentColor' />
            <circle cx='4' cy='12' r='1' fill='currentColor' />
            <circle cx='4' cy='18' r='1' fill='currentColor' />
          </svg>
        </ToolbarButton>
        <ToolbarButton label='Numbered list' active={!!active?.orderedList} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' className='h-4 w-4' aria-hidden='true'>
            <path d='M10 6h10M10 12h10M10 18h10' />
            <path d='M4 5h1v4M4 9h2' strokeWidth='1.5' />
            <path d='M4 14h2l-2 3h2' strokeWidth='1.5' />
          </svg>
        </ToolbarButton>
        <ToolbarButton label='Checklist' active={!!active?.taskList} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
          <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='h-4 w-4' aria-hidden='true'>
            <rect x='3' y='4' width='6' height='6' rx='1' />
            <path d='m4.5 16 1.5 1.5 3-3' />
            <path d='M13 7h8M13 16h8' />
          </svg>
        </ToolbarButton>
        <span className='mx-1 h-5 w-px bg-black/10' aria-hidden='true' />
        <ToolbarButton label='Link' active={!!active?.link} onClick={editLink}>
          <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='h-4 w-4' aria-hidden='true'>
            <path d='M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7' />
            <path d='M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7' />
          </svg>
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} className='px-3 py-2' />
    </div>
  )
}
