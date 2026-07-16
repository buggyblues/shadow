import { normalizeBuddyRuntimePresenceStatus, normalizePresenceStatus } from '@shadowob/shared'
import { fetchApi, getImageUrl } from '../../lib/api'
import type {
  BuddyInboxEntry,
  DirectChannelEntry,
  LaunchContext,
  UnifiedServerMember,
  UnifiedWorkspaceNode,
} from './types'

type SignedWorkspaceMediaUrl = {
  url: string
  expiresAt: string
}

export function withLaunchParams(entry: string, _launch: LaunchContext) {
  const url = new URL(entry)
  url.searchParams.delete('shadow_launch')
  url.searchParams.delete('shadow_event_stream')
  return url.toString()
}

export function buddyInboxPresenceStatus(entry: BuddyInboxEntry, isOpening: boolean) {
  if (isOpening) return 'busy'
  return normalizeBuddyRuntimePresenceStatus({
    userStatus: entry.agent.user.status,
    agentStatus: entry.agent.status,
    lastHeartbeat: entry.agent.lastHeartbeat,
  })
}

export function directMessagePeerName(channel: DirectChannelEntry) {
  return (
    channel.otherUser?.displayName ||
    channel.otherUser?.username ||
    channel.otherUser?.id ||
    channel.id
  )
}

export function shouldShowDirectChannel(channel: DirectChannelEntry) {
  const peer = channel.otherUser
  if (!peer) return false
  return !(peer.isBot && normalizePresenceStatus(peer.status) === 'offline')
}

export function createMenuLabel(label: string) {
  return label.replace(/^\+\s*/, '').replace(/^(新建|创建|添加|New\s+|Create\s+|Add\s+)/, '')
}

export function memberDisplayName(member: UnifiedServerMember) {
  return member.nickname || member.user.displayName || member.user.username || member.user.id
}

function memberActivityScore(member: UnifiedServerMember) {
  const heartbeat = member.agent?.lastHeartbeat ? new Date(member.agent.lastHeartbeat).getTime() : 0
  if (Number.isFinite(heartbeat) && heartbeat > 0) return heartbeat
  return member.totalOnlineSeconds ?? member.agent?.totalOnlineSeconds ?? 0
}

export function buildMemberTreeRows(members: UnifiedServerMember[]) {
  const byName = (a: UnifiedServerMember, b: UnifiedServerMember) =>
    memberDisplayName(a).localeCompare(memberDisplayName(b))
  const humans = members.filter((member) => !member.user.isBot)
  const buddies = members.filter((member) => member.user.isBot)
  const buddiesByOwner = new Map<string, UnifiedServerMember[]>()

  buddies.forEach((buddy) => {
    const ownerId = buddy.agent?.ownerId
    if (!ownerId) return
    const group = buddiesByOwner.get(ownerId) ?? []
    group.push(buddy)
    buddiesByOwner.set(ownerId, group)
  })

  buddiesByOwner.forEach((group) => {
    group.sort((a, b) => memberActivityScore(b) - memberActivityScore(a) || byName(a, b))
  })

  const rows: Array<{
    key: string
    member: UnifiedServerMember
    level: 0 | 1
    isLastChild?: boolean
  }> = []
  const seen = new Set<string>()
  const sortedHumans = [...humans].sort((a, b) => {
    const aBuddies = buddiesByOwner.get(a.user.id) ?? []
    const bBuddies = buddiesByOwner.get(b.user.id) ?? []
    const aActivity = Math.max(memberActivityScore(a), ...aBuddies.map(memberActivityScore))
    const bActivity = Math.max(memberActivityScore(b), ...bBuddies.map(memberActivityScore))
    if (aActivity !== bActivity) return bActivity - aActivity
    if (a.role !== b.role) {
      const roleRank = { owner: 0, admin: 1, member: 2 } as Record<string, number>
      return (roleRank[a.role] ?? 3) - (roleRank[b.role] ?? 3)
    }
    return byName(a, b)
  })

  sortedHumans.forEach((member) => {
    rows.push({ key: `member-${member.user.id}`, member, level: 0 })
    seen.add(member.user.id)

    const ownedBuddies = buddiesByOwner.get(member.user.id) ?? []
    ownedBuddies.forEach((buddy, index) => {
      rows.push({
        key: `buddy-${member.user.id}-${buddy.user.id}`,
        member: buddy,
        level: 1,
        isLastChild: index === ownedBuddies.length - 1,
      })
      seen.add(buddy.user.id)
    })
  })

  buddies
    .filter((buddy) => !seen.has(buddy.user.id))
    .sort((a, b) => memberActivityScore(b) - memberActivityScore(a) || byName(a, b))
    .forEach((buddy) => {
      rows.push({ key: `buddy-${buddy.user.id}`, member: buddy, level: 0 })
    })

  return rows
}

export function normalizeWorkspaceNode(node: UnifiedWorkspaceNode): UnifiedWorkspaceNode {
  return {
    ...node,
    kind: node.kind ?? (node.type === 'folder' ? 'dir' : 'file'),
    sizeBytes: node.sizeBytes ?? node.size ?? null,
    mime: node.mime ?? node.mimeType ?? null,
  }
}

export async function resolveUnifiedWorkspaceMediaUrl(
  serverId: string,
  node: UnifiedWorkspaceNode,
  disposition: 'inline' | 'attachment',
) {
  if (node.contentRef) {
    const params = new URLSearchParams({ disposition, contentRef: node.contentRef })
    const signed = await fetchApi<SignedWorkspaceMediaUrl>(
      `/api/servers/${serverId}/workspace/files/${node.id}/media-url?${params.toString()}`,
    )
    return getImageUrl(signed.url) ?? signed.url
  }

  const fallback = node.previewUrl ?? node.url
  return fallback ? (getImageUrl(fallback) ?? fallback) : null
}

export function formatWorkspaceSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
