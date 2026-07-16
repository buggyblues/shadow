import { cn } from '../utils/class-names.js'

interface ProgressBarProps {
  className?: string
  tone?: string
  value: number
}

export function ProgressBar({ className, tone = 'bg-olive', value }: ProgressBarProps) {
  const progress = Math.max(0, Math.min(100, value))

  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-paper', className)}>
      <div
        className={cn('h-full rounded-full transition-all', tone)}
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

interface ProgressRingProps {
  className?: string
  track?: string
  value: number
}

export function ProgressRing({ className, track = '#eceedd', value }: ProgressRingProps) {
  const degrees = Math.max(0, Math.min(100, value)) * 3.6

  return (
    <span
      className={cn('grid size-8 shrink-0 place-items-center rounded-full', className)}
      style={{ background: `conic-gradient(#737842 ${degrees}deg, ${track} 0deg)` }}
    >
      <span className="size-5 rounded-full bg-white" />
    </span>
  )
}
