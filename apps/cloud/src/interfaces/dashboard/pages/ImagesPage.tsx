import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Container, FileCode, Package } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Card, EmptyState } from '@shadowob/ui'
import { PageShell } from '@/components/PageShell'
import { DashboardErrorState, DashboardLoadingState } from '@/components/DashboardState'
import { StatCard } from '@/components/StatCard'
import { StatsGrid } from '@/components/StatsGrid'
import { api, type ImageInfo } from '@/lib/api'

export function ImagesPage() {
  const { t } = useTranslation()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['images'],
    queryFn: api.images,
  })

  const withDockerfile = data?.filter((i) => i.hasDockerfile).length ?? 0

  return (
    <PageShell
      breadcrumb={[{ label: t('images.title') }]}
      title={t('images.title')}
      description={t('images.subtitle')}
      narrow
      actions={
        <Button type="button" onClick={() => refetch()} variant="ghost" size="sm">
          {t('common.refresh')}
        </Button>
      }
    >
      {isLoading && <DashboardLoadingState rows={1} />}
      {error && (
        <DashboardErrorState
          title={t('images.loadFailed')}
        />
      )}

      {data && data.length === 0 && (
        <EmptyState
          icon={Package}
          title={t('images.emptyTitle')}
          description={t('images.emptyDescription')}
        />
      )}

      {data && data.length > 0 && (
        <>
          <StatsGrid className="grid-cols-2 lg:grid-cols-2">
            <StatCard
              label={t('images.totalImages')}
              value={data.length}
              icon={<Container size={13} />}
            />
            <StatCard
              label={t('images.withDockerfile')}
              value={withDockerfile}
              icon={<FileCode size={13} />}
              color="blue"
            />
          </StatsGrid>

          <Card variant="surface">
            <div className="divide-y divide-border-subtle">
              {data.map((img: ImageInfo) => (
                <div key={img.name} className="flex items-center gap-3 px-4 py-3">
                  <Container size={16} className="text-text-secondary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono">{img.name}</p>
                  </div>
                  <span
                    className={clsx(
                      'text-xs px-2 py-0.5 rounded-full flex items-center gap-1',
                      img.hasDockerfile
                        ? 'bg-blue-900/50 text-blue-400'
                        : 'bg-bg-secondary text-text-muted',
                    )}
                  >
                    <FileCode size={10} />
                    {img.hasDockerfile ? 'Dockerfile' : t('images.withoutDockerfile')}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </PageShell>
  )
}
