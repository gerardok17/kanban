'use client'

import { useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Role } from '@/lib/api'

type AddUserDialogProps = {
  // Resolves when the user was added; rejects with the request error otherwise.
  onAdd: (email: string, role: Role) => Promise<void>
  onClose: () => void
}

// Adds an email to the sign-in allowlist with its app role. Like the card
// dialog, it closes only with Esc, the X, or Cancel — never on a backdrop click.
export const AddUserDialog = ({ onAdd, onClose }: AddUserDialogProps) => {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // On window, not the overlay: a backdrop click moves focus to <body>.
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes('@')) {
      setError('A valid email is required.')
      return
    }
    setSubmitting(true)
    try {
      await onAdd(trimmed, role)
      onClose()
    } catch (requestError) {
      setError(
        (requestError as { status?: number }).status === 409
          ? 'That email already exists.'
          : 'Unable to add that user.',
      )
      setSubmitting(false)
    }
  }

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className='fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/15 p-4 backdrop-blur-sm'>
      <div
        role='dialog'
        aria-modal='true'
        aria-label='Add user'
        className='w-full max-w-sm rounded-xl border border-[var(--card-border-light)] bg-[var(--card-white)] p-6 shadow-[0_20px_48px_rgba(3,33,71,0.4)] sm:my-auto'
      >
        <div className='flex items-center justify-between gap-3'>
          <h3 className='font-display text-lg font-semibold text-[var(--navy-dark)]'>
            Add user
          </h3>
          <button
            type='button'
            onClick={onClose}
            aria-label='Close dialog'
            className='rounded-full p-1.5 text-black/50 transition hover:bg-black/5 hover:text-black'
          >
            <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' className='h-4 w-4' aria-hidden='true'>
              <path d='M18 6 6 18M6 6l12 12' />
            </svg>
          </button>
        </div>
        {error ? (
          <p role='alert' className='mt-2 text-sm font-semibold text-[var(--accent-red)]'>
            {error}
          </p>
        ) : null}
        <form onSubmit={handleSubmit} className='login-form mt-4'>
          <label>
            Email
            <input
              type='email'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder='name@example.com'
              autoComplete='off'
              required
              autoFocus
            />
          </label>
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
              <option value='user'>User</option>
              <option value='admin'>Admin</option>
            </select>
          </label>
          <div className='mt-2 flex justify-end gap-3'>
            <button
              type='button'
              onClick={onClose}
              className='rounded-full border border-[var(--stroke)] px-4 py-2 text-sm font-semibold text-black/70 transition hover:border-[var(--primary-blue)] hover:text-black'
            >
              Cancel
            </button>
            <button
              type='submit'
              disabled={submitting}
              className='rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60'
            >
              {submitting ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
