import { Button, Card, EmptyState } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Activity, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/PageShell'
import { StatCard } from '@/components/StatCard'
import { StatsGrid } from '@/components/StatsGrid'
import { api, type DoctorCheck } from '@/lib/api'

function CheckIcon({ status }: { status: DoctorCheck['status'] }) {
  if (status === 'pass') return <CheckCircle size={16} className="text-green-400" />
  if (status === 'warn') return <AlertTriangle size={16} className="text-yellow-400" />
  return <XCircle size={16} className="text-red-400" />
}

export function DoctorPage() {
  const { t } = useTranslation()

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['doctor'],
    queryFn: api.doctor,
  })

  const lastChecked = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null

  return (
    <PageShell
      breadcrumb={[]}
      title={t('doctor.title')}
      description={t('doctor.subtitle')}
      narrow
      actions={
        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Clock size={11} />
              {lastChecked}
            </span>
          )}
          <Button type="button" onClick={() => refetch()} variant="ghost" size="sm">
            {t('doctor.recheck')}
          </Button>
        </div>
      }
    >
      {isLoading && (
        <EmptyState
          icon={Activity}
          title={t('doctor.runningTitle')}
          description={t('doctor.runningDescription')}
        />
      )}
      {error && (
        <EmptyState title={t('doctor.failedTitle')} description={t('doctor.failedDescription')} />
      )}

      {data && (
        <>
          {/* Summary cards */}
          <StatsGrid className="grid-cols-3 lg:grid-cols-3">
            <StatCard
              label={t('settings.passing')}
              value={data.summary.pass}
              icon={<CheckCircle size={13} />}
              color="green"
            />
            <StatCard
              label={t('monitoring.warnings')}
              value={data.summary.warn}
              icon={<AlertTriangle size={13} />}
              color="yellow"
            />
            <StatCard
              label={t('monitoring.failed')}
              value={data.summary.fail}
              icon={<XCircle size={13} />}
              color="red"
            />
          </StatsGrid>

          {/* Check list */}
          <Card variant="surface">
            <div className="divide-y divide-border-subtle">
              {data.checks.map((check) => (
                <div
                  key={check.name}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3',
                    check.status === 'fail' && 'bg-red-900/10',
                  )}
                >
                  <CheckIcon status={check.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{check.name}</p>
                    <p className="text-xs text-text-muted truncate">{check.message}</p>
                  </div>
                  <span
                    className={clsx(
                      'text-xs px-2 py-0.5 rounded-full',
                      check.status === 'pass' && 'bg-green-900/50 text-green-400',
                      check.status === 'warn' && 'bg-yellow-900/50 text-yellow-400',
                      check.status === 'fail' && 'bg-red-900/50 text-red-400',
                    )}
                  >
                    {t(`monitoring.statusLabels.${check.status}`)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {data.summary.fail === 0 && (
            <div className="mt-4 flex items-center gap-2 text-green-400 text-sm">
              <Activity size={14} />
              {t('doctor.allChecksPassed')}
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
