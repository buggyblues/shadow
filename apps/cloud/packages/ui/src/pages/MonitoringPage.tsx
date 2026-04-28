import {
  Badge,
  Button,
  EmptyState,
  GlassCard,
  GlassPanel,
  GlassSurface,
  NativeSelect,
  Search,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
} from '@shadowob/ui'
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
import { DashboardLoadingState } from '@/components/DashboardState'
import { DashboardTabsList } from '@/components/DashboardTabsList'
import { PageShell } from '@/components/PageShell'
import { StatCard } from '@/components/StatCard'
import { StatsGrid } from '@/components/StatsGrid'
import { StatusDot, type StatusType } from '@/components/StatusDot'
import { useDebounce } from '@/hooks/useDebounce'
import {
  type CostOverviewSummary,
  type Deployment,
  type DoctorCheck,
  type DoctorResult,
  type NamespaceCostSummary,
  type ProviderUsageSummary,
} from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
import { formatDisplayCost, formatTokenCount, formatUsdCost } from '@/lib/store-data'
import { formatTimestamp, getRelativeTime, isDeploymentReady } from '@/lib/utils'
import { type ActivityEntry, type ActivityType } from '@/stores/app'

function formatTokenLabel(value: number | null, locale: string, tokenLabel: string): string {
  if (value === null) return '—'
  return `${formatTokenCount(value, locale)} ${tokenLabel}`
}

function getProviderMetricDisplay(
  provider: ProviderUsageSummary,
  options: {
    billingUnit: 'usd' | 'shrimp'
    locale: string
    tokenLabel: string
  },
): { primary: string; secondary: string | null } {
  const tokenText =
    provider.totalTokens !== null
      ? formatTokenLabel(provider.totalTokens, options.locale, options.tokenLabel)
      : null
  const usageText = provider.usageLabel ?? provider.raw ?? null

  if (options.billingUnit === 'shrimp') {
    return {
      primary: tokenText ?? usageText ?? '—',
      secondary: usageText && usageText !== tokenText ? usageText : null,
    }
  }

  return {
    primary: formatUsdCost(provider.amountUsd, options.locale),
    secondary: tokenText ?? usageText,
  }
}

