import {
  applyPresenceChangeToRuntime,
  getBuddyPresenceExpiresAt,
  normalizeUserStatus,
  type PresenceChangePayload,
  type PresenceSnapshotPayload,
} from '@shadowob/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { AUTH_ME_QUERY_KEY, type AuthenticatedUser } from '../lib/auth-session'
import { useAuthStore } from '../stores/auth.store'
import { useSocketEvent } from './use-socket'

type UserLike = {
  id?: string | null
  status?: string | null
  isBot?: boolean | null
}

type AgentLike = {
  id?: string | null
  status?: string | null
  lastHeartbeat?: string | null
}

type MemberLike = {
  userId?: string | null
  status?: string | null
  isBot?: boolean | null
  user?: UserLike | null
  agent?: AgentLike | null
}

type BuddyInboxLike = {
  agent?: (AgentLike & { user?: UserLike | null }) | null
}

type DirectChannelLike = {
  otherUser?: UserLike | null
}

type UserProfileLike = UserLike & {
  agent?: AgentLike | null
  ownedAgents?: Array<AgentLike & { userId?: string | null; botUser?: UserLike | null }>
}

function patchMember<T extends MemberLike>(
  member: T,
  update: PresenceChangePayload,
  observedAt: string,
): T {
  const user = member.user
  const userId = member.userId ?? user?.id
  if (!userId || userId !== update.userId) return member

  const isBot = user?.isBot ?? member.isBot ?? Boolean(member.agent)
  const runtime = applyPresenceChangeToRuntime(
    {
      userStatus: user?.status ?? member.status,
      isBot,
      agentStatus: member.agent?.status,
      lastHeartbeat: member.agent?.lastHeartbeat,
    },
    update,
    { observedAt },
  )

  return {
    ...member,
    status: runtime.userStatus,
    user: user ? { ...user, status: runtime.userStatus } : user,
    agent:
      member.agent && isBot
        ? {
            ...member.agent,
            ...(runtime.agentStatus !== undefined ? { status: runtime.agentStatus } : {}),
            ...(runtime.lastHeartbeat !== undefined
              ? { lastHeartbeat: runtime.lastHeartbeat }
              : {}),
          }
        : member.agent,
  }
}

function patchMemberArray<T extends MemberLike>(
  items: T[] | undefined,
  updates: Map<string, PresenceChangePayload>,
  observedAt: string,
) {
  if (!items || updates.size === 0) return items
  let changed = false
  const next = items.map((item) => {
    const userId = item.userId ?? item.user?.id
    const update = userId ? updates.get(userId) : undefined
    if (!update) return item
    const patched = patchMember(item, update, observedAt)
    if (patched !== item) changed = true
    return patched
  })
  return changed ? next : items
}

function patchBuddyInboxArray<T extends BuddyInboxLike>(
  entries: T[] | undefined,
  updates: Map<string, PresenceChangePayload>,
  observedAt: string,
) {
  if (!entries || updates.size === 0) return entries
  let changed = false
  const next = entries.map((entry) => {
    const agent = entry.agent
    const userId = agent?.user?.id
    const update = (userId ? updates.get(userId) : undefined) ?? updates.get(agent?.id ?? '')
    if (!agent || !update) return entry
    const runtime = applyPresenceChangeToRuntime(
      {
        userStatus: agent.user?.status,
        isBot: true,
        agentStatus: agent.status,
        lastHeartbeat: agent.lastHeartbeat,
      },
      update,
      { observedAt },
    )
    changed = true
    return {
      ...entry,
      agent: {
        ...agent,
        ...(runtime.agentStatus !== undefined ? { status: runtime.agentStatus } : {}),
        ...(runtime.lastHeartbeat !== undefined ? { lastHeartbeat: runtime.lastHeartbeat } : {}),
        user: agent.user ? { ...agent.user, status: runtime.userStatus } : agent.user,
      },
    }
  })
  return changed ? next : entries
}

function patchDirectChannels<T extends DirectChannelLike>(
  channels: T[] | undefined,
  updates: Map<string, PresenceChangePayload>,
) {
  if (!channels || updates.size === 0) return channels
  let changed = false
  const next = channels.map((channel) => {
    const user = channel.otherUser
    if (!user?.id) return channel
    const update = updates.get(user.id)
    if (!update) return channel
    changed = true
    return { ...channel, otherUser: { ...user, status: normalizeUserStatus(update.status) } }
  })
  return changed ? next : channels
}

function patchChannel<T extends DirectChannelLike>(
  channel: T | undefined,
  updates: Map<string, PresenceChangePayload>,
) {
  const user = channel?.otherUser
  if (!channel || !user?.id) return channel
  const update = updates.get(user.id)
  if (!update) return channel
  return { ...channel, otherUser: { ...user, status: normalizeUserStatus(update.status) } }
}

