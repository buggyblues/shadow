import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { formatDistanceToNow, parseISO } from 'date-fns'
import {
  Box,
  CheckCircle,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderClock,
  FolderOpen,
  Info,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  Server,
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
import { EmptyState } from '@/components/EmptyState'
import { StatCard } from '@/components/StatCard'
import { StatusDot } from '@/components/StatusDot'
import { Tabs } from '@/components/Tabs'
import { useSSEStream } from '@/hooks/useSSEStream'
import { api, type Deployment, type EnvVarListEntry, type Pod } from '@/lib/api'
import { formatUsdCost } from '@/lib/store-data'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

function isDeploymentReady(dep: Deployment): boolean {
  const [ready = 0, total = 0] = dep.ready.split('/').map(Number)
  return ready === total && total > 0
}

function getReplicas(dep: Deployment): number {
  const [ready = 0] = dep.ready.split('/').map(Number)
  return ready
}

function formatTimestamp(value?: string | null): string {
  if (!value) return '—'
  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true })
  } catch {
    return value
  }
}

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

function NamespaceEnvDialog({
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
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg space-y-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Variable size={16} className="text-blue-400" />
            {mode === 'edit' ? t('deployments.editScopedEnv') : t('deployments.addScopedEnv')}
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
              onChange={(event) => setKey(event.target.value)}
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
                onChange={(event) => setValue(event.target.value)}
                placeholder={mode === 'edit' ? t('secrets.leaveEmptyKeep') : ''}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowValue((current) => !current)}
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
              onChange={(event) => setIsSecret(event.target.checked)}
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
  const ready = isDeploymentReady(deployment)
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
        selected ? 'border-blue-600 bg-blue-950/10' : 'border-gray-800 bg-gray-900',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <button type="button" onClick={onSelect} className="min-w-0 text-left flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={ready ? 'success' : 'warning'} pulse={!ready} />
            <p className="text-sm font-mono text-gray-200 truncate">{deployment.name}</p>
            {selected && (
              <Badge variant="info" size="sm">
                {t('deployments.currentSelection')}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">{formatTimestamp(deployment.age)}</p>
        </button>

        <button
          type="button"
          onClick={onOpenLogs}
          className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
        >
          {t('deployments.tabLogs')}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Badge variant={ready ? 'success' : 'warning'} size="sm">
          {deployment.ready}
        </Badge>

        <div className="flex items-center border border-gray-700 rounded">
          <button
            type="button"
            onClick={() => handleScale(-1)}
            disabled={scaleMutation.isPending || currentReplicas <= 0}
            className="px-2 py-1 text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
          >
            −
          </button>
          <span className="text-xs font-mono px-2 min-w-[2rem] text-center">{currentReplicas}</span>
          <button
            type="button"
            onClick={() => handleScale(1)}
            disabled={scaleMutation.isPending}
            className="px-2 py-1 text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
          >
            +
          </button>
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
    return (
      <div className="py-12 text-center text-gray-600 text-sm">
        <Box size={24} className="mx-auto mb-2 text-gray-700" />
        {t('deployments.noAgentSelected')}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="py-12 text-center text-gray-500 text-sm">
        <Loader2 size={16} className="animate-spin inline mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (!pods || pods.length === 0) {
    return (
      <div className="py-12 text-center text-gray-600 text-sm">
        <Box size={24} className="mx-auto mb-2 text-gray-700" />
        {t('deployments.noPodsForAgent', { agent })}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {t('deployments.selectedPodsCount', { count: pods.length })}
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-2 text-xs font-medium text-gray-500">
                {t('clusters.status')}
              </th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">
                {t('monitoring.name')}
              </th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">
                {t('monitoring.ready')}
              </th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">
                {t('deployments.restarts')}
              </th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500">
                {t('deployments.age')}
              </th>
            </tr>
          </thead>
          <tbody>
            {pods.map((pod) => (
              <tr key={pod.name} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                <td className="px-4 py-3">
                  <StatusDot status={getPodStatusType(pod.status)} label={pod.status} />
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-300">{pod.name}</td>
                <td className="px-4 py-3">
                  <Badge variant={pod.ready === '1/1' ? 'success' : 'warning'} size="sm">
                    {pod.ready}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{pod.restarts}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{getAge(pod)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      <EmptyState
        icon={<FileText size={40} />}
        title={t('deployments.noAgentSelected')}
        description={t('deployments.selectAgentForLogs')}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">{t('deployments.recentLogs')}</h3>
          <p className="text-xs text-gray-500">
            {t('deployments.logsHistoryDescription', { agent })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={String(limit)}
            onChange={(event) => {
              setLimit(Number(event.target.value))
              setPage(1)
            }}
            className="text-xs bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-300"
          >
            {[100, 200, 500].map((value) => (
              <option key={value} value={value}>
                {t('deployments.linesPerPage', { count: value })}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors"
          >
            <RefreshCw size={12} />
            {t('common.refresh')}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors"
          >
            <Download size={12} />
            {t('deploy.download')}
          </button>
        </div>
      </div>

      <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-800 bg-gray-900/40">
          <div className="text-xs text-gray-500">
            <span className="font-medium text-gray-400">{agent}</span>
            {history?.podName ? <span> · {history.podName}</span> : null}
            <span> · {t('deployments.pageLabel', { page })}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-30"
            >
              {t('deployments.newerLogs')}
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={!history?.hasMore}
              className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-30"
            >
              {t('deployments.olderLogs')}
            </button>
          </div>
        </div>
        <div className="h-72 overflow-auto p-4 font-mono text-xs text-gray-300 space-y-0.5">
          {isLoading ? (
            <span className="text-gray-600">{t('common.loading')}</span>
          ) : history?.lines.length ? (
            history.lines.map((line, index) => (
              <div key={`${page}-${index}`} className="leading-relaxed">
                {line || '\u00a0'}
              </div>
            ))
          ) : (
            <span className="text-gray-600">{t('deployments.noLogsYet')}</span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">{t('deployments.liveLogs')}</h3>
            <p className="text-xs text-gray-500">{t('deployments.liveLogsDescription')}</p>
          </div>
          <div className="flex items-center gap-2">
            {(lines.length > 0 || connected) && (
              <button
                type="button"
                onClick={() => {
                  disconnect()
                  clear()
                }}
                className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors"
              >
                {t('common.clearAll')}
              </button>
            )}
            <button
              type="button"
              onClick={handleConnect}
              className={cn(
                'flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 transition-colors border',
                connected
                  ? 'bg-green-900/30 text-green-400 border-green-800'
                  : 'text-gray-400 hover:text-white border-gray-700 hover:border-gray-500',
              )}
            >
              <RefreshCw size={12} className={connected ? 'animate-spin' : ''} />
              {connected ? t('deployments.streaming') : t('deployments.connectLogs')}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-900/40 text-[10px] text-gray-500">
            {namespace}/{agent}
          </div>
          <div
            ref={logRef}
            className="h-72 overflow-auto p-4 font-mono text-xs text-gray-300 space-y-0.5"
          >
            {lines.length === 0 && !connected && (
              <span className="text-gray-600">{t('deployments.connectLiveLogs')}</span>
            )}
            {lines.length === 0 && connected && (
              <span className="text-gray-600">{t('deployments.waitingForLogs')}</span>
            )}
            {lines.map((line, index) => (
              <div key={index} className="leading-relaxed">
                {line || '\u00a0'}
              </div>
            ))}
          </div>
        </div>
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
      <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
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
            <h3 className="text-sm font-semibold text-gray-200">
              {t('deployments.scopedEnvTitle')}
            </h3>
            <p className="text-xs text-gray-500">{t('deployments.scopedEnvDescription')}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditEntry(null)
              setDialogMode('create')
            }}
            className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-2 transition-colors"
          >
            <Plus size={11} />
            {t('common.add')}
          </button>
        </div>

        {scopedEntries.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-gray-800 rounded-lg">
            <Variable size={24} className="mx-auto mb-2 text-gray-700" />
            <p className="text-sm text-gray-500">{t('deployments.noScopedEnv')}</p>
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
                  <th className="px-4 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                    {t('secrets.secret')}
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider w-24">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {scopedEntries.map((entry) => (
                  <tr key={entry.key} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                    <td className="px-4 py-3 font-mono text-xs text-gray-300">{entry.key}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {entry.maskedValue}
                    </td>
                    <td className="px-4 py-3">
                      {entry.isSecret ? (
                        <Badge variant="warning" size="sm">
                          {t('secrets.secret')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" size="sm">
                          {t('deployments.plainText')}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleEditStart(entry)}
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
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-2">
          {t('deployments.fallbackEnvTitle')}
        </h3>
        <p className="text-xs text-gray-500 mb-3">{t('deployments.fallbackEnvDescription')}</p>

        {fallbackEntries.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-gray-800 rounded-lg">
            <Variable size={24} className="mx-auto mb-2 text-gray-700" />
            <p className="text-sm text-gray-500">{t('deployments.noFallbackEnv')}</p>
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
                  <th className="px-4 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                    {t('secrets.scope')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {fallbackEntries.map((entry) => (
                  <tr
                    key={`${entry.scope}-${entry.key}`}
                    className="border-b border-gray-800/50 hover:bg-gray-800/20"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-300">{entry.key}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {entry.maskedValue}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" size="sm">
                        {entry.scope === 'global'
                          ? t('deployments.globalFallback')
                          : t('deployments.namespaceScoped')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialogMode && (
        <NamespaceEnvDialog
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

      {deleteKey && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('deployments.deleteScopedEnvConfirm', { key: deleteKey })}
          confirmLabel={t('common.delete')}
          isConfirming={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteKey)}
          onCancel={() => setDeleteKey(null)}
        />
      )}
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
      <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<FolderClock size={40} />}
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
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-200">#{task.id}</span>
                <Badge variant={variant} size="sm">
                  {t(`deployTask.statuses.${task.status}`)}
                </Badge>
                {running && <Loader2 size={12} className="animate-spin text-blue-400" />}
              </div>
              <span className="text-[10px] text-gray-600">
                {formatTimestamp(task.updatedAt ?? task.createdAt)}
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
      <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (!data) {
    return (
      <EmptyState
        icon={<DollarSign size={40} />}
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

      <div className="text-xs text-gray-500">
        {t('deployments.generatedAt')}: {formatTimestamp(data.generatedAt)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.agents.map((agent) => (
          <div key={agent.agentName} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono text-gray-200">{agent.agentName}</p>
                  <Badge variant={agent.totalUsd !== null ? 'success' : 'outline'} size="sm">
                    {agent.source}
                  </Badge>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {agent.podName ?? t('common.none')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-green-400">
                  {formatUsdCost(agent.totalUsd, i18n.language)}
                </p>
                <p className="text-[10px] text-gray-600">{t('deployments.totalCost')}</p>
              </div>
            </div>

            {agent.providers.length > 0 ? (
              <div className="space-y-2">
                {agent.providers.map((provider) => (
                  <div
                    key={`${agent.agentName}-${provider.provider}`}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-gray-400">{provider.provider}</span>
                    <div className="text-right">
                      <p className="text-gray-300">
                        {formatUsdCost(provider.amountUsd, i18n.language)}
                      </p>
                      <p className="text-gray-600">{provider.usageLabel ?? provider.raw ?? '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">{t('deployments.noProvidersReported')}</p>
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
  const readyAgents = deployments.filter(isDeploymentReady).length
  const totalRestarts = pods?.reduce((sum, pod) => sum + Number(pod.restarts), 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">{t('deployments.namespaceLabel')}</span>
          <span className="text-sm font-mono text-gray-300">{namespace}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">{t('deployments.agents')}</span>
          <span className="text-sm text-gray-300">{deployments.length}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">{t('deployments.readyAgents')}</span>
          <span className="text-sm text-green-400">{readyAgents}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">{t('deployments.currentAgent')}</span>
          <span className="text-sm font-mono text-gray-300">{agent ?? t('common.none')}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">{t('deployments.selectedPods')}</span>
          <span className="text-sm text-gray-300">{pods?.length ?? 0}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">{t('deployments.totalRestarts')}</span>
          <span className={cn('text-sm', totalRestarts > 0 ? 'text-yellow-400' : 'text-gray-400')}>
            {totalRestarts}
          </span>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Terminal size={14} className="text-gray-400" />
          {t('deployments.kubectlCommands')}
        </h3>
        <div className="space-y-2">
          <div>
            <p className="text-[10px] text-gray-600 mb-1">{t('deployments.viewAgents')}</p>
            <code className="block text-xs font-mono text-gray-400 bg-gray-950 rounded px-3 py-2">
              kubectl get deployments -n {namespace}
            </code>
          </div>
          <div>
            <p className="text-[10px] text-gray-600 mb-1">{t('deployments.viewPods')}</p>
            <code className="block text-xs font-mono text-gray-400 bg-gray-950 rounded px-3 py-2">
              kubectl get pods -n {namespace}
            </code>
          </div>
          {agent && (
            <div>
              <p className="text-[10px] text-gray-600 mb-1">{t('clusters.viewLogs')}</p>
              <code className="block text-xs font-mono text-gray-400 bg-gray-950 rounded px-3 py-2">
                kubectl logs -n {namespace} -l app={agent} --tail=200
              </code>
            </div>
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

    const response = await fetch(`/api/deploy-tasks/${latestTask.task.id}/redeploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    if (!response.ok) {
      toast.error(t('deployments.redeployFailed'))
      return
    }

    const reader = response.body?.getReader()
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
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.id) {
            reader.cancel()
            navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(data.id) } })
            return
          }
        } catch {
          /* ignore malformed SSE payloads */
        }
      }
    }
  }

  const readyAgents = namespaceDeployments.filter(isDeploymentReady).length
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
      <div className="p-6 max-w-6xl mx-auto">
        <Breadcrumb
          items={[{ label: t('deployments.title'), to: '/deployments' }, { label: namespace }]}
          className="mb-4"
        />
        <EmptyState
          icon={<FolderOpen size={40} />}
          title={t('deployments.noDeploymentsInNamespace')}
          description={t('deployments.noDeploymentsInNamespaceDescription', { namespace })}
          action={
            <Link
              to="/store"
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded-lg px-4 py-2 transition-colors"
            >
              <Rocket size={14} />
              {t('clusters.browseAgentStore')}
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Breadcrumb
        items={[{ label: t('deployments.title'), to: '/deployments' }, { label: namespace }]}
        className="mb-4"
      />

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold font-mono">{namespace}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('deployments.namespaceDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void refetch()
              void queryClient.invalidateQueries({ queryKey: ['namespace-costs', namespace] })
              void queryClient.invalidateQueries({ queryKey: ['deploy-tasks'] })
            }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors"
          >
            <RefreshCw size={12} />
            {t('common.refresh')}
          </button>
          {latestTask && (
            <button
              type="button"
              onClick={() => void handleRedeploy()}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded-lg px-3 py-2 transition-colors"
            >
              <Rocket size={12} />
              {t('deployTask.redeploy')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDestroyOpen(true)}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 rounded-lg px-3 py-2 transition-colors"
          >
            <Trash2 size={12} />
            {t('clusters.destroy')}
          </button>
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

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">
              {t('deployments.agentSelector')}
            </h2>
            <p className="text-xs text-gray-500">{t('deployments.agentSelectorDescription')}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <FolderClock size={12} />
            {t('deployments.runningTasksCount', { count: runningTasks })}
          </div>
        </div>

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

      <Tabs items={tabs} active={activeTab} onChange={setActiveTab} className="mb-6" />

      <div className="min-h-[400px]">
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

      {destroyOpen && (
        <ConfirmDialog
          title={t('clusters.destroyNamespace')}
          message={t('clusters.destroyWarning', { namespace })}
          confirmLabel={t('clusters.destroy')}
          confirmingLabel={t('clusters.destroying')}
          confirmText={namespace}
          isConfirming={destroyMutation.isPending}
          onConfirm={() => destroyMutation.mutate()}
          onCancel={() => setDestroyOpen(false)}
        />
      )}
    </div>
  )
}
