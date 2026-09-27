import { Editor } from '@tiptap/core'
import { cardEditorExtensions } from '@/lib/cardEditor'

// Loads Markdown into the card editor and serialises it back, as happens when
// an existing card is opened and saved.
const roundTrip = (markdown: string) => {
  const editor = new Editor({
    extensions: cardEditorExtensions(),
    content: markdown,
    contentType: 'markdown',
  })
  const result = editor.getMarkdown()
  editor.destroy()
  return result
}

describe('card editor Markdown round-trip', () => {
  it('keeps plain-text descriptions written before rich text', () => {
    const text = 'Review support tags, sales notes, and churn feedback.'
    expect(roundTrip(text)).toBe(text)
  })

  it('keeps single line breaks as line breaks', () => {
    expect(roundTrip('Line one\nLine two')).toBe('Line one  \nLine two')
  })

  it('keeps the supported formatting', () => {
    for (const markdown of [
      '**bold** and *italic* ~~struck~~ `code`',
      '- one\n- two',
      '1. one\n2. two',
      '- [ ] todo\n- [x] done',
      '[link](https://example.com)',
    ]) {
      expect(roundTrip(markdown)).toBe(markdown)
    }
  })

  it('drops raw HTML instead of keeping it as markup', () => {
    expect(roundTrip('<script>alert(1)</script>')).not.toContain('<script>')
  })
})