function patchProfile<T extends UserProfileLike>(
  profile: T | undefined,
  updates: Map<string, PresenceChangePayload>,
  observedAt: string,
) {
  if (!profile || updates.size === 0) return profile
  let next = profile
  const ownUpdate = profile.id ? updates.get(profile.id) : undefined
  if (ownUpdate) {
    const runtime = applyPresenceChangeToRuntime(
      {
        userStatus: profile.status,
        isBot: Boolean(profile.agent),
        agentStatus: profile.agent?.status,
        lastHeartbeat: profile.agent?.lastHeartbeat,
      },
      ownUpdate,
      { observedAt },
    )
    next = {
      ...next,
      status: runtime.userStatus,
      agent: profile.agent
        ? {
            ...profile.agent,
            ...(runtime.agentStatus !== undefined ? { status: runtime.agentStatus } : {}),
            ...(runtime.lastHeartbeat !== undefined
              ? { lastHeartbeat: runtime.lastHeartbeat }
              : {}),
          }
        : profile.agent,
    }
  }

  if (profile.ownedAgents?.length) {
    let changed = false
    const ownedAgents = profile.ownedAgents.map((agent) => {
      const userId = agent.userId ?? agent.botUser?.id
      const update = userId ? updates.get(userId) : undefined
      if (!update) return agent
      const runtime = applyPresenceChangeToRuntime(
        {
          userStatus: agent.botUser?.status,
          isBot: true,
          agentStatus: agent.status,
          lastHeartbeat: agent.lastHeartbeat,
        },
        update,
        { observedAt },
      )
      changed = true
      return {
        ...agent,
        ...(runtime.agentStatus !== undefined ? { status: runtime.agentStatus } : {}),
        ...(runtime.lastHeartbeat !== undefined ? { lastHeartbeat: runtime.lastHeartbeat } : {}),
        botUser: agent.botUser ? { ...agent.botUser, status: runtime.userStatus } : agent.botUser,
      }
    })
    if (changed) next = { ...next, ownedAgents }
  }

  return next === profile ? profile : next
}

export function usePresenceCacheSync() {
  const queryClient = useQueryClient()
  const expiryTimers = useRef(new Map<string, number>())

  const applyUpdates = useCallback(
    (updates: Map<string, PresenceChangePayload>) => {
      if (updates.size === 0) return
      const observedAt = new Date().toISOString()

      queryClient.setQueriesData<MemberLike[]>({ queryKey: ['members'] }, (current) =>
        patchMemberArray(current, updates, observedAt),
      )
      queryClient.setQueriesData<MemberLike[]>({ queryKey: ['channel-members'] }, (current) =>
        patchMemberArray(current, updates, observedAt),
      )
      queryClient.setQueriesData<MemberLike[]>({ queryKey: ['server-members'] }, (current) =>
        patchMemberArray(current, updates, observedAt),
      )
      queryClient.setQueriesData<MemberLike[]>(
        { queryKey: ['server-members-for-invite'] },
        (current) => patchMemberArray(current, updates, observedAt),
      )
      queryClient.setQueriesData<BuddyInboxLike[]>({ queryKey: ['server-inboxes'] }, (current) =>
        patchBuddyInboxArray(current, updates, observedAt),
      )
      queryClient.setQueriesData<BuddyInboxLike[]>({ queryKey: ['buddy-inboxes'] }, (current) =>
        patchBuddyInboxArray(current, updates, observedAt),
      )
      queryClient.setQueriesData<DirectChannelLike[]>(
        { queryKey: ['direct-channels'] },
        (current) => patchDirectChannels(current, updates),
      )
      queryClient.setQueriesData<DirectChannelLike>({ queryKey: ['channel'] }, (current) =>
        patchChannel(current, updates),
      )
      queryClient.setQueriesData<UserProfileLike>({ queryKey: ['user-profile'] }, (current) =>
        patchProfile(current, updates, observedAt),
      )

      const currentUser = useAuthStore.getState().user
      if (currentUser?.id && updates.has(currentUser.id)) {
        const status = normalizeUserStatus(updates.get(currentUser.id)?.status)
        useAuthStore.setState({ user: { ...currentUser, status } })
        queryClient.setQueryData<AuthenticatedUser>(AUTH_ME_QUERY_KEY, (current) =>
          current ? { ...current, status } : current,
        )
      }
    },
    [queryClient],
  )

  const scheduleExpiry = useCallback(
    (update: PresenceChangePayload) => {
      const existing = expiryTimers.current.get(update.userId)
      if (existing) {
        window.clearTimeout(existing)
        expiryTimers.current.delete(update.userId)
      }

      const expiresAt =
        update.expiresAt ??
        (update.status === 'online' ? getBuddyPresenceExpiresAt(update.lastHeartbeat) : null)
      if (update.status !== 'online' || !expiresAt) return

      const delayMs = new Date(expiresAt).getTime() - Date.now()
      if (!Number.isFinite(delayMs) || delayMs <= 0) return

      const timer = window.setTimeout(
        () => {
          expiryTimers.current.delete(update.userId)
          applyUpdates(
            new Map([
              [
                update.userId,
                {
                  ...update,
                  status: 'offline',
                  lastHeartbeat: null,
                  observedAt: new Date().toISOString(),
                  expiresAt: null,
                },
              ],
            ]),
          )
        },
        Math.min(delayMs + 250, 2_147_483_647),
      )
      expiryTimers.current.set(update.userId, timer)
    },
    [applyUpdates],
  )

  const handleUpdates = useCallback(
    (updates: Map<string, PresenceChangePayload>) => {
      applyUpdates(updates)
      for (const update of updates.values()) scheduleExpiry(update)
    },
    [applyUpdates, scheduleExpiry],
  )

  useSocketEvent<PresenceChangePayload>('presence:change', (data) => {
    handleUpdates(new Map([[data.userId, data]]))
  })

  useSocketEvent<PresenceSnapshotPayload>('presence:snapshot', (data) => {
    handleUpdates(new Map(data.members.map((member) => [member.userId, member])))
  })

  useSocketEvent('connect', () => {
    queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
    queryClient.invalidateQueries({ queryKey: ['server-inboxes'] })
    queryClient.invalidateQueries({ queryKey: ['buddy-inboxes'] })
  })

  useEffect(() => {
    return () => {
      for (const timer of expiryTimers.current.values()) window.clearTimeout(timer)
      expiryTimers.current.clear()
    }
  }, [])
}
