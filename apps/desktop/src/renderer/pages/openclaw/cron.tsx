/**
 * Cron Task Manager Page
 *
 * Create, edit, and manage individual scheduled tasks (cron jobs).
 * System-level settings (enabled, max concurrent, retry, etc.) are accessible via a collapsible settings panel.
 */

import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Pause,
  Play,
  Plus,
  Save,
  Settings2,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAutoSave } from '../../hooks/use-auto-save'
import type { AgentConfig, CronConfig, CronSchedule, CronTask } from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import { OpenClawButton, OpenClawSplitLayout } from './openclaw-ui'

// ─── Main Page ──────────────────────────────────────────────────────────────

export function CronPage() {
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<CronTask[]>([])
  const [config, setConfig] = useState<CronConfig>({})
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [editTask, setEditTask] = useState<CronTask | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: CronTask } | null>(
    null,
  )

  const loadData = useCallback(async () => {
    try {
      const [t, c, a] = await Promise.all([
        openClawApi.listCronTasks(),
        openClawApi.getCronConfig(),
        openClawApi.listAgents(),
      ])
      setTasks(t)
      setConfig(c ?? {})
      setAgents(a)
      setLoaded(true)
    } catch {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (openClawApi.isAvailable) loadData()
  }, [loadData])

  // Auto-select first task if none selected
  useEffect(() => {
    if (!editTask && tasks.length > 0) {
      setEditTask(tasks[0]!)
    }
  }, [editTask, tasks])

  const handleDelete = async (id: string) => {
    await openClawApi.deleteCronTask(id)
    if (editTask?.id === id) setEditTask(null)
    await loadData()
  }

  const handleToggle = async (task: CronTask) => {
    await openClawApi.saveCronTask({ ...task, enabled: !task.enabled })
    await loadData()
  }

  const handleCreate = async () => {
    const newTask = await openClawApi.saveCronTask({
      name: t('openclaw.cron.newTask', '新任务'),
      enabled: true,
      schedule: { kind: 'cron', expr: '0 * * * *' },
      payload: { kind: 'agentTurn', message: '' },
    })
    await loadData()
    if (newTask) {
      setEditTask(newTask)
    }
  }

  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [contextMenu])

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      await openClawApi.updateCronConfig(config)
      await loadData()
    } finally {
      setSavingConfig(false)
    }
  }

  const retryObj = (config.retry ?? {}) as Record<string, unknown>

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    )
  }

  return (
    <OpenClawSplitLayout
      sidebar={
        <div className="h-full min-h-0 overflow-y-auto shrink-0 flex flex-col">
          <div className="px-4 pt-4 pb-3 border-b border-bg-tertiary flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                {t('openclaw.cron.title', '定时任务')}
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                {t('openclaw.cron.subtitle', '管理调度任务')}
              </p>
            </div>
            <OpenClawButton
              type="button"
              onClick={handleCreate}
              variant="subtle"
              size="icon"
              title={t('openclaw.cron.createTask', '新建任务')}
            >
              <Plus size={14} />
            </OpenClawButton>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {tasks.length === 0 && (
              <div className="text-center py-8">
                <Calendar size={28} className="mx-auto text-text-muted/40 mb-2" />
                <p className="text-xs text-text-muted">
                  {t('openclaw.cron.noTasks', '暂无定时任务')}
                </p>
              </div>
            )}
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  setEditTask(task)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, task })
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition group ${
                  editTask?.id === task.id
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-bg-tertiary hover:border-primary/20'
                } ${!task.enabled ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${task.enabled ? 'bg-green-500' : 'bg-neutral-400'}`}
                  />
                  <p className="text-sm font-medium text-text-primary truncate flex-1">
                    {task.name}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggle(task)
                    }}
                    className="opacity-0 group-hover:opacity-100 transition p-0.5 cursor-pointer"
                    title={task.enabled ? '暂停' : '恢复'}
                  >
                    {task.enabled ? (
                      <Pause size={12} className="text-text-muted" />
                    ) : (
                      <Play size={12} className="text-text-muted" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-text-muted mt-1 truncate">
                  {formatScheduleLabel(task.schedule)}
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
                    handleToggle(contextMenu.task)
                    setContextMenu(null)
                  }}
                >
                  {contextMenu.task.enabled
                    ? t('openclaw.cron.pause', '暂停')
                    : t('openclaw.cron.resume', '恢复')}
                </button>
                <div className="my-1 border-t border-bg-tertiary" />
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition"
                  onClick={() => {
                    handleDelete(contextMenu.task.id!)
                    setContextMenu(null)
                  }}
                >
                  {t('openclaw.cron.delete', '删除')}
                </button>
              </div>
            )}
          </div>

          {/* ─── System Settings (collapsible) ─────────────────────── */}
          <div className="border-t border-bg-tertiary">
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="w-full px-4 py-2.5 flex items-center gap-2 text-xs font-medium text-text-muted hover:text-text-primary transition"
            >
              <Settings2 size={12} />
              {t('openclaw.cron.systemSettings', '系统设置')}
              {showSettings ? (
                <ChevronDown size={12} className="ml-auto" />
              ) : (
                <ChevronRight size={12} className="ml-auto" />
              )}
            </button>
            {showSettings && (
              <div className="px-4 pb-4 space-y-3">
                {/* Enabled */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-primary">
                    {t('openclaw.cron.enabled', '启用调度器')}
                  </span>
                  <div
                    role="switch"
                    aria-checked={config.enabled ?? false}
                    tabIndex={0}
                    onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setConfig({ ...config, enabled: !config.enabled })
                      }
                    }}
                    className={`relative cursor-pointer transition-colors rounded-full ${config.enabled ? 'bg-primary' : 'bg-bg-tertiary'}`}
                    style={{ width: 36, height: 20 }}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.enabled ? 'translate-x-4' : ''}`}
                    />
                  </div>
                </div>
                {/* Max Concurrent */}
                <div>
                  <label
                    htmlFor="cron-max-concurrent"
                    className="block text-xs text-text-muted mb-1"
                  >
                    {t('openclaw.cron.maxConcurrent', '最大并发')}
                  </label>
                  <input
                    id="cron-max-concurrent"
                    type="number"
                    min={1}
                    max={100}
                    value={config.maxConcurrentRuns ?? ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        maxConcurrentRuns: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    placeholder="5"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition font-mono"
                  />
                </div>
                {/* Webhook */}
                <div>
                  <label htmlFor="cron-webhook" className="block text-xs text-text-muted mb-1">
                    {t('openclaw.cron.webhook', 'Webhook 地址')}
                  </label>
                  <input
                    id="cron-webhook"
                    type="url"
                    value={config.webhook ?? ''}
                    onChange={(e) => setConfig({ ...config, webhook: e.target.value || undefined })}
                    placeholder="https://..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition font-mono"
                  />
                </div>
                {/* Retry */}
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
                >
                  <div>
                    <label htmlFor="cron-retry-max" className="block text-xs text-text-muted mb-1">
                      {t('openclaw.cron.retryMaxAttempts', '最大重试')}
                    </label>
                    <input
                      id="cron-retry-max"
                      type="number"
                      min={0}
                      max={10}
                      value={(retryObj.maxAttempts as number) ?? ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          retry: {
                            ...retryObj,
                            maxAttempts: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                      placeholder="3"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition font-mono"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cron-retry-delay"
                      className="block text-xs text-text-muted mb-1"
                    >
                      {t('openclaw.cron.retryDelay', '延迟 (ms)')}
                    </label>
                    <input
                      id="cron-retry-delay"
                      type="number"
                      min={0}
                      value={(retryObj.delay as number) ?? ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          retry: {
                            ...retryObj,
                            delay: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                      placeholder="1000"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition font-mono"
                    />
                  </div>
                </div>
                {/* Session Retention */}
                <div>
                  <label
                    htmlFor="cron-session-retention"
                    className="block text-xs text-text-muted mb-1"
                  >
                    {t('openclaw.cron.sessionRetention', '会话保留')}
                  </label>
                  <input
                    id="cron-session-retention"
                    type="text"
                    value={config.sessionRetention === false ? '' : (config.sessionRetention ?? '')}
                    onChange={(e) =>
                      setConfig({ ...config, sessionRetention: e.target.value || undefined })
                    }
                    placeholder="7d"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition font-mono"
                  />
                </div>
                <OpenClawButton
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="w-full"
                  size="sm"
                >
                  {savingConfig ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Save size={12} />
                  )}
                  {t('common.save', '保存')}
                </OpenClawButton>
              </div>
            )}
          </div>
        </div>
      }
      content={
        <div className="h-full min-h-0 overflow-y-auto">
          {editTask ? (
            <CronTaskEditor
              key={editTask.id}
              task={editTask}
              agents={agents}
              onSave={async () => {
                await loadData()
              }}
              onDelete={() => handleDelete(editTask.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <Clock size={36} className="text-text-muted/40 mb-3" />
              <p className="text-sm text-text-muted">
                {tasks.length === 0
                  ? t('openclaw.cron.noTasks', '暂无定时任务')
                  : t('openclaw.cron.selectHint', '请从列表中选择一个任务')}
              </p>
              {tasks.length === 0 && (
                <OpenClawButton type="button" onClick={handleCreate} className="mt-3">
                  <Plus size={14} />
                  {t('openclaw.cron.createTask', '新建任务')}
                </OpenClawButton>
              )}
            </div>
          )}
        </div>
      }
    />
  )
}

// ─── Task Editor ────────────────────────────────────────────────────────────

function CronTaskEditor({
  task,
  agents,
  onSave,
  onDelete,
}: {
  task: CronTask
  agents: AgentConfig[]
  onSave: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(task.name ?? '')
  const [enabled, setEnabled] = useState(task.enabled ?? true)
  const [agentId, setAgentId] = useState(task.agentId ?? '')
  const [note, setNote] = useState(
    task.payload.kind === 'agentTurn'
      ? (task.payload.message ?? '')
      : task.payload.kind === 'systemEvent'
        ? (task.payload.text ?? '')
        : '',
  )
  const [repeatMode, setRepeatMode] = useState<'once' | 'daily' | 'weekly' | 'custom'>(() => {
    const s = task.schedule
    if (s.kind === 'at') return 'once'
    if (s.kind === 'cron') {
      if (/^\d{1,2} \d{1,2} \* \* \*$/.test(s.expr ?? '')) return 'daily'
      if (/^\d{1,2} \d{1,2} \* \* [0-6](,[0-6])*$/.test(s.expr ?? '')) return 'weekly'
    }
    return 'custom'
  })
  const [timeOfDay, setTimeOfDay] = useState(() => {
    const s = task.schedule
    if (s.kind === 'cron') {
      const m = (s.expr ?? '').match(/^(\d{1,2}) (\d{1,2}) /)
      if (m)
        return `${String(Number(m[2])).padStart(2, '0')}:${String(Number(m[1])).padStart(2, '0')}`
    }
    return '09:00'
  })
  const [runAt, setRunAt] = useState(() => {
    if (task.schedule.kind === 'at') return task.schedule.at
    return new Date(Date.now() + 3600_000).toISOString().slice(0, 16)
  })
  const [weekdays, setWeekdays] = useState<number[]>(() => {
    if (task.schedule.kind === 'cron') {
      const m = (task.schedule.expr ?? '').match(/^\d{1,2} \d{1,2} \* \* ([0-6](?:,[0-6])*)$/)
      if (m?.[1])
        return m[1]
          .split(',')
          .map((x) => Number(x))
          .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6)
    }
    return [1, 2, 3, 4, 5]
  })
  const [customCron, setCustomCron] = useState(
    task.schedule.kind === 'cron' ? task.schedule.expr : '0 9 * * *',
  )
  const [saving, setSaving] = useState(false)

  const buildSchedule = useCallback((): CronSchedule => {
    const [hour, minute] = timeOfDay.split(':').map((x) => Number(x))
    if (repeatMode === 'once') return { kind: 'at', at: runAt }
    if (repeatMode === 'daily') return { kind: 'cron', expr: `${minute} ${hour} * * *` }
    if (repeatMode === 'weekly') {
      return {
        kind: 'cron',
        expr: `${minute} ${hour} * * ${(weekdays.length ? weekdays : [1]).join(',')}`,
      }
    }
    return { kind: 'cron', expr: (customCron ?? '').trim() || '0 9 * * *' }
  }, [timeOfDay, repeatMode, runAt, weekdays, customCron])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await openClawApi.saveCronTask({
        id: task.id,
        name: name.trim(),
        enabled,
        ...(agentId && { agentId }),
        schedule: buildSchedule(),
        payload: { kind: 'agentTurn', message: note },
      })
      onSave()
    } finally {
      setSaving(false)
    }
  }

  // ── Auto-save with debounce ──
  const autoSaveFn = useCallback(async () => {
    if (!name.trim()) return
    await openClawApi.saveCronTask({
      id: task.id,
      name: name.trim(),
      enabled,
      ...(agentId && { agentId }),
      schedule: buildSchedule(),
      payload: { kind: 'agentTurn', message: note },
    })
    onSave()
  }, [task.id, name, enabled, agentId, note, buildSchedule, onSave])
  const { autoSaveStatus, scheduleAutoSave } = useAutoSave(autoSaveFn, 1500)

  // Trigger auto-save on field changes (skip initial render)
  const initialRender = useMemo(() => ({ current: true }), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional watch pattern – auto-save triggers on field changes
  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false
      return
    }
    if (name.trim()) scheduleAutoSave()
  }, [
    name,
    enabled,
    agentId,
    note,
    repeatMode,
    timeOfDay,
    runAt,
    weekdays,
    customCron,
    scheduleAutoSave,
  ])

  return (
    <div className="px-6 pt-5 pb-8 max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-text-primary">编辑任务</h2>
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
        <div className="flex items-center gap-2">
          <OpenClawButton type="button" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存
          </OpenClawButton>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:text-red-500 hover:bg-red-500/10 transition"
              title="删除"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label
            htmlFor="cron-task-name"
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            任务名称
          </label>
          <input
            id="cron-task-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：早上提醒我查看日报"
            className="w-full px-3 py-2.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition"
          />
        </div>

        <div>
          <label
            htmlFor="cron-agent"
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            执行龙虾
          </label>
          <select
            id="cron-agent"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-sm text-text-primary focus:outline-none focus:border-primary/50 transition"
          >
            <option value="">默认龙虾</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.id}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-bg-tertiary pt-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Calendar size={14} />
            重复规则（像闹钟一样）
          </h3>
          <div className="flex gap-2 mb-3">
            {[
              { id: 'once' as const, label: '仅一次' },
              { id: 'daily' as const, label: '每天' },
              { id: 'weekly' as const, label: '每周' },
              { id: 'custom' as const, label: '自定义' },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setRepeatMode(mode.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  repeatMode === mode.id
                    ? 'bg-primary text-white'
                    : 'bg-bg-secondary border border-bg-tertiary text-text-muted hover:text-text-primary'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {repeatMode === 'once' && (
            <div>
              <label htmlFor="cron-run-at" className="block text-xs text-text-muted mb-1">
                执行时间
              </label>
              <input
                id="cron-run-at"
                type="datetime-local"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-bg-tertiary text-sm text-text-primary focus:outline-none focus:border-primary/50 transition"
                style={{ colorScheme: 'dark' }}
              />
            </div>
          )}

          {(repeatMode === 'daily' || repeatMode === 'weekly') && (
            <div>
              <label htmlFor="cron-time-of-day" className="block text-xs text-text-muted mb-1">
                每天执行时间
              </label>
              <input
                id="cron-time-of-day"
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-bg-tertiary text-sm text-text-primary focus:outline-none focus:border-primary/50 transition"
                style={{ colorScheme: 'dark' }}
              />
            </div>
          )}

          {repeatMode === 'weekly' && (
            <div>
              <label htmlFor="cron-weekdays" className="block text-xs text-text-muted mb-2">
                每周重复日
              </label>
              <div className="flex gap-2 flex-wrap">
                {['日', '一', '二', '三', '四', '五', '六'].map((label, idx) => {
                  const selected = weekdays.includes(idx)
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() =>
                        setWeekdays((prev) =>
                          selected
                            ? prev.filter((x) => x !== idx)
                            : [...prev, idx].sort((a, b) => a - b),
                        )
                      }
                      className={`w-9 h-9 rounded-full text-xs font-semibold transition ${selected ? 'bg-primary text-white' : 'bg-bg-secondary border border-bg-tertiary text-text-muted hover:text-text-primary'}`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {repeatMode === 'custom' && (
            <div>
              <label htmlFor="cron-custom-expr" className="block text-xs text-text-muted mb-1">
                高级 Cron（可选）
              </label>
              <input
                id="cron-custom-expr"
                type="text"
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
                placeholder="0 9 * * 1,2,3,4,5"
                className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition font-mono"
              />
            </div>
          )}
        </div>

        <div className="border-t border-bg-tertiary pt-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">提醒内容</h3>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="例如：提醒我 9 点检查团队消息并输出重点"
            className="w-full px-3 py-2.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 transition resize-none"
          />
        </div>

        <div className="border-t border-bg-tertiary pt-5 flex items-center justify-between">
          <span className="text-sm text-text-primary">启用此提醒</span>
          <div
            role="switch"
            aria-checked={enabled}
            tabIndex={0}
            onClick={() => setEnabled(!enabled)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setEnabled(!enabled)
              }
            }}
            className={`relative cursor-pointer transition-colors rounded-full ${enabled ? 'bg-primary' : 'bg-bg-tertiary'}`}
            style={{ width: 40, height: 22 }}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-[18px]' : ''}`}
            />
          </div>
        </div>

        {/* State info */}
        {task.state && (
          <div className="border-t border-bg-tertiary pt-5">
            <h3 className="text-xs font-semibold text-text-muted mb-2 uppercase tracking-wider">
              执行状态
            </h3>
            <div
              className="grid gap-2 text-xs"
              style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
            >
              {task.state.lastRunAtMs && (
                <div className="bg-bg-secondary rounded-lg px-3 py-2">
                  <p className="text-text-muted">上次运行</p>
                  <p className="text-text-primary font-mono">
                    {new Date(task.state.lastRunAtMs).toLocaleString()}
                  </p>
                </div>
              )}
              {task.state.nextRunAtMs && (
                <div className="bg-bg-secondary rounded-lg px-3 py-2">
                  <p className="text-text-muted">下次运行</p>
                  <p className="text-text-primary font-mono">
                    {new Date(task.state.nextRunAtMs).toLocaleString()}
                  </p>
                </div>
              )}
              {task.state.lastRunStatus && (
                <div className="bg-bg-secondary rounded-lg px-3 py-2">
                  <p className="text-text-muted">状态</p>
                  <p
                    className={`font-medium ${task.state.lastRunStatus === 'success' ? 'text-green-500' : task.state.lastRunStatus === 'failed' ? 'text-red-500' : 'text-yellow-500'}`}
                  >
                    {task.state.lastRunStatus}
                  </p>
                </div>
              )}
              {(task.state.consecutiveErrors ?? 0) > 0 && (
                <div className="bg-bg-secondary rounded-lg px-3 py-2">
                  <p className="text-text-muted">错误</p>
                  <p className="text-red-500 font-mono">{task.state.consecutiveErrors}</p>
                </div>
              )}
            </div>
            {task.state.lastError && (
              <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <p className="text-xs text-red-400 font-mono break-all">{task.state.lastError}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatScheduleLabel(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case 'cron':
      return `cron: ${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ''}`
    case 'every':
      return `every ${formatMs(schedule.everyMs)}`
    case 'at':
      return `at ${schedule.at}`
    default:
      return String((schedule as { kind: string }).kind)
  }
}

function formatMs(ms: number): string {
  if (ms >= 86400000) return `${Math.round(ms / 86400000)}d`
  if (ms >= 3600000) return `${Math.round(ms / 3600000)}h`
  if (ms >= 60000) return `${Math.round(ms / 60000)}m`
  return `${Math.round(ms / 1000)}s`
}
