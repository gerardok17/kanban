'use client'

import { useEffect, useState } from 'react'

type User = {
  id: string
  username: string
  created_at: string | null
}

export const UsersView = ({ remote = false }: { remote?: boolean }) => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(remote)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!remote) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    fetch('/api/users', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load users')
        }
        return response.json()
      })
      .then((data: User[]) => setUsers(data))
      .catch((requestError: { name?: string }) => {
        if (requestError.name !== 'AbortError') {
          setError('Unable to load users.')
        }
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [remote])

  return (
    <div className='admin-page'>
      <h1>Users</h1>
      {error ? (
        <p role='alert' className='text-sm font-semibold text-[var(--accent-red)]'>
          {error}
        </p>
      ) : null}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className='users-table'>
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.username}</td>
                <td>
                  {user.created_at
                    ? new Date(user.created_at).toLocaleString()
                    : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
