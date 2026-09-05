'use client'

import { FormEvent, useState, useSyncExternalStore } from 'react'
import { AppShell } from '@/components/AppShell'

const credentials = { username: 'gerardok17', password: 'gerardok17' }
const authEvent = 'kanban-auth-change'

const subscribeToAuth = (onChange: () => void) => {
  window.addEventListener(authEvent, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(authEvent, onChange)
    window.removeEventListener('storage', onChange)
  }
}

const getAuthState = () =>
  window.localStorage.getItem('kanban-auth') === 'signed-in'
const getServerAuthState = () => false

export const AuthGate = () => {
  const isSignedIn = useSyncExternalStore(
    subscribeToAuth,
    getAuthState,
    getServerAuthState,
  )
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const usesBackendSession = () =>
    process.env.NEXT_PUBLIC_USE_REMOTE_BACKEND === '1' ||
    window.location.port === '8000' ||
    window.location.port === ''

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (
      username !== credentials.username ||
      password !== credentials.password
    ) {
      setError('Invalid username or password.')
      return
    }

    setIsSubmitting(true)
    try {
      if (usesBackendSession()) {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        if (!response.ok) {
          setError('Unable to sign in right now.')
          return
        }
      }
      window.localStorage.setItem('kanban-auth', 'signed-in')
      window.dispatchEvent(new Event(authEvent))
    } catch {
      setError('Unable to sign in right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = async () => {
    if (usesBackendSession()) {
      try {
        await fetch('/api/auth/logout', { method: 'POST' })
      } catch {
        // Sign out locally regardless; the backend session cookie expires on its own.
      }
    }
    window.localStorage.removeItem('kanban-auth')
    window.dispatchEvent(new Event(authEvent))
    setUsername('')
    setPassword('')
  }

  if (isSignedIn) {
    return <AppShell onLogout={handleLogout} remote={usesBackendSession()} />
  }

  return (
    <div className='admin-login-page'>
      <div className='admin-login-card'>
        <h1>Sign in</h1>
        <p>Sign in to open your Kanban board.</p>

        {error ? <div className='login-error'>{error}</div> : null}

        <form onSubmit={handleSubmit} className='login-form'>
          <label>
            Username
            <input
              type='text'
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder='username'
              autoComplete='username'
              required
              autoFocus
            />
          </label>

          <label>
            Password
            <input
              type='password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder='password'
              autoComplete='current-password'
              required
            />
          </label>

          <button type='submit' className='login-button' disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
