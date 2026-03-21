/**
 * Agents Management Page
 *
 * Create, edit, and manage AI agents aligned with the real OpenClaw agent schema.
 * Each agent has: id, name, model (provider/model), skills, identity, workspace.
 */

import {
  ArrowRight,
  Bot,
  Check,
  Cloud,
  CloudOff,
  FileText,
  FolderOpen,
  Link,
  Loader2,
  Plus,
  Save,
  Trash2,
  Unlink,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAutoSave } from '../../hooks/use-auto-save'
import { fetchApi } from '../../lib/api'
import type {
  AgentConfig,
  BootstrapFileInfo,
  BootstrapFileName,
  BuddyConnection,
  ModelProviderEntry,
  SkillManifest,
} from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import type { NavContext } from './index'
import type { OpenClawPage } from './openclaw-layout'
import { OpenClawButton, OpenClawSplitLayout } from './openclaw-ui'

function getModelDisplay(model?: AgentConfig['model']): string {
  if (!model) return ''
  if (typeof model === 'string') return model
  return model.primary ?? ''
}

export function AgentsPage({
  onNavigate,
}: {
  onNavigate: (page: OpenClawPage, ctx?: NavContext) => void
}) {
  const { t } = useTranslation()
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [providers, setProviders] = useState<Record<string, ModelProviderEntry>>({})
  const [skills, setSkills] = useState<SkillManifest[]>([])
  const [buddyConnections, setBuddyConnections] = useState<BuddyConnection[]>([])
  const [editAgent, setEditAgent] = useState<AgentConfig | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    agent: AgentConfig
  } | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [ag, md, sk, conns] = await Promise.all([
        openClawApi.listAgents(),
        openClawApi.listModels(),
        openClawApi.listSkills(),
        openClawApi.listBuddyConnections().catch(() => [] as BuddyConnection[]),
      ])
      setAgents(ag)
      setProviders(md)
      setSkills(sk)
      setBuddyConnections(conns)
    } catch {
      // Ignore
    }
  }, [])

  useEffect(() => {
    if (openClawApi.isAvailable) loadData()
  }, [loadData])

  // Auto-select first agent if none selected
  useEffect(() => {
    if (!editAgent && agents.length > 0) {
      setEditAgent(agents[0]!)
    }
  }, [editAgent, agents])

  const handleDelete = async (agentId: string) => {
    await openClawApi.deleteAgent(agentId)
    setEditAgent(null)
    await loadData()
  }

  const handleCreate = async () => {
    const id = `agent-${Date.now()}`
    const newAgent: AgentConfig = { id, name: '新龙虾', agentDir: id }
    await openClawApi.createAgent(newAgent)
    await loadData()
    // Select the newly created agent
    const refreshed = await openClawApi.listAgents()
    const created = refreshed.find((a) => a.id === id)
    if (created) {
      setAgents(refreshed)
      setEditAgent(created)
    }
  }

  const handleDuplicate = async (agent: AgentConfig) => {
    const id = `agent-${Date.now()}`
    const dup: AgentConfig = {
      ...agent,
      id,
      name: `${agent.name || agent.id} (${t('openclaw.agents.copy', '副本')})`,
      agentDir: id,
    }
    await openClawApi.createAgent(dup)
    await loadData()
    const refreshed = await openClawApi.listAgents()
    const created = refreshed.find((a) => a.id === id)
    if (created) {
      setAgents(refreshed)
      setEditAgent(created)
    }
  }

  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [contextMenu])

  return (
    <OpenClawSplitLayout
      sidebar={
        <div className="h-full min-h-0 flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-bg-tertiary flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">龙虾 (Claw)</h3>
              <p className="text-xs text-text-muted mt-0.5">左侧选择龙虾，右侧编辑配置</p>
            </div>
            <OpenClawButton
              type="button"
              onClick={handleCreate}
              variant="subtle"
              size="icon"
              title="创建龙虾"
            >
              <Plus size={14} />
            </OpenClawButton>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            {agents.map((agent: AgentConfig) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => {
                  setEditAgent(agent)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, agent })
                }}
                className={`w-full text-left px-3 py-2 rounded-lg border transition ${
                  editAgent?.id === agent.id
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-bg-tertiary hover:border-primary/20'
                }`}
              >
                <p className="text-sm font-medium text-text-primary truncate">
                  {agent.name || agent.id}
                </p>
                <p className="text-[11px] text-text-muted truncate">
                  {getModelDisplay(agent.model) || t('openclaw.agents.noModel', '未配置模型')}
                </p>
              </button>
            ))}
            {contextMenu && (
              <div
                className="fixed z-50 min-w-[140px] py-1 rounded-lg bg-bg-secondary border border-bg-tertiary shadow-xl"
                style={{ top: contextMenu.y, left: contextMenu.x }}
              >
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition"
                  onClick={() => {
                    handleDuplicate(contextMenu.agent)
                    setContextMenu(null)
                  }}
                >
                  {t('openclaw.agents.duplicate', '复制')}
                </button>
                <div className="my-1 border-t border-bg-tertiary" />
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition"
                  onClick={() => {
                    handleDelete(contextMenu.agent.id)
                    setContextMenu(null)
                  }}
                >
                  {t('openclaw.agents.delete', '删除')}
                </button>
              </div>
            )}
          </div>
        </div>
      }
      content={
        <div className="h-full min-h-0 overflow-y-auto">
          {editAgent ? (
            <AgentEditor
              key={editAgent.id}
              agent={editAgent}
              providers={providers}
              skills={skills}
              buddyConnections={buddyConnections}
              onNavigate={onNavigate}
              onSave={async () => {
                await loadData()
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <p className="text-sm text-text-muted">
                {agents.length === 0 ? '暂无龙虾' : '请从列表中选择一个龙虾'}
              </p>
              {agents.length === 0 && (
                <OpenClawButton type="button" onClick={handleCreate} className="mt-3">
                  <Plus size={14} />
                  创建龙虾
                </OpenClawButton>
              )}
            </div>
          )}
        </div>
      }
    />
  )
}

