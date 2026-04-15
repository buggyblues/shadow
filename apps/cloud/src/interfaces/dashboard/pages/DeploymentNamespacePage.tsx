import {
  Badge,
  Button,
  Card,
  NativeSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  Box,
  CheckCircle,
  DollarSign,
  Download,
  FileText,
  FolderClock,
  FolderOpen,
  Info,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  Server,
  Terminal,
  Trash2,
  Variable,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Breadcrumb } from '@/components/Breadcrumb'
import { CliCommandSnippet } from '@/components/CliCommandSnippet'
import { DangerConfirmDialog } from '@/components/DangerConfirmDialog'
import { DashboardEmptyState } from '@/components/DashboardEmptyState'
import { DashboardNamespaceCard } from '@/components/DashboardNamespaceCard'
import { DashboardTaskCard } from '@/components/DashboardTaskCard'
import { EnvVarEditorDialog } from '@/components/EnvVarEditorDialog'
import { LogsPanel } from '@/components/LogsPanel'
import { StatCard } from '@/components/StatCard'
import { StatusBadge } from '@/components/StatusBadge'
import { StatusDot } from '@/components/StatusDot'
import { ToolbarActionButton } from '@/components/ToolbarActionButton'
import { useSSEStream } from '@/hooks/useSSEStream'
import { api, type Deployment, type EnvVarListEntry, type Pod } from '@/lib/api'
import { formatUsdCost } from '@/lib/store-data'
import { cn, formatTimestamp, getAge, getReadyReplicas, isDeploymentReady } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

function getReplicas(dep: Deployment): number {
  return getReadyReplicas(dep.ready)
}

function getPodStatusType(status: string): 'success' | 'warning' | 'error' | 'info' {
  if (status === 'Running') return 'success'
  if (status === 'Pending') return 'warning'
  if (status === 'Failed') return 'error'
  if (status === 'Succeeded') return 'info'
  return 'warning'
}

