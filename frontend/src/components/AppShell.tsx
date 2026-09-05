'use client'

import { useEffect, useState } from 'react'
import { BoardsView } from '@/components/BoardsView'
import { DashboardView } from '@/components/DashboardView'
import { UsersView } from '@/components/UsersView'
import { getSession } from '@/lib/api'

const logo = './main-logo.png'

type View = 'home' | 'users' | 'boards'

type AppShellProps = {
  onLogout?: () => void
  remote?: boolean
}

export const AppShell = ({ onLogout, remote = false }: AppShellProps) => {
  const [view, setView] = useState<View>('boards')
  const [username, setUsername] = useState('')

  useEffect(() => {
    if (!remote) {
      return
    }
    getSession()
      .then((session) => setUsername(session.username))
      .catch(() => {})
  }, [remote])

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
              onClick={() => setView('users')}
              className={`admin-banner-link ${view === 'users' ? 'active' : ''}`}
            >
              Users
            </button>
            <button
              type='button'
              onClick={() => setView('boards')}
              className={`admin-banner-link ${view === 'boards' ? 'active' : ''}`}
            >
              Boards
            </button>
            {onLogout ? (
              <button
                type='button'
                onClick={onLogout}
                className='admin-banner-link logout-button'
              >
                Log out{username ? ` (${username})` : ''}
              </button>
            ) : null}
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
