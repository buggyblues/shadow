import { Button } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
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
import { DangerConfirmDialog } from '@/components/DangerConfirmDialog'
import { DashboardEmptyState } from '@/components/DashboardEmptyState'
import { DashboardLoadingState } from '@/components/DashboardState'
import { DashboardTaskCard } from '@/components/DashboardTaskCard'
import { PageShell } from '@/components/PageShell'
import { StatCard } from '@/components/StatCard'
import { StatsGrid } from '@/components/StatsGrid'
import { api } from '@/lib/api'
import { formatTimestamp } from '@/lib/utils'

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
    const nextTaskId = await api.deployTasks.redeployToTaskId(taskId)
    if (!nextTaskId) return
    navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(nextTaskId) } })
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
    <PageShell
      breadcrumb={[{ label: t('nav.deployTasks') }]}
      title={t('deployTask.listTitle')}
      description={t('deployTask.listDescription')}
      headerContent={
        <StatsGrid className="lg:grid-cols-4">
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
        </StatsGrid>
      }
    >
      {isLoading && <DashboardLoadingState inline />}

      {!isLoading && tasks.length === 0 && (
        <DashboardEmptyState
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
            <h2 className="text-sm font-semibold text-text-secondary">
              {t('deployTask.taskHistory')}
            </h2>
            <span className="text-xs text-text-muted">
              {summary.running} {t('deployTask.activeNow')}
            </span>
          </div>

          {tasks.map(({ task, url, active }) => {
            const absoluteUrl = new URL(url, window.location.origin).toString()
            const running = active || task.status === 'running' || task.status === 'pending'

            return (
              <div key={task.id} className="space-y-2">
                <DashboardTaskCard
                  id={task.id}
                  statusLabel={t(`deployTask.statuses.${task.status}`)}
                  statusVariant={getStatusVariant(task.status)}
                  running={running}
                  timestamp={formatTimestamp(task.updatedAt ?? task.createdAt)}
                  meta={
                    <>
                      <span>
                        {t('deployTask.namespace')}: {task.namespace}
                      </span>
                      <span>·</span>
                      <span>
                        {t('deployTask.template')}: {task.templateSlug ?? '—'}
                      </span>
                    </>
                  }
                  error={task.error}
                  actions={
                    <>
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/deploy-tasks/$taskId" params={{ taskId: String(task.id) }}>
                          <Terminal size={12} />
                          {t('deployTask.openTask')}
                        </Link>
                      </Button>
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
                          onClick={() => setRollbackNs(task.namespace)}
                        >
                          <RotateCcw size={12} />
                          {t('deployTask.rollback')}
                        </Button>
                      )}
                    </>
                  }
                />

                <div className="rounded-lg border border-border-subtle bg-bg-secondary/40 px-3 py-2">
                  <p className="mb-1 text-xs uppercase tracking-wider text-text-muted">
                    {t('deployTask.taskUrl')}
                  </p>
                  <code className="break-all text-xs font-mono text-text-secondary">
                    {absoluteUrl}
                  </code>
                </div>
              </div>
            )
          })}
        </div>
      )}

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
