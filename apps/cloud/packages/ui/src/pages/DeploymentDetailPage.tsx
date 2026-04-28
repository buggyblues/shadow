import Editor from '@monaco-editor/react'
import {
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  Activity,
  Box,
  CheckCircle,
  Download,
  FileJson,
  FileText,
  FolderClock,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Settings,
  Trash2,
  Variable,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Breadcrumb } from '@/components/Breadcrumb'
import { DangerConfirmDialog } from '@/components/DangerConfirmDialog'
import { DashboardEmptyState } from '@/components/DashboardEmptyState'
import { DashboardTabsList } from '@/components/DashboardTabsList'
import { DashboardTaskCard } from '@/components/DashboardTaskCard'
import { EnvVarEditorDialog } from '@/components/EnvVarEditorDialog'
import { IconActionButton } from '@/components/IconActionButton'
import { LogsPanel } from '@/components/LogsPanel'
import { StatCard } from '@/components/StatCard'
import { StatusBadge } from '@/components/StatusBadge'
import { ToolbarActionButton } from '@/components/ToolbarActionButton'
import { useSSEStream } from '@/hooks/useSSEStream'
import { api, type Pod, type ValidateResult } from '@/lib/api'
import { cn, formatTimestamp, getAge, pluralize } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPodStatusType(status: string): 'success' | 'warning' | 'error' | 'info' {
  if (status === 'Running') return 'success'
  if (status === 'Pending') return 'warning'
  if (status === 'Failed') return 'error'
  if (status === 'Succeeded') return 'info'
  return 'warning'
}

// ── Pods Tab ──────────────────────────────────────────────────────────────────

