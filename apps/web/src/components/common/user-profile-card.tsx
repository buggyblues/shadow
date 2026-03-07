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

export function UserProfileCard({
  user,
  role,
  ownerName,
  description,
  className = '',
}: UserProfileCardProps) {
  const { t } = useTranslation()
  const status = user.status ?? 'offline'

  return (
    <div
      className={`bg-bg-tertiary border border-white/10 rounded-xl shadow-2xl w-64 overflow-hidden ${className}`}
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
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
          <div className={`w-2.5 h-2.5 rounded-full ${statusColors[status]}`} />
          <span className="text-xs text-text-secondary">
            {t(statusLabels[status] ?? 'member.offline')}
          </span>
        </div>

        {user.isBot && ownerName && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">OWNER / 主人</p>
            <p className="text-sm text-text-primary mt-1 truncate">{ownerName}</p>
          </div>
        )}

        {user.isBot && description && (
          <div className="mt-3 pt-3 border-t border-white/5">
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
