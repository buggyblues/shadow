import { Button } from '@shadowob/ui'
import type { LucideIcon } from 'lucide-react'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

interface EmptyStateProps {
  icon?: LucideIcon
  iconEmoji?: string
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    icon?: LucideIcon
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon, iconEmoji, title, description, action, secondaryAction, className = '' }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex flex-col items-center justify-center py-12 px-6 ${className}`}
      >
        {/* Icon */}
        {iconEmoji ? (
          <div className="text-5xl mb-4">{iconEmoji}</div>
        ) : Icon ? (
          <div className="w-16 h-16 rounded-2xl bg-bg-tertiary flex items-center justify-center mb-4">
            <Icon size={32} className="text-text-muted" />
          </div>
        ) : null}

        {/* Title */}
        <h3 className="text-lg font-black text-primary text-center mb-2">{title}</h3>

        {/* Description */}
        {description && (
          <p className="text-sm text-text-muted text-center max-w-sm mb-6">{description}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          {action && (
            <Button variant="primary" size="sm" onClick={action.onClick} icon={action.icon}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="ghost" size="sm" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      </div>
    )
  },
)

EmptyState.displayName = 'EmptyState'

// Pre-built empty states for common scenarios

interface NoFriendsProps {
  onAddFriend: () => void
}

export function NoFriends({ onAddFriend }: NoFriendsProps) {
  const { t } = useTranslation()

  return (
    <EmptyState
      iconEmoji="👋"
      title={t('emptyState.noFriendsTitle')}
      description={t('emptyState.noFriendsDescription')}
      action={{
        label: t('emptyState.addFriend'),
        onClick: onAddFriend,
      }}
    />
  )
}

interface NoServersProps {
  onCreateServer: () => void
  onJoinServer: () => void
}

export function NoServers({ onCreateServer, onJoinServer }: NoServersProps) {
  const { t } = useTranslation()

  return (
    <EmptyState
      iconEmoji="🏠"
      title={t('emptyState.noServersTitle')}
      description={t('emptyState.noServersDescription')}
      action={{
        label: t('emptyState.createServer'),
        onClick: onCreateServer,
      }}
      secondaryAction={{
        label: t('emptyState.joinServer'),
        onClick: onJoinServer,
      }}
    />
  )
}

interface NoChannelsProps {
  serverName: string
  onCreateChannel?: () => void
}

export function NoChannels({ serverName, onCreateChannel }: NoChannelsProps) {
  const { t } = useTranslation()

  return (
    <EmptyState
      iconEmoji="💬"
      title={t('emptyState.noChannelsTitle')}
      description={t('emptyState.noChannelsDescription', { serverName })}
      action={
        onCreateChannel
          ? {
              label: t('emptyState.createChannel'),
              onClick: onCreateChannel,
            }
          : undefined
      }
    />
  )
}

interface NoMessagesProps {
  channelName: string
}

export function NoMessages({ channelName }: NoMessagesProps) {
  const { t } = useTranslation()

  return (
    <EmptyState
      iconEmoji="✨"
      title={t('emptyState.noMessagesTitle', { channelName })}
      description={t('emptyState.noMessagesDescription')}
    />
  )
}

type NoNotificationsProps = {}

export function NoNotifications(_props: NoNotificationsProps) {
  const { t } = useTranslation()

  return (
    <EmptyState
      iconEmoji="🔔"
      title={t('emptyState.noNotificationsTitle')}
      description={t('emptyState.noNotificationsDescription')}
    />
  )
}

interface NoSearchResultsProps {
  query: string
  onClear?: () => void
}

export function NoSearchResults({ query, onClear }: NoSearchResultsProps) {
  const { t } = useTranslation()

  return (
    <EmptyState
      iconEmoji="🔍"
      title={t('emptyState.noSearchResultsTitle')}
      description={t('emptyState.noSearchResultsDescription', { query })}
      action={
        onClear
          ? {
              label: t('emptyState.clearSearch'),
              onClick: onClear,
            }
          : undefined
      }
    />
  )
}