function PodsTab({ pods, isLoading }: { pods: Pod[] | undefined; isLoading: boolean }) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="py-10 text-center text-text-muted text-sm">
        {t('deploymentDetail.podsLoading')}
      </div>
    )
  }

  if (!pods || pods.length === 0) {
    return (
      <DashboardEmptyState
        icon={Box}
        title={t('deploymentDetail.podsEmptyTitle')}
        description={t('deploymentDetail.podsEmptyDescription')}
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        {t('deploymentDetail.podsSummary', {
          count: pods.length,
          label: pluralize(pods.length, 'pod'),
        })}
      </p>

      <Card variant="glass">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                {t('clusters.status')}
              </TableHead>
              <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                {t('monitoring.name')}
              </TableHead>
              <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                {t('deployments.restarts')}
              </TableHead>
              <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                {t('deployments.age')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pods.map((pod) => (
              <TableRow key={pod.name}>
                <TableCell>
                  <StatusBadge
                    dotStatus={getPodStatusType(pod.status)}
                    dotLabel={pod.status}
                    badgeVariant={pod.status === 'Running' ? 'success' : 'warning'}
                    badgeText={pod.status}
                  />
                </TableCell>
                <TableCell>{pod.name}</TableCell>
                <TableCell>
                  {Number(pod.restarts) > 0 ? (
                    <span className="text-warning">{pod.restarts}</span>
                  ) : (
                    pod.restarts
                  )}
                </TableCell>
                <TableCell>{getAge(pod.age)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────

function LogsTab({ namespace, id }: { namespace: string; id: string }) {
  const { t } = useTranslation()
  const logRef = useRef<HTMLDivElement>(null)
  const { lines, status, error, connect: sseConnect, clear, disconnect } = useSSEStream()

  const handleConnect = () => {
    const url = api.deployments.logsUrl(namespace, id)
    sseConnect(url)
  }

  const connected = status === 'connecting' || status === 'connected'

  const handleDownload = () => {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${namespace}-${id}-logs.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new line batch
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [lines.length])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">{t('deploymentDetail.logsDescription')}</p>
        <div className="flex flex-wrap items-center gap-2">
          {lines.length > 0 && (
            <>
              <ToolbarActionButton
                type="button"
                variant="glass"
                onClick={handleDownload}
                icon={<Download size={11} />}
                label={t('common.download')}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease active:translate-y-[0.5px] focus-visible:outline-none"
                onClick={() => {
                  disconnect()
                  clear()
                }}
              >
                <XCircle size={11} />
                {t('common.clear')}
              </Button>
            </>
          )}
          <ToolbarActionButton
            type="button"
            variant={connected ? 'primary' : 'glass'}
            onClick={handleConnect}
            icon={<RefreshCw size={12} className={connected ? 'animate-spin' : ''} />}
            label={connected ? t('deployments.streaming') : t('deployments.connectLogs')}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}

      <LogsPanel
        headerLeft={
          <span className="font-mono">
            {namespace}/{id}
          </span>
        }
        headerRight={<span>{t('deploymentDetail.logsLines', { count: lines.length })}</span>}
        lines={lines}
        emptyText={
          connected ? t('deploymentDetail.logsWaiting') : t('deploymentDetail.logsConnectHint')
        }
        bodyRef={logRef}
        bodyClassName="max-h-[30rem] bg-bg-deep/80"
      />
    </div>
  )
}

// ── Info Tab ──────────────────────────────────────────────────────────────────

function InfoTab({
  namespace,
  id,
  pods,
}: {
  namespace: string
  id: string
  pods: Pod[] | undefined
}) {
  const { t } = useTranslation()
  const running = pods?.filter((p) => p.status === 'Running').length ?? 0
  const totalRestarts = pods?.reduce((sum, p) => sum + Number(p.restarts), 0) ?? 0

  return (
    <div className="space-y-6">
      <Card variant="glass">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-xs text-text-muted">
            {t('deploymentDetail.info.deploymentName')}
          </span>
          <span className="text-sm font-mono text-text-primary">{id}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-xs text-text-muted">{t('deploymentDetail.info.namespace')}</span>
          <span className="text-sm font-mono text-text-secondary">{namespace}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-xs text-text-muted">{t('deploymentDetail.info.totalPods')}</span>
          <span className="text-sm text-text-primary">{pods?.length ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-xs text-text-muted">{t('deploymentDetail.info.runningPods')}</span>
          <span className="text-sm text-success">{running}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-xs text-text-muted">
            {t('deploymentDetail.info.totalRestarts')}
          </span>
          <span
            className={cn('text-sm', totalRestarts > 0 ? 'text-warning' : 'text-text-secondary')}
          >
            {totalRestarts}
          </span>
        </div>
      </Card>
    </div>
  )
}

// ── Config Tab ────────────────────────────────────────────────────────────────

function ConfigTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null)

  const { data: configData, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.config.get(),
  })

  useEffect(() => {
    if (configData?.content && !dirty) {
      setContent(configData.content)
    }
  }, [configData, dirty])

  const saveMutation = useMutation({
    mutationFn: () => api.config.put({ content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      setDirty(false)
      toast.success(t('common.saved'))
    },
    onError: () => toast.error(t('configEditor.saveFailed')),
  })

  const handleValidate = async () => {
    try {
      const parsed = JSON.parse(content)
      const result = await api.validate(parsed)
      setValidateResult(result)
    } catch {
      toast.error(t('templateDetail.invalidJSONSyntax'))
    }
  }

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(content)
      setContent(JSON.stringify(parsed, null, 2))
    } catch {
      toast.error(t('templateDetail.cannotFormat'))
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14 text-text-muted text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">{t('deployments.configDescription')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="glass"
            size="sm"
            className="transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease active:translate-y-[0.5px] focus-visible:outline-none"
            onClick={handleFormat}
          >
            <FileJson size={11} />
            {t('deployments.format')}
          </Button>
          <Button
            type="button"
            variant="glass"
            size="sm"
            className="transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease active:translate-y-[0.5px] focus-visible:outline-none"
            onClick={handleValidate}
          >
            <CheckCircle size={11} />
            {t('deployments.validate')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease active:translate-y-[0.5px] focus-visible:outline-none"
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Save size={11} />
            )}
            {t('common.save')}
          </Button>
        </div>
      </div>

      {/* Validation result */}
      {validateResult && (
        <div
          className={cn(
            'rounded-xl border px-4 py-3 text-xs',
            validateResult.valid
              ? 'border-success/20 bg-success/10 text-success'
              : 'border-danger/20 bg-danger/10 text-danger',
          )}
        >
          {validateResult.valid
            ? `✓ ${t('templateDetail.validationSummaryValid', {
                agents: validateResult.agents,
                configurations: validateResult.configurations,
              })}`
            : `✗ ${t('configEditor.validationSummaryInvalid', {
                violations: validateResult.violations?.length ?? 0,
                extendsErrors: validateResult.extendsErrors?.length ?? 0,
              })}`}
        </div>
      )}

      {/* Editor */}
      <Card variant="glass">
        <Editor
          height="400px"
          language="json"
          value={content}
          onChange={(val) => {
            setContent(val ?? '')
            setDirty(true)
          }}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            automaticLayout: true,
            padding: { top: 8 },
            folding: true,
            bracketPairColorization: { enabled: true },
          }}
        />
      </Card>
    </div>
  )
}

// ── Environment Tab ───────────────────────────────────────────────────────────

