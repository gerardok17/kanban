import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

type MarkdownContentProps = {
  markdown: string
  className?: string
}

// Renders a card description. Safe by construction: without rehype-raw any HTML
// in the source is shown as text, never parsed, and react-markdown's default
// URL transform strips unsafe link protocols such as `javascript:`.
export const MarkdownContent = ({ markdown, className }: MarkdownContentProps) => (
  <div className={clsx('markdown-content', className)}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        // An unsafe link arrives here with its href already stripped; show it
        // as plain text rather than a link back to the app.
        a: ({ href, children }) =>
          !href ? (
            <span>{children}</span>
          ) : (
            <a
              href={href}
              target='_blank'
              rel='noopener noreferrer'
              onPointerDown={(event) => event.stopPropagation()}
            >
              {children}
            </a>
          ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  </div>
)
