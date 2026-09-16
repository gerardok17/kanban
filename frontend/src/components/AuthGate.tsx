'use client'

import { FormEvent, useEffect, useState, useSyncExternalStore } from 'react'
import { AppShell } from '@/components/AppShell'
import { getSession } from '@/lib/api'

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
  const [isSubmitting, setIsSubmitting] = useState(false)

  const usesBackendSession = () =>
    process.env.NEXT_PUBLIC_USE_REMOTE_BACKEND === '1' ||
    window.location.port === '8000' ||
    window.location.port === ''

  // Derived once at first client render (SSR-safe), so no effect-driven setState.
  const [remoteMode] = useState(
    () => typeof window !== 'undefined' && usesBackendSession(),
  )
  const [error, setError] = useState(() => {
    if (typeof window === 'undefined') return ''
    const authError = new URLSearchParams(window.location.search).get('auth_error')
    if (authError === 'not_allowed')
      return 'That Google account is not allowed. Ask an admin to add it under Users.'
    if (authError === 'google') return 'Google sign-in failed. Please try again.'
    return ''
  })

  useEffect(() => {
    // Clean the one-time auth_error param out of the URL after reading it above.
    const params = new URLSearchParams(window.location.search)
    if (params.has('auth_error')) {
      params.delete('auth_error')
      const query = params.toString()
      window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
    }
    if (!remoteMode) {
      return
    }
    // In remote mode the backend session cookie is the source of truth: if it is
    // valid (e.g. we just returned from Google), reflect signed-in state locally.
    getSession()
      .then(() => {
        window.localStorage.setItem('kanban-auth', 'signed-in')
        window.dispatchEvent(new Event(authEvent))
      })
      .catch(() => {})
  }, [remoteMode])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      if (usesBackendSession()) {
        // The backend authenticates against the users table (bcrypt) and is the
        // source of truth, so any valid user can sign in. No hardcoded check.
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        if (!response.ok) {
          setError('Invalid username or password.')
          return
        }
      } else if (
        // Demo mode has no backend, so fall back to the built-in demo credentials.
        username !== credentials.username ||
        password !== credentials.password
      ) {
        setError('Invalid username or password.')
        return
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

        {remoteMode ? (
          <>
            <div className='my-4 text-center text-sm text-[var(--gray-text)]'>or</div>
            <button
              type='button'
              className='login-button'
              onClick={() => {
                window.location.href = '/api/auth/google/login'
              }}
            >
              Sign in with Google
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
