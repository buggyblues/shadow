import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { CheckCircle2, Copy, FolderOpen, Loader2, RefreshCw, Terminal, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/Badge'
import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { StatCard } from '@/components/StatCard'
import { useSSEStream } from '@/hooks/useSSEStream'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/stores/toast'

function formatTimestamp(value?: string | null): string {
  if (!value) return '—'

  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true })
  } catch {
    return value
  }
}

function getStatusVariant(status: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (status === 'deployed') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'running') return 'info'
  if (status === 'pending') return 'warning'
  return 'default'
}

export function DeploymentTaskPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const params = useParams({ strict: false }) as { taskId: string }
  const taskId = Number(params.taskId)
  const logRef = useRef<HTMLDivElement>(null)
  const { lines, status: streamStatus, error, connect } = useSSEStream({ maxLines: 4000 })

  const {
    data,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['deploy-task', taskId],
    queryFn: () => api.deployTasks.get(taskId),
    enabled: Number.isInteger(taskId) && taskId > 0,
    refetchInterval: 2_000,
  })

  const task = data?.task
  const taskUrl = useMemo(() => {
    const url = data?.url
    if (!url) return ''
    return new URL(url, window.location.origin).toString()
  }, [data?.url])

  useEffect(() => {
    if (!Number.isInteger(taskId) || taskId <= 0) return
    connect(api.deployTasks.streamUrl(taskId))
  }, [taskId, connect])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new log lines
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [lines.length])

  const copyTaskUrl = async () => {
    if (!taskUrl) return

    try {
      await navigator.clipboard.writeText(taskUrl)
      toast.success(t('deployTask.linkCopied'))
    } catch {
      toast.error(t('deployTask.linkCopyFailed'))
    }
  }

  if (!Number.isInteger(taskId) || taskId <= 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<XCircle size={40} />}
          title={t('deployTask.taskNotFound')}
          description={t('deployTask.invalidTaskId')}
        />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
        <Loader2 size={18} className="animate-spin mr-2" />
        {t('deployTask.loading')}
      </div>
    )
  }

  if (queryError || !task) {
    return (
      <div className="p-6">
        <Breadcrumb items={[{ label: t('deployTask.title') }]} className="mb-4" />
        <EmptyState
          icon={<XCircle size={40} />}
          title={t('deployTask.taskNotFound')}
          description={t('deployTask.taskNotFoundDescription')}
          action={
            <Link
              to="/store"
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded-lg px-4 py-2 transition-colors"
            >
              <FolderOpen size={14} />
              {t('deployTask.backToStore')}
            </Link>
          }
        />
      </div>
    )
  }

  const running = task.status === 'running' || task.status === 'pending'
  const success = task.status === 'deployed'
  const failed = task.status === 'failed'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Breadcrumb
        items={[{ label: t('nav.deployTasks'), to: '/deploy-tasks' }, { label: `#${task.id}` }]}
        className="mb-4"
      />

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            {t('deployTask.title')}
            <Badge variant={getStatusVariant(task.status)} size="sm">
              {t(`deployTask.statuses.${task.status}`)}
            </Badge>
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t('deployTask.description')}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors"
          >
            <RefreshCw size={12} className={running ? 'animate-spin' : ''} />
            {t('deployTask.refresh')}
          </button>
          <button
            type="button"
            onClick={copyTaskUrl}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors"
          >
            <Copy size={12} />
            {t('deployTask.copyLink')}
          </button>
          <Link
            to="/deploy-tasks"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors"
          >
            <Terminal size={12} />
            {t('nav.deployTasks')}
          </Link>
          <Link
            to="/clusters"
            className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-2 transition-colors"
          >
            <FolderOpen size={12} />
            {t('deployTask.openClusters')}
          </Link>
        </div>
      </div>

      <div
        className={cn(
          'rounded-xl border p-4 mb-6',
          running && 'bg-blue-950/20 border-blue-900/30',
          success && 'bg-green-950/20 border-green-900/30',
          failed && 'bg-red-950/20 border-red-900/30',
        )}
      >
        <div className="flex items-start gap-3">
          {running && <Loader2 size={18} className="text-blue-400 animate-spin mt-0.5" />}
          {success && <CheckCircle2 size={18} className="text-green-400 mt-0.5" />}
          {failed && <XCircle size={18} className="text-red-400 mt-0.5" />}
          <div>
            <p
              className={cn(
                'text-sm font-medium',
                running && 'text-blue-400',
                success && 'text-green-400',
                failed && 'text-red-400',
              )}
            >
              {running && t('deployTask.runningMessage')}
              {success && t('deployTask.successMessage')}
              {failed && t('deployTask.failedMessage')}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {running && t('deployTask.runningDescription')}
              {success && t('deployTask.successDescription')}
              {failed && t('deployTask.failedDescription')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t('deployTask.taskId')}
          value={`#${task.id}`}
          icon={<Terminal size={13} />}
        />
        <StatCard
          label={t('deployTask.template')}
          value={task.templateSlug ?? '—'}
          icon={<FolderOpen size={13} />}
          color="blue"
        />
        <StatCard
          label={t('deployTask.namespace')}
          value={task.namespace}
          icon={<FolderOpen size={13} />}
          color="default"
        />
        <StatCard
          label={t('deployTask.logs')}
          value={lines.length}
          icon={<Terminal size={13} />}
          color="green"
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">
            {t('deployTask.taskUrl')}
          </p>
          <code className="block bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 break-all">
            {taskUrl}
          </code>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-gray-600 mb-1">{t('deployTask.created')}</p>
            <p className="text-gray-300">{formatTimestamp(task.createdAt)}</p>
          </div>
          <div>
            <p className="text-gray-600 mb-1">{t('deployTask.updated')}</p>
            <p className="text-gray-300">{formatTimestamp(task.updatedAt)}</p>
          </div>
          <div>
            <p className="text-gray-600 mb-1">{t('deployTask.streamStatus')}</p>
            <p className="text-gray-300">{t(`deployTask.streamStatuses.${streamStatus}`)}</p>
          </div>
        </div>
      </div>

      {task.error && (
        <div className="mb-6 bg-red-950/20 border border-red-900/30 rounded-xl p-4">
          <p className="text-xs text-red-400 font-medium mb-1">{t('deployTask.error')}</p>
          <p className="text-sm text-red-300 break-words">{task.error}</p>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-950/20 border border-red-900/30 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
          <div>
            <p className="text-sm font-medium text-gray-200">{t('deployTask.logs')}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('deployTask.logDescription')}</p>
          </div>
          <Badge
            variant={running ? 'info' : success ? 'success' : failed ? 'error' : 'default'}
            size="sm"
          >
            {running ? t('deployTask.liveStreaming') : t('deployTask.logReplay')}
          </Badge>
        </div>
        <div
          ref={logRef}
          className="h-[28rem] overflow-auto p-4 font-mono text-xs text-gray-300 space-y-0.5"
        >
          {lines.length === 0 && (
            <span className="text-gray-600">{t('deployTask.waitingForLogs')}</span>
          )}
          {lines.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: deploy logs are append-only
            <div key={index} className="leading-relaxed">
              {line || '\u00a0'}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
