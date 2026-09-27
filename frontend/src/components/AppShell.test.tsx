import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppShell } from '@/components/AppShell'
import { getSession } from '@/lib/api'

vi.mock('@/lib/api', () => ({ getSession: vi.fn() }))
// The views are not under test here; stub them so no data is fetched.
vi.mock('@/components/BoardsView', () => ({ BoardsView: () => null }))
vi.mock('@/components/DashboardView', () => ({ DashboardView: () => null }))
vi.mock('@/components/UsersView', () => ({ UsersView: () => <p>Users page</p> }))

const signInAs = (role: 'admin' | 'user') =>
  vi.mocked(getSession).mockResolvedValue({
    username: `${role}@example.com`,
    email: `${role}@example.com`,
    role,
  })

const openAccountMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
}

describe('AppShell user administration', () => {
  it('offers Users to admins', async () => {
    signInAs('admin')
    render(<AppShell remote />)
    await screen.findByRole('button', { name: 'Account menu' })
    await openAccountMenu()

    await userEvent.click(await screen.findByRole('menuitem', { name: 'Users' }))
    expect(screen.getByText('Users page')).toBeInTheDocument()
  })

  it('hides Users from regular users', async () => {
    signInAs('user')
    render(<AppShell remote onLogout={vi.fn()} />)
    await openAccountMenu()

    // The email in "Log out" proves the session (and its role) has loaded.
    expect(
      await screen.findByRole('menuitem', { name: 'Log out (user@example.com)' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Users' })).not.toBeInTheDocument()
  })
})
