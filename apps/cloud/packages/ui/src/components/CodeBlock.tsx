import MonacoEditor from '@monaco-editor/react'
import { Button } from '@shadowob/ui'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  code: string
  language?: string
  title?: string
  className?: string
  maxHeight?: string
  showLineNumbers?: boolean
}

export function CodeBlock({
  code,
  language = 'json',
  title,
  className,
  maxHeight = '400px',
  showLineNumbers = false,
}: CodeBlockProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border-subtle bg-[#1e1e1e]',
        className,
      )}
    >
      {/* Header */}
      {(title || language) && (
        <div className="flex items-center justify-between border-b border-[var(--glass-line)] bg-[#252526] px-4 py-2">
          <div className="flex items-center gap-2">
            {title && <span className="text-xs text-[#cccccc]/70">{title}</span>}
            {language && (
              <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-[#cccccc]/50">
                {language}
              </span>
            )}
          </div>
          <Button
            type="button"
            onClick={handleCopy}
            variant="ghost"
            size="xs"
            className="flex items-center gap-1 text-xs font-medium normal-case tracking-normal !text-[#cccccc]/60 transition-colors hover:!text-[#cccccc]"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
        </div>
      )}

      {/* Monaco readonly editor */}
      <MonacoEditor
        height={maxHeight}
        language={language}
        value={code}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          lineNumbers: showLineNumbers ? 'on' : 'off',
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          tabSize: 2,
          automaticLayout: true,
          padding: { top: 8, bottom: 8 },
          folding: true,
          renderLineHighlight: 'none',
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
          },
          contextmenu: false,
          links: false,
        }}
      />
    </div>
  )
}
