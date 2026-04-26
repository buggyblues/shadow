import { Badge, Button, Card, GlassPanel } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
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
import { PageShell } from '@/components/PageShell'
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
      <Card variant="surface">
        <Link to="/store" className="block">
          <ShoppingBag size={20} className="mb-2 text-primary" />
          <p className="text-sm font-bold text-text-primary transition-colors">
            {t('nav.agentStore')}
          </p>
          <p className="text-xs mt-0.5 text-text-muted">{t('overview.browseAndDeploy')}</p>
        </Link>
      </Card>
      <Card variant="surface">
        <Link to="/deployments" className="block">
          <Layers size={20} className="text-green-400 mb-2" />
          <p className="text-sm font-bold text-text-primary transition-colors">
            {t('nav.deployments')}
          </p>
          <p className="text-xs mt-0.5 text-text-muted">{t('overview.managedDeployments')}</p>
        </Link>
      </Card>
      <Card variant="surface">
        <Link to="/my-templates" className="block">
          <FileCode size={20} className="text-purple-400 mb-2" />
          <p className="text-sm font-bold text-text-primary transition-colors">
            {t('nav.myTemplates')}
          </p>
          <p className="text-xs mt-0.5 text-text-muted">{t('overview.editAgentConfig')}</p>
        </Link>
      </Card>
      <Card variant="surface">
        <Link to="/monitoring" className="block">
          <BarChart3 size={20} className="mb-2 text-warning" />
          <p className="text-sm font-bold text-text-primary transition-colors">
            {t('nav.monitoring')}
          </p>
          <p className="text-xs mt-0.5 text-text-muted">{t('overview.healthEvents')}</p>
        </Link>
      </Card>
    </div>
  )
}

// ── Recent Deployments ────────────────────────────────────────────────────────

