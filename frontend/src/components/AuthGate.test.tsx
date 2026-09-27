import { render, screen, within } from '@testing-library/react'
import { AuthGate } from '@/components/AuthGate'

// jsdom serves the page on port 3000, so the login runs in demo mode.
describe('AuthGate sign-in page', () => {
  beforeEach(() => {
    window.localStorage.removeItem('kanban-auth')
    window.history.replaceState(null, '', '/')
  })

  it('explains the invite-only access and who built it', () => {
    render(<AuthGate />)
    expect(
      screen.getByRole('heading', { name: 'Ready for your next mission?' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/invite-only/)).toBeInTheDocument()
    expect(screen.getByText(/Your password stays with Google/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enter demo' })).toBeInTheDocument()

    const credit = screen.getByText('Built by Gerardo Solorio with SAM').parentElement as HTMLElement
    const contact = within(credit).getByRole('link')
    expect(contact).toHaveAttribute('href', `mailto:${contact.textContent}`)
  })

  it('says when a Google account has no access yet, then clears it from the URL', () => {
    window.history.replaceState(null, '', '/?auth_error=not_allowed')
    render(<AuthGate />)
    expect(
      screen.getByText("This Google account doesn't have access yet. Ask an admin to add it."),
    ).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })
})
