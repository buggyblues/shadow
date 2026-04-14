import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Clock3,
  Copy,
  Edit3,
  FolderOpen,
  GitBranch,
  GitFork,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/Badge'
import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { SearchInput } from '@/components/SearchInput'
import { parseTemplateAgents } from '@/components/TemplateDetailShared'
import { useDebounce } from '@/hooks/useDebounce'
import { api, type TemplateCatalogSummary } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/stores/toast'

function getMyTemplateOverview(content: unknown) {
  const agents = parseTemplateAgents(content)
  const data = content && typeof content === 'object' ? (content as Record<string, unknown>) : {}
  const deployments =
    data.deployments && typeof data.deployments === 'object'
      ? (data.deployments as Record<string, unknown>)
      : undefined

  const namespace =
    typeof deployments?.namespace === 'string'
      ? deployments.namespace
      : typeof data.namespace === 'string'
        ? data.namespace
        : null

  const providers = Array.isArray(data.providers)
    ? data.providers
    : Array.isArray(deployments?.providers)
      ? deployments.providers
      : []

  const models = data.models && typeof data.models === 'object' ? Object.keys(data.models) : []

  return {
    agentCount: agents.length,
    providerCount: providers.length > 0 ? providers.length : models.length,
    namespace,
    agentHighlights: agents
      .map((agent) => agent.identity?.name ?? agent.name)
      .filter(Boolean)
      .slice(0, 3),
  }
}

type TemplateSourceFilter = 'all' | 'store' | 'git' | 'custom'

function getTemplateSourceType(templateSlug: string | null): Exclude<TemplateSourceFilter, 'all'> {
  if (templateSlug?.startsWith('git:')) return 'git'
  if (templateSlug) return 'store'
  return 'custom'
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all',
        active ? 'nf-glow' : 'hover:-translate-y-0.5',
      )}
      style={{
        background: active ? 'var(--nf-sidebar-active)' : 'var(--nf-bg-glass-2)',
        borderColor: active ? 'rgba(0, 243, 255, 0.25)' : 'var(--nf-border)',
        color: active ? 'var(--color-nf-cyan)' : 'var(--nf-text-mid)',
      }}
    >
      <span>{label}</span>
      <span
        className="rounded-full px-2 py-0.5 text-[11px]"
        style={{
          background: active ? 'rgba(0, 243, 255, 0.12)' : 'var(--nf-bg-raised)',
          color: active ? 'var(--color-nf-cyan)' : 'var(--nf-text-muted)',
        }}
      >
        {count}
      </span>
    </button>
  )
}

function LibraryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="nf-stat-chip min-w-[170px]">
      <div className="text-xs font-semibold" style={{ color: 'var(--nf-text-muted)' }}>
        {label}
      </div>
      <div className="text-2xl font-black tracking-tight" style={{ color: 'var(--nf-text-high)' }}>
        {value}
      </div>
    </div>
  )
}

