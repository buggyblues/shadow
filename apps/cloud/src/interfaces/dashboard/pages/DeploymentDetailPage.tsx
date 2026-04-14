import Editor from '@monaco-editor/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { formatDistanceToNow, parseISO } from 'date-fns'
import {
  Activity,
  BarChart3,
  Box,
  CheckCircle,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  FolderClock,
  Loader2,
  Lock,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Settings,
  Terminal,
  Trash2,
  Variable,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  Checkbox,
  EmptyState,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
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
import { Breadcrumb } from '@/components/Breadcrumb'
import { StatCard } from '@/components/StatCard'
import { StatusDot } from '@/components/StatusDot'
import { useSSEStream } from '@/hooks/useSSEStream'
import { api, type Pod, type ValidateResult } from '@/lib/api'
import { cn, pluralize } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAge(pod: Pod): string {
  try {
    return formatDistanceToNow(parseISO(pod.age), { addSuffix: true })
  } catch {
    return pod.age
  }
}

function getPodStatusType(status: string): 'success' | 'warning' | 'error' | 'info' {
  if (status === 'Running') return 'success'
  if (status === 'Pending') return 'warning'
  if (status === 'Failed') return 'error'
  if (status === 'Succeeded') return 'info'
  return 'warning'
}

// ── Pods Tab ──────────────────────────────────────────────────────────────────

function PodsTab({ pods, isLoading }: { pods: Pod[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return <div className="py-10 text-center text-text-muted text-sm">Loading pods...</div>
  }

  if (!pods || pods.length === 0) {
    return (
      <Card variant="glass">
        <EmptyState
          icon={Box}
          title="No pods found"
          description="The deployment may be scaling up."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        {pods.length} {pluralize(pods.length, 'pod')} in this deployment.
      </p>

      <Card variant="glass">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>STATUS</TableHead>
              <TableHead>NAME</TableHead>
              <TableHead>READY</TableHead>
              <TableHead>RESTARTS</TableHead>
              <TableHead>AGE</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pods.map((pod) => (
              <TableRow key={pod.name}>
                <TableCell>
                  <StatusDot status={getPodStatusType(pod.status)} label={pod.status} />
                </TableCell>
                <TableCell>{pod.name}</TableCell>
                <TableCell>
                  <Badge variant={pod.ready === '1/1' ? 'success' : 'warning'} size="sm">
                    {pod.ready}
                  </Badge>
                </TableCell>
                <TableCell>
                  {Number(pod.restarts) > 0 ? (
                    <span className="text-warning">{pod.restarts}</span>
                  ) : (
                    pod.restarts
                  )}
                </TableCell>
                <TableCell>{getAge(pod)}</TableCell>
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
        <p className="text-sm text-text-muted">
          Real-time log stream from all pods in this deployment.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {lines.length > 0 && (
            <>
              <Button
                type="button"
                variant="glass"
                size="sm"
                onClick={handleDownload}
              >
                <Download size={11} />
                Download
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  disconnect()
                  clear()
                }}
              >
                <XCircle size={11} />
                Clear
              </Button>
            </>
          )}
          <Button
            type="button"
            variant={connected ? 'primary' : 'glass'}
            size="sm"
            onClick={handleConnect}
          >
            <RefreshCw size={12} className={connected ? 'animate-spin' : ''} />
            {connected ? 'Streaming' : 'Connect'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-[20px] border border-danger/20 bg-danger/10 px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}

      <Card variant="glass">
        <div className="flex items-center justify-between border-b border-border-subtle bg-bg-secondary/40 px-5 py-3">
          <span className="font-mono text-xs text-text-muted">
            {namespace}/{id}
          </span>
          <span className="text-xs text-text-muted">{lines.length} lines</span>
        </div>
        <div
          ref={logRef}
          className="min-h-[16rem] max-h-[30rem] overflow-auto bg-bg-deep/80 p-4 font-mono text-xs text-text-secondary space-y-1"
        >
          {lines.length === 0 && !connected && (
            <span className="text-text-muted">Click "Connect" to stream logs…</span>
          )}
          {lines.length === 0 && connected && (
            <span className="text-text-muted">Waiting for log output…</span>
          )}
          {lines.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: log lines are append-only
            <div key={i} className="leading-relaxed">
              {line || '\u00a0'}
            </div>
          ))}
        </div>
      </Card>
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
  const running = pods?.filter((p) => p.status === 'Running').length ?? 0
  const totalRestarts = pods?.reduce((sum, p) => sum + Number(p.restarts), 0) ?? 0

  return (
    <div className="space-y-6">
      <Card variant="glass">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-xs text-text-muted">Deployment Name</span>
          <span className="text-sm font-mono text-text-primary">{id}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-xs text-text-muted">Namespace</span>
          <span className="text-sm font-mono text-text-secondary">{namespace}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-xs text-text-muted">Total Pods</span>
          <span className="text-sm text-text-primary">{pods?.length ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-xs text-text-muted">Running Pods</span>
          <span className="text-sm text-success">{running}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-xs text-text-muted">Total Restarts</span>
          <span className={cn('text-sm', totalRestarts > 0 ? 'text-warning' : 'text-text-secondary')}>
            {totalRestarts}
          </span>
        </div>
      </Card>

      {/* CLI commands */}
      <Card variant="glass">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
          <Terminal size={14} className="text-text-muted" />
          CLI Commands
        </h3>
        <div className="space-y-2">
          <div>
            <p className="mb-1 text-xs text-text-muted">View pods</p>
            <code className="block rounded-[18px] bg-bg-deep/80 px-3 py-2 text-xs font-mono text-text-secondary">
              kubectl get pods -n {namespace}
            </code>
          </div>
          <div>
            <p className="mb-1 text-xs text-text-muted">View logs</p>
            <code className="block rounded-[18px] bg-bg-deep/80 px-3 py-2 text-xs font-mono text-text-secondary">
              kubectl logs -n {namespace} -l app={id} --tail=100
            </code>
          </div>
          <div>
            <p className="mb-1 text-xs text-text-muted">Scale deployment</p>
            <code className="block rounded-[18px] bg-bg-deep/80 px-3 py-2 text-xs font-mono text-text-secondary">
              kubectl scale deployment {id} -n {namespace} --replicas=N
            </code>
          </div>
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
    onError: () => toast.error('Failed to save config'),
  })

  const handleValidate = async () => {
    try {
      const parsed = JSON.parse(content)
      const result = await api.validate(parsed)
      setValidateResult(result)
    } catch {
      toast.error('Invalid JSON')
    }
  }

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(content)
      setContent(JSON.stringify(parsed, null, 2))
    } catch {
      toast.error('Invalid JSON — cannot format')
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
            onClick={handleFormat}
          >
            <FileJson size={11} />
            {t('deployments.format')}
          </Button>
          <Button
            type="button"
            variant="glass"
            size="sm"
            onClick={handleValidate}
          >
            <CheckCircle size={11} />
            {t('deployments.validate')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
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
            'rounded-[20px] border px-4 py-3 text-xs',
            validateResult.valid
              ? 'border-success/20 bg-success/10 text-success'
              : 'border-danger/20 bg-danger/10 text-danger',
          )}
        >
          {validateResult.valid
            ? `✓ Valid — ${validateResult.agents} agent(s), ${validateResult.configurations} config(s)`
            : `✗ ${validateResult.violations?.length ?? 0} violation(s), ${validateResult.extendsErrors?.length ?? 0} extends error(s)`}
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
        <Card variant="glass">
          <EmptyState icon={Variable} title={t('secrets.noEnvVarsInGroup')} />
        </Card>
      ) : (
        <Card variant="glass">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('secrets.keyName')}</TableHead>
                <TableHead>{t('secrets.secretValue')}</TableHead>
                <TableHead>{t('common.actions')}</TableHead>
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => handleEditStart(entry)}
                      >
                        <Pencil size={12} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setDeleteKey(entry.key)}
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

      {/* Add/Edit dialog */}
      {dialogMode && (
        <EnvInlineDialog
          mode={dialogMode}
          initial={editEntry ?? undefined}
          isSubmitting={saveMutation.isPending}
          onSubmit={(form) => saveMutation.mutate(form)}
          onClose={() => {
            setDialogMode(null)
            setEditEntry(null)
          }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog
        open={Boolean(deleteKey)}
        onOpenChange={(open) => {
          if (!open) setDeleteKey(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('common.delete')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteKey ? `Delete environment variable "${deleteKey}"?` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="danger"
                loading={deleteMutation.isPending}
                onClick={() => deleteKey && deleteMutation.mutate(deleteKey)}
              >
                {t('common.delete')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EnvInlineDialog({
  mode,
  initial,
  isSubmitting,
  onSubmit,
  onClose,
}: {
  mode: 'create' | 'edit'
  initial?: { key: string; value: string; isSecret: boolean }
  isSubmitting: boolean
  onSubmit: (data: { key: string; value: string; isSecret: boolean }) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [key, setKey] = useState(initial?.key ?? '')
  const [value, setValue] = useState(initial?.value ?? '')
  const [isSecret, setIsSecret] = useState(initial?.isSecret ?? true)
  const [showValue, setShowValue] = useState(mode === 'create')

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-lg">
        <ModalHeader
          icon={<Variable size={18} />}
          title={mode === 'edit' ? t('secrets.editEnvironmentValue') : t('secrets.addEnvironmentValue')}
          onClose={onClose}
        />
        <ModalBody>
          <Input
            label={t('secrets.keyName')}
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="OPENAI_API_KEY"
            autoFocus
            disabled={mode === 'edit'}
          />
          <div className="space-y-1.5">
            <p className="ml-1 text-xs font-black uppercase tracking-[0.2em] text-text-muted">
              {t('secrets.secretValue')}
            </p>
            <div className="relative">
              <Input
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={mode === 'edit' ? t('secrets.leaveEmptyKeep') : ''}
              />
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowValue(!showValue)}
              >
                {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
              </Button>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-[24px] border border-border-subtle bg-bg-secondary/50 px-4 py-3 text-sm font-semibold text-text-secondary">
            <Checkbox
              checked={isSecret}
              onCheckedChange={(checked) => setIsSecret(checked === true)}
            />
            <Lock size={14} className="text-text-muted" />
            <span>{t('secrets.secret')}</span>
          </label>
        </ModalBody>
        <ModalFooter>
          <ModalButtonGroup>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => key.trim() && onSubmit({ key: key.trim(), value, isSecret })}
              disabled={!key.trim() || isSubmitting}
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              {mode === 'edit' ? t('common.save') : t('common.add')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
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
    return (
      <Card variant="glass">
        <EmptyState icon={FolderClock} title={t('deployTask.noTasks')} />
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {tasks.map(({ task, active }) => {
        const running = active || task.status === 'running' || task.status === 'pending'
        const statusVariant =
          task.status === 'deployed'
            ? 'success'
            : task.status === 'failed'
              ? 'danger'
              : task.status === 'running'
                ? 'info'
                : ('neutral' as const)

        return (
          <Card key={task.id} variant="glass">
            <Link to="/deploy-tasks/$taskId" params={{ taskId: String(task.id) }} className="block">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">#{task.id}</span>
                  <Badge variant={statusVariant} size="sm">
                    {t(`deployTask.statuses.${task.status}`)}
                  </Badge>
                  {running && <Loader2 size={12} className="animate-spin text-primary" />}
                </div>
                <span className="text-xs text-text-muted">
                  {task.updatedAt
                    ? formatDistanceToNow(parseISO(task.updatedAt), { addSuffix: true })
                    : '—'}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-text-muted">
                {task.templateSlug && <span>{task.templateSlug}</span>}
                {task.error && <span className="truncate text-danger">{task.error}</span>}
              </div>
            </Link>
          </Card>
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
  const [replicas, setReplicas] = useState<number | null>(null)
  const initialReplicasSet = useRef(false)
  const [showDestroy, setShowDestroy] = useState(false)
  const [activeTab, setActiveTab] = useState('pods')

  const { data: pods, isLoading } = useQuery({
    queryKey: ['pods', namespace, id],
    queryFn: () => api.deployments.pods(namespace, id),
    refetchInterval: 10_000,
  })

  useEffect(() => {
    if (pods && !initialReplicasSet.current) {
      initialReplicasSet.current = true
      setReplicas(pods.length)
    }
  }, [pods])

  const scaleMutation = useMutation({
    mutationFn: (count: number) => api.deployments.scale(namespace, id, count),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pods', namespace, id] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      toast.success(`Scaled to ${replicas} replicas`)
      addActivity({
        type: 'scale',
        title: `Scaled ${id}`,
        detail: `Replicas: ${replicas}`,
        namespace,
      })
    },
    onError: () => toast.error('Failed to scale'),
  })

  const destroyMutation = useMutation({
    mutationFn: () => api.destroy({ namespace }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      toast.success(`Destroyed namespace ${namespace}`)
      addActivity({
        type: 'destroy',
        title: `Destroyed namespace ${namespace}`,
        namespace,
      })
      navigate({ to: '/deployments' })
    },
    onError: () => toast.error('Failed to destroy'),
  })

  const handleScale = (delta: number) => {
    const next = Math.max(0, (replicas ?? 0) + delta)
    setReplicas(next)
    scaleMutation.mutate(next)
  }

  const handleRedeploy = async () => {
    // Find the latest task for this namespace
    const tasksResp = await api.deployTasks.list()
    const nsTasks = tasksResp.tasks.filter((t) => t.task.namespace === namespace)
    const latest = nsTasks[0]
    if (!latest) {
      toast.error('No deploy task found for this namespace')
      return
    }
    const res = await fetch(`/api/deploy-tasks/${latest.task.id}/redeploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) {
      toast.error('Redeploy failed')
      return
    }
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
    <div className="p-6 max-w-6xl mx-auto">
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
          <h1 className="text-xl font-bold font-mono">{id}</h1>
          <p className="mt-1 text-sm text-text-muted">
            Namespace: <span className="font-mono text-text-secondary">{namespace}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Scale controls */}
          <div className="flex items-center gap-1 rounded-[20px] border border-border-subtle bg-bg-secondary/50 p-1 shadow-[var(--shadow-soft)]">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => handleScale(-1)}
              disabled={scaleMutation.isPending || (replicas ?? 0) <= 0}
            >
              <Minus size={14} />
            </Button>
            <span className="min-w-[2rem] px-2 text-center text-sm font-mono text-text-primary">
              {replicas ?? '—'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => handleScale(1)}
              disabled={scaleMutation.isPending}
            >
              <Plus size={14} />
            </Button>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void handleRedeploy()}
          >
            <Rocket size={12} />
            {t('deployTask.redeploy')}
          </Button>

          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setShowDestroy(true)}
            disabled={destroyMutation.isPending}
          >
            <Trash2 size={12} />
            Destroy
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Pods" value={podCount} icon={<Box size={13} />} />
        <StatCard label="Running" value={running} icon={<CheckCircle size={13} />} color="green" />
        <StatCard
          label="Not Ready"
          value={podCount - running}
          icon={<XCircle size={13} />}
          color={podCount - running > 0 ? 'yellow' : 'default'}
        />
        <StatCard
          label="Replicas"
          value={replicas ?? '—'}
          icon={<BarChart3 size={13} />}
          color="blue"
        />
      </div>

      {/* Tabs */}
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

      <div className="min-h-[38vh]">
        {activeTab === 'pods' && <PodsTab pods={pods} isLoading={isLoading} />}
        {activeTab === 'logs' && <LogsTab namespace={namespace} id={id} />}
        {activeTab === 'config' && <ConfigTab />}
        {activeTab === 'env' && <EnvironmentTab />}
        {activeTab === 'tasks' && <TasksTab namespace={namespace} />}
        {activeTab === 'info' && <InfoTab namespace={namespace} id={id} pods={pods} />}
      </div>

      <AlertDialog
        open={showDestroy}
        onOpenChange={(open) => {
          if (!open) setShowDestroy(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Destroy Namespace</AlertDialogTitle>
            <AlertDialogDescription>
              {`This will destroy all deployments in namespace "${namespace}". This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="danger" loading={destroyMutation.isPending} onClick={() => destroyMutation.mutate()}>
                Destroy
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
