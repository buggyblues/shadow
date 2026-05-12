import { Badge, Button, GlassPanel, Search, Tabs } from '@shadowob/ui'
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
  Pause,
  RefreshCw,
  Rocket,
  Terminal,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DangerConfirmDialog } from '@/components/DangerConfirmDialog'
import { DashboardEmptyState } from '@/components/DashboardEmptyState'
import { DashboardListRow } from '@/components/DashboardListRow'
import { DashboardNamespaceCard } from '@/components/DashboardNamespaceCard'
import { DashboardLoadingState } from '@/components/DashboardState'
import { DashboardTabsList } from '@/components/DashboardTabsList'
import { DashboardTaskCard } from '@/components/DashboardTaskCard'
import { MetricCardContent, MetricCardWrapper } from '@/components/MetricCard'
import { PageShell } from '@/components/PageShell'
import { StatsGrid } from '@/components/StatsGrid'
import { StatusBadge } from '@/components/StatusBadge'
import { StatusDot } from '@/components/StatusDot'
import { ToolbarActionButton } from '@/components/ToolbarActionButton'
import { useDebounce } from '@/hooks/useDebounce'
import { type Deployment, type DeployTaskListItem } from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
import { formatDisplayCost } from '@/lib/store-data'
import { formatTimestamp, getAge, groupBy, isDeploymentReady, pluralize } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NamespaceGroup {
  namespace: string
  deployments: Deployment[]
  readyCount: number
  totalCount: number
  pausedCount: number
  resumingCount: number
  sandboxCount: number
  latestTask?: DeployTaskListItem
}

function getStatusVariant(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'deployed' || status === 'destroyed') return 'success'
  if (status === 'failed') return 'danger'
  if (
    status === 'running' ||
    status === 'paused' ||
    status === 'resuming' ||
    status === 'deploying' ||
    status === 'destroying'
  ) {
    return 'info'
  }
  if (status === 'pending' || status === 'cancelling') return 'warning'
  return 'neutral'
}

// ── Deployment Row ────────────────────────────────────────────────────────────

function DeploymentRow({ dep }: { dep: Deployment }) {
  const { t } = useTranslation()
  const ready = isDeploymentReady(dep.ready)
  const runtimeState = dep.runtimeState ?? (ready ? 'running' : 'unknown')
  const dotStatus =
    runtimeState === 'paused'
      ? 'info'
      : runtimeState === 'failed'
        ? 'error'
        : ready
          ? 'success'
          : 'warning'

  return (
    <DashboardListRow
      leading={<StatusDot status={dotStatus} />}
      main={
        <Link
          to="/deployments/$namespace"
          params={{ namespace: dep.namespace }}
          className="block truncate font-mono text-sm text-primary transition-colors hover:text-primary-strong"
        >
          {dep.name}
        </Link>
      }
      sub={
        <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
          <span>{getAge(dep.age)}</span>
          {dep.workloadKind === 'agent-sandbox' && (
            <Badge variant="neutral" size="xs">
              agent-sandbox
            </Badge>
          )}
          {dep.sandboxName && (
            <span className="max-w-[220px] truncate rounded-full border border-border-subtle bg-bg-secondary px-2 py-0.5 font-mono text-[11px] text-text-muted">
              {t('deployments.sandboxShort')}: {dep.sandboxName}
            </span>
          )}
          {dep.statePvc && (
            <span className="max-w-[220px] truncate rounded-full border border-border-subtle bg-bg-secondary px-2 py-0.5 font-mono text-[11px] text-text-muted">
              {dep.statePvc}
            </span>
          )}
        </span>
      }
      trailing={
        <div className="flex items-center gap-3">
          {dep.workloadKind === 'agent-sandbox' && (
            <Badge
              variant={
                runtimeState === 'running'
                  ? 'success'
                  : runtimeState === 'paused'
                    ? 'info'
                    : runtimeState === 'failed'
                      ? 'danger'
                      : 'warning'
              }
              size="sm"
            >
              {t(`deployments.runtimeState.${runtimeState}`)}
            </Badge>
          )}
          <StatusBadge
            dotStatus={dotStatus}
            badgeVariant={ready ? 'success' : 'warning'}
            badgeText={dep.ready}
          />

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
}: {
  group: NamespaceGroup
  isDestroying: boolean
  isDiscovered: boolean
  onDestroy: (ns: string) => void
  onRedeploy: (taskId: number | string) => void
}) {
  const { t } = useTranslation()
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
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-border-subtle bg-bg-secondary px-2 py-0.5 text-text-subtle">
                {readyLabel}
              </span>
              {group.sandboxCount > 0 && (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">
                  {t('deployments.agentSandboxCount', { count: group.sandboxCount })}
                </span>
              )}
              {group.pausedCount > 0 && (
                <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-warning">
                  {t('deployments.pausedCount', { count: group.pausedCount })}
                </span>
              )}
              {group.resumingCount > 0 && (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">
                  {t('deployments.resumingCount', { count: group.resumingCount })}
                </span>
              )}
              <span className="text-text-muted">
                {group.totalCount} {pluralize(group.totalCount, 'deployment')}
              </span>
            </div>
          </div>
        </div>
      }
      headerRight={
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {task && (
            <ToolbarActionButton
              type="button"
              variant="primary"
              onClick={() => onRedeploy(task.task.id)}
              icon={<RefreshCw size={11} />}
              label={t('deployTask.redeploy')}
            />
          )}
          <ToolbarActionButton
            type="button"
            variant="danger"
            onClick={() => onDestroy(group.namespace)}
            disabled={isDestroying}
            icon={
              isDestroying ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />
            }
            label={t('clusters.destroy')}
          />
        </div>
      }
      rows={group.deployments.map((dep) => (
        <DeploymentRow key={`${dep.namespace}/${dep.name}`} dep={dep} />
      ))}
      footer={
        task ? (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <FolderClock size={12} />
            <Badge variant={getStatusVariant(task.task.status)} size="sm">
              {t(`deployTask.statuses.${task.task.status}`)}
            </Badge>
            <span>·</span>
            <Link
              to="/deploy-tasks/$taskId"
              params={{ taskId: String(task.task.id) }}
              className="text-primary transition-colors hover:text-primary-strong"
            >
              #{task.task.id}
            </Link>
            {task.task.blockedBy && (
              <>
                <span>·</span>
                <span>
                  {t('deployTask.blockedBy')} #{task.task.blockedBy.id}
                </span>
              </>
            )}
          </div>
        ) : null
      }
    />
  )
}