function TemplateCard({
  name,
  slug,
  templateSlug,
  content,
  baseTemplate,
  version,
  updatedAt,
  onDelete,
  onShare,
}: {
  name: string
  slug: string
  templateSlug: string | null
  content: unknown
  baseTemplate?: TemplateCatalogSummary
  version: number
  updatedAt: string
  onDelete: () => void
  onShare: () => void
}) {
  const { t, i18n } = useTranslation()
  const overview = useMemo(() => getMyTemplateOverview(content), [content])
  const sourceType = getTemplateSourceType(templateSlug)
  const sourceLabel = t(`templates.filters.${sourceType}`)
  const summaryText =
    baseTemplate?.overview[0] ?? baseTemplate?.description ?? t('templateDetail.customDescription')
  const primaryHighlight =
    (baseTemplate?.highlights[0] ?? overview.agentHighlights.join(' · ')) || summaryText
  const displayEmoji =
    baseTemplate?.emoji ?? (sourceType === 'git' ? '🌿' : sourceType === 'store' ? '🛍️' : '✨')

  return (
    <article className="nf-card nf-bouncy group !p-6 space-y-5">
      <div className="flex items-start gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border text-3xl"
          style={{
            background:
              sourceType === 'store'
                ? 'rgba(0, 243, 255, 0.08)'
                : sourceType === 'git'
                  ? 'rgba(0, 230, 118, 0.08)'
                  : 'rgba(124, 77, 255, 0.08)',
            borderColor: 'var(--nf-border)',
          }}
        >
          {displayEmoji}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/my-templates/$name"
              params={{ name }}
              className="text-lg font-black truncate hover:opacity-85 transition-opacity"
              style={{ color: 'var(--nf-text-high)' }}
            >
              {name}
            </Link>
            <Badge variant="outline" size="sm">
              v{version}
            </Badge>
            <Badge
              variant={
                sourceType === 'store' ? 'info' : sourceType === 'git' ? 'success' : 'outline'
              }
              size="sm"
            >
              {sourceLabel}
            </Badge>
            {baseTemplate?.featured && (
              <Badge variant="info" size="sm" icon={<Sparkles size={10} />}>
                {t('store.featured')}
              </Badge>
            )}
          </div>

          {templateSlug && (
            <div
              className="text-xs flex items-center gap-1.5 flex-wrap"
              style={{ color: 'var(--nf-text-muted)' }}
            >
              <GitFork size={11} />
              <span>{t('templateDetail.forkedFrom')}</span>
              {sourceType === 'store' ? (
                <Link
                  to="/store/$name"
                  params={{ name: templateSlug }}
                  className="hover:opacity-85 transition-opacity"
                  style={{ color: 'var(--nf-text-high)' }}
                >
                  {templateSlug}
                </Link>
              ) : (
                <span>{templateSlug}</span>
              )}
            </div>
          )}

          <p className="text-sm leading-7 line-clamp-2" style={{ color: 'var(--nf-text-mid)' }}>
            {summaryText}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onShare}
            className="rounded-full border p-2 transition-colors text-gray-500 hover:text-green-400"
            style={{ borderColor: 'var(--nf-border)' }}
            title={t('common.share')}
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full border p-2 transition-colors text-gray-500 hover:text-red-400"
            style={{ borderColor: 'var(--nf-border)' }}
            title={t('common.delete')}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div
        className="rounded-[24px] border px-4 py-3 text-sm leading-6"
        style={{
          background: 'var(--nf-bg-glass-2)',
          borderColor: 'var(--nf-border)',
          color: 'var(--nf-text-high)',
        }}
      >
        {primaryHighlight}
      </div>

      <div className="flex flex-wrap gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
          style={{
            background: 'var(--nf-bg-raised)',
            borderColor: 'var(--nf-border)',
            color: 'var(--nf-text-mid)',
          }}
        >
          <Users size={11} />
          {t('deploy.agentsLabel')}: {overview.agentCount}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
          style={{
            background: 'var(--nf-bg-raised)',
            borderColor: 'var(--nf-border)',
            color: 'var(--nf-text-mid)',
          }}
        >
          <Sparkles size={11} />
          {t('templateDetail.providers')}: {overview.providerCount}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
          style={{
            background: 'var(--nf-bg-raised)',
            borderColor: 'var(--nf-border)',
            color: 'var(--nf-text-mid)',
          }}
        >
          <FolderOpen size={11} />
          {overview.namespace ?? t('common.none')}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
          style={{
            background: 'var(--nf-bg-raised)',
            borderColor: 'var(--nf-border)',
            color: 'var(--nf-text-mid)',
          }}
        >
          <Clock3 size={11} />
          {new Date(updatedAt).toLocaleDateString(i18n.language)}
        </span>
      </div>

      <div className="flex gap-2">
        <Link
          to="/my-templates/$name"
          params={{ name }}
          className="nf-soft-button flex-1 justify-center text-sm"
        >
          <Edit3 size={14} />
          <span>{t('templates.openEditor')}</span>
        </Link>
        <Link
          to="/store/$name/deploy"
          params={{ name: slug }}
          className="nf-pill nf-pill-cyan flex-1 justify-center text-sm"
        >
          <Sparkles size={14} />
          <span>{t('templates.deployNow')}</span>
        </Link>
      </div>
    </article>
  )
}

