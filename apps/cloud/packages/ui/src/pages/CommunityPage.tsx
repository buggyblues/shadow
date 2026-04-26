import { Badge, Button, Card, EmptyState, GlassCard, Search } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AlertCircle,
  Download,
  ExternalLink,
  Globe,
  Package,
  RefreshCw,
  Settings,
  Sparkles,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/PageShell'
import { useDebounce } from '@/hooks/useDebounce'
import { api, type TemplateCatalogSummary } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/stores/toast'

function CommunityCard({
  template,
  onFork,
  forking,
}: {
  template: TemplateCatalogSummary
  onFork: (name: string) => void
  forking: boolean
}) {
  const { t } = useTranslation()
  const summary = template.overview?.[0] ?? template.description
  const words = template.name.split('-').slice(0, 2)

  return (
    <Card
      variant="surface"
      className="relative flex flex-col transition-shadow duration-200 hover:shadow-lg hover:shadow-primary/[0.06]"
    >
      {/* Mini banner */}
      <div className="relative h-28 overflow-hidden rounded-t-[inherit] border-b border-border-subtle bg-gradient-to-br from-primary/20 via-bg-secondary to-transparent">
        <div className="absolute inset-0 flex flex-col items-start justify-center gap-0.5 px-4 overflow-hidden">
          {words.map((word, i) => (
            <span
              key={`${word}-${i}`}
              className="font-black tracking-tighter leading-none select-none text-primary"
              style={{ fontSize: i === 0 ? '2rem' : '1.2rem', opacity: 1 - i * 0.25 }}
            >
              {word.toUpperCase()}
            </span>
          ))}
        </div>
        {template.featured && (
          <div className="absolute left-3 top-3">
            <Badge variant="info" size="sm">
              <Sparkles size={10} />
              {t('store.featured')}
            </Badge>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="neutral" size="sm">
            {template.category}
          </Badge>
        </div>
        <p className="line-clamp-1 text-[15px] font-extrabold tracking-[-0.02em] text-text-primary">
          {template.name}
        </p>
        <p className="line-clamp-2 text-xs leading-5 text-text-secondary">{summary}</p>
        <div className="mt-auto flex items-center gap-2 pt-2">
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            disabled={forking}
            onClick={() => onFork(template.name)}
          >
            <Download size={13} className="mr-1.5" />
            {forking ? t('community.forking') : t('community.forkToLocal')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function CommunityPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const [forkingName, setForkingName] = useState<string | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['community-settings'],
    queryFn: api.community.getSettings,
  })

  const {
    data: catalogData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['community-templates'],
    queryFn: () => api.community.catalog('zh-CN'),
    retry: 1,
  })

  const templates = catalogData?.templates

  const forkMutation = useMutation({
    mutationFn: (name: string) => api.myTemplates.fork(name),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      toast.success(t('community.forkSuccess', { name: result.name }))
      setForkingName(null)
    },
    onError: () => {
      toast.error(t('community.forkError'))
      setForkingName(null)
    },
  })

  const handleFork = (name: string) => {
    setForkingName(name)
    forkMutation.mutate(name)
  }

  const filtered = useMemo(() => {
    if (!templates) return []
    const q = debouncedQuery.toLowerCase()
    if (!q) return templates
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    )
  }, [templates, debouncedQuery])

  return (
    <PageShell
      breadcrumb={[{ label: t('nav.community') }]}
      title={t('community.title')}
      description={t('community.description')}
    >
      {/* Header bar */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <Search
          value={query}
          onChange={(val) => setQuery(val)}
          placeholder={t('community.searchPlaceholder')}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          {settings?.baseUrl && (
            <a
              href={settings.baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-secondary/60 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              <Globe size={12} />
              {settings.baseUrl.replace(/^https?:\/\//, '')}
              <ExternalLink size={10} />
            </a>
          )}
          <Button variant="secondary" size="sm" onClick={() => void refetch()} disabled={isLoading}>
            <RefreshCw size={13} className={cn('mr-1.5', isLoading && 'animate-spin')} />
            {t('common.refresh')}
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/settings">
              <Settings size={13} className="mr-1.5" />
              {t('community.configure')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Content */}
      {isError && (
        <GlassCard className="flex flex-col items-center gap-4 py-16 text-center">
          <AlertCircle size={40} className="text-text-muted" />
          <div>
            <p className="text-sm font-semibold text-text-primary">{t('community.errorTitle')}</p>
            <p className="mt-1 text-xs text-text-muted">{t('community.errorHint')}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </GlassCard>
      )}

      {!isError && isLoading && (
        <div className="py-16 text-center text-sm text-text-muted">{t('common.loading')}</div>
      )}

      {!isError && !isLoading && filtered.length === 0 && (
        <EmptyState
          icon={Package}
          title={t('community.noTemplates')}
          description={t('community.noTemplatesHint')}
        />
      )}

      {!isError && !isLoading && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((tpl) => (
            <CommunityCard
              key={tpl.name}
              template={tpl}
              onFork={handleFork}
              forking={forkingName === tpl.name}
            />
          ))}
        </div>
      )}
    </PageShell>
  )
}
