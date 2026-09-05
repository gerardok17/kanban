'use client'

import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { createUser, deleteUser, listUsers, type User } from '@/lib/api'

export const UsersView = ({ remote = false }: { remote?: boolean }) => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(remote)
  const [error, setError] = useState('')
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ username: '', password: '' })
  const [createError, setCreateError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!remote) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    listUsers(controller.signal)
      .then((data) => setUsers(data))
      .catch((requestError: { name?: string }) => {
        if (requestError.name !== 'AbortError') {
          setError('Unable to load users.')
        }
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [remote])

  const handleDelete = async (user: User) => {
    try {
      const next = await deleteUser(user.id)
      setUsers(next)
      setError('')
    } catch {
      setError('Unable to delete that user.')
    } finally {
      setUserToDelete(null)
    }
  }

  const openCreate = () => {
    setForm({ username: '', password: '' })
    setCreateError('')
    setShowCreate(true)
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const username = form.username.trim()
    const password = form.password
    if (!username || !password) {
      setCreateError('Username and password are required.')
      return
    }
    setSubmitting(true)
    try {
      const next = await createUser(username, password)
      setUsers(next)
      setShowCreate(false)
    } catch (requestError) {
      setCreateError(
        (requestError as { status?: number }).status === 409
          ? 'That username already exists.'
          : 'Unable to create that user.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className='admin-page'>
      <div className='flex items-center justify-between gap-3'>
        <h1 className='!mb-0 !border-0 !pb-0'>Users</h1>
        {remote ? (
          <button
            type='button'
            onClick={openCreate}
            className='rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110'
          >
            Create
          </button>
        ) : null}
      </div>

      {error ? (
        <p role='alert' className='mt-4 text-sm font-semibold text-[var(--accent-red)]'>
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className='mt-4'>Loading...</p>
      ) : (
        <table className='users-table mt-6'>
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => (
              <tr key={user.id}>
                <td>{index + 1}</td>
                <td>{user.username}</td>
                <td>
                  {user.created_at
                    ? new Date(user.created_at).toLocaleString()
                    : ''}
                </td>
                <td>
                  <button
                    type='button'
                    onClick={() => setUserToDelete(user)}
                    disabled={index === 0}
                    className='rounded-full bg-[var(--accent-red)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={userToDelete !== null}
        title='Delete user'
        message={
          userToDelete
            ? `"${userToDelete.username}" will be permanently removed, along with their boards.`
            : ''
        }
        confirmLabel='Delete'
        cancelLabel='Cancel'
        onConfirm={() => {
          if (userToDelete) {
            void handleDelete(userToDelete)
          }
        }}
        onCancel={() => setUserToDelete(null)}
      />

      {showCreate && typeof document !== 'undefined'
        ? createPortal(
            <div
              className='fixed inset-0 z-[100] flex items-center justify-center bg-black/15 p-4 backdrop-blur-sm'
              role='dialog'
              aria-modal='true'
              onClick={() => setShowCreate(false)}
            >
              <div
                className='w-full max-w-sm rounded-xl border border-[var(--card-border-light)] bg-[var(--card-white)] p-6 shadow-[0_20px_48px_rgba(3,33,71,0.4)]'
                onClick={(event) => event.stopPropagation()}
              >
                <h3 className='font-display text-lg font-semibold text-[var(--navy-dark)]'>
                  Create user
                </h3>
                {createError ? (
                  <p className='mt-2 text-sm font-semibold text-[var(--accent-red)]'>
                    {createError}
                  </p>
                ) : null}
                <form onSubmit={handleCreate} className='login-form mt-4'>
                  <label>
                    Username
                    <input
                      type='text'
                      value={form.username}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, username: event.target.value }))
                      }
                      placeholder='username'
                      autoComplete='off'
                      required
                      autoFocus
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type='password'
                      value={form.password}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      placeholder='password'
                      autoComplete='new-password'
                      required
                    />
                  </label>
                  <div className='mt-2 flex justify-end gap-3'>
                    <button
                      type='button'
                      onClick={() => setShowCreate(false)}
                      className='rounded-full border border-[var(--stroke)] px-4 py-2 text-sm font-semibold text-black/70 transition hover:border-[var(--primary-blue)] hover:text-black'
                    >
                      Cancel
                    </button>
                    <button
                      type='submit'
                      disabled={submitting}
                      className='rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60'
                    >
                      {submitting ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
