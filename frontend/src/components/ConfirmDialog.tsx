'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

type ConfirmDialogProps = {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className='fixed inset-0 z-[100] flex items-center justify-center bg-black/15 p-4 backdrop-blur-sm'
      role='dialog'
      aria-modal='true'
      onClick={onCancel}
    >
      <div
        className='w-full max-w-sm rounded-xl border border-[var(--card-border-light)] bg-[var(--card-white)] p-6 shadow-[0_20px_48px_rgba(3,33,71,0.4)]'
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className='font-display text-lg font-semibold text-[var(--navy-dark)]'>
          {title}
        </h3>
        {message ? (
          <p className='mt-2 text-sm leading-6 text-black/70'>{message}</p>
        ) : null}
        <div className='mt-6 flex justify-end gap-3'>
          <button
            type='button'
            onClick={onCancel}
            className='rounded-full border border-[var(--stroke)] px-4 py-2 text-sm font-semibold text-black/70 transition hover:border-[var(--primary-blue)] hover:text-black'
          >
            {cancelLabel}
          </button>
          <button
            type='button'
            onClick={onConfirm}
            className='rounded-full bg-[var(--accent-red)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90'
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
