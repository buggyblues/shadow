export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline'
export type BuddyPresenceStatus = UserStatus | 'busy'

export const USER_STATUSES = ['online', 'idle', 'dnd', 'offline'] as const
export const BUDDY_PRESENCE_STATUSES = ['online', 'busy', 'idle', 'dnd', 'offline'] as const
export const BUDDY_HEARTBEAT_ONLINE_THRESHOLD_MS = 90_000

export function normalizeUserStatus(status?: string | null): UserStatus {
  if (status === 'online' || status === 'idle' || status === 'dnd' || status === 'offline') {
    return status
  }
  return 'offline'
}

export function normalizeBuddyPresenceStatus(
  status?: string | null,
  options?: { busy?: boolean },
): BuddyPresenceStatus {
  if (options?.busy) {
    return 'busy'
  }

  if (status === 'busy') {
    return 'busy'
  }

  return normalizeUserStatus(status)
}

export function isBuddyHeartbeatActive(
  lastHeartbeat?: string | number | Date | null,
  options?: { nowMs?: number; thresholdMs?: number },
): boolean {
  if (!lastHeartbeat) return false
  const heartbeatMs =
    lastHeartbeat instanceof Date ? lastHeartbeat.getTime() : new Date(lastHeartbeat).getTime()
  if (!Number.isFinite(heartbeatMs)) return false
  const nowMs = options?.nowMs ?? Date.now()
  const thresholdMs = options?.thresholdMs ?? BUDDY_HEARTBEAT_ONLINE_THRESHOLD_MS
  return nowMs - heartbeatMs <= thresholdMs
}

export function normalizeBuddyRuntimePresenceStatus({
  userStatus,
  agentStatus,
  lastHeartbeat,
  busy = false,
  nowMs,
}: {
  userStatus?: string | null
  agentStatus?: string | null
  lastHeartbeat?: string | number | Date | null
  busy?: boolean
  nowMs?: number
}): BuddyPresenceStatus {
  if (busy || agentStatus === 'busy') return 'busy'
  if (agentStatus === 'running') {
    return isBuddyHeartbeatActive(lastHeartbeat, { nowMs }) ? 'online' : 'offline'
  }

  const normalizedAgentStatus = normalizeBuddyPresenceStatus(agentStatus)
  if (normalizedAgentStatus !== 'offline') return normalizedAgentStatus

  return normalizeUserStatus(userStatus)
}

export interface User {
  id: string
  email: string
  username: string
  displayName: string
  avatarUrl: string | null
  status: UserStatus
  isBot: boolean
  membership?: UserMembership
  createdAt: string
  updatedAt: string
}

export interface UserProfile {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  status: UserStatus
  isBot: boolean
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  username?: string
  displayName?: string
  password: string
  inviteCode?: string
}

export interface AuthResponse {
  user: User
  accessToken: string
  refreshToken: string
}

export interface UserMembershipTier {
  id: string
  level: number
  label: string
  capabilities: string[]
}

export interface UserMembership {
  status: string
  tier: UserMembershipTier
  level: number
  isMember: boolean
  memberSince?: string | null
  inviteCodeId?: string | null
  capabilities: string[]
}
