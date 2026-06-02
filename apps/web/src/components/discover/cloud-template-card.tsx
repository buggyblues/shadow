import type {
  TemplateCatalogSummary,
  TemplateCategoryId,
  TemplateDifficulty,
} from '@shadowob/cloud-ui/lib/api'
import { Cloud, Users } from 'lucide-react'

const TEMPLATE_CATEGORIES = new Set<TemplateCategoryId>([
  'devops',
  'security',
  'support',
  'research',
  'monitoring',
  'business',
  'demo',
])

export interface CloudTemplateSource {
  slug: string
  name: string
  description?: string | null
  source?: string | null
  tags?: string[] | null
  category?: string | null
  deployCount?: number | null
  content?: Record<string, unknown> | null
}

interface DiscoverCloudTemplateCardProps {
  template: TemplateCatalogSummary
  agentCountLabel: string
  summaryFallback: string
}

function normalizeTemplateCategory(category?: string | null): TemplateCategoryId {
  return category && TEMPLATE_CATEGORIES.has(category as TemplateCategoryId)
    ? (category as TemplateCategoryId)
    : 'demo'
}

function normalizeDifficulty(category?: string | null): TemplateDifficulty {
  if (category === 'advanced') return 'advanced'
  if (category === 'intermediate') return 'intermediate'
  return 'beginner'
}

function getTemplateMeta(template: CloudTemplateSource) {
  const deployments =
    template.content && typeof template.content === 'object'
      ? (template.content.deployments as { namespace?: unknown; agents?: unknown[] } | undefined)
      : undefined
  const agents = Array.isArray(deployments?.agents) ? deployments.agents : []
  const description = template.description?.trim()

  return {
    namespace:
      typeof deployments?.namespace === 'string' && deployments.namespace.trim()
        ? deployments.namespace
        : template.slug,
    agentCount: agents.length,
    overview: description ? [description] : [],
    features: Array.isArray(template.tags) ? template.tags.filter(Boolean) : [],
  }
}

export function toTemplateCatalogSummary(template: CloudTemplateSource): TemplateCatalogSummary {
  const meta = getTemplateMeta(template)
  const features = meta.features

  return {
    name: template.slug,
    title: template.name || template.slug,
    namespace: meta.namespace,
    description: template.description ?? '',
    agentCount: meta.agentCount,
    tags: features,
    category: normalizeTemplateCategory(template.category),
    emoji: '☁️',
    featured: template.source === 'official',
    popularity: template.deployCount ?? 0,
    difficulty: normalizeDifficulty(template.category),
    estimatedDeployTime: '5 min',
    overview: meta.overview,
    features,
    highlights: features.slice(0, 3),
  }
}

export function DiscoverCloudTemplateCard({
  template,
  summaryFallback,
  agentCountLabel,
}: DiscoverCloudTemplateCardProps) {
  const slug = encodeURIComponent(template.name)
  const summary = template.description || template.overview[0] || summaryFallback
  const detailHref = `/cloud/store/${slug}`
  const openDetail = () => {
    window.location.assign(detailHref)
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        openDetail()
      }}
      className="group cursor-pointer overflow-hidden rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/55 shadow-[0_18px_48px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-bg-tertiary/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
    >
      <div className="flex min-h-[180px] flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-white/15 bg-bg-primary/55 text-primary shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
            <Cloud size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-lg font-black leading-tight text-white transition-colors group-hover:text-primary">
              {template.title}
            </h3>
          </div>
        </div>
        <p className="h-[72px] min-h-[72px] max-h-[72px] overflow-hidden text-sm font-semibold leading-6 text-text-secondary line-clamp-3">
          {summary}
        </p>
        <div className="inline-flex items-center gap-1.5 border-t border-white/10 pt-3 text-xs font-black text-text-muted">
          <Users size={13} className="text-primary" />
          {template.agentCount} {agentCountLabel}
        </div>
      </div>
    </article>
  )
}
