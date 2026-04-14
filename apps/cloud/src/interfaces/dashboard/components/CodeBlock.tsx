import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@shadowob/ui'
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
  language,
  title,
  className,
  maxHeight = '400px',
  showLineNumbers = false,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lines = code.split('\n')

  return (
    <div className={cn('bg-gray-950 border border-gray-800 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      {(title || language) && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-2">
            {title && <span className="text-xs text-gray-400">{title}</span>}
            {language && (
              <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                {language}
              </span>
            )}
          </div>
          <Button
            type="button"
            onClick={handleCopy}
            variant="ghost"
            size="xs"
            className="!flex !items-center !gap-1 !text-xs !text-gray-500 hover:!text-gray-300 !transition-colors"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}

      {/* Code */}
      <div className="overflow-auto" style={{ maxHeight }}>
        <pre className="p-4 text-sm font-mono">
          {showLineNumbers ? (
            <Table className="!border-collapse">
              <TableBody>
                {lines.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell className="!pr-4 !text-right !text-gray-600 !select-none !align-top !text-xs !leading-relaxed">
                      {i + 1}
                    </TableCell>
                    <TableCell className="!text-gray-300 !leading-relaxed !whitespace-pre">
                      {line || '\u00a0'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <code className="text-gray-300 leading-relaxed whitespace-pre-wrap">{code}</code>
          )}
        </pre>
      </div>
    </div>
  )
}
