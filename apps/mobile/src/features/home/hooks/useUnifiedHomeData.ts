import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useSocketEvent } from '../../../hooks/use-socket'
import { fetchApi } from '../../../lib/api'
import type {
  BuddyInboxEntry,
  DirectChannelEntry,
  GlobalSearchServerData,
  ScopedUnread,
  ServerAppIntegration,
  ServerDetail,
  ServerEntry,
  UnifiedChannel,
  UnifiedServerMember,
  UnifiedWorkspaceNode,
} from '../types'

export function useUnifiedHomeData({
  selectedServerId,
  workspaceFolderStack,
  searchQuery,
  language,
}: {
  selectedServerId: string | null
  workspaceFolderStack: UnifiedWorkspaceNode[]
  searchQuery: string
  language: string
}) {
  const queryClient = useQueryClient()
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const { data: scopedUnread } = useQuery<ScopedUnread>({
    queryKey: ['notification-scoped-unread'],
    queryFn: () => fetchApi<ScopedUnread>('/api/notifications/scoped-unread'),
  })

  const { data: directChannels = [] } = useQuery<DirectChannelEntry[]>({
    queryKey: ['direct-channels'],
    queryFn: () => fetchApi<DirectChannelEntry[]>('/api/channels/dm'),
  })

  const joinedServers = useMemo(
    () => servers.filter((entry) => entry.member.role !== '_public'),
    [servers],
  )
  const railServers = joinedServers
  const selectedServer = useMemo(
    () => joinedServers.find((entry) => entry.server.id === selectedServerId) ?? joinedServers[0],
    [joinedServers, selectedServerId],
  )
  const joinedServerIdsKey = useMemo(
    () => joinedServers.map((entry) => entry.server.id).join('|'),
    [joinedServers],
  )
  const selectedServerSlug = selectedServer?.server.slug ?? selectedServer?.server.id
  const currentWorkspaceFolder = workspaceFolderStack[workspaceFolderStack.length - 1]

  useSocketEvent('space-app:list-changed', () => {
    queryClient.invalidateQueries({ queryKey: ['home-unified-server-apps'] })
  })

  const { data: selectedServerDetail } = useQuery<ServerDetail>({
    queryKey: ['home-unified-server', selectedServerSlug],
    queryFn: () => fetchApi<ServerDetail>(`/api/servers/${selectedServerSlug}`),
    enabled: Boolean(selectedServerSlug && selectedServer?.member.role !== '_public'),
  })
  const displayServer =
    selectedServerDetail && selectedServer
      ? {
          ...selectedServer.server,
          ...selectedServerDetail,
          bannerUrl: selectedServerDetail.bannerUrl ?? selectedServer.server.bannerUrl,
          iconUrl: selectedServerDetail.iconUrl ?? selectedServer.server.iconUrl,
        }
      : (selectedServerDetail ?? selectedServer?.server)

  const { data: rawChannels = [], isLoading: isChannelsLoading } = useQuery<UnifiedChannel[]>({
    queryKey: ['home-unified-channels', selectedServer?.server.id],
    queryFn: () => fetchApi<UnifiedChannel[]>(`/api/servers/${selectedServer!.server.id}/channels`),
    enabled: Boolean(selectedServer?.server.id && selectedServer?.member.role !== '_public'),
  })

  const { data: serverApps = [], isLoading: isServerAppsLoading } = useQuery<
    ServerAppIntegration[]
  >({
    queryKey: ['home-unified-server-apps', selectedServerSlug, language],
    queryFn: () =>
      fetchApi<ServerAppIntegration[]>(`/api/servers/${selectedServerSlug}/space-apps`),
    enabled: Boolean(selectedServerSlug && selectedServer?.member.role !== '_public'),
  })

  const {
    data: inboxes = [],
    isLoading: isInboxesLoading,
    refetch: refetchInboxes,
  } = useQuery<BuddyInboxEntry[]>({
    queryKey: ['home-unified-server-inboxes', selectedServer?.server.id],
    queryFn: () => fetchApi<BuddyInboxEntry[]>(`/api/servers/${selectedServer!.server.id}/inboxes`),
    enabled: Boolean(selectedServer?.server.id && selectedServer?.member.role !== '_public'),
  })

  const { data: globalSearchServers = [] } = useQuery<GlobalSearchServerData[]>({
    queryKey: ['home-unified-global-search-data', joinedServerIdsKey],
    queryFn: async () =>
      Promise.all(
        joinedServers.map(async (entry) => {
          if (entry.member.role === '_public') {
            return { server: entry, channels: [], inboxes: [] }
          }

          const [channelsResult, inboxesResult] = await Promise.allSettled([
            fetchApi<UnifiedChannel[]>(`/api/servers/${entry.server.id}/channels`),
            fetchApi<BuddyInboxEntry[]>(`/api/servers/${entry.server.id}/inboxes`),
          ])

          return {
            server: entry,
            channels: channelsResult.status === 'fulfilled' ? channelsResult.value : [],
            inboxes: inboxesResult.status === 'fulfilled' ? inboxesResult.value : [],
          }
        }),
      ),
    enabled: joinedServers.length > 0,
    staleTime: 30_000,
  })

  const { data: serverMembers = [] } = useQuery<UnifiedServerMember[]>({
    queryKey: ['home-unified-members', selectedServerSlug],
    queryFn: () => fetchApi<UnifiedServerMember[]>(`/api/servers/${selectedServerSlug}/members`),
    enabled: Boolean(selectedServerSlug && selectedServer?.member.role !== '_public'),
  })

  const { data: workspaceNodes = [] } = useQuery<UnifiedWorkspaceNode[]>({
    queryKey: [
      'home-unified-workspace-nodes',
      selectedServer?.server.id,
      currentWorkspaceFolder?.id,
    ],
    queryFn: () =>
      fetchApi<UnifiedWorkspaceNode[]>(
        `/api/servers/${selectedServer!.server.id}/workspace/children${
          currentWorkspaceFolder?.id ? `?parentId=${currentWorkspaceFolder.id}` : ''
        }`,
      ),
    enabled: Boolean(selectedServer?.server.id && selectedServer?.member.role !== '_public'),
  })

  const { data: commandWorkspaceNodes = [] } = useQuery<UnifiedWorkspaceNode[]>({
    queryKey: ['home-unified-workspace-search', selectedServer?.server.id, searchQuery.trim()],
    queryFn: () =>
      fetchApi<UnifiedWorkspaceNode[]>(
        `/api/servers/${selectedServer!.server.id}/workspace/files/search?keyword=${encodeURIComponent(
          searchQuery.trim(),
        )}`,
      ),
    enabled: Boolean(
      selectedServer?.server.id &&
        selectedServer?.member.role !== '_public' &&
        searchQuery.trim().length >= 2,
    ),
  })

  return {
    servers,
    isLoading,
    scopedUnread,
    directChannels,
    joinedServers,
    railServers,
    selectedServer,
    selectedServerSlug,
    currentWorkspaceFolder,
    displayServer,
    rawChannels,
    isChannelsLoading,
    serverApps,
    isServerAppsLoading,
    inboxes,
    isInboxesLoading,
    refetchInboxes,
    globalSearchServers,
    serverMembers,
    workspaceNodes,
    commandWorkspaceNodes,
  }
}
