import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useReducedMotion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  Globe,
  Loader2,
  Lock,
  LogOut,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Settings,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '../../components/chat/message-bubble/types'
import { PresenceAvatar } from '../../components/common/presence-avatar'
import { MemberList } from '../../components/member/member-list'
import { NotificationBell } from '../../components/notification/notification-bell'
import { ServerIcon } from '../../components/server/server-icon'
import { fetchApi } from '../../lib/api'
import type { AuthenticatedUser } from '../../lib/auth-session'
import { showToast } from '../../lib/toast'
import { useUIStore } from '../../stores/ui.store'
import { ChannelView } from '../channel-view'
import {
  CHANNEL_CREATE_TYPES,
  type ChannelCreateType,
  ChannelTypeIcon,
  OsChannelTabHoverCard,
  OsInboxHoverCard,
} from './channel-ui'
import { OsHtmlWallpaperFrame } from './html-wallpaper-frame'
import type { BuddyInboxEntry, ChannelMeta, OsChannelTab, ScopedUnread, ServerEntry } from './types'
import { buddyDisplayName, OS_GC_MS, OS_STALE_MS, OS_TOP_BAR_HEIGHT } from './utils'

const MOVEMENT_RANGE = 24
const MOVEMENT_EASING = 0.08
const BACKGROUND_SCALE = 1.03
const BUBBLE_EDGE_PADDING = 12
const BUBBLE_ARROW_CENTER_PADDING = 22
const OS_FLOATING_BUBBLE_INTERACTIVE_SELECTOR = [
  '[data-os-floating-bubble-root="true"]',
  '[data-os-floating-bubble-trigger="true"]',
  '[data-os-floating-bubble-portal="true"]',
  '[role="dialog"][aria-modal="true"]',
].join(',')

type BubblePosition = {
  arrowCenterX: number
  left: number
  top: number
  width: number
}

type OsJoinServerMode = 'public' | 'invite'

