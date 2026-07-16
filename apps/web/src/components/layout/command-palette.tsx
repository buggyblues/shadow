import { cn } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { AppWindow, Hash, Home, Loader2, Search, ShoppingBag, Volume2 } from 'lucide-react'
import {
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import type { OsCommandDetail } from '../../pages/os-experiment/types'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'
import { UserAvatar } from '../common/avatar'

interface ServerEntry {
  server: {
    id: string
    name: string
    slug: string | null
    iconUrl: string | null
    ownerId: string
    isPublic?: boolean
  }
  member: { role: string }
}

interface DirectChannelEntry {
  id: string
  lastMessageAt: string | null
  createdAt: string
  otherUser: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status: string
    isBot: boolean
  } | null
}

interface ChannelEntry {
  id: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  topic: string | null
  isArchived?: boolean
}

interface PaletteChannel extends ChannelEntry {
  server: ServerEntry['server']
}

type PalettePrefix = '#' | '@' | '!' | '*' | '/' | null
type PaletteGroupId = 'actions' | 'channels' | 'dms' | 'servers'

interface PaletteEntry {
  id: string
  group: PaletteGroupId
  icon?: ComponentType<{ size?: number; className?: string }>
  user?: DirectChannelEntry['otherUser']
  label: string
  detail?: string
  shortcut?: string
  muted?: boolean
  run: () => void
}

const CHANNEL_SERVER_LIMIT = 24
const GROUP_LIMIT = 12

function isApplePlatform() {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/u.test(navigator.platform)
}

function normalize(value: string | null | undefined) {
  return (value ?? '').trim().toLocaleLowerCase()
}

function parsePaletteSearch(rawValue: string): { prefix: PalettePrefix; keyword: string } {
  const value = rawValue.trim()
  const maybePrefix = value[0] as PalettePrefix
  if (maybePrefix && ['#', '@', '!', '*', '/'].includes(maybePrefix)) {
    return { prefix: maybePrefix, keyword: value.slice(1).trim() }
  }
  return { prefix: null, keyword: value }
}

function matchesKeyword(keyword: string, values: Array<string | null | undefined>) {
  const query = normalize(keyword)
  if (!query) return true
  return values.some((value) => normalize(value).includes(query))
}

function serverRouteKey(server: ServerEntry['server']) {
  return server.slug ?? server.id
}

