'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
  listBoardMembers,
  shareBoard,
  unshareBoard,
  type ApiError,
  type BoardMember,
} from '@/lib/api'

type SharedWithSelectorProps = {
  // Mount with key={boardId} so switching boards starts from fresh state.
  boardId: string
  // Only the owner shares and unshares; everyone else gets a read-only list.
  isOwner: boolean
}

// Who a board is shared with, next to the board selector.
export const SharedWithSelector = ({ boardId, isOwner }: SharedWithSelectorProps) => {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<BoardMember[]>([])
  const [sharing, setSharing] = useState(false)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [memberToRemove, setMemberToRemove] = useState<BoardMember | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listBoardMembers(boardId)
      .then(setMembers)
      .catch(() => setError('Unable to load who this board is shared with.'))
  }, [boardId])

  useEffect(() => {
    // Stay open while the remove confirmation (rendered outside) is showing.
    if (!open || memberToRemove) {
      return
    }
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setSharing(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open, memberToRemove])

  const sharedCount = members.filter((member) => !member.isOwner).length

  const submitShare = async (event: FormEvent) => {
    event.preventDefault()
    const target = email.trim()
    if (!target) {
      return
    }
    setSubmitting(true)
    setNotice('')
    setError('')
    try {
      setMembers(await shareBoard(boardId, target))
      setNotice(`Board shared with ${target}.`)
      setEmail('')
      setSharing(false)
    } catch (requestError) {
      setError((requestError as ApiError).detail ?? 'Unable to share this board.')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmRemove = async () => {
    if (!memberToRemove) {
      return
    }
    setNotice('')
    setError('')
    try {
      setMembers(await unshareBoard(boardId, memberToRemove.id))
    } catch {
      setError('Unable to stop sharing with that user.')
    } finally {
      setMemberToRemove(null)
    }
  }

  return (
    <div ref={containerRef} className='relative'>
      <button
        type='button'
        onClick={() => setOpen((value) => !value)}
        className='flex items-center gap-2 rounded-xl border border-[var(--stroke)] bg-white px-4 py-2 text-sm font-semibold text-[var(--navy-dark)] shadow-[var(--shadow)] transition hover:border-[var(--primary-blue)]'
      >
        <span>Shared with</span>
        {sharedCount > 0 ? (
          <span className='rounded-full bg-[var(--primary-blue)] px-2 text-xs text-white'>
            {sharedCount}
          </span>
        ) : null}
        <span className='text-[var(--gray-text)]'>▾</span>
      </button>

      {open ? (
        <div className='absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-[var(--stroke)] bg-white shadow-[var(--shadow)]'>
          <ul className='max-h-72 overflow-y-auto py-1'>
            {members.map((member) => (
              <li
                key={member.id}
                className='flex items-center justify-between gap-2 px-4 py-2 text-sm text-[var(--navy-dark)]'
              >
                <span className='truncate' title={member.email}>
                  {member.email}
                </span>
                {member.isOwner ? (
                  <span className='rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--gray-text)]'>
                    Owner
                  </span>
                ) : isOwner ? (
                  <button
                    type='button'
                    onClick={() => setMemberToRemove(member)}
                    aria-label={`Stop sharing with ${member.email}`}
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
                ) : null}
              </li>
            ))}
          </ul>

          {notice ? (
            <p role='status' className='px-4 pb-2 text-xs font-semibold text-[var(--accent-green)]'>
              {notice}
            </p>
          ) : null}
          {error ? (
            <p role='alert' className='px-4 pb-2 text-xs font-semibold text-[var(--accent-red)]'>
              {error}
            </p>
          ) : null}

          {isOwner ? (
            <div className='border-t border-[var(--stroke)] p-2'>
              {sharing ? (
                <form onSubmit={submitShare} className='flex items-center gap-2'>
                  <input
                    autoFocus
                    type='email'
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder='name@example.com'
                    aria-label='Email to share with'
                    className='w-full rounded-lg border border-[var(--stroke)] px-2 py-1.5 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]'
                  />
                  <button
                    type='submit'
                    disabled={submitting}
                    className='rounded-lg bg-[var(--primary-blue)] px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60'
                  >
                    Share
                  </button>
                </form>
              ) : (
                <button
                  type='button'
                  onClick={() => {
                    setSharing(true)
                    setNotice('')
                    setError('')
                  }}
                  className='w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[var(--primary-blue)] transition hover:bg-[var(--surface)]'
                >
                  + Share with email
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={memberToRemove !== null}
        title='Stop sharing'
        message={
          memberToRemove ? `"${memberToRemove.email}" will lose access to this board.` : ''
        }
        confirmLabel='Remove'
        cancelLabel='Cancel'
        onConfirm={() => void confirmRemove()}
        onCancel={() => setMemberToRemove(null)}
      />
    </div>
  )
}
