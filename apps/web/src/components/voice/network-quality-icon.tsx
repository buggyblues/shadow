import { cn } from '@shadowob/ui'
import { useTranslation } from 'react-i18next'
import type { NetworkQuality } from '../../hooks/use-voice-channel'

const networkTone: Record<NetworkQuality, string> = {
  unknown: 'text-text-muted',
  excellent: 'text-success',
  good: 'text-success',
  fair: 'text-warning',
  poor: 'text-danger',
}

const activeBars: Record<NetworkQuality, number> = {
  unknown: 1,
  excellent: 4,
  good: 3,
  fair: 2,
  poor: 1,
}

export function NetworkQualityIcon({
  quality,
  className,
}: {
  quality: NetworkQuality
  className?: string
}) {
  const { t } = useTranslation()
  const label = t(`voice.network.${quality}`)

  return (
    <span
      aria-label={label}
      className={cn('inline-flex h-5 items-end gap-[2px]', networkTone[quality], className)}
      role="img"
    >
      {[6, 10, 14, 18].map((height, index) => (
        <span
          aria-hidden="true"
          key={height}
          className={cn(
            'w-1 rounded-full bg-current transition-opacity',
            index < activeBars[quality] ? 'opacity-100' : 'opacity-25',
          )}
          style={{ height }}
        />
      ))}
    </span>
  )
}