function doctorStatusToStatusType(status: DoctorCheck['status']): StatusType {
  if (status === 'pass') return 'success'
  if (status === 'warn') return 'warning'
  return 'error'
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
    variant: 'success' | 'danger' | 'info' | 'warning' | 'neutral'
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
      variant: 'danger',
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
      variant: 'neutral',
    },
    settings: {
      label: translate('activity.types.settings'),
      icon: <Settings size={12} />,
      variant: 'neutral',
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
        icon={Activity}
        title={t('activity.noActivityRecorded')}
        description={t('activity.operationsWillAppear')}
      />
    )
  }

  return (
    <div>
      {visibleActivities.map((activity) => {
        const config = activityTypeConfig[activity.type as keyof typeof activityTypeConfig] ?? {
          label: activity.type,
          icon: <Activity size={12} />,
          variant: 'neutral' as const,
        }
        const time = new Date(activity.timestamp)
        const isValidDate = !Number.isNaN(time.getTime())

        return (
          <div
            key={activity.id}
            className="flex gap-4 py-3 border-b border-border-subtle last:border-0 hover:bg-bg-modifier-hover transition-colors px-4 -mx-4 rounded-lg"
          >
            <div className="mt-1 p-2 bg-bg-secondary rounded-lg shrink-0">{config.icon}</div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-sm font-medium text-text-primary">{activity.title}</p>
                <Badge variant={config.variant} size="sm">
                  {config.label}
                </Badge>
              </div>

              {activity.detail && <p className="text-xs text-text-muted mb-1">{activity.detail}</p>}

              <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {isValidDate ? time.toLocaleString() : '—'}
                </span>
                {activity.namespace && <span className="font-mono">ns: {activity.namespace}</span>}
                {activity.template && <span className="font-mono">tpl: {activity.template}</span>}
              </div>
            </div>

            <span className="text-xs text-text-muted shrink-0 mt-1">
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
          <Badge variant="success">
            <CheckCircle size={11} />
            {doctor.summary.pass} {t('monitoring.passed')}
          </Badge>
          {doctor.summary.warn > 0 && (
            <Badge variant="warning">
              <AlertTriangle size={11} />
              {doctor.summary.warn} {t('monitoring.warnings')}
            </Badge>
          )}
          {doctor.summary.fail > 0 && (
            <Badge variant="danger">
              <XCircle size={11} />
              {doctor.summary.fail} {t('monitoring.failed')}
            </Badge>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--glass-line)] divide-y divide-[var(--glass-line-soft)]">
        {doctor.checks.map((check) => (
          <div key={check.name} className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <StatusDot status={doctorStatusToStatusType(check.status)} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{check.name}</p>
                <p className="text-xs text-text-muted">{check.message}</p>
              </div>
            </div>

            <Badge
              variant={
                check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'danger'
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
      <p className="text-sm text-text-muted">
        {t('monitoring.deploymentsAcross', {
          deployments: deployments.length,
          namespaces: namespaces.length,
        })}
      </p>

      <div className="overflow-hidden rounded-2xl border border-[var(--glass-line)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('monitoring.status')}</TableHead>
              <TableHead>{t('monitoring.name')}</TableHead>
              <TableHead>{t('monitoring.namespace')}</TableHead>
              <TableHead>{t('monitoring.ready')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>

          <TableBody>
            {deployments.map((deployment) => {
              const ready = isDeploymentReady(deployment.ready)

              return (
                <TableRow key={`${deployment.namespace}/${deployment.name}`}>
                  <TableCell>
                    <StatusDot status={ready ? 'success' : 'warning'} pulse={!ready} />
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/deployments/$namespace"
                      params={{ namespace: deployment.namespace }}
                      className="text-sm font-mono text-blue-400 hover:text-blue-300"
                    >
                      {deployment.name}
                    </Link>
                  </TableCell>
                  <TableCell>{deployment.namespace}</TableCell>
                  <TableCell>
                    <Badge variant={ready ? 'success' : 'warning'} size="sm">
                      {deployment.ready}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/deployments/$namespace"
                      params={{ namespace: deployment.namespace }}
                      className="text-text-muted hover:text-text-primary"
                    >
                      <ArrowRight size={13} />
                    </Link>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
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
        ready: items.filter((deployment) => isDeploymentReady(deployment.ready)).length,
        deployments: items,
      }))
      .sort((left, right) => right.total - left.total)
  }, [deployments])

  const topCostNamespaces = useMemo(() => {
    return [...(costOverview?.namespaces ?? [])]
      .sort((left, right) => {
        const leftCost = left.billingAmount ?? left.totalUsd
        const rightCost = right.billingAmount ?? right.totalUsd
        if (leftCost === null && rightCost === null) return 0
        if (leftCost === null) return 1
        if (rightCost === null) return -1
        return rightCost - leftCost
      })
      .slice(0, 4)
  }, [costOverview?.namespaces])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <GlassCard className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Stethoscope size={16} style={{ color: 'var(--color-nf-cyan)' }} />
            <h2 className="text-sm font-black text-text-primary">
              {t('monitoring.latestHealthFindings')}
            </h2>
          </div>

          {doctor ? (
            issues.length > 0 ? (
              <div className="space-y-3">
                {issues.slice(0, 4).map((check) => (
                  <GlassSurface
                    key={check.name}
                    className="rounded-2xl border border-border-subtle px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusDot status={doctorStatusToStatusType(check.status)} />
                        <p className="text-sm font-medium truncate text-text-primary">
                          {check.name}
                        </p>
                      </div>
                      <Badge
                        variant={
                          check.status === 'pass'
                            ? 'success'
                            : check.status === 'warn'
                              ? 'warning'
                              : 'danger'
                        }
                        size="sm"
                      >
                        {t(`monitoring.statusLabels.${check.status}`)}
                      </Badge>
                    </div>
                    <p className="text-xs text-text-secondary">{check.message}</p>
                  </GlassSurface>
                ))}
              </div>
            ) : (
              <GlassSurface className="rounded-2xl border border-border-subtle px-4 py-4 text-sm text-text-secondary">
                {t('monitoring.allSystemsHealthy')}
              </GlassSurface>
            )
          ) : (
            <div className="text-sm text-text-muted">{t('monitoring.runningHealthChecks')}</div>
          )}
        </GlassCard>

        <GlassCard className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <DollarSign size={16} style={{ color: 'var(--color-nf-yellow)' }} />
            <h2 className="text-sm font-black text-text-primary">{t('monitoring.costSnapshot')}</h2>
          </div>

          {costOverview ? (
            <>
              <div>
                <div className="text-2xl font-black text-green-400">
                  {formatDisplayCost(costOverview, {
                    locale: i18n.language,
                    shrimpUnitLabel: t('deploy.shrimpCoins'),
                  })}
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {t('deployments.totalTokens')}:{' '}
                  {formatTokenCount(costOverview.totalTokens, i18n.language)}
                </p>
                <p className="text-xs mt-1 text-text-muted">
                  {t('deployments.generatedAt')}
                  {': '}
                  {formatTimestamp(costOverview.generatedAt)}
                </p>
              </div>

              <div className="space-y-2">
                {topCostNamespaces.length > 0 ? (
                  topCostNamespaces.map((item) => (
                    <Link
                      key={item.namespace}
                      to="/deployments/$namespace"
                      params={{ namespace: item.namespace }}
                      className="block"
                    >
                      <GlassSurface className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle px-4 py-3 transition-colors hover:bg-bg-modifier-hover">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate text-text-primary">
                            {item.namespace}
                          </p>
                          <p className="text-xs text-text-muted">
                            {item.totalTokens !== null && (
                              <>
                                {t('deployments.totalTokens')}:{' '}
                                {formatTokenCount(item.totalTokens, i18n.language)} ·{' '}
                              </>
                            )}
                            {t('deployments.availableAgents')}: {item.availableAgents} ·{' '}
                            {t('deployments.unavailableAgents')}: {item.unavailableAgents}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-green-400 shrink-0">
                          {formatDisplayCost(item, {
                            locale: i18n.language,
                            shrimpUnitLabel: t('deploy.shrimpCoins'),
                          })}
                        </span>
                      </GlassSurface>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-text-muted">
                    {t('deployments.costUnavailableDescription')}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-text-muted">{t('common.loading')}</p>
          )}
        </GlassCard>

        <GlassCard className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} style={{ color: 'var(--color-nf-cyan)' }} />
            <h2 className="text-sm font-black text-text-primary">
              {t('monitoring.namespaceInventory')}
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <GlassSurface className="rounded-2xl p-4">
              <div className="text-xs mb-1 text-text-muted">
                {t('monitoring.configuredNamespaces')}
              </div>
              <div className="text-lg font-black text-text-primary">
                {namespaces?.configured.length ?? 0}
              </div>
            </GlassSurface>
            <GlassSurface className="rounded-2xl p-4">
              <div className="text-xs mb-1 text-text-muted">
                {t('monitoring.discoveredNamespaces')}
              </div>
              <div className="text-lg font-black text-text-primary">
                {namespaces?.discovered.length ?? 0}
              </div>
            </GlassSurface>
            <GlassSurface className="rounded-2xl p-4">
              <div className="text-xs mb-1 text-text-muted">
                {t('monitoring.trackedNamespaces')}
              </div>
              <div className="text-lg font-black text-text-primary">
                {namespaces?.all.length ?? 0}
              </div>
            </GlassSurface>
          </div>

          <div className="flex flex-wrap gap-2">
            {(namespaces?.all ?? []).map((namespace) => (
              <Button key={namespace} asChild variant="secondary" size="sm">
                <Link to="/deployments/$namespace" params={{ namespace }}>
                  <span>{namespace}</span>
                </Link>
              </Button>
            ))}
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
        <GlassCard className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity size={16} style={{ color: 'var(--color-nf-cyan)' }} />
              <h2 className="text-sm font-black text-text-primary">
                {t('monitoring.recentActivity')}
              </h2>
            </div>
            <span className="text-xs text-text-muted">
              {activities.length} {t('activity.activities')}
            </span>
          </div>

          <ActivityList activities={activities} limit={6} />
        </GlassCard>

        <GlassCard className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Box size={16} style={{ color: 'var(--color-nf-cyan)' }} />
            <h2 className="text-sm font-black text-text-primary">
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
                  className="block"
                >
                  <GlassSurface className="block rounded-2xl border border-border-subtle px-4 py-3 transition-colors hover:bg-bg-modifier-hover">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-text-primary">{group.namespace}</p>
                      <Badge
                        variant={group.ready === group.total ? 'success' : 'warning'}
                        size="sm"
                      >
                        {group.ready}/{group.total}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs text-text-muted">
                      {group.deployments.map((deployment) => deployment.name).join(', ')}
                    </p>
                  </GlassSurface>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Box}
              title={t('monitoring.noDeploymentsFound')}
              description={t('deployments.noDeploymentsYet')}
            />
          )}
        </GlassCard>
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
        icon={DollarSign}
        title={t('deployments.costUnavailable')}
        description={t('deployments.costUnavailableDescription')}
      />
    )
  }

  return (
    <div className="space-y-6">
      <StatsGrid className="mb-0 grid-cols-1 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label={t('deployments.totalCost')}
          value={formatDisplayCost(overview, {
            locale: i18n.language,
            shrimpUnitLabel: t('deploy.shrimpCoins'),
          })}
          icon={<DollarSign size={13} />}
          color="green"
        />
        <StatCard
          label={t('deployments.totalTokens')}
          value={formatTokenCount(overview.totalTokens, i18n.language)}
          icon={<Activity size={13} />}
          color="purple"
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
      </StatsGrid>

      <div className="text-xs text-text-muted">
        {t('deployments.generatedAt')}: {formatTimestamp(overview.generatedAt)}
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
            <GlassCard key={item.namespace} className="p-4 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to="/deployments/$namespace"
                      params={{ namespace: item.namespace }}
                      className="text-base font-black hover:opacity-85 transition-opacity text-text-primary"
                    >
                      {item.namespace}
                    </Link>
                    {detailStatus && (
                      <Badge variant={item.totalUsd !== null ? 'success' : 'neutral'} size="sm">
                        {t(`monitoring.costSources.${detailStatus}`)}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs mt-1 text-text-muted">
                    {item.totalTokens !== null && (
                      <>
                        {t('deployments.totalTokens')}:{' '}
                        {formatTokenCount(item.totalTokens, i18n.language)} ·{' '}
                      </>
                    )}
                    {t('deployments.availableAgents')}: {item.availableAgents} ·{' '}
                    {t('deployments.unavailableAgents')}: {item.unavailableAgents}
                  </p>
                </div>

                <div className="min-w-0 shrink-0 text-left md:max-w-[14rem] md:text-right">
                  <p className="break-words text-lg font-semibold leading-tight text-green-400">
                    {formatDisplayCost(item, {
                      locale: i18n.language,
                      shrimpUnitLabel: t('deploy.shrimpCoins'),
                    })}
                  </p>
                  <p className="text-xs text-text-muted">{t('deployments.totalCost')}</p>
                </div>
              </div>

              {detail ? (
                detail.agents.length > 0 ? (
                  <div className="space-y-3">
                    {detail.agents.map((agent) => (
                      <GlassSurface
                        key={`${detail.namespace}-${agent.agentName}`}
                        className="rounded-2xl border border-border-subtle px-4 py-3"
                      >
                        <div className="mb-2 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-mono truncate text-text-primary">
                                {agent.agentName}
                              </p>
                              <Badge
                                variant={agent.totalUsd !== null ? 'success' : 'neutral'}
                                size="sm"
                              >
                                {t(`monitoring.costSources.${agent.source}`)}
                              </Badge>
                            </div>

                            <p className="text-xs mt-1 text-text-muted">
                              {agent.podName ?? t('common.none')}
                            </p>
                          </div>

                          <div className="min-w-0 shrink-0 text-left md:max-w-[14rem] md:text-right">
                            <p className="break-words text-sm font-semibold text-green-400">
                              {formatDisplayCost(agent, {
                                locale: i18n.language,
                                shrimpUnitLabel: t('deploy.shrimpCoins'),
                              })}
                            </p>
                            <p className="text-xs text-text-muted">{t('deployments.totalCost')}</p>
                            <p className="mt-1 text-xs text-text-muted">
                              {formatTokenLabel(
                                agent.totalTokens,
                                i18n.language,
                                t('deployments.tokens'),
                              )}
                            </p>
                          </div>
                        </div>

                        {agent.providers.length > 0 ? (
                          <div className="space-y-2">
                            {agent.providers.map((provider) => {
                              const providerDisplay = getProviderMetricDisplay(provider, {
                                billingUnit: detail.billingUnit,
                                locale: i18n.language,
                                tokenLabel: t('deployments.tokens'),
                              })

                              return (
                                <div
                                  key={`${agent.agentName}-${provider.provider}`}
                                  className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                                >
                                  <span className="text-text-secondary">{provider.provider}</span>
                                  <div className="min-w-0 text-left sm:text-right">
                                    <p className="break-words text-text-primary">
                                      {providerDisplay.primary}
                                    </p>
                                    {providerDisplay.secondary ? (
                                      <p className="break-words text-text-muted">
                                        {providerDisplay.secondary}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-text-muted">
                            {t('deployments.noProvidersReported')}
                          </p>
                        )}

                        {agent.message && (
                          <p className="text-xs text-yellow-500 mt-3">{agent.message}</p>
                        )}
                      </GlassSurface>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">
                    {t('deployments.costUnavailableDescription')}
                  </p>
                )
              ) : (
                <p className="text-sm text-text-muted">
                  {loadingNamespaceCosts ? t('monitoring.loadingCostDetails') : t('common.loading')}
                </p>
              )}
            </GlassCard>
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
        <Search value={search} onChange={setSearch} placeholder={t('activity.searchActivities')} />

        <div className="flex items-center gap-2">
          <Filter size={12} className="text-text-muted" />
          <NativeSelect
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as ActivityType | 'all')}
          >
            <option value="all">{t('activity.allTypes')}</option>
            {ALL_ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {activityTypeConfig[type].label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSortOrder((current) => (current === 'newest' ? 'oldest' : 'newest'))}
        >
          <ArrowUpDown size={11} />
          {sortOrder === 'newest' ? t('activity.newestFirst') : t('activity.oldestFirst')}
        </Button>
      </div>

      <div className="flex items-center gap-6 text-xs text-text-muted">
        <span className="flex items-center gap-2">
          <Activity size={12} />
          {activities.length} {t('activity.total')}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
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
  const api = useApiClient()
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
  const readyDeployments = deploymentList.filter((deployment) =>
    isDeploymentReady(deployment.ready),
  ).length
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

  const tabPanelClassName = 'rounded-[28px] p-4 md:p-5 lg:p-6'

  return (
    <PageShell
      breadcrumb={[]}
      title={t('monitoring.title')}
      description={t('monitoring.description')}
      actions={
        <Button type="button" variant="ghost" size="sm" onClick={handleRefresh}>
          <RefreshCw size={12} />
          {t('common.refresh')}
        </Button>
      }
      headerContent={
        <div className="space-y-4">
          <StatsGrid className="grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
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
              value={formatDisplayCost(costOverview ?? {}, {
                locale: i18n.language,
                shrimpUnitLabel: t('deploy.shrimpCoins'),
              })}
              icon={<DollarSign size={13} />}
              color="green"
            />
            <StatCard
              label={t('deployments.totalTokens')}
              value={formatTokenCount(costOverview?.totalTokens ?? null, i18n.language)}
              icon={<Activity size={13} />}
              color="purple"
            />
            <StatCard
              label={t('deployments.unavailableAgents')}
              value={unavailableCostAgents}
              icon={<AlertTriangle size={13} />}
              color={unavailableCostAgents > 0 ? 'yellow' : 'default'}
            />
          </StatsGrid>

          <Tabs value={activeTab} onChange={setActiveTab}>
            <DashboardTabsList tabs={tabs} />
          </Tabs>
        </div>
      }
    >
      <div className="min-h-[40vh]">
        {activeTab === 'overview' && (
          <GlassPanel className={tabPanelClassName}>
            <OverviewPanel
              doctor={doctor}
              deployments={deploymentList}
              namespaces={namespaces}
              costOverview={costOverview}
              activities={activities}
            />
          </GlassPanel>
        )}

        {activeTab === 'health' &&
          (loadingDoctor ? (
            <GlassPanel className={tabPanelClassName}>
              <div className="min-h-[22vh] py-10 text-center text-sm text-text-muted">
                {t('monitoring.runningHealthChecks')}
              </div>
            </GlassPanel>
          ) : doctor ? (
            <GlassPanel className={tabPanelClassName}>
              <HealthPanel doctor={doctor} />
            </GlassPanel>
          ) : (
            <GlassPanel className={tabPanelClassName}>
              <div className="min-h-[22vh] py-10 text-center text-sm text-text-muted">
                {t('monitoring.failedHealthChecks')}
              </div>
            </GlassPanel>
          ))}

        {activeTab === 'deployments' &&
          (loadingDeployments ? (
            <GlassPanel className={tabPanelClassName}>
              <DashboardLoadingState inline className="py-10" />
            </GlassPanel>
          ) : deploymentList.length > 0 ? (
            <GlassPanel className={tabPanelClassName}>
              <DeploymentsPanel deployments={deploymentList} />
            </GlassPanel>
          ) : (
            <GlassPanel className={tabPanelClassName}>
              <EmptyState
                icon={Box}
                title={t('monitoring.noDeploymentsFound')}
                description={t('deployments.noDeploymentsYet')}
              />
            </GlassPanel>
          ))}

        {activeTab === 'costs' &&
          (loadingCosts || loadingNamespaces ? (
            <GlassPanel className={tabPanelClassName}>
              <DashboardLoadingState inline className="py-10" />
            </GlassPanel>
          ) : (
            <GlassPanel className={tabPanelClassName}>
              <CostsPanel
                overview={costOverview}
                namespaceCosts={namespaceCosts}
                loadingNamespaceCosts={loadingNamespaceCosts}
              />
            </GlassPanel>
          ))}

        {activeTab === 'activity' &&
          (loadingActivity ? (
            <GlassPanel className={tabPanelClassName}>
              <DashboardLoadingState inline className="py-10" />
            </GlassPanel>
          ) : (
            <GlassPanel className={tabPanelClassName}>
              <ActivityPanel activities={activities} />
            </GlassPanel>
          ))}
      </div>
    </PageShell>
  )
}
