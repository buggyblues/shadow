import type { QueryClient, QueryKey } from '@tanstack/react-query'

export interface ChannelCacheItem {
  id: string
  name?: string
  serverId?: string | null
  type?: string
  topic?: string | null
  position?: number | null
  isPrivate?: boolean | null
  isArchived?: boolean | null
  isMember?: boolean
  createdAt?: string
  updatedAt?: string
  lastMessageAt?: string | null
}

interface ChannelBootstrapCache<TChannel extends ChannelCacheItem = ChannelCacheItem> {
  channel?: TChannel | null
  channels?: TChannel[]
  server?: {
    id?: string | null
    slug?: string | null
  } | null
  buddyInboxes?: BuddyInboxCacheEntry<TChannel>[]
}

interface BuddyInboxCacheEntry<TChannel extends ChannelCacheItem = ChannelCacheItem> {
  agent?: {
    id?: string | null
  } | null
  channel?: TChannel | null
}

const CHANNEL_COLLECTION_PREFIXES = ['channels', 'server-index-channels'] as const

export function serverChannelCacheKeys(...keys: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  for (const key of keys) {
    const normalized = key?.trim()
    if (normalized) seen.add(normalized)
  }
  return [...seen]
}

function channelCollectionQueryKeys(serverKeys: readonly string[]): QueryKey[] {
  return serverKeys.flatMap((serverKey) =>
    CHANNEL_COLLECTION_PREFIXES.map((prefix) => [prefix, serverKey] as const),
  )
}

function upsertChannelInList<TChannel extends ChannelCacheItem>(
  current: TChannel[] | undefined,
  channel: TChannel,
): TChannel[] {
  if (!current?.length) return [channel]

  let found = false
  const next = current.map((item) => {
    if (item.id !== channel.id) return item
    found = true
    return { ...item, ...channel, id: item.id } as TChannel
  })

  if (!found) next.push(channel)
  return next
}

function patchChannelInList<TChannel extends ChannelCacheItem>(
  current: TChannel[] | undefined,
  channelId: string,
  patch: Partial<TChannel>,
): TChannel[] | undefined {
  if (!current?.length) return current

  let found = false
  const next = current.map((item) => {
    if (item.id !== channelId) return item
    found = true
    return { ...item, ...patch, id: item.id } as TChannel
  })

  return found ? next : current
}

function removeChannelFromList<TChannel extends ChannelCacheItem>(
  current: TChannel[] | undefined,
  channelId: string,
): TChannel[] | undefined {
  if (!current?.length) return current
  const next = current.filter((item) => item.id !== channelId)
  return next.length === current.length ? current : next
}

function sameChannelSnapshot(
  current: readonly ChannelCacheItem[] | undefined,
  next: readonly ChannelCacheItem[],
) {
  if (!current || current.length !== next.length) return false

  return current.every((currentChannel, index) => {
    const nextChannel = next[index]
    return (
      nextChannel &&
      currentChannel.id === nextChannel.id &&
      currentChannel.name === nextChannel.name &&
      currentChannel.serverId === nextChannel.serverId &&
      currentChannel.type === nextChannel.type &&
      currentChannel.topic === nextChannel.topic &&
      currentChannel.position === nextChannel.position &&
      currentChannel.isPrivate === nextChannel.isPrivate &&
      currentChannel.isArchived === nextChannel.isArchived &&
      currentChannel.isMember === nextChannel.isMember &&
      currentChannel.lastMessageAt === nextChannel.lastMessageAt &&
      currentChannel.updatedAt === nextChannel.updatedAt
    )
  })
}

function getInboxSignature(entry: unknown) {
  const inbox = entry as {
    agent?: { id?: string | null } | null
    channel?: ChannelCacheItem | null
    canManage?: boolean
  }
  return [
    inbox.agent?.id ?? '',
    inbox.channel?.id ?? '',
    inbox.channel?.isArchived ? '1' : '0',
    inbox.channel?.updatedAt ?? '',
    inbox.canManage ? '1' : '0',
  ].join(':')
}

