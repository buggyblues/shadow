import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Box,
  CheckCircle,
  Clock,
  FileCode,
  FolderOpen,
  Layers,
  Rocket,
  ShoppingBag,
  Stethoscope,
  XCircle,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/Badge'
import { StatCard } from '@/components/StatCard'
import { StatusDot } from '@/components/StatusDot'
import { api, type Deployment } from '@/lib/api'
import { getRelativeTime } from '@/lib/utils'
import { useRecentActivities } from '@/stores/app'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isReady(dep: Deployment): boolean {
  const [r = 0, t = 0] = dep.ready.split('/').map(Number)
  return r === t && t > 0
}

// ── Quick Actions ─────────────────────────────────────────────────────────────

function QuickActions() {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Link to="/store" className="nf-card nf-bouncy group !p-4">
        <ShoppingBag size={20} className="mb-2" style={{ color: 'var(--color-nf-cyan)' }} />
        <p className="text-sm font-bold transition-colors" style={{ color: 'var(--nf-text-high)' }}>
          {t('nav.agentStore')}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--nf-text-muted)' }}>
          {t('overview.browseAndDeploy')}
        </p>
      </Link>
      <Link to="/clusters" className="nf-card nf-bouncy group !p-4">
        <Layers size={20} className="text-green-400 mb-2" />
        <p className="text-sm font-bold transition-colors" style={{ color: 'var(--nf-text-high)' }}>
          {t('nav.clusters')}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--nf-text-muted)' }}>
          {t('overview.managedDeployments')}
        </p>
      </Link>
      <Link to="/my-templates" className="nf-card nf-bouncy group !p-4">
        <FileCode size={20} className="text-purple-400 mb-2" />
        <p className="text-sm font-bold transition-colors" style={{ color: 'var(--nf-text-high)' }}>
          {t('nav.myTemplates')}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--nf-text-muted)' }}>
          {t('overview.editAgentConfig')}
        </p>
      </Link>
      <Link to="/monitoring" className="nf-card nf-bouncy group !p-4">
        <BarChart3 size={20} className="mb-2" style={{ color: 'var(--color-nf-yellow)' }} />
        <p className="text-sm font-bold transition-colors" style={{ color: 'var(--nf-text-high)' }}>
          {t('nav.monitoring')}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--nf-text-muted)' }}>
          {t('overview.healthEvents')}
        </p>
      </Link>
    </div>
  )
}

// ── Recent Deployments ────────────────────────────────────────────────────────

