import { Badge, Button, Card } from '@shadowob/ui'
import { useNavigate } from '@tanstack/react-router'
import { QrCode, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from './avatar'
import { formatDuration, OnlineRank } from './online-rank'

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
  ownerId?: string
  ownerAvatarUrl?: string | null
  description?: string
  totalOnlineSeconds?: number
  className?: string
}

const statusColors: Record<string, string> = {
  online: 'bg-success',
  idle: 'bg-warning',
  dnd: 'bg-danger',
  offline: 'bg-text-muted',
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
  ownerId,
  ownerAvatarUrl,
  description,
  totalOnlineSeconds,
  className = '',
}: UserProfileCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showQrCard, setShowQrCard] = useState(false)
  const status = user.status ?? 'offline'

  const goToProfile = (userId: string) => {
    navigate({ to: '/profile/$userId', params: { userId } })
  }

  return (
    <Card
      variant="glass"
      className={`w-64 overflow-hidden rounded-[40px] ${className}`}
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
          <button
            type="button"
            onClick={() => goToProfile(user.id)}
            className="text-base font-bold text-text-primary truncate hover:text-primary hover:underline transition cursor-pointer"
          >
            {user.displayName}
          </button>
          {user.isBot && (
            <Badge variant="primary" size="xs">
              {t('common.bot')}
            </Badge>
          )}
        </div>
        <p className="text-sm text-text-muted">@{user.username}</p>

        {/* Role badge */}
        {role && role !== 'member' && (
          <div className="mt-2">
            <Badge variant={role === 'owner' ? 'warning' : 'info'} size="sm">
              {t(`member.${role}`)}
            </Badge>
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
            <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted mb-1">
              OWNER / 主人
            </p>
            {ownerId ? (
              <button
                type="button"
                onClick={() => goToProfile(ownerId)}
                className="flex items-center gap-2 w-full hover:bg-bg-modifier-hover rounded-md p-1 transition cursor-pointer"
              >
                <UserAvatar
                  userId={ownerId}
                  avatarUrl={ownerAvatarUrl ?? null}
                  displayName={ownerName}
                  size="xs"
                />
                <span className="text-sm text-primary truncate hover:underline">{ownerName}</span>
              </button>
            ) : (
              <p className="text-sm text-text-primary mt-1 truncate">{ownerName}</p>
            )}
          </div>
        )}

        {user.isBot && description && (
          <div className="mt-3 pt-3 border-t border-border-subtle">
            <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">
              Description / 描述
            </p>
            <p className="text-sm text-text-secondary mt-1 whitespace-pre-wrap break-words line-clamp-4">
              {description}
            </p>
          </div>
        )}

        {/* Business Card Button - Show for both users and bots */}
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <Button
            variant="glass"
            size="sm"
            onClick={() => setShowQrCard(true)}
            icon={QrCode}
            className="w-full"
          >
            {t('profile.viewBusinessCard', '查看名片')}
          </Button>
        </div>
      </div>

      {/* QR Code Business Card Modal */}
      {showQrCard && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-deep/60"
          onClick={() => setShowQrCard(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowQrCard(false)}
        >
          <div
            className="bg-bg-primary/95 backdrop-blur-xl rounded-[40px] p-8 w-[320px] flex flex-col items-center relative shadow-[0_32px_120px_rgba(0,0,0,0.5)] border border-border-subtle"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={() => {}}
          >
            <button
              type="button"
              onClick={() => setShowQrCard(false)}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition"
            >
              <X className="w-5 h-5" />
            </button>

            <UserAvatar
              userId={user.id}
              avatarUrl={user.avatarUrl}
              displayName={user.displayName}
              size="lg"
              className="w-16 h-16"
            />
            <h2 className="text-lg font-bold text-text-primary mt-3">{user.displayName}</h2>
            <p className="text-sm text-text-muted">@{user.username}</p>

            <div className="bg-white p-4 rounded-xl mt-5">
              <QRCodeSVG
                value={`${window.location.origin}/app/profile/${user.username}`}
                size={180}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>

            <p className="text-xs text-text-muted mt-4">
              {t('profile.scanToVisit', '扫一扫，访问主页')}
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}
