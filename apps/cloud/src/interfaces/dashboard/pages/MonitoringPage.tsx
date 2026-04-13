import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Box,
  CheckCircle,
  Clock,
  FolderOpen,
  Heart,
  RefreshCw,
  Shield,
  Stethoscope,
  XCircle,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/Badge'
import { Breadcrumb } from '@/components/Breadcrumb'
import { StatCard } from '@/components/StatCard'
import { StatusDot, type StatusType } from '@/components/StatusDot'
import { Tabs } from '@/components/Tabs'
import { api, type Deployment, type DoctorCheck, type DoctorResult } from '@/lib/api'
import { getRelativeTime, pluralize } from '@/lib/utils'
import { useRecentActivities } from '@/stores/app'

// ── Helpers ───────────────────────────────────────────────────────────────────

function doctorStatusToStatusType(status: DoctorCheck['status']): StatusType {
  if (status === 'pass') return 'success'
  if (status === 'warn') return 'warning'
  return 'error'
}

function isDeploymentReady(dep: Deployment): boolean {
  const [r = 0, t = 0] = dep.ready.split('/').map(Number)
  return r === t && t > 0
}

// ── Health Panel ──────────────────────────────────────────────────────────────

function HealthPanel({ doctor }: { doctor: DoctorResult }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-2">
        {/* Overall health summary */}
        <div className="flex items-center gap-4">
          <Badge variant="success" icon={<CheckCircle size={11} />}>
            {doctor.summary.pass} passed
          </Badge>
          {doctor.summary.warn > 0 && (
            <Badge variant="warning" icon={<AlertTriangle size={11} />}>
              {doctor.summary.warn} warnings
            </Badge>
          )}
          {doctor.summary.fail > 0 && (
            <Badge variant="error" icon={<XCircle size={11} />}>
              {doctor.summary.fail} failed
            </Badge>
          )}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800/50">
        {doctor.checks.map((check) => (
          <div key={check.name} className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusDot status={doctorStatusToStatusType(check.status)} />
              <div>
                <p className="text-sm font-medium">{check.name}</p>
                <p className="text-xs text-gray-500">{check.message}</p>
              </div>
            </div>
            <Badge
              variant={
                check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'error'
              }
              size="sm"
            >
              {check.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Deployments Overview ──────────────────────────────────────────────────────

function DeploymentsPanel({ deployments }: { deployments: Deployment[] }) {
  const namespaces = useMemo(
    () => [...new Set(deployments.map((d) => d.namespace))].sort(),
    [deployments],
  )

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        {deployments.length} {pluralize(deployments.length, 'deployment')} across{' '}
        {namespaces.length} {pluralize(namespaces.length, 'namespace')}
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-2 text-xs font-medium text-gray-500">STATUS</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">NAME</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">NAMESPACE</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">READY</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500" />
            </tr>
          </thead>
          <tbody>
            {deployments.map((dep) => {
              const ready = isDeploymentReady(dep)
              return (
                <tr
                  key={`${dep.namespace}/${dep.name}`}
                  className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <StatusDot status={ready ? 'success' : 'warning'} pulse={!ready} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      to="/deployments/$namespace/$id"
                      params={{ namespace: dep.namespace, id: dep.name }}
                      className="text-sm font-mono text-blue-400 hover:text-blue-300"
                    >
                      {dep.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{dep.namespace}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={ready ? 'success' : 'warning'} size="sm">
                      {dep.ready}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      to="/deployments/$namespace/$id"
                      params={{ namespace: dep.namespace, id: dep.name }}
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

// ── Events Timeline ───────────────────────────────────────────────────────────

function EventsPanel() {
  const activities = useRecentActivities(20)

  const typeIcons: Record<string, React.ReactNode> = {
    deploy: <Zap size={12} className="text-green-400" />,
    destroy: <XCircle size={12} className="text-red-400" />,
    scale: <BarChart3 size={12} className="text-blue-400" />,
    config: <Shield size={12} className="text-yellow-400" />,
    init: <Box size={12} className="text-purple-400" />,
    settings: <Activity size={12} className="text-cyan-400" />,
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-600">
        <Clock size={24} className="mx-auto mb-2 text-gray-700" />
        No recent events. Deploy an agent team to see activity here.
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className="flex gap-3 py-3 border-b border-gray-800/50 last:border-0"
        >
          <div className="mt-0.5 p-1.5 bg-gray-900 border border-gray-800 rounded-lg shrink-0">
            {typeIcons[activity.type] ?? <Activity size={12} className="text-gray-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-300">{activity.title}</p>
            {activity.detail && (
              <p className="text-xs text-gray-600 mt-0.5 truncate">{activity.detail}</p>
            )}
          </div>
          <span className="text-[10px] text-gray-600 shrink-0 mt-0.5">
            {getRelativeTime(activity.timestamp)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function MonitoringPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('health')

  const { data: deployments, isLoading: loadingDeps } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.deployments.list,
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

  const total = deployments?.length ?? 0
  const ready = deployments?.filter(isDeploymentReady).length ?? 0
  const totalChecks = doctor ? doctor.summary.pass + doctor.summary.warn + doctor.summary.fail : 0
  const healthScore =
    doctor && totalChecks > 0 ? Math.round((doctor.summary.pass / totalChecks) * 100) : 0
  const namespaces = new Set(deployments?.map((d) => d.namespace) ?? []).size

  const tabs = [
    { id: 'health', label: t('monitoring.healthChecks'), icon: <Stethoscope size={13} /> },
    {
      id: 'deployments',
      label: t('monitoring.deployments'),
      count: total,
      icon: <Box size={13} />,
    },
    { id: 'events', label: t('monitoring.events'), icon: <Activity size={13} /> },
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
          onClick={() => refetchDoctor()}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          <RefreshCw size={12} />
          {t('common.refresh')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t('monitoring.healthScore')}
          value={doctor ? `${healthScore}%` : '—'}
          icon={<Heart size={13} />}
          color={healthScore >= 80 ? 'green' : healthScore >= 50 ? 'yellow' : 'red'}
        />
        <StatCard
          label={t('monitoring.deployments')}
          value={total}
          icon={<Box size={13} />}
          color="blue"
        />
        <StatCard
          label={t('monitoring.readyTotal')}
          value={`${ready}/${total}`}
          icon={<CheckCircle size={13} />}
          color={ready === total ? 'green' : 'yellow'}
        />
        <StatCard
          label="Namespaces"
          value={namespaces}
          icon={<FolderOpen size={13} />}
          color="purple"
        />
      </div>

      {/* Tabs */}
      <Tabs items={tabs} active={activeTab} onChange={setActiveTab} className="mb-6" />

      <div className="min-h-[300px]">
        {activeTab === 'health' &&
          (loadingDoctor ? (
            <div className="py-12 text-center text-gray-500 text-sm">Running health checks...</div>
          ) : doctor ? (
            <HealthPanel doctor={doctor} />
          ) : (
            <div className="py-12 text-center text-gray-500 text-sm">
              Failed to run health checks.
            </div>
          ))}

        {activeTab === 'deployments' &&
          (loadingDeps ? (
            <div className="py-12 text-center text-gray-500 text-sm">Loading deployments...</div>
          ) : deployments && deployments.length > 0 ? (
            <DeploymentsPanel deployments={deployments} />
          ) : (
            <div className="py-12 text-center text-gray-600 text-sm">
              <Box size={24} className="mx-auto mb-2 text-gray-700" />
              No deployments found.
            </div>
          ))}

        {activeTab === 'events' && <EventsPanel />}
      </div>
    </div>
  )
}
