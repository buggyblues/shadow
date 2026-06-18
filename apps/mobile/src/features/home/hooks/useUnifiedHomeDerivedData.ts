import type { TFunction } from 'i18next'
import { FolderOpen, ShoppingBag } from 'lucide-react-native'
import { useMemo } from 'react'
import type {
  BuddyInboxEntry,
  CommandCandidate,
  DirectChannelEntry,
  GlobalSearchServerData,
  ScopedUnread,
  ServerAppIntegration,
  ServerEntry,
  UnifiedChannel,
  UnifiedServerMember,
  UnifiedWorkspaceNode,
} from '../types'
import { memberDisplayName, normalizeWorkspaceNode, shouldShowDirectChannel } from '../utils'

export function useUnifiedHomeDerivedData({
  rawChannels,
  sortChannels,
  serverMembers,
  directChannels,
  scopedUnread,
  workspaceNodes,
  globalSearchServers,
  selectedServer,
  inboxes,
  railServers,
  searchQuery,
  selectedServerSlug,
  displayServerName,
  serverApps,
  commandWorkspaceNodes,
  t,
}: {
  rawChannels: UnifiedChannel[]
  sortChannels: (channels: UnifiedChannel[]) => UnifiedChannel[]
  serverMembers: UnifiedServerMember[]
  directChannels: DirectChannelEntry[]
  scopedUnread?: ScopedUnread
  workspaceNodes: UnifiedWorkspaceNode[]
  globalSearchServers: GlobalSearchServerData[]
  selectedServer?: ServerEntry
  inboxes: BuddyInboxEntry[]
  railServers: ServerEntry[]
  searchQuery: string
  selectedServerSlug?: string
  displayServerName?: string | null
  serverApps: ServerAppIntegration[]
  commandWorkspaceNodes: UnifiedWorkspaceNode[]
  t: TFunction
}) {
  const channels = useMemo(() => sortChannels(rawChannels), [rawChannels, sortChannels])
  const searchKeyword = searchQuery.trim().toLowerCase()
  const sortedServerMembers = useMemo(
    () =>
      [...serverMembers]
        .filter((member) => member.user?.id)
        .sort((a, b) => {
          if (a.user.isBot !== b.user.isBot) return a.user.isBot ? -1 : 1
          if (a.role !== b.role) {
            const roleRank = { owner: 0, admin: 1, member: 2 } as Record<string, number>
            return (roleRank[a.role] ?? 3) - (roleRank[b.role] ?? 3)
          }
          return memberDisplayName(a).localeCompare(memberDisplayName(b))
        }),
    [serverMembers],
  )
  const directMessages = useMemo(() => {
    return [...directChannels].filter(shouldShowDirectChannel).sort((a, b) => {
      const aUnread = scopedUnread?.channelUnread?.[a.id] ?? 0
      const bUnread = scopedUnread?.channelUnread?.[b.id] ?? 0
      if (aUnread !== bUnread) return bUnread - aUnread
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bTime - aTime
    })
  }, [directChannels, scopedUnread?.channelUnread])
  const sortedWorkspaceNodes = useMemo(
    () =>
      [...workspaceNodes].map(normalizeWorkspaceNode).sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
        return (a.pos ?? 0) - (b.pos ?? 0) || a.name.localeCompare(b.name)
      }),
    [workspaceNodes],
  )
  const rankedServerSearchData = useMemo(() => {
    const byServerId = new Map<string, GlobalSearchServerData>()
    for (const entry of globalSearchServers) {
      byServerId.set(entry.server.server.id, entry)
    }
    if (selectedServer) {
      byServerId.set(selectedServer.server.id, {
        server: selectedServer,
        channels,
        inboxes,
      })
    }
    return Array.from(byServerId.values()).sort((a, b) => {
      const aCurrent = a.server.server.id === selectedServer?.server.id
      const bCurrent = b.server.server.id === selectedServer?.server.id
      if (aCurrent !== bCurrent) return aCurrent ? -1 : 1
      return a.server.server.name.localeCompare(b.server.server.name)
    })
  }, [channels, globalSearchServers, inboxes, selectedServer])
  const matchedServers = useMemo(() => {
    const rankedServers = [...railServers].sort((a, b) => {
      const aCurrent = a.server.id === selectedServer?.server.id
      const bCurrent = b.server.id === selectedServer?.server.id
      if (aCurrent !== bCurrent) return aCurrent ? -1 : 1
      return a.server.name.localeCompare(b.server.name)
    })
    if (!searchKeyword) return rankedServers
    return rankedServers.filter((entry) =>
      [entry.server.name, entry.server.description]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(searchKeyword)),
    )
  }, [railServers, searchKeyword, selectedServer?.server.id])
  const commandCandidates = useMemo(() => {
    const utilityCandidates: CommandCandidate[] = selectedServerSlug
      ? [
          {
            id: 'utility-workspace',
            kind: 'utility',
            label: t('server.workspace'),
            meta: displayServerName ?? t('home.unifiedServerRail'),
            utility: 'workspace',
            icon: FolderOpen,
          },
          {
            id: 'utility-shop',
            kind: 'utility',
            label: t('server.shop'),
            meta: displayServerName ?? t('home.unifiedServerRail'),
            utility: 'shop',
            icon: ShoppingBag,
          },
        ]
      : []
    const inboxCandidates: CommandCandidate[] = rankedServerSearchData.flatMap(
      ({ server, inboxes: serverInboxes }) =>
        serverInboxes.map((entry) => {
          const label = entry.agent.user.displayName ?? entry.agent.user.username ?? entry.agent.id
          return {
            id: `inbox-${server.server.id}-${entry.agent.id}`,
            kind: 'inbox' as const,
            label,
            meta: server.server.name,
            inbox: entry,
            server,
          }
        }),
    )
    const channelCandidates: CommandCandidate[] = rankedServerSearchData.flatMap(
      ({ server, channels: serverChannels }) =>
        serverChannels.map((channel) => ({
          id: `channel-${server.server.id}-${channel.id}`,
          kind: 'channel' as const,
          label: channel.name,
          meta: server.server.name,
          channel,
          server,
        })),
    )
    const workspaceCandidates: CommandCandidate[] =
      selectedServer && searchKeyword.length >= 2
        ? commandWorkspaceNodes.map((node) => {
            const normalizedNode = normalizeWorkspaceNode(node)
            return {
              id: `workspace-${normalizedNode.id}`,
              kind: 'workspaceNode' as const,
              label: normalizedNode.name,
              meta: t('server.workspace'),
              node: normalizedNode,
            }
          })
        : []
    const allCandidates: CommandCandidate[] = [
      ...serverApps.map((app) => ({
        id: `app-${app.id}`,
        kind: 'app' as const,
        label: app.name,
        meta: displayServerName ?? t('home.unifiedServerRail'),
        app,
      })),
      ...inboxCandidates,
      ...workspaceCandidates,
      ...matchedServers.map((server) => ({
        id: `server-${server.server.id}`,
        kind: 'server' as const,
        label: server.server.name,
        meta: t('home.unifiedServerRail'),
        server,
      })),
      ...channelCandidates,
      ...utilityCandidates,
    ]

    if (!searchKeyword) return allCandidates.slice(0, 12)
    return allCandidates
      .filter((candidate) =>
        [candidate.label, candidate.meta].some((value) =>
          value.toLowerCase().includes(searchKeyword),
        ),
      )
      .slice(0, 16)
  }, [
    displayServerName,
    matchedServers,
    rankedServerSearchData,
    searchKeyword,
    selectedServerSlug,
    selectedServer,
    serverApps,
    t,
    commandWorkspaceNodes,
  ])

  const channelGroups = useMemo(
    () =>
      [
        {
          key: 'announcement',
          title: t('channel.announcement'),
          data: channels.filter((channel) => channel.type === 'announcement'),
        },
        {
          key: 'text',
          title: t('channel.text'),
          data: channels.filter((channel) => channel.type === 'text'),
        },
        {
          key: 'voice',
          title: t('channel.voice'),
          data: channels.filter((channel) => channel.type === 'voice'),
        },
      ].filter((group) => group.data.length > 0),
    [channels, t],
  )

  return {
    channels,
    sortedServerMembers,
    directMessages,
    sortedWorkspaceNodes,
    commandCandidates,
    channelGroups,
  }
}