function EnvironmentTab() {
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

  const { data, isLoading } = useQuery({
    queryKey: ['env'],
    queryFn: api.env.list,
  })

  const envVars = data?.envVars ?? []

  const saveMutation = useMutation({
    mutationFn: async (form: { key: string; value: string; isSecret: boolean }) => {
      await api.env.upsert('global', form.key, form.value, form.isSecret)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['env'] })
      setDialogMode(null)
      setEditEntry(null)
      toast.success(t('secrets.valueSaved'))
    },
    onError: () => toast.error(t('secrets.valueSaveFailed')),
  })

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.env.delete('global', key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['env'] })
      setDeleteKey(null)
      toast.success(t('secrets.valueDeleted'))
    },
    onError: () => toast.error(t('secrets.valueDeleteFailed')),
  })

  const handleEditStart = async (entry: (typeof envVars)[0]) => {
    try {
      const { envVar } = await api.env.getOne(entry.scope, entry.key)
      setEditEntry({ key: envVar.key, value: envVar.value, isSecret: envVar.isSecret })
      setDialogMode('edit')
    } catch {
      toast.error(t('secrets.valueLoadFailed'))
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14 text-text-muted text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">{t('secrets.environmentValuesDescription')}</p>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease active:translate-y-[0.5px] focus-visible:outline-none"
          onClick={() => {
            setEditEntry(null)
            setDialogMode('create')
          }}
        >
          <Plus size={11} />
          {t('common.add')}
        </Button>
      </div>

      {envVars.length === 0 ? (
        <DashboardEmptyState icon={Variable} title={t('secrets.noEnvVarsInGroup')} />
      ) : (
        <Card variant="glass">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                  {t('secrets.keyName')}
                </TableHead>
                <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                  {t('secrets.secretValue')}
                </TableHead>
                <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                  {t('common.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {envVars.map((entry) => (
                <TableRow key={entry.key}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-text-secondary">{entry.key}</code>
                      {entry.isSecret && <Lock size={10} className="text-warning" />}
                    </div>
                  </TableCell>
                  <TableCell>{entry.maskedValue}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <IconActionButton
                        type="button"
                        variant="ghost"
                        label={t('common.edit')}
                        onClick={() => handleEditStart(entry)}
                        icon={<Pencil size={12} />}
                        className="h-8 w-8"
                      />
                      <IconActionButton
                        type="button"
                        variant="ghost"
                        label={t('common.delete')}
                        onClick={() => setDeleteKey(entry.key)}
                        icon={<Trash2 size={12} />}
                        className="h-8 w-8"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add/Edit dialog */}
      {dialogMode && (
        <EnvVarEditorDialog
          mode={dialogMode}
          initial={editEntry ?? undefined}
          isSubmitting={saveMutation.isPending}
          titleCreate={t('secrets.addEnvironmentValue')}
          titleEdit={t('secrets.editEnvironmentValue')}
          subtitleCreate={t('secrets.environmentValuesDescription')}
          subtitleEdit={t('secrets.environmentValuesDescription')}
          onSubmit={(form) => saveMutation.mutate(form)}
          onClose={() => {
            setDialogMode(null)
            setEditEntry(null)
          }}
        />
      )}

      {/* Delete confirm */}
      <DangerConfirmDialog
        open={Boolean(deleteKey)}
        onOpenChange={(open) => {
          if (!open) setDeleteKey(null)
        }}
        title={t('common.delete')}
        description={deleteKey ? t('deploymentDetail.deleteEnvConfirm', { key: deleteKey }) : ''}
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

// ── Tasks Tab ─────────────────────────────────────────────────────────────────

function TasksTab({ namespace }: { namespace: string }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['deploy-tasks'],
    queryFn: api.deployTasks.list,
    refetchInterval: 5_000,
  })

  const tasks = useMemo(() => {
    return (data?.tasks ?? []).filter((item) => item.task.namespace === namespace)
  }, [data, namespace])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14 text-text-muted text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (tasks.length === 0) {
    return <DashboardEmptyState icon={FolderClock} title={t('deployTask.noTasks')} />
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
        const statusVariant =
          task.status === 'deployed'
            ? 'success'
            : task.status === 'failed'
              ? 'danger'
              : task.status === 'running' ||
                  task.status === 'deploying' ||
                  task.status === 'destroying'
                ? 'info'
                : task.status === 'pending' || task.status === 'cancelling'
                  ? 'warning'
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
              statusVariant={statusVariant}
              running={running}
              timestamp={formatTimestamp(task.updatedAt)}
              meta={task.templateSlug ? <span>{task.templateSlug}</span> : undefined}
              error={task.error}
            />
          </Link>
        )
      })}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function DeploymentDetailPage() {
  const { t } = useTranslation()
  const { namespace, id } = useParams({ strict: false }) as { namespace: string; id: string }
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const addActivity = useAppStore((s) => s.addActivity)
  const [showDestroy, setShowDestroy] = useState(false)
  const [activeTab, setActiveTab] = useState('pods')

  const { data: pods, isLoading } = useQuery({
    queryKey: ['pods', namespace, id],
    queryFn: () => api.deployments.pods(namespace, id),
    refetchInterval: 10_000,
  })

  const destroyMutation = useMutation({
    mutationFn: () => api.destroy({ namespace }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      toast.success(t('deploymentDetail.destroySuccess', { namespace }))
      addActivity({
        type: 'destroy',
        title: t('deploymentDetail.destroyActivityTitle', { namespace }),
        namespace,
      })
      navigate({ to: '/deployments' })
    },
    onError: () => toast.error(t('deployments.destroyNamespaceFailed')),
  })

  const handleRedeploy = async () => {
    // Find the latest task for this namespace
    const tasksResp = await api.deployTasks.list()
    const nsTasks = tasksResp.tasks.filter((t) => t.task.namespace === namespace)
    const latest = nsTasks[0]
    if (!latest) {
      toast.error(t('deployments.noTaskToRedeploy'))
      return
    }
    const nextTaskId = await api.deployTasks.redeployToTaskId(latest.task.id)
    if (!nextTaskId) {
      toast.error(t('deployments.redeployFailed'))
      return
    }
    navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(nextTaskId) } })
  }

  const running = pods?.filter((p) => p.status === 'Running').length ?? 0
  const podCount = pods?.length ?? 0

  const tabs = [
    { id: 'pods', label: t('deployments.tabPods'), count: podCount, icon: <Box size={13} /> },
    { id: 'logs', label: t('deployments.tabLogs'), icon: <FileText size={13} /> },
    { id: 'config', label: t('deployments.tabConfig'), icon: <FileJson size={13} /> },
    { id: 'env', label: t('deployments.tabEnv'), icon: <Settings size={13} /> },
    { id: 'tasks', label: t('deployments.tabTasks'), icon: <FolderClock size={13} /> },
    { id: 'info', label: t('deployments.tabInfo'), icon: <Activity size={13} /> },
  ]

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 p-6 md:px-8">
      <Breadcrumb
        items={[
          { label: t('deployments.title'), to: '/deployments' },
          { label: namespace },
          { label: id },
        ]}
        className="mb-4"
      />

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-extrabold tracking-[-0.03em] text-text-primary font-mono text-3xl">
            {id}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {t('deploymentDetail.namespace')}:{' '}
            <span className="font-mono text-text-secondary">{namespace}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease active:translate-y-[0.5px] focus-visible:outline-none"
            onClick={() => void handleRedeploy()}
          >
            <Rocket size={12} />
            {t('deployTask.redeploy')}
          </Button>

          <Button
            type="button"
            variant="danger"
            size="sm"
            className="transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease active:translate-y-[0.5px] focus-visible:outline-none"
            onClick={() => setShowDestroy(true)}
            disabled={destroyMutation.isPending}
          >
            <Trash2 size={12} />
            {t('deploymentDetail.destroy')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-6">
        <StatCard
          label={t('deploymentDetail.stats.pods')}
          value={podCount}
          icon={<Box size={13} />}
        />
        <StatCard
          label={t('deploymentDetail.stats.running')}
          value={running}
          icon={<CheckCircle size={13} />}
          color="green"
        />
        <StatCard
          label={t('deploymentDetail.stats.notReady')}
          value={podCount - running}
          icon={<XCircle size={13} />}
          color={podCount - running > 0 ? 'yellow' : 'default'}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <DashboardTabsList tabs={tabs} />
      </Tabs>

      <div className="min-h-[38vh]">
        {activeTab === 'pods' && <PodsTab pods={pods} isLoading={isLoading} />}
        {activeTab === 'logs' && <LogsTab namespace={namespace} id={id} />}
        {activeTab === 'config' && <ConfigTab />}
        {activeTab === 'env' && <EnvironmentTab />}
        {activeTab === 'tasks' && <TasksTab namespace={namespace} />}
        {activeTab === 'info' && <InfoTab namespace={namespace} id={id} pods={pods} />}
      </div>

      <DangerConfirmDialog
        open={showDestroy}
        onOpenChange={(open) => {
          if (!open) setShowDestroy(false)
        }}
        title={t('clusters.destroyNamespace')}
        description={t('clusters.destroyWarning', { namespace })}
        confirmText={t('deploymentDetail.destroy')}
        cancelText={t('common.cancel')}
        loading={destroyMutation.isPending}
        onConfirm={() => destroyMutation.mutate()}
      />
    </div>
  )
}
