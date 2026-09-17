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
  const [error, setError] = useState('')

  const usesBackendSession = () =>
    process.env.NEXT_PUBLIC_USE_REMOTE_BACKEND === '1' ||
    window.location.port === '8000' ||
    window.location.port === ''

  // Client-only value read hydration-safely: the server (and the first client
  // render) see false so the HTML matches, then the client re-renders with the
  // real value. Avoids a hydration mismatch on the Google button.
  const remoteMode = useSyncExternalStore(
    () => () => {},
    () => usesBackendSession(),
    () => false,
  )

  useEffect(() => {
    // Show, then clear, a one-time error passed back from the Google callback.
    const params = new URLSearchParams(window.location.search)
    const authError = params.get('auth_error')
    if (authError === 'not_allowed') {
      setError('That Google account is not allowed. Ask an admin to add it under Users.')
    } else if (authError === 'google') {
      setError('Google sign-in failed. Please try again.')
    }
    if (authError) {
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
              className='google-button'
              onClick={() => {
                window.location.href = '/api/auth/google/login'
              }}
            >
              <svg
                width='18'
                height='18'
                viewBox='0 0 18 18'
                aria-hidden='true'
                xmlns='http://www.w3.org/2000/svg'
              >
                <path
                  fill='#4285F4'
                  d='M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z'
                />
                <path
                  fill='#34A853'
                  d='M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z'
                />
                <path
                  fill='#FBBC05'
                  d='M3.97 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.33z'
                />
                <path
                  fill='#EA4335'
                  d='M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z'
                />
              </svg>
              Sign in with Google
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
