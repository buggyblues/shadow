import { Badge, Button, Search, Tabs, TabsList, TabsTrigger } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Box,
  CheckCircle,
  ChevronRight,
  DollarSign,
  FolderClock,
  FolderOpen,
  Layers,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Terminal,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DangerConfirmDialog } from '@/components/DangerConfirmDialog'
import { DashboardEmptyState } from '@/components/DashboardEmptyState'
import { DashboardListRow } from '@/components/DashboardListRow'
import { DashboardNamespaceCard } from '@/components/DashboardNamespaceCard'
import { DashboardLoadingState } from '@/components/DashboardState'
import { DashboardTaskCard } from '@/components/DashboardTaskCard'
import { PageShell } from '@/components/PageShell'
import { StatCard } from '@/components/StatCard'
import { StatsGrid } from '@/components/StatsGrid'
import { StatusBadge } from '@/components/StatusBadge'
import { StatusDot } from '@/components/StatusDot'
import { useDebounce } from '@/hooks/useDebounce'
import { api, type Deployment, type DeployTaskListItem } from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
import { formatUsdCost } from '@/lib/store-data'
import {
  formatTimestamp,
  getAge,
  getReadyReplicas,
  groupBy,
  isDeploymentReady,
  pluralize,
} from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NamespaceGroup {
  namespace: string
  deployments: Deployment[]
  readyCount: number
  totalCount: number
  latestTask?: DeployTaskListItem
  costUsd?: number | null
  availableCostAgents?: number
  unavailableCostAgents?: number
}

function getStatusVariant(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'deployed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'info'
  if (status === 'pending') return 'warning'
  return 'neutral'
}

// ── Deployment Row ────────────────────────────────────────────────────────────

function DeploymentRow({ dep }: { dep: Deployment }) {
  const api = useApiClient()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const addActivity = useAppStore((s) => s.addActivity)
  const ready = isDeploymentReady(dep.ready)
  const [replicas, setReplicas] = useState<number | null>(null)

  const currentReplicas =
    replicas ??
    (() => {
      return getReadyReplicas(dep.ready)
    })()

  const scaleMutation = useMutation({
    mutationFn: (count: number) => api.deployments.scale(dep.namespace, dep.name, count),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      toast.success(
        t('deployments.scaledAgent', {
          agent: dep.name,
          count: replicas ?? currentReplicas,
        }),
      )
      addActivity({
        type: 'scale',
        title: t('deploymentDetail.scaleActivityTitle', { agent: dep.name }),
        detail: t('deploymentDetail.scaleActivityDetail', { count: replicas ?? currentReplicas }),
        namespace: dep.namespace,
      })
    },
    onError: () => toast.error(t('deployments.scaleFailed', { agent: dep.name })),
  })

  const handleScale = (delta: number) => {
    const next = Math.max(0, currentReplicas + delta)
    setReplicas(next)
    scaleMutation.mutate(next)
  }

  return (
    <DashboardListRow
      leading={<StatusDot status={ready ? 'success' : 'warning'} />}
      main={
        <Link
          to="/deployments/$namespace"
          params={{ namespace: dep.namespace }}
          className="block truncate font-mono text-sm text-primary transition-colors hover:text-primary-strong"
        >
          {dep.name}
        </Link>
      }
      sub={getAge(dep.age)}
      trailing={
        <div className="flex items-center gap-3">
          <StatusBadge
            dotStatus={ready ? 'success' : 'warning'}
            badgeVariant={ready ? 'success' : 'warning'}
            badgeText={dep.ready}
          />

          <div className="flex items-center rounded border border-border-subtle bg-bg-secondary/40">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => handleScale(-1)}
              disabled={scaleMutation.isPending || currentReplicas <= 0}
            >
              <Minus size={11} />
            </Button>
            <span className="text-xs font-mono px-1.5 min-w-[1.2rem] text-center">
              {currentReplicas}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => handleScale(1)}
              disabled={scaleMutation.isPending}
            >
              <Plus size={11} />
            </Button>
          </div>

          <Link
            to="/deployments/$namespace"
            params={{ namespace: dep.namespace }}
            className="text-text-muted transition-colors hover:text-text-primary"
          >
            <ChevronRight size={14} />
          </Link>
        </div>
      }
    />
  )
}