function sameInboxSnapshot(current: readonly unknown[] | undefined, next: readonly unknown[]) {
  if (!current || current.length !== next.length) return false
  return current.every(
    (entry, index) => getInboxSignature(entry) === getInboxSignature(next[index]),
  )
}

function bootstrapMatchesServerOrChannel(
  bootstrap: ChannelBootstrapCache,
  serverKeys: ReadonlySet<string>,
  channelId?: string,
) {
  if (channelId) {
    if (bootstrap.channel?.id === channelId) return true
    if (bootstrap.channels?.some((channel) => channel.id === channelId)) return true
    if (bootstrap.buddyInboxes?.some((entry) => entry.channel?.id === channelId)) return true
  }

  if (serverKeys.size === 0) return false
  if (bootstrap.server?.id && serverKeys.has(bootstrap.server.id)) return true
  if (bootstrap.server?.slug && serverKeys.has(bootstrap.server.slug)) return true
  if (bootstrap.channel?.serverId && serverKeys.has(bootstrap.channel.serverId)) return true
  return bootstrap.channels?.some((channel) => channel.serverId && serverKeys.has(channel.serverId))
}

function updateBootstrapChannelSnapshots<TChannel extends ChannelCacheItem>(
  queryClient: QueryClient,
  serverKeys: readonly string[],
  channelId: string,
  updateChannels: (channels: TChannel[] | undefined) => TChannel[] | undefined,
) {
  const serverKeySet = new Set(serverKeys)
  queryClient.setQueriesData<ChannelBootstrapCache<TChannel>>(
    { queryKey: ['channel-bootstrap'] },
    (current) => {
      if (!current || !bootstrapMatchesServerOrChannel(current, serverKeySet, channelId)) {
        return current
      }

      let changed = false
      let channels = current.channels
      if (current.channels) {
        const nextChannels = updateChannels(current.channels)
        if (nextChannels !== current.channels) {
          channels = nextChannels
          changed = true
        }
      }

      let channel = current.channel
      if (current.channel?.id === channelId) {
        const updated = updateChannels([current.channel])
        const nextChannel = updated?.find((item) => item.id === channelId) ?? null
        if (nextChannel !== current.channel) {
          channel = nextChannel
          changed = true
        }
      }

      return changed ? { ...current, channels, channel } : current
    },
  )
}

export function seedServerChannelSnapshot<TChannel extends ChannelCacheItem>(
  queryClient: QueryClient,
  serverKeys: readonly string[],
  channels: readonly TChannel[],
) {
  for (const queryKey of channelCollectionQueryKeys(serverKeys)) {
    queryClient.setQueryData<TChannel[]>(queryKey, (current) =>
      sameChannelSnapshot(current, channels) ? current : channels.slice(),
    )
  }
}

export function seedBuddyInboxSnapshot<TInbox>(
  queryClient: QueryClient,
  serverKeys: readonly string[],
  inboxes: readonly TInbox[],
) {
  for (const serverKey of serverKeys) {
    queryClient.setQueryData<TInbox[]>(['buddy-inboxes', serverKey], (current) =>
      sameInboxSnapshot(current, inboxes) ? current : inboxes.slice(),
    )
  }
}

export function upsertServerChannel<TChannel extends ChannelCacheItem>(
  queryClient: QueryClient,
  serverKeys: readonly string[],
  channel: TChannel,
) {
  for (const queryKey of channelCollectionQueryKeys(serverKeys)) {
    queryClient.setQueryData<TChannel[]>(queryKey, (current) =>
      upsertChannelInList(current, channel),
    )
  }
  queryClient.setQueryData<TChannel>(['channel', channel.id], (current) =>
    current ? ({ ...current, ...channel, id: current.id } as TChannel) : channel,
  )
  updateBootstrapChannelSnapshots<TChannel>(queryClient, serverKeys, channel.id, (channels) =>
    upsertChannelInList(channels, channel),
  )
}

