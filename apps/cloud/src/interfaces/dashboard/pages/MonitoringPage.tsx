import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  Box,
  CheckCircle,
  Clock,
  DollarSign,
  Filter,
  FolderOpen,
  Heart,
  RefreshCw,
  Rocket,
  Settings,
  Shield,
  Stethoscope,
  Trash2,
  XCircle,
} from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/Badge'
import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { SearchInput } from '@/components/SearchInput'
import { StatCard } from '@/components/StatCard'
import { StatusDot, type StatusType } from '@/components/StatusDot'
import { Tabs } from '@/components/Tabs'
import { useDebounce } from '@/hooks/useDebounce'
import {
  api,
  type CostOverviewSummary,
  type Deployment,
  type DoctorCheck,
  type DoctorResult,
  type NamespaceCostSummary,
} from '@/lib/api'
import { formatUsdCost } from '@/lib/store-data'
import { getRelativeTime } from '@/lib/utils'
import { type ActivityEntry, type ActivityType } from '@/stores/app'

function doctorStatusToStatusType(status: DoctorCheck['status']): StatusType {
  if (status === 'pass') return 'success'
  if (status === 'warn') return 'warning'
  return 'error'
}

function isDeploymentReady(dep: Deployment): boolean {
  const [ready = 0, total = 0] = dep.ready.split('/').map(Number)
  return ready === total && total > 0
}

function formatTimestamp(value: string | null | undefined, locale?: string): string {
  if (!value) return '—'

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale)
}

function normalizeActivities(data?: {
  activities: Array<Record<string, unknown>>
}): ActivityEntry[] {
  return (data?.activities ?? []).map((activity) => {
    const parsedCreatedAt =
      typeof activity.createdAt === 'string' ? Date.parse(activity.createdAt) : Number.NaN
    const timestamp =
      typeof activity.timestamp === 'number' && Number.isFinite(activity.timestamp)
        ? activity.timestamp
        : Number.isFinite(parsedCreatedAt)
          ? parsedCreatedAt
          : Date.now()

    return {
      ...activity,
      timestamp,
    } as ActivityEntry
  })
}

function getActivityTypeConfig(
  translate: (key: string, options?: Record<string, unknown>) => string,
): Record<
  ActivityType,
  {
    label: string
    icon: ReactNode
    variant: 'success' | 'error' | 'info' | 'warning' | 'default'
  }
> {
  return {
    deploy: {
      label: translate('activity.types.deploy'),
      icon: <Rocket size={12} />,
      variant: 'success',
    },
    destroy: {
      label: translate('activity.types.destroy'),
      icon: <Trash2 size={12} />,
      variant: 'error',
    },
    scale: {
      label: translate('activity.types.scale'),
      icon: <BarChart3 size={12} />,
      variant: 'info',
    },
    config: {
      label: translate('activity.types.config'),
      icon: <Shield size={12} />,
      variant: 'warning',
    },
    init: {
      label: translate('activity.types.init'),
      icon: <Box size={12} />,
      variant: 'default',
    },
    settings: {
      label: translate('activity.types.settings'),
      icon: <Settings size={12} />,
      variant: 'default',
    },
  }
}

const ALL_ACTIVITY_TYPES: ActivityType[] = [
  'deploy',
  'destroy',
  'scale',
  'config',
  'init',
  'settings',
]