// ── Namespace Card ────────────────────────────────────────────────────────────

function NamespaceCard({
  group,
  isDestroying,
  isDiscovered,
  onDestroy,
  onRedeploy,
  onRollback,
}: {
  group: NamespaceGroup
  isDestroying: boolean
  isDiscovered: boolean
  onDestroy: (ns: string) => void
  onRedeploy: (taskId: number) => void
  onRollback: (ns: string) => void
}) {
  const api = useApiClient()
  const { t, i18n } = useTranslation()
  const task = group.latestTask
  const readyLabel = `${group.readyCount}/${group.totalCount} ${t('clusters.ready').toLowerCase()}`

  return (
    <DashboardNamespaceCard
      headerLeft={
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <FolderOpen size={16} className="text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Link
                to="/deployments/$namespace"
                params={{ namespace: group.namespace }}
                className="text-sm font-semibold text-text-primary transition-colors hover:text-primary"
              >
                {group.namespace}
              </Link>
              {isDiscovered && (
                <span className="rounded px-1.5 py-0.5 text-xs text-warning border border-warning/30 bg-warning/10">
                  {t('clusters.discovered')}
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted">
              {group.totalCount} {pluralize(group.totalCount, 'deployment')}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
              <DollarSign size={11} />
              <span>{formatUsdCost(group.costUsd ?? null, i18n.language)}</span>
              <span>·</span>
              <span>
                {t('deployments.availableAgents')} {group.availableCostAgents ?? 0}
              </span>
              {(group.unavailableCostAgents ?? 0) > 0 && (
                <>
                  <span>·</span>
                  <span>
                    {t('deployments.unavailableAgents')} {group.unavailableCostAgents ?? 0}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      }
      headerRight={
        <div className="flex items-center gap-2">
          <StatusDot
            status={group.readyCount === group.totalCount ? 'success' : 'warning'}
            label={readyLabel}
          />
          {task && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRedeploy(task.task.id)}
            >
              <RefreshCw size={11} />
              {t('deployTask.redeploy')}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRollback(group.namespace)}
          >
            <RotateCcw size={11} />
            {t('deployTask.rollback')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDestroy(group.namespace)}
            disabled={isDestroying}
          >
            {isDestroying ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            {t('clusters.destroy')}
          </Button>
        </div>
      }
      rows={group.deployments.map((dep) => (
        <DeploymentRow key={`${dep.namespace}/${dep.name}`} dep={dep} />
      ))}
      footer={
        task ? (
          <>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <FolderClock size={12} />
              <span>
                {t('deployTask.template')}: {task.task.templateSlug ?? '—'}
              </span>
              <span>·</span>
              <Badge variant={getStatusVariant(task.task.status)} size="sm">
                {t(`deployTask.statuses.${task.task.status}`)}
              </Badge>
              <span>·</span>
              <span>{formatTimestamp(task.task.updatedAt ?? task.task.createdAt)}</span>
            </div>
            <Link
              to="/deploy-tasks/$taskId"
              params={{ taskId: String(task.task.id) }}
              className="text-xs text-primary transition-colors hover:text-primary-strong"
            >
              #{task.task.id} →
            </Link>
          </>
        ) : null
      }
    />
  )
}

// ── Tasks Panel ───────────────────────────────────────────────────────────────

function TasksPanel({ tasks }: { tasks: DeployTaskListItem[] }) {
  const api = useApiClient()
  const { t } = useTranslation()

  if (tasks.length === 0) {
    return (
      <DashboardEmptyState icon={FolderClock} title={t('deployTask.noTasks')} className="p-0" />
    )
  }

  return (
    <div className="space-y-2">
      {tasks.map(({ task, active }) => {
        const running = active || task.status === 'running' || task.status === 'pending'
        return (
          <Link
            key={task.id}
            to="/deploy-tasks/$taskId"
            params={{ taskId: String(task.id) }}
            className="block"
          >
            <DashboardTaskCard
              id={task.id}
              statusLabel={t(`deployTask.statuses.${task.status}`)}
              statusVariant={getStatusVariant(task.status)}
              running={running}
              timestamp={formatTimestamp(task.updatedAt ?? task.createdAt)}
              meta={
                <>
                  <span>{task.namespace}</span>
                  {task.templateSlug && (
                    <>
                      <span>·</span>
                      <span>{task.templateSlug}</span>
                    </>
                  )}
                </>
              }
            />
          </Link>
        )
      })}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function DeploymentsPage() {
  const api = useApiClient()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const addActivity = useAppStore((s) => s.addActivity)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [destroyNs, setDestroyNs] = useState<string | null>(null)
  const [rollbackNs, setRollbackNs] = useState<string | null>(null)
  const [hiddenNamespaces, setHiddenNamespaces] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState('infrastructure')

  const {
    data: deployments,
    isLoading: deploymentsLoading,
    refetch,
  } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.deployments.list,
    // Fast-poll while any deployment row is mid-transition; slow otherwise.
    refetchInterval: (q) => {
      const rows = (q.state.data as Array<{ ready?: string; available?: string }>) ?? []
      const transitioning = rows.some(
        (r) => (r.ready && !r.ready.startsWith('1/')) || r.available === '0',
      )
      return transitioning ? 3_000 : 30_000
    },
    staleTime: 2_000,
  })

  const { data: nsInfo } = useQuery({
    queryKey: ['namespaces'],
    queryFn: api.deployments.namespaces,
    staleTime: 30_000,
  })

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['deploy-tasks'],
    queryFn: api.deployTasks.list,
    refetchInterval: 5_000,
  })

  const { data: costOverview } = useQuery({
    queryKey: ['cost-overview'],
    queryFn: api.deployments.costs,
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  const tasks = tasksData?.tasks ?? []

  const destroyMutation = useMutation({
    mutationFn: (ns: string) => api.destroy({ namespace: ns }),
    onMutate: async (ns) => {
      await queryClient.cancelQueries({ queryKey: ['deployments'] })
      const previousDeployments = queryClient.getQueryData<Deployment[]>(['deployments'])
      const previousHiddenNamespaces = hiddenNamespaces

      setDestroyNs(ns)
      setHiddenNamespaces((current) => (current.includes(ns) ? current : [...current, ns]))
      queryClient.setQueryData<Deployment[]>(['deployments'], (current) =>
        (current ?? []).filter((deployment) => deployment.namespace !== ns),
      )

      return { previousDeployments, previousHiddenNamespaces }
    },
    onSuccess: async (_, ns) => {
      toast.success(t('deploymentDetail.destroySuccess', { namespace: ns }))
      addActivity({
        type: 'destroy',
        title: t('deploymentDetail.destroyActivityTitle', { namespace: ns }),
        namespace: ns,
      })
      setDestroyNs(null)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['deployments'] })
      }, 5_000)
    },
    onError: (_error, _ns, context) => {
      if (context?.previousDeployments) {
        queryClient.setQueryData(['deployments'], context.previousDeployments)
      }
      setHiddenNamespaces(context?.previousHiddenNamespaces ?? [])
      setDestroyNs(null)
      toast.error(t('deployments.destroyNamespaceFailed'))
    },
  })

  const rollbackMutation = useMutation({
    mutationFn: (namespace: string) => api.rollback({ namespace }),
    onSuccess: () => {
      setRollbackNs(null)
      queryClient.invalidateQueries({ queryKey: ['deploy-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      toast.success(t('deployments.rollbackInitiated'))
    },
    onError: () => {
      toast.error(t('deployments.rollbackFailed'))
    },
  })

  const handleRedeploy = async (taskId: number) => {
    const nextTaskId = await api.deployTasks.redeployToTaskId(taskId)
    if (!nextTaskId) return
    navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(nextTaskId) } })
  }

  useEffect(() => {
    const namespaces = new Set((deployments ?? []).map((d) => d.namespace))
    setHiddenNamespaces((current) => current.filter((ns) => namespaces.has(ns)))
  }, [deployments])

  // Build task map: namespace → latest task
  const tasksByNamespace = useMemo(() => {
    const map = new Map<string, DeployTaskListItem>()
    for (const item of tasks) {
      const ns = item.task.namespace
      const existing = map.get(ns)
      if (!existing || item.task.id > existing.task.id) {
        map.set(ns, item)
      }
    }
    return map
  }, [tasks])

  const costByNamespace = useMemo(() => {
    const map = new Map<
      string,
      { totalUsd: number | null; availableAgents: number; unavailableAgents: number }
    >()

    for (const item of costOverview?.namespaces ?? []) {
      map.set(item.namespace, {
        totalUsd: item.totalUsd,
        availableAgents: item.availableAgents,
        unavailableAgents: item.unavailableAgents,
      })
    }

    return map
  }, [costOverview?.namespaces])

  // Compute groups
  const groups: NamespaceGroup[] = useMemo(() => {
    const deps = (deployments ?? []).filter((d) => !hiddenNamespaces.includes(d.namespace))
    const grouped = groupBy(deps, (d) => d.namespace)
    let result = Object.entries(grouped).map(([namespace, deps]) => ({
      namespace,
      deployments: deps,
      readyCount: deps.filter((deployment) => isDeploymentReady(deployment.ready)).length,
      totalCount: deps.length,
      latestTask: tasksByNamespace.get(namespace),
      costUsd: costByNamespace.get(namespace)?.totalUsd ?? null,
      availableCostAgents: costByNamespace.get(namespace)?.availableAgents ?? 0,
      unavailableCostAgents: costByNamespace.get(namespace)?.unavailableAgents ?? 0,
    }))

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(
        (g) =>
          g.namespace.toLowerCase().includes(q) ||
          g.deployments.some((d) => d.name.toLowerCase().includes(q)),
      )
    }

    return result.sort((a, b) => a.namespace.localeCompare(b.namespace))
  }, [deployments, debouncedSearch, hiddenNamespaces, tasksByNamespace, costByNamespace])

  const visibleDeployments = (deployments ?? []).filter(
    (d) => !hiddenNamespaces.includes(d.namespace),
  )
  const total = visibleDeployments.length
  const ready = visibleDeployments.filter((deployment) =>
    isDeploymentReady(deployment.ready),
  ).length
  const namespaceCount = groups.length
  const runningTasks = tasks.filter((t) => t.active || t.task.status === 'running').length

  const isLoading = deploymentsLoading && tasksLoading

  const tabs = [
    {
      id: 'infrastructure',
      label: t('deployments.infrastructure'),
      icon: <Layers size={13} />,
      count: total,
    },
    {
      id: 'tasks',
      label: t('deployments.taskHistory'),
      icon: <FolderClock size={13} />,
      count: tasks.length,
    },
  ]

  return (
    <PageShell
      breadcrumb={[{ label: t('deployments.title') }]}
      title={t('deployments.title')}
      description={t('deployments.description')}
      actions={
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw size={12} />
            {t('common.refresh')}
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link to="/store">
              <Rocket size={12} />
              {t('common.deployNew')}
            </Link>
          </Button>
        </div>
      }
      headerContent={
        <div className="space-y-3">
          <StatsGrid className="grid-cols-2 lg:grid-cols-5">
            <StatCard
              label={t('clusters.totalDeployments')}
              value={total}
              icon={<Box size={13} />}
              color="default"
            />
            <StatCard
              label={t('clusters.ready')}
              value={ready}
              icon={<CheckCircle size={13} />}
              color="green"
            />
            <StatCard
              label={t('deployments.namespaces')}
              value={namespaceCount}
              icon={<FolderOpen size={13} />}
              color="blue"
            />
            <StatCard
              label={t('deployTask.runningTasks')}
              value={runningTasks}
              icon={<Terminal size={13} />}
              color={runningTasks > 0 ? 'blue' : 'default'}
            />
            <StatCard
              label={t('deployments.totalCost')}
              value={formatUsdCost(costOverview?.totalUsd ?? null, i18n.language)}
              icon={<DollarSign size={13} />}
              color="purple"
            />
          </StatsGrid>
          <div className="flex items-center justify-between gap-3">
            <Tabs value={activeTab} onChange={setActiveTab}>
              <TabsList className="dashboard-tabs-list">
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} className="dashboard-tabs-trigger">
                    <span className="dashboard-tab-icon">{tab.icon}</span>
                    <span>{tab.label}</span>
                    {typeof tab.count === 'number' && (
                      <span className="dashboard-tabs-count">{tab.count}</span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {activeTab === 'infrastructure' && (
              <Search
                value={search}
                onChange={setSearch}
                placeholder={t('common.search') + '...'}
              />
            )}
          </div>
        </div>
      }
    >
      {/* Infrastructure Tab */}
      {activeTab === 'infrastructure' && (
        <>
          {isLoading && (
            <div className="glass-panel p-4">
              <DashboardLoadingState rows={2} />
            </div>
          )}

          {!isLoading && groups.length === 0 && (
            <DashboardEmptyState
              icon={Layers}
              title={t('clusters.noClustersFound')}
              description={
                debouncedSearch ? t('clusters.noNamespacesMatch') : t('clusters.noDeploymentsYet')
              }
              action={
                <Button asChild variant="primary" size="sm">
                  <Link to="/store">
                    <Rocket size={14} />
                    {t('clusters.browseAgentStore')}
                  </Link>
                </Button>
              }
            />
          )}

          {!isLoading && groups.length > 0 && (
            <div className="space-y-4">
              {groups.map((group) => (
                <NamespaceCard
                  key={group.namespace}
                  group={group}
                  isDestroying={destroyMutation.isPending && destroyNs === group.namespace}
                  isDiscovered={nsInfo?.discovered?.includes(group.namespace) ?? false}
                  onDestroy={setDestroyNs}
                  onRedeploy={handleRedeploy}
                  onRollback={setRollbackNs}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <>
          {tasksLoading && <DashboardLoadingState inline />}
          {!tasksLoading && <TasksPanel tasks={tasks} />}
        </>
      )}

      <DangerConfirmDialog
        open={Boolean(destroyNs)}
        onOpenChange={(open) => {
          if (!open) setDestroyNs(null)
        }}
        title={t('clusters.destroyNamespace')}
        description={destroyNs ? t('clusters.destroyWarning', { namespace: destroyNs }) : ''}
        confirmText={destroyMutation.isPending ? t('clusters.destroying') : t('clusters.destroy')}
        cancelText={t('common.cancel')}
        loading={destroyMutation.isPending}
        onConfirm={() => {
          if (destroyNs) {
            destroyMutation.mutate(destroyNs)
          }
        }}
      />

      <DangerConfirmDialog
        open={Boolean(rollbackNs)}
        onOpenChange={(open) => {
          if (!open) setRollbackNs(null)
        }}
        title={t('deployTask.rollback')}
        description={rollbackNs ? t('deployments.rollbackWarning', { namespace: rollbackNs }) : ''}
        confirmText={t('deployTask.rollback')}
        cancelText={t('common.cancel')}
        loading={rollbackMutation.isPending}
        onConfirm={() => {
          if (rollbackNs) {
            rollbackMutation.mutate(rollbackNs)
          }
        }}
      />
    </PageShell>
  )
}
