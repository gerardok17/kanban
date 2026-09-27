import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsersView } from '@/components/UsersView'
import { createUser, listUsers, updateUserRole, type User } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUserRole: vi.fn(),
  deleteUser: vi.fn(),
}))

const owner: User = {
  id: 'user-owner',
  username: 'owner@example.com',
  email: 'owner@example.com',
  role: 'admin',
  created_at: null,
}
const friend: User = {
  id: 'user-friend',
  username: 'friend@example.com',
  email: 'friend@example.com',
  role: 'user',
  created_at: null,
}

describe('UsersView', () => {
  beforeEach(() => {
    vi.mocked(listUsers).mockResolvedValue([owner, friend])
  })

  it('shows each role, with the owner locked as admin', async () => {
    render(<UsersView remote />)
    const ownerRole = await screen.findByLabelText('Role for owner@example.com')
    expect(ownerRole).toHaveValue('admin')
    expect(ownerRole).toBeDisabled()
    expect(screen.getByLabelText('Role for friend@example.com')).toHaveValue('user')
    expect(screen.getByLabelText('Role for friend@example.com')).toBeEnabled()
  })

  it('changes a role from the table', async () => {
    vi.mocked(updateUserRole).mockResolvedValue([owner, { ...friend, role: 'admin' }])
    render(<UsersView remote />)
    const friendRole = await screen.findByLabelText('Role for friend@example.com')

    await userEvent.selectOptions(friendRole, 'admin')

    expect(updateUserRole).toHaveBeenCalledWith('user-friend', 'admin')
    expect(screen.getByLabelText('Role for friend@example.com')).toHaveValue('admin')
  })

  it('adds a user through the dialog', async () => {
    const added: User = { ...friend, id: 'user-new', username: 'new@example.com', email: 'new@example.com' }
    vi.mocked(createUser).mockResolvedValue([owner, friend, added])
    render(<UsersView remote />)
    await screen.findByLabelText('Role for friend@example.com')

    await userEvent.click(screen.getByRole('button', { name: 'Add user' }))
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(createUser).toHaveBeenCalledWith('new@example.com', 'user')
    expect(await screen.findByText('new@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
