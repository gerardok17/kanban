import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddUserDialog } from '@/components/AddUserDialog'

describe('AddUserDialog', () => {
  it('adds a user with the chosen role', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<AddUserDialog onAdd={onAdd} onClose={onClose} />)

    expect(screen.getByLabelText('Role')).toHaveValue('user')
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'admin')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onAdd).toHaveBeenCalledWith('new@example.com', 'admin')
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open and explains a duplicate email', async () => {
    const onAdd = vi.fn().mockRejectedValue({ status: 409 })
    const onClose = vi.fn()
    render(<AddUserDialog onAdd={onAdd} onClose={onClose} />)

    await userEvent.type(screen.getByLabelText('Email'), 'taken@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That email already exists.')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays open when the backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<AddUserDialog onAdd={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes with Escape, even after focus has left the dialog', async () => {
    const onClose = vi.fn()
    render(<AddUserDialog onAdd={vi.fn()} onClose={onClose} />)
    act(() => (document.activeElement as HTMLElement | null)?.blur())

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes from the X and from Cancel', async () => {
    const onClose = vi.fn()
    render(<AddUserDialog onAdd={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
