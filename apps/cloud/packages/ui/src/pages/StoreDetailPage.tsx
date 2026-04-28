import { Button, EmptyState, GlassCard, GlassPanel } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, BookOpen, Clock, FolderOpen, GitFork, Key, Rocket, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  parseTemplateAgents,
  TemplateAgentsTab,
  TemplateConfigTab,
  TemplateDetailShell,
} from '@/components/TemplateDetailShared'
import { useApiClient } from '@/lib/api-context'
import { useToast } from '@/stores/toast'

export function StoreDetailPage() {
  const api = useApiClient()
  const { t, i18n } = useTranslation()
  const { name } = useParams({ strict: false }) as { name: string }
  const [activeTab, setActiveTab] = useState('agents')
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const forkMutation = useMutation({
    mutationFn: () => api.myTemplates.fork(name),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      toast.success(`${t('storeDetail.forked')} "${data.name}"`)
      navigate({ to: '/my-templates/$name', params: { name: data.name } })
    },
    onError: () => toast.error(t('storeDetail.failedToFork')),
  })

  const { data: detailResponse, isLoading: detailLoading } = useQuery({
    queryKey: ['template-detail', name, i18n.language],
    queryFn: () => api.templates.detail(name, i18n.language),
  })

  const { data: templateData, isLoading: configLoading } = useQuery({
    queryKey: ['template-config', name],
    queryFn: () => api.templates.get(name),
  })

  const detail = detailResponse?.template
  const agents = parseTemplateAgents(templateData)

  const tabs = [
    {
      id: 'agents',
      label: t('storeDetail.agents'),
      count: agents.length,
      icon: <Users size={13} />,
    },
    {
      id: 'config',
      label: t('storeDetail.configuration'),
      icon: <BookOpen size={13} />,
    },
  ]

  if (!detail && !detailLoading) {
    return (
      <div className="p-6">
        <EmptyState
          title={t('storeDetail.templateNotFound')}
          description={t('storeDetail.templateNotFoundDesc')}
          action={
            <Button asChild variant="primary" size="sm">
              <Link to="/store">{t('storeDetail.backToStore')}</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const displayTitle = detail?.title || name

  return (
    <TemplateDetailShell
      breadcrumbItems={[{ label: t('store.title'), to: '/store' }, { label: displayTitle }]}
      heroIcon={<span className="text-5xl">{detail?.emoji ?? '📦'}</span>}
      title={displayTitle}
      description={detail?.description ?? t('common.loading')}
      actions={
        <>
          <Button asChild variant="primary">
            <Link to="/store/$name/deploy" params={{ name }}>
              <Rocket size={14} />
              <span>{t('store.deployTemplate')}</span>
            </Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => forkMutation.mutate()}
            disabled={forkMutation.isPending}
          >
            <GitFork size={14} />
            <span>{forkMutation.isPending ? t('common.loading') : t('store.forkTemplate')}</span>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/store">
              <ArrowLeft size={14} />
              <span>{t('store.backToStore')}</span>
            </Link>
          </Button>
        </>
      }
      sidebar={
        detail ? (
          <GlassCard className="rounded-3xl pt-3 px-5 pb-5">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted mb-3">
              {t('templateDetail.quickInfo')}
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-text-muted flex items-center gap-1.5">
                  <Users size={12} />
                  {t('deploy.agentsLabel')}
                </span>
                <span className="text-sm font-bold text-text-primary">{detail.agentCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-text-muted flex items-center gap-1.5">
                  <FolderOpen size={12} />
                  {t('deploy.namespaceLabel')}
                </span>
                <code className="text-sm text-text-primary">{detail.namespace}</code>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-text-muted flex items-center gap-1.5">
                  <Clock size={12} />
                  {t('deploy.deployTimeLabel')}
                </span>
                <span className="text-sm text-text-primary">{detail.estimatedDeployTime}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-text-muted flex items-center gap-1.5">
                  <Key size={12} />
                  {t('storeDetail.requiredEnvVars')}
                </span>
                <span className="text-sm font-bold text-text-primary">
                  {detail.requiredEnvVars.length}
                </span>
              </div>
            </div>

            {detail.requiredEnvVars.length > 0 && (
              <div className="space-y-2 mt-4 pt-3 border-t border-border-subtle">
                <div className="text-[11px] font-semibold text-text-muted">
                  {t('storeDetail.requiredEnvVars')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {detail.requiredEnvVars.map((envKey) => (
                    <code
                      key={envKey}
                      className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1.5 text-[11px] text-text-primary"
                    >
                      {envKey}
                    </code>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 mt-4 pt-3 border-t border-border-subtle">
              <div className="text-[11px] font-semibold text-text-muted">
                {t('storeDetail.cliQuickDeploy')}
              </div>
              <code className="block break-all rounded-2xl border border-border-subtle bg-bg-tertiary px-4 py-3 text-xs text-text-primary">
                shadowob-cloud deploy --template {name}
              </code>
            </div>
          </GlassCard>
        ) : null
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      <GlassPanel className="rounded-3xl p-5">
        {activeTab === 'agents' && (
          <TemplateAgentsTab
            agents={agents}
            emptyTitle={t('storeDetail.agentDetailsUnavailable')}
            emptyDescription={t('storeDetail.deployToSeeConfig')}
            introText={t('storeDetail.includesAgents', { count: agents.length })}
          />
        )}

        {activeTab === 'config' && (
          <TemplateConfigTab
            templateData={templateData}
            description={t('storeDetail.fullTemplateConfig')}
            title={configLoading ? t('common.loading') : t('storeDetail.templateConfiguration')}
          />
        )}
      </GlassPanel>
    </TemplateDetailShell>
  )
}
