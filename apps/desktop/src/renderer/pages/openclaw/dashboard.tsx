/**
 * OpenClaw Dashboard — Cute, Rounded & Modern
 * Uses the app's design-token system for full theme compatibility.
 */

import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Pause,
  Play,
  Power,
  Puzzle,
  RefreshCw,
  Store,
  Terminal,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GatewayLogEntry, GatewayStatus } from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import { OpenClawTopBar } from './openclaw-brand'
import type { OpenClawPage } from './openclaw-layout'
import { OpenClawButton } from './openclaw-ui'

interface DashboardProps {
  onNavigate: (page: OpenClawPage) => void
}

export function OpenClawDashboard({ onNavigate }: DashboardProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [logs, setLogs] = useState<GatewayLogEntry[]>([])
  const [actionLoading, setActionLoading] = useState(false)
  const [skillCount, setSkillCount] = useState(0)
  const [agentCount, setAgentCount] = useState(0)
  const [channelCount, setChannelCount] = useState(0)
  const [modelCount, setModelCount] = useState(0)
  const [buddyCount, setBuddyCount] = useState(0)
  const [showLogs, setShowLogs] = useState(false)
  const [logsLoaded, setLogsLoaded] = useState(false)
  const [openConsoleLoading, setOpenConsoleLoading] = useState(false)
  const [gatewayConfig, setGatewayConfig] = useState<{ autoStart: boolean; autoRestart: boolean }>({
    autoStart: false,
    autoRestart: true,
  })
  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openClawApi.isAvailable) return
    openClawApi
      .getGatewayStatus()
      .then(setStatus)
      .catch(() => {})
    openClawApi
      .listSkills()
      .then((s) => setSkillCount(s.length))
      .catch(() => {})
    openClawApi
      .listAgents()
      .then((a) => setAgentCount(a.length))
      .catch(() => {})
    openClawApi
      .getChannelConfigs()
      .then((c) => setChannelCount(Object.keys(c).length))
      .catch(() => {})
    openClawApi
      .listModels()
      .then((m) => setModelCount(Object.keys(m).length))
      .catch(() => {})
    openClawApi
      .listBuddyConnections()
      .then((b) => setBuddyCount(b.length))
      .catch(() => {})
    openClawApi
      .getDesktopSettings()
      .then((s) => {
        setGatewayConfig({
          autoStart: s.autoStart,
          autoRestart: s.autoRestart,
        })
      })
      .catch(() => {})
    const unsubStatus = openClawApi.onGatewayStatusChanged((s) => setStatus(s))
    const unsubLog = openClawApi.onGatewayLog((entry) => {
      setLogs((prev: GatewayLogEntry[]) => {
        const next = [...prev, entry]
        return next.length > 1000 ? next.slice(-1000) : next
      })
    })
    // Load recent logs from main process buffer
    openClawApi
      .getRecentLogs(500)
      .then((recent) => {
        setLogs((prev) => {
          if (prev.length === 0) return recent
          // Merge: skip entries already present (by timestamp)
          const lastTs = prev[prev.length - 1]?.timestamp ?? 0
          const newEntries = recent.filter((e) => e.timestamp > lastTs)
          return [...prev, ...newEntries]
        })
        setLogsLoaded(true)
      })
      .catch(() => setLogsLoaded(true))
    return () => {
      unsubStatus()
      unsubLog()
    }
  }, [])

  // Auto-scroll to bottom when logs expand
  useEffect(() => {
    if (showLogs && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [showLogs])

  const handleStart = useCallback(async () => {
    setActionLoading(true)
    try {
      await openClawApi.startGateway()
    } finally {
      setActionLoading(false)
    }
  }, [])
  const handleStop = useCallback(async () => {
    setActionLoading(true)
    try {
      await openClawApi.stopGateway()
    } finally {
      setActionLoading(false)
    }
  }, [])
  const handleRestart = useCallback(async () => {
    setActionLoading(true)
    try {
      await openClawApi.restartGateway()
    } finally {
      setActionLoading(false)
    }
  }, [])
  const handleInstall = useCallback(async () => {
    setActionLoading(true)
    try {
      await openClawApi.installOpenClaw()
    } finally {
      setActionLoading(false)
    }
  }, [])

  const state = status?.state ?? 'offline'
  const stateInfo = STATE_LABELS[state] ?? STATE_LABELS.offline!
  const StateIcon = stateInfo.icon
  const isRunning = state === 'running'
  const isTransitioning = ['installing', 'starting', 'bootstrapping', 'stopping'].includes(state)

  const openConsoleInBrowser = useCallback(async () => {
    if (!isRunning || openConsoleLoading) return
    setOpenConsoleLoading(true)
    try {
      await openClawApi.openConsole()
      await new Promise((resolve) => setTimeout(resolve, 3000))
    } finally {
      setOpenConsoleLoading(false)
    }
  }, [isRunning, openConsoleLoading])

  const toggleGatewaySetting = useCallback(
    async (key: 'autoStart' | 'autoRestart', value: boolean) => {
      setGatewayConfig((prev) => ({ ...prev, [key]: value }))
      try {
        await openClawApi.saveDesktopSettings({ [key]: value })
      } catch {
        /* ignore */
      }
    },
    [],
  )

  const stats = [
    {
      icon: Puzzle,
      label: t('openclaw.dashboard.skills', '技能'),
      count: skillCount,
      page: 'skillhub' as const,
    },
    {
      icon: Bot,
      label: t('openclaw.dashboard.agents', '智能体'),
      count: agentCount,
      page: 'agents' as const,
    },
    {
      icon: Globe,
      label: t('openclaw.dashboard.channels', '频道'),
      count: channelCount,
      page: 'channels' as const,
    },
    {
      icon: Cpu,
      label: t('openclaw.dashboard.models', '模型'),
      count: modelCount,
      page: 'models' as const,
    },
    {
      icon: Link2,
      label: t('openclaw.dashboard.buddies', '伙伴'),
      count: buddyCount,
      page: 'buddy' as const,
    },
  ]

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar">
      <OpenClawTopBar
        title={t('openclaw.dashboard.title', '仪表盘')}
        subtitle={t('openclaw.dashboard.subtitle', '管理你的 AI 龙虾服务与集成')}
      />

      <div className="px-6 pb-8 space-y-6 max-w-5xl">
        {/* ─── Gateway Status Card ─── */}
        <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${isRunning ? 'bg-green-500/10 text-green-400' : state === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-bg-tertiary text-text-muted'}`}
              >
                <StateIcon size={28} className={isTransitioning ? 'animate-spin' : ''} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-text-primary">
                    {t('openclaw.dashboard.gatewayTitle', '龙虾服务')}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${stateInfo.color} ${stateInfo.bg}`}
                  >
                    {stateInfo.label}
                  </span>
                </div>
                <p className="text-sm text-text-muted">
                  {isRunning
                    ? t('openclaw.dashboard.statusRunning', '龙虾服务正在运行，一切准备就绪。')
                    : t('openclaw.dashboard.statusOffline', '启动龙虾服务，释放所有潜能。')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {state === 'offline' && (
                <OpenClawButton
                  type="button"
                  onClick={handleStart}
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-all shadow-sm"
                >
                  {actionLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Play size={16} />
                  )}
                  {t('openclaw.action.start', '启动')}
                </OpenClawButton>
              )}
              {isRunning && (
                <>
                  <OpenClawButton
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={openConsoleInBrowser}
                    disabled={!isRunning || actionLoading || openConsoleLoading}
                    className="rounded-xl"
                    title={t('openclaw.dashboard.openConsole', '在浏览器打开控制台')}
                  >
                    {openConsoleLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ExternalLink size={16} />
                    )}
                  </OpenClawButton>
                  <OpenClawButton
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={handleRestart}
                    disabled={actionLoading}
                    className="rounded-xl"
                    title={t('common.refresh', '重启')}
                  >
                    <RefreshCw size={16} />
                  </OpenClawButton>
                  <OpenClawButton
                    type="button"
                    size="icon"
                    variant="danger"
                    onClick={handleStop}
                    disabled={actionLoading}
                    className="rounded-xl"
                    title={t('common.stop', '停止')}
                  >
                    <Power size={16} />
                  </OpenClawButton>
                </>
              )}
              {state === 'error' && (
                <OpenClawButton
                  type="button"
                  onClick={handleInstall}
                  disabled={actionLoading}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-all"
                >
                  {actionLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  {t('openclaw.guard.install', '安装')}
                </OpenClawButton>
              )}
            </div>
          </div>

          {/* Metrics Row */}
          <div className="mt-5 pt-5 border-t border-border-subtle flex items-center gap-6 flex-wrap">
            <MetricPill
              label={t('openclaw.dashboard.uptime', '运行时间')}
              value={status?.uptime != null ? formatUptime(status.uptime) : '00m 00s'}
            />
            <MetricPill
              label={t('openclaw.dashboard.port', '端口')}
              value={String(status?.port ?? '—')}
            />
            <MetricPill label="PID" value={String(status?.pid ?? '—')} />
            <MetricPill
              label={t('openclaw.dashboard.version', '版本')}
              value={status?.version ? `v${status.version}` : '—'}
            />
          </div>
        </section>

        {/* ─── Stats Grid ─── */}
        <div className="grid grid-cols-5 gap-3">
          {stats.map((s) => (
            <button
              key={s.page}
              type="button"
              onClick={() => onNavigate(s.page)}
              className="group rounded-2xl border border-border-subtle bg-bg-secondary p-4 hover:border-primary/30 hover:bg-bg-modifier-hover transition-all text-left"
            >
              <s.icon
                size={22}
                className="text-text-muted group-hover:text-primary transition-colors mb-3"
              />
              <div className="text-2xl font-black text-text-primary">{s.count}</div>
              <div className="text-xs text-text-muted font-medium mt-0.5">{s.label}</div>
            </button>
          ))}
        </div>

        {/* ─── Quick Actions ─── */}
        <div className="grid grid-cols-2 gap-3">
          <QuickAction
            icon={Store}
            title={t('openclaw.dashboard.browseSkills', '浏览技能商店')}
            desc={t('openclaw.dashboard.browseSkillsDesc', '搜索和安装 AI 技能')}
            onClick={() => onNavigate('skillhub')}
          />
          <QuickAction
            icon={Globe}
            title={t('openclaw.dashboard.configChannels', '配置 IM 通道')}
            desc={t('openclaw.dashboard.configChannelsDesc', '连接 Telegram、Discord 等平台')}
            onClick={() => onNavigate('channels')}
          />
          <QuickAction
            icon={Cpu}
            title={t('openclaw.dashboard.addModels', '添加模型提供商')}
            desc={t('openclaw.dashboard.addModelsDesc', '连接 OpenAI、Claude 或自定义模型')}
            onClick={() => onNavigate('models')}
          />
          <QuickAction
            icon={Link2}
            title={t('openclaw.dashboard.connectBuddy', '连接 Buddy')}
            desc={t('openclaw.dashboard.connectBuddyDesc', '将本地智能体连接到远程服务器')}
            onClick={() => onNavigate('buddy')}
          />
        </div>

        {/* ─── Gateway Config ─── */}
        <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-6">
          <h3 className="text-sm font-bold text-text-primary mb-4">
            {t('openclaw.dashboard.behaviorConfig', '龙虾服务行为管理')}
          </h3>
          <div className="space-y-3">
            <ToggleRow
              label={t('openclaw.dashboard.autoStart', '开机自动唤醒')}
              checked={gatewayConfig.autoStart}
              onChange={(v) => toggleGatewaySetting('autoStart', v)}
            />
            <ToggleRow
              label={t('openclaw.dashboard.autoRestart', '异常自动恢复')}
              checked={gatewayConfig.autoRestart}
              onChange={(v) => toggleGatewaySetting('autoRestart', v)}
            />
          </div>
        </section>

        {/* ─── Logs ─── */}
        <section className="rounded-2xl border border-border-subtle bg-bg-secondary overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-bg-modifier-hover transition"
            onClick={() => setShowLogs(!showLogs)}
          >
            <div className="flex items-center gap-2 text-text-secondary text-sm font-semibold">
              <Terminal size={14} />
              {t('openclaw.dashboard.logs', '网关日志')}
              {logs.length > 0 && (
                <span className="text-xs text-text-muted font-normal">({logs.length})</span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-text-muted transition-transform ${showLogs ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showLogs && (
            <div
              ref={logContainerRef}
              className="border-t border-border-subtle max-h-[360px] overflow-y-auto bg-bg-tertiary"
            >
              {logs.length === 0 ? (
                <div className="text-text-muted text-center py-8 italic text-xs">
                  {logsLoaded
                    ? t('openclaw.dashboard.noLogs', '暂无日志')
                    : t('openclaw.dashboard.loadingLogs', '加载日志中...')}
                </div>
              ) : (
                <VirtualLogList logs={logs} containerRef={logContainerRef} />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/* ─── Sub-components ─── */

const STATE_LABELS: Record<
  string,
  { label: string; color: string; bg: string; icon: typeof CheckCircle2 }
> = {
  offline: { label: '离线', color: 'text-text-muted', bg: 'bg-bg-tertiary', icon: Power },
  installing: {
    label: '安装中...',
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    icon: Download,
  },
  starting: { label: '启动中...', color: 'text-yellow-500', bg: 'bg-yellow-500/10', icon: Loader2 },
  bootstrapping: {
    label: '初始化中...',
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    icon: Loader2,
  },
  running: { label: '运行中', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle2 },
  stopping: { label: '停止中...', color: 'text-yellow-500', bg: 'bg-yellow-500/10', icon: Pause },
  error: { label: '错误', color: 'text-red-500', bg: 'bg-red-500/10', icon: AlertCircle },
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono font-bold text-text-primary">{value}</span>
    </div>
  )
}

function QuickAction({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof Store
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 rounded-2xl border border-border-subtle bg-bg-secondary p-4 hover:border-primary/30 hover:bg-bg-modifier-hover transition-all text-left"
    >
      <div className="w-10 h-10 rounded-xl bg-bg-tertiary flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition">
        <Icon size={18} className="text-text-muted group-hover:text-primary transition-colors" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-text-primary truncate">{title}</div>
        <div className="text-xs text-text-muted truncate">{desc}</div>
      </div>
    </button>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-text-secondary">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-bg-tertiary'}`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
    </div>
  )
}

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0
    ? `${h}h ${m}m ${s}s`
    : `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

/* ─── Virtual Log List ─── */

const LOG_ROW_HEIGHT = 22

function VirtualLogList({
  logs,
  containerRef,
}: {
  logs: GatewayLogEntry[]
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(360)
  const autoScrollRef = useRef(true)

  // Track container size
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height)
    })
    observer.observe(el)
    setContainerHeight(el.clientHeight)
    return () => observer.disconnect()
  }, [containerRef])

  // Listen to scroll events
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      setScrollTop(el.scrollTop)
      // Auto-scroll is on when scrolled within 50px of bottom
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
      autoScrollRef.current = atBottom
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [containerRef])

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [containerRef])

  const totalHeight = logs.length * LOG_ROW_HEIGHT
  const startIdx = Math.max(0, Math.floor(scrollTop / LOG_ROW_HEIGHT) - 5)
  const visibleCount = Math.ceil(containerHeight / LOG_ROW_HEIGHT) + 10
  const endIdx = Math.min(logs.length, startIdx + visibleCount)

  return (
    <div className="relative font-mono text-xs" style={{ height: totalHeight }}>
      <div className="absolute left-0 right-0" style={{ top: startIdx * LOG_ROW_HEIGHT }}>
        {logs.slice(startIdx, endIdx).map((log, i) => (
          <div
            key={startIdx + i}
            className="flex gap-2 hover:bg-bg-modifier-hover px-3 py-0.5 leading-[18px] h-[22px] items-center"
            style={{ height: LOG_ROW_HEIGHT }}
          >
            <span className="text-text-muted shrink-0 select-none">
              [{new Date(log.timestamp).toLocaleTimeString()}]
            </span>
            <span
              className={`truncate ${log.level === 'error' ? 'text-danger' : log.level === 'warn' ? 'text-warning' : 'text-text-secondary'}`}
            >
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
