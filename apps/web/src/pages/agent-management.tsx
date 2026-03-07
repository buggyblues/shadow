import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  CheckCircle,
  ClipboardCopy,
  Edit2,
  Key,
  Plus,
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
  createdAt: string
  updatedAt: string
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

/* ── Agent Management Page ──────────────────────────── */

export function AgentManagementPage() {
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
        return 'text-green-400'
      case 'stopped':
        return 'text-zinc-400'
      case 'error':
        return 'text-red-400'
      default:
        return 'text-zinc-400'
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
    <div className="flex-1 flex bg-bg-primary overflow-hidden">
      {/* Sidebar */}
      <div className="w-60 bg-bg-secondary flex flex-col shrink-0">
        <div className="p-4 border-b-2 border-bg-tertiary">
          <button
            onClick={() => navigate({ to: '/app' })}
            className="flex items-center gap-2 text-[#949ba4] hover:text-[#dbdee1] transition text-[15px] font-medium"
          >
            <ArrowLeft size={16} />
            {t('common.back')}
          </button>
        </div>
        <div className="px-5 py-3 text-[12px] font-bold uppercase text-[#949ba4] tracking-wide mt-2">
          {t('agentMgmt.title')}
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto px-3 space-y-[2px]">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                setSelectedAgent(agent)
                setGeneratedToken(null)
              }}
              onContextMenu={(e) => handleAgentContextMenu(e, agent)}
              className={`flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
                selectedAgent?.id === agent.id
                  ? 'bg-white/[0.08] text-white'
                  : 'text-[#949ba4] hover:bg-white/[0.04] hover:text-[#dbdee1]'
              }`}
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
              <span
                className={`w-2 h-2 rounded-full ${
                  agent.status === 'running'
                    ? 'bg-[#23a559]'
                    : agent.status === 'error'
                      ? 'bg-[#da373c]'
                      : 'bg-[#80848e]'
                }`}
              />
            </button>
          ))}

          {/* New Agent button */}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-[15px] font-medium text-[#23a559] hover:bg-[#23a559]/10 transition mt-2 mb-2"
          >
            <Plus size={16} />
            {t('agentMgmt.newAgent')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-8">
          {/* Global message */}
          {message && (
            <div
              className={`mb-4 px-4 py-2 rounded-lg text-sm ${
                message.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}
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
          onError={() => showMessage(t('agentMgmt.createFailed'), false)}
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
      {deleteConfirmId && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="bg-bg-secondary rounded-xl p-6 w-96 border border-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-text-primary mb-2">{t('common.confirm')}</h2>
            <p className="text-text-muted text-sm mb-6">{t('agentMgmt.deleteConfirm')}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirmId)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-danger text-white rounded-lg hover:bg-red-600 transition font-bold disabled:opacity-50"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-bg-tertiary border border-white/10 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            type="button"
            onClick={() => {
              tokenMutation.mutate(contextMenu.agent.id)
              setSelectedAgent(contextMenu.agent)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
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
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
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
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
          >
            <Edit2 size={14} />
            {t('common.edit')}
          </button>
          <div className="h-px bg-white/5 my-1" />
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmId(contextMenu.agent.id)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition"
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
      <div className="bg-bg-secondary rounded-xl p-6 mb-6 border border-white/5">
        <div className="flex items-center gap-4">
          <UserAvatar
            userId={agent.botUser?.id ?? agent.userId}
            avatarUrl={agent.botUser?.avatarUrl}
            displayName={name}
            size="xl"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-text-primary">{name}</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary">
                {t('common.bot')}
              </span>
            </div>
            {agent.botUser?.username && (
              <p className="text-sm text-text-muted">@{agent.botUser.username}</p>
            )}
            {desc && <p className="text-sm text-text-secondary mt-1">{desc}</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="p-2 text-text-muted hover:text-primary transition rounded-lg hover:bg-primary/10"
              title={t('common.edit')}
            >
              <Edit2 size={18} />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-text-muted hover:text-danger transition rounded-lg hover:bg-danger/10"
              title={t('common.delete')}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Status & info */}
      <div className="bg-bg-secondary rounded-xl p-6 mb-6 border border-white/5 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">
            {t('agentMgmt.status')}
          </label>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 ${statusColor(agent.status)}`}>
              {agent.status === 'running' ? (
                <CheckCircle size={14} />
              ) : agent.status === 'error' ? (
                <XCircle size={14} />
              ) : (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-current" />
              )}
              <span className="text-sm font-medium">{statusLabel(agent.status)}</span>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">
            {t('agentMgmt.enableDisable')}
          </label>
          <button
            type="button"
            onClick={() => onToggle(agent)}
            disabled={togglePending}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              agent.status === 'running' ? 'bg-green-500' : 'bg-zinc-600'
            } ${togglePending ? 'opacity-50' : ''}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                agent.status === 'running' ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">
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
            <p className="text-sm text-text-primary">
              {agent.owner?.displayName ?? agent.owner?.username ?? '—'}
            </p>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">
            {t('agentMgmt.createdAt')}
          </label>
          <p className="text-sm text-text-primary">{new Date(agent.createdAt).toLocaleString()}</p>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">
            {t('agentMgmt.connection')}
          </label>
          {(() => {
            if (!agent.lastHeartbeat) {
              return (
                <div className="flex items-center gap-2 text-text-muted">
                  <span className="w-2 h-2 rounded-full bg-zinc-500" />
                  <span className="text-sm">{t('agentMgmt.neverConnected')}</span>
                </div>
              )
            }
            const lastBeat = new Date(agent.lastHeartbeat).getTime()
            const now = Date.now()
            const diffSec = Math.floor((now - lastBeat) / 1000)
            const isOnline = diffSec < 90
            const isWarning = diffSec >= 90 && diffSec < 300
            return (
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isOnline ? 'bg-green-400' : isWarning ? 'bg-yellow-400' : 'bg-red-400'
                  }`}
                />
                <span
                  className={`text-sm ${
                    isOnline ? 'text-green-400' : isWarning ? 'text-yellow-400' : 'text-red-400'
                  }`}
                >
                  {isOnline
                    ? t('agentMgmt.connected')
                    : `${t('agentMgmt.lastSeen')} ${new Date(agent.lastHeartbeat).toLocaleString()}`}
                </span>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Token section */}
      <div className="bg-bg-secondary rounded-xl p-6 mb-6 border border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <Key size={16} className="text-primary" />
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
            {t('agentMgmt.tokenTitle')}
          </h3>
        </div>
        <p className="text-sm text-text-muted mb-4">{t('agentMgmt.tokenDesc')}</p>

        {(() => {
          const displayToken =
            generatedToken ?? (agent.config?.lastToken as string | undefined) ?? null
          if (displayToken) {
            return (
              <div className="space-y-3">
                <div className="bg-bg-tertiary rounded-lg p-3 break-all font-mono text-xs text-text-secondary border border-white/5">
                  {displayToken}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onCopyToken(displayToken)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${
                      tokenCopied
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-primary hover:bg-primary-hover text-white'
                    }`}
                  >
                    <ClipboardCopy size={14} />
                    {tokenCopied ? t('common.copied') : t('common.copy')}
                  </button>
                  <button
                    onClick={() => tokenMutation.mutate(agent.id)}
                    disabled={tokenMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition bg-bg-tertiary text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary disabled:opacity-50"
                  >
                    <Key size={14} />
                    {tokenMutation.isPending
                      ? t('agentMgmt.generating')
                      : t('agentMgmt.regenerateToken')}
                  </button>
                </div>

                {/* YAML example */}
                <div className="mt-4">
                  <label className="block text-[10px] font-bold uppercase text-text-muted mb-2">
                    {t('agentMgmt.yamlExample')}
                  </label>
                  <pre className="bg-bg-tertiary rounded-lg p-4 text-xs text-text-secondary border border-white/5 overflow-x-auto">
                    {`channels:
  shadow:
    token: "${displayToken.slice(0, 20)}..."
    serverUrl: "https://shadowob.com"`}
                  </pre>
                </div>
              </div>
            )
          }
          return (
            <button
              onClick={() => tokenMutation.mutate(agent.id)}
              disabled={tokenMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-bold transition disabled:opacity-50"
            >
              <Key size={14} />
              {tokenMutation.isPending ? t('agentMgmt.generating') : t('agentMgmt.generateToken')}
            </button>
          )
        })()}
      </div>
    </>
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
        <div className="text-text-muted">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <img src="/Logo.svg" alt="Buddy" className="w-12 h-12 mb-4 opacity-50" />
      <h2 className="text-xl font-bold text-text-primary mb-2">
        {agents.length === 0 ? t('agentMgmt.noAgents') : t('agentMgmt.title')}
      </h2>
      <p className="text-text-muted mb-6 max-w-md">
        {agents.length === 0 ? t('agentMgmt.noAgentsDesc') : t('agentMgmt.subtitle')}
      </p>
      {agents.length === 0 && (
        <button
          onClick={onCreateClick}
          className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold transition"
        >
          <Plus size={18} />
          {t('agentMgmt.newAgent')}
        </button>
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
}: {
  onClose: () => void
  onSuccess: (agent: Agent) => void
  onError: () => void
  t: (key: string) => string
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; avatarUrl?: string }) =>
      fetchApi<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          avatarUrl: data.avatarUrl,
          kernelType: 'openclaw',
          config: {},
        }),
      }),
    onSuccess: (agent) => onSuccess(agent),
    onError: () => onError(),
  })

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary rounded-xl p-6 w-[480px] max-h-[80vh] overflow-y-auto border border-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-text-primary mb-6">{t('agentMgmt.createTitle')}</h2>

        {/* Name */}
        <div className="mb-4">
          <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
            {t('agentMgmt.nameLabel')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('agentMgmt.namePlaceholder')}
            className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary transition"
            maxLength={64}
          />
        </div>

        {/* Description */}
        <div className="mb-4">
          <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
            {t('agentMgmt.descLabel')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('agentMgmt.descPlaceholder')}
            className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary transition resize-none"
            rows={3}
            maxLength={500}
          />
        </div>

        {/* Avatar picker */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase text-[#b5bac1] mb-3">
            {t('agentMgmt.avatarLabel')}
          </label>
          <AvatarEditor value={selectedAvatar ?? undefined} onChange={setSelectedAvatar} />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() =>
              name.trim() &&
              createMutation.mutate({
                name: name.trim(),
                description: description.trim() || undefined,
                avatarUrl: selectedAvatar ?? undefined,
              })
            }
            disabled={!name.trim() || createMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary-hover text-white font-bold rounded-lg transition disabled:opacity-50"
          >
            <img src="/Logo.svg" alt="Buddy" className="w-4 h-4" />
            {createMutation.isPending ? t('agentMgmt.creating') : t('common.create')}
          </button>
        </div>
      </div>
    </div>
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
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary rounded-xl p-6 w-[480px] max-h-[80vh] overflow-y-auto border border-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-text-primary mb-6">{t('agentMgmt.editTitle')}</h2>

        <div className="mb-4">
          <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
            {t('agentMgmt.nameLabel')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('agentMgmt.namePlaceholder')}
            className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary transition"
            maxLength={64}
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
            {t('agentMgmt.descLabel')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('agentMgmt.descPlaceholder')}
            className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary transition resize-none"
            rows={3}
            maxLength={500}
          />
        </div>

        <div className="mb-6">
          <label className="block text-xs font-bold uppercase text-[#b5bac1] mb-3">
            {t('agentMgmt.avatarLabel')}
          </label>
          <AvatarEditor value={selectedAvatar ?? undefined} onChange={setSelectedAvatar} />
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() =>
              name.trim() &&
              updateMutation.mutate({
                name: name.trim(),
                description: description.trim() || undefined,
                avatarUrl: selectedAvatar,
              })
            }
            disabled={!name.trim() || updateMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary-hover text-white font-bold rounded-lg transition disabled:opacity-50"
          >
            {updateMutation.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
