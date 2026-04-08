import {
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  CheckCircle,
  ClipboardCopy,
  Copy,
  Edit2,
  Key,
  MessageSquare,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../components/common/avatar'
import { AvatarEditor } from '../components/common/avatar-editor'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import { useUIStore } from '../stores/ui.store'

/* ── Types ───────────────────────────────────────────── */

interface Agent {
  id: string
  userId: string
  kernelType: string
  config: Record<string, unknown>
  ownerId: string
  status: 'running' | 'stopped' | 'error'
  containerId: string | null
  lastHeartbeat: string | null
  totalOnlineSeconds: number
  createdAt: string
  updatedAt: string
  isListed?: boolean
  isRented?: boolean
  listingInfo?: {
    listingId: string
    listingStatus: string
    isListed: boolean
  } | null
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
    avatarUrl: string | null
  } | null
}

interface TokenResponse {
  token: string
  agent: { id: string; userId: string; status: string }
  botUser: { id: string; username: string; displayName: string | null; avatarUrl: string | null }
}

/** Renders a compact status badge for an agent's rental/listing status */
function AgentListingBadge({ agent }: { agent: Agent }) {
  const { t } = useTranslation()
  if (agent.isRented) {
    return (
      <Badge variant="warning" size="xs" className="shrink-0">
        🔒 {t('agentMgmt.rented')}
      </Badge>
    )
  }
  if (agent.isListed) {
    return (
      <Badge variant="success" size="xs" className="shrink-0">
        📋 {t('agentMgmt.listed')}
      </Badge>
    )
  }
  if (agent.listingInfo) {
    const statusMap: Record<string, { label: string; variant: 'neutral' | 'warning' | 'danger' }> =
      {
        draft: { label: t('agentMgmt.listingDraft'), variant: 'neutral' },
        paused: { label: t('agentMgmt.listingPaused'), variant: 'warning' },
        expired: { label: t('agentMgmt.listingExpired'), variant: 'neutral' },
        closed: { label: t('agentMgmt.listingClosed'), variant: 'danger' },
      }
    const info = statusMap[agent.listingInfo.listingStatus]
    if (info) {
      return (
        <Badge variant={info.variant} size="xs" className="shrink-0">
          {info.label}
        </Badge>
      )
    }
  }
  return null
}

/** Returns the status dot color class for an agent based on heartbeat-based online detection */
function getAgentOnlineDotClass(agent: Agent): string {
  if (agent.status === 'error') return 'bg-danger'
  if (agent.status === 'stopped') return 'bg-text-muted/50'
  // running — check heartbeat
  if (agent.lastHeartbeat && Date.now() - new Date(agent.lastHeartbeat).getTime() < 90000) {
    return 'bg-success'
  }
  return 'bg-text-muted/50' // running but heartbeat stale → show as offline
}

/** Formats total online seconds into a human-readable duration string */
function formatOnlineDuration(
  totalSeconds: number,
  t: (key: string, defaultValue?: string) => string,
): string {
  if (totalSeconds < 60) return `${totalSeconds}${t('time.seconds', '秒')}`
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours === 0) return `${minutes}${t('time.minutes', '分钟')}`
  if (hours < 24)
    return `${hours}${t('time.hours', '小时')}${minutes > 0 ? `${minutes}${t('time.minutes', '分钟')}` : ''}`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return `${days}${t('time.days', '天')}${remainHours > 0 ? `${remainHours}${t('time.hours', '小时')}` : ''}`
}

/* ── Agent Management Page ──────────────────────────── */

