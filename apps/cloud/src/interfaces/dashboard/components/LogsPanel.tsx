import { Card } from '@shadowob/ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface LogsPanelProps {
  headerLeft: ReactNode
  headerRight?: ReactNode
  lines: string[]
  emptyText: string
  bodyRef?: React.RefObject<HTMLDivElement | null>
  className?: string
  bodyClassName?: string
}

export function LogsPanel({
  headerLeft,
  headerRight,
  lines,
  emptyText,
  bodyRef,
  className,
  bodyClassName,
}: LogsPanelProps) {
  return (
    <Card variant="glass" className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-bg-secondary/40 px-4 py-2.5">
        <div className="text-xs text-text-muted">{headerLeft}</div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </div>
      <div
        ref={bodyRef}
        className={cn(
          'min-h-[14rem] max-h-[26rem] overflow-auto p-4 font-mono text-xs text-text-secondary space-y-1',
          bodyClassName,
        )}
      >
        {lines.length === 0 ? (
          <span className="text-text-muted">{emptyText}</span>
        ) : (
          lines.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: log lines are append-only
            <div key={index} className="leading-relaxed">
              {line || '\u00a0'}
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
