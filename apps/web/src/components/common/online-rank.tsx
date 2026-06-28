import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

/** QQ-style online rank: stars (<100h) → moons (100-500h) → suns (500h+) */
interface OnlineRankProps {
  totalSeconds: number
  compact?: boolean
}

export function OnlineRank({ totalSeconds, compact = false }: OnlineRankProps) {
  const { t } = useTranslation()
  const hours = totalSeconds / 3600
  let suns = 0
  let moons = 0
  let stars = 0

  if (hours >= 500) {
    suns = Math.min(Math.floor(hours / 500), 4)
    const remainAfterSuns = hours - suns * 500
    moons = Math.min(Math.floor(remainAfterSuns / 100), 3)
    const remainAfterMoons = remainAfterSuns - moons * 100
    stars = Math.min(Math.floor(remainAfterMoons / 16), 3)
  } else if (hours >= 100) {
    moons = Math.min(Math.floor(hours / 100), 3)
    const remain = hours - moons * 100
    stars = Math.min(Math.floor(remain / 16), 3)
  } else {
    stars = Math.min(Math.floor(hours / 16), 3)
  }

  if (suns === 0 && moons === 0 && stars === 0) {
    stars = hours >= 1 ? 1 : 0
  }

  if (suns === 0 && moons === 0 && stars === 0) return null

  const rankLabel = getOnlineRankLabel({ suns, moons, stars }, t)

  if (compact) {
    const icon = suns > 0 ? '☀️' : moons > 0 ? '🌙' : '⭐'
    return (
      <span aria-label={rankLabel} className="inline-flex items-center gap-0.5" role="img">
        <span aria-hidden="true" className="text-warning text-xs">
          {icon}
        </span>
      </span>
    )
  }

  return (
    <span aria-label={rankLabel} className="inline-flex items-center gap-0.5" role="img">
      {Array.from({ length: suns }, (_, i) => (
        <span aria-hidden="true" key={`sun-${i}`} className="text-warning text-xs">
          ☀️
        </span>
      ))}
      {Array.from({ length: moons }, (_, i) => (
        <span aria-hidden="true" key={`moon-${i}`} className="text-warning/70 text-xs">
          🌙
        </span>
      ))}
      {Array.from({ length: stars }, (_, i) => (
        <span aria-hidden="true" key={`star-${i}`} className="text-warning/80 text-xs">
          ⭐
        </span>
      ))}
    </span>
  )
}

function getOnlineRankLabel(
  counts: { suns: number; moons: number; stars: number },
  t: TFunction,
): string {
  const parts = [
    counts.suns > 0 ? t('onlineRank.sunCount', { count: counts.suns }) : null,
    counts.moons > 0 ? t('onlineRank.moonCount', { count: counts.moons }) : null,
    counts.stars > 0 ? t('onlineRank.starCount', { count: counts.stars }) : null,
  ].filter(Boolean)

  return t('onlineRank.label', {
    rank: parts.join(t('onlineRank.separator')),
  })
}

export function formatDuration(totalSeconds: number, t: TFunction): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  if (safeSeconds < 60) return t('duration.seconds', { count: safeSeconds })
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours === 0) return t('duration.minutes', { count: minutes })
  if (hours < 24) {
    return minutes > 0
      ? t('duration.hoursMinutes', { hours, minutes })
      : t('duration.hours', { count: hours })
  }
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return remainHours > 0
    ? t('duration.daysHours', { days, hours: remainHours })
    : t('duration.days', { count: days })
}
