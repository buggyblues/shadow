/**
 * Buddy Connection Form Component
 *
 * 可复用的 Buddy 连接配置组件，用于：
 * - Onboarding 页面的 Buddy 绑定步骤
 * - 设置页的 Buddy 管理页面
 */

import { ArrowRight, Bot, Check, Globe, Loader2, Plus, Server, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import type { AgentConfig, BuddyConnection } from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'

/** Remote Buddy agent from the ShadowOwnBuddy server */
export interface RemoteBuddy {
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

export type BuddyFormMode = 'create' | 'bind'

export interface BuddyConnectionFormProps {
  /** 可用的本地智能体列表 */
  agents: AgentConfig[]
  /** 初始选中的智能体 ID */
  initialAgentId?: string
  /** 初始模式 */
  initialMode?: BuddyFormMode
  /** 保存成功回调 */
  onSave: (connection: BuddyConnection) => void
  /** 保存失败回调 */
  onError?: (error: string) => void
  /** 是否显示标题 */
  showTitle?: boolean
  /** 自定义类名 */
  className?: string
}

export function BuddyConnectionForm({
  agents,
  initialAgentId,
  initialMode = 'create',
  onSave,
  onError,
  showTitle = true,
  className = '',
}: BuddyConnectionFormProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<BuddyFormMode>(initialMode)
  const [remoteBuddies, setRemoteBuddies] = useState<RemoteBuddy[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedBuddy, setSelectedBuddy] = useState<RemoteBuddy | null>(null)
  const [agentId, setAgentId] = useState(initialAgentId ?? '')
  const [autoConnect, setAutoConnect] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch remote buddies when in "bind" mode
  useEffect(() => {
    if (mode !== 'bind') return
    setLoading(true)
    setError(null)
    fetchApi<RemoteBuddy[]>('/api/agents')
      .then((buddies) => {
        setRemoteBuddies(buddies)
        setLoading(false)
      })
      .catch((err) => {
        const errMsg =
          err instanceof Error ? err.message : t('openclaw.buddy.fetchError', '获取 Buddy 列表失败')
        setError(errMsg)
        setLoading(false)
        onError?.(errMsg)
      })
  }, [mode, t, onError])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const serverUrl = (import.meta.env.VITE_API_BASE as string) || window.location.origin
      let connection: BuddyConnection

      if (mode === 'create') {
        // Create a new remote buddy with the same name as the local agent
        const agent = agents.find((a) => a.id === agentId)
        const buddyName = agent?.name || 'OpenClaw Buddy'
        const username = `buddy-${Date.now()}`
        const remoteBuddy = await fetchApi<{ id: string }>('/api/agents', {
          method: 'POST',
          body: JSON.stringify({
            name: buddyName,
            username,
            kernelType: 'openclaw',
          }),
        })
        const tokenResp = await fetchApi<TokenResponse>(`/api/agents/${remoteBuddy.id}/token`, {
          method: 'POST',
        })
        connection = await openClawApi.addBuddyConnection({
          id: crypto.randomUUID(),
          label: buddyName,
          serverUrl,
          apiToken: tokenResp.token,
          remoteAgentId: tokenResp.agent.id,
          agentId,
          autoConnect,
        })
      } else {
        // Bind to existing remote buddy
        if (!selectedBuddy) throw new Error('No buddy selected')
        const tokenResp = await fetchApi<TokenResponse>(`/api/agents/${selectedBuddy.id}/token`, {
          method: 'POST',
        })
        const buddyName =
          selectedBuddy.botUser?.displayName ?? selectedBuddy.botUser?.username ?? 'Buddy'
        connection = await openClawApi.addBuddyConnection({
          id: crypto.randomUUID(),
          label: buddyName,
          serverUrl,
          apiToken: tokenResp.token,
          remoteAgentId: tokenResp.agent.id,
          agentId,
          autoConnect,
        })
      }
      onSave(connection)
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : t('openclaw.buddy.configError', '配置连接失败')
      setError(errMsg)
      onError?.(errMsg)
    } finally {
      setSaving(false)
    }
  }

  const canSave = mode === 'create' ? !!agentId : !!selectedBuddy && !!agentId

  return (
    <div className={`space-y-6 ${className}`}>
      {showTitle && (
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-text-primary">
            {t('openclaw.buddy.addConnection', '添加 Buddy 连接')}
          </h2>
          <p className="text-sm text-text-muted">
            {t('openclaw.buddy.addDesc2', '创建新的 Buddy 或关联已有的 Buddy')}
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      {/* Mode Tabs */}
      <div className="flex gap-2 p-1 rounded-lg bg-bg-tertiary/50">
        <button
          type="button"
          onClick={() => {
            setMode('create')
            setSelectedBuddy(null)
          }}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition cursor-pointer ${
            mode === 'create'
              ? 'bg-bg-secondary text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Plus size={14} className="inline mr-1.5" />
          {t('openclaw.buddy.modeCreate', '创建新 Buddy')}
        </button>
        <button
          type="button"
          onClick={() => setMode('bind')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition cursor-pointer ${
            mode === 'bind'
              ? 'bg-bg-secondary text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Users size={14} className="inline mr-1.5" />
          {t('openclaw.buddy.modeBind', '关联已有 Buddy')}
        </button>
      </div>

      {/* Bind mode: Select existing Buddy */}
      {mode === 'bind' && (
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
                  {t('openclaw.buddy.noBuddies', '未找到 Buddy。请先在虾豆账户中创建一个 Buddy。')}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
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
      )}

      {/* Create mode: info hint */}
      {mode === 'create' && (
        <section>
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <p className="text-sm text-text-primary">
              {t(
                'openclaw.buddy.createHint',
                '将在云端创建一个与本地智能体同名的 Buddy，并自动关联。',
              )}
            </p>
          </div>
        </section>
      )}

      {/* Agent Binding */}
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
            <button
              type="button"
              role="switch"
              aria-checked={autoConnect}
              onClick={() => setAutoConnect(!autoConnect)}
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
            </button>
          </div>
        </div>
      </section>

      {/* Connection diagram */}
      {(mode === 'bind' ? selectedBuddy : agentId) && (
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
                  {mode === 'bind' && selectedBuddy?.botUser?.avatarUrl ? (
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
                  {mode === 'bind'
                    ? (selectedBuddy?.botUser?.displayName ?? 'Buddy')
                    : (agents.find((a) => a.id === agentId)?.name ?? 'Buddy')}
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

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave || saving}
        className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Link size={16} />}
        {t('openclaw.buddy.save', '连接')}
      </button>
    </div>
  )
}
