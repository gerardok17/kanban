'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppShell } from '@/components/AppShell'
import { getSession } from '@/lib/api'

const authEvent = 'kanban-auth-change'
const logo = './mission-board-logo.png'

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
    const message =
      authError === 'not_allowed'
        ? "This Google account doesn't have access yet. Ask an admin to add it."
        : authError === 'google'
          ? 'Google sign-in failed. Please try again.'
          : ''
    if (message) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time error derived from the URL on mount; window is not available in an SSR state initializer
      setError(message)
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

  const enterDemo = () => {
    // Demo mode has no backend and no real data, so entry is a local marker only.
    window.localStorage.setItem('kanban-auth', 'signed-in')
    window.dispatchEvent(new Event(authEvent))
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
  }

  if (isSignedIn) {
    return <AppShell onLogout={handleLogout} remote={usesBackendSession()} />
  }

  // Split screen: the brand on the banner's navy, the sign-in on the columns'
  // gray. On phones it stacks (brand, sign-in, contact) and scrolls on its own,
  // since the body never scrolls.
  return (
    <div className='h-dvh overflow-y-auto'>
      <div className='flex min-h-full flex-col md:grid md:grid-cols-2 md:grid-rows-[1fr_auto]'>
        <section className='flex flex-col items-center justify-center gap-5 bg-[var(--card-dark)] px-8 pt-10 pb-6 text-center md:col-start-1 md:row-start-1 md:py-16'>
          {/* eslint-disable-next-line @next/next/no-img-element -- static export: no image optimizer */}
          <img src={logo} alt='Mission Board' className='w-full max-w-[260px] md:max-w-[420px]' />
          <p className='font-display text-lg text-white/85 md:text-xl'>
            Every mission, on one board.
          </p>
        </section>

        <section className='flex flex-1 items-center justify-center bg-white/55 px-6 py-12 md:col-start-2 md:row-span-2 md:row-start-1'>
          <div className='w-full max-w-sm'>
            <h1 className='font-display text-3xl font-semibold text-[var(--navy-dark)]'>
              Ready for your next mission?
            </h1>
            <p className='mt-3 text-[var(--gray-text)]'>
              Mission Board is invite-only. Sign in with the Google account an admin added
              for you.
            </p>

            <div className='mt-6'>
              {error ? <div className='login-error'>{error}</div> : null}

              {remoteMode ? (
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
              ) : (
                <button type='button' className='login-button w-full' onClick={enterDemo}>
                  Enter demo
                </button>
              )}
            </div>

            <p className='mt-8 flex gap-2 border-t border-[var(--stroke)] pt-5 text-xs leading-relaxed text-[var(--gray-text)]'>
              <svg
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
                className='mt-0.5 h-3.5 w-3.5 shrink-0'
                aria-hidden='true'
              >
                <rect x='4' y='11' width='16' height='10' rx='2' />
                <path d='M8 11V7a4 4 0 0 1 8 0v4' />
              </svg>
              <span>
                Your password stays with Google. Mission Board never sees or stores it:
                Google confirms who you are, and all we keep is your email address.
              </span>
            </p>
          </div>
        </section>

        <footer className='bg-[var(--card-dark)] px-8 pt-4 pb-8 text-center text-sm text-white/70 md:col-start-1 md:row-start-2'>
          <p>Built by Gerardo Solorio with SAM</p>
          <a
            href='mailto:geracedeno@gmail.com'
            className='text-[var(--accent-yellow)] transition hover:underline'
          >
            geracedeno@gmail.com
          </a>
        </footer>
      </div>
    </div>
  )
}
