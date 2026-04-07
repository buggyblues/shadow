import { Button } from '@shadowob/ui'
import type { LucideIcon } from 'lucide-react'
import { ButtonHTMLAttributes, forwardRef } from 'react'

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
  return (
    <EmptyState
      iconEmoji="👋"
      title="还没有好友"
      description="添加好友后，你们可以私聊、一起加入服务器"
      action={{
        label: '添加好友',
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
  return (
    <EmptyState
      iconEmoji="🏠"
      title="还没有加入任何服务器"
      description="创建你自己的社区，或加入一个现有的服务器"
      action={{
        label: '创建服务器',
        onClick: onCreateServer,
      }}
      secondaryAction={{
        label: '加入服务器',
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
  return (
    <EmptyState
      iconEmoji="💬"
      title="还没有频道"
      description={`${serverName} 还没有任何频道。创建一个频道开始聊天吧！`}
      action={
        onCreateChannel
          ? {
              label: '创建频道',
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
  return (
    <EmptyState
      iconEmoji="✨"
      title={`欢迎来到 #${channelName}`}
      description="这是频道开始的地方。发送第一条消息吧！"
    />
  )
}

type NoNotificationsProps = {}

export function NoNotifications(_props: NoNotificationsProps) {
  return (
    <EmptyState
      iconEmoji="🔔"
      title="没有新通知"
      description="当有人提及你或回复你的消息时，你会在这里看到"
    />
  )
}

interface NoSearchResultsProps {
  query: string
  onClear?: () => void
}

export function NoSearchResults({ query, onClear }: NoSearchResultsProps) {
  return (
    <EmptyState
      iconEmoji="🔍"
      title="没有找到结果"
      description={`没有找到与 "${query}" 相关的内容`}
      action={
        onClear
          ? {
              label: '清除搜索',
              onClick: onClear,
            }
          : undefined
      }
    />
  )
}
