import {
  type BuddyPresenceStatus,
  normalizeBuddyRuntimePresenceStatus,
  normalizeUserStatus,
  resolvePresenceStatus,
} from '@shadowob/shared'
import { cn } from '@shadowob/ui'
import { UserAvatar } from './avatar'

const statusDotClass: Record<BuddyPresenceStatus, string> = {
  online: 'bg-success shadow-[0_0_10px_rgba(87,242,135,0.5)]',
  busy: 'bg-primary shadow-[0_0_10px_rgba(88,101,242,0.5)]',
  idle: 'bg-warning shadow-[0_0_10px_rgba(250,176,5,0.4)]',
  dnd: 'bg-danger shadow-[0_0_10px_rgba(240,56,71,0.4)]',
  offline: 'bg-text-muted',
}

export type PresenceAvatarStatus = BuddyPresenceStatus

export function getPresenceAvatarStatusClass(status: PresenceAvatarStatus) {
  return statusDotClass[status] ?? statusDotClass.offline
}

export function PresenceAvatar({
  userId,
  avatarUrl,
  displayName,
  status,
  isBot,
  agentStatus,
  lastHeartbeat,
  busy = false,
  size = 'sm',
  className,
  loading,
}: {
  userId?: string
  avatarUrl?: string | null
  displayName?: string | null
  status?: string | null
  isBot?: boolean | null
  agentStatus?: string | null
  lastHeartbeat?: string | number | Date | null
  busy?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  loading?: 'eager' | 'lazy'
}) {
  const presence = resolvePresenceStatus({
    userStatus: status,
    isBot,
    agentStatus,
    lastHeartbeat,
    busy,
  })
  return (
    <div className={cn('relative shrink-0', className)}>
      <UserAvatar
        userId={userId}
        avatarUrl={avatarUrl}
        displayName={displayName ?? undefined}
        size={size}
        loading={loading}
      />
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-deep',
          getPresenceAvatarStatusClass(presence),
        )}
      />
    </div>
  )
}

export function normalizePresenceAvatarStatus(status?: string | null) {
  return normalizeUserStatus(status)
}

export function normalizeBuddyAgentPresenceStatus({
  userStatus,
  agentStatus,
  lastHeartbeat,
  busy = false,
}: {
  userStatus?: string | null
  agentStatus?: string | null
  lastHeartbeat?: string | number | Date | null
  busy?: boolean
}): PresenceAvatarStatus {
  return normalizeBuddyRuntimePresenceStatus({
    userStatus,
    agentStatus,
    lastHeartbeat,
    busy,
  })
}
