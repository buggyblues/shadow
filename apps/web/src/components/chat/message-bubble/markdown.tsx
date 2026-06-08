import { Button } from '@shadowob/ui'
import { Check, Copy } from 'lucide-react'
import React, { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { copyToClipboard } from '../../../lib/clipboard'

interface MessageMarkdownProps {
  content: string
  renderMentions: (children: React.ReactNode) => React.ReactNode
}

function CodeBlockWithCopy({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopyCode = async () => {
    let text = ''
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === 'string') return node
      if (typeof node === 'number') return String(node)
      if (!node) return ''
      if (Array.isArray(node)) return node.map(extractText).join('')
      if (
        typeof node === 'object' &&
        node !== null &&
        'props' in (node as unknown as Record<string, unknown>)
      ) {
        return extractText(
          (node as React.ReactElement<{ children?: React.ReactNode }>).props.children,
        )
      }
      return ''
    }
    text = extractText(children)
    const didCopy = await copyToClipboard(text, {
      successMessage: t('common.copied'),
      errorMessage: t('chat.copyFailed'),
    })
    if (!didCopy) return
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group">
      <pre className="!m-0">{children}</pre>
      <Button
        variant="ghost"
        size="xs"
        onClick={handleCopyCode}
        className="absolute top-2 right-2 !p-1.5 !h-auto !w-auto !rounded-md !font-normal !normal-case !tracking-normal opacity-0 group-hover:opacity-100 bg-bg-secondary/50 backdrop-blur-sm border border-white/10 text-text-muted hover:text-text-primary"
        aria-label={t('common.copy')}
        title={t('common.copy')}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </Button>
    </div>
  )
}

function MessageMarkdownBase({ content, renderMentions }: MessageMarkdownProps) {
  const { t } = useTranslation()

  return (
    <div className="text-[15px] text-text-primary leading-[1.6] tracking-[0.01em] break-words msg-markdown pt-[2px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => (
            <a href={src} target="_blank" rel="noopener noreferrer">
              <img src={src} alt={alt ?? ''} loading="lazy" decoding="async" fetchPriority="low" />
            </a>
          ),
          a: ({ href, children }) => {
            const handleClick = (e: React.MouseEvent) => {
              e.preventDefault()
              if (href) {
                window.open(href, '_blank', 'noopener,noreferrer')
              }
            }
            return (
              <a
                href={href}
                onClick={handleClick}
                className="text-primary hover:underline cursor-pointer"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            )
          },
          p: ({ children }) => <p>{renderMentions(children)}</p>,
          li: ({ children }) => <li>{renderMentions(children)}</li>,
          input: ({ type, ...props }) => (
            <input
              type={type}
              {...props}
              aria-label={
                type === 'checkbox'
                  ? (props['aria-label'] as string | undefined) || t('chat.taskCheckbox')
                  : (props['aria-label'] as string | undefined)
              }
            />
          ),
          table: ({ children }) => (
            <div className="msg-markdown-table-scroll">
              <table>{children}</table>
            </div>
          ),
          td: ({ children }) => <td>{renderMentions(children)}</td>,
          code: ({ className, children, ...props }) => {
            if (className) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code className="bg-bg-modifier-hover rounded px-1.5" {...props}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => <CodeBlockWithCopy>{children}</CodeBlockWithCopy>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export const MessageMarkdown = memo(MessageMarkdownBase)
MessageMarkdown.displayName = 'MessageMarkdown'
