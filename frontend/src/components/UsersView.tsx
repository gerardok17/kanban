'use client'

import { useEffect, useState } from 'react'
import { AddUserDialog } from '@/components/AddUserDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
  createUser,
  deleteUser,
  listUsers,
  updateUserRole,
  type Role,
  type User,
} from '@/lib/api'

// Admin-only: AppShell shows this view to admins, and the API enforces it.

export const UsersView = ({ remote = false }: { remote?: boolean }) => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(remote)
  const [error, setError] = useState('')
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (!remote) {
      // `loading` already initialises to `remote` (false here), so there is
      // nothing to reset — just skip the fetch in demo mode.
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

  const handleRoleChange = async (user: User, role: Role) => {
    try {
      setUsers(await updateUserRole(user.id, role))
      setError('')
    } catch {
      setError('Unable to change that role.')
    }
  }

  const handleCreate = async (email: string, role: Role) => {
    setUsers(await createUser(email, role))
    setError('')
  }

  return (
    <div className='admin-page'>
      <div className='flex items-center justify-between gap-3'>
        <h1 className='!mb-0 !border-0 !pb-0'>Users</h1>
        {remote ? (
          <button
            type='button'
            onClick={() => setShowCreate(true)}
            className='rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110'
          >
            Add user
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
              <th>Email</th>
              <th>Role</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => (
              <tr key={user.id}>
                <td>{index + 1}</td>
                <td>{user.email ?? user.username}</td>
                <td>
                  {/* The first user is the owner: always an admin. */}
                  <select
                    value={user.role}
                    onChange={(event) =>
                      void handleRoleChange(user, event.target.value as Role)
                    }
                    disabled={index === 0}
                    aria-label={`Role for ${user.email ?? user.username}`}
                    className='rounded-lg border border-[var(--stroke)] bg-white px-2 py-1 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] disabled:cursor-not-allowed disabled:opacity-60'
                  >
                    <option value='user'>User</option>
                    <option value='admin'>Admin</option>
                  </select>
                </td>
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
            ? `"${userToDelete.email ?? userToDelete.username}" will be permanently removed, along with their boards.`
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

      {showCreate ? (
        <AddUserDialog onAdd={handleCreate} onClose={() => setShowCreate(false)} />
      ) : null}
    </div>
  )
}
