import { Button, Card, EmptyState } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { Cpu, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DashboardErrorState, DashboardLoadingState } from '@/components/DashboardState'
import { PageShell } from '@/components/PageShell'
import { StatCard } from '@/components/StatCard'
import { api, type RuntimeInfo } from '@/lib/api'

export function RuntimesPage() {
  const { t } = useTranslation()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['runtimes'],
    queryFn: api.runtimes,
  })

  return (
    <PageShell
      breadcrumb={[{ label: t('runtimes.title') }]}
      title={t('runtimes.title')}
      description={t('runtimes.subtitle')}
      narrow
      actions={
        <Button type="button" onClick={() => refetch()} variant="ghost" size="sm">
          {t('common.refresh')}
        </Button>
      }
    >
      {isLoading && <DashboardLoadingState rows={1} />}
      {error && <DashboardErrorState title={t('runtimes.loadFailed')} />}

      {data && data.length === 0 && (
        <EmptyState
          icon={Server}
          title={t('runtimes.emptyTitle')}
          description={t('runtimes.emptyDescription')}
        />
      )}

      {data && data.length > 0 && (
        <>
          <StatCard
            label={t('runtimes.availableRuntimes')}
            value={data.length}
            icon={<Cpu size={13} />}
            color="blue"
            className="mb-6 max-w-xs"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((rt: RuntimeInfo) => (
              <Card key={rt.id} variant="surface">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu size={16} className="text-blue-400" />
                    <h3 className="text-sm font-semibold">{rt.name}</h3>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-text-muted">{t('runtimes.id')}:</span>
                      <span className="font-mono text-text-secondary">{rt.id}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-text-muted">{t('runtimes.image')}:</span>
                      <span className="font-mono text-text-secondary truncate">
                        {rt.defaultImage}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </PageShell>
  )
}
