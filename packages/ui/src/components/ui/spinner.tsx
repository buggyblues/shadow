import { cn } from '../../lib/utils'

export function Spinner({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  }

  return (
    <div
      className={cn(
        'animate-spin rounded-full border-primary/20 border-t-primary shadow-[0_0_15px_rgba(0,209,255,0.2)]',
        sizes[size],
        className,
      )}
    />
  )
}