function ForkDialog({
  onFork,
  onClose,
}: {
  onFork: (sourceTemplate: string, newName: string) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { data: templates } = useQuery({
    queryKey: ['templates', i18n.language],
    queryFn: () => api.templates.listByLocale(i18n.language),
  })
  const [selected, setSelected] = useState('')
  const [newName, setNewName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filteredTemplates = useMemo(() => {
    if (!templates) return []
    if (!searchQuery) return templates
    const q = searchQuery.toLowerCase()
    return templates.filter(
      (template) =>
        template.name.toLowerCase().includes(q) || template.description?.toLowerCase().includes(q),
    )
  }, [templates, searchQuery])

  useEffect(() => {
    if (selected && !newName) {
      setNewName(`my-${selected}`)
    }
  }, [selected, newName])

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg mx-4 space-y-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <GitFork size={18} className="text-blue-400" />
          {t('templates.forkTemplate')}
        </h3>
        <p className="text-sm text-gray-500">{t('templates.chooseStoreTemplate')}</p>

        <div ref={dropdownRef} className="relative">
          <label className="text-xs text-gray-400 mb-1.5 block">
            {t('templates.sourceTemplate')}
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={selected ? selected : searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setSelected('')
                setNewName('')
                setDropdownOpen(true)
              }}
              onFocus={() => setDropdownOpen(true)}
              placeholder={t('templates.searchPlaceholder')}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          {dropdownOpen && filteredTemplates.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-gray-950 border border-gray-700 rounded-lg max-h-48 overflow-y-auto shadow-xl">
              {filteredTemplates.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  onClick={() => {
                    setSelected(template.name)
                    setSearchQuery('')
                    setNewName(`my-${template.name}`)
                    setDropdownOpen(false)
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-gray-800 transition-colors flex items-center justify-between',
                    selected === template.name && 'bg-blue-900/30 text-blue-400',
                  )}
                >
                  <span className="truncate">{template.name}</span>
                  <span className="text-xs text-gray-600 ml-2 shrink-0">
                    {t('store.agentCount', { count: template.agentCount })}
                  </span>
                </button>
              ))}
            </div>
          )}
          {dropdownOpen && searchQuery && filteredTemplates.length === 0 && (
            <div className="absolute z-10 w-full mt-1 bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs text-gray-500 text-center">
              {t('templates.noTemplatesMatch', { query: searchQuery })}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">
            {t('templates.newTemplateName')}
          </label>
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t('templates.templateNamePlaceholder')}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (selected && newName.trim()) onFork(selected, newName.trim())
            }}
            disabled={!selected || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            <GitFork size={14} />
            {t('common.fork')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ImportGitDialog({
  onImport,
  onClose,
  isPending,
}: {
  onImport: (url: string, name?: string, path?: string, branch?: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [branch, setBranch] = useState('')
  const [path, setPath] = useState('')

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg mx-4 space-y-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <GitBranch size={18} className="text-green-400" />
          {t('templates.importFromGit')}
        </h3>
        <p className="text-sm text-gray-500">{t('templates.cloneGitRepository')}</p>

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">
            {t('templates.repositoryUrl')} *
          </label>
          <input
            type="text"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://github.com/org/repo.git"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">
              {t('templates.templateName')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('templates.autoDetectFromRepo')}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">{t('templates.branch')}</label>
            <input
              type="text"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder={t('templates.defaultBranch')}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">
            {t('templates.configFilePath')}
          </label>
          <input
            type="text"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="auto-detect (shadowob.json, *.template.json)"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (url.trim()) {
                onImport(
                  url.trim(),
                  name.trim() || undefined,
                  path.trim() || undefined,
                  branch.trim() || undefined,
                )
              }
            }}
            disabled={!url.trim() || isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
            {isPending ? t('templates.cloning') : t('templates.importAction')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function MyTemplatesPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showForkDialog, setShowForkDialog] = useState(false)
  const [showGitImport, setShowGitImport] = useState(false)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<TemplateSourceFilter>('all')
  const debouncedSearch = useDebounce(search)

  const { data: myTemplates, isLoading } = useQuery({
    queryKey: ['my-templates'],
    queryFn: api.myTemplates.list,
  })

  const { data: catalogData } = useQuery({
    queryKey: ['template-catalog', i18n.language],
    queryFn: () => api.templates.catalog(i18n.language),
  })

  const forkMutation = useMutation({
    mutationFn: ({ source, name }: { source: string; name: string }) =>
      api.myTemplates.fork(source, name),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      setShowForkDialog(false)
      navigate({ to: '/my-templates/$name', params: { name: data.name } })
      toast.success(`${t('templates.forkedAs')} "${data.name}"`)
    },
    onError: (err) => toast.error(t('templates.forkFailed', { message: err.message })),
  })

  const gitImportMutation = useMutation({
    mutationFn: (args: { url: string; name?: string; path?: string; branch?: string }) =>
      api.myTemplates.importGit(args),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      setShowGitImport(false)
      navigate({ to: '/my-templates/$name', params: { name: data.name } })
      toast.success(`${t('templates.importedFromGit')} "${data.name}"`)
    },
    onError: (err) => toast.error(t('templates.importFailed', { message: err.message })),
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.myTemplates.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      toast.success(t('templates.templateDeleted'))
    },
    onError: () => toast.error(t('templates.deleteFailed')),
  })

  const templates = myTemplates ?? []
  const catalogByName = useMemo(
    () => new Map((catalogData?.templates ?? []).map((template) => [template.name, template])),
    [catalogData?.templates],
  )

  const sortedTemplates = useMemo(() => {
    return [...templates].sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
  }, [templates])

  const sourceCounts = useMemo(() => {
    const counts: Record<TemplateSourceFilter, number> = {
      all: sortedTemplates.length,
      store: 0,
      git: 0,
      custom: 0,
    }

    for (const template of sortedTemplates) {
      counts[getTemplateSourceType(template.templateSlug)] += 1
    }

    return counts
  }, [sortedTemplates])

  const filteredTemplates = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase()

    return sortedTemplates.filter((template) => {
      const sourceType = getTemplateSourceType(template.templateSlug)
      if (activeFilter !== 'all' && sourceType !== activeFilter) return false

      if (!query) return true

      const baseTemplate = template.templateSlug
        ? catalogByName.get(template.templateSlug)
        : undefined
      const overview = getMyTemplateOverview(template.content)
      const haystack = [
        template.name,
        template.templateSlug ?? '',
        baseTemplate?.description ?? '',
        baseTemplate?.overview.join(' ') ?? '',
        overview.namespace ?? '',
        overview.agentHighlights.join(' '),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [activeFilter, catalogByName, debouncedSearch, sortedTemplates])

  const recentTemplates = sortedTemplates.slice(0, 4)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <Breadcrumb items={[{ label: t('templates.title') }]} className="mb-1" />

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="nf-card relative overflow-hidden !p-8">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 0% 0%, rgba(124,77,255,0.14), transparent 36%), radial-gradient(circle at 100% 0%, rgba(0,243,255,0.16), transparent 34%)',
            }}
          />

          <div className="relative space-y-6">
            <div className="flex items-center gap-2">
              <Copy size={16} style={{ color: 'var(--color-nf-cyan)' }} />
              <span className="nf-kicker">{t('templates.title')}</span>
            </div>

            <div className="space-y-3 max-w-3xl">
              <h1 className="nf-title">{t('templates.title')}</h1>
              <p className="nf-subtitle">{t('templates.description')}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <LibraryStat label={t('templates.stats.saved')} value={sourceCounts.all} />
              <LibraryStat label={t('templates.stats.storeForks')} value={sourceCounts.store} />
              <LibraryStat label={t('templates.stats.gitImports')} value={sourceCounts.git} />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowForkDialog(true)}
                className="nf-pill nf-pill-cyan text-sm"
              >
                <GitFork size={14} />
                <span>{t('templates.forkFromStore')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowGitImport(true)}
                className="nf-soft-button text-sm"
              >
                <GitBranch size={14} />
                <span>{t('templates.importGit')}</span>
              </button>
            </div>
          </div>
        </div>

        <aside className="nf-card !p-6 space-y-4">
          <div>
            <span className="nf-kicker">{t('templates.recentlyUpdated')}</span>
            <h2 className="mt-2 text-2xl font-black" style={{ color: 'var(--nf-text-high)' }}>
              {t('templates.recentlyUpdated')}
            </h2>
            <p className="mt-2 text-sm leading-7" style={{ color: 'var(--nf-text-mid)' }}>
              {t('templates.recentlyUpdatedDescription')}
            </p>
          </div>

          {recentTemplates.length > 0 ? (
            <div className="space-y-3">
              {recentTemplates.map((template) => (
                <Link
                  key={template.slug}
                  to="/my-templates/$name"
                  params={{ name: template.name }}
                  className="block rounded-[24px] border px-4 py-4 transition-colors hover:bg-white/5"
                  style={{
                    background: 'var(--nf-bg-glass-2)',
                    borderColor: 'var(--nf-border)',
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="text-sm font-black truncate"
                        style={{ color: 'var(--nf-text-high)' }}
                      >
                        {template.name}
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: 'var(--nf-text-muted)' }}>
                        {t(`templates.filters.${getTemplateSourceType(template.templateSlug)}`)}
                      </p>
                    </div>
                    <Badge variant="outline" size="sm">
                      v{template.version ?? 1}
                    </Badge>
                  </div>
                  <div
                    className="mt-3 inline-flex items-center gap-1.5 text-[11px]"
                    style={{ color: 'var(--nf-text-muted)' }}
                  >
                    <Clock3 size={11} />
                    {new Date(template.updatedAt).toLocaleString(i18n.language)}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div
              className="rounded-[24px] border px-4 py-10 text-center"
              style={{ borderColor: 'var(--nf-border)' }}
            >
              <p className="text-sm" style={{ color: 'var(--nf-text-muted)' }}>
                {t('templates.noCustomTemplates')}
              </p>
            </div>
          )}
        </aside>
      </section>

      <section className="space-y-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('templates.searchSavedPlaceholder')}
          size="lg"
          className="max-w-2xl"
        />

        <div className="flex flex-wrap gap-3">
          {(
            [
              ['all', t('templates.filters.all')],
              ['store', t('templates.filters.store')],
              ['git', t('templates.filters.git')],
              ['custom', t('templates.filters.custom')],
            ] as Array<[TemplateSourceFilter, string]>
          ).map(([key, label]) => (
            <FilterPill
              key={key}
              label={label}
              count={sourceCounts[key]}
              active={activeFilter === key}
              onClick={() => setActiveFilter(key)}
            />
          ))}
        </div>
      </section>

      {isLoading && (
        <div className="py-12 text-center text-sm text-gray-500">
          {t('templates.loadingTemplates')}
        </div>
      )}

      {!isLoading && templates.length === 0 && (
        <EmptyState
          icon={<Copy size={40} />}
          title={t('templates.noCustomTemplates')}
          description={t('templates.forkTemplateStart')}
          action={
            <button
              type="button"
              onClick={() => setShowForkDialog(true)}
              className="nf-pill nf-pill-cyan text-sm"
            >
              <GitFork size={14} />
              {t('templates.forkTemplate')}
            </button>
          }
        />
      )}

      {!isLoading && templates.length > 0 && filteredTemplates.length === 0 && (
        <EmptyState
          icon={<Search size={40} />}
          title={t('templates.noTemplatesMatch', {
            query: debouncedSearch || t('templates.title'),
          })}
          description={t('templates.emptyFiltered')}
          action={
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setActiveFilter('all')
              }}
              className="nf-pill nf-pill-cyan text-sm"
            >
              {t('templates.clearFilters')}
            </button>
          }
        />
      )}

      {!isLoading && filteredTemplates.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.slug}
              name={template.name}
              slug={template.slug}
              templateSlug={template.templateSlug}
              content={template.content}
              baseTemplate={
                template.templateSlug ? catalogByName.get(template.templateSlug) : undefined
              }
              version={template.version ?? 1}
              updatedAt={template.updatedAt}
              onShare={async () => {
                try {
                  const shareData = await api.myTemplates.share(template.name)
                  const json = JSON.stringify(shareData, null, 2)
                  await navigator.clipboard.writeText(json)
                  toast.success(t('templates.shareCopied'))
                } catch {
                  toast.error(t('templates.shareFailed'))
                }
              }}
              onDelete={() => {
                if (window.confirm(t('templates.deleteConfirm', { name: template.name }))) {
                  deleteMutation.mutate(template.name)
                }
              }}
            />
          ))}
        </div>
      )}

      {showForkDialog && (
        <ForkDialog
          onFork={(source, name) => forkMutation.mutate({ source, name })}
          onClose={() => setShowForkDialog(false)}
        />
      )}

      {showGitImport && (
        <ImportGitDialog
          onImport={(url, name, path, branch) =>
            gitImportMutation.mutate({ url, name, path, branch })
          }
          onClose={() => setShowGitImport(false)}
          isPending={gitImportMutation.isPending}
        />
      )}
    </div>
  )
}