export function CommandPalette() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const isOsRoute = /^(?:\/app)?\/(?:os|space|spaces)(?:\/|$)/u.test(location.pathname)
  const activeServerId = useChatStore((state) => state.activeServerId)
  const activeChannelId = useChatStore((state) => state.activeChannelId)
  const setActiveServer = useChatStore((state) => state.setActiveServer)
  const setMobileView = useUIStore((state) => state.setMobileView)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    const openPalette = () => setOpen(true)
    window.addEventListener('shadow:open-command-palette', openPalette)
    return () => window.removeEventListener('shadow:open-command-palette', openPalette)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [])

  useEffect(() => {
    if (!open) {
      setSearchValue('')
      setSelectedIndex(0)
      return
    }
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (previous) => previous,
  })

  const { data: directChannels = [], isLoading: directChannelsLoading } = useQuery({
    queryKey: ['direct-channels'],
    queryFn: () => fetchApi<DirectChannelEntry[]>('/api/channels/dm'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (previous) => previous,
  })

  const channelServers = useMemo(() => {
    return [...servers]
      .sort((a, b) => {
        if (a.server.id === activeServerId) return -1
        if (b.server.id === activeServerId) return 1
        return a.server.name.localeCompare(b.server.name)
      })
      .slice(0, CHANNEL_SERVER_LIMIT)
  }, [activeServerId, servers])
  const channelServerKey = channelServers.map((entry) => entry.server.id).join('|')

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ['command-palette-channels', channelServerKey],
    queryFn: async () => {
      const results = await Promise.allSettled(
        channelServers.map((entry) =>
          fetchApi<ChannelEntry[]>(`/api/servers/${serverRouteKey(entry.server)}/channels`),
        ),
      )
      return results.flatMap((result, index) => {
        if (result.status !== 'fulfilled') return []
        const server = channelServers[index]?.server
        if (!server) return []
        return result.value.map((channel) => ({ ...channel, server }))
      })
    },
    enabled: open && channelServers.length > 0,
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
    placeholderData: (previous) => previous,
  })

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [activeChannelId, channels],
  )
  const activeServer =
    servers.find((entry) => entry.server.id === activeServerId)?.server ??
    activeChannel?.server ??
    null

  const runAndClose = useCallback((run: () => void) => {
    run()
    setOpen(false)
  }, [])

  const dispatchOsCommand = useCallback((detail: OsCommandDetail) => {
    window.dispatchEvent(new CustomEvent<OsCommandDetail>('shadow:os-command', { detail }))
  }, [])

  const openServer = useCallback(
    (server: ServerEntry['server']) => {
      setActiveServer(server.id)
      if (isOsRoute) {
        dispatchOsCommand({
          action: 'open-server',
          serverId: server.id,
          serverSlug: serverRouteKey(server),
        })
        return
      }
      setMobileView('channels')
      navigate({ to: '/servers/$serverSlug', params: { serverSlug: serverRouteKey(server) } })
    },
    [dispatchOsCommand, isOsRoute, navigate, setActiveServer, setMobileView],
  )

  const openChannel = useCallback(
    (channel: PaletteChannel) => {
      setActiveServer(channel.server.id)
      if (isOsRoute) {
        dispatchOsCommand({
          action: 'open-channel',
          serverId: channel.server.id,
          serverSlug: serverRouteKey(channel.server),
          channelId: channel.id,
        })
        return
      }
      setMobileView('chat')
      navigate({
        to: '/servers/$serverSlug/channels/$channelId',
        params: { serverSlug: serverRouteKey(channel.server), channelId: channel.id },
      })
    },
    [dispatchOsCommand, isOsRoute, navigate, setActiveServer, setMobileView],
  )

  const openDirectChannel = useCallback(
    (channel: DirectChannelEntry) => {
      if (isOsRoute && activeServer) {
        dispatchOsCommand({
          action: 'open-direct-message',
          serverId: activeServer.id,
          serverSlug: serverRouteKey(activeServer),
          channelId: channel.id,
          peerUserId: channel.otherUser?.id,
          title: channel.otherUser?.displayName ?? channel.otherUser?.username,
          iconUrl: channel.otherUser?.avatarUrl,
        })
        return
      }
      setActiveServer(null)
      setMobileView('chat')
      navigate({ to: '/dm/$dmChannelId', params: { dmChannelId: channel.id } })
    },
    [activeServer, dispatchOsCommand, isOsRoute, navigate, setActiveServer, setMobileView],
  )

  const { prefix, keyword } = parsePaletteSearch(searchValue)
  const canShowActions = prefix === null || prefix === '/'
  const canShowServers = prefix === null || prefix === '*'
  const canShowChannels = prefix === null || prefix === '#' || prefix === '!'
  const canShowDirect = prefix === null || prefix === '@'

  const visibleChannels = useMemo(() => {
    if (!canShowChannels) return []
    return channels
      .filter((channel) => {
        if (prefix === '!' && channel.type !== 'voice') return false
        if (prefix === '#' && channel.type === 'voice') return false
        return matchesKeyword(keyword, [
          channel.name,
          channel.topic,
          channel.server.name,
          channel.server.slug,
        ])
      })
      .sort((a, b) => {
        const aActiveServer = a.server.id === activeServerId ? 1 : 0
        const bActiveServer = b.server.id === activeServerId ? 1 : 0
        if (aActiveServer !== bActiveServer) return bActiveServer - aActiveServer
        return a.name.localeCompare(b.name)
      })
      .slice(0, GROUP_LIMIT)
  }, [activeServerId, canShowChannels, channels, keyword, prefix])

  const groups = useMemo(() => {
    const next: Array<{ id: PaletteGroupId; label: string; items: PaletteEntry[] }> = []

    if (canShowActions) {
      const actions: PaletteEntry[] = []
      if (activeChannelId) {
        actions.push({
          id: 'search-current-channel',
          group: 'actions',
          icon: Search,
          label: t('commandPalette.searchMessages'),
          detail: activeChannel?.name,
          shortcut: isApplePlatform() ? '⌘F' : 'Ctrl F',
          run: () => window.dispatchEvent(new Event('shadow:open-chat-search')),
        })
      }
      if (activeServer) {
        actions.push(
          {
            id: 'open-current-server',
            group: 'actions',
            icon: Home,
            label: t('commandPalette.openServerHome'),
            detail: activeServer.name,
            run: () => openServer(activeServer),
          },
          {
            id: 'open-space-apps',
            group: 'actions',
            icon: AppWindow,
            label: t('commandPalette.openApps'),
            detail: activeServer.name,
            run: () => {
              setActiveServer(activeServer.id)
              if (isOsRoute) {
                dispatchOsCommand({
                  action: 'open-builtin',
                  serverId: activeServer.id,
                  serverSlug: serverRouteKey(activeServer),
                  builtinKey: 'app-store',
                })
                return
              }
              navigate({
                to: '/servers/$serverSlug/space-apps',
                params: { serverSlug: serverRouteKey(activeServer) },
              })
            },
          },
          {
            id: 'open-server-shop',
            group: 'actions',
            icon: ShoppingBag,
            label: t('commandPalette.openShop'),
            detail: activeServer.name,
            run: () => {
              setActiveServer(activeServer.id)
              if (isOsRoute) {
                dispatchOsCommand({
                  action: 'open-builtin',
                  serverId: activeServer.id,
                  serverSlug: serverRouteKey(activeServer),
                  builtinKey: 'shop',
                })
                return
              }
              navigate({
                to: '/servers/$serverSlug/shop',
                params: { serverSlug: serverRouteKey(activeServer) },
              })
            },
          },
        )
      }
      const filteredActions = actions.filter((item) =>
        matchesKeyword(keyword, [item.label, item.detail]),
      )
      if (filteredActions.length > 0) {
        next.push({
          id: 'actions',
          label: t('commandPalette.groupActions'),
          items: filteredActions.slice(0, GROUP_LIMIT),
        })
      }
    }

    if (visibleChannels.length > 0) {
      next.push({
        id: 'channels',
        label: t('commandPalette.groupChannels'),
        items: visibleChannels.map((channel) => ({
          id: `channel:${channel.id}`,
          group: 'channels',
          icon: channel.type === 'voice' ? Volume2 : Hash,
          label: channel.name,
          detail: channel.server.name,
          muted: channel.isArchived,
          run: () => openChannel(channel),
        })),
      })
    }

    if (canShowDirect) {
      const dms = directChannels
        .filter((channel) => {
          const peer = channel.otherUser
          if (!peer) return false
          return matchesKeyword(keyword, [peer.displayName, peer.username])
        })
        .slice(0, GROUP_LIMIT)
        .map<PaletteEntry>((channel) => {
          const peer = channel.otherUser
          const label = peer?.displayName ?? peer?.username ?? t('common.unknownUser')
          return {
            id: `dm:${channel.id}`,
            group: 'dms',
            user: peer,
            label,
            detail: peer?.username ? `@${peer.username}` : undefined,
            run: () => openDirectChannel(channel),
          }
        })
      if (dms.length > 0) {
        next.push({ id: 'dms', label: t('commandPalette.groupDms'), items: dms })
      }
    }

    if (canShowServers) {
      const serverItems = servers
        .filter((entry) =>
          matchesKeyword(keyword, [entry.server.name, entry.server.slug, entry.server.id]),
        )
        .slice(0, GROUP_LIMIT)
        .map<PaletteEntry>((entry) => ({
          id: `server:${entry.server.id}`,
          group: 'servers',
          icon: Home,
          label: entry.server.name,
          detail: entry.server.slug ? `/${entry.server.slug}` : undefined,
          run: () => openServer(entry.server),
        }))
      if (serverItems.length > 0) {
        next.push({ id: 'servers', label: t('commandPalette.groupServers'), items: serverItems })
      }
    }

    return next
  }, [
    activeChannel?.name,
    activeChannelId,
    activeServer,
    canShowActions,
    canShowDirect,
    canShowServers,
    directChannels,
    dispatchOsCommand,
    isOsRoute,
    keyword,
    navigate,
    openChannel,
    openDirectChannel,
    openServer,
    servers,
    setActiveServer,
    t,
    visibleChannels,
  ])

  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const isLoading = serversLoading || directChannelsLoading || channelsLoading

  useEffect(() => {
    setSelectedIndex(0)
  }, [searchValue])

  useEffect(() => {
    setSelectedIndex((current) => {
      if (flatItems.length === 0) return 0
      return Math.min(current, flatItems.length - 1)
    })
  }, [flatItems.length])

  useEffect(() => {
    const item = flatItems[selectedIndex]
    if (!item) return
    document.getElementById(item.id)?.scrollIntoView({ block: 'nearest' })
  }, [flatItems, selectedIndex])

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((current) => (flatItems.length ? (current + 1) % flatItems.length : 0))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((current) =>
          flatItems.length ? (current - 1 + flatItems.length) % flatItems.length : 0,
        )
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        setSelectedIndex((current) => {
          if (!flatItems.length) return 0
          return event.shiftKey
            ? (current - 1 + flatItems.length) % flatItems.length
            : (current + 1) % flatItems.length
        })
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const item = flatItems[selectedIndex]
        if (item) runAndClose(item.run)
      }
    },
    [flatItems, runAndClose, selectedIndex],
  )

  if (!open) return null

  let itemIndex = 0

  return (
    <div
      className="fixed inset-0 z-[2147483000] bg-bg-deep/70 backdrop-blur-md"
      onMouseDown={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.open')}
        className="fixed left-1/2 top-[10vh] flex max-h-[min(78vh,680px)] w-[min(92vw,560px)] -translate-x-1/2 flex-col overflow-hidden rounded-3xl border border-border-subtle bg-bg-secondary/95 shadow-[0_32px_120px_rgba(0,0,0,0.55)] backdrop-blur-3xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <label className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle px-4 text-text-muted focus-within:text-primary">
          <Search size={22} className="shrink-0" />
          <input
            ref={inputRef}
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('commandPalette.placeholder')}
            aria-activedescendant={flatItems[selectedIndex]?.id}
            aria-controls="shadow-command-palette-list"
            aria-autocomplete="list"
            role="combobox"
            aria-expanded="true"
            className="min-w-0 flex-1 bg-transparent text-[15px] font-black text-text-primary outline-none placeholder:text-text-muted/45"
          />
        </label>

        <div
          id="shadow-command-palette-list"
          role="listbox"
          className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar"
        >
          {isLoading && flatItems.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-text-muted">
              <Loader2 size={18} className="animate-spin text-primary" />
            </div>
          ) : flatItems.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm font-bold text-text-muted">
              {t('commandPalette.empty')}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="pb-1">
                <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted/60">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const currentIndex = itemIndex++
                    return (
                      <PaletteRow
                        key={item.id}
                        item={item}
                        selected={currentIndex === selectedIndex}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                        onSelect={() => runAndClose(item.run)}
                      />
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function PaletteRow({
  item,
  selected,
  onMouseEnter,
  onSelect,
}: {
  item: PaletteEntry
  selected: boolean
  onMouseEnter: () => void
  onSelect: () => void
}) {
  const Icon = item.icon
  const avatarName = item.user?.displayName ?? item.user?.username ?? item.label

  return (
    <button
      id={item.id}
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onMouseEnter={onMouseEnter}
      onClick={onSelect}
      className={cn(
        'flex h-12 w-full items-center gap-3 rounded-xl px-2.5 text-left transition',
        selected
          ? 'bg-primary text-bg-primary shadow-[0_0_24px_rgba(0,229,255,0.18)]'
          : 'text-text-primary hover:bg-bg-tertiary/70',
        item.muted && 'opacity-65',
      )}
    >
      {item.user ? (
        <UserAvatar
          userId={item.user.id}
          avatarUrl={item.user.avatarUrl}
          displayName={avatarName}
          size="xs"
        />
      ) : (
        <span
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-lg border',
            selected
              ? 'border-bg-primary/20 bg-bg-primary/12 text-bg-primary'
              : 'border-border-subtle bg-bg-tertiary/70 text-text-muted',
          )}
        >
          {Icon && <Icon size={17} className="text-current" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-black', item.muted && 'italic')}>
          {item.label}
        </span>
        {item.detail && (
          <span
            className={cn(
              'block truncate text-xs font-semibold',
              selected ? 'text-bg-primary/70' : 'text-text-muted',
            )}
          >
            {item.detail}
          </span>
        )}
      </span>
      {item.shortcut && (
        <span
          className={cn(
            'shrink-0 text-[10px] font-black uppercase tracking-widest',
            selected ? 'text-bg-primary/65' : 'text-text-muted/45',
          )}
        >
          {item.shortcut}
        </span>
      )}
    </button>
  )
}