export function patchServerChannel<TChannel extends ChannelCacheItem>(
  queryClient: QueryClient,
  serverKeys: readonly string[],
  channelId: string,
  patch: Partial<TChannel>,
) {
  for (const queryKey of channelCollectionQueryKeys(serverKeys)) {
    queryClient.setQueryData<TChannel[]>(queryKey, (current) =>
      patchChannelInList(current, channelId, patch),
    )
  }
  queryClient.setQueryData<TChannel>(['channel', channelId], (current) =>
    current ? ({ ...current, ...patch, id: current.id } as TChannel) : current,
  )
  updateBootstrapChannelSnapshots<TChannel>(queryClient, serverKeys, channelId, (channels) =>
    patchChannelInList(channels, channelId, patch),
  )
}

export function removeServerChannel(
  queryClient: QueryClient,
  serverKeys: readonly string[],
  channelId: string,
) {
  for (const queryKey of channelCollectionQueryKeys(serverKeys)) {
    queryClient.setQueryData<ChannelCacheItem[]>(queryKey, (current) =>
      removeChannelFromList(current, channelId),
    )
  }
  queryClient.setQueryData(['channel', channelId], undefined)
  updateBootstrapChannelSnapshots(queryClient, serverKeys, channelId, (channels) =>
    removeChannelFromList(channels, channelId),
  )
}

export function patchChannelAcrossCachedCollections<TChannel extends ChannelCacheItem>(
  queryClient: QueryClient,
  channelId: string,
  patch: Partial<TChannel>,
) {
  for (const prefix of CHANNEL_COLLECTION_PREFIXES) {
    queryClient.setQueriesData<TChannel[]>({ queryKey: [prefix] }, (current) =>
      patchChannelInList(current, channelId, patch),
    )
  }
  queryClient.setQueryData<TChannel>(['channel', channelId], (current) =>
    current ? ({ ...current, ...patch, id: current.id } as TChannel) : current,
  )
  updateBootstrapChannelSnapshots<TChannel>(queryClient, [], channelId, (channels) =>
    patchChannelInList(channels, channelId, patch),
  )
}

export function upsertBuddyInboxChannel<TChannel extends ChannelCacheItem>(
  queryClient: QueryClient,
  serverKeys: readonly string[],
  agentId: string,
  channel: TChannel,
) {
  for (const serverKey of serverKeys) {
    queryClient.setQueryData<BuddyInboxCacheEntry<TChannel>[]>(
      ['buddy-inboxes', serverKey],
      (current) => {
        if (!current?.length) return current
        let found = false
        const next = current.map((entry) => {
          if (entry.agent?.id !== agentId) return entry
          found = true
          return { ...entry, channel }
        })
        return found ? next : current
      },
    )
  }

  queryClient.setQueriesData<ChannelBootstrapCache<TChannel>>(
    { queryKey: ['channel-bootstrap'] },
    (current) => {
      if (!current || !bootstrapMatchesServerOrChannel(current, new Set(serverKeys), channel.id)) {
        return current
      }
      if (!current.buddyInboxes?.length) return current

      let found = false
      const buddyInboxes = current.buddyInboxes.map((entry) => {
        if (entry.agent?.id !== agentId) return entry
        found = true
        return { ...entry, channel }
      })

      return found ? { ...current, buddyInboxes } : current
    },
  )
  queryClient.setQueryData<TChannel>(['channel', channel.id], (current) =>
    current ? ({ ...current, ...channel, id: current.id } as TChannel) : channel,
  )
}

export function invalidateServerChannelState(
  queryClient: QueryClient,
  serverKeys: readonly string[],
  options: {
    includeChannelLists?: boolean
    includeBuddyInboxes?: boolean
    includeBootstrap?: boolean
  } = {},
) {
  const {
    includeChannelLists = true,
    includeBuddyInboxes = false,
    includeBootstrap = true,
  } = options

  if (includeChannelLists) {
    const queryKeys =
      serverKeys.length > 0
        ? channelCollectionQueryKeys(serverKeys)
        : CHANNEL_COLLECTION_PREFIXES.map((prefix) => [prefix] as const)
    for (const queryKey of queryKeys) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }

  if (includeBuddyInboxes) {
    const queryKeys =
      serverKeys.length > 0 ? serverKeys.map((serverKey) => ['buddy-inboxes', serverKey]) : []
    for (const queryKey of queryKeys) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }

  if (includeBootstrap) {
    void queryClient.invalidateQueries({ queryKey: ['channel-bootstrap'] })
  }
}
