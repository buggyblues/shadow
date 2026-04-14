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
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import {
  parseTemplateAgents,
  TemplateAgentsTab,
  TemplateConfigTab,
  TemplateDetailShell,
} from '@/components/TemplateDetailShared'
import { api } from '@/lib/api'
import { getCategoryColor, getDifficultyColor } from '@/lib/store-data'
import { cn } from '@/lib/utils'
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
      <div className="nf-card !p-6 space-y-4">
        {overview.map((paragraph) => (
          <p key={paragraph} className="text-sm leading-7" style={{ color: 'var(--nf-text-mid)' }}>
            {paragraph}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="nf-card !p-5 space-y-4">
          <h3
            className="text-sm font-black flex items-center gap-2"
            style={{ color: 'var(--nf-text-high)' }}
          >
            <Zap size={14} style={{ color: 'var(--color-nf-yellow)' }} />
            {t('storeDetail.features')}
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {features.map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-2 rounded-2xl px-4 py-3"
                style={{
                  background: 'var(--nf-bg-raised)',
                  color: 'var(--nf-text-high)',
                }}
              >
                <CheckCircle size={14} className="text-green-400 shrink-0" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="nf-card !p-5 space-y-4">
          <h3
            className="text-sm font-black flex items-center gap-2"
            style={{ color: 'var(--nf-text-high)' }}
          >
            <Layers size={14} style={{ color: 'var(--color-nf-indigo)' }} />
            {t('storeDetail.useCases')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {useCases.map((useCase) => (
              <span
                key={useCase}
                className="px-3 py-2 rounded-full text-xs border"
                style={{
                  background: 'rgba(124, 77, 255, 0.08)',
                  borderColor: 'rgba(124, 77, 255, 0.2)',
                  color: 'var(--nf-text-high)',
                }}
              >
                {useCase}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="nf-card !p-5 space-y-4">
        <h3
          className="text-sm font-black flex items-center gap-2"
          style={{ color: 'var(--nf-text-high)' }}
        >
          <Shield size={14} style={{ color: 'var(--color-nf-crimson)' }} />
          {t('storeDetail.requirements')}
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {requirements.map((requirement) => (
            <div
              key={requirement}
              className="rounded-2xl px-4 py-3 text-sm"
              style={{
                background: 'var(--nf-bg-raised)',
                color: 'var(--nf-text-mid)',
              }}
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
            <Link to="/store" className="nf-pill nf-pill-cyan text-sm">
              {t('storeDetail.backToStore')}
            </Link>
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
        <button
          type="button"
          onClick={() => toggleFavorite(name)}
          className={cn(
            'p-2 rounded-full border transition-colors',
            isFavorite
              ? 'text-red-400 border-red-800/60 bg-red-900/20'
              : 'text-gray-500 border-gray-800 hover:text-red-300 hover:border-red-800/50',
          )}
        >
          <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      }
      description={detail?.description ?? t('common.loading')}
      badges={
        detail ? (
          <>
            <Badge variant="default" className={getCategoryColor(detail.category)}>
              {getCategoryLabel(detail.category, t)}
            </Badge>
            <Badge variant="default" className={getDifficultyColor(detail.difficulty)}>
              {getDifficultyLabel(detail.difficulty, t)}
            </Badge>
            {detail.featured && (
              <Badge variant="info" icon={<Star size={10} />}>
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
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border"
                style={{
                  background: 'var(--nf-bg-glass-2)',
                  borderColor: 'var(--nf-border)',
                  color: 'var(--nf-text-high)',
                }}
              >
                <Zap size={11} style={{ color: 'var(--color-nf-yellow)' }} />
                {highlight}
              </div>
            ))}
          </>
        ) : null
      }
      actions={
        <>
          <Link to="/store/$name/deploy" params={{ name }} className="nf-pill nf-pill-cyan text-sm">
            <Rocket size={14} />
            <span>{t('store.deployTemplate')}</span>
          </Link>
          <button
            type="button"
            onClick={() => forkMutation.mutate()}
            disabled={forkMutation.isPending}
            className="nf-pill text-sm"
            style={{
              background: 'var(--nf-bg-raised)',
              color: 'var(--nf-text-high)',
              border: '1px solid var(--nf-border)',
            }}
          >
            <GitFork size={14} />
            <span>{forkMutation.isPending ? t('common.loading') : t('store.forkTemplate')}</span>
          </button>
          <Link
            to="/store"
            className="nf-pill text-sm"
            style={{
              background: 'transparent',
              color: 'var(--nf-text-mid)',
              border: '1px solid var(--nf-border)',
            }}
          >
            <ArrowLeft size={14} />
            <span>{t('store.backToStore')}</span>
          </Link>
        </>
      }
      sidebar={
        detail ? (
          <div className="nf-card !p-5 space-y-5">
            <h3
              className="text-xs font-black uppercase tracking-[0.2em]"
              style={{ color: 'var(--nf-text-muted)' }}
            >
              {t('templateDetail.quickInfo')}
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-xs flex items-center gap-1.5"
                  style={{ color: 'var(--nf-text-muted)' }}
                >
                  <Users size={12} />
                  {t('deploy.agentsLabel')}
                </span>
                <span className="text-sm font-bold" style={{ color: 'var(--nf-text-high)' }}>
                  {detail.agentCount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-xs flex items-center gap-1.5"
                  style={{ color: 'var(--nf-text-muted)' }}
                >
                  <FolderOpen size={12} />
                  {t('deploy.namespaceLabel')}
                </span>
                <code className="text-sm" style={{ color: 'var(--nf-text-high)' }}>
                  {detail.namespace}
                </code>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-xs flex items-center gap-1.5"
                  style={{ color: 'var(--nf-text-muted)' }}
                >
                  <Clock size={12} />
                  {t('deploy.deployTimeLabel')}
                </span>
                <span className="text-sm" style={{ color: 'var(--nf-text-high)' }}>
                  {detail.estimatedDeployTime}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-xs flex items-center gap-1.5"
                  style={{ color: 'var(--nf-text-muted)' }}
                >
                  <Cpu size={12} />
                  {t('storeDetail.team')}
                </span>
                <span className="text-sm" style={{ color: 'var(--nf-text-high)' }}>
                  {detail.teamName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-xs flex items-center gap-1.5"
                  style={{ color: 'var(--nf-text-muted)' }}
                >
                  <Star size={12} />
                  {t('storeDetail.popularity')}
                </span>
                <span className="text-sm" style={{ color: 'var(--nf-text-high)' }}>
                  {detail.popularity}%
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--nf-border)' }}>
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-xs flex items-center gap-1.5"
                  style={{ color: 'var(--nf-text-muted)' }}
                >
                  <FileText size={12} />
                  {t('storeDetail.file')}
                </span>
                <code className="text-[11px]" style={{ color: 'var(--nf-text-high)' }}>
                  {detail.file}
                </code>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-xs flex items-center gap-1.5"
                  style={{ color: 'var(--nf-text-muted)' }}
                >
                  <CalendarClock size={12} />
                  {t('storeDetail.updated')}
                </span>
                <span className="text-xs" style={{ color: 'var(--nf-text-high)' }}>
                  {detail.lastUpdated
                    ? new Date(detail.lastUpdated).toLocaleDateString(i18n.language)
                    : t('common.none')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-xs flex items-center gap-1.5"
                  style={{ color: 'var(--nf-text-muted)' }}
                >
                  <Key size={12} />
                  {t('storeDetail.requiredEnvVars')}
                </span>
                <span className="text-sm font-bold" style={{ color: 'var(--nf-text-high)' }}>
                  {detail.requiredEnvVars.length}
                </span>
              </div>
            </div>

            {detail.requiredEnvVars.length > 0 && (
              <div className="space-y-2 pt-4 border-t" style={{ borderColor: 'var(--nf-border)' }}>
                <div
                  className="text-[11px] font-semibold"
                  style={{ color: 'var(--nf-text-muted)' }}
                >
                  {t('storeDetail.requiredEnvVars')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {detail.requiredEnvVars.map((envKey) => (
                    <code
                      key={envKey}
                      className="px-2.5 py-1.5 rounded-full text-[11px]"
                      style={{
                        background: 'rgba(248, 231, 28, 0.1)',
                        color: 'var(--nf-text-high)',
                      }}
                    >
                      {envKey}
                    </code>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 pt-4 border-t" style={{ borderColor: 'var(--nf-border)' }}>
              <div className="text-[11px] font-semibold" style={{ color: 'var(--nf-text-muted)' }}>
                {t('storeDetail.cliQuickDeploy')}
              </div>
              <code
                className="block rounded-2xl px-4 py-3 text-xs break-all"
                style={{
                  background: 'var(--nf-bg-raised)',
                  color: 'var(--nf-text-high)',
                }}
              >
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