// ─── Agent Editor ────────────────────────────────────────────────────────────

function flattenModelOptions(providers: Record<string, ModelProviderEntry>): string[] {
  const options: string[] = []
  for (const [pid, entry] of Object.entries(providers)) {
    for (const m of entry.models) {
      options.push(`${pid}/${m.id}`)
    }
  }
  return options
}

function AgentEditor({
  agent,
  providers,
  skills,
  buddyConnections,
  onNavigate,
  onSave,
}: {
  agent: AgentConfig
  providers: Record<string, ModelProviderEntry>
  skills: SkillManifest[]
  buddyConnections: BuddyConnection[]
  onNavigate: (page: OpenClawPage, ctx?: NavContext) => void
  onSave: () => void
}) {
  const { t } = useTranslation()

  const [agentId] = useState(agent.id)
  const [name, setName] = useState(agent.name ?? '')
  const [workspace, setWorkspace] = useState(agent.workspace ?? '')
  const [model, setModel] = useState(() => getModelDisplay(agent.model))
  const [selectedSkills, setSelectedSkills] = useState<string[]>(agent.skills ?? [])
  const [persona, setPersona] = useState('')
  const [saving, setSaving] = useState(false)

  // Bootstrap file state
  const [bootstrapFiles, setBootstrapFiles] = useState<BootstrapFileInfo[]>([])
  const [activeFile, setActiveFile] = useState<BootstrapFileName | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [fileDirty, setFileDirty] = useState(false)
  const [fileSaving, setFileSaving] = useState(false)

  // Memory & advanced config
  const [memoryEnabled, setMemoryEnabled] = useState(!!agent.memorySearch)
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(!!agent.heartbeat)

  // Tab state for editor sections
  const [editorTab, setEditorTab] = useState<'basic' | 'advanced'>('basic')

  // Buddy connection for this agent
  const buddyConn = buddyConnections.find((c) => c.agentId === agent.id)

  const modelOptions = useMemo(() => flattenModelOptions(providers), [providers])

  // Load bootstrap files
  useEffect(() => {
    if (agent.id) {
      openClawApi
        .listBootstrapFiles(agent.id)
        .then(setBootstrapFiles)
        .catch(() => {})
      openClawApi
        .readBootstrapFile(agent.id, 'SOUL.md')
        .then((content) => {
          setPersona((content ?? '').trim())
        })
        .catch(() => {
          setPersona('')
        })
    }
  }, [agent.id])

  // Load file content when selecting a bootstrap file
  useEffect(() => {
    if (!activeFile || !agent.id) return
    openClawApi
      .readBootstrapFile(agent.id, activeFile)
      .then((content) => {
        setFileContent(content ?? '')
        setFileDirty(false)
      })
      .catch(() => {
        setFileContent('')
        setFileDirty(false)
      })
  }, [activeFile, agent.id])

  const handleSaveFile = async () => {
    if (!activeFile || !agent.id) return
    setFileSaving(true)
    try {
      await openClawApi.writeBootstrapFile(agent.id, activeFile, fileContent)
      setFileDirty(false)
      // Refresh file list
      const files = await openClawApi.listBootstrapFiles(agent.id)
      setBootstrapFiles(files)
    } finally {
      setFileSaving(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const autoIdentityName = (name || agent.name || agentId).trim() || agentId
      const data: AgentConfig = {
        id: agentId,
        ...(name && { name }),
        ...(workspace && { workspace }),
        ...(model && { model: { primary: model } }),
        ...(selectedSkills.length > 0 && { skills: selectedSkills }),
        identity: {
          ...(agent.identity ?? {}),
          name: autoIdentityName,
        },
        ...(memoryEnabled && { memorySearch: agent.memorySearch ?? { enabled: true } }),
        ...(!memoryEnabled && agent.memorySearch && { memorySearch: undefined }),
        ...(heartbeatEnabled && {
          heartbeat: agent.heartbeat ?? { enabled: true, intervalMs: 60000 },
        }),
        ...(!heartbeatEnabled && agent.heartbeat && { heartbeat: undefined }),
      }
      await openClawApi.updateAgent(agentId, data)
      await openClawApi.writeBootstrapFile(agentId, 'SOUL.md', persona.trim())
      // Sync name/persona to cloud buddy (best-effort)
      if (buddyConn?.remoteAgentId) {
        fetchApi(`/api/agents/${buddyConn.remoteAgentId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: autoIdentityName,
            ...(persona.trim() ? { description: persona.trim() } : {}),
          }),
        }).catch(() => {})
      }
      onSave()
    } finally {
      setSaving(false)
    }
  }

  // ── Auto-save: debounce agent config changes ──
  const autoSaveFn = useCallback(async () => {
    const autoIdentityName = (name || agent.name || agentId).trim() || agentId
    const data: AgentConfig = {
      id: agentId,
      ...(name && { name }),
      ...(workspace && { workspace }),
      ...(model && { model: { primary: model } }),
      ...(selectedSkills.length > 0 && { skills: selectedSkills }),
      identity: { ...(agent.identity ?? {}), name: autoIdentityName },
      ...(memoryEnabled && { memorySearch: agent.memorySearch ?? { enabled: true } }),
      ...(!memoryEnabled && agent.memorySearch && { memorySearch: undefined }),
      ...(heartbeatEnabled && {
        heartbeat: agent.heartbeat ?? { enabled: true, intervalMs: 60000 },
      }),
      ...(!heartbeatEnabled && agent.heartbeat && { heartbeat: undefined }),
    }
    await openClawApi.updateAgent(agentId, data)
    await openClawApi.writeBootstrapFile(agentId, 'SOUL.md', persona.trim())
    // Sync name/persona to cloud buddy (best-effort)
    if (buddyConn?.remoteAgentId) {
      fetchApi(`/api/agents/${buddyConn.remoteAgentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: autoIdentityName,
          ...(persona.trim() ? { description: persona.trim() } : {}),
        }),
      }).catch(() => {})
    }
    onSave()
  }, [
    agentId,
    name,
    workspace,
    model,
    selectedSkills,
    persona,
    memoryEnabled,
    heartbeatEnabled,
    agent,
    buddyConn,
    onSave,
  ])
  const { autoSaveStatus, scheduleAutoSave } = useAutoSave(autoSaveFn, 1500)

  // Trigger auto-save on field changes (skip initial render)
  const initialRender = useMemo(() => ({ current: true }), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional watch pattern – auto-save triggers on field changes
  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false
      return
    }
    scheduleAutoSave()
  }, [
    name,
    workspace,
    model,
    selectedSkills,
    persona,
    memoryEnabled,
    heartbeatEnabled,
    scheduleAutoSave,
  ])

  // ── Auto-save: debounce bootstrap file changes ──
  const autoSaveFileFn = useCallback(async () => {
    if (!activeFile || !agent.id) return
    await openClawApi.writeBootstrapFile(agent.id, activeFile, fileContent)
    setFileDirty(false)
    const files = await openClawApi.listBootstrapFiles(agent.id)
    setBootstrapFiles(files)
  }, [activeFile, agent.id, fileContent])
  const { autoSaveStatus: fileAutoSaveStatus, scheduleAutoSave: scheduleFileAutoSave } =
    useAutoSave(autoSaveFileFn, 1500)

  // Trigger file auto-save when content changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional watch pattern – auto-save triggers on content changes
  useEffect(() => {
    if (fileDirty) {
      scheduleFileAutoSave()
    }
  }, [fileDirty, fileContent, scheduleFileAutoSave])

  const BOOTSTRAP_LABELS: Record<BootstrapFileName, { label: string; desc: string }> = {
    'AGENTS.md': { label: 'AGENTS', desc: '智能体路由与多智能体配置' },
    'SOUL.md': { label: 'SOUL', desc: '核心人格与行为准则' },
    'IDENTITY.md': { label: 'IDENTITY', desc: '名称、角色和公开形象' },
    'TOOLS.md': { label: 'TOOLS', desc: '工具使用说明与限制' },
    'USER.md': { label: 'USER', desc: '用户上下文与偏好' },
    'HEARTBEAT.md': { label: 'HEARTBEAT', desc: '周期任务与健康检查配置' },
    'BOOT.md': { label: 'BOOT', desc: '启动初始化流程' },
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-5 pb-6 max-w-4xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-text-primary">编辑龙虾</h2>
            {autoSaveStatus === 'pending' && (
              <span className="text-[10px] text-text-muted">未保存</span>
            )}
            {autoSaveStatus === 'saving' && (
              <span className="text-[10px] text-text-muted flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" /> 保存中...
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="text-[10px] text-green-400 flex items-center gap-1">
                <Check size={10} /> 已自动保存
              </span>
            )}
          </div>
          <OpenClawButton type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {t('common.save', '保存')}
          </OpenClawButton>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 p-1 bg-bg-secondary rounded-lg border border-bg-tertiary">
          {(['basic', 'advanced'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setEditorTab(tab)}
              className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                editorTab === tab
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab === 'basic' && t('openclaw.agents.tabBasic', '基本')}
              {tab === 'advanced' && t('openclaw.agents.tabAdvanced', '高级')}
            </button>
          ))}
        </div>

        {/* Basic tab */}
        {editorTab === 'basic' && (
          <div className="space-y-6">
            {/* Identity */}
            <section>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                {t('openclaw.agents.identity', '身份')}
              </h3>
              <div className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    {t('openclaw.agents.agentName', '显示名称')}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('openclaw.agents.namePlaceholder', '例如：主助手')}
                    className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    {t('openclaw.agents.persona', '设定')}
                  </label>
                  <textarea
                    rows={6}
                    value={persona}
                    onChange={(e) => setPersona(e.target.value)}
                    placeholder={t(
                      'openclaw.agents.personaPlaceholder',
                      '描述该智能体的人设与行为偏好，将自动同步到 SOUL.md',
                    )}
                    className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition resize-y"
                  />
                </div>
              </div>
            </section>

            {/* Skills */}
            <section>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                {t('openclaw.agents.skills', '技能')}
              </h3>
              <div className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4">
                {skills.length === 0 ? (
                  <p className="text-xs text-text-muted italic">
                    {t('openclaw.agents.noSkillsAvailable', '暂无已安装的技能，请从技能库安装')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {skills
                      .filter((s) => s.enabled)
                      .map((skill) => {
                        const checked = selectedSkills.includes(skill.name)
                        return (
                          <label
                            key={skill.name}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-tertiary/50 cursor-pointer transition"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                if (checked) {
                                  setSelectedSkills(
                                    selectedSkills.filter((s: string) => s !== skill.name),
                                  )
                                } else {
                                  setSelectedSkills([...selectedSkills, skill.name])
                                }
                              }}
                              className="accent-primary"
                            />
                            <span className="text-sm text-text-primary">{skill.displayName}</span>
                            <span className="text-[10px] text-text-muted ml-auto font-mono">
                              {skill.name}
                            </span>
                          </label>
                        )
                      })}
                  </div>
                )}
              </div>
            </section>

            {/* Cloud Connection */}
            <section>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                云端连接
              </h3>
              <div className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4">
                {buddyConn ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          buddyConn.status === 'connected'
                            ? 'bg-green-500/10 text-green-500'
                            : buddyConn.status === 'error'
                              ? 'bg-red-500/10 text-red-500'
                              : 'bg-bg-tertiary text-text-muted'
                        }`}
                      >
                        {buddyConn.status === 'connected' ? (
                          <Cloud size={16} />
                        ) : (
                          <CloudOff size={16} />
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-text-primary font-medium">{buddyConn.label}</p>
                        <p className="text-[10px] text-text-muted">
                          {buddyConn.status === 'connected'
                            ? '已连接 · 名称与设定将自动同步'
                            : buddyConn.status === 'error'
                              ? `连接错误${buddyConn.error ? `: ${buddyConn.error}` : ''}`
                              : '未连接'}
                        </p>
                      </div>
                    </div>
                    <OpenClawButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await openClawApi.removeBuddyConnection(buddyConn.id)
                        onSave()
                      }}
                    >
                      <Unlink size={12} />
                      解除关联
                    </OpenClawButton>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex items-center justify-between w-full text-left cursor-pointer group"
                    onClick={() =>
                      onNavigate('buddy', {
                        initialAgentId: agent.id,
                        returnTo: 'agents',
                      })
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-tertiary text-text-muted">
                        <CloudOff size={16} />
                      </div>
                      <div>
                        <p className="text-sm text-text-secondary group-hover:text-primary transition-colors">
                          连接到云端
                        </p>
                        <p className="text-[10px] text-text-muted">
                          创建 Buddy 连接，加入虾豆频道协作
                        </p>
                      </div>
                    </div>
                    <ArrowRight
                      size={14}
                      className="text-text-muted group-hover:text-primary transition-colors"
                    />
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

        {/* Bootstrap files are managed in advanced settings */}
        {editorTab === 'advanced' && (
          <div className="space-y-4">
            {/* Model */}
            <section>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                {t('openclaw.agents.modelConfig', '模型')}
              </h3>
              <div className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    {t('openclaw.agents.primaryModel', '主要模型')}
                  </label>
                  {modelOptions.length > 0 ? (
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-bg-tertiary text-sm text-text-primary focus:outline-none focus:border-primary/50 transition"
                    >
                      <option value="">{t('openclaw.agents.selectModel', '选择模型...')}</option>
                      {modelOptions.map((m: string) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="provider/model-name"
                      className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition font-mono"
                    />
                  )}
                  <p className="text-[10px] text-text-muted mt-1">
                    {t('openclaw.agents.modelHint', '格式：提供商/模型ID，例如 openai/gpt-4o')}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    {t('openclaw.agents.workspace', '工作空间路径')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={workspace}
                      onChange={(e) => setWorkspace(e.target.value)}
                      placeholder="~/.shadowob/workspace"
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-bg-primary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition font-mono"
                    />
                    <OpenClawButton
                      type="button"
                      variant="subtle"
                      onClick={async () => {
                        const picked = await openClawApi.pickDirectory(workspace || agent.workspace)
                        if (picked) setWorkspace(picked)
                      }}
                    >
                      <FolderOpen size={14} />
                      {t('common.select', '选择')}
                    </OpenClawButton>
                  </div>
                </div>
              </div>
            </section>

            {/* Bootstrap Files */}
            <p className="text-sm text-text-muted">
              {t(
                'openclaw.agents.bootstrapDesc',
                '编辑智能体引导文件，定义人格、身份、工具和行为。',
              )}
            </p>

            <div className="flex gap-2 flex-wrap">
              {bootstrapFiles.map(({ fileName, exists }) => {
                const info = BOOTSTRAP_LABELS[fileName]
                return (
                  <button
                    key={fileName}
                    type="button"
                    onClick={() => setActiveFile(activeFile === fileName ? null : fileName)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                      activeFile === fileName
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : exists
                          ? 'bg-bg-secondary border-bg-tertiary text-text-primary hover:border-primary/30'
                          : 'bg-bg-secondary border-bg-tertiary text-text-muted border-dashed hover:border-primary/30'
                    }`}
                  >
                    <FileText size={12} />
                    {info?.label ?? fileName}
                    {!exists && <span className="text-[9px] opacity-60">+</span>}
                  </button>
                )
              })}
            </div>

            {activeFile && (
              <div className="bg-bg-secondary rounded-xl border border-bg-tertiary overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-bg-tertiary">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{activeFile}</p>
                    <p className="text-[10px] text-text-muted">
                      {BOOTSTRAP_LABELS[activeFile]?.desc}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {fileAutoSaveStatus === 'saving' && (
                      <span className="text-[10px] text-text-muted flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" /> 保存中
                      </span>
                    )}
                    {fileAutoSaveStatus === 'saved' && (
                      <span className="text-[10px] text-green-400 flex items-center gap-1">
                        <Check size={10} /> 已保存
                      </span>
                    )}
                    <OpenClawButton
                      type="button"
                      onClick={handleSaveFile}
                      disabled={!fileDirty || fileSaving}
                      size="sm"
                    >
                      {fileSaving ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Save size={12} />
                      )}
                      {t('common.save', '保存')}
                    </OpenClawButton>
                  </div>
                </div>
                <textarea
                  value={fileContent}
                  onChange={(e) => {
                    setFileContent(e.target.value)
                    setFileDirty(true)
                  }}
                  placeholder={`# ${activeFile}\n\n在此编写 ${BOOTSTRAP_LABELS[activeFile]?.label} 内容...`}
                  className="w-full h-64 px-4 py-3 bg-bg-primary text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none resize-y"
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        )}

        {/* Advanced tab (edit mode only) */}
        {editorTab === 'advanced' && (
          <div className="space-y-6">
            {/* Memory Search */}
            <section>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                {t('openclaw.agents.memorySearch', '记忆搜索')}
              </h3>
              <div className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {t('openclaw.agents.enableMemory', '启用记忆搜索')}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      {t('openclaw.agents.memoryHint', '允许智能体搜索和回忆过去的对话')}
                    </p>
                  </div>
                  <ToggleSwitch checked={memoryEnabled} onChange={setMemoryEnabled} />
                </div>
              </div>
            </section>

            {/* Heartbeat */}
            <section>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                {t('openclaw.agents.heartbeat', '心跳')}
              </h3>
              <div className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {t('openclaw.agents.enableHeartbeat', '启用心跳')}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      {t('openclaw.agents.heartbeatHint', '周期任务与主动智能体行为')}
                    </p>
                  </div>
                  <ToggleSwitch checked={heartbeatEnabled} onChange={setHeartbeatEnabled} />
                </div>
              </div>
            </section>

            {/* Runtime info */}
            <section>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                {t('openclaw.agents.info', '智能体信息')}
              </h3>
              <div className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4 space-y-2">
                <InfoRow label="智能体 ID" value={agent?.id ?? ''} mono />
                {agent?.agentDir && <InfoRow label="智能体目录" value={agent.agentDir} mono />}
                {agent?.workspace && <InfoRow label="工作空间" value={agent.workspace} mono />}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared Components ──────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onChange(!checked)
        }
      }}
      className={`relative cursor-pointer transition-colors rounded-full ${
        checked ? 'bg-primary' : 'bg-bg-tertiary'
      }`}
      style={{ width: 40, height: 22 }}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : ''
        }`}
      />
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`text-xs text-text-primary truncate ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}