function RecentDeployments({ deployments }: { deployments: Deployment[] }) {
  const recent = deployments.slice(0, 5)

  if (recent.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-600">
        <Rocket size={24} className="mx-auto mb-2 text-gray-700" />
        No deployments yet.{' '}
        <Link to="/store" className="text-blue-400 hover:text-blue-300">
          Deploy your first agent team.
        </Link>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-800/50">
      {recent.map((dep) => {
        const ready = isReady(dep)
        return (
          <Link
            key={`${dep.namespace}/${dep.name}`}
            to="/deployments/$namespace/$id"
            params={{ namespace: dep.namespace, id: dep.name }}
            className="flex items-center justify-between py-3 hover:bg-gray-800/20 px-3 -mx-3 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <StatusDot status={ready ? 'success' : 'warning'} />
              <div className="min-w-0">
                <p className="text-sm font-mono text-gray-200 truncate">{dep.name}</p>
                <p className="text-[10px] text-gray-600">{dep.namespace}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={ready ? 'success' : 'warning'} size="sm">
                {dep.ready}
              </Badge>
              <ArrowRight size={12} className="text-gray-600" />
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ── Recent Activity ───────────────────────────────────────────────────────────

function RecentActivity() {
  const activities = useRecentActivities(5)

  const typeIcons: Record<string, React.ReactNode> = {
    deploy: <Rocket size={11} className="text-green-400" />,
    destroy: <XCircle size={11} className="text-red-400" />,
    scale: <BarChart3 size={11} className="text-blue-400" />,
    config: <FileCode size={11} className="text-yellow-400" />,
    init: <Box size={11} className="text-purple-400" />,
    settings: <Activity size={11} className="text-cyan-400" />,
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-600">
        <Clock size={24} className="mx-auto mb-2 text-gray-700" />
        No recent activity.
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-800/50">
      {activities.map((a) => (
        <div key={a.id} className="flex items-start gap-3 py-2.5">
          <div className="mt-0.5 p-1 bg-gray-800 rounded">
            {typeIcons[a.type] ?? <Activity size={11} className="text-gray-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-300 truncate">{a.title}</p>
            <p className="text-[10px] text-gray-600">{getRelativeTime(a.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── System Health Summary ─────────────────────────────────────────────────────

function HealthSummary() {
  const {
    data: doctor,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['doctor'],
    queryFn: api.doctor,
    staleTime: 30_000,
  })

  if (isLoading) {
    return <div className="py-4 text-center text-xs text-gray-600">Checking health...</div>
  }

  if (!doctor) {
    return <div className="py-4 text-center text-xs text-gray-600">Health check unavailable</div>
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 mb-3">
        <Badge variant="success" icon={<CheckCircle size={10} />} size="sm">
          {doctor.summary.pass} pass
        </Badge>
        {doctor.summary.warn > 0 && (
          <Badge variant="warning" size="sm">
            {doctor.summary.warn} warn
          </Badge>
        )}
        {doctor.summary.fail > 0 && (
          <Badge variant="error" size="sm">
            {doctor.summary.fail} fail
          </Badge>
        )}
      </div>
      {doctor.checks.map((check) => (
        <div key={check.name} className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-400 truncate flex-1">{check.name}</span>
          <span className="text-[10px] text-gray-600 truncate max-w-[120px]" title={check.message}>
            {check.message}
          </span>
          <StatusDot
            status={
              check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'error'
            }
            size="sm"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => refetch()}
        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2"
      >
        <Stethoscope size={10} /> Re-run checks
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function OverviewPage() {
  const { t } = useTranslation()
  const { data: deployments, isLoading } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.deployments.list,
    refetchInterval: 10_000,
  })

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: api.templates.list,
  })

  const total = deployments?.length ?? 0
  const ready = deployments?.filter(isReady).length ?? 0
  const namespaces = new Set(deployments?.map((d) => d.namespace) ?? []).size
  const templateCount = templates?.length ?? 0

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div
          className="flex items-center gap-2 text-sm mb-1"
          style={{ color: 'var(--color-nf-cyan)' }}
        >
          <Zap size={14} />
          <span className="font-bold">{t('overview.title')}</span>
        </div>
        <h1 className="text-2xl font-black">{t('overview.subtitle')}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--nf-text-muted)' }}>
          {t('overview.description')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t('overview.deployments')}
          value={total}
          icon={<Box size={13} />}
          color="default"
          onClick={() => {}}
        />
        <StatCard
          label={t('overview.ready')}
          value={ready}
          icon={<CheckCircle size={13} />}
          color="green"
        />
        <StatCard
          label={t('overview.namespaces')}
          value={namespaces}
          icon={<FolderOpen size={13} />}
          color="blue"
        />
        <StatCard
          label={t('overview.templates')}
          value={templateCount}
          icon={<ShoppingBag size={13} />}
          color="purple"
        />
      </div>

      {/* Quick Actions */}
      <section className="mb-8">
        <h2
          className="text-sm font-bold mb-3 flex items-center gap-2"
          style={{ color: 'var(--nf-text-mid)' }}
        >
          <Zap size={13} />
          {t('overview.quickActions')}
        </h2>
        <QuickActions />
      </section>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent Deployments */}
        <div className="lg:col-span-2">
          <div className="nf-card">
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--nf-border)' }}
            >
              <h2
                className="text-sm font-bold flex items-center gap-2"
                style={{ color: 'var(--nf-text-high)' }}
              >
                <Layers size={14} style={{ color: 'var(--nf-text-muted)' }} />
                {t('overview.recentDeployments')}
              </h2>
              <Link
                to="/clusters"
                className="text-xs flex items-center gap-1"
                style={{ color: 'var(--color-nf-cyan)' }}
              >
                {t('common.viewAll')} <ArrowRight size={10} />
              </Link>
            </div>
            <div className="p-5">
              {isLoading ? (
                <div className="py-8 text-center text-xs text-gray-600">Loading...</div>
              ) : (
                <RecentDeployments deployments={deployments ?? []} />
              )}
            </div>
          </div>
        </div>

        {/* Right: Activity + Health */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <div className="nf-card">
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--nf-border)' }}
            >
              <h2
                className="text-sm font-bold flex items-center gap-2"
                style={{ color: 'var(--nf-text-high)' }}
              >
                <Activity size={14} style={{ color: 'var(--nf-text-muted)' }} />
                {t('overview.recentActivity')}
              </h2>
              <Link
                to="/activity"
                className="text-xs flex items-center gap-1"
                style={{ color: 'var(--color-nf-cyan)' }}
              >
                {t('common.viewAll')} <ArrowRight size={10} />
              </Link>
            </div>
            <div className="p-5">
              <RecentActivity />
            </div>
          </div>

          {/* System Health */}
          <div className="nf-card">
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--nf-border)' }}>
              <h2
                className="text-sm font-bold flex items-center gap-2"
                style={{ color: 'var(--nf-text-high)' }}
              >
                <Stethoscope size={14} style={{ color: 'var(--nf-text-muted)' }} />
                {t('overview.systemHealth')}
              </h2>
            </div>
            <div className="p-5">
              <HealthSummary />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
