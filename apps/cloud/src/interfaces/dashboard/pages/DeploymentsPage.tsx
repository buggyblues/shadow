import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { formatDistanceToNow, parseISO } from 'date-fns'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Search,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@shadowob/ui'
import { Breadcrumb } from '@/components/Breadcrumb'
import { StatCard } from '@/components/StatCard'
import { StatusDot } from '@/components/StatusDot'
import { useDebounce } from '@/hooks/useDebounce'
import { api, type Deployment, type DeployTaskListItem } from '@/lib/api'
import { formatUsdCost } from '@/lib/store-data'
import { cn, groupBy, pluralize } from '@/lib/utils'
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDeploymentReady(dep: Deployment): boolean {
  const [r = 0, t = 0] = dep.ready.split('/').map(Number)
  return r === t && t > 0
}

function getAge(dep: Deployment): string {
  try {
    return formatDistanceToNow(parseISO(dep.age), { addSuffix: true })
  } catch {
    return dep.age
  }
}

function formatTimestamp(value?: string | null): string {
  if (!value) return '—'
  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true })
  } catch {
    return value
  }
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
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const addActivity = useAppStore((s) => s.addActivity)
  const ready = isDeploymentReady(dep)
  const [replicas, setReplicas] = useState<number | null>(null)

  const currentReplicas =
    replicas ??
    (() => {
      const [r = 0] = dep.ready.split('/').map(Number)
      return r
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
        title: `Scaled ${dep.name}`,
        detail: `Replicas: ${replicas}`,
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
    <div className="px-5 py-3 flex items-center justify-between transition-colors hover:bg-bg-modifier-hover/70">
      <div className="flex items-center gap-3 min-w-0">
        <StatusDot status={ready ? 'success' : 'warning'} />
        <div className="min-w-0">
          <Link
            to="/deployments/$namespace"
            params={{ namespace: dep.namespace }}
            className="block truncate font-mono text-sm text-primary transition-colors hover:text-primary-strong"
          >
            {dep.name}
          </Link>
          <span className="text-xs text-text-muted">{getAge(dep)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Badge variant={ready ? 'success' : 'warning'} size="sm">
          {dep.ready}
        </Badge>

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
    </div>
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
  const { t, i18n } = useTranslation()
  const task = group.latestTask

  return (
    <Card variant="glass">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
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
        <div className="flex items-center gap-2">
          <StatusDot
            status={group.readyCount === group.totalCount ? 'success' : 'warning'}
            label={`${group.readyCount}/${group.totalCount} ready`}
          />
          {/* Redeploy */}
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
          {/* Rollback */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRollback(group.namespace)}
          >
            <RotateCcw size={11} />
            {t('deployTask.rollback')}
          </Button>
          {/* Destroy */}
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
      </div>

      {/* Deployment rows */}
      <div className="divide-y divide-border-subtle/70">
        {group.deployments.map((dep) => (
          <DeploymentRow key={`${dep.namespace}/${dep.name}`} dep={dep} />
        ))}
      </div>

      {/* Latest task footer */}
      {task && (
        <div className="flex items-center justify-between border-t border-border-subtle bg-bg-secondary/50 px-5 py-2.5">
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
        </div>
      )}
    </Card>
  )
}

// ── Tasks Panel ───────────────────────────────────────────────────────────────

function TasksPanel({ tasks }: { tasks: DeployTaskListItem[] }) {
  const { t } = useTranslation()

  if (tasks.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-600">{t('deployTask.noTasks')}</div>
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
            className={cn(
              'block bg-gray-900 border rounded-lg px-4 py-3 hover:border-gray-600 transition-colors',
              running ? 'border-blue-900/40' : 'border-gray-800',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-200">#{task.id}</span>
                <Badge variant={getStatusVariant(task.status)} size="sm">
                  {t(`deployTask.statuses.${task.status}`)}
                </Badge>
                {running && <Loader2 size={12} className="animate-spin text-blue-400" />}
              </div>
              <span className="text-[10px] text-gray-600">
                {formatTimestamp(task.updatedAt ?? task.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
              <span>{task.namespace}</span>
              {task.templateSlug && (
                <>
                  <span>·</span>
                  <span>{task.templateSlug}</span>
                </>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function DeploymentsPage() {
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
    refetchInterval: 10_000,
    staleTime: 5_000,
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
      toast.success(t('clusters.destroyed') + ` ${ns}`)
      addActivity({ type: 'destroy', title: `Destroyed namespace ${ns}`, namespace: ns })
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
      toast.error('Failed to destroy namespace')
    },
  })

  const rollbackMutation = useMutation({
    mutationFn: (namespace: string) => api.rollback({ namespace }),
    onSuccess: () => {
      setRollbackNs(null)
      queryClient.invalidateQueries({ queryKey: ['deploy-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      toast.success('Rollback initiated')
    },
    onError: () => {
      toast.error('Rollback failed')
    },
  })

  const handleRedeploy = async (taskId: number) => {
    const res = await fetch(`/api/deploy-tasks/${taskId}/redeploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) return

    const reader = res.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.id) {
              reader.cancel()
              navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(data.id) } })
              return
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
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
      readyCount: deps.filter(isDeploymentReady).length,
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
  const ready = visibleDeployments.filter(isDeploymentReady).length
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
    <div className="mx-auto max-w-[1440px] space-y-6 px-6 py-6 md:px-8">
      <Breadcrumb items={[{ label: t('deployments.title') }]} className="mb-4" />

      <section className="glass-panel p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.02em] text-text-primary">{t('deployments.title')}</h1>
            <p className="mt-1 text-sm text-text-muted">{t('deployments.description')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
            >
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
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
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
        </div>

        {/* Tabs */}
        <div className="mb-2 flex items-center justify-between gap-3">
          <Tabs value={activeTab} onChange={setActiveTab}>
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span className="rounded-full bg-bg-tertiary/70 px-2 py-0.5 text-xs font-black tracking-normal text-text-muted">
                      {tab.count}
                    </span>
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
      </section>

      {/* Infrastructure Tab */}
      {activeTab === 'infrastructure' && (
        <>
          {isLoading && (
            <div className="glass-panel space-y-4 p-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl border border-border-subtle bg-bg-secondary/60 p-4"
                >
                  <div className="mb-4 h-5 w-32 rounded bg-bg-tertiary" />
                  <div className="h-12 rounded bg-bg-tertiary" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && groups.length === 0 && (
            <div className="glass-panel p-6">
              <EmptyState
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
            </div>
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
          {tasksLoading && (
            <div className="flex items-center justify-center py-20 text-sm text-text-muted">
              <Loader2 size={18} className="animate-spin mr-2" />
              {t('common.loading')}
            </div>
          )}
          {!tasksLoading && <TasksPanel tasks={tasks} />}
        </>
      )}

      {/* Destroy confirmation */}
      <AlertDialog
        open={Boolean(destroyNs)}
        onOpenChange={(open) => {
          if (!open) setDestroyNs(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('clusters.destroyNamespace')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {destroyNs ? t('clusters.destroyWarning', { namespace: destroyNs }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="danger"
                loading={destroyMutation.isPending}
                onClick={() => destroyNs && destroyMutation.mutate(destroyNs)}
              >
                {destroyMutation.isPending ? t('clusters.destroying') : t('clusters.destroy')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rollback confirmation */}
      <AlertDialog
        open={Boolean(rollbackNs)}
        onOpenChange={(open) => {
          if (!open) setRollbackNs(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('deployTask.rollback')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {rollbackNs ? t('deployments.rollbackWarning', { namespace: rollbackNs }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="danger"
                loading={rollbackMutation.isPending}
                onClick={() => rollbackNs && rollbackMutation.mutate(rollbackNs)}
              >
                {t('deployTask.rollback')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
