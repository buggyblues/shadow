import { Badge, Button, EmptyState } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CheckCircle,
  Clock,
  Cpu,
  FileText,
  FolderOpen,
  GitFork,
  Heart,
  Key,
  Layers,
  Rocket,
  Settings,
  Shield,
  Star,
  Users,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  parseTemplateAgents,
  TemplateAgentsTab,
  TemplateConfigTab,
  TemplateDetailShell,
} from '@/components/TemplateDetailShared'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

function getCategoryLabel(
  category: string,
  translate: (key: string, options?: Record<string, unknown>) => string,
) {
  return translate(`store.categories.${category}`)
}

function getDifficultyLabel(
  difficulty: string,
  translate: (key: string, options?: Record<string, unknown>) => string,
) {
  return translate(`store.difficulties.${difficulty}`)
}

function OverviewTab({
  overview,
  features,
  useCases,
  requirements,
}: {
  overview: string[]
  features: string[]
  useCases: string[]
  requirements: string[]
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-3xl p-5 space-y-4">
        {overview.map((paragraph) => (
          <p key={paragraph} className="text-sm leading-7 text-text-secondary">
            {paragraph}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="glass-card rounded-3xl p-5 space-y-4">
          <h3 className="text-sm font-black flex items-center gap-2 text-text-primary">
            <Zap size={14} className="text-accent" />
            {t('storeDetail.features')}
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {features.map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-tertiary/60 px-4 py-3 text-text-primary"
              >
                <CheckCircle size={14} className="text-green-400 shrink-0" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-3xl p-5 space-y-4">
          <h3 className="text-sm font-black flex items-center gap-2 text-text-primary">
            <Layers size={14} className="text-[var(--color-nf-indigo)]" />
            {t('storeDetail.useCases')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {useCases.map((useCase) => (
              <span
                key={useCase}
                className="rounded-full border border-[rgba(124,77,255,0.2)] bg-bg-tertiary/60 px-3 py-2 text-xs text-text-secondary"
              >
                {useCase}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card rounded-3xl p-5 space-y-4">
        <h3 className="text-sm font-black flex items-center gap-2 text-text-primary">
          <Shield size={14} className="text-danger" />
          {t('storeDetail.requirements')}
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {requirements.map((requirement) => (
            <div
              key={requirement}
              className="rounded-xl border border-border-subtle bg-bg-tertiary/60 px-4 py-3 text-sm text-text-secondary"
            >
              {requirement}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function StoreDetailPage() {
  const { t, i18n } = useTranslation()
  const { name } = useParams({ strict: false }) as { name: string }
  const [activeTab, setActiveTab] = useState('overview')
  const isFavorite = useAppStore((state) => state.favorites.includes(name))
  const toggleFavorite = useAppStore((state) => state.toggleFavorite)
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
    { id: 'overview', label: t('storeDetail.overview'), icon: <BookOpen size={13} /> },
    {
      id: 'agents',
      label: t('storeDetail.agents'),
      count: agents.length,
      icon: <Users size={13} />,
    },
    {
      id: 'config',
      label: t('storeDetail.configuration'),
      icon: <Settings size={13} />,
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

  return (
    <TemplateDetailShell
      breadcrumbItems={[{ label: t('store.title'), to: '/store' }, { label: name }]}
      heroIcon={<span className="text-5xl">{detail?.emoji ?? '📦'}</span>}
      title={name}
      titleActions={
        <Button
          type="button"
          variant={isFavorite ? 'danger' : 'secondary'}
          size="icon"
          onClick={() => toggleFavorite(name)}
        >
          <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
        </Button>
      }
      description={detail?.description ?? t('common.loading')}
      badges={
        detail ? (
          <>
            <Badge variant="neutral">{getCategoryLabel(detail.category, t)}</Badge>
            <Badge variant="neutral">{getDifficultyLabel(detail.difficulty, t)}</Badge>
            {detail.featured && (
              <Badge variant="info">
                <Star size={10} />
                {t('store.featured')}
              </Badge>
            )}
          </>
        ) : null
      }
      chips={
        detail ? (
          <>
            {detail.highlights.map((highlight) => (
              <div
                key={highlight}
                className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-secondary/70 px-3 py-2 text-xs text-text-primary"
              >
                <Zap size={11} className="text-accent" />
                {highlight}
              </div>
            ))}
          </>
        ) : null
      }
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
          <div className="glass-card rounded-3xl p-5 space-y-5">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">
              {t('templateDetail.quickInfo')}
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs flex items-center gap-1.5 text-text-muted">
                  <Users size={12} />
                  {t('deploy.agentsLabel')}
                </span>
                <span className="text-sm font-bold text-text-primary">{detail.agentCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs flex items-center gap-1.5 text-text-muted">
                  <FolderOpen size={12} />
                  {t('deploy.namespaceLabel')}
                </span>
                <code className="text-sm text-text-primary">{detail.namespace}</code>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs flex items-center gap-1.5 text-text-muted">
                  <Clock size={12} />
                  {t('deploy.deployTimeLabel')}
                </span>
                <span className="text-sm text-text-primary">{detail.estimatedDeployTime}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs flex items-center gap-1.5 text-text-muted">
                  <Cpu size={12} />
                  {t('storeDetail.team')}
                </span>
                <span className="text-sm text-text-primary">{detail.teamName}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs flex items-center gap-1.5 text-text-muted">
                  <Star size={12} />
                  {t('storeDetail.popularity')}
                </span>
                <span className="text-sm text-text-primary">{detail.popularity}%</span>
              </div>
            </div>

            <div className="space-y-3 border-t border-border-subtle pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs flex items-center gap-1.5 text-text-muted">
                  <FileText size={12} />
                  {t('storeDetail.file')}
                </span>
                <code className="text-[11px] text-text-primary">{detail.file}</code>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs flex items-center gap-1.5 text-text-muted">
                  <CalendarClock size={12} />
                  {t('storeDetail.updated')}
                </span>
                <span className="text-xs text-text-primary">
                  {detail.lastUpdated
                    ? new Date(detail.lastUpdated).toLocaleDateString(i18n.language)
                    : t('common.none')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs flex items-center gap-1.5 text-text-muted">
                  <Key size={12} />
                  {t('storeDetail.requiredEnvVars')}
                </span>
                <span className="text-sm font-bold text-text-primary">
                  {detail.requiredEnvVars.length}
                </span>
              </div>
            </div>

            {detail.requiredEnvVars.length > 0 && (
              <div className="space-y-2 border-t border-border-subtle pt-4">
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

            <div className="space-y-2 border-t border-border-subtle pt-4">
              <div className="text-[11px] font-semibold text-text-muted">
                {t('storeDetail.cliQuickDeploy')}
              </div>
              <code className="block break-all rounded-2xl border border-border-subtle bg-bg-tertiary px-4 py-3 text-xs text-text-primary">
                shadowob-cloud deploy --template {name}
              </code>
            </div>
          </div>
        ) : null
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'overview' && detail && (
        <OverviewTab
          overview={detail.overview}
          features={detail.features}
          useCases={detail.useCases}
          requirements={detail.requirements}
        />
      )}

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
    </TemplateDetailShell>
  )
}
