import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SharedWithSelector } from '@/components/SharedWithSelector'
import { listBoardMembers, shareBoard, unshareBoard, type BoardMember } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  listBoardMembers: vi.fn(),
  shareBoard: vi.fn(),
  unshareBoard: vi.fn(),
}))

const owner: BoardMember = { id: 'user-owner', email: 'owner@example.com', isOwner: true }
const friend: BoardMember = { id: 'user-friend', email: 'friend@example.com', isOwner: false }

const openSelector = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /shared with/i }))
}

describe('SharedWithSelector', () => {
  beforeEach(() => {
    vi.mocked(listBoardMembers).mockResolvedValue([owner, friend])
  })

  it('lists who has access, owner first, with the shared count', async () => {
    render(<SharedWithSelector boardId='board-1' isOwner />)
    expect(await screen.findByRole('button', { name: 'Shared with 1 ▾' })).toBeInTheDocument()
    await openSelector()

    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('owner@example.com')
    expect(rows[0]).toHaveTextContent('Owner')
    expect(rows[1]).toHaveTextContent('friend@example.com')
  })

  it('lets the owner share with an email and confirms it', async () => {
    const newcomer: BoardMember = { id: 'user-new', email: 'new@example.com', isOwner: false }
    vi.mocked(shareBoard).mockResolvedValue([owner, friend, newcomer])
    render(<SharedWithSelector boardId='board-1' isOwner />)
    await openSelector()

    await userEvent.click(screen.getByRole('button', { name: '+ Share with email' }))
    await userEvent.type(screen.getByLabelText('Email to share with'), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(shareBoard).toHaveBeenCalledWith('board-1', 'new@example.com')
    expect(await screen.findByRole('status')).toHaveTextContent('Board shared with new@example.com.')
    expect(screen.getByText('new@example.com')).toBeInTheDocument()
  })

  it("shows the server's reason when an email cannot be shared", async () => {
    vi.mocked(shareBoard).mockRejectedValue(
      Object.assign(new Error('failed'), {
        status: 422,
        detail: "This email hasn't been added as a user yet. Only an admin can add users.",
      }),
    )
    render(<SharedWithSelector boardId='board-1' isOwner />)
    await openSelector()

    await userEvent.click(screen.getByRole('button', { name: '+ Share with email' }))
    await userEvent.type(screen.getByLabelText('Email to share with'), 'stranger@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This email hasn't been added as a user yet. Only an admin can add users.",
    )
  })

  it('stops sharing after confirmation', async () => {
    vi.mocked(unshareBoard).mockResolvedValue([owner])
    render(<SharedWithSelector boardId='board-1' isOwner />)
    await openSelector()

    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing with friend@example.com' }))
    expect(screen.getByText('"friend@example.com" will lose access to this board.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(unshareBoard).toHaveBeenCalledWith('board-1', 'user-friend')
    expect(screen.queryByText('friend@example.com')).not.toBeInTheDocument()
    // The list stays open after the confirmation.
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
  })

  it('is read-only for members', async () => {
    render(<SharedWithSelector boardId='board-1' isOwner={false} />)
    await openSelector()

    expect(await screen.findByText('friend@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /stop sharing/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Share with email' })).not.toBeInTheDocument()
  })
})