function ActivityList({ activities, limit }: { activities: ActivityEntry[]; limit?: number }) {
  const { t } = useTranslation()
  const activityTypeConfig = useMemo(() => getActivityTypeConfig(t), [t])
  const visibleActivities = limit ? activities.slice(0, limit) : activities

  if (visibleActivities.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={40} />}
        title={t('activity.noActivityRecorded')}
        description={t('activity.operationsWillAppear')}
      />
    )
  }

  return (
    <div>
      {visibleActivities.map((activity) => {
        const config = activityTypeConfig[activity.type]
        const time = new Date(activity.timestamp)
        const isValidDate = !Number.isNaN(time.getTime())

        return (
          <div
            key={activity.id}
            className="flex gap-4 py-3 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/10 transition-colors px-4 -mx-4 rounded-lg"
          >
            <div className="mt-0.5 p-2 bg-gray-900 border border-gray-800 rounded-lg shrink-0">
              {config.icon}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <p className="text-sm font-medium text-gray-200">{activity.title}</p>
                <Badge variant={config.variant} size="sm">
                  {config.label}
                </Badge>
              </div>

              {activity.detail && <p className="text-xs text-gray-500 mb-1">{activity.detail}</p>}

              <div className="flex items-center gap-3 text-[10px] text-gray-600 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {isValidDate ? time.toLocaleString() : '—'}
                </span>
                {activity.namespace && <span className="font-mono">ns: {activity.namespace}</span>}
                {activity.template && <span className="font-mono">tpl: {activity.template}</span>}
              </div>
            </div>

            <span className="text-xs text-gray-600 shrink-0 mt-1">
              {isValidDate ? getRelativeTime(activity.timestamp) : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function HealthPanel({ doctor }: { doctor: DoctorResult }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center gap-4 flex-wrap">
          <Badge variant="success" icon={<CheckCircle size={11} />}>
            {doctor.summary.pass} {t('monitoring.passed')}
          </Badge>
          {doctor.summary.warn > 0 && (
            <Badge variant="warning" icon={<AlertTriangle size={11} />}>
              {doctor.summary.warn} {t('monitoring.warnings')}
            </Badge>
          )}
          {doctor.summary.fail > 0 && (
            <Badge variant="error" icon={<XCircle size={11} />}>
              {doctor.summary.fail} {t('monitoring.failed')}
            </Badge>
          )}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800/50">
        {doctor.checks.map((check) => (
          <div key={check.name} className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <StatusDot status={doctorStatusToStatusType(check.status)} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{check.name}</p>
                <p className="text-xs text-gray-500">{check.message}</p>
              </div>
            </div>

            <Badge
              variant={
                check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'error'
              }
              size="sm"
            >
              {t(`monitoring.statusLabels.${check.status}`)}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

function DeploymentsPanel({ deployments }: { deployments: Deployment[] }) {
  const { t } = useTranslation()
  const namespaces = useMemo(
    () => [...new Set(deployments.map((deployment) => deployment.namespace))].sort(),
    [deployments],
  )

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        {t('monitoring.deploymentsAcross', {
          deployments: deployments.length,
          namespaces: namespaces.length,
        })}
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-2 text-xs font-medium text-gray-500">
                {t('monitoring.status')}
              </th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">
                {t('monitoring.name')}
              </th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">
                {t('monitoring.namespace')}
              </th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">
                {t('monitoring.ready')}
              </th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500" />
            </tr>
          </thead>

          <tbody>
            {deployments.map((deployment) => {
              const ready = isDeploymentReady(deployment)

              return (
                <tr
                  key={`${deployment.namespace}/${deployment.name}`}
                  className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <StatusDot status={ready ? 'success' : 'warning'} pulse={!ready} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      to="/deployments/$namespace"
                      params={{ namespace: deployment.namespace }}
                      className="text-sm font-mono text-blue-400 hover:text-blue-300"
                    >
                      {deployment.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">
                    {deployment.namespace}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={ready ? 'success' : 'warning'} size="sm">
                      {deployment.ready}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      to="/deployments/$namespace"
                      params={{ namespace: deployment.namespace }}
                      className="text-gray-600 hover:text-white"
                    >
                      <ArrowRight size={13} />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OverviewPanel({
  doctor,
  deployments,
  namespaces,
  costOverview,
  activities,
}: {
  doctor: DoctorResult | undefined
  deployments: Deployment[]
  namespaces: { configured: string[]; discovered: string[]; all: string[] } | undefined
  costOverview: CostOverviewSummary | undefined
  activities: ActivityEntry[]
}) {
  const { t, i18n } = useTranslation()

  const issues = useMemo(
    () => doctor?.checks.filter((check) => check.status !== 'pass') ?? [],
    [doctor],
  )

  const groupedDeployments = useMemo(() => {
    const groups = new Map<string, Deployment[]>()
    for (const deployment of deployments) {
      const list = groups.get(deployment.namespace) ?? []
      list.push(deployment)
      groups.set(deployment.namespace, list)
    }

    return [...groups.entries()]
      .map(([namespace, items]) => ({
        namespace,
        total: items.length,
        ready: items.filter(isDeploymentReady).length,
        deployments: items,
      }))
      .sort((left, right) => right.total - left.total)
  }, [deployments])

  const topCostNamespaces = useMemo(() => {
    return [...(costOverview?.namespaces ?? [])]
      .sort((left, right) => {
        if (left.totalUsd === null && right.totalUsd === null) return 0
        if (left.totalUsd === null) return 1
        if (right.totalUsd === null) return -1
        return right.totalUsd - left.totalUsd
      })
      .slice(0, 4)
  }, [costOverview?.namespaces])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="nf-card !p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Stethoscope size={16} style={{ color: 'var(--color-nf-cyan)' }} />
            <h2 className="text-sm font-black" style={{ color: 'var(--nf-text-high)' }}>
              {t('monitoring.latestHealthFindings')}
            </h2>
          </div>

          {doctor ? (
            issues.length > 0 ? (
              <div className="space-y-3">
                {issues.slice(0, 4).map((check) => (
                  <div
                    key={check.name}
                    className="rounded-2xl border px-4 py-3"
                    style={{
                      background: 'var(--nf-bg-glass-2)',
                      borderColor: 'var(--nf-border)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusDot status={doctorStatusToStatusType(check.status)} />
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: 'var(--nf-text-high)' }}
                        >
                          {check.name}
                        </p>
                      </div>
                      <Badge
                        variant={
                          check.status === 'pass'
                            ? 'success'
                            : check.status === 'warn'
                              ? 'warning'
                              : 'error'
                        }
                        size="sm"
                      >
                        {t(`monitoring.statusLabels.${check.status}`)}
                      </Badge>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--nf-text-mid)' }}>
                      {check.message}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="rounded-2xl border px-4 py-4 text-sm"
                style={{
                  background: 'var(--nf-bg-glass-2)',
                  borderColor: 'var(--nf-border)',
                  color: 'var(--nf-text-mid)',
                }}
              >
                {t('monitoring.allSystemsHealthy')}
              </div>
            )
          ) : (
            <div className="text-sm text-gray-500">{t('monitoring.runningHealthChecks')}</div>
          )}
        </div>

        <div className="nf-card !p-5 space-y-4">
          <div className="flex items-center gap-2">
            <DollarSign size={16} style={{ color: 'var(--color-nf-yellow)' }} />
            <h2 className="text-sm font-black" style={{ color: 'var(--nf-text-high)' }}>
              {t('monitoring.costSnapshot')}
            </h2>
          </div>

          {costOverview ? (
            <>
              <div>
                <div className="text-2xl font-black text-green-400">
                  {formatUsdCost(costOverview.totalUsd, i18n.language)}
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--nf-text-muted)' }}>
                  {t('deployments.generatedAt')}
                  {': '}
                  {formatTimestamp(costOverview.generatedAt, i18n.language)}
                </p>
              </div>

              <div className="space-y-2">
                {topCostNamespaces.length > 0 ? (
                  topCostNamespaces.map((item) => (
                    <Link
                      key={item.namespace}
                      to="/deployments/$namespace"
                      params={{ namespace: item.namespace }}
                      className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border hover:bg-white/5 transition-colors"
                      style={{
                        background: 'var(--nf-bg-glass-2)',
                        borderColor: 'var(--nf-border)',
                      }}
                    >
                      <div className="min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: 'var(--nf-text-high)' }}
                        >
                          {item.namespace}
                        </p>
                        <p className="text-[11px]" style={{ color: 'var(--nf-text-muted)' }}>
                          {t('deployments.availableAgents')}: {item.availableAgents} ·{' '}
                          {t('deployments.unavailableAgents')}: {item.unavailableAgents}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-green-400 shrink-0">
                        {formatUsdCost(item.totalUsd, i18n.language)}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm" style={{ color: 'var(--nf-text-muted)' }}>
                    {t('deployments.costUnavailableDescription')}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">{t('common.loading')}</p>
          )}
        </div>

        <div className="nf-card !p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} style={{ color: 'var(--color-nf-cyan)' }} />
            <h2 className="text-sm font-black" style={{ color: 'var(--nf-text-high)' }}>
              {t('monitoring.namespaceInventory')}
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="nf-glass-2 rounded-2xl p-3">
              <div className="text-[11px] mb-1" style={{ color: 'var(--nf-text-muted)' }}>
                {t('monitoring.configuredNamespaces')}
              </div>
              <div className="text-lg font-black" style={{ color: 'var(--nf-text-high)' }}>
                {namespaces?.configured.length ?? 0}
              </div>
            </div>
            <div className="nf-glass-2 rounded-2xl p-3">
              <div className="text-[11px] mb-1" style={{ color: 'var(--nf-text-muted)' }}>
                {t('monitoring.discoveredNamespaces')}
              </div>
              <div className="text-lg font-black" style={{ color: 'var(--nf-text-high)' }}>
                {namespaces?.discovered.length ?? 0}
              </div>
            </div>
            <div className="nf-glass-2 rounded-2xl p-3">
              <div className="text-[11px] mb-1" style={{ color: 'var(--nf-text-muted)' }}>
                {t('monitoring.trackedNamespaces')}
              </div>
              <div className="text-lg font-black" style={{ color: 'var(--nf-text-high)' }}>
                {namespaces?.all.length ?? 0}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(namespaces?.all ?? []).map((namespace) => (
              <Link
                key={namespace}
                to="/deployments/$namespace"
                params={{ namespace }}
                className="nf-pill text-xs"
              >
                <span>{namespace}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="nf-card !p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity size={16} style={{ color: 'var(--color-nf-cyan)' }} />
              <h2 className="text-sm font-black" style={{ color: 'var(--nf-text-high)' }}>
                {t('monitoring.recentActivity')}
              </h2>
            </div>
            <span className="text-xs" style={{ color: 'var(--nf-text-muted)' }}>
              {activities.length} {t('activity.activities')}
            </span>
          </div>

          <ActivityList activities={activities} limit={6} />
        </div>

        <div className="nf-card !p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Box size={16} style={{ color: 'var(--color-nf-cyan)' }} />
            <h2 className="text-sm font-black" style={{ color: 'var(--nf-text-high)' }}>
              {t('monitoring.deploymentReadiness')}
            </h2>
          </div>

          {groupedDeployments.length > 0 ? (
            <div className="space-y-3">
              {groupedDeployments.map((group) => (
                <Link
                  key={group.namespace}
                  to="/deployments/$namespace"
                  params={{ namespace: group.namespace }}
                  className="block rounded-2xl border px-4 py-3 hover:bg-white/5 transition-colors"
                  style={{
                    background: 'var(--nf-bg-glass-2)',
                    borderColor: 'var(--nf-border)',
                  }}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-sm font-medium" style={{ color: 'var(--nf-text-high)' }}>
                      {group.namespace}
                    </p>
                    <Badge variant={group.ready === group.total ? 'success' : 'warning'} size="sm">
                      {group.ready}/{group.total}
                    </Badge>
                  </div>
                  <p className="text-[11px] line-clamp-2" style={{ color: 'var(--nf-text-muted)' }}>
                    {group.deployments.map((deployment) => deployment.name).join(', ')}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Box size={32} />}
              title={t('monitoring.noDeploymentsFound')}
              description={t('deployments.noDeploymentsYet')}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function CostsPanel({
  overview,
  namespaceCosts,
  loadingNamespaceCosts,
}: {
  overview: CostOverviewSummary | undefined
  namespaceCosts: NamespaceCostSummary[]
  loadingNamespaceCosts: boolean
}) {
  const { t, i18n } = useTranslation()

  const costByNamespace = useMemo(
    () => new Map(namespaceCosts.map((item) => [item.namespace, item])),
    [namespaceCosts],
  )

  const availableAgents = useMemo(
    () => overview?.namespaces.reduce((sum, item) => sum + item.availableAgents, 0) ?? 0,
    [overview?.namespaces],
  )

  const unavailableAgents = useMemo(
    () => overview?.namespaces.reduce((sum, item) => sum + item.unavailableAgents, 0) ?? 0,
    [overview?.namespaces],
  )

  if (!overview || overview.namespaces.length === 0) {
    return (
      <EmptyState
        icon={<DollarSign size={40} />}
        title={t('deployments.costUnavailable')}
        description={t('deployments.costUnavailableDescription')}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label={t('deployments.totalCost')}
          value={formatUsdCost(overview.totalUsd, i18n.language)}
          icon={<DollarSign size={13} />}
          color="green"
        />
        <StatCard
          label={t('monitoring.namespaces')}
          value={overview.namespaces.length}
          icon={<FolderOpen size={13} />}
          color="purple"
        />
        <StatCard
          label={t('deployments.availableAgents')}
          value={availableAgents}
          icon={<CheckCircle size={13} />}
          color="blue"
        />
        <StatCard
          label={t('deployments.unavailableAgents')}
          value={unavailableAgents}
          icon={<XCircle size={13} />}
          color={unavailableAgents > 0 ? 'yellow' : 'default'}
        />
      </div>

      <div className="text-xs text-gray-500">
        {t('deployments.generatedAt')}: {formatTimestamp(overview.generatedAt, i18n.language)}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {overview.namespaces.map((item) => {
          const detail = costByNamespace.get(item.namespace)
          const detailStatus = detail
            ? detail.availableAgents > 0
              ? 'tracked'
              : 'unavailable'
            : null

          return (
            <div key={item.namespace} className="nf-card !p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to="/deployments/$namespace"
                      params={{ namespace: item.namespace }}
                      className="text-base font-black hover:opacity-85 transition-opacity"
                      style={{ color: 'var(--nf-text-high)' }}
                    >
                      {item.namespace}
                    </Link>
                    {detailStatus && (
                      <Badge variant={item.totalUsd !== null ? 'success' : 'outline'} size="sm">
                        {t(`monitoring.costSources.${detailStatus}`)}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs mt-1" style={{ color: 'var(--nf-text-muted)' }}>
                    {t('deployments.availableAgents')}: {item.availableAgents} ·{' '}
                    {t('deployments.unavailableAgents')}: {item.unavailableAgents}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-lg font-semibold text-green-400">
                    {formatUsdCost(item.totalUsd, i18n.language)}
                  </p>
                  <p className="text-[10px] text-gray-600">{t('deployments.totalCost')}</p>
                </div>
              </div>

              {detail ? (
                detail.agents.length > 0 ? (
                  <div className="space-y-3">
                    {detail.agents.map((agent) => (
                      <div
                        key={`${detail.namespace}-${agent.agentName}`}
                        className="rounded-2xl border px-4 py-3"
                        style={{
                          background: 'var(--nf-bg-glass-2)',
                          borderColor: 'var(--nf-border)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p
                                className="text-sm font-mono truncate"
                                style={{ color: 'var(--nf-text-high)' }}
                              >
                                {agent.agentName}
                              </p>
                              <Badge
                                variant={agent.totalUsd !== null ? 'success' : 'outline'}
                                size="sm"
                              >
                                {t(`monitoring.costSources.${agent.source}`)}
                              </Badge>
                            </div>

                            <p
                              className="text-[11px] mt-1"
                              style={{ color: 'var(--nf-text-muted)' }}
                            >
                              {agent.podName ?? t('common.none')}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-green-400">
                              {formatUsdCost(agent.totalUsd, i18n.language)}
                            </p>
                            <p className="text-[10px] text-gray-600">
                              {t('deployments.totalCost')}
                            </p>
                          </div>
                        </div>

                        {agent.providers.length > 0 ? (
                          <div className="space-y-2">
                            {agent.providers.map((provider) => (
                              <div
                                key={`${agent.agentName}-${provider.provider}`}
                                className="flex items-center justify-between gap-3 text-xs"
                              >
                                <span style={{ color: 'var(--nf-text-mid)' }}>
                                  {provider.provider}
                                </span>
                                <div className="text-right">
                                  <p style={{ color: 'var(--nf-text-high)' }}>
                                    {formatUsdCost(provider.amountUsd, i18n.language)}
                                  </p>
                                  <p style={{ color: 'var(--nf-text-muted)' }}>
                                    {provider.usageLabel ?? provider.raw ?? '—'}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs" style={{ color: 'var(--nf-text-muted)' }}>
                            {t('deployments.noProvidersReported')}
                          </p>
                        )}

                        {agent.message && (
                          <p className="text-xs text-yellow-500 mt-3">{agent.message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--nf-text-muted)' }}>
                    {t('deployments.costUnavailableDescription')}
                  </p>
                )
              ) : (
                <p className="text-sm" style={{ color: 'var(--nf-text-muted)' }}>
                  {loadingNamespaceCosts ? t('monitoring.loadingCostDetails') : t('common.loading')}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ActivityPanel({ activities }: { activities: ActivityEntry[] }) {
  const { t } = useTranslation()
  const activityTypeConfig = useMemo(() => getActivityTypeConfig(t), [t])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const debouncedSearch = useDebounce(search)

  const filtered = useMemo(() => {
    let list = activities

    if (typeFilter !== 'all') {
      list = list.filter((activity) => activity.type === typeFilter)
    }

    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase()
      list = list.filter(
        (activity) =>
          activity.title.toLowerCase().includes(query) ||
          activity.detail?.toLowerCase().includes(query) ||
          activity.namespace?.toLowerCase().includes(query) ||
          activity.template?.toLowerCase().includes(query),
      )
    }

    return sortOrder === 'oldest' ? [...list].reverse() : list
  }, [activities, debouncedSearch, sortOrder, typeFilter])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('activity.searchActivities')}
          size="sm"
          className="w-64"
        />

        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-gray-600" />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as ActivityType | 'all')}
            className="text-xs bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-400 focus:outline-none focus:border-blue-500"
          >
            <option value="all">{t('activity.allTypes')}</option>
            {ALL_ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {activityTypeConfig[type].label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setSortOrder((current) => (current === 'newest' ? 'oldest' : 'newest'))}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          <ArrowUpDown size={11} />
          {sortOrder === 'newest' ? t('activity.newestFirst') : t('activity.oldestFirst')}
        </button>
      </div>

      <div className="flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <Activity size={12} />
          {activities.length} {t('activity.total')}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Activity size={40} />}
          title={t('activity.noActivityRecorded')}
          description={
            activities.length === 0
              ? t('activity.operationsWillAppear')
              : t('activity.noActivitiesMatch')
          }
        />
      ) : (
        <ActivityList activities={filtered} />
      )}
    </div>
  )
}

export function MonitoringPage() {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState('overview')

  const {
    data: deployments,
    isLoading: loadingDeployments,
    refetch: refetchDeployments,
  } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.deployments.list,
    refetchInterval: 15_000,
    staleTime: 5_000,
  })

  const {
    data: namespaces,
    isLoading: loadingNamespaces,
    refetch: refetchNamespaces,
  } = useQuery({
    queryKey: ['deployment-namespaces'],
    queryFn: api.deployments.namespaces,
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  const {
    data: costOverview,
    isLoading: loadingCosts,
    refetch: refetchCosts,
  } = useQuery({
    queryKey: ['deployment-cost-overview'],
    queryFn: api.deployments.costs,
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  const namespaceCostQueries = useQueries({
    queries: (costOverview?.namespaces ?? []).map((item) => ({
      queryKey: ['deployment-costs', item.namespace],
      queryFn: () => api.deployments.namespaceCosts(item.namespace),
      refetchInterval: 30_000,
      staleTime: 10_000,
    })),
  })

  const namespaceCosts = useMemo(
    () =>
      namespaceCostQueries
        .map((query) => query.data)
        .filter((value): value is NamespaceCostSummary => Boolean(value)),
    [namespaceCostQueries],
  )

  const loadingNamespaceCosts = namespaceCostQueries.some((query) => query.isLoading)

  const {
    data: activityData,
    isLoading: loadingActivity,
    refetch: refetchActivity,
  } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.activity.list(),
    staleTime: 10_000,
    refetchInterval: 15_000,
  })

  const {
    data: doctor,
    isLoading: loadingDoctor,
    refetch: refetchDoctor,
  } = useQuery({
    queryKey: ['doctor'],
    queryFn: api.doctor,
    refetchInterval: 30_000,
  })

  const deploymentList = deployments ?? []
  const activities = useMemo(() => normalizeActivities(activityData), [activityData])
  const totalDeployments = deploymentList.length
  const readyDeployments = deploymentList.filter(isDeploymentReady).length
  const totalChecks = doctor ? doctor.summary.pass + doctor.summary.warn + doctor.summary.fail : 0
  const healthScore =
    doctor && totalChecks > 0 ? Math.round((doctor.summary.pass / totalChecks) * 100) : 0
  const namespaceCount =
    namespaces?.all.length ?? new Set(deploymentList.map((deployment) => deployment.namespace)).size
  const unavailableCostAgents =
    costOverview?.namespaces.reduce((sum, item) => sum + item.unavailableAgents, 0) ?? 0

  const handleRefresh = async () => {
    await Promise.all([
      refetchDoctor(),
      refetchDeployments(),
      refetchNamespaces(),
      refetchCosts(),
      refetchActivity(),
      ...namespaceCostQueries.map((query) => query.refetch()),
    ])
  }

  const tabs = [
    { id: 'overview', label: t('monitoring.overview'), icon: <BarChart3 size={13} /> },
    { id: 'health', label: t('monitoring.healthChecks'), icon: <Stethoscope size={13} /> },
    {
      id: 'deployments',
      label: t('monitoring.deployments'),
      count: totalDeployments,
      icon: <Box size={13} />,
    },
    {
      id: 'costs',
      label: t('monitoring.costs'),
      count: costOverview?.namespaces.length ?? 0,
      icon: <DollarSign size={13} />,
    },
    { id: 'activity', label: t('activity.title'), icon: <Activity size={13} /> },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Breadcrumb items={[{ label: t('nav.monitoring') }]} className="mb-4" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{t('monitoring.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('monitoring.description')}</p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          <RefreshCw size={12} />
          {t('common.refresh')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
        <StatCard
          label={t('monitoring.healthScore')}
          value={doctor ? `${healthScore}%` : '—'}
          icon={<Heart size={13} />}
          color={healthScore >= 80 ? 'green' : healthScore >= 50 ? 'yellow' : 'red'}
        />
        <StatCard
          label={t('monitoring.deployments')}
          value={totalDeployments}
          icon={<Box size={13} />}
          color="blue"
        />
        <StatCard
          label={t('monitoring.readyTotal')}
          value={`${readyDeployments}/${totalDeployments}`}
          icon={<CheckCircle size={13} />}
          color={readyDeployments === totalDeployments ? 'green' : 'yellow'}
        />
        <StatCard
          label={t('monitoring.namespaces')}
          value={namespaceCount}
          icon={<FolderOpen size={13} />}
          color="purple"
        />
        <StatCard
          label={t('deployments.totalCost')}
          value={formatUsdCost(costOverview?.totalUsd ?? null, i18n.language)}
          icon={<DollarSign size={13} />}
          color="green"
        />
        <StatCard
          label={t('deployments.unavailableAgents')}
          value={unavailableCostAgents}
          icon={<AlertTriangle size={13} />}
          color={unavailableCostAgents > 0 ? 'yellow' : 'default'}
        />
      </div>

      <Tabs items={tabs} active={activeTab} onChange={setActiveTab} className="mb-6" />

      <div className="min-h-[300px]">
        {activeTab === 'overview' && (
          <OverviewPanel
            doctor={doctor}
            deployments={deploymentList}
            namespaces={namespaces}
            costOverview={costOverview}
            activities={activities}
          />
        )}

        {activeTab === 'health' &&
          (loadingDoctor ? (
            <div className="py-12 text-center text-gray-500 text-sm">
              {t('monitoring.runningHealthChecks')}
            </div>
          ) : doctor ? (
            <HealthPanel doctor={doctor} />
          ) : (
            <div className="py-12 text-center text-gray-500 text-sm">
              {t('monitoring.failedHealthChecks')}
            </div>
          ))}

        {activeTab === 'deployments' &&
          (loadingDeployments ? (
            <div className="py-12 text-center text-gray-500 text-sm">{t('common.loading')}</div>
          ) : deploymentList.length > 0 ? (
            <DeploymentsPanel deployments={deploymentList} />
          ) : (
            <div className="py-12 text-center text-gray-600 text-sm">
              <Box size={24} className="mx-auto mb-2 text-gray-700" />
              {t('monitoring.noDeploymentsFound')}
            </div>
          ))}

        {activeTab === 'costs' &&
          (loadingCosts || loadingNamespaces ? (
            <div className="py-12 text-center text-gray-500 text-sm">{t('common.loading')}</div>
          ) : (
            <CostsPanel
              overview={costOverview}
              namespaceCosts={namespaceCosts}
              loadingNamespaceCosts={loadingNamespaceCosts}
            />
          ))}

        {activeTab === 'activity' &&
          (loadingActivity ? (
            <div className="py-12 text-center text-gray-500 text-sm">{t('common.loading')}</div>
          ) : (
            <ActivityPanel activities={activities} />
          ))}
      </div>
    </div>
  )
}
