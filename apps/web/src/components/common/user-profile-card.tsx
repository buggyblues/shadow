import { useTranslation } from 'react-i18next'
import { UserAvatar } from './avatar'

interface UserProfileCardProps {
  user: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
    status?: string
    isBot?: boolean
  }
  role?: 'owner' | 'admin' | 'member' | null
  ownerName?: string
  description?: string
  totalOnlineSeconds?: number
  className?: string
}

const statusColors: Record<string, string> = {
  online: 'bg-green-500',
  idle: 'bg-yellow-500',
  dnd: 'bg-red-500',
  offline: 'bg-gray-500',
}

const statusLabels: Record<string, string> = {
  online: 'member.online',
  idle: 'member.idle',
  dnd: 'member.dnd',
  offline: 'member.offline',
}

/** QQ-style rank: stars (<100h) → moons (100-500h) → suns (500h+) */
function OnlineRank({ totalSeconds }: { totalSeconds: number }) {
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

  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: suns }, (_, i) => (
        <span key={`sun-${i}`} className="text-amber-400 text-xs" title="太阳">
          ☀️
        </span>
      ))}
      {Array.from({ length: moons }, (_, i) => (
        <span key={`moon-${i}`} className="text-yellow-300 text-xs" title="月亮">
          🌙
        </span>
      ))}
      {Array.from({ length: stars }, (_, i) => (
        <span key={`star-${i}`} className="text-yellow-400 text-xs" title="星星">
          ⭐
        </span>
      ))}
    </span>
  )
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}秒`
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours === 0) return `${minutes}分钟`
  if (hours < 24) return `${hours}小时${minutes > 0 ? `${minutes}分钟` : ''}`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return `${days}天${remainHours > 0 ? `${remainHours}小时` : ''}`
}

export function UserProfileCard({
  user,
  role,
  ownerName,
  description,
  totalOnlineSeconds,
  className = '',
}: UserProfileCardProps) {
  const { t } = useTranslation()
  const status = user.status ?? 'offline'

  return (
    <div
      className={`bg-bg-tertiary border border-border-dim rounded-xl shadow-2xl w-64 overflow-hidden ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Banner */}
      <div className="h-16 bg-gradient-to-r from-primary/40 to-primary/20" />

      {/* Avatar overlapping banner */}
      <div className="px-4 -mt-8">
        <div className="relative inline-block">
          <UserAvatar
            userId={user.id}
            avatarUrl={user.avatarUrl}
            displayName={user.displayName}
            size="xl"
            className="border-4 border-bg-tertiary"
          />
          <div
            className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-bg-tertiary ${statusColors[status]}`}
          />
        </div>
      </div>

      {/* User info */}
      <div className="px-4 pt-2 pb-4">
        <div className="flex items-center gap-1.5">
          <h3 className="text-base font-bold text-text-primary truncate">{user.displayName}</h3>
          {user.isBot && (
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium shrink-0">
              {t('common.bot')}
            </span>
          )}
        </div>
        <p className="text-sm text-text-muted">@{user.username}</p>

        {/* Role badge */}
        {role && role !== 'member' && (
          <div className="mt-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                role === 'owner'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {t(`member.${role}`)}
            </span>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle">
          <div className={`w-2.5 h-2.5 rounded-full ${statusColors[status]}`} />
          <span className="text-xs text-text-secondary">
            {t(statusLabels[status] ?? 'member.offline')}
          </span>
        </div>

        {/* Online duration + rank (bot only) */}
        {user.isBot && totalOnlineSeconds != null && totalOnlineSeconds > 0 && (
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-text-muted">
              在线 {formatDuration(totalOnlineSeconds)}
            </span>
            <OnlineRank totalSeconds={totalOnlineSeconds} />
          </div>
        )}

        {user.isBot && ownerName && (
          <div className="mt-3 pt-3 border-t border-border-subtle">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">OWNER / 主人</p>
            <p className="text-sm text-text-primary mt-1 truncate">{ownerName}</p>
          </div>
        )}

        {user.isBot && description && (
          <div className="mt-3 pt-3 border-t border-border-subtle">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">
              Description / 描述
            </p>
            <p className="text-sm text-text-secondary mt-1 whitespace-pre-wrap break-words line-clamp-4">
              {description}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
