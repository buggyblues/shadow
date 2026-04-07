import { cn } from '../../lib/utils'
import { Badge } from './badge'

export function ListHeader({
  label,
  count,
  className = '',
}: {
  label: string
  count?: number
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3 px-2 mb-4', className)}>
      <span className="text-[11px] font-black uppercase text-text-muted tracking-[0.25em] whitespace-nowrap">
        {label}
      </span>
      <div className="h-px flex-1 bg-border-subtle opacity-30" />
      {count !== undefined && (
        <Badge variant="neutral" className="border-none bg-bg-tertiary/50 opacity-40 px-2 py-0.5">
          {count}
        </Badge>
      )}
    </div>
  )
}
