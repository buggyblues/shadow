import { useQuery } from '@tanstack/react-query'
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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/Badge'
import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { SearchInput } from '@/components/SearchInput'
import { StatCard } from '@/components/StatCard'
import { StatusDot, type StatusType } from '@/components/StatusDot'
import { Tabs } from '@/components/Tabs'
import { useDebounce } from '@/hooks/useDebounce'
import { api, type Deployment, type DoctorCheck, type DoctorResult } from '@/lib/api'
import { getRelativeTime, pluralize } from '@/lib/utils'
import { type ActivityEntry, type ActivityType, useAppStore } from '@/stores/app'

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

// ── Activity Panel (merged from ActivityPage) ─────────────────────────────────

const ACTIVITY_TYPE_CONFIG: Record<
  ActivityType,
  {
    label: string
    icon: React.ReactNode
    variant: 'success' | 'error' | 'info' | 'warning' | 'default'
  }
> = {
  deploy: { label: 'Deploy', icon: <Rocket size={12} />, variant: 'success' },
  destroy: { label: 'Destroy', icon: <Trash2 size={12} />, variant: 'error' },
  scale: { label: 'Scale', icon: <BarChart3 size={12} />, variant: 'info' },
  config: { label: 'Config', icon: <Shield size={12} />, variant: 'warning' },
  init: { label: 'Init', icon: <Box size={12} />, variant: 'default' },
  settings: { label: 'Settings', icon: <Settings size={12} />, variant: 'default' },
}

const ALL_ACTIVITY_TYPES: ActivityType[] = [
  'deploy',
  'destroy',
  'scale',
  'config',
  'init',
  'settings',
]

function ActivityPanel() {
  const { t } = useTranslation()
  const { data: activityData } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.activity.list(),
    staleTime: 10_000,
  })
  const activities = useMemo(() => {
    return (activityData?.activities ?? []).map((a: Record<string, unknown>) => ({
      ...a,
      timestamp:
        a.timestamp ?? (a.createdAt ? new Date(a.createdAt as string).getTime() : Date.now()),
    })) as ActivityEntry[]
  }, [activityData])
  const clearActivities = useAppStore((s) => s.clearActivities)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const debouncedSearch = useDebounce(search)

  const filtered = useMemo(() => {
    let list = activities
    if (typeFilter !== 'all') {
      list = list.filter((a) => a.type === typeFilter)
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.detail?.toLowerCase().includes(q) ||
          a.namespace?.toLowerCase().includes(q) ||
          a.template?.toLowerCase().includes(q),
      )
    }
    if (sortOrder === 'oldest') {
      list = [...list].reverse()
    }
    return list
  }, [activities, typeFilter, debouncedSearch, sortOrder])

  return (
    <div className="space-y-4">
      {/* Filters */}
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
            onChange={(e) => setTypeFilter(e.target.value as ActivityType | 'all')}
            className="text-xs bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-400 focus:outline-none focus:border-blue-500"
          >
            <option value="all">{t('activity.allTypes')}</option>
            {ALL_ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACTIVITY_TYPE_CONFIG[type].label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setSortOrder((s) => (s === 'newest' ? 'oldest' : 'newest'))}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          <ArrowUpDown size={11} />
          {sortOrder === 'newest' ? t('activity.newestFirst') : t('activity.oldestFirst')}
        </button>
        {activities.length > 0 && (
          <button
            type="button"
            onClick={clearActivities}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-800 rounded-lg px-3 py-1.5 transition-colors ml-auto"
          >
            <Trash2 size={12} />
            {t('common.clearAll')}
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <Activity size={12} />
          {activities.length} {t('activity.total')}
        </span>
      </div>

      {/* List */}
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
        <div>
          {filtered.map((activity) => {
            const config = ACTIVITY_TYPE_CONFIG[activity.type]
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
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-gray-200">{activity.title}</p>
                    <Badge variant={config.variant} size="sm">
                      {config.label}
                    </Badge>
                  </div>
                  {activity.detail && (
                    <p className="text-xs text-gray-500 mb-1">{activity.detail}</p>
                  )}
                  <div className="flex items-center gap-3 text-[10px] text-gray-600">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {isValidDate ? time.toLocaleString() : '—'}
                    </span>
                    {activity.namespace && (
                      <span className="font-mono">ns: {activity.namespace}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-600 shrink-0 mt-1">
                  {isValidDate ? getRelativeTime(activity.timestamp) : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
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
    staleTime: 5_000,
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

        {activeTab === 'activity' && <ActivityPanel />}
      </div>
    </div>
  )
}
