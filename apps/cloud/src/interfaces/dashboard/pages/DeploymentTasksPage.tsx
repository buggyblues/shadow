import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { formatDistanceToNow, parseISO } from 'date-fns'
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  Rocket,
  RotateCcw,
  Terminal,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState } from '@shadowob/ui'
import { Breadcrumb } from '@/components/Breadcrumb'
import { StatCard } from '@/components/StatCard'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

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

export function DeploymentTasksPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [rollbackNs, setRollbackNs] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['deploy-tasks'],
    queryFn: api.deployTasks.list,
    refetchInterval: 2_000,
  })

  const rollbackMutation = useMutation({
    mutationFn: (namespace: string) => api.rollback({ namespace }),
    onSuccess: () => {
      setRollbackNs(null)
      queryClient.invalidateQueries({ queryKey: ['deploy-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
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
        if (line.startsWith('event: task')) {
          const dataLine = lines[lines.indexOf(line) + 1]
          if (dataLine?.startsWith('data: ')) {
            try {
              const data = JSON.parse(dataLine.slice(6))
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
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.id && data.url) {
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

  const tasks = data?.tasks ?? []

  const summary = useMemo(() => {
    const running = tasks.filter((item) => item.active || item.task.status === 'running').length
    const deployed = tasks.filter((item) => item.task.status === 'deployed').length
    const failed = tasks.filter((item) => item.task.status === 'failed').length

    return {
      total: tasks.length,
      running,
      deployed,
      failed,
    }
  }, [tasks])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Breadcrumb items={[{ label: t('nav.deployTasks') }]} className="mb-4" />

      <div className="mb-6">
        <h1 className="text-xl font-bold">{t('deployTask.listTitle')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('deployTask.listDescription')}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t('deployTask.totalTasks')}
          value={summary.total}
          icon={<Terminal size={13} />}
        />
        <StatCard
          label={t('deployTask.runningTasks')}
          value={summary.running}
          icon={<Loader2 size={13} />}
          color="blue"
        />
        <StatCard
          label={t('deployTask.statuses.deployed')}
          value={summary.deployed}
          icon={<CheckCircle2 size={13} />}
          color="green"
        />
        <StatCard
          label={t('deployTask.statuses.failed')}
          value={summary.failed}
          icon={<XCircle size={13} />}
          color={summary.failed > 0 ? 'red' : 'default'}
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
          <Loader2 size={18} className="animate-spin mr-2" />
          {t('common.loading')}
        </div>
      )}

      {!isLoading && tasks.length === 0 && (
        <EmptyState
          icon={Terminal}
          title={t('deployTask.noTasks')}
          description={t('deployTask.noTasksDescription')}
          action={
            <Button asChild variant="primary" size="sm">
              <Link to="/store">
                <Rocket size={14} />
                {t('deployTask.openStore')}
              </Link>
            </Button>
          }
        />
      )}

      {!isLoading && tasks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-400">{t('deployTask.taskHistory')}</h2>
            <span className="text-xs text-gray-600">
              {summary.running} {t('deployTask.activeNow')}
            </span>
          </div>

          {tasks.map(({ task, url, active }) => {
            const absoluteUrl = new URL(url, window.location.origin).toString()
            const running = active || task.status === 'running' || task.status === 'pending'

            return (
              <div
                key={task.id}
                className={cn('transition-colors', running ? 'text-blue-100' : '')}
              >
                <Card variant="surface">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h3 className="text-base font-semibold text-gray-100">#{task.id}</h3>
                        <Badge variant={getStatusVariant(task.status)} size="sm">
                          {t(`deployTask.statuses.${task.status}`)}
                        </Badge>
                        {running && (
                          <Badge variant="info" size="sm">
                            {t('deployTask.activeNow')}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs mb-3">
                        <div>
                          <p className="text-gray-600 mb-1">{t('deployTask.template')}</p>
                          <p className="text-gray-300 break-words">{task.templateSlug ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-gray-600 mb-1">{t('deployTask.namespace')}</p>
                          <p className="text-gray-300 break-words">{task.namespace}</p>
                        </div>
                        <div>
                          <p className="text-gray-600 mb-1">{t('deployTask.updated')}</p>
                          <p className="text-gray-300">
                            {formatTimestamp(task.updatedAt ?? task.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                        <p className="text-xs uppercase tracking-wider text-gray-600 mb-1">
                          {t('deployTask.taskUrl')}
                        </p>
                        <code className="text-xs font-mono text-gray-400 break-all">
                          {absoluteUrl}
                        </code>
                      </div>

                      {task.error && (
                        <div className="mt-3 rounded-lg border border-red-900/30 bg-red-950/20 px-3 py-2 text-xs text-red-300 break-words">
                          {task.error}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-row lg:flex-col gap-2 shrink-0">
                      <Link
                        to="/deploy-tasks/$taskId"
                        params={{ taskId: String(task.id) }}
                        className="inline-flex items-center justify-center gap-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-2 transition-colors"
                      >
                        <Terminal size={12} />
                        {t('deployTask.openTask')}
                      </Link>
                      {(task.status === 'deployed' || task.status === 'failed') && (
                        <Button
                          type="button"
                          onClick={() => handleRedeploy(task.id)}
                          variant="secondary"
                          size="sm"
                        >
                          <RefreshCw size={12} />
                          {t('deployTask.redeploy')}
                        </Button>
                      )}
                      {task.status === 'deployed' && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={rollbackMutation.isPending}
                          onClick={() => {
                            if (rollbackNs === task.namespace) {
                              rollbackMutation.mutate(task.namespace)
                            } else {
                              setRollbackNs(task.namespace)
                            }
                          }}
                        >
                          {rollbackMutation.isPending ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          {rollbackNs === task.namespace
                            ? t('deployTask.rollbackConfirm')
                            : t('deployTask.rollback')}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
