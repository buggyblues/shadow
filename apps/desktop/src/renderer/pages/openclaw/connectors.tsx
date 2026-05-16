/**
 * Connector Center
 *
 * CLI-backed controls for ShadowOB account, Cloud costs, official skills,
 * Agent-Buddy bindings, and scheduler entry points.
 */

import {
  Bell,
  CheckCircle2,
  Cloud,
  DollarSign,
  Download,
  KeyRound,
  Loader2,
  RefreshCw,
  Terminal,
  Timer,
  Unplug,
  Wrench,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AgentBuddyBindingSummary,
  ConnectorCommandResult,
  ConnectorOverview,
  ConnectorToolStatus,
} from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import { OpenClawTopBar } from './openclaw-brand'
import type { OpenClawPage } from './openclaw-layout'
import { OpenClawButton } from './openclaw-ui'

type ToolInstallId = 'shadowob-cli' | 'shadowob-cloud' | 'official-skills'

function parseJson<T>(result: ConnectorCommandResult | null): T | null {
  if (!result?.stdout) return null
  try {
    return JSON.parse(result.stdout) as T
  } catch {
    return null
  }
}

function outputText(result: ConnectorCommandResult | null): string {
  if (!result) return ''
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
}

export function ConnectorsPage({ onNavigate }: { onNavigate: (page: OpenClawPage) => void }) {
  const { t } = useTranslation()
  const [overview, setOverview] = useState<ConnectorOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<Set<ToolInstallId>>(new Set())
  const [serverUrl, setServerUrl] = useState('https://shadowob.com')
  const [profile, setProfile] = useState('default')
  const [token, setToken] = useState('')
  const [namespace, setNamespace] = useState('')
  const [shadowStatus, setShadowStatus] = useState<ConnectorCommandResult | null>(null)
  const [notifications, setNotifications] = useState<ConnectorCommandResult | null>(null)
  const [cloudCosts, setCloudCosts] = useState<ConnectorCommandResult | null>(null)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [probing, setProbing] = useState(false)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    try {
      setOverview(await openClawApi.getConnectorOverview())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (openClawApi.isAvailable) loadOverview()
  }, [loadOverview])

  const runInstall = useCallback(
    async (tool: ToolInstallId) => {
      setInstalling((prev) => new Set(prev).add(tool))
      setMessage(null)
      try {
        const result = await openClawApi.installConnectorTools([tool])
        const item = result[tool]
        setMessage({
          kind: item?.ok ? 'success' : 'error',
          text: item?.ok
            ? t('openclaw.connectors.installSuccess', '安装完成')
            : item?.stderr || t('openclaw.connectors.installFailed', '安装失败'),
        })
        await loadOverview()
      } finally {
        setInstalling((prev) => {
          const next = new Set(prev)
          next.delete(tool)
          return next
        })
      }
    },
    [loadOverview, t],
  )

  const runLogin = useCallback(async () => {
    if (!token.trim()) {
      setMessage({ kind: 'error', text: t('openclaw.connectors.tokenRequired', '请输入 Token') })
      return
    }
    const result = await openClawApi.loginShadowCli({
      serverUrl,
      token: token.trim(),
      profile: profile.trim() || undefined,
    })
    setMessage({
      kind: result.ok ? 'success' : 'error',
      text: result.ok
        ? t('openclaw.connectors.loginSuccess', '登录成功')
        : outputText(result) || t('openclaw.connectors.loginFailed', '登录失败'),
    })
    if (result.ok) {
      setToken('')
      setShadowStatus(await openClawApi.getShadowCliStatus(profile.trim() || undefined))
    }
  }, [profile, serverUrl, t, token])

  const notificationItems = useMemo(
    () =>
      parseJson<
        Array<{
          id: string
          title: string
          body?: string | null
          isRead?: boolean
          createdAt?: string
        }>
      >(notifications) ?? [],
    [notifications],
  )

  const statusJson = useMemo(() => parseJson<Record<string, unknown>>(shadowStatus), [shadowStatus])
  const costsJson = useMemo(() => parseJson<Record<string, unknown>>(cloudCosts), [cloudCosts])

  if (loading && !overview) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar">
      <OpenClawTopBar
        title={t('openclaw.connectors.title', '连接器中心')}
        subtitle={t('openclaw.connectors.subtitle', 'CLI、Buddy 绑定、开销和任务的统一入口')}
      />

      <div className="px-6 pb-8 space-y-5 max-w-6xl">
        {message && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              message.kind === 'success'
                ? 'border-green-500/20 bg-green-500/10 text-green-400'
                : 'border-red-500/20 bg-red-500/10 text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-text-primary">
                {t('openclaw.connectors.tools', '工具状态')}
              </h3>
              <p className="text-xs text-text-muted mt-1">
                {t(
                  'openclaw.connectors.toolsDesc',
                  '检查并安装 ShadowOB CLI、Cloud CLI 和官方技能',
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <OpenClawButton
                type="button"
                variant="ghost"
                disabled={probing}
                onClick={async () => {
                  setProbing(true)
                  try {
                    await openClawApi.probeBuddyConnections()
                    await loadOverview()
                  } finally {
                    setProbing(false)
                  }
                }}
              >
                {probing ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
                {t('openclaw.connectors.probeBindings', '检查状态')}
              </OpenClawButton>
              <OpenClawButton type="button" variant="ghost" onClick={loadOverview}>
                <RefreshCw size={14} />
                {t('common.refresh', '刷新')}
              </OpenClawButton>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(overview?.tools ?? []).map((tool) => (
              <ToolRow
                key={tool.id}
                tool={tool}
                installing={installing.has(tool.id as ToolInstallId)}
                onInstall={
                  tool.id === 'shadowob-cli'
                    ? () => runInstall('shadowob-cli')
                    : tool.id === 'shadowob-cloud'
                      ? () => runInstall('shadowob-cloud')
                      : undefined
                }
              />
            ))}
            <div className="rounded-xl border border-bg-tertiary bg-bg-primary p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Wrench size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    {t('openclaw.connectors.officialSkills', '官方 Skills')}
                  </p>
                  <p className="text-xs text-text-muted">
                    {t('openclaw.connectors.installedSkills', '{{count}} 个已安装', {
                      count: overview?.installedSkillCount ?? 0,
                    })}
                  </p>
                </div>
              </div>
              <OpenClawButton
                type="button"
                variant="ghost"
                disabled={installing.has('official-skills')}
                onClick={() => runInstall('official-skills')}
              >
                {installing.has('official-skills') ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                {t('openclaw.connectors.install', '安装')}
              </OpenClawButton>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-5">
          <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-5">
            <div className="flex items-center gap-2 mb-4">
              <KeyRound size={18} className="text-primary" />
              <h3 className="text-base font-bold text-text-primary">
                {t('openclaw.connectors.shadowAccount', 'shadowob.com 登录')}
              </h3>
            </div>
            <div className="space-y-3">
              <input
                value={serverUrl}
                onChange={(event) => setServerUrl(event.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-bg-tertiary text-sm text-text-primary focus:outline-none focus:border-primary/50"
                placeholder="https://shadowob.com"
              />
              <input
                value={profile}
                onChange={(event) => setProfile(event.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-bg-tertiary text-sm text-text-primary focus:outline-none focus:border-primary/50"
                placeholder={t('openclaw.connectors.profilePlaceholder', 'Profile 名称')}
              />
              <input
                value={token}
                type="password"
                onChange={(event) => setToken(event.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-bg-tertiary text-sm text-text-primary focus:outline-none focus:border-primary/50"
                placeholder={t('openclaw.connectors.tokenPlaceholder', 'Shadow Token')}
              />
              <div className="flex gap-2">
                <OpenClawButton type="button" onClick={runLogin}>
                  <KeyRound size={14} />
                  {t('openclaw.connectors.login', '登录')}
                </OpenClawButton>
                <OpenClawButton
                  type="button"
                  variant="ghost"
                  onClick={async () =>
                    setShadowStatus(
                      await openClawApi.getShadowCliStatus(profile.trim() || undefined),
                    )
                  }
                >
                  <Terminal size={14} />
                  {t('openclaw.connectors.checkStatus', '检查状态')}
                </OpenClawButton>
              </div>
              {shadowStatus && (
                <ResultBlock
                  ok={shadowStatus.ok}
                  text={
                    statusJson
                      ? JSON.stringify(statusJson, null, 2)
                      : outputText(shadowStatus) || '(empty)'
                  }
                />
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={18} className="text-primary" />
              <h3 className="text-base font-bold text-text-primary">
                {t('openclaw.connectors.notifications', '通知中心')}
              </h3>
            </div>
            <div className="flex gap-2 mb-3">
              <OpenClawButton
                type="button"
                onClick={async () =>
                  setNotifications(
                    await openClawApi.listShadowNotifications({
                      unreadOnly: true,
                      limit: 20,
                      profile: profile.trim() || undefined,
                    }),
                  )
                }
              >
                <Bell size={14} />
                {t('openclaw.connectors.loadUnread', '读取未读')}
              </OpenClawButton>
              <OpenClawButton
                type="button"
                variant="ghost"
                onClick={async () => {
                  await openClawApi.markAllShadowNotificationsRead(profile.trim() || undefined)
                  setNotifications(
                    await openClawApi.listShadowNotifications({
                      unreadOnly: true,
                      limit: 20,
                      profile: profile.trim() || undefined,
                    }),
                  )
                }}
              >
                <CheckCircle2 size={14} />
                {t('openclaw.connectors.markAllRead', '全部已读')}
              </OpenClawButton>
            </div>
            {notifications && !notifications.ok ? (
              <ResultBlock ok={false} text={outputText(notifications)} />
            ) : notificationItems.length > 0 ? (
              <div className="space-y-2 max-h-[260px] overflow-y-auto">
                {notificationItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg bg-bg-primary border border-bg-tertiary p-3"
                  >
                    <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                    {item.body && <p className="text-xs text-text-muted mt-1">{item.body}</p>}
                    {item.createdAt && (
                      <p className="text-[10px] text-text-muted mt-2">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                {t('openclaw.connectors.noNotifications', '暂无通知')}
              </p>
            )}
          </section>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-5">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={18} className="text-primary" />
              <h3 className="text-base font-bold text-text-primary">
                {t('openclaw.connectors.costs', '开销收集')}
              </h3>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                value={namespace}
                onChange={(event) => setNamespace(event.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-bg-primary border border-bg-tertiary text-sm text-text-primary focus:outline-none focus:border-primary/50"
                placeholder={t('openclaw.connectors.namespacePlaceholder', 'namespace，可留空')}
              />
              <OpenClawButton
                type="button"
                onClick={async () =>
                  setCloudCosts(
                    await openClawApi.collectShadowCloudCosts({
                      namespace: namespace.trim() || undefined,
                    }),
                  )
                }
              >
                <Cloud size={14} />
                {t('openclaw.connectors.collect', '收集')}
              </OpenClawButton>
            </div>
            {cloudCosts && (
              <ResultBlock
                ok={cloudCosts.ok}
                text={costsJson ? JSON.stringify(costsJson, null, 2) : outputText(cloudCosts)}
              />
            )}
          </section>

          <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-5">
            <div className="flex items-center gap-2 mb-4">
              <Timer size={18} className="text-primary" />
              <h3 className="text-base font-bold text-text-primary">
                {t('openclaw.connectors.scheduler', '定时任务')}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Metric
                label={t('openclaw.connectors.cronTotal', '任务总数')}
                value={overview?.cronTaskCount ?? 0}
              />
              <Metric
                label={t('openclaw.connectors.cronEnabled', '已启用')}
                value={overview?.enabledCronTaskCount ?? 0}
              />
            </div>
            <OpenClawButton type="button" onClick={() => onNavigate('cron')}>
              <Timer size={14} />
              {t('openclaw.connectors.manageCron', '管理定时任务')}
            </OpenClawButton>
          </section>
        </div>

        <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-text-primary">
                {t('openclaw.connectors.bindings', 'Agent - Buddy 绑定')}
              </h3>
              <p className="text-xs text-text-muted mt-1">
                {t('openclaw.connectors.bindingsDesc', '检查多 Buddy 到本地多 Agent 的路由关系')}
              </p>
            </div>
            <OpenClawButton type="button" variant="ghost" onClick={loadOverview}>
              <RefreshCw size={14} />
              {t('common.refresh', '刷新')}
            </OpenClawButton>
          </div>
          <BindingsTable bindings={overview?.bindings ?? []} />
        </section>
      </div>
    </div>
  )
}

function ToolRow({
  tool,
  installing,
  onInstall,
}: {
  tool: ConnectorToolStatus
  installing: boolean
  onInstall?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-primary p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            tool.installed ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {tool.installed ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{tool.label}</p>
          <p className="text-xs text-text-muted truncate">
            {tool.installed
              ? (tool.version ?? t('openclaw.connectors.installed', '已安装'))
              : (tool.error ?? t('openclaw.connectors.notInstalled', '未安装'))}
          </p>
        </div>
      </div>
      {onInstall && !tool.installed && (
        <OpenClawButton type="button" variant="ghost" disabled={installing} onClick={onInstall}>
          {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {t('openclaw.connectors.install', '安装')}
        </OpenClawButton>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-bg-primary border border-bg-tertiary p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-2xl font-bold text-text-primary mt-1">{value}</p>
    </div>
  )
}

function ResultBlock({ ok, text }: { ok: boolean; text: string }) {
  return (
    <pre
      className={`max-h-[260px] overflow-auto rounded-xl border p-3 text-[11px] leading-relaxed whitespace-pre-wrap ${
        ok
          ? 'border-bg-tertiary bg-bg-primary text-text-secondary'
          : 'border-red-500/20 bg-red-500/10 text-red-300'
      }`}
    >
      {text}
    </pre>
  )
}

function BindingsTable({ bindings }: { bindings: AgentBuddyBindingSummary[] }) {
  const { t } = useTranslation()
  if (bindings.length === 0) {
    return (
      <div className="rounded-xl border border-bg-tertiary bg-bg-primary p-6 text-center">
        <Unplug size={24} className="mx-auto text-text-muted mb-2" />
        <p className="text-sm text-text-muted">
          {t('openclaw.connectors.noBindings', '暂无 Buddy 绑定')}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-bg-tertiary">
      <table className="w-full text-sm">
        <thead className="bg-bg-primary text-text-muted">
          <tr>
            <th className="text-left px-3 py-2">{t('openclaw.connectors.buddy', 'Buddy')}</th>
            <th className="text-left px-3 py-2">
              {t('openclaw.connectors.localAgent', '本地 Agent')}
            </th>
            <th className="text-left px-3 py-2">{t('openclaw.connectors.route', '路由')}</th>
            <th className="text-left px-3 py-2">{t('openclaw.connectors.status', '状态')}</th>
          </tr>
        </thead>
        <tbody>
          {bindings.map((binding) => (
            <tr key={binding.connectionId} className="border-t border-bg-tertiary">
              <td className="px-3 py-2">
                <p className="font-medium text-text-primary">{binding.connectionLabel}</p>
                <p className="text-xs text-text-muted">{binding.serverUrl}</p>
              </td>
              <td className="px-3 py-2 text-text-secondary">
                {binding.localAgentName ?? binding.localAgentId}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                    binding.bindingActive
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-yellow-500/10 text-yellow-400'
                  }`}
                >
                  {binding.bindingActive
                    ? t('openclaw.connectors.bindingActive', '已写入')
                    : t('openclaw.connectors.bindingPending', '待连接')}
                </span>
              </td>
              <td className="px-3 py-2 text-text-secondary">{binding.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
