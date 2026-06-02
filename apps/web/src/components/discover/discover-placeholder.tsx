import { cn } from '@shadowob/ui'

const DISCOVER_PLACEHOLDER_GRADIENT =
  'linear-gradient(145deg, rgba(13, 19, 33, 0.96) 0%, rgba(27, 39, 64, 0.92) 50%, rgba(8, 12, 24, 0.98) 100%)'

export function DiscoverPlaceholderVisual({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-full w-full', className)}
      aria-hidden="true"
      style={{ backgroundImage: DISCOVER_PLACEHOLDER_GRADIENT }}
    />
  )
}
