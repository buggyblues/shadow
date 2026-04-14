import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Clock,
  Copy,
  Cpu,
  Edit3,
  FolderOpen,
  GitBranch,
  GitFork,
  Layers,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/Badge'
import { parseTemplateAgents } from '@/components/TemplateDetailShared'
import { api, type TemplateCatalogSummary } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/stores/toast'

// ── Template List ─────────────────────────────────────────────────────────────

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
  const plugins = Array.isArray(data.plugins) ? data.plugins : []

  return {
    agentCount: agents.length,
    providerCount: providers.length > 0 ? providers.length : models.length,
    pluginCount: plugins.length,
    namespace,
    agentHighlights: agents
      .map((agent) => agent.identity?.name ?? agent.name)
      .filter(Boolean)
      .slice(0, 3),
  }
}

function TemplateCard({
  name,
  slug,
  templateSlug,
  content,
  baseTemplate,
  version,
  updatedAt,
  onEdit,
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
  onEdit: () => void
  onDelete: () => void
  onShare: () => void
}) {
  const { t, i18n } = useTranslation()
  const overview = useMemo(() => getMyTemplateOverview(content), [content])
  const summaryText =
    baseTemplate?.overview[0] ?? baseTemplate?.description ?? t('templateDetail.customDescription')
  const highlightChips = baseTemplate?.features.slice(0, 2) ?? overview.agentHighlights.slice(0, 2)
  const isStoreTemplate = Boolean(templateSlug && !templateSlug.startsWith('git:'))

  return (
    <div className="nf-card nf-bouncy group !p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/my-templates/$name"
              params={{ name }}
              className="text-base font-black truncate hover:opacity-85 transition-opacity"
              style={{ color: 'var(--nf-text-high)' }}
            >
              {name}
            </Link>
            <Badge variant="outline" size="sm">
              v{version}
            </Badge>
            {baseTemplate?.featured && (
              <Badge variant="info" size="sm" icon={<Sparkles size={10} />}>
                {t('store.featured')}
              </Badge>
            )}
          </div>

          {templateSlug && (
            <div className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
              <GitFork size={11} />
              <span>{t('templateDetail.forkedFrom')}</span>
              {isStoreTemplate ? (
                <Link
                  to="/store/$name"
                  params={{ name: templateSlug }}
                  className="hover:text-blue-300 transition-colors"
                >
                  {templateSlug}
                </Link>
              ) : (
                <span>{templateSlug}</span>
              )}
            </div>
          )}

          <p className="text-sm leading-6 line-clamp-2" style={{ color: 'var(--nf-text-mid)' }}>
            {summaryText}
          </p>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            onClick={onShare}
            className="p-1.5 text-gray-500 hover:text-green-400 hover:bg-gray-800 rounded transition-colors"
            title={t('common.share')}
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors"
            title={t('common.edit')}
          >
            <Edit3 size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
            title={t('common.delete')}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {highlightChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {highlightChips.map((chip) => (
            <span
              key={chip}
              className="px-3 py-1 rounded-full text-[11px] border"
              style={{
                background: 'var(--nf-bg-raised)',
                borderColor: 'var(--nf-border)',
                color: 'var(--nf-text-mid)',
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="nf-glass-2 rounded-2xl p-3">
          <div
            className="text-[11px] mb-1 flex items-center gap-1.5"
            style={{ color: 'var(--nf-text-muted)' }}
          >
            <Users size={11} />
            {t('deploy.agentsLabel')}
          </div>
          <div className="text-sm font-bold" style={{ color: 'var(--nf-text-high)' }}>
            {overview.agentCount}
          </div>
        </div>
        <div className="nf-glass-2 rounded-2xl p-3">
          <div
            className="text-[11px] mb-1 flex items-center gap-1.5"
            style={{ color: 'var(--nf-text-muted)' }}
          >
            <Cpu size={11} />
            {t('templateDetail.providers')}
          </div>
          <div className="text-sm font-bold" style={{ color: 'var(--nf-text-high)' }}>
            {overview.providerCount}
          </div>
        </div>
        <div className="nf-glass-2 rounded-2xl p-3">
          <div
            className="text-[11px] mb-1 flex items-center gap-1.5"
            style={{ color: 'var(--nf-text-muted)' }}
          >
            <Layers size={11} />
            {t('settings.plugins')}
          </div>
          <div className="text-sm font-bold" style={{ color: 'var(--nf-text-high)' }}>
            {overview.pluginCount}
          </div>
        </div>
        <div className="nf-glass-2 rounded-2xl p-3">
          <div
            className="text-[11px] mb-1 flex items-center gap-1.5"
            style={{ color: 'var(--nf-text-muted)' }}
          >
            <FolderOpen size={11} />
            {t('clusters.namespace')}
          </div>
          <div className="text-sm font-bold truncate" style={{ color: 'var(--nf-text-high)' }}>
            {overview.namespace ?? t('common.none')}
          </div>
        </div>
      </div>

      <div
        className="flex items-center justify-between gap-3 text-[11px]"
        style={{ color: 'var(--nf-text-muted)' }}
      >
        <span className="flex items-center gap-1.5">
          <Clock size={11} />
          {new Date(updatedAt).toLocaleString(i18n.language)}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 text-sm rounded-2xl py-2.5 transition-colors"
          style={{
            background: 'var(--nf-bg-raised)',
            color: 'var(--nf-text-mid)',
            border: '1px solid var(--nf-border)',
          }}
        >
          <Edit3 size={11} />
          {t('common.edit')}
        </button>
        <Link
          to="/store/$name/deploy"
          params={{ name: slug }}
          className="flex-1 flex items-center justify-center gap-1.5 text-sm rounded-2xl py-2.5 transition-colors"
          style={{
            color: 'var(--color-nf-cyan)',
            background: 'rgba(0, 243, 255, 0.08)',
            border: '1px solid rgba(0, 243, 255, 0.2)',
          }}
        >
          {t('common.deploy')}
        </Link>
      </div>
    </div>
  )
}

// ── Fork Dialog ───────────────────────────────────────────────────────────────

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
      (t) => t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q),
    )
  }, [templates, searchQuery])

  useEffect(() => {
    if (selected && !newName) {
      setNewName(`my-${selected}`)
    }
  }, [selected, newName])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
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
        onClick={(e) => e.stopPropagation()}
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
              onChange={(e) => {
                setSearchQuery(e.target.value)
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
            onChange={(e) => setNewName(e.target.value)}
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

// ── Import from Git Dialog ────────────────────────────────────────────────────

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
        onClick={(e) => e.stopPropagation()}
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
            onChange={(e) => setUrl(e.target.value)}
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
              onChange={(e) => setName(e.target.value)}
              placeholder={t('templates.autoDetectFromRepo')}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">{t('templates.branch')}</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
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
            onChange={(e) => setPath(e.target.value)}
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
              if (url.trim())
                onImport(
                  url.trim(),
                  name.trim() || undefined,
                  path.trim() || undefined,
                  branch.trim() || undefined,
                )
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export function MyTemplatesPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showForkDialog, setShowForkDialog] = useState(false)
  const [showGitImport, setShowGitImport] = useState(false)

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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Copy size={20} className="text-blue-400" />
            {t('templates.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('templates.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGitImport(true)}
            className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition-colors"
          >
            <GitBranch size={14} />
            {t('templates.importGit')}
          </button>
          <button
            type="button"
            onClick={() => setShowForkDialog(true)}
            className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <GitFork size={14} />
            {t('templates.forkFromStore')}
          </button>
        </div>
      </div>

      {/* Templates grid */}
      {isLoading && (
        <div className="text-center text-gray-500 text-sm py-12">
          {t('templates.loadingTemplates')}
        </div>
      )}

      {!isLoading && templates.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mx-auto">
            <Copy size={28} className="text-gray-600" />
          </div>
          <div>
            <p className="text-sm text-gray-400">{t('templates.noCustomTemplates')}</p>
            <p className="text-xs text-gray-600 mt-1">{t('templates.forkTemplateStart')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowForkDialog(true)}
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded-lg px-4 py-2 transition-colors"
          >
            <GitFork size={14} />
            {t('templates.forkTemplate')}
          </button>
        </div>
      )}

      {templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
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
              onEdit={() =>
                navigate({ to: '/my-templates/$name', params: { name: template.name } })
              }
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

      {/* Fork Dialog */}
      {showForkDialog && (
        <ForkDialog
          onFork={(source, name) => forkMutation.mutate({ source, name })}
          onClose={() => setShowForkDialog(false)}
        />
      )}

      {/* Git Import Dialog */}
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
