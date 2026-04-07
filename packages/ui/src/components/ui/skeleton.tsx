import { cn } from '../../lib/utils'

function Skeleton({
  className,
  variant,
  width,
  height,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'circle' | 'rect'
  width?: number | string
  height?: number | string
}) {
  return (
    <div
      className={cn(
        'animate-pulse bg-bg-tertiary/50',
        variant === 'circle' ? 'rounded-full' : 'rounded-xl',
        className,
      )}
      style={{ width, height, ...props.style }}
      {...props}
    />
  )
}

export { Skeleton }
