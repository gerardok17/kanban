'use client'

import { useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { MarkdownContent } from '@/components/MarkdownContent'
import { RichTextEditor } from '@/components/RichTextEditor'
import { CARD_DETAILS_MAX_LENGTH, CARD_TITLE_MAX_LENGTH } from '@/lib/cardEditor'
import { formatDateTime } from '@/lib/dates'
import type { Card } from '@/lib/kanban'

export type CardDialogMode = 'create' | 'view' | 'edit'

type CardDialogProps = {
  // Mount with a `key` per card/open so each opening starts from fresh state.
  initialMode: CardDialogMode
  card?: Card
  onSave: (title: string, details: string) => void
  onClose: () => void
}

type CounterProps = { length: number; max: number }

const Counter = ({ length, max }: CounterProps) => (
  <span
    className={clsx(
      'text-xs tabular-nums',
      length > max ? 'font-semibold text-[var(--accent-red)]' : 'text-black/40',
    )}
  >
    {length}/{max}
  </span>
)

// "Created by alex @ Sept 17th 09:17." — the email without its domain (the full
// one on hover), in local time. Nothing for a card not created yet.
const CreatedLine = ({ card }: { card?: Card }) => {
  if (!card?.createdAt) {
    return null
  }
  return (
    <p className='text-xs text-[var(--gray-text)]'>
      Created by{' '}
      {card.createdBy ? (
        <span title={card.createdBy}>{card.createdBy.split('@')[0]}</span>
      ) : (
        'a deleted user'
      )}{' '}
      @ {formatDateTime(card.createdAt)}.
    </p>
  )
}

// The card's own place: create it, read it in full, or edit it. Labels and
// per-card messages are meant to live here too.
export const CardDialog = ({ initialMode, card, onSave, onClose }: CardDialogProps) => {
  const [mode, setMode] = useState<CardDialogMode>(initialMode)
  const initialTitle = card?.title ?? ''
  const initialDetails = card?.details ?? ''
  const [title, setTitle] = useState(initialTitle)
  const [details, setDetails] = useState(initialDetails)
  // The editor normalises the Markdown it loads; compare against that, not the
  // raw stored text, or opening a card would count as a change.
  const [detailsBaseline, setDetailsBaseline] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)

  const isEditing = mode !== 'view'
  const isDirty =
    isEditing &&
    (title !== initialTitle || (detailsBaseline !== null && details !== detailsBaseline))
  const canSave =
    title.trim().length > 0 &&
    title.length <= CARD_TITLE_MAX_LENGTH &&
    details.length <= CARD_DETAILS_MAX_LENGTH

  const requestClose = () => {
    if (isDirty) {
      setDiscardOpen(true)
      return
    }
    onClose()
  }

  const save = () => {
    if (!canSave) {
      return
    }
    onSave(title.trim(), details.trim())
    onClose()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    save()
  }

  // Listen on window, not the overlay: a click on the backdrop moves focus to
  // <body>, and Esc must still close the dialog from there.
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (discardOpen) {
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      requestClose()
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && isEditing) {
      event.preventDefault()
      save()
    }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (typeof document === 'undefined') {
    return null
  }

  const heading = mode === 'create' ? 'New card' : mode === 'edit' ? 'Edit card' : 'Card details'

  return createPortal(
    // No close on backdrop click: a text selection that ends outside the panel
    // fires its click on the backdrop. Close with Esc, the X, or Cancel/Close.
    <div className='fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/25 p-4 backdrop-blur-sm'>
      {/* sm:my-auto centres the panel but, unlike items-center, lets a panel
          taller than the screen start at the top and scroll instead of being
          clipped above the viewport. */}
      <div
        role='dialog'
        aria-modal='true'
        aria-label={heading}
        className='w-full max-w-2xl rounded-xl border border-[var(--card-border-light)] bg-[var(--card-white)] p-6 shadow-[0_20px_48px_rgba(3,33,71,0.4)] backdrop-blur sm:my-auto'
      >
        <div className='flex items-center justify-between gap-3'>
          <h3 className='text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]'>
            {heading}
          </h3>
          <button
            type='button'
            onClick={requestClose}
            aria-label='Close dialog'
            className='rounded-full p-1.5 text-black/50 transition hover:bg-black/5 hover:text-black'
          >
            <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' className='h-4 w-4' aria-hidden='true'>
              <path d='M18 6 6 18M6 6l12 12' />
            </svg>
          </button>
        </div>

        {isEditing ? (
          <form onSubmit={handleSubmit} className='mt-4 space-y-4'>
            <div>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder='Card title'
                aria-label='Card title'
                maxLength={CARD_TITLE_MAX_LENGTH}
                autoFocus
                className='w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 font-display text-base font-semibold text-[var(--primary-blue)] outline-none transition focus:border-[var(--primary-blue)]'
              />
              <div className='mt-1 flex justify-end'>
                <Counter length={title.length} max={CARD_TITLE_MAX_LENGTH} />
              </div>
            </div>
            <div>
              <RichTextEditor
                initialMarkdown={initialDetails}
                onReady={(markdown) => {
                  setDetailsBaseline(markdown)
                  setDetails(markdown)
                }}
                onChange={setDetails}
                ariaLabel='Card details'
              />
              <div className='mt-1 flex justify-end gap-3'>
                <span className='mr-auto hidden text-xs text-black/40 sm:inline'>
                  Esc to close · ⌘/Ctrl+Enter to save
                </span>
                <Counter length={details.length} max={CARD_DETAILS_MAX_LENGTH} />
              </div>
            </div>
            <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-2'>
              <CreatedLine card={card} />
              <div className='ml-auto flex gap-2'>
                <button
                  type='button'
                  onClick={requestClose}
                  className='rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={!canSave}
                  className='rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40'
                >
                  {mode === 'create' ? 'Add card' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className='mt-4 space-y-4'>
            <h2 className='font-display text-xl font-semibold break-words text-[var(--primary-blue)]'>
              {title}
            </h2>
            {/* Same footprint as the editor, so a long description scrolls
                here instead of pushing the dialog past the screen. */}
            <div className='max-h-[50vh] min-h-[12rem] overflow-y-auto rounded-xl border border-[var(--stroke)] bg-white/60 px-3 py-2'>
              {initialDetails ? (
                <MarkdownContent markdown={initialDetails} />
              ) : (
                <p className='text-sm text-black/40'>No description.</p>
              )}
            </div>
            <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-2'>
              <CreatedLine card={card} />
              <div className='ml-auto flex gap-2'>
                <button
                  type='button'
                  onClick={onClose}
                  className='rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]'
                >
                  Close
                </button>
                <button
                  type='button'
                  onClick={() => setMode('edit')}
                  autoFocus
                  className='rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110'
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={discardOpen}
        title='Discard changes?'
        message='Your unsaved changes to this card will be lost.'
        confirmLabel='Discard'
        cancelLabel='Keep editing'
        onConfirm={() => {
          setDiscardOpen(false)
          onClose()
        }}
        onCancel={() => setDiscardOpen(false)}
      />
    </div>,
    document.body,
  )
}
