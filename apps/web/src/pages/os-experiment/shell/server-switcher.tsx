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
  PillSegmentedControl,
  Search as SearchField,
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
  Settings,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '../../../components/chat/message-bubble/types'
import { PresenceAvatar } from '../../../components/common/presence-avatar'
import { MemberList } from '../../../components/member/member-list'
import { NotificationBell } from '../../../components/notification/notification-bell'
import { ServerIcon } from '../../../components/server/server-icon'
import { fetchApi } from '../../../lib/api'
import type { AuthenticatedUser } from '../../../lib/auth-session'
import { showToast } from '../../../lib/toast'
import { useUIStore } from '../../../stores/ui.store'
import { ChannelView } from '../../channel-view'
import {
  CHANNEL_CREATE_TYPES,
  type ChannelCreateType,
  ChannelTypeIcon,
  OsChannelTabHoverCard,
  OsInboxHoverCard,
} from '../channel-ui'
import { OsHtmlWallpaperFrame } from '../html-wallpaper-frame'
import type {
  BuddyInboxEntry,
  ChannelMeta,
  OsChannelTab,
  ScopedUnread,
  ServerEntry,
} from '../types'
import { buddyDisplayName, OS_GC_MS, OS_STALE_MS, OS_TOP_BAR_HEIGHT } from '../utils'

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

export function OsServerSwitcher({
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
          <PillSegmentedControl
            mode="button"
            variant="topbar"
            size="sm"
            value={selectedServer.server.id}
            onValueChange={() => undefined}
            items={[
              {
                value: selectedServer.server.id,
                icon: (
                  <ServerIcon
                    iconUrl={selectedServer.server.iconUrl}
                    name={selectedServer.server.name}
                    size="min"
                    variant="plain"
                    isPublic={selectedServer.server.isPublic}
                  />
                ),
                label: selectedServer.server.name,
                trailing: <ChevronDown size={15} className="text-white/66" />,
              },
            ]}
            aria-label={t('os.account')}
            title={selectedServer.server.name}
          />
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
            <div className="min-w-0 flex-1">
              <SearchField
                ref={serverFilterInputRef}
                type="search"
                value={filter}
                onChange={setFilter}
                placeholder={t('common.search')}
                aria-label={t('common.search')}
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
                <div>
                  <SearchField
                    ref={publicServerSearchInputRef}
                    type="search"
                    value={publicServerFilter}
                    onChange={setPublicServerFilter}
                    placeholder={t('server.searchPublicServers')}
                    aria-label={t('server.searchPublicServers')}
                  />
                </div>
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