function AgentCard({
  deployment,
  namespace,
  selected,
  onSelect,
  onOpenLogs,
}: {
  deployment: Deployment
  namespace: string
  selected: boolean
  onSelect: () => void
  onOpenLogs: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const addActivity = useAppStore((state) => state.addActivity)
  const [replicas, setReplicas] = useState<number | null>(null)
  const ready = isDeploymentReady(deployment.ready)
  const currentReplicas = replicas ?? getReplicas(deployment)

  const scaleMutation = useMutation({
    mutationFn: (count: number) => api.deployments.scale(namespace, deployment.name, count),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      toast.success(
        t('deployments.scaledAgent', {
          agent: deployment.name,
          count: replicas ?? currentReplicas,
        }),
      )
      addActivity({
        type: 'scale',
        title: `Scaled ${deployment.name}`,
        detail: `Replicas: ${replicas ?? currentReplicas}`,
        namespace,
      })
    },
    onError: () => toast.error(t('deployments.scaleFailed', { agent: deployment.name })),
  })

  const handleScale = (delta: number) => {
    const next = Math.max(0, currentReplicas + delta)
    setReplicas(next)
    scaleMutation.mutate(next)
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-colors',
        selected
          ? 'border-primary/60 bg-primary/10'
          : 'border-border-subtle bg-bg-secondary hover:border-border-dim',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <Button type="button" onClick={onSelect} variant="ghost" size="sm">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={ready ? 'success' : 'warning'} pulse={!ready} />
            <p className="text-sm font-mono text-text-primary truncate">{deployment.name}</p>
            {selected && (
              <Badge variant="info" size="sm">
                {t('deployments.currentSelection')}
              </Badge>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">{getAge(deployment.age)}</p>
        </Button>

        <Button
          type="button"
          onClick={onOpenLogs}
          variant="ghost"
          size="sm"
          className="dashboard-action-button"
        >
          {t('deployments.tabLogs')}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <StatusBadge
          dotStatus={ready ? 'success' : 'warning'}
          pulse={!ready}
          badgeVariant={ready ? 'success' : 'warning'}
          badgeText={deployment.ready}
        />

        <div className="flex items-center rounded-lg border border-border-dim">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="dashboard-action-button"
            onClick={() => handleScale(-1)}
            disabled={scaleMutation.isPending || currentReplicas <= 0}
          >
            −
          </Button>
          <span className="text-xs font-mono px-2 min-w-[2rem] text-center">{currentReplicas}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="dashboard-action-button"
            onClick={() => handleScale(1)}
            disabled={scaleMutation.isPending}
          >
            +
          </Button>
        </div>
      </div>
    </div>
  )
}

function PodsPanel({
  namespace,
  agent,
  enabled,
}: {
  namespace: string
  agent: string | null
  enabled: boolean
}) {
  const { t } = useTranslation()
  const { data: pods, isLoading } = useQuery({
    queryKey: ['pods', namespace, agent],
    queryFn: () => api.deployments.pods(namespace, agent ?? ''),
    enabled: enabled && Boolean(agent),
    refetchInterval: 10_000,
  })

  if (!agent) {
    return <DashboardEmptyState icon={Box} title={t('deployments.noAgentSelected')} />
  }

  if (isLoading) {
    return (
      <div className="py-10 text-center text-text-muted text-sm">
        <Loader2 size={16} className="animate-spin inline mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (!pods || pods.length === 0) {
    return <DashboardEmptyState icon={Box} title={t('deployments.noPodsForAgent', { agent })} />
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        {t('deployments.selectedPodsCount', { count: pods.length })}
      </p>

      <Card variant="glass">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="dashboard-table-head">{t('clusters.status')}</TableHead>
              <TableHead className="dashboard-table-head">{t('monitoring.name')}</TableHead>
              <TableHead className="dashboard-table-head">{t('monitoring.ready')}</TableHead>
              <TableHead className="dashboard-table-head">{t('deployments.restarts')}</TableHead>
              <TableHead className="dashboard-table-head">{t('deployments.age')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pods.map((pod) => (
              <TableRow key={pod.name}>
                <TableCell>
                  <StatusBadge
                    dotStatus={getPodStatusType(pod.status)}
                    dotLabel={pod.status}
                    badgeVariant={pod.ready === '1/1' ? 'success' : 'warning'}
                    badgeText={pod.ready}
                  />
                </TableCell>
                <TableCell>{pod.name}</TableCell>
                <TableCell className="text-xs font-mono text-text-secondary">{pod.ready}</TableCell>
                <TableCell>{pod.restarts}</TableCell>
                <TableCell>{getAge(pod.age)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function NamespaceLogsTab({ namespace, agent }: { namespace: string; agent: string | null }) {
  const { t } = useTranslation()
  const logRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(200)
  const { lines, status, error, connect, disconnect, clear } = useSSEStream({ maxLines: 4000 })

  const {
    data: history,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['deployment-log-history', namespace, agent, page, limit],
    queryFn: () => api.deployments.logsHistory(namespace, agent ?? '', page, limit),
    enabled: Boolean(agent),
  })

  useEffect(() => {
    disconnect()
    clear()
    setPage(1)
  }, [agent, namespace, disconnect, clear])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [lines.length])

  const connected = status === 'connecting' || status === 'connected'

  const handleConnect = () => {
    if (!agent) return
    connect(api.deployments.logsUrl(namespace, agent))
  }

  const handleDownload = () => {
    const historyLines = history?.lines ?? []
    const content = [...historyLines, '', '--- LIVE ---', ...lines].join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${namespace}-${agent ?? 'logs'}-${Date.now()}.log`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (!agent) {
    return (
      <DashboardEmptyState
        icon={FileText}
        title={t('deployments.noAgentSelected')}
        description={t('deployments.selectAgentForLogs')}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t('deployments.recentLogs')}</h3>
          <p className="text-xs text-text-muted">
            {t('deployments.logsHistoryDescription', { agent })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NativeSelect
            value={String(limit)}
            onChange={(event) => {
              setLimit(Number(event.target.value))
              setPage(1)
            }}
          >
            {[100, 200, 500].map((value) => (
              <option key={value} value={value}>
                {t('deployments.linesPerPage', { count: value })}
              </option>
            ))}
          </NativeSelect>
          <ToolbarActionButton
            type="button"
            onClick={() => refetch()}
            variant="ghost"
            icon={<RefreshCw size={12} />}
            label={t('common.refresh')}
          />
          <ToolbarActionButton
            type="button"
            onClick={handleDownload}
            variant="ghost"
            icon={<Download size={12} />}
            label={t('deploy.download')}
          />
        </div>
      </div>

      <LogsPanel
        headerLeft={
          <>
            <span className="font-medium text-text-secondary">{agent}</span>
            {history?.podName ? <span> · {history.podName}</span> : null}
            <span> · {t('deployments.pageLabel', { page })}</span>
          </>
        }
        headerRight={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              variant="ghost"
              size="sm"
            >
              {t('deployments.newerLogs')}
            </Button>
            <Button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={!history?.hasMore}
              variant="ghost"
              size="sm"
            >
              {t('deployments.olderLogs')}
            </Button>
          </div>
        }
        lines={isLoading ? [] : (history?.lines ?? [])}
        emptyText={isLoading ? t('common.loading') : t('deployments.noLogsYet')}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t('deployments.liveLogs')}</h3>
            <p className="text-xs text-text-muted">{t('deployments.liveLogsDescription')}</p>
          </div>
          <div className="flex items-center gap-2">
            {(lines.length > 0 || connected) && (
              <Button
                type="button"
                onClick={() => {
                  disconnect()
                  clear()
                }}
                variant="ghost"
                size="sm"
              >
                {t('common.clearAll')}
              </Button>
            )}
            <ToolbarActionButton
              type="button"
              onClick={handleConnect}
              variant={connected ? 'secondary' : 'ghost'}
              icon={<RefreshCw size={12} className={connected ? 'animate-spin' : ''} />}
              label={connected ? t('deployments.streaming') : t('deployments.connectLogs')}
            />
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        <LogsPanel
          headerLeft={`${namespace}/${agent}`}
          lines={lines}
          emptyText={connected ? t('deployments.waitingForLogs') : t('deployments.connectLiveLogs')}
          bodyRef={logRef}
        />
      </div>
    </div>
  )
}

function NamespaceEnvironmentTab({ namespace }: { namespace: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [editEntry, setEditEntry] = useState<{
    key: string
    value: string
    isSecret: boolean
  } | null>(null)
  const [deleteKey, setDeleteKey] = useState<string | null>(null)

  const scopedQuery = useQuery({
    queryKey: ['deployment-env', namespace, 'scoped'],
    queryFn: () => api.deployments.env.list(namespace, 'scoped'),
  })

  const effectiveQuery = useQuery({
    queryKey: ['deployment-env', namespace, 'effective'],
    queryFn: () => api.deployments.env.list(namespace, 'effective'),
  })

  const scopedEntries = scopedQuery.data?.envVars ?? []
  const fallbackEntries = useMemo(() => {
    const scopedScope = scopedQuery.data?.scope
    return (effectiveQuery.data?.envVars ?? []).filter((entry) => entry.scope !== scopedScope)
  }, [effectiveQuery.data?.envVars, scopedQuery.data?.scope])

  const saveMutation = useMutation({
    mutationFn: async (form: { key: string; value: string; isSecret: boolean }) => {
      await api.deployments.env.upsert(namespace, form.key, form.value, form.isSecret)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment-env', namespace] })
      setDialogMode(null)
      setEditEntry(null)
      toast.success(t('secrets.valueSaved'))
    },
    onError: () => toast.error(t('secrets.valueSaveFailed')),
  })

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.deployments.env.delete(namespace, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment-env', namespace] })
      setDeleteKey(null)
      toast.success(t('secrets.valueDeleted'))
    },
    onError: () => toast.error(t('secrets.valueDeleteFailed')),
  })

  const handleEditStart = async (entry: EnvVarListEntry) => {
    try {
      const { envVar } = await api.deployments.env.getOne(namespace, entry.key)
      setEditEntry({ key: envVar.key, value: envVar.value, isSecret: envVar.isSecret })
      setDialogMode('edit')
    } catch {
      toast.error(t('secrets.valueLoadFailed'))
    }
  }

  if (scopedQuery.isLoading || effectiveQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-14 text-text-muted text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {t('deployments.scopedEnvTitle')}
            </h3>
            <p className="text-xs text-text-muted">{t('deployments.scopedEnvDescription')}</p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setEditEntry(null)
              setDialogMode('create')
            }}
            variant="primary"
            size="sm"
            className="dashboard-action-button"
          >
            <Plus size={11} />
            {t('common.add')}
          </Button>
        </div>

        {scopedEntries.length === 0 ? (
          <DashboardEmptyState icon={Variable} title={t('deployments.noScopedEnv')} />
        ) : (
          <Card variant="glass">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="dashboard-table-head">{t('secrets.keyName')}</TableHead>
                  <TableHead className="dashboard-table-head">{t('secrets.secretValue')}</TableHead>
                  <TableHead className="dashboard-table-head">{t('secrets.secret')}</TableHead>
                  <TableHead className="dashboard-table-head">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopedEntries.map((entry) => (
                  <TableRow key={entry.key}>
                    <TableCell>{entry.key}</TableCell>
                    <TableCell>{entry.maskedValue}</TableCell>
                    <TableCell>
                      {entry.isSecret ? (
                        <Badge variant="warning" size="sm">
                          {t('secrets.secret')}
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          {t('deployments.plainText')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          onClick={() => void handleEditStart(entry)}
                          variant="ghost"
                          size="icon"
                          className="dashboard-action-button"
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setDeleteKey(entry.key)}
                          variant="ghost"
                          size="icon"
                          className="dashboard-action-button"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-2">
          {t('deployments.fallbackEnvTitle')}
        </h3>
        <p className="text-xs text-text-muted mb-3">{t('deployments.fallbackEnvDescription')}</p>

        {fallbackEntries.length === 0 ? (
          <DashboardEmptyState icon={Variable} title={t('deployments.noFallbackEnv')} />
        ) : (
          <Card variant="glass">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="dashboard-table-head">{t('secrets.keyName')}</TableHead>
                  <TableHead className="dashboard-table-head">{t('secrets.secretValue')}</TableHead>
                  <TableHead className="dashboard-table-head">{t('secrets.scope')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fallbackEntries.map((entry) => (
                  <TableRow key={`${entry.scope}-${entry.key}`}>
                    <TableCell>{entry.key}</TableCell>
                    <TableCell>{entry.maskedValue}</TableCell>
                    <TableCell>
                      <Badge variant="neutral" size="sm">
                        {entry.scope === 'global'
                          ? t('deployments.globalFallback')
                          : t('deployments.namespaceScoped')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {dialogMode && (
        <EnvVarEditorDialog
          mode={dialogMode}
          initial={editEntry ?? undefined}
          isSubmitting={saveMutation.isPending}
          titleCreate={t('deployments.addScopedEnv')}
          titleEdit={t('deployments.editScopedEnv')}
          subtitleCreate={t('deployments.scopedEnvDescription')}
          subtitleEdit={t('deployments.scopedEnvDescription')}
          onSubmit={(form) => saveMutation.mutate(form)}
          onClose={() => {
            setDialogMode(null)
            setEditEntry(null)
          }}
        />
      )}

      <DangerConfirmDialog
        open={Boolean(deleteKey)}
        onOpenChange={(open) => {
          if (!open) setDeleteKey(null)
        }}
        title={t('common.delete')}
        description={deleteKey ? t('deployments.deleteScopedEnvConfirm', { key: deleteKey }) : ''}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteKey) {
            deleteMutation.mutate(deleteKey)
          }
        }}
      />
    </div>
  )
}

function NamespaceTasksTab({ namespace }: { namespace: string }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['deploy-tasks'],
    queryFn: api.deployTasks.list,
    refetchInterval: 5_000,
  })

  const tasks = useMemo(() => {
    return [...(data?.tasks ?? [])]
      .filter((item) => item.task.namespace === namespace)
      .sort((left, right) => right.task.id - left.task.id)
  }, [data?.tasks, namespace])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14 text-text-muted text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <DashboardEmptyState
        icon={FolderClock}
        title={t('deployTask.noTasks')}
        description={t('deployments.noTasksInNamespace')}
      />
    )
  }

  return (
    <div className="space-y-2">
      {tasks.map(({ task, active }) => {
        const running = active || task.status === 'running' || task.status === 'pending'
        const variant =
          task.status === 'deployed'
            ? 'success'
            : task.status === 'failed'
              ? 'danger'
              : task.status === 'running'
                ? 'info'
                : ('neutral' as const)

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
              statusVariant={variant}
              running={running}
              timestamp={formatTimestamp(task.updatedAt ?? task.createdAt)}
              meta={task.templateSlug ? <span>{task.templateSlug}</span> : undefined}
              error={task.error}
            />
          </Link>
        )
      })}
    </div>
  )
}

function NamespaceCostTab({ namespace }: { namespace: string }) {
  const { t, i18n } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['namespace-costs', namespace],
    queryFn: () => api.deployments.namespaceCosts(namespace),
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14 text-text-muted text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (!data) {
    return (
      <DashboardEmptyState
        icon={DollarSign}
        title={t('deployments.costUnavailable')}
        description={t('deployments.costUnavailableDescription')}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label={t('deployments.namespaceCost')}
          value={formatUsdCost(data.totalUsd, i18n.language)}
          icon={<DollarSign size={13} />}
          color="green"
        />
        <StatCard
          label={t('deployments.availableAgents')}
          value={data.availableAgents}
          icon={<CheckCircle size={13} />}
          color="blue"
        />
        <StatCard
          label={t('deployments.unavailableAgents')}
          value={data.unavailableAgents}
          icon={<XCircle size={13} />}
          color={data.unavailableAgents > 0 ? 'yellow' : 'default'}
        />
      </div>

      <div className="text-xs text-text-muted">
        {t('deployments.generatedAt')}: {formatTimestamp(data.generatedAt)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.agents.map((agent) => (
          <div
            key={agent.agentName}
            className="bg-bg-secondary border border-border-subtle rounded-xl p-5"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono text-text-primary">{agent.agentName}</p>
                  <Badge variant={agent.totalUsd !== null ? 'success' : 'neutral'} size="sm">
                    {agent.source}
                  </Badge>
                </div>
                <p className="text-xs text-text-muted mt-1">{agent.podName ?? t('common.none')}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-green-400">
                  {formatUsdCost(agent.totalUsd, i18n.language)}
                </p>
                <p className="text-xs text-text-muted">{t('deployments.totalCost')}</p>
              </div>
            </div>

            {agent.providers.length > 0 ? (
              <div className="space-y-2">
                {agent.providers.map((provider) => (
                  <div
                    key={`${agent.agentName}-${provider.provider}`}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-text-secondary">{provider.provider}</span>
                    <div className="text-right">
                      <p className="text-text-secondary">
                        {formatUsdCost(provider.amountUsd, i18n.language)}
                      </p>
                      <p className="text-text-muted">
                        {provider.usageLabel ?? provider.raw ?? '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">{t('deployments.noProvidersReported')}</p>
            )}

            {agent.message && <p className="text-xs text-yellow-500 mt-3">{agent.message}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function NamespaceInfoTab({
  namespace,
  agent,
  deployments,
  pods,
}: {
  namespace: string
  agent: string | null
  deployments: Deployment[]
  pods: Pod[] | undefined
}) {
  const { t } = useTranslation()
  const readyAgents = deployments.filter((deployment) => isDeploymentReady(deployment.ready)).length
  const totalRestarts = pods?.reduce((sum, pod) => sum + Number(pod.restarts), 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="bg-bg-secondary border border-border-subtle rounded-lg divide-y divide-border-subtle">
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-text-muted">{t('deployments.namespaceLabel')}</span>
          <span className="text-sm font-mono text-text-secondary">{namespace}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-text-muted">{t('deployments.agents')}</span>
          <span className="text-sm text-text-secondary">{deployments.length}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-text-muted">{t('deployments.readyAgents')}</span>
          <span className="text-sm text-green-400">{readyAgents}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-text-muted">{t('deployments.currentAgent')}</span>
          <span className="text-sm font-mono text-text-secondary">{agent ?? t('common.none')}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-text-muted">{t('deployments.selectedPods')}</span>
          <span className="text-sm text-text-secondary">{pods?.length ?? 0}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-text-muted">{t('deployments.totalRestarts')}</span>
          <span
            className={cn('text-sm', totalRestarts > 0 ? 'text-yellow-400' : 'text-text-secondary')}
          >
            {totalRestarts}
          </span>
        </div>
      </div>

      <div className="bg-bg-secondary border border-border-subtle rounded-lg p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Terminal size={14} className="text-text-muted" />
          {t('deployments.kubectlCommands')}
        </h3>
        <div className="space-y-2">
          <CliCommandSnippet
            title={t('deployments.viewAgents')}
            command={`kubectl get deployments -n ${namespace}`}
          />
          <CliCommandSnippet
            title={t('deployments.viewPods')}
            command={`kubectl get pods -n ${namespace}`}
          />
          {agent && (
            <CliCommandSnippet
              title={t('clusters.viewLogs')}
              command={`kubectl logs -n ${namespace} -l app=${agent} --tail=200`}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export function DeploymentNamespacePage() {
  const { t, i18n } = useTranslation()
  const { namespace } = useParams({ strict: false }) as { namespace: string }
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const addActivity = useAppStore((state) => state.addActivity)
  const [activeTab, setActiveTab] = useState('agents')
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [destroyOpen, setDestroyOpen] = useState(false)

  const {
    data: deployments,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.deployments.list,
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

  const namespaceDeployments = useMemo(() => {
    return (deployments ?? [])
      .filter((deployment) => deployment.namespace === namespace)
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [deployments, namespace])

  useEffect(() => {
    if (namespaceDeployments.length === 0) {
      setSelectedAgent(null)
      return
    }
    setSelectedAgent((current) => {
      if (current && namespaceDeployments.some((deployment) => deployment.name === current)) {
        return current
      }
      return namespaceDeployments[0]?.name ?? null
    })
  }, [namespaceDeployments])

  const selectedPodsQuery = useQuery({
    queryKey: ['pods', namespace, selectedAgent],
    queryFn: () => api.deployments.pods(namespace, selectedAgent ?? ''),
    enabled: Boolean(selectedAgent),
    refetchInterval: 10_000,
  })

  const namespaceCostQuery = useQuery({
    queryKey: ['namespace-costs', namespace],
    queryFn: () => api.deployments.namespaceCosts(namespace),
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  const tasksQuery = useQuery({
    queryKey: ['deploy-tasks'],
    queryFn: api.deployTasks.list,
    refetchInterval: 5_000,
  })

  const tasks = useMemo(() => {
    return [...(tasksQuery.data?.tasks ?? [])]
      .filter((item) => item.task.namespace === namespace)
      .sort((left, right) => right.task.id - left.task.id)
  }, [tasksQuery.data?.tasks, namespace])

  const latestTask = tasks[0]

  const destroyMutation = useMutation({
    mutationFn: () => api.destroy({ namespace }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      toast.success(t('clusters.destroyed') + ` ${namespace}`)
      addActivity({ type: 'destroy', title: `Destroyed namespace ${namespace}`, namespace })
      navigate({ to: '/deployments' })
    },
    onError: () => toast.error(t('deployments.destroyNamespaceFailed')),
  })

  const handleRedeploy = async () => {
    if (!latestTask) {
      toast.error(t('deployments.noTaskToRedeploy'))
      return
    }

    const nextTaskId = await api.deployTasks.redeployToTaskId(latestTask.task.id)
    if (!nextTaskId) {
      toast.error(t('deployments.redeployFailed'))
      return
    }
    navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(nextTaskId) } })
  }

  const readyAgents = namespaceDeployments.filter((deployment) =>
    isDeploymentReady(deployment.ready),
  ).length
  const selectedPods = selectedPodsQuery.data ?? []
  const runningTasks = tasks.filter((item) => item.active || item.task.status === 'running').length

  const tabs = [
    {
      id: 'agents',
      label: t('deployments.agents'),
      icon: <Box size={13} />,
      count: namespaceDeployments.length,
    },
    { id: 'logs', label: t('deployments.tabLogs'), icon: <FileText size={13} /> },
    { id: 'env', label: t('deployments.tabEnv'), icon: <Variable size={13} /> },
    {
      id: 'tasks',
      label: t('deployments.tabTasks'),
      icon: <FolderClock size={13} />,
      count: tasks.length,
    },
    { id: 'cost', label: t('deployments.costTab'), icon: <DollarSign size={13} /> },
    { id: 'info', label: t('deployments.tabInfo'), icon: <Info size={13} /> },
  ]

  if (!isLoading && namespaceDeployments.length === 0) {
    return (
      <div className="dashboard-page-shell dashboard-page-shell--narrow space-y-6">
        <Breadcrumb
          items={[{ label: t('deployments.title'), to: '/deployments' }, { label: namespace }]}
          className="mb-4"
        />
        <DashboardEmptyState
          icon={FolderOpen}
          title={t('deployments.noDeploymentsInNamespace')}
          description={t('deployments.noDeploymentsInNamespaceDescription', { namespace })}
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
    )
  }

  return (
    <div className="dashboard-page-shell dashboard-page-shell--narrow space-y-6">
      <Breadcrumb
        items={[{ label: t('deployments.title'), to: '/deployments' }, { label: namespace }]}
        className="mb-4"
      />

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="dashboard-page-title font-mono text-3xl">{namespace}</h1>
          <p className="dashboard-page-description mt-1">{t('deployments.namespaceDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              void refetch()
              void queryClient.invalidateQueries({ queryKey: ['namespace-costs', namespace] })
              void queryClient.invalidateQueries({ queryKey: ['deploy-tasks'] })
            }}
            variant="ghost"
            size="sm"
            className="dashboard-action-button"
          >
            <RefreshCw size={12} />
            {t('common.refresh')}
          </Button>
          {latestTask && (
            <Button
              type="button"
              onClick={() => void handleRedeploy()}
              variant="ghost"
              size="sm"
              className="dashboard-action-button"
            >
              <Rocket size={12} />
              {t('deployTask.redeploy')}
            </Button>
          )}
          <Button
            type="button"
            onClick={() => setDestroyOpen(true)}
            variant="ghost"
            size="sm"
            className="dashboard-action-button"
          >
            <Trash2 size={12} />
            {t('clusters.destroy')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t('deployments.agents')}
          value={namespaceDeployments.length}
          icon={<Box size={13} />}
        />
        <StatCard
          label={t('deployments.readyAgents')}
          value={readyAgents}
          icon={<CheckCircle size={13} />}
          color="green"
        />
        <StatCard
          label={t('deployments.selectedPods')}
          value={selectedPods.length}
          icon={<Server size={13} />}
          color="blue"
        />
        <StatCard
          label={t('deployments.namespaceCost')}
          value={formatUsdCost(namespaceCostQuery.data?.totalUsd ?? null, i18n.language)}
          icon={<DollarSign size={13} />}
          color="purple"
        />
      </div>

      <DashboardNamespaceCard
        className="mb-6"
        headerLeft={
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              {t('deployments.agentSelector')}
            </h2>
            <p className="text-xs text-text-muted">{t('deployments.agentSelectorDescription')}</p>
          </div>
        }
        headerRight={
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <FolderClock size={12} />
            {t('deployments.runningTasksCount', { count: runningTasks })}
          </div>
        }
        rows={
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {namespaceDeployments.map((deployment) => (
                <AgentCard
                  key={`${deployment.namespace}/${deployment.name}`}
                  deployment={deployment}
                  namespace={namespace}
                  selected={selectedAgent === deployment.name}
                  onSelect={() => setSelectedAgent(deployment.name)}
                  onOpenLogs={() => {
                    setSelectedAgent(deployment.name)
                    setActiveTab('logs')
                  }}
                />
              ))}
            </div>
          </div>
        }
      />

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

      <div className="min-h-[38vh]">
        {activeTab === 'agents' && (
          <PodsPanel namespace={namespace} agent={selectedAgent} enabled={!isLoading} />
        )}
        {activeTab === 'logs' && <NamespaceLogsTab namespace={namespace} agent={selectedAgent} />}
        {activeTab === 'env' && <NamespaceEnvironmentTab namespace={namespace} />}
        {activeTab === 'tasks' && <NamespaceTasksTab namespace={namespace} />}
        {activeTab === 'cost' && <NamespaceCostTab namespace={namespace} />}
        {activeTab === 'info' && (
          <NamespaceInfoTab
            namespace={namespace}
            agent={selectedAgent}
            deployments={namespaceDeployments}
            pods={selectedPodsQuery.data}
          />
        )}
      </div>

      <DangerConfirmDialog
        open={destroyOpen}
        onOpenChange={setDestroyOpen}
        title={t('clusters.destroyNamespace')}
        description={t('clusters.destroyWarning', { namespace })}
        confirmText={destroyMutation.isPending ? t('clusters.destroying') : t('clusters.destroy')}
        cancelText={t('common.cancel')}
        loading={destroyMutation.isPending}
        onConfirm={() => destroyMutation.mutate()}
      />
    </div>
  )
}
