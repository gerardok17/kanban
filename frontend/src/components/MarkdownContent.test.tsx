import { render, screen } from '@testing-library/react'
import { MarkdownContent } from '@/components/MarkdownContent'

describe('MarkdownContent', () => {
  it('renders the supported formatting', () => {
    const { container } = render(
      <MarkdownContent markdown={'**bold** text\n\n- [x] done\n- [ ] todo'} />,
    )
    expect(container.querySelector('strong')).toHaveTextContent('bold')
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('shows raw HTML as text and never renders it', () => {
    const { container } = render(
      <MarkdownContent
        markdown={'<script>alert(1)</script> <img src=x onerror="alert(1)">'}
      />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('<script>alert(1)</script>')
  })

  it('strips javascript: links', () => {
    render(<MarkdownContent markdown='[click me](javascript:alert(1))' />)
    expect(screen.getByText('click me').closest('a')).toBeNull()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('opens safe links in a new tab without an opener', () => {
    render(<MarkdownContent markdown='[docs](https://example.com)' />)
    const link = screen.getByRole('link', { name: 'docs' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('keeps single line breaks from plain-text descriptions', () => {
    const { container } = render(<MarkdownContent markdown={'one\ntwo'} />)
    expect(container.querySelector('br')).not.toBeNull()
  })
})
