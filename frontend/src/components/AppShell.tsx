'use client'

import { useEffect, useRef, useState } from 'react'
import { BoardsView } from '@/components/BoardsView'
import { DashboardView } from '@/components/DashboardView'
import { UsersView } from '@/components/UsersView'
import { getSession } from '@/lib/api'

const logo = './mission-board-logo.png'

type View = 'home' | 'users' | 'boards'

type AppShellProps = {
  onLogout?: () => void
  remote?: boolean
}

export const AppShell = ({ onLogout, remote = false }: AppShellProps) => {
  const [view, setView] = useState<View>('boards')
  const [email, setEmail] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!remote) {
      return
    }
    getSession()
      .then((session) => setEmail(session.email ?? session.username))
      .catch(() => {})
  }, [remote])

  // Close the account menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <div className='relative h-screen overflow-hidden'>
      <nav className='absolute inset-x-0 top-0 z-50 border-b border-[var(--card-border-light)] bg-[var(--card-dark)] shadow-[0_4px_20px_rgba(0,0,0,0.16)] backdrop-blur'>
        <div className='mx-auto flex h-20 w-[95vw] max-w-[1500px] items-center justify-between'>
          <button
            type='button'
            onClick={() => setView('home')}
            className='admin-banner-logo-link'
            aria-label='Home'
          >
            <img src={logo} alt='Mission Board logo' className='logo' />
          </button>
          <div className='admin-banner-nav'>
            <button
              type='button'
              onClick={() => setView('boards')}
              className={`admin-banner-link ${view === 'boards' ? 'active' : ''}`}
            >
              Boards
            </button>
            <div className='admin-banner-usermenu' ref={menuRef}>
              <button
                type='button'
                onClick={() => setMenuOpen((open) => !open)}
                className={`admin-banner-usermenu-trigger ${
                  view === 'users' || menuOpen ? 'active' : ''
                }`}
                aria-haspopup='menu'
                aria-expanded={menuOpen}
                aria-label='Account menu'
              >
                <svg
                  width='22'
                  height='22'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  aria-hidden='true'
                >
                  <path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
                  <circle cx='9' cy='7' r='4' />
                  <path d='M22 21v-2a4 4 0 0 0-3-3.87' />
                  <path d='M16 3.13a4 4 0 0 1 0 7.75' />
                </svg>
              </button>
              {menuOpen ? (
                <div className='admin-banner-usermenu-dropdown' role='menu'>
                  <button
                    type='button'
                    role='menuitem'
                    className='admin-banner-usermenu-item'
                    onClick={() => {
                      setView('users')
                      setMenuOpen(false)
                    }}
                  >
                    Users
                  </button>
                  {onLogout ? (
                    <button
                      type='button'
                      role='menuitem'
                      className='admin-banner-usermenu-item'
                      onClick={() => {
                        setMenuOpen(false)
                        onLogout()
                      }}
                    >
                      Log out{email ? ` (${email})` : ''}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </nav>

      <div className='h-full overflow-y-auto pt-20 [scrollbar-gutter:stable]'>
        {view === 'home' ? (
          <main className='mx-auto max-w-[1500px] px-6 pb-16 pt-10'>
            <DashboardView onLogout={onLogout} remote={remote} />
          </main>
        ) : null}

        {view === 'users' ? (
          <main className='mx-auto max-w-[1500px] px-6 pb-16 pt-10'>
            <UsersView remote={remote} />
          </main>
        ) : null}

        {view === 'boards' ? (
          <BoardsView onLogout={onLogout} remote={remote} />
        ) : null}
      </div>
    </div>
  )
}
