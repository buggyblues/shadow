import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  ArrowLeft,
  BookOpen,
  CheckCircle,
  Clock,
  Cpu,
  ExternalLink,
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
import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import {
  parseTemplateAgents,
  TemplateAgentsTab,
  TemplateConfigTab,
  TemplateDetailShell,
} from '@/components/TemplateDetailShared'
import { api, type Template } from '@/lib/api'
import { getCategoryColor, getDifficultyColor, getTemplateMeta } from '@/lib/store-data'
import { cn, pluralize } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

// ── Components ────────────────────────────────────────────────────────────────

function OverviewTab({
  template: _template,
  meta,
}: {
  template: Template
  meta: ReturnType<typeof getTemplateMeta>
}) {
  return (
    <div className="space-y-6">
      {/* README */}
      <div className="prose prose-invert prose-sm max-w-none">
        {meta.readme.split('\n\n').map((paragraph, i) => {
          if (paragraph.startsWith('## ')) {
            return (
              <h2 key={i} className="text-lg font-semibold text-white mt-6 mb-3">
                {paragraph.replace('## ', '')}
              </h2>
            )
          }
          if (paragraph.startsWith('### ')) {
            return (
              <h3 key={i} className="text-base font-medium text-gray-200 mt-4 mb-2">
                {paragraph.replace('### ', '')}
              </h3>
            )
          }
          if (paragraph.startsWith('- ')) {
            return (
              <ul key={i} className="space-y-1 text-sm text-gray-400">
                {paragraph.split('\n').map((line, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <span>{line.replace(/^- /, '')}</span>
                  </li>
                ))}
              </ul>
            )
          }
          if (paragraph.startsWith('1. ')) {
            return (
              <ol key={i} className="space-y-1 text-sm text-gray-400 list-decimal list-inside">
                {paragraph.split('\n').map((line, j) => (
                  <li key={j}>{line.replace(/^\d+\. /, '')}</li>
                ))}
              </ol>
            )
          }
          return (
            <p key={i} className="text-sm text-gray-400 leading-relaxed">
              {paragraph}
            </p>
          )
        })}
      </div>

      {/* Features */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Zap size={14} className="text-yellow-500" />
          Features
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {meta.features.map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-sm text-gray-300">
              <CheckCircle size={13} className="text-green-400 shrink-0" />
              {feature}
            </div>
          ))}
        </div>
      </div>

      {/* Use Cases */}
      {meta.useCases.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Layers size={14} className="text-purple-400" />
            Use Cases
          </h3>
          <div className="flex flex-wrap gap-2">
            {meta.useCases.map((uc) => (
              <span
                key={uc}
                className="text-xs bg-purple-900/30 text-purple-300 px-3 py-1.5 rounded-full border border-purple-800/50"
              >
                {uc}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Requirements */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Shield size={14} className="text-orange-400" />
          Requirements
        </h3>
        <ul className="space-y-2">
          {meta.requirements.map((req) => (
            <li key={req} className="flex items-start gap-2 text-sm text-gray-400">
              <span className="text-orange-400 mt-0.5">→</span>
              {req}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function StoreDetailPage() {
  const { t } = useTranslation()
  const { name } = useParams({ strict: false }) as { name: string }
  const [activeTab, setActiveTab] = useState('overview')
  const isFavorite = useAppStore((s) => s.favorites.includes(name))
  const toggleFavorite = useAppStore((s) => s.toggleFavorite)
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const forkMutation = useMutation({
    mutationFn: () => api.myTemplates.fork(name),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      toast.success(`Forked to My Templates as "${data.name}"`)
      navigate({ to: '/my-templates/$name', params: { name: data.name } })
    },
    onError: () => toast.error('Failed to fork template'),
  })

  // Fetch basic template list (for matching)
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: api.templates.list,
  })

  // Fetch full template config
  const { data: templateData, isLoading: loadingDetail } = useQuery({
    queryKey: ['template', name],
    queryFn: () => api.templates.get(name),
  })

  const template = templates?.find((t) => t.name === name)
  const meta = getTemplateMeta(name)
  const agents = parseTemplateAgents(templateData)

  // Fetch required env var refs
  const { data: envRefsData } = useQuery({
    queryKey: ['template-env-refs', name],
    queryFn: () => api.templates.envRefs(name),
  })
  const requiredEnvVars = envRefsData?.requiredEnvVars ?? []

  const tabs = [
    { id: 'overview', label: t('storeDetail.overview'), icon: <BookOpen size={13} /> },
    {
      id: 'agents',
      label: t('storeDetail.agents'),
      count: agents.length,
      icon: <Users size={13} />,
    },
    { id: 'config', label: t('storeDetail.configuration'), icon: <Settings size={13} /> },
  ]

  if (!template && !loadingDetail) {
    return (
      <div className="p-6">
        <Breadcrumb
          items={[{ label: t('store.title'), to: '/store' }, { label: name }]}
          className="mb-4"
        />
        <EmptyState
          title={t('storeDetail.templateNotFound')}
          description={t('storeDetail.templateNotFoundDesc')}
          action={
            <Link
              to="/store"
              className="text-sm text-blue-400 hover:text-blue-300 border border-blue-800 rounded-lg px-4 py-2"
            >
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
      heroIcon={<span className="text-5xl">{meta.emoji}</span>}
      title={name}
      titleActions={
        <button
          type="button"
          onClick={() => toggleFavorite(name)}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            isFavorite ? 'text-red-400' : 'text-gray-600 hover:text-gray-400',
          )}
        >
          <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      }
      description={template?.description ?? 'Loading...'}
      badges={
        <>
          <Badge variant="default" className={getCategoryColor(meta.category)}>
            {meta.category}
          </Badge>
          <Badge variant="default" className={getDifficultyColor(meta.difficulty)}>
            {meta.difficulty}
          </Badge>
          {meta.featured && (
            <Badge variant="info" icon={<Star size={10} />}>
              {t('store.featured')}
            </Badge>
          )}
        </>
      }
      chips={
        <>
          {meta.highlights.map((h) => (
            <div
              key={h}
              className="flex items-center gap-1.5 text-xs text-gray-300 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-full"
            >
              <Zap size={11} className="text-yellow-500" />
              {h}
            </div>
          ))}
        </>
      }
      actions={
        <>
          <Link
            to="/store/$name/deploy"
            params={{ name }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            <Rocket size={16} />
            {t('store.deployTemplate')}
          </Link>
          <button
            type="button"
            onClick={() => forkMutation.mutate()}
            disabled={forkMutation.isPending}
            className="flex items-center gap-2 text-sm text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <GitFork size={14} />
            {forkMutation.isPending ? 'Forking...' : t('store.forkTemplate')}
          </button>
          <Link
            to="/store"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2.5 rounded-lg transition-colors"
          >
            <ArrowLeft size={14} />
            {t('store.backToStore')}
          </Link>
        </>
      }
      sidebar={
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Quick Info
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 flex items-center gap-1.5">
                <Users size={12} />
                Agents
              </span>
              <span className="text-sm font-medium">{template?.agentCount ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 flex items-center gap-1.5">
                <FolderOpen size={12} />
                Namespace
              </span>
              <span className="text-sm font-mono text-gray-300">{template?.namespace ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 flex items-center gap-1.5">
                <Clock size={12} />
                Deploy time
              </span>
              <span className="text-sm text-gray-300">{meta.estimatedDeployTime}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 flex items-center gap-1.5">
                <Star size={12} />
                Popularity
              </span>
              <div className="flex items-center gap-1.5">
                <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500 rounded-full"
                    style={{ width: `${meta.popularity}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{meta.popularity}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 flex items-center gap-1.5">
                <Cpu size={12} />
                Team name
              </span>
              <span className="text-sm font-mono text-gray-300">{template?.teamName ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 flex items-center gap-1.5">
                <Key size={12} />
                Env vars
              </span>
              <span className="text-sm text-gray-300">{requiredEnvVars.length || '—'}</span>
            </div>
          </div>

          {requiredEnvVars.length > 0 && (
            <div className="pt-3 border-t border-gray-800">
              <p className="text-[10px] text-gray-600 mb-2 flex items-center gap-1">
                <Key size={10} />
                Required Environment Variables
              </p>
              <div className="space-y-1">
                {requiredEnvVars.map((v: string) => (
                  <code
                    key={v}
                    className="block text-[11px] font-mono text-yellow-400/80 bg-gray-950 rounded px-2 py-1"
                  >
                    {v}
                  </code>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-gray-800">
            <p className="text-[10px] text-gray-600 mb-2 flex items-center gap-1">
              <ExternalLink size={10} />
              CLI Quick Deploy
            </p>
            <code className="block text-xs font-mono text-gray-400 bg-gray-950 rounded px-3 py-2 break-all">
              shadowob-cloud deploy --template {name}
            </code>
          </div>
        </div>
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'overview' && template && <OverviewTab template={template} meta={meta} />}
      {activeTab === 'agents' && (
        <TemplateAgentsTab
          agents={agents}
          emptyTitle={t('storeDetail.agentDetailsUnavailable')}
          emptyDescription={t('storeDetail.deployToSeeConfig')}
          introText={`This template includes ${agents.length} ${pluralize(agents.length, 'agent')}:`}
        />
      )}
      {activeTab === 'config' && (
        <TemplateConfigTab
          templateData={templateData}
          description={t('storeDetail.fullTemplateConfig')}
          title="Template Configuration"
        />
      )}
    </TemplateDetailShell>
  )
}
