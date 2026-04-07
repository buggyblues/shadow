import { cn } from '../../lib/utils'

export function Indicator({
  status = 'online',
  size = 'md',
  className = '',
}: {
  status?: 'online' | 'idle' | 'dnd' | 'offline' | 'running' | 'error' | string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const colors = {
    online: 'bg-success shadow-[0_0_10px_rgba(87,242,135,0.6)]',
    running: 'bg-success shadow-[0_0_10px_rgba(87,242,135,0.6)]',
    idle: 'bg-warning shadow-[0_0_10px_rgba(250,176,5,0.4)]',
    dnd: 'bg-danger shadow-[0_0_10px_rgba(240,56,71,0.4)]',
    error: 'bg-danger shadow-[0_0_10px_rgba(240,56,71,0.4)]',
    offline: 'bg-text-muted',
  }

  const sizes = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-4 h-4 border-[3px] border-bg-secondary',
  }

  const colorClass = colors[status as keyof typeof colors] || colors.offline

  return (
    <div
      className={cn(
        'rounded-full shrink-0',
        colorClass,
        sizes[size as keyof typeof sizes],
        className,
      )}
    />
  )
}
