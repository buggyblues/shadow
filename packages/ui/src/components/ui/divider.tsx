import { cn } from '../../lib/utils'

export function Divider({ label, className = '' }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 my-6', className)}>
      <div className="h-px flex-1 bg-border-subtle opacity-30" />
      {label && (
        <span className="text-[10px] font-black uppercase text-text-muted tracking-[0.25em] whitespace-nowrap opacity-50">
          {label}
        </span>
      )}
      <div className="h-px flex-1 bg-border-subtle opacity-30" />
    </div>
  )
}
