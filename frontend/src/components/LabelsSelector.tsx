'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LabelChip } from '@/components/LabelChip'
import {
  createLabel,
  deleteLabel,
  listLabels,
  updateLabel,
  type ApiError,
} from '@/lib/api'
import {
  LABEL_COLORS,
  LABEL_COLOR_KEYS,
  LABEL_NAME_MAX_LENGTH,
  type Label,
  type LabelColor,
} from '@/lib/labels'

type LabelsSelectorProps = {
  // Mount with key={boardId} so switching boards starts from fresh state.
  boardId: string
  // Called after every label change, so the board shows the new names and colors.
  onChange?: () => void
}

// The label being added (no id yet) or edited.
type LabelDraft = { id: string | null; name: string; color: LabelColor }

const deleteMessage = (label: Label) =>
  label.cardCount > 0
    ? `"${label.name}" will be removed from ${label.cardCount} ${
        label.cardCount === 1 ? 'card' : 'cards'
      } and deleted.`
    : `"${label.name}" will be deleted.`

// The board's labels, left of "Shared with". Everyone who can open the board
// manages them. Each color is used once, so a board has up to eight labels.
export const LabelsSelector = ({ boardId, onChange }: LabelsSelectorProps) => {
  const [open, setOpen] = useState(false)
  const [labels, setLabels] = useState<Label[]>([])
  const [draft, setDraft] = useState<LabelDraft | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [labelToDelete, setLabelToDelete] = useState<Label | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadLabels = useCallback(
    () =>
      listLabels(boardId)
        .then(setLabels)
        .catch(() => setError('Unable to load the labels.')),
    [boardId],
  )

  useEffect(() => {
    void loadLabels()
  }, [loadLabels])

  const toggle = () => {
    // Reload on opening: card counts change as cards get labelled.
    if (!open) {
      void loadLabels()
    }
    setOpen((value) => !value)
  }

  useEffect(() => {
    // Stay open while the delete confirmation (rendered outside) is showing.
    if (!open || labelToDelete) {
      return
    }
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setDraft(null)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open, labelToDelete])

  // The colors a label can take: the ones no other label uses.
  const freeColors = (labelId: string | null) =>
    LABEL_COLOR_KEYS.filter(
      (color) => !labels.some((label) => label.color === color && label.id !== labelId),
    )

  const startDraft = (next: LabelDraft) => {
    setError('')
    setDraft(next)
  }

  const submitDraft = async (event: FormEvent) => {
    event.preventDefault()
    const name = draft?.name.trim()
    if (!draft || !name) {
      return
    }
    setSubmitting(true)
    setError('')
    try {
      setLabels(
        draft.id
          ? await updateLabel(boardId, draft.id, name, draft.color)
          : await createLabel(boardId, name, draft.color),
      )
      setDraft(null)
      onChange?.()
    } catch (requestError) {
      setError((requestError as ApiError).detail ?? 'Unable to save the label.')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!labelToDelete) {
      return
    }
    setError('')
    try {
      setLabels(await deleteLabel(boardId, labelToDelete.id))
      onChange?.()
    } catch {
      setError('Unable to delete the label.')
    } finally {
      setLabelToDelete(null)
    }
  }

  const renderForm = (current: LabelDraft) => (
    <form onSubmit={submitDraft} className='grid gap-2'>
      <div className='flex items-center gap-2'>
        <input
          autoFocus
          value={current.name}
          onChange={(event) => setDraft({ ...current, name: event.target.value })}
          maxLength={LABEL_NAME_MAX_LENGTH}
          placeholder='Label name'
          aria-label='Label name'
          className='w-full rounded-lg border border-[var(--stroke)] px-2 py-1.5 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]'
        />
        <span className='text-xs tabular-nums text-black/40'>
          {current.name.length}/{LABEL_NAME_MAX_LENGTH}
        </span>
      </div>
      <div role='group' aria-label='Label color' className='flex flex-wrap gap-2 py-1'>
        {freeColors(current.id).map((color) => (
          <button
            key={color}
            type='button'
            onClick={() => setDraft({ ...current, color })}
            aria-label={color}
            aria-pressed={current.color === color}
            className={clsx(
              'h-6 w-6 rounded-md transition',
              current.color === color && 'ring-2 ring-[var(--navy-dark)] ring-offset-2',
            )}
            style={{ backgroundColor: LABEL_COLORS[color].hex }}
          />
        ))}
      </div>
      <div className='flex justify-end gap-2'>
        <button
          type='button'
          onClick={() => setDraft(null)}
          className='rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]'
        >
          Cancel
        </button>
        <button
          type='submit'
          disabled={submitting || !current.name.trim()}
          className='rounded-lg bg-[var(--primary-blue)] px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60'
        >
          {current.id ? 'Save' : 'Add'}
        </button>
      </div>
    </form>
  )

  return (
    // On phones the panel hangs from the header row's right edge (the wrapper is
    // not positioned there); from sm up, from this button.
    <div ref={containerRef} className='sm:relative'>
      <button
        type='button'
        onClick={toggle}
        className='flex items-center gap-2 rounded-xl border border-[var(--stroke)] bg-white px-4 py-2 text-sm font-semibold text-[var(--navy-dark)] shadow-[var(--shadow)] transition hover:border-[var(--primary-blue)]'
      >
        <span>Labels</span>
        {labels.length > 0 ? (
          <span className='rounded-full bg-[var(--primary-blue)] px-2 text-xs text-white'>
            {labels.length}
          </span>
        ) : null}
        <span className='text-[var(--gray-text)]'>▾</span>
      </button>

      {open ? (
        <div className='absolute right-6 z-40 mt-2 w-80 max-w-[calc(100vw-3rem)] sm:right-0 overflow-hidden rounded-xl border border-[var(--stroke)] bg-white shadow-[var(--shadow)]'>
          {labels.length > 0 ? (
            <ul className='max-h-80 overflow-y-auto py-1'>
              {labels.map((label) => (
                <li key={label.id} className='px-4 py-2'>
                  {draft?.id === label.id ? (
                    renderForm(draft)
                  ) : (
                    <div className='flex items-center justify-between gap-2'>
                      <LabelChip name={label.name} color={label.color} />
                      <div className='flex items-center'>
                        <button
                          type='button'
                          onClick={() =>
                            startDraft({ id: label.id, name: label.name, color: label.color })
                          }
                          aria-label={`Edit label ${label.name}`}
                          className='rounded-full p-1.5 text-black/50 transition hover:text-[var(--primary-blue)]'
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
                          onClick={() => setLabelToDelete(label)}
                          aria-label={`Delete label ${label.name}`}
                          className='rounded-full p-1.5 text-black/50 transition hover:text-[var(--accent-red)]'
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
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className='px-4 py-3 text-sm text-[var(--gray-text)]'>No labels yet.</p>
          )}

          {error ? (
            <p role='alert' className='px-4 pb-2 text-xs font-semibold text-[var(--accent-red)]'>
              {error}
            </p>
          ) : null}

          <div className='border-t border-[var(--stroke)] p-2'>
            {draft?.id === null ? (
              <div className='p-2'>{renderForm(draft)}</div>
            ) : freeColors(null).length > 0 ? (
              <button
                type='button'
                onClick={() => startDraft({ id: null, name: '', color: freeColors(null)[0] })}
                className='w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[var(--primary-blue)] transition hover:bg-[var(--surface)]'
              >
                + New label
              </button>
            ) : (
              <p className='px-3 py-2 text-xs text-[var(--gray-text)]'>All 8 colors are in use.</p>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={labelToDelete !== null}
        title='Delete label'
        message={labelToDelete ? deleteMessage(labelToDelete) : ''}
        confirmLabel='Delete'
        cancelLabel='Cancel'
        onConfirm={() => void confirmDelete()}
        onCancel={() => setLabelToDelete(null)}
      />
    </div>
  )
}