export function BuddyManagementPage() {
  const { t } = useTranslation()
  const unreadCount = useUnreadCount()
  useAppStatus({
    title: t('agentMgmt.title'),
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; agent: Agent } | null>(
    null,
  )

  // Fetch agents
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => fetchApi<Agent[]>('/api/agents'),
    refetchInterval: 30000, // Refresh every 30s for heartbeat status
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/agents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setDeleteConfirmId(null)
      if (selectedAgent?.id === deleteConfirmId) setSelectedAgent(null)
      showMessage(t('agentMgmt.deleteSuccess'), true)
    },
    onError: () => showMessage(t('agentMgmt.deleteFailed'), false),
  })

  // Token mutation
  const tokenMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi<TokenResponse>(`/api/agents/${id}/token`, { method: 'POST' }),
    onSuccess: (data) => {
      setGeneratedToken(data.token)
      setTokenCopied(false)
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })

  // Toggle (start/stop) mutation
  const toggleMutation = useMutation({
    mutationFn: (agent: Agent) =>
      fetchApi<Agent>(`/api/agents/${agent.id}/${agent.status === 'running' ? 'stop' : 'start'}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      // Refresh selected agent
      if (selectedAgent) {
        fetchApi<Agent>(`/api/agents/${selectedAgent.id}`).then((a) => setSelectedAgent(a))
      }
    },
  })

  const showMessage = (text: string, success: boolean) => {
    setMessage({ text, success })
    setTimeout(() => setMessage(null), 3000)
  }

  const copyToken = async (token: string) => {
    await navigator.clipboard.writeText(token)
    setTokenCopied(true)
    showMessage(t('agentMgmt.tokenCopied'), true)
  }

  const handleAgentContextMenu = (e: React.MouseEvent, agent: Agent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, agent })
  }

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  const statusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-success'
      case 'stopped':
        return 'text-text-muted'
      case 'error':
        return 'text-danger'
      default:
        return 'text-text-muted'
    }
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'running':
        return t('agentMgmt.statusRunning')
      case 'stopped':
        return t('agentMgmt.statusStopped')
      case 'error':
        return t('agentMgmt.statusError')
      default:
        return status
    }
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-bg-deep overflow-hidden">
      {/* Mobile header */}
      <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-bg-deep/80 backdrop-blur-xl border-b border-border-subtle shrink-0">
        {selectedAgent ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedAgent(null)
              setGeneratedToken(null)
            }}
          >
            <ArrowLeft size={16} />
            {t('agentMgmt.title')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/' })}>
              <ArrowLeft size={16} />
              {t('common.back')}
            </Button>
            <span className="flex-1" />
            <Button
              variant="primary"
              size="sm"
              className="rounded-full"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={14} />
              {t('agentMgmt.newAgent')}
            </Button>
          </>
        )}
      </div>

      {/* Mobile agent list (when no agent selected) */}
      {!selectedAgent && (
        <div className="md:hidden flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                setSelectedAgent(agent)
                setGeneratedToken(null)
              }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-[15px] font-medium text-text-secondary hover:bg-primary/10 hover:text-text-primary transition"
            >
              <UserAvatar
                userId={agent.botUser?.id ?? agent.userId}
                avatarUrl={agent.botUser?.avatarUrl}
                displayName={agent.botUser?.displayName ?? undefined}
                size="sm"
              />
              <span className="truncate flex-1 text-left">
                {agent.botUser?.displayName ?? agent.botUser?.username ?? 'Agent'}
              </span>
              <AgentListingBadge agent={agent} />
              <span className={`w-2 h-2 rounded-full ${getAgentOnlineDotClass(agent)}`} />
            </button>
          ))}
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className="w-60 bg-bg-deep/50 backdrop-blur-xl border-r border-border-subtle hidden md:flex flex-col shrink-0">
        <div className="p-4 border-b border-border-subtle">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/' })}>
            <ArrowLeft size={16} />
            {t('common.back')}
          </Button>
        </div>
        <div className="px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mt-2">
          {t('agentMgmt.title')}
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                setSelectedAgent(agent)
                setGeneratedToken(null)
              }}
              onContextMenu={(e) => handleAgentContextMenu(e, agent)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 rounded-2xl text-[15px] font-medium transition',
                selectedAgent?.id === agent.id
                  ? 'bg-primary/15 text-text-primary'
                  : 'text-text-secondary hover:bg-primary/10 hover:text-text-primary',
              )}
            >
              <UserAvatar
                userId={agent.botUser?.id ?? agent.userId}
                avatarUrl={agent.botUser?.avatarUrl}
                displayName={agent.botUser?.displayName ?? undefined}
                size="sm"
              />
              <span className="truncate flex-1 text-left">
                {agent.botUser?.displayName ?? agent.botUser?.username ?? 'Agent'}
              </span>
              <AgentListingBadge agent={agent} />
              <span className={`w-2 h-2 rounded-full ${getAgentOnlineDotClass(agent)}`} />
            </button>
          ))}

          {/* New Agent button */}
          <Button
            variant="primary"
            size="sm"
            className="w-full rounded-full mt-3 mb-2"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} />
            {t('agentMgmt.newAgent')}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-y-auto ${!selectedAgent ? 'hidden md:block' : ''}`}>
        <div className="max-w-2xl mx-auto p-4 md:p-8">
          {/* Global message */}
          {message && (
            <div
              className={cn(
                'mb-4 px-4 py-2 rounded-full text-sm font-bold',
                message.success ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
              )}
            >
              {message.text}
            </div>
          )}

          {selectedAgent ? (
            <AgentDetail
              agent={selectedAgent}
              generatedToken={generatedToken}
              tokenCopied={tokenCopied}
              tokenMutation={tokenMutation}
              statusColor={statusColor}
              statusLabel={statusLabel}
              onCopyToken={copyToken}
              onDelete={() => setDeleteConfirmId(selectedAgent.id)}
              onEdit={() => setShowEdit(true)}
              onToggle={(agent) => toggleMutation.mutate(agent)}
              togglePending={toggleMutation.isPending}
              t={t}
            />
          ) : (
            <EmptyState
              agents={agents}
              isLoading={isLoading}
              onCreateClick={() => setShowCreate(true)}
              t={t}
            />
          )}
        </div>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <CreateAgentDialog
          onClose={() => setShowCreate(false)}
          onSuccess={(agent) => {
            queryClient.invalidateQueries({ queryKey: ['agents'] })
            setShowCreate(false)
            setSelectedAgent(agent)
            showMessage(t('agentMgmt.createSuccess'), true)
          }}
          onError={(msg) => showMessage(msg || t('agentMgmt.createFailed'), false)}
          t={t}
        />
      )}

      {/* Edit dialog */}
      {showEdit && selectedAgent && (
        <EditAgentDialog
          agent={selectedAgent}
          onClose={() => setShowEdit(false)}
          onSuccess={(agent) => {
            queryClient.invalidateQueries({ queryKey: ['agents'] })
            setShowEdit(false)
            setSelectedAgent(agent)
            showMessage(t('agentMgmt.editSuccess'), true)
          }}
          onError={() => showMessage(t('agentMgmt.editFailed'), false)}
          t={t}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog isOpen={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}>
        <DialogContent className="rounded-[40px] shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
          <DialogHeader>
            <DialogTitle>{t('common.confirm')}</DialogTitle>
          </DialogHeader>
          <p className="text-text-muted text-sm font-bold italic">{t('agentMgmt.deleteConfirm')}</p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agent context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-bg-deep/90 backdrop-blur-xl border border-border-subtle rounded-2xl shadow-xl py-2 min-w-[180px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            type="button"
            onClick={() => {
              tokenMutation.mutate(contextMenu.agent.id)
              setSelectedAgent(contextMenu.agent)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-text-secondary hover:bg-primary/10 hover:text-text-primary transition rounded-lg mx-1"
            style={{ width: 'calc(100% - 8px)' }}
          >
            <Key size={14} />
            {t('agentMgmt.generateToken')}
          </button>
          <button
            type="button"
            onClick={() => {
              toggleMutation.mutate(contextMenu.agent)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-text-secondary hover:bg-primary/10 hover:text-text-primary transition rounded-lg mx-1"
            style={{ width: 'calc(100% - 8px)' }}
          >
            {contextMenu.agent.status === 'running' ? (
              <XCircle size={14} />
            ) : (
              <CheckCircle size={14} />
            )}
            {contextMenu.agent.status === 'running'
              ? t('agentMgmt.disable')
              : t('agentMgmt.enable')}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedAgent(contextMenu.agent)
              setShowEdit(true)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-text-secondary hover:bg-primary/10 hover:text-text-primary transition rounded-lg mx-1"
            style={{ width: 'calc(100% - 8px)' }}
          >
            <Edit2 size={14} />
            {t('common.edit')}
          </button>
          <div className="h-px bg-bg-tertiary/50 my-1 mx-3" />
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmId(contextMenu.agent.id)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-danger hover:bg-danger/10 transition rounded-lg mx-1"
            style={{ width: 'calc(100% - 8px)' }}
          >
            <Trash2 size={14} />
            {t('common.delete')}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Agent Detail Panel ──────────────────────────────── */

function AgentDetail({
  agent,
  generatedToken,
  tokenCopied,
  tokenMutation,
  statusColor,
  statusLabel,
  onCopyToken,
  onDelete,
  onEdit,
  onToggle,
  togglePending,
  t,
}: {
  agent: Agent
  generatedToken: string | null
  tokenCopied: boolean
  tokenMutation: ReturnType<typeof useMutation<TokenResponse, Error, string>>
  statusColor: (s: string) => string
  statusLabel: (s: string) => string
  onCopyToken: (token: string) => void
  onDelete: () => void
  onEdit: () => void
  onToggle: (agent: Agent) => void
  togglePending: boolean
  t: (key: string) => string
}) {
  const name = agent.botUser?.displayName ?? agent.botUser?.username ?? 'Agent'
  const desc = (agent.config?.description as string) ?? ''

  return (
    <>
      {/* Agent header */}
      <Card variant="glass" className="rounded-[24px] mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <UserAvatar
              userId={agent.botUser?.id ?? agent.userId}
              avatarUrl={agent.botUser?.avatarUrl}
              displayName={name}
              size="xl"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-text-primary">{name}</h3>
                <Badge variant="primary" size="xs">
                  {t('common.bot')}
                </Badge>
              </div>
              {agent.botUser?.username && (
                <p className="text-sm text-text-muted font-bold italic">
                  @{agent.botUser.username}
                </p>
              )}
              {desc && <p className="text-sm text-text-secondary mt-1">{desc}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={onEdit} title={t('common.edit')}>
                <Edit2 size={18} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="hover:text-danger hover:bg-danger/10"
                title={t('common.delete')}
              >
                <Trash2 size={18} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status & info */}
      <Card variant="glass" className="rounded-[24px] mb-6">
        <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
              {t('agentMgmt.status')}
            </label>
            <div className="flex items-center gap-2">
              {(() => {
                if (agent.status === 'error') {
                  return (
                    <Badge variant="danger" size="sm">
                      <XCircle size={12} className="mr-1" />
                      {t('agentMgmt.statusError')}
                    </Badge>
                  )
                }
                if (agent.status === 'stopped') {
                  return (
                    <Badge variant="neutral" size="sm">
                      <span className="w-2 h-2 rounded-full bg-text-muted mr-1" />
                      {t('agentMgmt.statusStopped')}
                    </Badge>
                  )
                }
                const isOnline =
                  agent.lastHeartbeat &&
                  Date.now() - new Date(agent.lastHeartbeat).getTime() < 90000
                return (
                  <Badge variant={isOnline ? 'success' : 'neutral'} size="sm">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full mr-1',
                        isOnline ? 'bg-success' : 'bg-text-muted',
                      )}
                    />
                    {isOnline ? t('member.online') : t('member.offline')}
                  </Badge>
                )
              })()}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
              {t('agentMgmt.enableDisable')}
            </label>
            <button
              type="button"
              onClick={() => onToggle(agent)}
              disabled={togglePending}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                agent.status === 'running' ? 'bg-success' : 'bg-text-muted/30',
                togglePending && 'opacity-50',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm',
                  agent.status === 'running' && 'translate-x-5',
                )}
              />
            </button>
          </div>
          <div>
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
              {t('agentMgmt.owner')}
            </label>
            <div className="flex items-center gap-2">
              {agent.owner && (
                <UserAvatar
                  userId={agent.owner.id}
                  avatarUrl={agent.owner.avatarUrl}
                  displayName={agent.owner.displayName ?? agent.owner.username}
                  size="xs"
                />
              )}
              <p className="text-sm text-text-primary font-bold">
                {agent.owner?.displayName ?? agent.owner?.username ?? '—'}
              </p>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
              {t('agentMgmt.createdAt')}
            </label>
            <p className="text-sm text-text-primary font-bold">
              {new Date(agent.createdAt).toLocaleString()}
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
              {t('agentMgmt.totalOnlineTime')}
            </label>
            <p className="text-sm text-text-primary font-bold">
              {formatOnlineDuration(
                agent.totalOnlineSeconds ?? 0,
                t as (key: string, defaultValue?: string) => string,
              )}
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
              {t('agentMgmt.connection')}
            </label>
            {(() => {
              if (!agent.lastHeartbeat) {
                return (
                  <Badge variant="neutral" size="sm">
                    {t('agentMgmt.neverConnected')}
                  </Badge>
                )
              }
              const lastBeat = new Date(agent.lastHeartbeat).getTime()
              const now = Date.now()
              const diffSec = Math.floor((now - lastBeat) / 1000)
              const isOnline = diffSec < 90
              const isWarning = diffSec >= 90 && diffSec < 300
              return (
                <Badge variant={isOnline ? 'success' : isWarning ? 'warning' : 'danger'} size="sm">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full mr-1',
                      isOnline ? 'bg-success' : isWarning ? 'bg-warning' : 'bg-danger',
                    )}
                  />
                  {isOnline
                    ? t('agentMgmt.connected')
                    : `${t('agentMgmt.lastSeen')} ${new Date(agent.lastHeartbeat).toLocaleString()}`}
                </Badge>
              )
            })()}
          </div>
          <div>
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
              {t('agentMgmt.rentalStatus')}
            </label>
            <div className="flex items-center gap-2">
              {agent.isRented ? (
                <Badge variant="warning" size="sm">
                  {t('agentMgmt.rented')}
                </Badge>
              ) : agent.isListed ? (
                <Badge variant="success" size="sm">
                  {t('agentMgmt.listed')}
                </Badge>
              ) : agent.listingInfo ? (
                <Badge variant="warning" size="sm">
                  {agent.listingInfo.listingStatus === 'draft'
                    ? t('agentMgmt.listingDraft')
                    : agent.listingInfo.listingStatus === 'paused'
                      ? t('agentMgmt.listingPaused')
                      : agent.listingInfo.listingStatus === 'expired'
                        ? t('agentMgmt.listingExpired')
                        : t('agentMgmt.listingClosed')}
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm">
                  {t('agentMgmt.notListed')}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Token section */}
      <Card variant="glass" className="rounded-[24px] mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Key size={16} className="text-primary" />
            <h3 className="text-sm font-black text-text-primary uppercase tracking-[0.15em]">
              {t('agentMgmt.tokenTitle')}
            </h3>
          </div>
          <p className="text-sm text-text-muted font-bold italic mb-4">
            {t('agentMgmt.tokenDesc')}
          </p>

          {(() => {
            const displayToken =
              generatedToken ?? (agent.config?.lastToken as string | undefined) ?? null
            if (displayToken) {
              return (
                <div className="space-y-3">
                  <div className="bg-bg-deep/50 backdrop-blur-sm rounded-2xl p-3 break-all font-mono text-xs text-text-secondary border border-border-subtle">
                    {displayToken}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant={tokenCopied ? 'outline' : 'primary'}
                      size="sm"
                      onClick={() => onCopyToken(displayToken)}
                    >
                      <ClipboardCopy size={14} />
                      {tokenCopied ? t('common.copied') : t('common.copy')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => tokenMutation.mutate(agent.id)}
                      disabled={tokenMutation.isPending}
                    >
                      <Key size={14} />
                      {tokenMutation.isPending
                        ? t('agentMgmt.generating')
                        : t('agentMgmt.regenerateToken')}
                    </Button>
                  </div>

                  {/* YAML example */}
                  <div className="mt-4">
                    <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-2">
                      {t('agentMgmt.configExample')}
                    </label>
                    <pre className="bg-bg-deep/50 backdrop-blur-sm rounded-2xl p-4 text-xs text-text-secondary border border-border-subtle overflow-x-auto">
                      {`{
  "channels": {
    "shadowob": {
      "token": "${displayToken}...",
      "serverUrl": "https://shadowob.com"
    }
  }
}`}
                    </pre>
                  </div>
                </div>
              )
            }
            return (
              <Button
                variant="primary"
                size="sm"
                onClick={() => tokenMutation.mutate(agent.id)}
                disabled={tokenMutation.isPending}
              >
                <Key size={14} />
                {tokenMutation.isPending ? t('agentMgmt.generating') : t('agentMgmt.generateToken')}
              </Button>
            )
          })()}
        </CardContent>
      </Card>

      {/* OpenClaw Setup Guide */}
      <OpenClawSetupGuide
        agent={agent}
        generatedToken={generatedToken}
        onGenerateToken={() => tokenMutation.mutate(agent.id)}
        generatingToken={tokenMutation.isPending}
        t={t}
      />
    </>
  )
}

/* ── OpenClaw Setup Guide ─────────────────────────────── */

function CopyBlock({
  content,
  label,
  t,
}: {
  content: string
  label?: string
  t: (key: string) => string
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative group">
      {label && (
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
          {label}
        </p>
      )}
      <pre className="bg-bg-deep/50 backdrop-blur-sm rounded-2xl p-3 pr-10 font-mono text-xs text-text-secondary border border-border-subtle overflow-x-auto whitespace-pre-wrap break-all">
        {content}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-bg-tertiary/50 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover transition opacity-0 group-hover:opacity-100"
        title={t('common.copy')}
      >
        {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
      </button>
    </div>
  )
}

function OpenClawSetupGuide({
  agent,
  generatedToken,
  onGenerateToken,
  generatingToken,
  t,
}: {
  agent: Agent
  generatedToken: string | null
  onGenerateToken: () => void
  generatingToken: boolean
  t: (key: string) => string
}) {
  const token = (agent.config?.lastToken as string | undefined) ?? generatedToken ?? ''
  const hasToken = !!token.trim()
  const serverUrl = window.location.origin
  const [activeTab, setActiveTab] = useState<'manual' | 'chat'>('chat')

  // Bash one-liner for manual setup
  const bashCommand = `openclaw plugins install @shadowob/openclaw-shadowob && openclaw config set channels.shadowob.token "${token || '<TOKEN>'}" && openclaw config set channels.shadowob.serverUrl "${serverUrl}" && openclaw gateway restart`

  // AI prompt for chat-based setup
  const aiPrompt = `请帮我安装和配置 ShadowOwnBuddy 插件，连接到 Shadow 服务器。

配置信息：
- 插件名称：@shadowob/openclaw
- 服务器地址：${serverUrl}

请执行以下步骤：
1. 安装插件：openclaw plugins install @shadowob/openclaw
2. 配置 Token：openclaw config set channels.shadowob.token "${token || '<TOKEN>'}"
3. 配置服务器地址：openclaw config set channels.shadowob.serverUrl "${serverUrl}"
4. 重启网关：openclaw gateway restart

请依次执行这些命令，并确认每个步骤是否成功。`

  if (!hasToken) {
    return (
      <Card variant="glass" className="rounded-[24px] mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={16} className="text-primary" />
            <h3 className="text-sm font-black text-text-primary uppercase tracking-[0.15em]">
              {t('agentMgmt.openclawGuideTitle')}
            </h3>
          </div>
          <p className="text-sm text-text-muted font-bold italic mb-4">
            {t('agentMgmt.setupTokenWarning')}
          </p>
          <Button variant="primary" size="sm" onClick={onGenerateToken} disabled={generatingToken}>
            <Key size={14} />
            {generatingToken ? t('agentMgmt.generating') : t('agentMgmt.generateToken')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="glass" className="rounded-[24px] mb-6">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={16} className="text-primary" />
          <h3 className="text-sm font-black text-text-primary uppercase tracking-[0.15em]">
            {t('agentMgmt.openclawGuideTitle')}
          </h3>
        </div>
        <p className="text-sm text-text-muted font-bold italic mb-4">
          {t('agentMgmt.openclawGuideDesc')}
        </p>

        {/* Tab selector — pill-shaped */}
        <div className="flex gap-1 mb-4 bg-bg-deep/50 backdrop-blur-sm rounded-full p-1 border border-border-subtle">
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={cn(
              'flex items-center gap-1.5 flex-1 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition',
              activeTab === 'manual'
                ? 'bg-primary/15 text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            <Terminal size={12} />
            {t('agentMgmt.setupManual')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={cn(
              'flex items-center gap-1.5 flex-1 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition',
              activeTab === 'chat'
                ? 'bg-primary/15 text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            <MessageSquare size={12} />
            {t('agentMgmt.setupChat')}
          </button>
        </div>

        {activeTab === 'manual' ? (
          <>
            {/* Quick bash one-liner */}
            <div className="mb-4">
              <p className="text-xs font-black text-text-secondary mb-2 uppercase tracking-widest">
                {t('agentMgmt.setupBashTitle')}
              </p>
              <CopyBlock content={bashCommand} t={t} />
              {!token && (
                <p className="text-[11px] text-warning mt-1.5 ml-1 font-bold">
                  ⚠ {t('agentMgmt.setupTokenWarning')}
                </p>
              )}
            </div>

            <div className="h-px bg-bg-tertiary/50 my-4" />

            {/* Step-by-step */}
            <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mb-3">
              {t('agentMgmt.setupStepByStep')}
            </p>

            {/* Step 1: Install */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center">
                  1
                </span>
                <span className="text-sm font-black text-text-primary">
                  {t('docs.openclawStep1Title')}
                </span>
              </div>
              <div className="ml-7">
                <CopyBlock content="openclaw plugins install @shadowob/openclaw-shadowob" t={t} />
              </div>
            </div>

            {/* Step 2: Config Token */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center">
                  2
                </span>
                <span className="text-sm font-black text-text-primary">
                  {t('agentMgmt.setupConfigToken')}
                </span>
              </div>
              <div className="ml-7">
                <CopyBlock
                  content={`openclaw config set channels.shadowob.token "${token}"`}
                  t={t}
                />
              </div>
            </div>

            {/* Step 3: Config Server URL */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center">
                  3
                </span>
                <span className="text-sm font-black text-text-primary">
                  {t('agentMgmt.setupConfigServer')}
                </span>
              </div>
              <div className="ml-7">
                <CopyBlock
                  content={`openclaw config set channels.shadowob.serverUrl "${serverUrl}"`}
                  t={t}
                />
              </div>
            </div>

            {/* Step 4: Run */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center">
                  4
                </span>
                <span className="text-sm font-black text-text-primary">
                  {t('agentMgmt.openclawRunTitle')}
                </span>
              </div>
              <div className="ml-7">
                <CopyBlock content="openclaw gateway restart" t={t} />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* AI chat prompt */}
            <p className="text-xs text-text-muted font-bold italic mb-3">
              {t('agentMgmt.setupChatDesc')}
            </p>
            <CopyBlock content={aiPrompt} t={t} />
          </>
        )}

        {/* Capabilities */}
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mb-2">
            {t('docs.openclawCapabilities')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {['messaging', 'threads', 'reactions', 'media', 'mentions', 'editDelete'].map((cap) => (
              <div
                key={cap}
                className="flex items-center gap-1.5 text-xs text-text-secondary font-bold"
              >
                <span className="text-success">✓</span>
                {t(`docs.openclawCap_${cap}`)}
              </div>
            ))}
          </div>
        </div>

        {/* Link to full docs */}
        <div className="mt-4 pt-3 border-t border-border-subtle">
          <a
            href="/product/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:text-primary-hover font-black flex items-center gap-1 transition uppercase tracking-widest"
          >
            <BookOpen size={12} />
            {t('agentMgmt.openclawFullDocs')}
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Empty State ──────────────────────────────────────── */

function EmptyState({
  agents,
  isLoading,
  onCreateClick,
  t,
}: {
  agents: Agent[]
  isLoading: boolean
  onCreateClick: () => void
  t: (key: string) => string
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-muted font-bold italic">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <img src="/Logo.svg" alt="Buddy" className="w-16 h-16 mb-4 opacity-30" />
      <h2 className="text-xl font-black text-text-primary mb-2">
        {agents.length === 0 ? t('agentMgmt.noAgents') : t('agentMgmt.title')}
      </h2>
      <p className="text-text-muted font-bold italic mb-6 max-w-md">
        {agents.length === 0 ? t('agentMgmt.noAgentsDesc') : t('agentMgmt.subtitle')}
      </p>
      {agents.length === 0 && (
        <Button variant="primary" size="lg" className="rounded-full" onClick={onCreateClick}>
          <Plus size={18} />
          {t('agentMgmt.newAgent')}
        </Button>
      )}
    </div>
  )
}

/* ── Create Agent Dialog ──────────────────────────────── */

function CreateAgentDialog({
  onClose,
  onSuccess,
  onError,
  t,
  initialData,
}: {
  onClose: () => void
  onSuccess: (agent: Agent) => void
  onError: (message?: string) => void
  t: (key: string) => string
  initialData?: { name?: string; username?: string; description?: string }
}) {
  const [name, setName] = useState(initialData?.name ?? '')
  const [username, setUsername] = useState(initialData?.username ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string
      username: string
      description?: string
      avatarUrl?: string
    }) =>
      fetchApi<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          username: data.username,
          description: data.description,
          avatarUrl: data.avatarUrl,
          kernelType: 'openclaw',
          config: {},
        }),
      }),
    onSuccess: (agent) => onSuccess(agent),
    onError: (err: Error) => {
      if (err.message?.toLowerCase().includes('username already taken')) {
        const suffix = Math.random().toString(36).slice(2, 6)
        setUsername((prev) => `${prev.slice(0, 27)}_${suffix}`)
        onError(t('agentMgmt.usernameTaken'))
      } else {
        onError(err.message || t('agentMgmt.createFailed'))
      }
    },
  })

  return (
    <Dialog isOpen onClose={onClose}>
      <DialogContent
        maxWidth="max-w-[480px]"
        className="rounded-[40px] shadow-[0_32px_120px_rgba(0,0,0,0.5)]"
      >
        <DialogHeader>
          <DialogTitle>{t('agentMgmt.createTitle')}</DialogTitle>
        </DialogHeader>

        {/* Name */}
        <div className="space-y-2">
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
            {t('agentMgmt.nameLabel')}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('agentMgmt.namePlaceholder')}
            maxLength={64}
          />
        </div>

        {/* Username */}
        <div className="space-y-2">
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
            {t('agentMgmt.usernameLabel')}
          </label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
            placeholder={t('agentMgmt.usernamePlaceholder')}
            maxLength={32}
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
            {t('agentMgmt.descLabel')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('agentMgmt.descPlaceholder')}
            className="w-full bg-bg-tertiary border-2 border-border-subtle text-text-primary rounded-[24px] px-6 py-4 text-base font-bold outline-none transition-all placeholder:text-text-muted/30 focus:border-primary focus:shadow-[0_0_0_5px_rgba(0,198,209,0.1)] resize-none"
            rows={3}
            maxLength={500}
          />
        </div>

        {/* Avatar picker */}
        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1 mb-3">
            {t('agentMgmt.avatarLabel')}
          </label>
          <AvatarEditor value={selectedAvatar ?? undefined} onChange={setSelectedAvatar} />
        </div>

        {/* Actions */}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              name.trim() &&
              username.trim() &&
              createMutation.mutate({
                name: name.trim(),
                username: username.trim(),
                description: description.trim() || undefined,
                avatarUrl: selectedAvatar ?? undefined,
              })
            }
            disabled={!name.trim() || !username.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? t('agentMgmt.creating') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Edit Agent Dialog ────────────────────────────────── */

function EditAgentDialog({
  agent,
  onClose,
  onSuccess,
  onError,
  t,
}: {
  agent: Agent
  onClose: () => void
  onSuccess: (agent: Agent) => void
  onError: () => void
  t: (key: string) => string
}) {
  const [name, setName] = useState(agent.botUser?.displayName ?? agent.botUser?.username ?? 'Buddy')
  const [description, setDescription] = useState((agent.config?.description as string) ?? '')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(
    agent.botUser?.avatarUrl ?? null,
  )

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; avatarUrl?: string | null }) =>
      fetchApi<Agent>(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (agent) => onSuccess(agent),
    onError: () => onError(),
  })

  return (
    <Dialog isOpen onClose={onClose}>
      <DialogContent
        maxWidth="max-w-[480px]"
        className="rounded-[40px] shadow-[0_32px_120px_rgba(0,0,0,0.5)]"
      >
        <DialogHeader>
          <DialogTitle>{t('agentMgmt.editTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
            {t('agentMgmt.nameLabel')}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('agentMgmt.namePlaceholder')}
            maxLength={64}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
            {t('agentMgmt.descLabel')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('agentMgmt.descPlaceholder')}
            className="w-full bg-bg-tertiary border-2 border-border-subtle text-text-primary rounded-[24px] px-6 py-4 text-base font-bold outline-none transition-all placeholder:text-text-muted/30 focus:border-primary focus:shadow-[0_0_0_5px_rgba(0,198,209,0.1)] resize-none"
            rows={3}
            maxLength={500}
          />
        </div>

        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1 mb-3">
            {t('agentMgmt.avatarLabel')}
          </label>
          <AvatarEditor value={selectedAvatar ?? undefined} onChange={setSelectedAvatar} />
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              name.trim() &&
              updateMutation.mutate({
                name: name.trim(),
                description: description.trim() || undefined,
                avatarUrl: selectedAvatar,
              })
            }
            disabled={!name.trim() || updateMutation.isPending}
          >
            {updateMutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Embeddable Buddy Management Content (for Settings page) ── */

export function BuddyManagementContent() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState<{
    name?: string
    username?: string
    description?: string
  } | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null)

  // Listen for 'create-buddy' pending action from task center
  const pendingAction = useUIStore((s) => s.pendingAction)
  const setPendingAction = useUIStore((s) => s.setPendingAction)
  useEffect(() => {
    if (pendingAction === 'create-buddy') {
      setShowCreate({})
      setPendingAction(null)
    }
  }, [pendingAction, setPendingAction])

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => fetchApi<Agent[]>('/api/agents'),
    refetchInterval: 30000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/agents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setDeleteConfirmId(null)
      if (selectedAgent?.id === deleteConfirmId) setSelectedAgent(null)
      showMsg(t('agentMgmt.deleteSuccess'), true)
    },
    onError: () => showMsg(t('agentMgmt.deleteFailed'), false),
  })

  const tokenMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi<TokenResponse>(`/api/agents/${id}/token`, { method: 'POST' }),
    onSuccess: (data) => {
      setGeneratedToken(data.token)
      setTokenCopied(false)
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (agent: Agent) =>
      fetchApi<Agent>(`/api/agents/${agent.id}/${agent.status === 'running' ? 'stop' : 'start'}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      if (selectedAgent) {
        fetchApi<Agent>(`/api/agents/${selectedAgent.id}`).then((a) => setSelectedAgent(a))
      }
    },
  })

  const showMsg = (text: string, success: boolean) => {
    setMessage({ text, success })
    setTimeout(() => setMessage(null), 3000)
  }

  const copyToken = async (token: string) => {
    await navigator.clipboard.writeText(token)
    setTokenCopied(true)
    showMsg(t('agentMgmt.tokenCopied'), true)
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-success'
      case 'stopped':
        return 'text-text-muted'
      case 'error':
        return 'text-danger'
      default:
        return 'text-text-muted'
    }
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'running':
        return t('agentMgmt.statusRunning')
      case 'stopped':
        return t('agentMgmt.statusStopped')
      case 'error':
        return t('agentMgmt.statusError')
      default:
        return status
    }
  }

  return (
    <>
      {/* Hero Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border border-primary/20 p-6 mb-6">
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10" />
        <div className="relative z-10">
          <h2 className="text-2xl font-black text-text-primary tracking-tight mb-1">
            {t('agentMgmt.title')}
          </h2>
          <p className="text-sm text-text-muted max-w-md">
            {t(
              'agentMgmt.heroDesc',
              '创建、管理和部署你的 AI Buddy，让它们在 Shadow 世界为你工作。',
            )}
          </p>
        </div>
      </div>

      {/* Primary Creation CTA (only when no agents) */}
      {!isLoading && agents.length === 0 && (
        <div className="space-y-6 mb-6">
          <button
            type="button"
            onClick={() => setShowCreate({})}
            className="w-full rounded-3xl border border-primary/40 bg-primary/10 hover:bg-primary/15 hover:border-primary/60 transition-all duration-300 p-8 text-center group cursor-pointer shadow-sm"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Plus size={28} className="text-primary" />
            </div>
            <p className="text-base font-black text-text-primary mb-1">
              {t('agentMgmt.createFirst', '创建你的第一个 Buddy')}
            </p>
            <p className="text-sm text-text-muted">
              {t('agentMgmt.createFirstDesc', '点击开始，几分钟内即可拥有你的 AI 助手')}
            </p>
          </button>

          {/* Template Gallery — quick start */}
          <div>
            <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 mb-3">
              {t('agentMgmt.templateGallery', '快速开始模板')}
            </span>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {(
                [
                  {
                    icon: MessageSquare,
                    name: t('agentMgmt.templateChatName', 'QA 问答助手'),
                    username: 'qa-helper',
                    desc: t(
                      'agentMgmt.templateChatDesc',
                      '自动回答频道内的常见问题，支持上下文多轮对话',
                    ),
                  },
                  {
                    icon: ShieldCheck,
                    name: t('agentMgmt.templateModName', '社区守卫'),
                    username: 'community-guard',
                    desc: t(
                      'agentMgmt.templateModDesc',
                      '自动检测违规内容、垃圾广告，维护社区秩序',
                    ),
                  },
                  {
                    icon: ShoppingCart,
                    name: t('agentMgmt.templateShopName', '导购客服'),
                    username: 'shop-assistant',
                    desc: t('agentMgmt.templateShopDesc', '商品推荐、库存查询、订单跟踪一站式服务'),
                  },
                ] as const
              ).map((tmpl) => (
                <button
                  key={tmpl.username}
                  type="button"
                  onClick={() =>
                    setShowCreate({
                      name: tmpl.name,
                      username: tmpl.username,
                      description: tmpl.desc,
                    })
                  }
                  className="rounded-2xl border border-border-subtle bg-[var(--glass-bg)] backdrop-blur-xl p-4 text-left hover:bg-bg-modifier-hover hover:border-primary/30 transition-all group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                    <tmpl.icon size={18} className="text-primary" />
                  </div>
                  <p className="text-sm font-black text-text-primary group-hover:text-primary transition-colors">
                    {tmpl.name}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{tmpl.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Header with create button (when agents exist) */}
      {agents.length > 0 && (
        <div className="flex items-center justify-between mb-6">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60">
            {t('agentMgmt.myBuddies', '我的 Buddy')}
          </span>
          <Button
            variant="primary"
            size="sm"
            className="rounded-full"
            onClick={() => setShowCreate({})}
          >
            <Plus size={14} />
            {t('agentMgmt.newAgent')}
          </Button>
        </div>
      )}

      {/* Message */}
      {message && (
        <div
          className={cn(
            'mb-4 px-4 py-2 rounded-full text-sm font-bold',
            message.success ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
          )}
        >
          {message.text}
        </div>
      )}

      {/* Agent list */}
      {isLoading ? (
        <div className="text-center text-text-muted font-bold italic py-8">
          {t('common.loading')}
        </div>
      ) : (
        agents.length > 0 && (
          <div className="space-y-2 mb-6">
            {agents.map((agent) => {
              const name = agent.botUser?.displayName ?? agent.botUser?.username ?? 'Buddy'
              const isSelected = selectedAgent?.id === agent.id
              return (
                <button
                  key={agent.id}
                  onClick={() => {
                    setSelectedAgent(isSelected ? null : agent)
                    setGeneratedToken(null)
                  }}
                  className={cn(
                    'flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-left transition border',
                    isSelected
                      ? 'bg-primary/15 border-primary/30 text-text-primary'
                      : 'bg-bg-tertiary/30 border-border-subtle text-text-secondary hover:bg-primary/10 hover:text-text-primary',
                  )}
                >
                  <UserAvatar
                    userId={agent.botUser?.id ?? agent.userId}
                    avatarUrl={agent.botUser?.avatarUrl}
                    displayName={agent.botUser?.displayName ?? undefined}
                    size="sm"
                  />
                  <span className="truncate flex-1 font-bold">{name}</span>
                  {(agent.totalOnlineSeconds ?? 0) > 0 && (
                    <span className="text-[11px] text-text-muted shrink-0 font-bold">
                      {formatOnlineDuration(
                        agent.totalOnlineSeconds,
                        t as (key: string, defaultValue?: string) => string,
                      )}
                    </span>
                  )}
                  <AgentListingBadge agent={agent} />
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${getAgentOnlineDotClass(agent)}`}
                  />
                </button>
              )
            })}
          </div>
        )
      )}

      {/* Selected agent detail */}
      {selectedAgent && (
        <AgentDetail
          agent={selectedAgent}
          generatedToken={generatedToken}
          tokenCopied={tokenCopied}
          tokenMutation={tokenMutation}
          statusColor={statusColor}
          statusLabel={statusLabel}
          onCopyToken={copyToken}
          onDelete={() => setDeleteConfirmId(selectedAgent.id)}
          onEdit={() => setShowEdit(true)}
          onToggle={(agent) => toggleMutation.mutate(agent)}
          togglePending={toggleMutation.isPending}
          t={t}
        />
      )}

      {/* Create dialog */}
      {showCreate && (
        <CreateAgentDialog
          onClose={() => setShowCreate(null)}
          onSuccess={(agent) => {
            queryClient.invalidateQueries({ queryKey: ['agents'] })
            setShowCreate(null)
            setSelectedAgent(agent)
            showMsg(t('agentMgmt.createSuccess'), true)
          }}
          onError={() => showMsg(t('agentMgmt.createFailed'), false)}
          t={t}
          initialData={showCreate}
        />
      )}

      {/* Edit dialog */}
      {showEdit && selectedAgent && (
        <EditAgentDialog
          agent={selectedAgent}
          onClose={() => setShowEdit(false)}
          onSuccess={(agent) => {
            queryClient.invalidateQueries({ queryKey: ['agents'] })
            setShowEdit(false)
            setSelectedAgent(agent)
            showMsg(t('agentMgmt.editSuccess'), true)
          }}
          onError={() => showMsg(t('agentMgmt.editFailed'), false)}
          t={t}
        />
      )}

      {/* Delete confirmation */}
      <Dialog isOpen={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}>
        <DialogContent className="rounded-[40px] shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
          <DialogHeader>
            <DialogTitle>{t('common.confirm')}</DialogTitle>
          </DialogHeader>
          <p className="text-text-muted text-sm font-bold italic">{t('agentMgmt.deleteConfirm')}</p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