interface OsPublicServer {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  inviteCode: string
  memberCount?: number
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function resolveBubblePosition(
  anchor: DOMRect | undefined,
  requestedWidth: number,
  fallbackCenterX: number,
): BubblePosition | null {
  if (typeof window === 'undefined') return null

  const width = Math.min(requestedWidth, window.innerWidth - BUBBLE_EDGE_PADDING * 2)
  const triggerCenterX = anchor
    ? anchor.left + anchor.width / 2
    : clampNumber(fallbackCenterX, BUBBLE_EDGE_PADDING, window.innerWidth - BUBBLE_EDGE_PADDING)
  const left = clampNumber(
    triggerCenterX - width / 2,
    BUBBLE_EDGE_PADDING,
    window.innerWidth - width - BUBBLE_EDGE_PADDING,
  )
  const arrowCenterX = clampNumber(
    triggerCenterX - left,
    BUBBLE_ARROW_CENTER_PADDING,
    width - BUBBLE_ARROW_CENTER_PADDING,
  )

  return {
    arrowCenterX,
    left,
    top: (anchor?.bottom ?? OS_TOP_BAR_HEIGHT) + 12,
    width,
  }
}

function BubbleArrow({ centerX }: { centerX: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -top-2 h-4 w-4 -translate-x-1/2 rotate-45 rounded-[3px] border-l border-t border-white/14 bg-bg-primary/96 shadow-[-3px_-3px_10px_rgba(0,0,0,0.12)]"
      style={{ left: centerX }}
    />
  )
}

function channelDisplayName(title: string) {
  return title.replace(/^#+/u, '')
}

export function OsAvatarMenu({
  user,
  onExit,
  onOpenProfile,
  onOpenSettings,
  isFullscreen,
  onToggleFullscreen,
  floatingLayerZIndex = 2_147_482_000,
}: {
  user: AuthenticatedUser | null | undefined
  onExit: () => void
  onOpenProfile?: () => void
  onOpenSettings?: () => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  floatingLayerZIndex?: number
}) {
  const { t } = useTranslation()
  const displayName = user?.displayName || user?.username || t('common.unknownUser')

  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          title={t('settings.avatarMenuLabel')}
          aria-label={t('settings.avatarMenuLabel')}
          className="mr-2.5 grid h-8 w-8 shrink-0 place-items-center rounded-full p-0 text-white transition hover:bg-white/8 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          <PresenceAvatar
            userId={user?.id}
            avatarUrl={user?.avatarUrl}
            displayName={displayName}
            status={user?.status}
            size="sm"
            className="shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
            loading="eager"
          />
        </button>
      }
    >
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        style={{ zIndex: floatingLayerZIndex }}
        className="z-[820] w-64 select-none border-white/12 bg-bg-secondary p-2 text-text-primary shadow-[0_22px_70px_rgba(0,0,0,0.42)]"
      >
        <div className="flex items-center gap-3 rounded-2xl p-3">
          <PresenceAvatar
            userId={user?.id}
            avatarUrl={user?.avatarUrl}
            displayName={displayName}
            status={user?.status}
            size="lg"
            loading="eager"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-text-primary">{displayName}</p>
            {user?.username ? (
              <p className="truncate text-xs font-bold text-text-muted">@{user.username}</p>
            ) : null}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!user?.id || !onOpenProfile}
          className="gap-3 normal-case tracking-normal"
          onSelect={() => {
            if (!user?.id) return
            onOpenProfile?.()
          }}
        >
          <User size={16} />
          <span className="min-w-0 flex-1 truncate">{t('settings.menuViewProfile')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!onOpenSettings}
          className="gap-3 normal-case tracking-normal"
          onSelect={() => onOpenSettings?.()}
        >
          <Settings size={16} />
          <span className="min-w-0 flex-1 truncate">{t('settings.sectionSettings')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!onToggleFullscreen}
          className="gap-3 normal-case tracking-normal"
          onSelect={() => onToggleFullscreen?.()}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          <span className="min-w-0 flex-1 truncate">
            {t(isFullscreen ? 'common.exitFullscreen' : 'common.enterFullscreen')}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-3 normal-case tracking-normal" onSelect={onExit}>
          <LogOut size={16} />
          <span className="min-w-0 flex-1 truncate">{t('os.exit')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function OsServerSwitcher({
  selectedServer,
  servers,
  onSelectServer,
  floatingLayerZIndex,
}: {
  selectedServer: ServerEntry
  servers: ServerEntry[]
  onSelectServer: (serverId: string) => void
  floatingLayerZIndex: number
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [showAddActions, setShowAddActions] = useState(false)
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [showJoinServer, setShowJoinServer] = useState(false)
  const [joinMode, setJoinMode] = useState<OsJoinServerMode>('public')
  const [serverDraftName, setServerDraftName] = useState('')
  const [serverDraftPublic, setServerDraftPublic] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [publicServerFilter, setPublicServerFilter] = useState('')
  const [joiningPublicServerId, setJoiningPublicServerId] = useState<string | null>(null)
  const serverFilterInputRef = useRef<HTMLInputElement>(null)
  const createServerNameInputRef = useRef<HTMLInputElement>(null)
  const publicServerSearchInputRef = useRef<HTMLInputElement>(null)
  const joinCodeInputRef = useRef<HTMLInputElement>(null)
  const normalizedFilter = filter.trim().toLocaleLowerCase()
  const filteredServers = servers.filter((entry) => {
    if (!normalizedFilter) return true
    return entry.server.name.toLocaleLowerCase().includes(normalizedFilter)
  })
  const joinedServerIds = new Set(servers.map((entry) => entry.server.id))
  const normalizedPublicServerFilter = publicServerFilter.trim().toLocaleLowerCase()

  const { data: publicServers = [], isLoading: isPublicServersLoading } = useQuery({
    queryKey: ['os-public-servers'],
    queryFn: () => fetchApi<OsPublicServer[]>('/api/servers/discover?limit=60'),
    enabled: showJoinServer,
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const visiblePublicServers = publicServers
    .filter((server) => !joinedServerIds.has(server.id))
    .filter((server) => {
      if (!normalizedPublicServerFilter) return true
      return [server.name, server.description]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(normalizedPublicServerFilter))
    })

  useEffect(() => {
    if (open) return
    setFilter('')
    setShowAddActions(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      serverFilterInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!showCreateServer) return
    const frame = window.requestAnimationFrame(() => {
      createServerNameInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [showCreateServer])

  useEffect(() => {
    if (!showJoinServer) {
      setJoinMode('public')
      setPublicServerFilter('')
      setJoinCode('')
      setJoiningPublicServerId(null)
      return
    }
    const frame = window.requestAnimationFrame(() => {
      if (joinMode === 'public') {
        publicServerSearchInputRef.current?.focus({ preventScroll: true })
        return
      }
      joinCodeInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [joinMode, showJoinServer])

  const createServer = useMutation({
    mutationFn: ({ name, isPublic }: { name: string; isPublic: boolean }) =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name, isPublic }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowCreateServer(false)
      setServerDraftName('')
      setServerDraftPublic(true)
      onSelectServer(data.id)
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : t('common.error'), 'error')
    },
  })

  const joinServer = useMutation({
    mutationFn: (inviteCode: string) =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowJoinServer(false)
      setJoinCode('')
      setPublicServerFilter('')
      setJoinMode('public')
      setJoiningPublicServerId(null)
      onSelectServer(data.id)
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : t('common.error'), 'error')
    },
    onSettled: () => setJoiningPublicServerId(null),
  })

  const submitCreateServer = () => {
    const name = serverDraftName.trim()
    if (!name || createServer.isPending) return
    createServer.mutate({ name, isPublic: serverDraftPublic })
  }

  const submitJoinServer = () => {
    const code = joinCode.trim()
    if (code.length !== 8 || joinServer.isPending) return
    setJoiningPublicServerId(null)
    joinServer.mutate(code)
  }

  const submitJoinPublicServer = (server: OsPublicServer) => {
    if (!server.inviteCode || joinServer.isPending) return
    setJoiningPublicServerId(server.id)
    joinServer.mutate(server.inviteCode)
  }

  return (
    <>
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            aria-label={t('os.account')}
            title={selectedServer.server.name}
            className="flex h-8 min-w-0 max-w-[260px] items-center gap-1.5 rounded-xl bg-white/10 py-0 pl-0.5 pr-2 text-white transition hover:bg-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <ServerIcon
              iconUrl={selectedServer.server.iconUrl}
              name={selectedServer.server.name}
              size="xs"
              variant="plain"
              isPublic={selectedServer.server.isPublic}
            />
            <span className="min-w-0 flex-1 truncate text-left text-sm font-black">
              {selectedServer.server.name}
            </span>
            <ChevronDown size={15} className="shrink-0 text-white/66" />
          </button>
        }
      >
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          style={{ zIndex: floatingLayerZIndex }}
          className="z-[820] max-h-[min(70vh,560px)] w-80 select-none !overflow-x-hidden !overflow-y-auto overscroll-contain border-white/12 bg-bg-secondary p-2 text-text-primary shadow-[0_22px_70px_rgba(0,0,0,0.42)]"
        >
          <div
            className="flex items-center gap-2 px-1 pb-2"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                ref={serverFilterInputRef}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('common.search')}
                className="h-9 w-full rounded-xl border border-white/10 bg-black/22 pl-9 pr-3 text-sm font-bold text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary/45"
              />
            </div>
            <button
              type="button"
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-text-muted transition hover:bg-white/10 hover:text-text-primary',
                showAddActions && 'bg-white/10 text-primary',
              )}
              title={t('server.addMenuServer')}
              aria-label={t('server.addMenuServer')}
              onClick={() => setShowAddActions((current) => !current)}
            >
              <Plus size={16} />
            </button>
          </div>
          {showAddActions ? (
            <div className="mb-2 grid grid-cols-2 gap-1 px-1">
              <button
                type="button"
                className="flex h-9 min-w-0 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/12 px-2 text-xs font-black text-primary transition hover:bg-primary/18"
                onClick={() => {
                  setOpen(false)
                  setShowCreateServer(true)
                }}
              >
                <Plus size={14} />
                <span className="truncate">{t('server.createServer')}</span>
              </button>
              <button
                type="button"
                className="flex h-9 min-w-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/6 px-2 text-xs font-black text-text-secondary transition hover:bg-white/10 hover:text-text-primary"
                onClick={() => {
                  setOpen(false)
                  setShowJoinServer(true)
                  setJoinMode('public')
                }}
              >
                <UserPlus size={14} />
                <span className="truncate">{t('server.joinServer')}</span>
              </button>
            </div>
          ) : null}
          <DropdownMenuSeparator />
          {filteredServers.length > 0 ? (
            filteredServers.map((entry) => {
              const selected = entry.server.id === selectedServer.server.id
              return (
                <DropdownMenuItem
                  key={entry.server.id}
                  className="gap-3 normal-case tracking-normal"
                  onSelect={() => onSelectServer(entry.server.id)}
                >
                  <ServerIcon
                    iconUrl={entry.server.iconUrl}
                    name={entry.server.name}
                    size="sm"
                    variant="plain"
                    isPublic={entry.server.isPublic}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-black">
                    {entry.server.name}
                  </span>
                  {selected ? <Check size={16} className="shrink-0 text-primary" /> : null}
                </DropdownMenuItem>
              )
            })
          ) : (
            <p className="px-3 py-4 text-sm font-bold text-text-muted">
              {t('discover.noSearchResults')}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Modal open={showCreateServer} onClose={() => setShowCreateServer(false)}>
        <ModalContent maxWidth="max-w-sm">
          <ModalHeader
            overline={t('server.createServer')}
            icon={<Plus size={18} strokeWidth={2.6} />}
            title={t('server.createServer')}
            closeLabel={t('common.close')}
          />
          <ModalBody className="space-y-5 py-5">
            <Input
              ref={createServerNameInputRef}
              type="text"
              value={serverDraftName}
              onChange={(event) => setServerDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault()
                  submitCreateServer()
                }
              }}
              placeholder={t('server.serverName')}
              className="w-full rounded-2xl px-5 py-3.5 font-bold"
            />
            <label className="flex items-center justify-between rounded-2xl border border-border-subtle bg-bg-tertiary/50 p-4">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-bg-tertiary/50 shadow-inner">
                  {serverDraftPublic ? (
                    <Globe size={16} className="text-text-primary" />
                  ) : (
                    <Lock size={16} className="text-text-primary" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-text-primary">
                    {serverDraftPublic ? t('server.publicServer') : t('server.privateServer')}
                  </span>
                  <span className="block truncate text-xs font-bold text-text-muted/70">
                    {serverDraftPublic
                      ? t('server.publicServerDesc')
                      : t('server.privateServerDesc')}
                  </span>
                </span>
              </span>
              <Switch checked={serverDraftPublic} onCheckedChange={setServerDraftPublic} />
            </label>
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreateServer(false)}
                className="font-black uppercase tracking-widest"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={submitCreateServer}
                disabled={!serverDraftName.trim() || createServer.isPending}
                loading={createServer.isPending}
                className="font-black uppercase tracking-widest"
              >
                {t('common.create')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal open={showJoinServer} onClose={() => setShowJoinServer(false)}>
        <ModalContent maxWidth="max-w-lg">
          <ModalHeader
            overline={t('server.joinServer')}
            icon={<UserPlus size={18} strokeWidth={2.4} />}
            title={t('server.joinServer')}
            subtitle={t('server.joinServerPickerDesc')}
            closeLabel={t('common.close')}
          />
          <ModalBody className="space-y-4 py-5">
            <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border-subtle bg-bg-tertiary/45 p-1">
              {(['public', 'invite'] as OsJoinServerMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    'h-9 rounded-xl px-3 text-xs font-black transition',
                    joinMode === mode
                      ? 'bg-primary text-bg-primary shadow-[0_10px_24px_rgba(0,198,209,0.20)]'
                      : 'text-text-muted hover:bg-white/8 hover:text-text-primary',
                  )}
                  onClick={() => setJoinMode(mode)}
                >
                  {mode === 'public' ? t('server.publicServers') : t('server.privateInviteCode')}
                </button>
              ))}
            </div>

            {joinMode === 'public' ? (
              <div className="space-y-3">
                <label className="flex h-10 items-center gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/50 px-3 text-text-muted">
                  <Search size={15} className="shrink-0" />
                  <input
                    ref={publicServerSearchInputRef}
                    value={publicServerFilter}
                    onChange={(event) => setPublicServerFilter(event.target.value)}
                    placeholder={t('server.searchPublicServers')}
                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-text-primary outline-none placeholder:text-text-muted"
                  />
                </label>
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {isPublicServersLoading ? (
                    <div className="grid h-32 place-items-center text-text-muted">
                      <Loader2 size={18} className="animate-spin" />
                    </div>
                  ) : visiblePublicServers.length > 0 ? (
                    visiblePublicServers.map((server) => (
                      <div
                        key={server.id}
                        className="flex min-w-0 items-center gap-3 rounded-2xl border border-border-subtle bg-bg-tertiary/35 p-3 transition hover:border-primary/25 hover:bg-bg-tertiary/55"
                      >
                        <ServerIcon
                          iconUrl={server.iconUrl}
                          name={server.name}
                          size="sm"
                          variant="plain"
                          isPublic
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-text-primary">
                            {server.name}
                          </p>
                          <p className="truncate text-xs font-bold text-text-muted">
                            {server.description ||
                              t('server.memberCount', { count: server.memberCount ?? 0 })}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="primary"
                          size="xs"
                          disabled={joinServer.isPending}
                          loading={joiningPublicServerId === server.id && joinServer.isPending}
                          onClick={() => submitJoinPublicServer(server)}
                          className="shrink-0 rounded-full px-3"
                        >
                          {t('server.joinButton')}
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-border-subtle px-4 py-8 text-center text-sm font-bold text-text-muted">
                      {t('server.noPublicServers')}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <Input
                ref={joinCodeInputRef}
                type="text"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    event.keyCode !== 229
                  ) {
                    event.preventDefault()
                    submitJoinServer()
                  }
                }}
                placeholder={t('server.inviteCodePlaceholder')}
                maxLength={8}
                className="w-full rounded-2xl px-5 py-3.5 text-center font-mono text-lg tracking-widest"
              />
            )}
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowJoinServer(false)}
                className="font-black uppercase tracking-widest"
              >
                {t('common.cancel')}
              </Button>
              {joinMode === 'invite' ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={submitJoinServer}
                  disabled={joinCode.trim().length !== 8 || joinServer.isPending}
                  loading={joinServer.isPending}
                  className="font-black uppercase tracking-widest"
                >
                  {t('server.joinButton')}
                </Button>
              ) : null}
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

export function OsBackground({
  serverWallpaper,
}: {
  serverWallpaper?: {
    type: 'image' | 'html'
    url: string
    serverId?: string | null
    workspaceFileId?: string | null
    interactive?: boolean
  } | null
}) {
  const { t } = useTranslation()
  const { backgroundImage, enableBackgroundMovement } = useUIStore()
  const prefersReducedMotion = useReducedMotion()
  const layerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const currentRef = useRef({ x: 0, y: 0 })
  const targetRef = useRef({ x: 0, y: 0 })
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const wallpaper = serverWallpaper?.url
    ? serverWallpaper
    : backgroundImage
      ? ({ type: 'image', url: backgroundImage, interactive: false } as const)
      : null
  const shouldMove = Boolean(
    wallpaper?.url && !wallpaper.interactive && enableBackgroundMovement && !prefersReducedMotion,
  )
  const imageWallpaperUrl = wallpaper?.type === 'image' ? resolvedImageUrl : null

  useEffect(() => {
    if (!wallpaper || wallpaper.type !== 'image') {
      setResolvedImageUrl(null)
      setImageLoaded(false)
      return
    }

    let cancelled = false
    setResolvedImageUrl(null)
    setImageLoaded(false)

    if (serverWallpaper?.serverId && serverWallpaper.workspaceFileId) {
      fetchApi<{ url: string }>(
        `/api/servers/${serverWallpaper.serverId}/workspace/files/${serverWallpaper.workspaceFileId}/media-url?disposition=inline`,
      )
        .then((result) => {
          if (!cancelled) setResolvedImageUrl(result.url)
        })
        .catch(() => {
          if (!cancelled) setResolvedImageUrl(wallpaper.url)
        })
    } else {
      setResolvedImageUrl(wallpaper.url)
    }

    return () => {
      cancelled = true
    }
  }, [serverWallpaper?.serverId, serverWallpaper?.workspaceFileId, wallpaper?.type, wallpaper?.url])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const applyTransform = (x: number, y: number) => {
      layer.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${BACKGROUND_SCALE})`
    }

    const cancelAnimation = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }

    const resetPosition = () => {
      cancelAnimation()
      currentRef.current = { x: 0, y: 0 }
      targetRef.current = { x: 0, y: 0 }
      applyTransform(0, 0)
    }

    if (!shouldMove) {
      resetPosition()
      return
    }

    const tick = () => {
      const current = currentRef.current
      const target = targetRef.current
      const nextX = current.x + (target.x - current.x) * MOVEMENT_EASING
      const nextY = current.y + (target.y - current.y) * MOVEMENT_EASING

      currentRef.current = { x: nextX, y: nextY }
      applyTransform(nextX, nextY)

      if (Math.abs(target.x - nextX) < 0.1 && Math.abs(target.y - nextY) < 0.1) {
        frameRef.current = null
        return
      }

      frameRef.current = requestAnimationFrame(tick)
    }

    const handleMouseMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth - 0.5) * -MOVEMENT_RANGE * 2
      const y = (event.clientY / window.innerHeight - 0.5) * -MOVEMENT_RANGE * 2

      targetRef.current = { x, y }

      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      resetPosition()
    }
  }, [shouldMove, wallpaper?.url])

  return (
    <>
      {wallpaper ? (
        wallpaper.type === 'html' ? (
          shouldMove ? (
            <div
              ref={layerRef}
              aria-hidden="true"
              className="absolute inset-[-24px] will-change-transform"
              style={{
                transform: `translate3d(0, 0, 0) scale(${BACKGROUND_SCALE})`,
                backfaceVisibility: 'hidden',
              }}
            >
              <OsHtmlWallpaperFrame
                title={t('os.serverWallpaper')}
                src={wallpaper.url}
                className="absolute inset-0 h-full w-full border-0 bg-black pointer-events-none"
              />
            </div>
          ) : (
            <OsHtmlWallpaperFrame
              title={t('os.serverWallpaper')}
              src={wallpaper.url}
              contextMenuBridge={Boolean(wallpaper.interactive)}
              pointerBridge={Boolean(wallpaper.interactive)}
              className={cn(
                'absolute inset-0 h-full w-full border-0 bg-black',
                !wallpaper.interactive && 'pointer-events-none',
              )}
            />
          )
        ) : (
          <div
            ref={layerRef}
            aria-hidden="true"
            className="absolute inset-[-24px] overflow-hidden bg-[linear-gradient(135deg,#07111b_0%,#19303a_44%,#10221d_100%)] will-change-transform"
            style={{
              transform: `translate3d(0, 0, 0) scale(${BACKGROUND_SCALE})`,
              backfaceVisibility: 'hidden',
            }}
          >
            {imageWallpaperUrl ? (
              <img
                src={imageWallpaperUrl}
                alt=""
                aria-hidden="true"
                className={cn(
                  'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
                  imageLoaded ? 'opacity-100' : 'opacity-0',
                )}
                decoding="async"
                onLoad={() => setImageLoaded(true)}
                onError={() => {
                  if (imageWallpaperUrl !== wallpaper.url) {
                    setResolvedImageUrl(wallpaper.url)
                    return
                  }
                  setImageLoaded(false)
                }}
              />
            ) : null}
            {!imageLoaded ? (
              <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#07111b_0%,#19303a_44%,#10221d_100%)] text-white/48">
                <Loader2 size={22} className="animate-spin" />
              </div>
            ) : null}
          </div>
        )
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(135deg,#07111b_0%,#19303a_44%,#10221d_100%)]"
        />
      )}
      {!wallpaper ? (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(255,255,255,0.16),transparent_34%),radial-gradient(circle_at_86%_18%,rgba(0,198,209,0.12),transparent_30%)]" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.36))]" />
        </>
      ) : null}
    </>
  )
}

export function OsTopBar({
  selectedServer,
  selectedServerSlug,
  servers,
  channels,
  inboxes,
  channelTabs,
  channelBubbleRequest,
  inboxBubbleRequest,
  floatingLayerZIndex,
  scopedUnread,
  isInboxesLoading,
  isCreatingChannel,
  user,
  onExit,
  onSelectServer,
  onFocusWindow,
  onCloseWindow,
  onCreateChannel,
  onOpenChannelWindow,
  onOpenInbox,
  onPreviewFile,
  onOpenProfile,
  onOpenSettings,
  onReorderChannelTab,
}: {
  selectedServer: ServerEntry
  selectedServerSlug: string
  servers: ServerEntry[]
  channels: ChannelMeta[]
  inboxes: BuddyInboxEntry[]
  channelTabs: OsChannelTab[]
  channelBubbleRequest?: { channelId: string; nonce: number } | null
  inboxBubbleRequest?: { agentId?: string; channelId?: string; nonce: number } | null
  floatingLayerZIndex: number
  scopedUnread?: ScopedUnread
  isInboxesLoading: boolean
  isCreatingChannel?: boolean
  user: AuthenticatedUser | null | undefined
  onExit: () => void
  onSelectServer: (serverId: string) => void
  onFocusWindow: (id: string | null) => void
  onCloseWindow: (id: string) => void
  onCreateChannel: (input: { name: string; type: ChannelCreateType; isPrivate: boolean }) => void
  onOpenChannelWindow: (channel: ChannelMeta) => void
  onOpenInbox: (entry: BuddyInboxEntry) => Promise<ChannelMeta | null>
  onPreviewFile?: (attachment: Attachment) => void
  onOpenProfile: () => void
  onOpenSettings: () => void
  onReorderChannelTab: (sourceId: string, targetId: string) => void
}) {
  const { t } = useTranslation()
  const [channelFilter, setChannelFilter] = useState('')
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [channelDraftName, setChannelDraftName] = useState('')
  const [channelDraftType, setChannelDraftType] = useState<ChannelCreateType>('text')
  const [channelDraftPrivate, setChannelDraftPrivate] = useState(false)
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const channelPickerInputRef = useRef<HTMLInputElement>(null)
  const createChannelNameInputRef = useRef<HTMLInputElement>(null)
  const channelTabRefs = useRef(new Map<string, HTMLDivElement>())
  const inboxButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const [activeInbox, setActiveInbox] = useState<{
    anchor?: DOMRect
    entry?: BuddyInboxEntry
    channel: ChannelMeta
  } | null>(null)
  const [activeChannelBubble, setActiveChannelBubble] = useState<{
    anchor?: DOMRect
    tab: OsChannelTab
  } | null>(null)
  const [activeChannelMembersBubble, setActiveChannelMembersBubble] = useState<{
    anchor: DOMRect
    channelId: string
  } | null>(null)
  const [activeServerMembersBubble, setActiveServerMembersBubble] = useState<DOMRect | null>(null)
  const [isDocumentFullscreen, setIsDocumentFullscreen] = useState(false)
  const [activeChannelPicker, setActiveChannelPicker] = useState<{
    anchor: DOMRect
    nonce: number
  } | null>(null)
  const [loadingInboxId, setLoadingInboxId] = useState<string | null>(null)
  const [hoverPreviewKey, setHoverPreviewKey] = useState<string | null>(null)
  const handledChannelBubbleRequestNonceRef = useRef<number | null>(null)
  const handledInboxBubbleRequestNonceRef = useRef<number | null>(null)
  const floatingPreviewLayerZIndex = Math.max(0, floatingLayerZIndex - 10)
  const visibleInboxes = inboxes.slice(0, 5)
  const openChannelIds = new Set(channelTabs.map((tab) => tab.channelId))
  const normalizedChannelFilter = channelFilter.trim().toLocaleLowerCase()
  const remainingChannels = channels
    .filter((channel) => !openChannelIds.has(channel.id))
    .filter((channel) => {
      if (!normalizedChannelFilter) return true
      return channel.name.toLocaleLowerCase().includes(normalizedChannelFilter)
    })
    .slice(0, 18)
  useEffect(() => {
    setActiveInbox(null)
    setActiveChannelBubble(null)
    setActiveChannelMembersBubble(null)
    setActiveServerMembersBubble(null)
    setActiveChannelPicker(null)
    setShowCreateChannel(false)
    setChannelFilter('')
    onFocusWindow(null)
  }, [selectedServer.server.id])

  useEffect(() => {
    if (!activeChannelPicker) return
    const frame = window.requestAnimationFrame(() => {
      channelPickerInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeChannelPicker])

  useEffect(() => {
    if (!showCreateChannel) return
    const frame = window.requestAnimationFrame(() => {
      createChannelNameInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [showCreateChannel])

  const channelBubblePosition = (() => {
    if (!activeChannelBubble || typeof window === 'undefined') return null
    return resolveBubblePosition(
      activeChannelBubble.anchor,
      460,
      Math.min(280, window.innerWidth / 2),
    )
  })()

  const channelPickerPosition = (() => {
    if (!activeChannelPicker || typeof window === 'undefined') return null
    return resolveBubblePosition(
      activeChannelPicker.anchor,
      360,
      Math.min(300, window.innerWidth / 2),
    )
  })()

  const activeInboxPosition = (() => {
    if (!activeInbox || typeof window === 'undefined') return null
    return resolveBubblePosition(activeInbox.anchor, 460, window.innerWidth - 84)
  })()

  const activeChannelMembersPosition = (() => {
    if (!activeChannelMembersBubble || typeof window === 'undefined') return null
    return resolveBubblePosition(activeChannelMembersBubble.anchor, 360, window.innerWidth - 132)
  })()

  const activeServerMembersPosition = (() => {
    if (!activeServerMembersBubble || typeof window === 'undefined') return null
    return resolveBubblePosition(activeServerMembersBubble, 400, window.innerWidth - 160)
  })()

  const closeFloatingBubbles = useCallback(() => {
    setActiveInbox(null)
    setActiveChannelBubble(null)
    setActiveChannelMembersBubble(null)
    setActiveServerMembersBubble(null)
    setActiveChannelPicker(null)
    onFocusWindow(null)
  }, [onFocusWindow])

  const hasFloatingBubble = Boolean(
    activeInbox ||
      activeChannelBubble ||
      activeChannelMembersBubble ||
      activeServerMembersBubble ||
      activeChannelPicker,
  )

  useEffect(() => {
    if (!hasFloatingBubble || typeof document === 'undefined') return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(OS_FLOATING_BUBBLE_INTERACTIVE_SELECTOR)) return
      closeFloatingBubbles()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFloatingBubbles()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [closeFloatingBubbles, hasFloatingBubble])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const handleFullscreenChange = () =>
      setIsDocumentFullscreen(Boolean(document.fullscreenElement))
    handleFullscreenChange()
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleDocumentFullscreen = async () => {
    if (typeof document === 'undefined') return
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await document.documentElement.requestFullscreen()
  }

  const handleOpenInbox = async (entry: BuddyInboxEntry, anchor?: DOMRect) => {
    if (loadingInboxId) return
    setActiveChannelBubble(null)
    setActiveChannelMembersBubble(null)
    setActiveServerMembersBubble(null)
    setActiveChannelPicker(null)
    onFocusWindow(null)
    if (
      activeInbox?.entry?.agent.id === entry.agent.id ||
      (entry.channel && activeInbox?.channel.id === entry.channel.id)
    ) {
      setActiveInbox(null)
      return
    }
    setLoadingInboxId(entry.agent.id)
    try {
      const channel = await onOpenInbox(entry)
      if (channel) {
        setActiveInbox({ anchor, entry, channel })
      }
    } finally {
      setLoadingInboxId(null)
    }
  }

  useEffect(() => {
    if (!channelBubbleRequest) return
    if (handledChannelBubbleRequestNonceRef.current === channelBubbleRequest.nonce) return
    const tab = channelTabs.find(
      (candidate) => candidate.channelId === channelBubbleRequest.channelId,
    )
    if (!tab) return
    handledChannelBubbleRequestNonceRef.current = channelBubbleRequest.nonce
    setActiveInbox(null)
    setActiveChannelPicker(null)
    setActiveChannelMembersBubble(null)
    setActiveServerMembersBubble(null)
    onFocusWindow(tab.id)
    setActiveChannelBubble({
      anchor: channelTabRefs.current.get(tab.id)?.getBoundingClientRect(),
      tab,
    })
  }, [channelBubbleRequest, channelTabs])

  useEffect(() => {
    if (!inboxBubbleRequest) return
    if (handledInboxBubbleRequestNonceRef.current === inboxBubbleRequest.nonce) return
    const entry = inboxes.find(
      (candidate) =>
        candidate.agent.id === inboxBubbleRequest.agentId ||
        candidate.channel?.id === inboxBubbleRequest.channelId,
    )
    if (!entry) {
      if (!inboxBubbleRequest.channelId) return
      handledInboxBubbleRequestNonceRef.current = inboxBubbleRequest.nonce
      let cancelled = false
      void fetchApi<ChannelMeta>(`/api/channels/${inboxBubbleRequest.channelId}`)
        .then((channel) => {
          if (cancelled) return
          setActiveChannelBubble(null)
          setActiveChannelMembersBubble(null)
          setActiveServerMembersBubble(null)
          setActiveChannelPicker(null)
          onFocusWindow(null)
          setActiveInbox({ channel })
        })
        .catch(() => undefined)
      return () => {
        cancelled = true
      }
    }
    handledInboxBubbleRequestNonceRef.current = inboxBubbleRequest.nonce
    void handleOpenInbox(
      entry,
      inboxButtonRefs.current.get(entry.agent.id)?.getBoundingClientRect(),
    )
  }, [inboxBubbleRequest, inboxes])

  const toggleChannelBubble = (tab: OsChannelTab, anchor: DOMRect) => {
    setActiveInbox(null)
    setActiveChannelMembersBubble(null)
    setActiveServerMembersBubble(null)
    setActiveChannelPicker(null)
    if (activeChannelBubble?.tab.id === tab.id) {
      setActiveChannelBubble(null)
      onFocusWindow(null)
      return
    }
    onFocusWindow(tab.id)
    setActiveChannelBubble({ anchor, tab })
  }

  const submitCreateChannel = () => {
    const name = channelDraftName.trim()
    if (!name || isCreatingChannel) return
    onCreateChannel({ name, type: channelDraftType, isPrivate: channelDraftPrivate })
    setChannelDraftName('')
    setChannelDraftType('text')
    setChannelDraftPrivate(false)
    setShowCreateChannel(false)
  }

  return (
    <header className="absolute left-0 right-0 top-0 z-[600] flex h-10 select-none items-center gap-1.5 border-b border-white/12 bg-black/30 pl-5 pr-3 text-white shadow-[0_10px_28px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
      <OsAvatarMenu
        user={user}
        onExit={onExit}
        onOpenProfile={onOpenProfile}
        onOpenSettings={onOpenSettings}
        isFullscreen={isDocumentFullscreen}
        floatingLayerZIndex={floatingLayerZIndex}
        onToggleFullscreen={() => {
          void toggleDocumentFullscreen().catch(() => undefined)
        }}
      />
      <OsServerSwitcher
        selectedServer={selectedServer}
        servers={servers}
        floatingLayerZIndex={floatingLayerZIndex}
        onSelectServer={onSelectServer}
      />
      {channelTabs.length > 0 || channels.length > 0 ? (
        <div
          className="flex h-10 min-w-0 max-w-[52vw] items-center overflow-visible"
          role="tablist"
          aria-label={t('channel.channels')}
        >
          {channelTabs.slice(-6).map((tab) => {
            const unread = scopedUnread?.channelUnread?.[tab.channelId] ?? 0
            const displayTitle = channelDisplayName(tab.title)
            return (
              <div
                key={tab.id}
                ref={(node) => {
                  if (node) {
                    channelTabRefs.current.set(tab.id, node)
                  } else {
                    channelTabRefs.current.delete(tab.id)
                  }
                }}
                role="tab"
                tabIndex={0}
                aria-selected={tab.active}
                draggable
                className={cn(
                  'group/tab relative flex h-8 min-w-0 max-w-40 cursor-default select-none items-center gap-1.5 rounded-full border border-transparent py-0 pl-2.5 pr-2 text-left text-xs font-black transition',
                  tab.active
                    ? 'border-white/12 bg-white/14 pr-7 text-white shadow-[0_8px_22px_rgba(0,0,0,0.18)]'
                    : 'text-white/62 hover:bg-white/8 hover:text-white',
                  draggingTabId === tab.id && 'opacity-55',
                )}
                title={displayTitle}
                aria-label={displayTitle}
                data-os-floating-bubble-trigger="true"
                onPointerEnter={() => setHoverPreviewKey(`channel:${tab.id}`)}
                onPointerLeave={() => setHoverPreviewKey(null)}
                onFocus={() => setHoverPreviewKey(`channel:${tab.id}`)}
                onBlur={() => setHoverPreviewKey(null)}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => {
                  if (event.button === 1) event.preventDefault()
                }}
                onAuxClick={(event) => {
                  if (event.button !== 1) return
                  event.preventDefault()
                  event.stopPropagation()
                  onCloseWindow(tab.id)
                  if (activeChannelBubble?.tab.id === tab.id) {
                    setActiveChannelBubble(null)
                    setActiveChannelMembersBubble(null)
                    onFocusWindow(null)
                  }
                }}
                onDragStart={(event) => {
                  setDraggingTabId(tab.id)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', tab.id)
                }}
                onDragEnd={() => setDraggingTabId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const sourceId = event.dataTransfer.getData('text/plain') || draggingTabId
                  setDraggingTabId(null)
                  if (!sourceId || sourceId === tab.id) return
                  onReorderChannelTab(sourceId, tab.id)
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  const anchor = event.currentTarget.getBoundingClientRect()
                  toggleChannelBubble(tab, anchor)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  const anchor = event.currentTarget.getBoundingClientRect()
                  toggleChannelBubble(tab, anchor)
                }}
              >
                <span className="shrink-0 text-white/62 group-hover/tab:text-white/82">
                  <ChannelTypeIcon type={tab.type} size={14} />
                </span>
                {unread > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-black/45" />
                ) : null}
                <span className="block min-w-0 flex-1 truncate">{displayTitle}</span>
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    'absolute right-1.5 top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded-full text-white/50 transition hover:bg-white/14 hover:text-white',
                    tab.active
                      ? 'pointer-events-auto opacity-100'
                      : 'pointer-events-none opacity-0 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100',
                  )}
                  aria-label={t('os.closeWindow')}
                  onClick={(event) => {
                    event.stopPropagation()
                    onCloseWindow(tab.id)
                    if (activeChannelBubble?.tab.id === tab.id) {
                      setActiveChannelBubble(null)
                      setActiveChannelMembersBubble(null)
                      onFocusWindow(null)
                    }
                  }}
                >
                  <X size={11} />
                </button>
                {!activeChannelBubble && hoverPreviewKey === `channel:${tab.id}` ? (
                  <div
                    className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-[810] -translate-x-1/2 opacity-0 transition duration-150 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100"
                    style={{ zIndex: floatingPreviewLayerZIndex }}
                  >
                    <OsChannelTabHoverCard
                      channel={{
                        id: tab.channelId,
                        name: displayTitle,
                        type: tab.type,
                        topic: tab.topic,
                      }}
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
          <button
            type="button"
            className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/64 transition hover:bg-white/10 hover:text-white"
            title={t('channel.switchChannel')}
            aria-label={t('channel.switchChannel')}
            data-os-floating-bubble-trigger="true"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              const target = event.currentTarget
              if (!target) return
              const anchor = target.getBoundingClientRect()
              const shouldClosePicker = Boolean(activeChannelPicker)
              setActiveInbox(null)
              setActiveChannelBubble(null)
              setActiveChannelMembersBubble(null)
              setActiveServerMembersBubble(null)
              setShowCreateChannel(false)
              onFocusWindow(null)
              setActiveChannelPicker(shouldClosePicker ? null : { anchor, nonce: Date.now() })
            }}
          >
            <Plus size={15} />
          </button>
        </div>
      ) : null}
      <div className="ml-auto flex h-10 shrink-0 items-center gap-1">
        {isInboxesLoading ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center text-white/70">
            <Loader2 size={14} className="animate-spin" />
          </span>
        ) : inboxes.length > 0 ? (
          visibleInboxes.map((entry) => {
            const label = buddyDisplayName(entry)
            const unread = entry.channel
              ? (scopedUnread?.channelUnread?.[entry.channel.id] ?? 0)
              : 0
            const isActive =
              activeInbox?.entry?.agent.id === entry.agent.id ||
              (entry.channel ? activeInbox?.channel.id === entry.channel.id : false)
            const isLoading = loadingInboxId === entry.agent.id
            return (
              <button
                type="button"
                key={entry.agent.id}
                ref={(node) => {
                  if (node) {
                    inboxButtonRefs.current.set(entry.agent.id, node)
                  } else {
                    inboxButtonRefs.current.delete(entry.agent.id)
                  }
                }}
                className={cn(
                  'group/inbox relative grid h-8 w-8 shrink-0 place-items-center overflow-visible rounded-full text-white transition hover:bg-white/8 hover:scale-[1.03] disabled:opacity-45',
                  isActive && 'hover:bg-transparent',
                )}
                title={label}
                aria-label={`${t('os.openInbox')}: ${label}`}
                data-os-floating-bubble-trigger="true"
                onPointerEnter={() => setHoverPreviewKey(`inbox:${entry.agent.id}`)}
                onPointerLeave={() => setHoverPreviewKey(null)}
                onFocus={() => setHoverPreviewKey(`inbox:${entry.agent.id}`)}
                onBlur={() => setHoverPreviewKey(null)}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  const target = event.currentTarget
                  if (!target) return
                  void handleOpenInbox(entry, target.getBoundingClientRect())
                }}
              >
                {isLoading ? (
                  <Loader2 size={15} className="animate-spin text-white/72" />
                ) : (
                  <PresenceAvatar
                    userId={entry.agent.user.id}
                    avatarUrl={entry.agent.user.avatarUrl}
                    displayName={label}
                    status={entry.agent.user.status}
                    agentStatus={entry.agent.status}
                    lastHeartbeat={entry.agent.lastHeartbeat}
                    isBot
                    size="xs"
                    className={
                      isActive
                        ? 'rounded-full ring-2 ring-primary ring-offset-2 ring-offset-black/45'
                        : undefined
                    }
                  />
                )}
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-black/40" />
                )}
                {!activeInbox && hoverPreviewKey === `inbox:${entry.agent.id}` ? (
                  <div
                    className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-[810] opacity-0 transition duration-150 group-hover/inbox:opacity-100 group-focus-visible/inbox:opacity-100"
                    style={{ zIndex: floatingPreviewLayerZIndex }}
                  >
                    <OsInboxHoverCard entry={entry} unread={unread} />
                  </div>
                ) : null}
              </button>
            )
          })
        ) : null}
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-lg text-white/76 transition hover:bg-white/10 hover:text-white"
          title={t('member.members')}
          aria-label={t('member.members')}
          data-os-floating-bubble-trigger="true"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            const target = event.currentTarget
            if (!target) return
            const anchor = target.getBoundingClientRect()
            setActiveInbox(null)
            setActiveChannelPicker(null)
            setActiveChannelMembersBubble(null)
            setActiveServerMembersBubble((current) => (current ? null : anchor))
          }}
        >
          <Users size={16} />
        </button>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-lg text-white/76 transition hover:bg-white/10 hover:text-white"
          title={t('os.menuSearch')}
          aria-label={t('os.menuSearch')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            window.dispatchEvent(new Event('shadow:open-command-palette'))
          }}
        >
          <Search size={16} />
        </button>
        <span
          className="contents"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <NotificationBell
            compact
            iconSize={16}
            osMode
            panelPlacement="bottom-end"
            panelVariant="bubble"
            className="!h-8 !w-8 !rounded-lg !border-transparent !bg-transparent !text-white/76 hover:!bg-white/10 hover:!text-white data-[unread=true]:!text-danger data-[unread=true]:hover:!text-danger"
            panelClassName="!border-white/14 !bg-bg-primary/96"
            panelStyle={{ zIndex: floatingLayerZIndex }}
          />
        </span>
      </div>
      {activeInbox && activeInboxPosition ? (
        <div
          className="fixed z-[820] h-[min(640px,calc(100vh-84px))] rounded-[24px] border border-white/14 bg-bg-primary/96 shadow-[0_26px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
          data-os-floating-bubble-root="true"
          style={{
            zIndex: floatingLayerZIndex,
            left: activeInboxPosition.left,
            top: activeInboxPosition.top,
            width: activeInboxPosition.width,
          }}
        >
          <BubbleArrow centerX={activeInboxPosition.arrowCenterX} />
          <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
            <ChannelView
              key={`inbox:${activeInbox.channel.id}`}
              channelId={activeInbox.channel.id}
              serverSlug={selectedServerSlug}
              onPreviewFile={onPreviewFile}
              syncNavigationState={false}
            />
          </div>
        </div>
      ) : null}
      {activeServerMembersBubble && activeServerMembersPosition ? (
        <div
          className="fixed z-[820] h-[min(580px,calc(100vh-84px))] overflow-hidden rounded-[24px] border border-white/14 bg-bg-primary/96 shadow-[0_26px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
          data-os-floating-bubble-root="true"
          style={{
            zIndex: floatingLayerZIndex,
            left: activeServerMembersPosition.left,
            top: activeServerMembersPosition.top,
            width: activeServerMembersPosition.width,
          }}
        >
          <BubbleArrow centerX={activeServerMembersPosition.arrowCenterX} />
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
              <ServerIcon
                iconUrl={selectedServer.server.iconUrl}
                name={selectedServer.server.name}
                size="sm"
                variant="plain"
                isPublic={selectedServer.server.isPublic}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-text-primary">
                  {t('member.members')}
                </p>
                <p className="truncate text-xs font-bold text-text-muted">
                  {selectedServer.server.name}
                </p>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <MemberList serverId={selectedServer.server.id} embedded />
            </div>
          </div>
        </div>
      ) : null}
      {activeChannelMembersBubble && activeChannelMembersPosition ? (
        <div
          className="fixed z-[820] h-[min(520px,calc(100vh-84px))] overflow-hidden rounded-[22px] border border-white/14 bg-bg-primary/96 shadow-[0_26px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
          data-os-floating-bubble-root="true"
          style={{
            zIndex: floatingLayerZIndex,
            left: activeChannelMembersPosition.left,
            top: activeChannelMembersPosition.top,
            width: activeChannelMembersPosition.width,
          }}
        >
          <BubbleArrow centerX={activeChannelMembersPosition.arrowCenterX} />
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-white/10 px-4 py-3">
              <p className="text-sm font-black text-text-primary">{t('member.members')}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <MemberList
                serverId={selectedServer.server.id}
                channelId={activeChannelMembersBubble.channelId}
                embedded
              />
            </div>
          </div>
        </div>
      ) : null}
      {activeChannelBubble && channelBubblePosition ? (
        <div
          className="fixed z-[820] h-[min(640px,calc(100vh-84px))] rounded-[24px] border border-white/14 bg-bg-primary/96 shadow-[0_26px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
          data-os-floating-bubble-root="true"
          style={{
            zIndex: floatingLayerZIndex,
            left: channelBubblePosition.left,
            top: channelBubblePosition.top,
            width: channelBubblePosition.width,
          }}
        >
          <BubbleArrow centerX={channelBubblePosition.arrowCenterX} />
          <div className="relative flex h-full w-full overflow-hidden rounded-[inherit]">
            <div className="min-w-0 flex-1">
              <ChannelView
                key={`channel-tab:${activeChannelBubble.tab.channelId}`}
                channelId={activeChannelBubble.tab.channelId}
                serverSlug={selectedServerSlug}
                onPreviewFile={onPreviewFile}
                onOpenMembers={(anchor) => {
                  const channelId = activeChannelBubble.tab.channelId
                  setActiveInbox(null)
                  setActiveChannelPicker(null)
                  setActiveServerMembersBubble(null)
                  setActiveChannelMembersBubble((current) =>
                    current?.channelId === channelId ? null : { anchor, channelId },
                  )
                }}
                syncNavigationState={false}
              />
            </div>
          </div>
        </div>
      ) : null}
      {activeChannelPicker && channelPickerPosition ? (
        <div
          className="fixed z-[820] max-h-[min(560px,calc(100vh-84px))] overflow-hidden rounded-[22px] border border-white/14 bg-bg-primary/96 shadow-[0_26px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
          data-os-floating-bubble-root="true"
          style={{
            zIndex: floatingLayerZIndex,
            left: channelPickerPosition.left,
            top: channelPickerPosition.top,
            width: channelPickerPosition.width,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <BubbleArrow centerX={channelPickerPosition.arrowCenterX} />
          <div className="border-b border-white/10 p-3">
            <div className="flex gap-2">
              <input
                ref={channelPickerInputRef}
                value={channelFilter}
                onChange={(event) => setChannelFilter(event.target.value)}
                placeholder={t('common.search')}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/22 px-3 py-2 text-sm font-bold text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary/45"
              />
              <Button
                type="button"
                variant="glass"
                size="xs"
                className="h-9 w-9 shrink-0 rounded-xl p-0 text-primary hover:text-primary"
                title={t('channel.addChannel')}
                aria-label={t('channel.addChannel')}
                onClick={() => {
                  setActiveChannelPicker(null)
                  setShowCreateChannel(true)
                }}
              >
                <Plus size={15} />
              </Button>
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {remainingChannels.length > 0 ? (
              remainingChannels.map((channel) => (
                <button
                  type="button"
                  key={channel.id}
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-text-secondary transition hover:bg-white/8 hover:text-text-primary"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenChannelWindow(channel)
                    setActiveChannelPicker(null)
                  }}
                >
                  <ChannelTypeIcon
                    type={channel.type}
                    size={15}
                    className="shrink-0 text-text-muted"
                  />
                  <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-4 text-sm font-bold text-text-muted">
                {t('channel.noChannels')}
              </p>
            )}
          </div>
        </div>
      ) : null}
      <Modal open={showCreateChannel} onClose={() => setShowCreateChannel(false)}>
        <ModalContent maxWidth="max-w-md">
          <ModalHeader
            overline={t('channel.channels')}
            icon={<Plus size={18} strokeWidth={2.6} />}
            title={t('channel.createChannel')}
            subtitle={t('channel.createChannelDesc')}
            closeLabel={t('common.close')}
          />
          <ModalBody className="space-y-4 py-5">
            <Input
              ref={createChannelNameInputRef}
              label={t('channel.channelName')}
              value={channelDraftName}
              onChange={(event) => setChannelDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault()
                  submitCreateChannel()
                }
              }}
              placeholder={t('channel.channelName')}
              className="!rounded-2xl !border-2 !border-border-subtle !bg-bg-tertiary/50 !py-3 focus:!ring-4 focus:!ring-primary/10"
            />
            <div className="flex gap-2">
              {CHANNEL_CREATE_TYPES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={channelDraftType === type ? 'primary' : 'glass'}
                  size="xs"
                  onClick={() => setChannelDraftType(type)}
                  className="font-black uppercase tracking-widest"
                >
                  <ChannelTypeIcon type={type} size={14} />
                  <span>
                    {type === 'voice'
                      ? t('channel.typeVoice')
                      : type === 'announcement'
                        ? t('channel.typeAnnouncement')
                        : t('channel.typeText')}
                  </span>
                </Button>
              ))}
            </div>
            <label className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-tertiary/50 px-4 py-3">
              <span className="text-sm text-foreground">{t('channel.privateChannelToggle')}</span>
              <Switch checked={channelDraftPrivate} onCheckedChange={setChannelDraftPrivate} />
            </label>
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreateChannel(false)}
                className="font-black uppercase tracking-widest"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={submitCreateChannel}
                disabled={!channelDraftName.trim() || isCreatingChannel}
                loading={isCreatingChannel}
                className="font-black uppercase tracking-widest"
              >
                {t('common.create')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </header>
  )
}
