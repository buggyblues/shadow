import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'

function transformMarkdownUrl(value: string) {
  if (value.startsWith('workspace://')) return value
  return defaultUrlTransform(value)
}

export function MarkdownText({
  content,
  compact = false,
  className,
}: {
  content: string
  compact?: boolean
  className?: string
}) {
  return (
    <div className={className ?? (compact ? 'markdown markdown-compact' : 'markdown')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={transformMarkdownUrl}
        components={{
          a: ({ children, href }) => (
            <a href={href} rel="noreferrer" target="_blank">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
