import {
  TemplateCardMetric,
  TemplateGalleryCard,
} from '@shadowob/cloud-ui/components/TemplateGalleryCard'
import type {
  TemplateCatalogSummary,
  TemplateCategoryId,
  TemplateDifficulty,
} from '@shadowob/cloud-ui/lib/api'
import { Badge } from '@shadowob/ui'
import { Rocket, Sparkles, Users } from 'lucide-react'

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
  locale: string
  categoryLabel: string
  difficultyLabel: string
  cashbackLabel: string
  deployLabel: string
  agentCountLabel: string
  popularityLabel: string
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

function formatCompact(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
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
  locale,
  categoryLabel,
  difficultyLabel,
  cashbackLabel,
  deployLabel,
  agentCountLabel,
  popularityLabel,
  summaryFallback,
}: DiscoverCloudTemplateCardProps) {
  const slug = encodeURIComponent(template.name)
  const summary = template.description || template.overview[0] || summaryFallback

  return (
    <TemplateGalleryCard
      template={template}
      detailHref={`/cloud/store/${slug}`}
      title={template.title}
      summary={summary}
      categoryLabel={categoryLabel}
      difficultyLabel={difficultyLabel}
      headerBadges={
        <Badge variant="success" size="sm">
          {cashbackLabel}
        </Badge>
      }
      metrics={[
        {
          icon: <Users size={13} className="text-primary" />,
          value: template.agentCount,
          label: agentCountLabel,
        },
        {
          icon: <Sparkles size={13} className="text-primary" />,
          value: formatCompact(template.popularity, locale),
          label: popularityLabel,
        },
      ]}
      metadata={
        template.highlights.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {template.highlights.slice(0, 2).map((highlight) => (
              <TemplateCardMetric
                key={highlight}
                icon={<Sparkles size={12} className="text-primary" />}
                value={highlight}
              />
            ))}
          </div>
        ) : null
      }
      primaryAction={{
        href: `/cloud/store/${slug}/deploy`,
        label: deployLabel,
        icon: <Rocket size={14} />,
      }}
    />
  )
}
