const API_BASE = '/api/admin'

export async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem('admin_token') ?? ''
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  })
  if (res.status === 403) {
    localStorage.removeItem('admin_token')
    window.location.reload()
    throw new Error('Admin access denied')
  }
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

// ── Shared Types ────────────────────────────────────────────────────────────

export interface Stats {
  totalUsers: number
  onlineUsers: number
  totalServers: number
  totalMessages: number
  totalChannels: number
  totalInviteCodes: number
  usedInviteCodes: number
}

export interface InviteCode {
  id: string
  code: string
  isActive: boolean
  usedBy: string | null
  usedAt: string | null
  note: string | null
  createdAt: string
  createdByUser: { id: string; username: string; displayName: string | null } | null
}

export interface User {
  id: string
  email: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status: string
  isBot: boolean
  createdAt: string
}

export interface Server {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  isPublic: boolean
  createdAt: string
}

export interface Channel {
  id: string
  name: string
  type: string
  serverId: string
}

export interface Message {
  id: string
  content: string
  channelId: string
  authorId: string
  createdAt: string
  author?: { username: string; displayName: string | null } | null
}

export interface AdminAgent {
  id: string
  userId: string
  kernelType: string
  config: Record<string, unknown>
  ownerId: string
  status: 'running' | 'stopped' | 'error'
  containerId: string | null
  updatedAt: string
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    email: string
  } | null
  owner?: {
    id: string
    username: string
    displayName: string | null
  } | null
}

export interface PasswordChangeLog {
  id: string
  userId: string
  ipAddress: string | null
  userAgent: string | null
  success: boolean
  failureReason: string | null
  createdAt: string
  user?: {
    id: string
    email: string
    username: string
    displayName: string | null
  } | null
}

export interface CloudTemplate {
  id: string
  slug: string
  name: string
  description: string | null
  source: 'official' | 'community'
  reviewStatus: 'draft' | 'pending' | 'approved' | 'rejected'
  reviewNote: string | null
  tags: string[]
  category: string | null
  baseCost: number | null
  deployCount: number
  content: Record<string, unknown>
  createdAt: string
  updatedAt: string
  authorId: string | null
}
