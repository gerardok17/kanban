import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LabelsSelector } from '@/components/LabelsSelector'
import { createLabel, deleteLabel, listLabels, updateLabel, type Label } from '@/lib/api'
import { LABEL_COLOR_KEYS } from '@/lib/labels'

vi.mock('@/lib/api', () => ({
  listLabels: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
}))

const feature: Label = { id: 'label-feature', name: 'Feature', color: 'blue', cardCount: 0 }
const bug: Label = { id: 'label-bug', name: 'Bug', color: 'red', cardCount: 2 }

const openSelector = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /labels/i }))
}

const colorChoices = () =>
  within(screen.getByRole('group', { name: 'Label color' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))

describe('LabelsSelector', () => {
  beforeEach(() => {
    vi.mocked(listLabels).mockResolvedValue([feature, bug])
  })

  it('lists the board labels with their count', async () => {
    render(<LabelsSelector boardId='board-1' />)
    expect(await screen.findByRole('button', { name: 'Labels 2 ▾' })).toBeInTheDocument()
    await openSelector()
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Feature',
      'Bug',
    ])
  })

  it('adds a label, offering only the colors no other label uses', async () => {
    const design: Label = { id: 'label-design', name: 'Design', color: 'green', cardCount: 0 }
    vi.mocked(createLabel).mockResolvedValue([feature, design, bug])
    render(<LabelsSelector boardId='board-1' />)
    await openSelector()
    await userEvent.click(screen.getByRole('button', { name: '+ New label' }))

    expect(colorChoices()).toEqual(['green', 'yellow', 'gray', 'purple', 'pink', 'orange'])
    expect(screen.getByRole('button', { name: 'green' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.type(screen.getByLabelText('Label name'), 'Design')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(createLabel).toHaveBeenCalledWith('board-1', 'Design', 'green')
    expect(await screen.findByText('Design')).toBeInTheDocument()
  })

  it('edits a label in place, where it keeps its own color', async () => {
    vi.mocked(updateLabel).mockResolvedValue([feature, { ...bug, name: 'Defect', color: 'orange' }])
    render(<LabelsSelector boardId='board-1' />)
    await openSelector()
    await userEvent.click(screen.getByRole('button', { name: 'Edit label Bug' }))

    expect(colorChoices()).toContain('red')
    expect(colorChoices()).not.toContain('blue')

    const name = screen.getByLabelText('Label name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Defect')
    await userEvent.click(screen.getByRole('button', { name: 'orange' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(updateLabel).toHaveBeenCalledWith('board-1', 'label-bug', 'Defect', 'orange')
  })

  it('confirms a delete, saying how many cards lose the label', async () => {
    vi.mocked(deleteLabel).mockResolvedValue([feature])
    render(<LabelsSelector boardId='board-1' />)
    await openSelector()
    await userEvent.click(screen.getByRole('button', { name: 'Delete label Bug' }))

    expect(screen.getByText('"Bug" will be removed from 2 cards and deleted.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteLabel).toHaveBeenCalledWith('board-1', 'label-bug')
  })

  it("shows the server's reason when a label cannot be saved", async () => {
    vi.mocked(createLabel).mockRejectedValue(
      Object.assign(new Error('Rejected'), { detail: 'That color is already used on this board.' }),
    )
    render(<LabelsSelector boardId='board-1' />)
    await openSelector()
    await userEvent.click(screen.getByRole('button', { name: '+ New label' }))
    await userEvent.type(screen.getByLabelText('Label name'), 'Late')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That color is already used on this board.',
    )
  })

  it('stops offering new labels once all eight colors are used', async () => {
    vi.mocked(listLabels).mockResolvedValue(
      LABEL_COLOR_KEYS.map((color) => ({ id: `label-${color}`, name: color, color, cardCount: 0 })),
    )
    render(<LabelsSelector boardId='board-1' />)
    await openSelector()

    expect(screen.getByText('All 8 colors are in use.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ New label' })).not.toBeInTheDocument()
  })
})
