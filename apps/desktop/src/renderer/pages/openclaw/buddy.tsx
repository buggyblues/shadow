/**
 * Buddy Connect Page
 *
 * Manage connections between local OpenClaw agents and remote Shadow Buddy
 * instances. Users select from their existing Buddy list (fetched from the
 * Shadow server) and connections are auto-configured — no manual token entry.
 */

import {
  ArrowRight,
  Bot,
  Check,
  Cloud,
  CloudOff,
  Globe,
  Link,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Unlink,
  Users,
  Wifi,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import type { AgentConfig, BuddyConnection } from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import { OpenClawButton, OpenClawSplitLayout } from './openclaw-ui'

/** Remote Buddy agent from the Shadow server */
interface RemoteBuddy {
  id: string
  userId: string
  status: 'running' | 'stopped' | 'error'
  lastHeartbeat: string | null
  totalOnlineSeconds: number
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
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

export function BuddyPage() {
  const { t } = useTranslation()
  const [connections, setConnections] = useState<BuddyConnection[]>([])
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [selectedConn, setSelectedConn] = useState<BuddyConnection | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [connecting, setConnecting] = useState<Set<string>>(new Set())
  const [disconnecting, setDisconnecting] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    conn: BuddyConnection
  } | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [conns, ag] = await Promise.all([
        openClawApi.listBuddyConnections(),
        openClawApi.listAgents(),
      ])
      setConnections(conns)
      setAgents(ag)
    } catch {
      // Ignore
    }
  }, [])

  useEffect(() => {
    if (openClawApi.isAvailable) loadData()
  }, [loadData])

  // Auto-select first connection if none selected
  useEffect(() => {
    if (!selectedConn && !isAdding && connections.length > 0) {
      setSelectedConn(connections[0]!)
    }
  }, [selectedConn, isAdding, connections])

  // Listen for real-time buddy status changes
  useEffect(() => {
    if (!openClawApi.isAvailable) return
    const unsub = openClawApi.onBuddyStatusChanged?.((updatedConnections: BuddyConnection[]) => {
      setConnections(updatedConnections)
    })
    return unsub
  }, [])

  const handleConnect = async (connId: string) => {
    setConnecting((prev: Set<string>) => new Set(prev).add(connId))
    try {
      const ok = await openClawApi.connectBuddy(connId)
      await loadData()
      setNotice({
        text: ok
          ? t('openclaw.buddy.connectSuccess', 'Buddy 连接已启用，网关正在建立通信')
          : t('openclaw.buddy.connectFailed', '连接配置失败，请检查 Token'),
        type: ok ? 'success' : 'error',
      })
    } finally {
      setConnecting((prev: Set<string>) => {
        const next = new Set(prev)
        next.delete(connId)
        return next
      })
    }
  }

  const handleDisconnect = async (connId: string) => {
    setDisconnecting((prev: Set<string>) => new Set(prev).add(connId))
    try {
      await openClawApi.disconnectBuddy(connId)
      await loadData()
      setNotice({
        text: t('openclaw.buddy.disconnectSuccess', 'Buddy 已断开连接'),
        type: 'success',
      })
    } finally {
      setDisconnecting((prev: Set<string>) => {
        const next = new Set(prev)
        next.delete(connId)
        return next
      })
    }
  }

  const handleRemove = async (connId: string) => {
    await openClawApi.removeBuddyConnection(connId)
    if (selectedConn?.id === connId) setSelectedConn(null)
    await loadData()
    setNotice({ text: t('openclaw.buddy.removeSuccess', '连接已移除'), type: 'success' })
  }

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 2600)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [contextMenu])

  return (
    <OpenClawSplitLayout
      sidebar={
        <div className="h-full min-h-0 overflow-y-auto shrink-0 flex flex-col">
          <div className="px-4 pt-4 pb-3 border-b border-bg-tertiary flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                {t('openclaw.buddy.title', '伙伴连接')}
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                {t('openclaw.buddy.subtitle', '管理 Buddy 连接')}
              </p>
            </div>
            <OpenClawButton
              type="button"
              onClick={() => {
                setIsAdding(true)
                setSelectedConn(null)
              }}
              variant="subtle"
              size="icon"
              title={t('openclaw.buddy.addConnection', '添加连接')}
            >
              <Plus size={14} />
            </OpenClawButton>
          </div>

          {notice && (
            <div
              className={`mx-3 mt-3 p-2 rounded-lg border text-xs ${
                notice.type === 'success'
                  ? 'bg-green-500/10 border-green-500/20 text-green-500'
                  : 'bg-red-500/10 border-red-500/20 text-red-500'
              }`}
            >
              {notice.text}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isAdding && (
              <div className="w-full text-left px-3 py-2.5 rounded-lg border border-primary/40 bg-primary/10">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0 bg-primary animate-pulse" />
                  <p className="text-sm font-medium text-primary truncate flex-1">
                    {t('openclaw.buddy.newConnection', '新连接')}
                  </p>
                </div>
                <p className="text-[11px] text-text-muted mt-1 truncate">
                  {t('openclaw.buddy.editing', '编辑中...')}
                </p>
              </div>
            )}
            {connections.length === 0 && !isAdding && (
              <div className="text-center py-8">
                <Cloud size={28} className="mx-auto text-text-muted/40 mb-2" />
                <p className="text-xs text-text-muted">
                  {t('openclaw.buddy.noConnections', '暂无 Buddy 连接')}
                </p>
              </div>
            )}
            {connections.map((conn: BuddyConnection) => {
              const isConnected = conn.status === 'connected'
              const isError = conn.status === 'error'
              return (
                <button
                  key={conn.id}
                  type="button"
                  onClick={() => {
                    setSelectedConn(conn)
                    setIsAdding(false)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, conn })
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition ${
                    !isAdding && selectedConn?.id === conn.id
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-bg-tertiary hover:border-primary/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isConnected ? 'bg-green-500' : isError ? 'bg-red-500' : 'bg-neutral-400'
                      }`}
                    />
                    <p className="text-sm font-medium text-text-primary truncate flex-1">
                      {conn.label}
                    </p>
                  </div>
                  <p className="text-[11px] text-text-muted mt-1 truncate font-mono">
                    {conn.serverUrl}
                  </p>
                </button>
              )
            })}
            {contextMenu && (
              <div
                className="fixed z-50 min-w-[140px] py-1 rounded-lg bg-bg-secondary border border-bg-tertiary shadow-xl"
                style={{ top: contextMenu.y, left: contextMenu.x }}
              >
                {contextMenu.conn.status === 'connected' ? (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition"
                    onClick={() => {
                      handleDisconnect(contextMenu.conn.id)
                      setContextMenu(null)
                    }}
                  >
                    {t('openclaw.buddy.disconnect', '断开连接')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition"
                    onClick={() => {
                      handleConnect(contextMenu.conn.id)
                      setContextMenu(null)
                    }}
                  >
                    {t('openclaw.buddy.connect', '连接')}
                  </button>
                )}
                <div className="my-1 border-t border-bg-tertiary" />
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition"
                  onClick={() => {
                    handleRemove(contextMenu.conn.id)
                    setContextMenu(null)
                  }}
                >
                  {t('openclaw.buddy.remove', '移除')}
                </button>
              </div>
            )}
          </div>
        </div>
      }
      content={
        <div className="h-full min-h-0 overflow-y-auto">
          {isAdding ? (
            <AddConnectionView
              agents={agents}
              onBack={() => {
                setIsAdding(false)
                if (connections.length > 0) setSelectedConn(connections[0]!)
              }}
              onSave={async () => {
                await loadData()
                setNotice({
                  text: t('openclaw.buddy.createdConnected', 'Buddy 连接已创建'),
                  type: 'success',
                })
                setIsAdding(false)
                const conns = await openClawApi.listBuddyConnections()
                if (conns.length > 0) setSelectedConn(conns[conns.length - 1]!)
              }}
            />
          ) : selectedConn ? (
            <ConnectionDetailView
              key={selectedConn.id}
              connection={selectedConn}
              agents={agents}
              onBack={() => setSelectedConn(null)}
              onConnect={() => handleConnect(selectedConn.id)}
              onDisconnect={() => handleDisconnect(selectedConn.id)}
              onRemove={() => handleRemove(selectedConn.id)}
              onRefresh={loadData}
              connecting={connecting.has(selectedConn.id)}
              disconnecting={disconnecting.has(selectedConn.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <Cloud size={36} className="text-text-muted/40 mb-3" />
              <p className="text-sm text-text-muted">
                {connections.length === 0
                  ? t('openclaw.buddy.noConnections', '暂无 Buddy 连接')
                  : t('openclaw.buddy.selectHint', '请从列表中选择一个连接')}
              </p>
              {connections.length === 0 && (
                <OpenClawButton type="button" onClick={() => setIsAdding(true)} className="mt-3">
                  <Plus size={14} />
                  {t('openclaw.buddy.addConnection', '添加连接')}
                </OpenClawButton>
              )}
            </div>
          )}
        </div>
      }
    />
  )
}

// ─── Add Connection View (Buddy Picker) ─────────────────────────────────────

function AddConnectionView({
  agents: _agents,
  onBack,
  onSave,
}: {
  agents: AgentConfig[]
  onBack: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const [remoteBuddies, setRemoteBuddies] = useState<RemoteBuddy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBuddy, setSelectedBuddy] = useState<RemoteBuddy | null>(null)
  const [agentId, setAgentId] = useState('')
  const [autoConnect, setAutoConnect] = useState(true)
  const [saving, setSaving] = useState(false)

  // Fetch buddies from Shadow server
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchApi<RemoteBuddy[]>('/api/agents')
      .then((buddies) => {
        setRemoteBuddies(buddies)
        setLoading(false)
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : t('openclaw.buddy.fetchError', '获取 Buddy 列表失败'),
        )
        setLoading(false)
      })
  }, [t])

  const handleSave = async () => {
    if (!selectedBuddy) return
    setSaving(true)
    try {
      // Auto-generate token for the selected buddy
      const tokenResp = await fetchApi<TokenResponse>(`/api/agents/${selectedBuddy.id}/token`, {
        method: 'POST',
      })
      const buddyName =
        selectedBuddy.botUser?.displayName ?? selectedBuddy.botUser?.username ?? 'Buddy'
      const serverUrl = (import.meta.env.VITE_API_BASE as string) || window.location.origin

      await openClawApi.addBuddyConnection({
        id: crypto.randomUUID(),
        label: buddyName,
        serverUrl,
        apiToken: tokenResp.token,
        remoteAgentId: tokenResp.agent.id,
        agentId,
        autoConnect,
      })
      onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('openclaw.buddy.configError', '配置连接失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-5 pb-6 max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-text-primary mb-1">
              {t('openclaw.buddy.addConnection', '添加 Buddy 连接')}
            </h2>
            <p className="text-sm text-text-muted">
              {t('openclaw.buddy.addDesc', '从 Shadow 账户中选择一个 Buddy，自动配置连接')}
            </p>
          </div>
          <OpenClawButton
            type="button"
            onClick={handleSave}
            disabled={saving || !selectedBuddy}
            className="shrink-0"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
            {t('openclaw.buddy.save', '连接')}
          </OpenClawButton>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-500">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* ━━━ Select Buddy ━━━ */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              {t('openclaw.buddy.selectBuddy', '选择 Buddy')}
            </h3>
            <div className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-text-muted" />
                  <span className="ml-2 text-sm text-text-muted">
                    {t('openclaw.buddy.loadingBuddies', '正在加载 Buddy 列表...')}
                  </span>
                </div>
              ) : remoteBuddies.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <Users size={32} className="text-text-muted mb-2" />
                  <p className="text-sm text-text-muted">
                    {t(
                      'openclaw.buddy.noBuddies',
                      '未找到 Buddy。请先在 Shadow 账户中创建一个 Buddy。',
                    )}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {remoteBuddies.map((buddy) => {
                    const isSelected = selectedBuddy?.id === buddy.id
                    const isOnline =
                      buddy.lastHeartbeat &&
                      Date.now() - new Date(buddy.lastHeartbeat).getTime() < 90000
                    const name = buddy.botUser?.displayName ?? buddy.botUser?.username ?? 'Buddy'

                    return (
                      <button
                        key={buddy.id}
                        type="button"
                        onClick={() => setSelectedBuddy(isSelected ? null : buddy)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition text-left ${
                          isSelected
                            ? 'bg-primary/10 border-2 border-primary'
                            : 'bg-bg-primary border-2 border-transparent hover:bg-bg-tertiary/50'
                        }`}
                      >
                        {buddy.botUser?.avatarUrl ? (
                          <img
                            src={buddy.botUser.avatarUrl}
                            alt={name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center">
                            <Bot size={18} className="text-text-muted" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{name}</p>
                          <p className="text-[10px] text-text-muted">
                            @{buddy.botUser?.username ?? 'unknown'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-[#80848e]'}`}
                          />
                          {isSelected && <Check size={16} className="text-primary" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          {/* ━━━ Agent Binding ━━━ */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              {t('openclaw.buddy.agentBinding', '本地智能体绑定')}
            </h3>
            <div className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  {t('openclaw.buddy.agent', '本地智能体')}
                </label>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-bg-tertiary text-sm text-text-primary focus:outline-none focus:border-primary/50 transition"
                >
                  <option value="">{t('openclaw.buddy.selectAgent', '选择智能体...')}</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.identity?.emoji} {a.name || a.id}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-text-muted mt-1">
                  {t('openclaw.buddy.agentHint', '用于处理来自该 Buddy 消息的智能体')}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {t('openclaw.buddy.autoConnect', '自动连接')}
                  </p>
                  <p className="text-xs text-text-muted">
                    {t('openclaw.buddy.autoConnectDesc', '应用启动时自动连接')}
                  </p>
                </div>
                <div
                  role="switch"
                  aria-checked={autoConnect}
                  tabIndex={0}
                  onClick={() => setAutoConnect(!autoConnect)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setAutoConnect(!autoConnect)
                    }
                  }}
                  className={`relative cursor-pointer transition-colors rounded-full ${
                    autoConnect ? 'bg-primary' : 'bg-bg-tertiary'
                  }`}
                  style={{ width: 40, height: 22 }}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${
                      autoConnect ? 'translate-x-[18px]' : ''
                    }`}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ━━━ Connection diagram ━━━ */}
          {selectedBuddy && (
            <section>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                {t('openclaw.buddy.diagram', '连接流程')}
              </h3>
              <div className="bg-bg-secondary rounded-xl border border-bg-tertiary p-6">
                <div className="flex items-center justify-center gap-4">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-14 h-14 rounded-xl bg-bg-tertiary flex items-center justify-center">
                      <Server size={24} className="text-primary" />
                    </div>
                    <span className="text-[10px] text-text-muted font-medium">
                      {t('openclaw.buddy.localAgent', '本地智能体')}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <div className="w-8 h-0.5 bg-bg-tertiary" />
                      <ArrowRight size={14} className="text-primary" />
                      <div className="w-8 h-0.5 bg-bg-tertiary" />
                    </div>
                    <span className="text-[10px] text-text-muted">
                      {t('openclaw.buddy.realTimeComm', '实时通信')}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                      {selectedBuddy.botUser?.avatarUrl ? (
                        <img
                          src={selectedBuddy.botUser.avatarUrl}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <Bot size={24} className="text-primary" />
                      )}
                    </div>
                    <span className="text-[10px] text-text-primary font-medium">
                      {selectedBuddy.botUser?.displayName ?? 'Buddy'}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <div className="w-8 h-0.5 bg-bg-tertiary" />
                      <ArrowRight size={14} className="text-primary" />
                      <div className="w-8 h-0.5 bg-bg-tertiary" />
                    </div>
                    <span className="text-[10px] text-text-muted">
                      {t('openclaw.buddy.chat', '聊天')}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-14 h-14 rounded-xl bg-bg-tertiary flex items-center justify-center">
                      <Globe size={24} className="text-primary" />
                    </div>
                    <span className="text-[10px] text-text-muted font-medium">
                      {t('openclaw.buddy.users', '用户')}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Connection Detail View ──────────────────────────────────────────────────

function ConnectionDetailView({
  connection,
  agents,
  onBack,
  onConnect,
  onDisconnect,
  onRemove,
  onRefresh,
  connecting,
  disconnecting,
}: {
  connection: BuddyConnection
  agents: AgentConfig[]
  onBack: () => void
  onConnect: () => void
  onDisconnect: () => void
  onRemove: () => void
  onRefresh: () => void
  connecting: boolean
  disconnecting: boolean
}) {
  const { t } = useTranslation()
  const agent = agents.find((a) => a.id === connection.agentId)
  const isConnected = connection.status === 'connected'
  const isError = connection.status === 'error'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-5 pb-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isConnected
                ? 'bg-green-500/10 text-green-500'
                : isError
                  ? 'bg-red-500/10 text-red-500'
                  : 'bg-bg-tertiary text-text-muted'
            }`}
          >
            {isConnected ? <Wifi size={24} /> : <CloudOff size={24} />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">{connection.label}</h2>
            <p className="text-sm text-text-muted font-mono">{connection.serverUrl}</p>
          </div>
        </div>

        {/* Status card */}
        <div className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4 mb-6">
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {t('openclaw.buddy.status', '状态')}
              </p>
              <p
                className={`text-sm font-semibold ${
                  isConnected ? 'text-green-500' : isError ? 'text-red-500' : 'text-text-muted'
                }`}
              >
                {connection.status ?? 'disconnected'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {t('openclaw.buddy.agentLabel', '智能体')}
              </p>
              <p className="text-sm text-text-primary">
                {agent
                  ? `${agent.identity?.emoji ?? ''} ${agent.name || agent.id}`
                  : t('openclaw.buddy.unassigned', '未分配')}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {t('openclaw.buddy.lastHeartbeat', '最后心跳')}
              </p>
              <p className="text-sm text-text-secondary">
                {connection.lastHeartbeat
                  ? formatRelativeTime(new Date(connection.lastHeartbeat))
                  : t('common.none', '无')}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                {t('openclaw.buddy.connectedAt', '连接时间')}
              </p>
              <p className="text-sm text-text-secondary">
                {connection.connectedAt
                  ? new Date(connection.connectedAt).toLocaleString()
                  : t('common.none', '无')}
              </p>
            </div>
          </div>
        </div>

        {/* Error message */}
        {connection.error && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 mb-6">
            <p className="text-xs text-red-500 font-mono">{connection.error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {isConnected ? (
            <OpenClawButton
              type="button"
              onClick={onDisconnect}
              disabled={disconnecting}
              variant="danger"
            >
              {disconnecting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Unlink size={14} />
              )}
              {t('openclaw.buddy.disconnect', '断开连接')}
            </OpenClawButton>
          ) : (
            <OpenClawButton type="button" onClick={onConnect} disabled={connecting}>
              {connecting ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
              {t('openclaw.buddy.connect', '连接')}
            </OpenClawButton>
          )}
          <OpenClawButton type="button" onClick={onRefresh} variant="ghost">
            <RefreshCw size={14} />
            {t('common.refresh', '刷新')}
          </OpenClawButton>
          <OpenClawButton type="button" onClick={onRemove} variant="danger" className="ml-auto">
            <Trash2 size={14} />
            {t('common.delete', '删除')}
          </OpenClawButton>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  try {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
    if (seconds < 10) return rtf.format(0, 'second')
    if (seconds < 60) return rtf.format(-seconds, 'second')
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return rtf.format(-minutes, 'minute')
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return rtf.format(-hours, 'hour')
    const days = Math.floor(hours / 24)
    return rtf.format(-days, 'day')
  } catch {
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }
}
