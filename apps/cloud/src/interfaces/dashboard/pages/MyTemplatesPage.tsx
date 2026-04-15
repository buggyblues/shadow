import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Search as SearchField,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Copy,
  Edit3,
  GitBranch,
  GitFork,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/PageShell'
import { parseTemplateAgents } from '@/components/TemplateDetailShared'
import { useDebounce } from '@/hooks/useDebounce'
import { useTypewriterPlaceholder } from '@/hooks/useTypewriterPlaceholder'
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
    <Button type="button" onClick={onClick} variant="ghost" size="sm">
      <span className="truncate">{label}</span>
      <span
        className={cn(
          'rounded-xl px-2 py-0.5 text-[11px]',
          active ? 'bg-primary/15 text-primary' : 'bg-bg-tertiary/80 text-text-muted',
        )}
      >
        {count}
      </span>
    </Button>
  )
}

function CardMetric({
  icon,
  value,
  label,
}: {
  icon: ReactNode
  value: string | number
  label: string
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-primary/60 px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary"
      title={label}
    >
      {icon}
      <span>{value}</span>
    </span>
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
  const summaryText =
    baseTemplate?.overview[0] ?? baseTemplate?.description ?? t('templateDetail.customDescription')
  const displayEmoji =
    baseTemplate?.emoji ?? (sourceType === 'git' ? '🌿' : sourceType === 'store' ? '🛍️' : '✨')
  const updatedLabel = new Date(updatedAt).toLocaleDateString(i18n.language, {
    month: 'short',
    day: 'numeric',
  })

  return (
    <Card variant="surface">
      <div className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-bg-primary/50 text-[28px] shadow-sm">
            {displayEmoji}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to="/my-templates/$name"
                    params={{ name }}
                    className="truncate text-[17px] font-extrabold tracking-[-0.02em] text-text-primary transition-colors hover:text-primary"
                  >
                    {name}
                  </Link>
                  <Badge variant="neutral" size="sm">
                    v{version}
                  </Badge>
                  <Badge
                    variant={
                      sourceType === 'store' ? 'info' : sourceType === 'git' ? 'success' : 'neutral'
                    }
                    size="sm"
                  >
                    {t(`templates.filters.${sourceType}`)}
                  </Badge>
                  {baseTemplate?.featured && (
                    <Badge variant="info" size="sm">
                      <Sparkles size={10} />
                      {t('store.featured')}
                    </Badge>
                  )}
                </div>

                <p className="line-clamp-2 text-sm leading-6 text-text-secondary">{summaryText}</p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={onShare}
                  variant="ghost"
                  size="icon"
                  title={t('common.share')}
                >
                  <Copy size={14} />
                </Button>
                <Button
                  type="button"
                  onClick={onDelete}
                  variant="ghost"
                  size="icon"
                  title={t('common.delete')}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
              {templateSlug &&
                (sourceType === 'store' ? (
                  <Link
                    to="/store/$name"
                    params={{ name: templateSlug }}
                    className="rounded-xl border border-border-subtle px-2.5 py-1 transition-colors hover:text-text-primary"
                  >
                    {templateSlug}
                  </Link>
                ) : (
                  <span className="rounded-xl border border-border-subtle px-2.5 py-1">
                    {templateSlug}
                  </span>
                ))}

              {overview.namespace && (
                <span className="rounded-xl border border-border-subtle px-2.5 py-1">
                  {overview.namespace}
                </span>
              )}

              <span className="rounded-xl border border-border-subtle px-2.5 py-1">
                {updatedLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <CardMetric
            icon={<Users size={11} className="text-primary" />}
            value={overview.agentCount}
            label={t('deploy.agentsLabel')}
          />
          <CardMetric
            icon={<Sparkles size={11} className="text-primary" />}
            value={overview.providerCount}
            label={t('templateDetail.providers')}
          />
          <CardMetric
            icon={<Copy size={11} className="text-primary" />}
            value={`v${version}`}
            label={t('templateDetail.version')}
          />
        </div>

        <div className="mt-auto flex flex-col items-stretch gap-2 border-t border-border-subtle pt-4 sm:flex-row">
          <Button asChild variant="secondary">
            <Link to="/my-templates/$name" params={{ name }}>
              <Edit3 size={14} />
              <span className="truncate">{t('templates.openEditor')}</span>
            </Link>
          </Button>
          <Button asChild variant="primary">
            <Link to="/store/$name/deploy" params={{ name: slug }}>
              <Sparkles size={14} />
              <span className="truncate">{t('templates.deployNow')}</span>
            </Link>
          </Button>
        </div>
      </div>
    </Card>
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
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-lg">
        <ModalHeader
          overline={t('templates.forkTemplate')}
          icon={<GitFork size={18} className="text-primary" />}
          title={t('templates.forkTemplate')}
          subtitle={t('templates.chooseStoreTemplate')}
        />

        <ModalBody>
          <div ref={dropdownRef} className="relative">
            <Input
              type="text"
              label={t('templates.sourceTemplate')}
              icon={Search}
              value={selected || searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setSelected('')
                setNewName('')
                setDropdownOpen(true)
              }}
              onFocus={() => setDropdownOpen(true)}
              placeholder={t('templates.searchPlaceholder')}
            />

            {dropdownOpen && filteredTemplates.length > 0 && (
              <div
                className="absolute z-10 mt-2 max-h-52 w-full overflow-y-auto rounded-[22px] border"
                style={{ boxShadow: 'var(--shadow-soft)' }}
              >
                {filteredTemplates.map((template) => {
                  const active = selected === template.name

                  return (
                    <Button
                      key={template.name}
                      type="button"
                      onClick={() => {
                        setSelected(template.name)
                        setSearchQuery('')
                        setNewName(`my-${template.name}`)
                        setDropdownOpen(false)
                      }}
                      variant="ghost"
                      size="sm"
                      style={{ background: active ? 'rgba(0, 209, 255, 0.08)' : 'transparent' }}
                    >
                      <span
                        className={cn(
                          'truncate font-semibold',
                          active ? 'text-text-primary' : 'text-text-secondary',
                        )}
                      >
                        {template.name}
                      </span>
                      <span className="ml-2 shrink-0 text-xs text-text-muted">
                        {t('store.agentCount', { count: template.agentCount })}
                      </span>
                    </Button>
                  )
                })}
              </div>
            )}

            {dropdownOpen && searchQuery && filteredTemplates.length === 0 && (
              <div
                className="absolute z-10 mt-2 w-full rounded-[22px] border px-4 py-3 text-center text-xs"
                style={{ boxShadow: 'var(--shadow-soft)' }}
              >
                {t('templates.noTemplatesMatch', { query: searchQuery })}
              </div>
            )}
          </div>

          <Input
            type="text"
            label={t('templates.newTemplateName')}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t('templates.templateNamePlaceholder')}
          />
        </ModalBody>

        <ModalFooter>
          <ModalButtonGroup>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                if (selected && newName.trim()) onFork(selected, newName.trim())
              }}
              disabled={!selected || !newName.trim()}
            >
              <GitFork size={14} />
              {t('common.fork')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
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
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-lg">
        <ModalHeader
          overline={t('templates.importFromGit')}
          icon={<GitBranch size={18} className="text-success" />}
          title={t('templates.importFromGit')}
          subtitle={t('templates.cloneGitRepository')}
        />

        <ModalBody>
          <Input
            type="text"
            label={`${t('templates.repositoryUrl')} *`}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://github.com/org/repo.git"
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              type="text"
              label={t('templates.templateName')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('templates.autoDetectFromRepo')}
            />
            <Input
              type="text"
              label={t('templates.branch')}
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder={t('templates.defaultBranch')}
            />
          </div>

          <Input
            type="text"
            label={t('templates.configFilePath')}
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="auto-detect (shadowob.json, *.template.json)"
          />
        </ModalBody>

        <ModalFooter>
          <ModalButtonGroup>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
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
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
              {isPending ? t('templates.cloning') : t('templates.importAction')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export function MyTemplatesPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showForkDialog, setShowForkDialog] = useState(false)
  const [showGitImport, setShowGitImport] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<TemplateSourceFilter>('all')
  const debouncedSearch = useDebounce(search)
  const typewriterPlaceholder = useTypewriterPlaceholder(
    t('templates.typewriterPhrases', { returnObjects: true }) as string[],
  )

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

  return (
    <PageShell
      breadcrumb={[{ label: t('templates.title') }]}
      title={t('templates.title')}
      headerContent={
        <div className="space-y-3">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={typewriterPlaceholder || t('templates.searchSavedPlaceholder')}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
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
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setShowForkDialog(true)}
              >
                <GitFork size={14} />
                <span className="truncate">{t('templates.forkFromStore')}</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowGitImport(true)}
              >
                <GitBranch size={14} />
                <span className="truncate">{t('templates.importGit')}</span>
              </Button>
            </div>
          </div>
          <p className="text-sm text-text-muted">
            {t('store.matchingTemplates', { count: filteredTemplates.length })}
            {activeFilter !== 'all' ? ` · ${t(`templates.filters.${activeFilter}`)}` : ''}
            {debouncedSearch ? ` · ${t('store.matchingQuery', { query: debouncedSearch })}` : ''}
          </p>
        </div>
      }
    >
      {isLoading && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`template-skeleton-${index}`}
              className="h-[248px] rounded-3xl border border-border-subtle bg-bg-secondary/60 p-5 animate-pulse"
            />
          ))}
        </div>
      )}

      {!isLoading && templates.length === 0 && (
        <EmptyState
          icon={Copy}
          title={t('templates.noCustomTemplates')}
          description={t('templates.forkTemplateStart')}
          action={
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setShowForkDialog(true)}
            >
              <GitFork size={14} />
              {t('templates.forkTemplate')}
            </Button>
          }
        />
      )}

      {!isLoading && templates.length > 0 && filteredTemplates.length === 0 && (
        <EmptyState
          icon={Search}
          title={t('templates.noTemplatesMatch', {
            query: debouncedSearch || t('templates.title'),
          })}
          description={t('templates.emptyFiltered')}
          action={
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                setSearch('')
                setActiveFilter('all')
              }}
            >
              {t('templates.clearFilters')}
            </Button>
          }
        />
      )}

      {!isLoading && filteredTemplates.length > 0 && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
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
                setTemplateToDelete(template.name)
              }}
            />
          ))}
        </div>
      )}

      <AlertDialog
        open={Boolean(templateToDelete)}
        onOpenChange={(open) => {
          if (!open) setTemplateToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {templateToDelete ? t('templates.deleteConfirm', { name: templateToDelete }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="danger"
                loading={deleteMutation.isPending}
                onClick={() => {
                  if (templateToDelete) {
                    deleteMutation.mutate(templateToDelete)
                  }
                  setTemplateToDelete(null)
                }}
              >
                {t('common.delete')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </PageShell>
  )
}
