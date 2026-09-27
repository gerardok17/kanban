import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BoardsView } from '@/components/BoardsView'
import {
  getBoardById,
  listBoardMembers,
  listBoards,
  listLabels,
  updateLabel,
  type BoardSummary,
} from '@/lib/api'
import type { Label } from '@/lib/labels'

vi.mock('@/lib/api', () => ({
  listBoards: vi.fn(),
  getBoardById: vi.fn(),
  listBoardMembers: vi.fn(),
  createBoard: vi.fn(),
  deleteBoard: vi.fn(),
  shareBoard: vi.fn(),
  unshareBoard: vi.fn(),
  listLabels: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
  addCard: vi.fn(),
  completeCard: vi.fn(),
  deleteCard: vi.fn(),
  editCard: vi.fn(),
  getBoard: vi.fn(),
  moveCard: vi.fn(),
  renameColumn: vi.fn(),
}))

const mine: BoardSummary = {
  id: 'board-mine',
  title: 'Mine',
  position: 0,
  isOwner: true,
  ownerEmail: 'me@example.com',
}
const theirs: BoardSummary = {
  id: 'board-theirs',
  title: 'Theirs',
  position: 0,
  isOwner: false,
  ownerEmail: 'friend@example.com',
}

describe('BoardsView with shared boards', () => {
  beforeEach(() => {
    // BoardsView mirrors the active board into ?board=; start each test clean.
    window.history.replaceState(null, '', '/')
    vi.mocked(listBoards).mockResolvedValue([mine, theirs])
    vi.mocked(listBoardMembers).mockResolvedValue([])
    vi.mocked(listLabels).mockResolvedValue([])
    // Both boards are empty, so only ownership decides whether Delete shows.
    vi.mocked(getBoardById).mockImplementation(async (boardId) => ({
      id: boardId,
      title: boardId,
      columns: [],
      cards: {},
      completed: [],
    }))
  })

  it('offers Delete Board only on an empty board you own', async () => {
    render(<BoardsView remote />)
    expect(await screen.findByRole('button', { name: 'Delete Board' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Mine/ }))
    await userEvent.click(screen.getByRole('button', { name: /Theirs/ }))

    expect(await screen.findByRole('button', { name: /^Theirs/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Board' })).not.toBeInTheDocument()
  })

  it("shows each card's labels and follows label changes made in the header", async () => {
    const bug: Label = { id: 'label-bug', name: 'Bug', color: 'red', cardCount: 1 }
    const boardWith = (label: Label) => ({
      id: 'board-mine',
      title: 'Mine',
      columns: [{ id: 'board-mine-col-backlog', title: 'Backlog', cardIds: ['card-1'] }],
      cards: { 'card-1': { id: 'card-1', title: 'Fix login', details: '', labelIds: [label.id] } },
      labels: [label],
      completed: [],
    })
    const defect = { ...bug, name: 'Defect' }
    vi.mocked(getBoardById).mockResolvedValueOnce(boardWith(bug)).mockResolvedValueOnce(boardWith(defect))
    vi.mocked(listLabels).mockResolvedValue([bug])
    vi.mocked(updateLabel).mockResolvedValue([defect])
    render(<BoardsView remote />)

    const card = await screen.findByTestId('card-card-1')
    expect(within(card).getByText('Bug')).toBeInTheDocument()
    const loads = vi.mocked(getBoardById).mock.calls.length

    // Renaming the label in the header reloads the board, and the chip follows.
    await userEvent.click(screen.getByRole('button', { name: /^Labels/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit label Bug' }))
    const name = screen.getByLabelText('Label name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Defect')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(card).findByText('Defect')).toBeInTheDocument()
    expect(vi.mocked(getBoardById).mock.calls.length).toBe(loads + 1)
  })

  it('marks boards shared with you in the board list', async () => {
    render(<BoardsView remote />)
    await userEvent.click(await screen.findByRole('button', { name: /^Mine/ }))
    expect(screen.getByTitle('Shared by friend@example.com')).toHaveTextContent('Shared')
  })
})