function RecentDeployments({ deployments }: { deployments: Deployment[] }) {
  const { t } = useTranslation()
  const recent = deployments.slice(0, 5)

  if (recent.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-text-muted">
        <Rocket size={24} className="mx-auto mb-2 text-text-secondary" />
        {t('overview.noDeploymentsYet')}{' '}
        <Link to="/store" className="text-blue-400 hover:text-blue-300">
          {t('overview.deployFirstAgent')}
        </Link>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border-subtle">
      {recent.map((dep) => {
        const ready = isReady(dep)
        return (
          <Link
            key={`${dep.namespace}/${dep.name}`}
            to="/deployments/$namespace"
            params={{ namespace: dep.namespace }}
            className="flex items-center justify-between py-3 hover:bg-bg-modifier-hover px-3 -mx-3 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <StatusDot status={ready ? 'success' : 'warning'} />
              <div className="min-w-0">
                <p className="text-sm font-mono text-text-primary truncate">{dep.name}</p>
                <p className="text-[10px] text-text-muted">{dep.namespace}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={ready ? 'success' : 'warning'} size="sm">
                {dep.ready}
              </Badge>
              <ArrowRight size={12} className="text-text-muted" />
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ── Recent Activity ───────────────────────────────────────────────────────────

function RecentActivity() {
  const { t } = useTranslation()
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
      <div className="text-center py-8 text-sm text-text-muted">
        <Clock size={24} className="mx-auto mb-2 text-text-secondary" />
        {t('overview.noRecentActivity')}
      </div>
    )
  }

  return (
    <div className="divide-y divide-border-subtle">
      {activities.map((a) => (
        <div key={a.id} className="flex items-start gap-3 py-2.5">
          <div className="mt-0.5 p-1 bg-bg-secondary rounded">
            {typeIcons[a.type] ?? <Activity size={11} className="text-text-muted" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-secondary truncate">{a.title}</p>
            <p className="text-[10px] text-text-muted">{getRelativeTime(a.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── System Health Summary ─────────────────────────────────────────────────────

function HealthSummary() {
  const { t } = useTranslation()
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
    return (
      <div className="py-4 text-center text-xs text-text-muted">{t('overview.checkingHealth')}</div>
    )
  }

  if (!doctor) {
    return (
      <div className="py-4 text-center text-xs text-text-muted">
        {t('overview.healthUnavailable')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 mb-3">
        <Badge variant="success" size="sm">
          <CheckCircle size={10} />
          {doctor.summary.pass} {t('overview.pass')}
        </Badge>
        {doctor.summary.warn > 0 && (
          <Badge variant="warning" size="sm">
            {doctor.summary.warn} {t('overview.warn')}
          </Badge>
        )}
        {doctor.summary.fail > 0 && (
          <Badge variant="danger" size="sm">
            {doctor.summary.fail} {t('overview.fail')}
          </Badge>
        )}
      </div>
      {doctor.checks.map((check) => (
        <div key={check.name} className="flex items-center justify-between gap-2">
          <span className="text-xs text-text-secondary truncate flex-1">{check.name}</span>
          <span
            className="text-[10px] text-text-muted truncate max-w-[120px]"
            title={check.message}
          >
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
      <Button type="button" variant="ghost" size="sm" onClick={() => refetch()}>
        <Stethoscope size={10} /> {t('overview.reRunChecks')}
      </Button>
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
    staleTime: 5_000,
  })

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: api.templates.list,
    staleTime: 30_000,
  })

  const navigate = useNavigate()
  const total = deployments?.length ?? 0
  const ready = deployments?.filter(isReady).length ?? 0
  const namespaces = new Set(deployments?.map((d) => d.namespace) ?? []).size
  const templateCount = templates?.length ?? 0

  return (
    <PageShell
      breadcrumb={[{ label: t('overview.title') }]}
      title={t('overview.subtitle')}
      description={t('overview.description')}
      headerContent={
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label={t('overview.deployments')}
            value={total}
            icon={<Box size={13} />}
            color="default"
            onClick={() => navigate({ to: '/deployments' })}
          />
          <StatCard
            label={t('overview.ready')}
            value={ready}
            icon={<CheckCircle size={13} />}
            color="green"
            onClick={() => navigate({ to: '/deployments' })}
          />
          <StatCard
            label={t('overview.namespaces')}
            value={namespaces}
            icon={<FolderOpen size={13} />}
            color="blue"
            onClick={() => navigate({ to: '/deployments' })}
          />
          <StatCard
            label={t('overview.templates')}
            value={templateCount}
            icon={<ShoppingBag size={13} />}
            color="purple"
            onClick={() => navigate({ to: '/store' })}
          />
        </div>
      }
    >
      {/* Quick Actions */}
      <GlassPanel as="section" className="p-6">
        <h2 className="mb-3 text-sm font-bold flex items-center gap-2 text-text-secondary">
          <Zap size={13} />
          {t('overview.quickActions')}
        </h2>
        <QuickActions />
      </GlassPanel>

      {/* Two column layout */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        {/* Left: Recent Deployments */}
        <div className="xl:col-span-3">
          <Card variant="surface">
            <div className="px-5 py-4 flex items-center justify-between border-b border-border-subtle">
              <h2 className="text-sm font-bold flex items-center gap-2 text-text-primary">
                <Layers size={14} className="text-text-muted" />
                {t('overview.recentDeployments')}
              </h2>
              <Link to="/deployments" className="text-xs flex items-center gap-1 text-primary">
                {t('common.viewAll')} <ArrowRight size={10} />
              </Link>
            </div>
            <div className="p-5">
              {isLoading ? (
                <div className="py-8 text-center text-xs text-text-muted">
                  {t('common.loading')}
                </div>
              ) : (
                <RecentDeployments deployments={deployments ?? []} />
              )}
            </div>
          </Card>
        </div>

        {/* Right: Activity + Health */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <Card variant="surface">
            <div className="px-5 py-4 flex items-center justify-between border-b border-border-subtle">
              <h2 className="text-sm font-bold flex items-center gap-2 text-text-primary">
                <Activity size={14} className="text-text-muted" />
                {t('overview.recentActivity')}
              </h2>
              <Link to="/monitoring" className="text-xs flex items-center gap-1 text-primary">
                {t('common.viewAll')} <ArrowRight size={10} />
              </Link>
            </div>
            <div className="p-5">
              <RecentActivity />
            </div>
          </Card>

          {/* System Health */}
          <Card variant="surface">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-sm font-bold flex items-center gap-2 text-text-primary">
                <Stethoscope size={14} className="text-text-muted" />
                {t('overview.systemHealth')}
              </h2>
            </div>
            <div className="p-5">
              <HealthSummary />
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
