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
  X,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/Badge'
import { Breadcrumb } from '@/components/Breadcrumb'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatCard } from '@/components/StatCard'
import { StatusDot } from '@/components/StatusDot'
import { Tabs } from '@/components/Tabs'
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
    return <div className="py-12 text-center text-gray-500 text-sm">Loading pods...</div>
  }

  if (!pods || pods.length === 0) {
    return (
      <div className="py-12 text-center text-gray-600 text-sm">
        <Box size={24} className="mx-auto mb-2 text-gray-700" />
        No pods found. The deployment may be scaling up.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {pods.length} {pluralize(pods.length, 'pod')} in this deployment.
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-2 text-xs font-medium text-gray-500">STATUS</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">NAME</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">READY</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">RESTARTS</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">AGE</th>
            </tr>
          </thead>
          <tbody>
            {pods.map((pod) => (
              <tr
                key={pod.name}
                className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors"
              >
                <td className="px-4 py-3">
                  <StatusDot status={getPodStatusType(pod.status)} label={pod.status} />
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-300">{pod.name}</td>
                <td className="px-4 py-3">
                  <Badge variant={pod.ready === '1/1' ? 'success' : 'warning'} size="sm">
                    {pod.ready}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {Number(pod.restarts) > 0 ? (
                    <span className="text-yellow-400">{pod.restarts}</span>
                  ) : (
                    pod.restarts
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{getAge(pod)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Real-time log stream from all pods in this deployment.
        </p>
        <div className="flex items-center gap-2">
          {lines.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-2.5 py-1 transition-colors"
              >
                <Download size={11} />
                Download
              </button>
              <button
                type="button"
                onClick={() => {
                  disconnect()
                  clear()
                }}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-2.5 py-1 transition-colors"
              >
                <XCircle size={11} />
                Clear
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleConnect}
            className={cn(
              'flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 transition-colors',
              connected
                ? 'bg-green-900/30 text-green-400 border border-green-800'
                : 'text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500',
            )}
          >
            <RefreshCw size={12} className={connected ? 'animate-spin' : ''} />
            {connected ? 'Streaming' : 'Connect'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/30">
          <span className="text-[10px] text-gray-600 font-mono">
            {namespace}/{id}
          </span>
          <span className="text-[10px] text-gray-600">{lines.length} lines</span>
        </div>
        <div
          ref={logRef}
          className="h-96 overflow-auto p-4 font-mono text-xs text-gray-300 space-y-0.5"
        >
          {lines.length === 0 && !connected && (
            <span className="text-gray-600">Click "Connect" to stream logs…</span>
          )}
          {lines.length === 0 && connected && (
            <span className="text-gray-600">Waiting for log output…</span>
          )}
          {lines.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: log lines are append-only
            <div key={i} className="leading-relaxed">
              {line || '\u00a0'}
            </div>
          ))}
        </div>
      </div>
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
      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">Deployment Name</span>
          <span className="text-sm font-mono">{id}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">Namespace</span>
          <span className="text-sm font-mono text-gray-300">{namespace}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">Total Pods</span>
          <span className="text-sm">{pods?.length ?? '—'}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">Running Pods</span>
          <span className="text-sm text-green-400">{running}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">Total Restarts</span>
          <span className={cn('text-sm', totalRestarts > 0 ? 'text-yellow-400' : 'text-gray-400')}>
            {totalRestarts}
          </span>
        </div>
      </div>

      {/* CLI commands */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Terminal size={14} className="text-gray-400" />
          CLI Commands
        </h3>
        <div className="space-y-2">
          <div>
            <p className="text-[10px] text-gray-600 mb-1">View pods</p>
            <code className="block text-xs font-mono text-gray-400 bg-gray-950 rounded px-3 py-2">
              kubectl get pods -n {namespace}
            </code>
          </div>
          <div>
            <p className="text-[10px] text-gray-600 mb-1">View logs</p>
            <code className="block text-xs font-mono text-gray-400 bg-gray-950 rounded px-3 py-2">
              kubectl logs -n {namespace} -l app={id} --tail=100
            </code>
          </div>
          <div>
            <p className="text-[10px] text-gray-600 mb-1">Scale deployment</p>
            <code className="block text-xs font-mono text-gray-400 bg-gray-950 rounded px-3 py-2">
              kubectl scale deployment {id} -n {namespace} --replicas=N
            </code>
          </div>
        </div>
      </div>
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
      <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{t('deployments.configDescription')}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleFormat}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-2.5 py-1 transition-colors"
          >
            <FileJson size={11} />
            {t('deployments.format')}
          </button>
          <button
            type="button"
            onClick={handleValidate}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-2.5 py-1 transition-colors"
          >
            <CheckCircle size={11} />
            {t('deployments.validate')}
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
            className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg px-3 py-1.5 transition-colors"
          >
            {saveMutation.isPending ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Save size={11} />
            )}
            {t('common.save')}
          </button>
        </div>
      </div>

      {/* Validation result */}
      {validateResult && (
        <div
          className={cn(
            'text-xs border rounded-lg px-4 py-2',
            validateResult.valid
              ? 'text-green-400 bg-green-900/20 border-green-900/30'
              : 'text-red-400 bg-red-900/20 border-red-900/30',
          )}
        >
          {validateResult.valid
            ? `✓ Valid — ${validateResult.agents} agent(s), ${validateResult.configurations} config(s)`
            : `✗ ${validateResult.violations?.length ?? 0} violation(s), ${validateResult.extendsErrors?.length ?? 0} extends error(s)`}
        </div>
      )}

      {/* Editor */}
      <div className="border border-gray-700 rounded-lg overflow-hidden" style={{ height: 400 }}>
        <Editor
          height="100%"
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
      </div>
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
      <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{t('secrets.environmentValuesDescription')}</p>
        <button
          type="button"
          onClick={() => {
            setEditEntry(null)
            setDialogMode('create')
          }}
          className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus size={11} />
          {t('common.add')}
        </button>
      </div>

      {envVars.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-800 rounded-lg">
          <Variable size={24} className="mx-auto mb-2 text-gray-700" />
          <p className="text-sm text-gray-500">{t('secrets.noEnvVarsInGroup')}</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  {t('secrets.keyName')}
                </th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  {t('secrets.secretValue')}
                </th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider w-24">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {envVars.map((entry) => (
                <tr
                  key={entry.key}
                  className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-gray-300">{entry.key}</code>
                      {entry.isSecret && <Lock size={10} className="text-yellow-500" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{entry.maskedValue}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditStart(entry)}
                        className="p-1 text-gray-600 hover:text-blue-400 transition-colors"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteKey(entry.key)}
                        className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      {deleteKey && (
        <ConfirmDialog
          title={t('common.delete')}
          message={`Delete environment variable "${deleteKey}"?`}
          confirmLabel={t('common.delete')}
          isConfirming={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteKey)}
          onCancel={() => setDeleteKey(null)}
        />
      )}
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
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Variable size={16} className="text-blue-400" />
            {mode === 'edit' ? t('secrets.editEnvironmentValue') : t('secrets.addEnvironmentValue')}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">{t('secrets.keyName')}</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="OPENAI_API_KEY"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
              autoFocus
              disabled={mode === 'edit'}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">{t('secrets.secretValue')}</label>
            <div className="relative">
              <input
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={mode === 'edit' ? t('secrets.leaveEmptyKeep') : ''}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
              >
                {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={isSecret}
              onChange={(e) => setIsSecret(e.target.checked)}
              className="accent-blue-500 rounded"
            />
            <Lock size={12} />
            {t('secrets.secret')}
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => key.trim() && onSubmit({ key: key.trim(), value, isSecret })}
            disabled={!key.trim() || isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {mode === 'edit' ? t('common.save') : t('common.add')}
          </button>
        </div>
      </div>
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
      <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600 text-sm">
        <FolderClock size={24} className="mx-auto mb-2 text-gray-700" />
        {t('deployTask.noTasks')}
      </div>
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
              ? 'error'
              : task.status === 'running'
                ? 'info'
                : ('default' as const)

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
                <Badge variant={statusVariant} size="sm">
                  {t(`deployTask.statuses.${task.status}`)}
                </Badge>
                {running && <Loader2 size={12} className="animate-spin text-blue-400" />}
              </div>
              <span className="text-[10px] text-gray-600">
                {task.updatedAt
                  ? formatDistanceToNow(parseISO(task.updatedAt), { addSuffix: true })
                  : '—'}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
              {task.templateSlug && <span>{task.templateSlug}</span>}
              {task.error && <span className="text-red-400 truncate">{task.error}</span>}
            </div>
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
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold font-mono">{id}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Namespace: <span className="font-mono text-gray-400">{namespace}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Scale controls */}
          <div className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded-lg">
            <button
              type="button"
              onClick={() => handleScale(-1)}
              disabled={scaleMutation.isPending || (replicas ?? 0) <= 0}
              className="px-2.5 py-1.5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <Minus size={14} />
            </button>
            <span className="text-sm font-mono px-2 min-w-[2rem] text-center">
              {replicas ?? '—'}
            </span>
            <button
              type="button"
              onClick={() => handleScale(1)}
              disabled={scaleMutation.isPending}
              className="px-2.5 py-1.5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleRedeploy()}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded-lg px-3 py-2 transition-colors"
          >
            <Rocket size={12} />
            {t('deployTask.redeploy')}
          </button>

          <button
            type="button"
            onClick={() => setShowDestroy(true)}
            disabled={destroyMutation.isPending}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
          >
            <Trash2 size={12} />
            Destroy
          </button>
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
      <Tabs items={tabs} active={activeTab} onChange={setActiveTab} className="mb-6" />

      <div className="min-h-[400px]">
        {activeTab === 'pods' && <PodsTab pods={pods} isLoading={isLoading} />}
        {activeTab === 'logs' && <LogsTab namespace={namespace} id={id} />}
        {activeTab === 'config' && <ConfigTab />}
        {activeTab === 'env' && <EnvironmentTab />}
        {activeTab === 'tasks' && <TasksTab namespace={namespace} />}
        {activeTab === 'info' && <InfoTab namespace={namespace} id={id} pods={pods} />}
      </div>

      {showDestroy && (
        <ConfirmDialog
          title="Destroy Namespace"
          message={`This will destroy all deployments in namespace "${namespace}". This cannot be undone.`}
          confirmLabel="Destroy"
          confirmText={namespace}
          onConfirm={() => destroyMutation.mutate()}
          onCancel={() => setShowDestroy(false)}
        />
      )}
    </div>
  )
}