// ── Tasks Panel ───────────────────────────────────────────────────────────────

function TasksPanel({ tasks }: { tasks: DeployTaskListItem[] }) {
  const { t } = useTranslation()

  if (tasks.length === 0) {
    return (
      <DashboardEmptyState
        icon={FolderClock}
        title={t('deployTask.noTasks')}
        cardVariant="glassPanel"
        className="p-0"
      />
    )
  }

  return (
    <div className="space-y-2">
      {tasks.map(({ task, active }) => {
        const running =
          active ||
          task.status === 'running' ||
          task.status === 'pending' ||
          task.status === 'deploying' ||
          task.status === 'cancelling' ||
          task.status === 'destroying'
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
                  {task.blockedBy && (
                    <>
                      <span>·</span>
                      <span>
                        {t('deployTask.blockedBy')} #{task.blockedBy.id}
                      </span>
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
      const rows =
        (q.state.data as Array<{
          ready?: string
          available?: string
          runtimeState?: Deployment['runtimeState']
        }>) ?? []
      const transitioning = rows.some(
        (r) =>
          r.runtimeState === 'resuming' ||
          (r.runtimeState !== 'paused' &&
            ((r.ready && !r.ready.startsWith('1/')) || r.available === '0')),
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
    onSuccess: async (result, ns) => {
      toast.success(t('deployments.destroyQueued', { namespace: ns }))
      addActivity({
        type: 'destroy',
        title: t('deploymentDetail.destroyQueuedActivityTitle', { namespace: ns }),
        namespace: ns,
      })
      setDestroyNs(null)
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['deploy-tasks'] })
      if (result.taskId) {
        navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(result.taskId) } })
      }
    },
    onError: () => {
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

  const handleRedeploy = async (taskId: number | string) => {
    const nextTaskId = await api.deployTasks.redeployToTaskId(taskId)
    if (!nextTaskId) return
    navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(nextTaskId) } })
  }

  // Build task map: namespace → latest task
  const tasksByNamespace = useMemo(() => {
    const map = new Map<string, DeployTaskListItem>()
    for (const item of tasks) {
      const ns = item.task.namespace
      const existing = map.get(ns)
      const itemTime = Date.parse(item.task.createdAt ?? item.task.updatedAt ?? '') || 0
      const existingTime =
        Date.parse(existing?.task.createdAt ?? existing?.task.updatedAt ?? '') || 0
      if (!existing || itemTime >= existingTime) {
        map.set(ns, item)
      }
    }
    return map
  }, [tasks])

  // Compute groups
  const groups: NamespaceGroup[] = useMemo(() => {
    const deps = deployments ?? []
    const grouped = groupBy(deps, (d) => d.namespace)
    let result = Object.entries(grouped).map(([namespace, deps]) => ({
      namespace,
      deployments: deps,
      readyCount: deps.filter((deployment) => isDeploymentReady(deployment.ready)).length,
      totalCount: deps.length,
      pausedCount: deps.filter((deployment) => deployment.runtimeState === 'paused').length,
      resumingCount: deps.filter((deployment) => deployment.runtimeState === 'resuming').length,
      sandboxCount: deps.filter((deployment) => deployment.workloadKind === 'agent-sandbox').length,
      latestTask: tasksByNamespace.get(namespace),
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
  }, [deployments, debouncedSearch, tasksByNamespace])

  const visibleDeployments = deployments ?? []
  const total = visibleDeployments.length
  const ready = visibleDeployments.filter((deployment) =>
    isDeploymentReady(deployment.ready),
  ).length
  const paused = visibleDeployments.filter(
    (deployment) => deployment.runtimeState === 'paused',
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
      breadcrumb={[]}
      title={t('deployments.title')}
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
        <>
          <StatsGrid className="mb-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <MetricCardWrapper>
              <MetricCardContent
                label={t('clusters.totalDeployments')}
                value={total}
                icon={<Box size={13} />}
                iconClassName="text-text-muted"
                valueClassName="text-text-muted"
              />
            </MetricCardWrapper>
            <MetricCardWrapper>
              <MetricCardContent
                label={t('clusters.ready')}
                value={ready}
                icon={<CheckCircle size={13} />}
                iconClassName="text-success"
                valueClassName="text-success"
              />
            </MetricCardWrapper>
            <MetricCardWrapper>
              <MetricCardContent
                label={t('deployments.pausedDeployments')}
                value={paused}
                icon={<Pause size={13} />}
                iconClassName={paused > 0 ? 'text-warning' : 'text-text-muted'}
                valueClassName={paused > 0 ? 'text-warning' : 'text-text-muted'}
              />
            </MetricCardWrapper>
            <MetricCardWrapper>
              <MetricCardContent
                label={t('deployments.namespaces')}
                value={namespaceCount}
                icon={<FolderOpen size={13} />}
                iconClassName="text-primary"
                valueClassName="text-primary"
              />
            </MetricCardWrapper>
            <MetricCardWrapper>
              <MetricCardContent
                label={t('deployTask.runningTasks')}
                value={runningTasks}
                icon={<Terminal size={13} />}
                iconClassName={runningTasks > 0 ? 'text-primary' : 'text-text-muted'}
                valueClassName={runningTasks > 0 ? 'text-primary' : 'text-text-muted'}
              />
            </MetricCardWrapper>
            <MetricCardWrapper>
              <MetricCardContent
                label={t('deployments.totalCost')}
                value={formatDisplayCost(costOverview ?? {}, {
                  locale: i18n.language,
                  shrimpUnitLabel: t('deploy.shrimpCoins'),
                })}
                icon={<DollarSign size={13} />}
                iconClassName="text-accent"
                valueClassName="text-accent"
              />
            </MetricCardWrapper>
          </StatsGrid>
          <div className="flex items-center justify-between gap-3">
            <Tabs value={activeTab} onChange={setActiveTab}>
              <DashboardTabsList tabs={tabs} activeId={activeTab} onSelect={setActiveTab} />
            </Tabs>
            {activeTab === 'infrastructure' && (
              <Search
                value={search}
                onChange={setSearch}
                placeholder={t('common.search') + '...'}
              />
            )}
          </div>
        </>
      }
    >
      {/* Infrastructure Tab */}
      {activeTab === 'infrastructure' && (
        <>
          {isLoading && (
            <GlassPanel className="rounded-2xl p-4 md:p-5">
              <DashboardLoadingState rows={2} />
            </GlassPanel>
          )}

          {!isLoading && groups.length === 0 && (
            <DashboardEmptyState
              icon={Layers}
              title={t('clusters.noClustersFound')}
              description={
                debouncedSearch ? t('clusters.noNamespacesMatch') : t('clusters.noDeploymentsYet')
              }
              cardVariant="glassPanel"
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
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {groups.map((group) => (
                <NamespaceCard
                  key={group.namespace}
                  group={group}
                  isDestroying={destroyMutation.isPending && destroyNs === group.namespace}
                  isDiscovered={nsInfo?.discovered?.includes(group.namespace) ?? false}
                  onDestroy={setDestroyNs}
                  onRedeploy={handleRedeploy}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <>
          {tasksLoading && (
            <GlassPanel className="rounded-2xl p-4 md:p-5">
              <DashboardLoadingState inline />
            </GlassPanel>
          )}
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
