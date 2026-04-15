import { Badge, Button, Card } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { CheckCircle2, Copy, FolderOpen, Loader2, RefreshCw, Terminal, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Breadcrumb } from '@/components/Breadcrumb'
import { DashboardEmptyState } from '@/components/DashboardEmptyState'
import { DashboardErrorState, DashboardLoadingState } from '@/components/DashboardState'
import { StatCard } from '@/components/StatCard'
import { StatsGrid } from '@/components/StatsGrid'
import { ToolbarActionButton } from '@/components/ToolbarActionButton'
import { useSSEStream } from '@/hooks/useSSEStream'
import { api } from '@/lib/api'
import { cn, formatTimestamp } from '@/lib/utils'
import { useToast } from '@/stores/toast'

function getStatusVariant(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'deployed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'info'
  if (status === 'pending') return 'warning'
  return 'neutral'
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
        <DashboardEmptyState
          icon={XCircle}
          title={t('deployTask.taskNotFound')}
          description={t('deployTask.invalidTaskId')}
        />
      </div>
    )
  }

  if (isLoading) {
    return <DashboardLoadingState inline />
  }

  if (queryError || !task) {
    return (
      <div className="p-6">
        <Breadcrumb items={[{ label: t('deployTask.title') }]} className="mb-4" />
        <DashboardErrorState
          icon={XCircle}
          title={t('deployTask.taskNotFound')}
          description={t('deployTask.taskNotFoundDescription')}
          action={
            <Button asChild variant="primary" size="sm">
              <Link to="/store">
                <FolderOpen size={14} />
                {t('deployTask.backToStore')}
              </Link>
            </Button>
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
        items={[{ label: t('nav.deployments'), to: '/deployments' }, { label: `#${task.id}` }]}
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
          <p className="mt-1 text-sm text-text-muted">{t('deployTask.description')}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ToolbarActionButton
            type="button"
            onClick={() => refetch()}
            variant="ghost"
            icon={<RefreshCw size={12} className={running ? 'animate-spin' : ''} />}
            label={t('deployTask.refresh')}
          />
          <ToolbarActionButton
            type="button"
            onClick={copyTaskUrl}
            variant="ghost"
            icon={<Copy size={12} />}
            label={t('deployTask.copyLink')}
          />
          <Link
            to="/deployments"
            className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary transition-colors hover:border-border-dim hover:text-text-primary"
          >
            <Terminal size={12} />
            {t('nav.deployments')}
          </Link>
          <Link
            to="/deployments"
            className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary px-3 py-2 text-xs text-black transition-colors hover:bg-primary/90"
          >
            <FolderOpen size={12} />
            {t('deployTask.openClusters')}
          </Link>
        </div>
      </div>

      <div
        className={cn(
          'mb-6',
          running && 'text-blue-100',
          success && 'text-green-100',
          failed && 'text-red-100',
        )}
      >
        <Card variant="surface">
          <div className="flex items-start gap-3">
            {running && <Loader2 size={18} className="text-blue-400 animate-spin mt-1" />}
            {success && <CheckCircle2 size={18} className="text-green-400 mt-1" />}
            {failed && <XCircle size={18} className="text-red-400 mt-1" />}
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
              <p className="mt-1 text-xs text-text-muted">
                {running && t('deployTask.runningDescription')}
                {success && t('deployTask.successDescription')}
                {failed && t('deployTask.failedDescription')}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <StatsGrid className="lg:grid-cols-4">
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
      </StatsGrid>

      <Card variant="surface">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-text-muted">
              {t('deployTask.taskUrl')}
            </p>
            <code className="block break-all rounded-lg border border-border-subtle bg-bg-deep px-3 py-2 font-mono text-xs text-text-secondary">
              {taskUrl}
            </code>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <p className="mb-1 text-text-muted">{t('deployTask.created')}</p>
              <p className="text-text-secondary">{formatTimestamp(task.createdAt)}</p>
            </div>
            <div>
              <p className="mb-1 text-text-muted">{t('deployTask.updated')}</p>
              <p className="text-text-secondary">{formatTimestamp(task.updatedAt)}</p>
            </div>
            <div>
              <p className="mb-1 text-text-muted">{t('deployTask.streamStatus')}</p>
              <p className="text-text-secondary">
                {t(`deployTask.streamStatuses.${streamStatus}`)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {task.error && (
        <div className="mb-6 bg-red-950/20 border border-red-900/30 rounded-xl p-4">
          <p className="text-xs text-red-400 font-medium mb-1">{t('deployTask.error')}</p>
          <p className="text-sm text-red-300 break-words">{task.error}</p>
        </div>
      )}

      {error && (
        <DashboardErrorState className="mb-6" title={t('deployTask.error')} description={error} />
      )}

      <Card variant="surface">
        <div className="flex items-center justify-between border-b border-border-subtle bg-bg-secondary/70 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">{t('deployTask.logs')}</p>
            <p className="mt-1 text-xs text-text-muted">{t('deployTask.logDescription')}</p>
          </div>
          <Badge
            variant={running ? 'info' : success ? 'success' : failed ? 'danger' : 'neutral'}
            size="sm"
          >
            {running ? t('deployTask.liveStreaming') : t('deployTask.logReplay')}
          </Badge>
        </div>
        <div
          ref={logRef}
          className="min-h-[16rem] max-h-[28rem] overflow-auto space-y-1 p-4 font-mono text-xs text-text-secondary"
        >
          {lines.length === 0 && (
            <span className="text-text-muted">{t('deployTask.waitingForLogs')}</span>
          )}
          {lines.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: deploy logs are append-only
            <div key={index} className="leading-relaxed">
              {line || '\u00a0'}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
