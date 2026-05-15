/** QQ-style online rank: stars (<100h) → moons (100-500h) → suns (500h+) */
interface OnlineRankProps {
  totalSeconds: number
  compact?: boolean
}

export function OnlineRank({ totalSeconds, compact = false }: OnlineRankProps) {
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

  if (compact) {
    const icon = suns > 0 ? '☀️' : moons > 0 ? '🌙' : '⭐'
    return (
      <span className="inline-flex items-center gap-0.5">
        <span
          className="text-xs text-warning"
          title={suns > 0 ? '太阳' : moons > 0 ? '月亮' : '星星'}
        >
          {icon}
        </span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: suns }, (_, i) => (
        <span key={`sun-${i}`} className="text-warning text-xs" title="太阳">
          ☀️
        </span>
      ))}
      {Array.from({ length: moons }, (_, i) => (
        <span key={`moon-${i}`} className="text-warning/70 text-xs" title="月亮">
          🌙
        </span>
      ))}
      {Array.from({ length: stars }, (_, i) => (
        <span key={`star-${i}`} className="text-warning/80 text-xs" title="星星">
          ⭐
        </span>
      ))}
    </span>
  )
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}秒`
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours === 0) return `${minutes}分钟`
  if (hours < 24) return `${hours}小时${minutes > 0 ? `${minutes}分钟` : ''}`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return `${days}天${remainHours > 0 ? `${remainHours}小时` : ''}`
}
