import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardDialog } from '@/components/CardDialog'
import { CARD_TITLE_MAX_LENGTH } from '@/lib/cardEditor'

const card = { id: 'card-1', title: 'Existing card', details: 'Some **notes**' }

describe('CardDialog', () => {
  it('disables saving until the card has a title', async () => {
    render(<CardDialog initialMode='create' onSave={vi.fn()} onClose={vi.fn()} />)
    const add = screen.getByRole('button', { name: 'Add card' })
    expect(add).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Card title'), 'Hello')
    expect(add).toBeEnabled()
    expect(screen.getByText(`5/${CARD_TITLE_MAX_LENGTH}`)).toBeInTheDocument()
  })

  it('caps the title at the limit', () => {
    render(<CardDialog initialMode='create' onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Card title')).toHaveAttribute(
      'maxLength',
      String(CARD_TITLE_MAX_LENGTH),
    )
  })

  it('saves with Cmd/Ctrl+Enter', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(<CardDialog initialMode='create' onSave={onSave} onClose={onClose} />)
    await userEvent.type(screen.getByLabelText('Card title'), '  Trimmed  ')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')

    expect(onSave).toHaveBeenCalledWith('Trimmed', '')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders the description as formatted text in view mode', () => {
    const { container } = render(
      <CardDialog initialMode='view' card={card} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    expect(container.ownerDocument.querySelector('strong')).toHaveTextContent('notes')
    expect(screen.queryByLabelText('Card title')).not.toBeInTheDocument()
  })

  it('closes with Escape when nothing changed', async () => {
    const onClose = vi.fn()
    render(<CardDialog initialMode='edit' card={card} onSave={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByLabelText('Card title'))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open when the backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<CardDialog initialMode='view' card={card} onSave={vi.fn()} onClose={onClose} />)
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement
    await userEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('still closes with Escape after focus has left the dialog', async () => {
    const onClose = vi.fn()
    render(<CardDialog initialMode='view' card={card} onSave={vi.fn()} onClose={onClose} />)
    act(() => (document.activeElement as HTMLElement | null)?.blur())
    expect(document.activeElement).toBe(document.body)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes from the Close button in view mode', async () => {
    const onClose = vi.fn()
    render(<CardDialog initialMode='view' card={card} onSave={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('asks before discarding unsaved changes', async () => {
    const onClose = vi.fn()
    render(<CardDialog initialMode='edit' card={card} onSave={vi.fn()} onClose={onClose} />)
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
