import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardDialog } from '@/components/CardDialog'
import { CARD_TITLE_MAX_LENGTH } from '@/lib/cardEditor'
import type { Label } from '@/lib/labels'

const card = { id: 'card-1', title: 'Existing card', details: 'Some **notes**' }
const createdCard = {
  ...card,
  createdBy: 'alex@example.com',
  // Local 09:17 of the current year, so the expected text holds in any time
  // zone and any year (another year would add it to the date).
  createdAt: new Date(new Date().getFullYear(), 8, 17, 9, 17).toISOString(),
}
// The board around the dialog: its columns (the Status select), the one the
// card is in, and its labels.
const feature: Label = { id: 'label-feature', name: 'Feature', color: 'blue', cardCount: 0 }
const bug: Label = { id: 'label-bug', name: 'Bug', color: 'red', cardCount: 1 }
const board = {
  columns: [
    { id: 'col-backlog', title: 'Backlog', cardIds: [] },
    { id: 'col-progress', title: 'In Progress', cardIds: [] },
    { id: 'col-done', title: 'Done', cardIds: [] },
  ],
  initialColumnId: 'col-backlog',
  labels: [feature, bug],
}

describe('CardDialog', () => {
  it('disables saving until the card has a title', async () => {
    render(<CardDialog {...board} initialMode='create' onSave={vi.fn()} onClose={vi.fn()} />)
    const add = screen.getByRole('button', { name: 'Add card' })
    expect(add).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Card title'), 'Hello')
    expect(add).toBeEnabled()
    expect(screen.getByText(`5/${CARD_TITLE_MAX_LENGTH}`)).toBeInTheDocument()
  })

  it('caps the title at the limit', () => {
    render(<CardDialog {...board} initialMode='create' onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Card title')).toHaveAttribute(
      'maxLength',
      String(CARD_TITLE_MAX_LENGTH),
    )
  })

  it('saves with Cmd/Ctrl+Enter', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(<CardDialog {...board} initialMode='create' onSave={onSave} onClose={onClose} />)
    await userEvent.type(screen.getByLabelText('Card title'), '  Trimmed  ')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')

    expect(onSave).toHaveBeenCalledWith('Trimmed', '', 'col-backlog', [])
    expect(onClose).toHaveBeenCalled()
  })

  it('saves the chosen status, starting from the column the card is in', async () => {
    const onSave = vi.fn()
    render(<CardDialog {...board} initialMode='create' onSave={onSave} onClose={vi.fn()} />)
    const select = screen.getByLabelText('Status')
    expect(select).toHaveValue('col-backlog')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Backlog',
      'In Progress',
      'Done',
    ])

    await userEvent.type(screen.getByLabelText('Card title'), 'New')
    await userEvent.selectOptions(select, 'In Progress')
    await userEvent.click(screen.getByRole('button', { name: 'Add card' }))
    expect(onSave).toHaveBeenCalledWith('New', '', 'col-progress', [])
  })

  it('asks before discarding a status change', async () => {
    const onClose = vi.fn()
    render(<CardDialog {...board} initialMode='edit' card={card} onSave={vi.fn()} onClose={onClose} />)
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Done')
    await userEvent.keyboard('{Escape}')

    expect(screen.getByText('Discard changes?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders the description as formatted text in view mode', () => {
    const { container } = render(
      <CardDialog {...board} initialMode='view' card={card} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    expect(container.ownerDocument.querySelector('strong')).toHaveTextContent('notes')
    expect(screen.queryByLabelText('Card title')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
  })

  it('closes with Escape when nothing changed', async () => {
    const onClose = vi.fn()
    render(<CardDialog {...board} initialMode='edit' card={card} onSave={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByLabelText('Card title'))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open when the backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<CardDialog {...board} initialMode='view' card={card} onSave={vi.fn()} onClose={onClose} />)
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement
    await userEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('still closes with Escape after focus has left the dialog', async () => {
    const onClose = vi.fn()
    render(<CardDialog {...board} initialMode='view' card={card} onSave={vi.fn()} onClose={onClose} />)
    act(() => (document.activeElement as HTMLElement | null)?.blur())
    expect(document.activeElement).toBe(document.body)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows who created the card and when, in view and edit mode', async () => {
    render(<CardDialog {...board} initialMode='view' card={createdCard} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/^Created by/)).toHaveTextContent('Created by alex @ Sept 17th 09:17.')
    expect(screen.getByText('alex')).toHaveAttribute('title', 'alex@example.com')

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Card title')).toBeInTheDocument()
    expect(screen.getByText(/^Created by/)).toHaveTextContent('Created by alex @ Sept 17th 09:17.')
  })

  it('names a deleted creator, and shows no creator for a new card', () => {
    const { unmount } = render(
      <CardDialog
        {...board}
        initialMode='view'
        card={{ ...createdCard, createdBy: null }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/^Created by/)).toHaveTextContent(
      'Created by a deleted user @ Sept 17th 09:17.',
    )
    unmount()

    render(<CardDialog {...board} initialMode='create' onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByText(/^Created by/)).not.toBeInTheDocument()
  })

  it('toggles labels, counts that as a change, and saves them', async () => {
    const onSave = vi.fn()
    // "label-gone" was deleted from the board; the card drops it on save.
    const labelled = { ...card, labelIds: ['label-bug', 'label-gone'] }
    render(<CardDialog {...board} initialMode='edit' card={labelled} onSave={onSave} onClose={vi.fn()} />)
    const toggles = within(screen.getByRole('group', { name: 'Labels' }))
    expect(toggles.getByRole('button', { name: 'Bug' })).toHaveAttribute('aria-pressed', 'true')
    expect(toggles.getByRole('button', { name: 'Feature' })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(toggles.getByRole('button', { name: 'Feature' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByText('Discard changes?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith('Existing card', expect.any(String), 'col-backlog', [
      'label-bug',
      'label-feature',
    ])
  })

  it("shows the card's labels, read-only, in view mode", () => {
    render(
      <CardDialog
        {...board}
        initialMode='view'
        card={{ ...card, labelIds: ['label-bug'] }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Bug')).toBeInTheDocument()
    expect(screen.queryByText('Feature')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Labels' })).not.toBeInTheDocument()
  })

  it('closes from the Close button in view mode', async () => {
    const onClose = vi.fn()
    render(<CardDialog {...board} initialMode='view' card={card} onSave={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('asks before discarding unsaved changes', async () => {
    const onClose = vi.fn()
    render(<CardDialog {...board} initialMode='edit' card={card} onSave={vi.fn()} onClose={onClose} />)
    await userEvent.type(screen.getByLabelText('Card title'), ' changed')
    await userEvent.keyboard('{Escape}')

    expect(screen.getByText('Discard changes?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Card title')).toHaveValue('Existing card changed')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalled()
  })
})
