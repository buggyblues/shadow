import { cn } from '@shadowob/ui'
import { Check, ChevronDown, ChevronUp, ClipboardCopy } from 'lucide-react'
import { type MouseEvent, useEffect, useRef, useState } from 'react'

type CodeBlockMode = 'single' | 'multi'
type FoldMode = 'expanded' | 'collapsed'

export function ConfigCodeBlock({
  content,
  label,
  mode = 'multi',
  foldMode = 'expanded',
  t,
  className,
  copied,
  onCopy,
}: {
  content: string
  label?: string
  mode?: CodeBlockMode
  foldMode?: FoldMode
  t: (key: string) => string
  className?: string
  copied?: boolean
  onCopy?: (content: string) => void
}) {
  const [copiedState, setCopiedState] = useState(false)
  const [isExpanded, setIsExpanded] = useState(foldMode === 'expanded')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIsExpanded(foldMode === 'expanded')
  }, [foldMode])

  const displayCopied = typeof copied === 'boolean' ? copied : copiedState
  const hasMultipleLines = content.includes('\n')
  const canFold = mode === 'multi' && hasMultipleLines && foldMode === 'collapsed'

  const handleCopy = async (event?: MouseEvent<HTMLElement>) => {
    event?.stopPropagation()
    await navigator.clipboard.writeText(content)
    setCopiedState(true)
    setTimeout(() => setCopiedState(false), 2000)
    onCopy?.(content)
  }

  const handleSelectAll = () => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }

  const handleSingleLineAreaClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    handleSelectAll()
  }

  if (mode === 'single') {
    return (
      <div className={cn('relative', className)}>
        {label && (
          <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mb-1.5">
            {label}
          </p>
        )}
        <div onClick={handleSingleLineAreaClick} className="relative">
          <input
            ref={inputRef}
            readOnly
            value={content}
            onFocus={handleSelectAll}
            className="w-full h-11 pl-4 pr-10 bg-bg-deep/50 backdrop-blur-sm border border-border-subtle rounded-[16px] text-sm text-text-secondary font-mono break-all outline-none focus:ring-2 focus:ring-primary/40 transition"
          />
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault()
              handleCopy(event)
            }}
            onClick={(event) => event.stopPropagation()}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover p-1.5 transition"
            title={t('common.copy')}
            aria-label={t('common.copy')}
          >
            {displayCopied ? (
              <Check size={13} className="text-success" />
            ) : (
              <ClipboardCopy size={13} />
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {label && (
        <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mb-1.5">
          {label}
        </p>
      )}
      <div className="relative">
        <pre
          className={cn(
            'bg-bg-deep/50 backdrop-blur-sm rounded-[14px] px-3 py-2.5 text-[12px] leading-relaxed text-text-secondary font-mono border border-border-subtle whitespace-pre-wrap break-all shadow-inner overflow-x-auto',
            canFold && !isExpanded && 'max-h-40 overflow-hidden',
          )}
        >
          {content}
        </pre>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            handleCopy(event)
          }}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-bg-tertiary/50 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover transition"
          title={t('common.copy')}
          aria-label={t('common.copy')}
        >
          {displayCopied ? (
            <Check size={13} className="text-success" />
          ) : (
            <ClipboardCopy size={13} />
          )}
        </button>
      </div>
      {canFold && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="mt-2 flex items-center gap-1.5 text-[11px] text-text-muted ml-auto"
        >
          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      )}
    </div>
  )
}
