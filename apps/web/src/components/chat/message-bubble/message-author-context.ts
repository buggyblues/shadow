import type { QueryClient } from '@tanstack/react-query'
import { EMPTY_BUDDY_AGENT_ENTRIES, EMPTY_MEMBER_ENTRIES } from './constants'
import type { Author, BuddyAgentEntry, MemberEntry } from './types'

interface MessageAuthorContextArgs {
  author?: Author
  currentUserId: string
  isOwn: boolean
  queryClient: QueryClient
  serverId?: string
}

export function getMessageAuthorContext({
  author,
  currentUserId,
  isOwn,
  queryClient,
  serverId,
}: MessageAuthorContextArgs) {
  const membersList = serverId
    ? (queryClient.getQueryData<MemberEntry[]>(['members', serverId]) ?? EMPTY_MEMBER_ENTRIES)
    : EMPTY_MEMBER_ENTRIES
  const authorMember = membersList.find((member) => member.userId === author?.id)
  const buddyAgentsList = serverId
    ? (queryClient.getQueryData<BuddyAgentEntry[]>(['members-buddy-agents', serverId]) ??
      EMPTY_BUDDY_AGENT_ENTRIES)
    : EMPTY_BUDDY_AGENT_ENTRIES
  const buddyAgent = author?.isBot
    ? buddyAgentsList.find((agent) => agent.botUser?.id === author.id)
    : undefined
  const currentMember = membersList.find((member) => member.userId === currentUserId)
  const canKick = Boolean(
    serverId && (currentMember?.role === 'owner' || currentMember?.role === 'admin'),
  )
  const canDelete = isOwn || Boolean(author?.isBot && buddyAgent?.ownerId === currentUserId)

  return {
    authorMember,
    buddyAgent,
    canDelete,
    canKick,
    membersList,
  }
}
