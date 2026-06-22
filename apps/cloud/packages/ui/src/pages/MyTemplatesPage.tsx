import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Search as SearchField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  GitFork,
  Github,
  Hash,
  Loader2,
  Plus,
  Rocket,
  Search as SearchIcon,
  ShoppingBag,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DashboardEmptyState } from '@/components/DashboardEmptyState'
import { PageShell } from '@/components/PageShell'
import { parseTemplateAgents } from '@/components/TemplateDetailShared'
import { TemplateGalleryCard } from '@/components/TemplateGalleryCard'
import { useDebounce } from '@/hooks/useDebounce'
import { useTypewriterPlaceholder } from '@/hooks/useTypewriterPlaceholder'
import { type TemplateCatalogSummary } from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
import { cn } from '@/lib/utils'
import { useToast } from '@/stores/toast'

function getMyTemplateOverview(content: unknown) {
  const agents = parseTemplateAgents(content)
  const data = content && typeof content === 'object' ? (content as Record<string, unknown>) : {}

  const namespace = typeof data.namespace === 'string' ? data.namespace : null

  return {
    agentCount: agents.length,
    namespace,
    agentHighlights: agents
      .map((agent) => agent.identity?.name ?? agent.name)
      .filter(Boolean)
      .slice(0, 3),
  }
}

type TemplateSource = 'store' | 'git' | 'custom'

function slugifyTemplateName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63) || 'custom-template'
  )
}

function createMinimalTemplateContent(name: string) {
  const slug = slugifyTemplateName(name)
  const buddyId = `${slug}-buddy`.slice(0, 63)

  return {
    version: '1.0.0',
    name: slug,
    title: name,
    description: '',
    use: [
      { plugin: 'model-provider' },
      {
        plugin: 'shadowob',
        options: {
          servers: [
            {
              id: 'main',
              name,
              slug,
              channels: [{ id: 'general', title: 'General', type: 'text' }],
            },
          ],
          buddies: [{ id: buddyId, name: `${name} Buddy` }],
          bindings: [
            {
              targetId: buddyId,
              targetType: 'buddy',
              servers: ['main'],
              channels: ['general'],
              agentId: buddyId,
              replyPolicy: { mode: 'mentionOnly' },
            },
          ],
        },
      },
    ],
    deployments: {
      namespace: slug,
      agents: [
        {
          id: buddyId,
          runtime: 'openclaw',
          identity: {
            name: `${name} Buddy`,
            systemPrompt: 'You are a helpful Shadow Buddy for this community.',
          },
          configuration: {
            openclaw: {},
          },
        },
      ],
    },
  }
}

function getTemplateSourceType(templateSlug: string | null): TemplateSource {
  if (templateSlug?.startsWith('git:')) return 'git'
  if (templateSlug) return 'store'
  return 'custom'
}

function createFallbackTemplateCardData(
  name: string,
  summary: string,
  agentCount: number,
): TemplateCatalogSummary {
  return {
    name,
    title: name,
    description: summary,
    namespace: name,
    tags: [],
    agentCount,
    category: 'demo',
    emoji: '✨',
    featured: false,
    popularity: 0,
    difficulty: 'beginner',
    estimatedDeployTime: '',
    overview: [summary],
    features: [],
    highlights: [],
  }
}

function ForkDialog({
  onFork,
  onClose,
}: {
  onFork: (sourceTemplate: string, newName: string) => void
  onClose: () => void
}) {
  const api = useApiClient()
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
        template.name.toLowerCase().includes(q) ||
        template.title.toLowerCase().includes(q) ||
        template.description?.toLowerCase().includes(q),
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
              icon={SearchIcon}
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
                        {template.title || template.name}
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

function CreateTemplateDialog({
  onCreate,
  onClose,
  error,
  isPending = false,
}: {
  onCreate: (name: string) => void
  onClose: () => void
  error?: string | null
  isPending?: boolean
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-lg">
        <ModalHeader
          overline={t('templates.createTemplate')}
          icon={<Plus size={18} className="text-primary" />}
          title={t('templates.createTemplate')}
          subtitle={t('templates.createTemplateDescription')}
        />

        <ModalBody>
          <Input
            type="text"
            label={t('templates.newTemplateName')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('templates.templateNamePlaceholder')}
          />
          {error && (
            <div className="rounded-xl border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
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
                const templateName = name.trim()
                if (templateName) onCreate(templateName)
              }}
              disabled={!name.trim() || isPending}
              loading={isPending}
            >
              <Plus size={14} />
              {t('templates.createTemplate')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

function ImportGitHubTemplateDialog({
  onImport,
  onClose,
  isPending = false,
}: {
  onImport: (data: {
    connectionId: string
    repository: string
    name: string
    path?: string
    branch?: string
  }) => void
  onClose: () => void
  isPending?: boolean
}) {
  const api = useApiClient()
  const { t } = useTranslation()
  const [connectionId, setConnectionId] = useState('')
  const [repository, setRepository] = useState('')
  const [branch, setBranch] = useState('')
  const [path, setPath] = useState('shadowob-cloud.json')
  const [name, setName] = useState('')
  const [token, setToken] = useState('')
  const [connectOpen, setConnectOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: connectionsData } = useQuery({
    queryKey: ['github-connections'],
    queryFn: api.github.connections,
  })
  const connections = connectionsData?.connections ?? []
  const selectedConnectionId = connectionId || connections[0]?.id || ''
  const {
    data: repositoriesData,
    isError: repositoriesError,
    isLoading: repositoriesLoading,
  } = useQuery({
    queryKey: ['github-repositories', selectedConnectionId],
    queryFn: () => api.github.repositories(selectedConnectionId),
    enabled: Boolean(selectedConnectionId),
  })
  const repositories = repositoriesData?.repositories ?? []

  useEffect(() => {
    if (!connectionId && connections[0]?.id) setConnectionId(connections[0].id)
  }, [connectionId, connections])

  useEffect(() => {
    if (repository || repositories.length === 0) return
    const first = repositories[0]
    setRepository(first.repository)
    if (first.defaultBranch) setBranch(first.defaultBranch)
    setName(slugifyTemplateName(first.repository.split('/').pop() ?? first.repository))
  }, [repository, repositories])

  const connectMutation = useMutation({
    mutationFn: () => api.github.connect({ token: token.trim() }),
    onSuccess: (result) => {
      setConnectionId(result.connection.id)
      setToken('')
      setConnectOpen(false)
      queryClient.invalidateQueries({ queryKey: ['github-connections'] })
      toast.success(t('templates.githubConnected'))
    },
    onError: (err) => toast.error(t('templates.githubConnectFailed', { message: err.message })),
  })
  const showTokenForm = connections.length === 0 || connectOpen
  const templateName = name.trim() || slugifyTemplateName(repository.split('/').pop() ?? repository)
  const canChooseRepository = Boolean(selectedConnectionId)

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-lg">
        <ModalHeader
          overline={t('templates.importFromGithub')}
          icon={<Github size={18} className="text-primary" />}
          title={t('templates.importFromGithub')}
          subtitle={t('templates.importFromGithubDescription')}
        />

        <ModalBody>
          {connections.length > 0 ? (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-text-muted">
                  {t('templates.githubConnection')}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setConnectOpen((open) => !open)}
                >
                  <Github size={12} />
                  {t('templates.githubConnectAnother')}
                </Button>
              </div>
              <Select value={selectedConnectionId} onValueChange={setConnectionId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('templates.githubConnectionPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      <Github size={12} />
                      {connection.name || connection.accountLogin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {showTokenForm ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                label={t('templates.githubToken')}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={t('templates.githubTokenPlaceholder')}
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="sm:mt-6"
                onClick={() => connectMutation.mutate()}
                disabled={!token.trim() || connectMutation.isPending}
                loading={connectMutation.isPending}
              >
                <Github size={14} />
                {t('templates.githubConnect')}
              </Button>
            </div>
          ) : null}

          {canChooseRepository ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">
                {t('templates.githubRepository')}
              </label>
              {repositoriesLoading ? (
                <div className="flex min-h-10 items-center gap-2 rounded-lg border border-border-subtle bg-bg-secondary/40 px-3 text-text-muted text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  {t('templates.githubRepositoryLoading')}
                </div>
              ) : repositories.length > 0 ? (
                <Select
                  value={repository}
                  onValueChange={(value) => {
                    setRepository(value)
                    const repo = repositories.find((item) => item.repository === value)
                    if (repo?.defaultBranch) setBranch(repo.defaultBranch)
                    if (!name.trim()) setName(slugifyTemplateName(value.split('/').pop() ?? value))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('templates.githubRepositoryPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {repositories.map((repo) => (
                      <SelectItem key={repo.repository} value={repo.repository}>
                        <Github size={12} />
                        {repo.repository}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={repository}
                  onChange={(event) => setRepository(event.target.value)}
                  placeholder={
                    repositoriesError
                      ? t('templates.githubRepositoryFallbackPlaceholder')
                      : t('templates.githubRepositoryPlaceholder')
                  }
                />
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border-subtle bg-bg-secondary/40 px-3 py-3 text-text-muted text-sm">
              {t('templates.githubConnectFirst')}
            </div>
          )}

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0"
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <ChevronRight
                size={14}
                className={cn('transition-transform', advancedOpen && 'rotate-90')}
              />
              {t('templates.githubAdvancedSettings')}
            </Button>
            {advancedOpen ? (
              <div className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label={t('templates.githubBranch')}
                    value={branch}
                    onChange={(event) => setBranch(event.target.value)}
                    placeholder="main"
                  />
                  <Input
                    label={t('templates.githubTemplatePath')}
                    value={path}
                    onChange={(event) => setPath(event.target.value)}
                    placeholder="shadowob-cloud.json"
                  />
                </div>
                <Input
                  label={t('templates.newTemplateName')}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={templateName}
                />
              </div>
            ) : null}
          </div>
        </ModalBody>

        <ModalFooter>
          <ModalButtonGroup>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={isPending}
              disabled={!selectedConnectionId || !repository.trim() || isPending}
              onClick={() =>
                onImport({
                  connectionId: selectedConnectionId,
                  repository: repository.trim(),
                  name: templateName,
                  path: path.trim() || undefined,
                  branch: branch.trim() || undefined,
                })
              }
            >
              <Github size={14} />
              {t('templates.importFromGithub')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export function MyTemplatesPage() {
  const api = useApiClient()
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showForkDialog, setShowForkDialog] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showGitHubImportDialog, setShowGitHubImportDialog] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [templateToDelete, setTemplateToDelete] = useState<{
    name: string
    reviewStatus?: 'draft' | 'pending' | 'approved' | 'rejected'
  } | null>(null)
  const [search, setSearch] = useState('')
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

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.myTemplates.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      toast.success(t('templates.templateDeleted'))
    },
    onError: (err) => toast.error(t('templates.deleteFailed', { message: (err as Error).message })),
  })

  const templates = myTemplates ?? []
  const existingTemplateNames = useMemo(
    () => new Set(templates.map((template) => template.name)),
    [templates],
  )
  const catalogByName = useMemo(
    () => new Map((catalogData?.templates ?? []).map((template) => [template.name, template])),
    [catalogData?.templates],
  )
  const templateCategoryLabels = useMemo(
    () =>
      Object.fromEntries(
        (catalogData?.categories ?? []).map((category) => [category.id, category.label]),
      ) as Record<string, string>,
    [catalogData?.categories],
  )

  const sortedTemplates = useMemo(() => {
    return [...templates].sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
  }, [templates])

  const createTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      const result = await api.myTemplates.save(name, createMinimalTemplateContent(name))
      const resultName = (result as { name?: unknown }).name
      const savedName = typeof resultName === 'string' ? resultName : name
      return { savedName }
    },
    onSuccess: ({ savedName }, name) => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      setCreateError(null)
      setShowCreateDialog(false)
      navigate({ to: '/my-templates/$name', params: { name: savedName } })
      toast.success(t('templates.templateCreated', { name }))
    },
    onError: (err) => {
      const message = t('templates.createFailed', { message: (err as Error).message })
      setCreateError(message)
      toast.error(message)
    },
  })

  const importGitHubMutation = useMutation({
    mutationFn: (data: {
      connectionId: string
      repository: string
      name: string
      path?: string
      branch?: string
    }) => api.myTemplates.importGit(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      setShowGitHubImportDialog(false)
      navigate({ to: '/my-templates/$name', params: { name: data.name } })
      toast.success(t('templates.githubImportSuccess', { name: data.name }))
    },
    onError: (err) => toast.error(t('templates.githubImportFailed', { message: err.message })),
  })

  const ensureUniqueTemplateName = (name: string) => {
    let result = name
    let counter = 2
    while (existingTemplateNames.has(result)) {
      result = `${name}-${counter}`
      counter += 1
    }
    return result
  }

  const filteredTemplates = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase()

    return sortedTemplates.filter((template) => {
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
  }, [catalogByName, debouncedSearch, sortedTemplates])

  const normalizeTemplateName = (name: string) => {
    const normalized = name.trim()
    if (!normalized) return ''

    return normalized
      .replace(/[\\/?%*:|"<>]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120)
  }

  return (
    <PageShell
      breadcrumb={[]}
      title={t('templates.title')}
      headerContent={
        <div className="space-y-3">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={typewriterPlaceholder || t('templates.searchSavedPlaceholder')}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted">
              {t('store.matchingTemplates', { count: filteredTemplates.length })}
              {debouncedSearch ? ` · ${t('store.matchingQuery', { query: debouncedSearch })}` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setCreateError(null)
                  setShowCreateDialog(true)
                }}
              >
                <Plus size={14} />
                <span className="truncate">{t('templates.createTemplate')}</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigate({ to: '/store' })}
              >
                <ShoppingBag size={14} />
                <span className="truncate">{t('templates.forkFromStore')}</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowGitHubImportDialog(true)}
              >
                <Github size={14} />
                <span className="truncate">{t('templates.importFromGithub')}</span>
              </Button>
            </div>
          </div>
        </div>
      }
    >
      {isLoading && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`template-skeleton-${index}`}
              className="h-[240px] rounded-3xl border border-border-subtle bg-bg-secondary/60 animate-pulse"
            />
          ))}
        </div>
      )}

      {!isLoading && templates.length === 0 && (
        <DashboardEmptyState
          cardVariant="glassPanel"
          icon={Copy}
          title={t('templates.noCustomTemplates')}
          description={t('templates.noCustomTemplateHint')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setCreateError(null)
                  setShowCreateDialog(true)
                }}
              >
                <Plus size={14} />
                {t('templates.createTemplate')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigate({ to: '/store' })}
              >
                <ShoppingBag size={14} />
                {t('templates.forkFromStore')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowGitHubImportDialog(true)}
              >
                <Github size={14} />
                {t('templates.importFromGithub')}
              </Button>
            </div>
          }
        />
      )}

      {!isLoading && templates.length > 0 && filteredTemplates.length === 0 && (
        <DashboardEmptyState
          cardVariant="glassPanel"
          icon={SearchIcon}
          title={t('templates.noTemplatesMatch', {
            query: debouncedSearch || t('templates.title'),
          })}
          description={t('templates.emptyFiltered')}
          action={
            <Button type="button" variant="primary" size="sm" onClick={() => setSearch('')}>
              {t('templates.clearSearch')}
            </Button>
          }
        />
      )}

      {!isLoading && filteredTemplates.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredTemplates.map((template) => {
            const overview = getMyTemplateOverview(template.content)
            const sourceType = getTemplateSourceType(template.templateSlug)
            const baseTemplate = template.templateSlug
              ? catalogByName.get(template.templateSlug)
              : undefined
            const summaryText =
              baseTemplate?.description ??
              baseTemplate?.overview[0] ??
              t('templateDetail.customDescription')
            const updatedAtLabel = new Date(template.updatedAt).toLocaleString(i18n.language, {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
            const cardTemplate = baseTemplate
              ? baseTemplate
              : createFallbackTemplateCardData(template.name, summaryText, overview.agentCount)
            const categoryLabel = baseTemplate
              ? (templateCategoryLabels[baseTemplate.category] ?? baseTemplate.category)
              : t(`templates.filters.${sourceType}`)
            const templateNameParam = encodeURIComponent(template.name)
            const templateSlugParam = encodeURIComponent(template.slug)

            return (
              <TemplateGalleryCard
                key={template.slug}
                template={cardTemplate}
                categoryLabel={categoryLabel}
                detailHref={`/my-templates/${templateNameParam}`}
                title={template.name}
                summary={summaryText}
                difficultyLabel={
                  baseTemplate ? t(`store.difficulties.${baseTemplate.difficulty}`) : undefined
                }
                metrics={[
                  {
                    icon: <Users size={11} className="text-primary" />,
                    value: overview.agentCount,
                    label: t('templateDetail.agents'),
                  },
                  {
                    icon: <Hash size={11} className="text-primary" />,
                    value: `v${template.version ?? 1}`,
                    label: t('templateDetail.version'),
                  },
                  {
                    icon: <Clock size={11} className="text-primary" />,
                    value: updatedAtLabel,
                    label: t('templates.updated'),
                  },
                ]}
                secondaryAction={{
                  href: `/my-templates/${templateNameParam}`,
                  label: t('templates.openEditor'),
                  icon: <Edit3 size={14} />,
                  variant: 'secondary',
                }}
                primaryAction={{
                  href: `/store/${templateSlugParam}`,
                  label: t('templates.deployNow'),
                  icon: <Rocket size={14} />,
                  variant: 'primary',
                }}
              />
            )
          })}
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
            <AlertDialogTitle>
              {templateToDelete?.reviewStatus === 'approved'
                ? t('templates.deleteApprovedTitle')
                : t('common.delete')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {templateToDelete?.reviewStatus === 'approved'
                ? t('templates.deleteApprovedConfirm', { name: templateToDelete.name })
                : templateToDelete?.reviewStatus === 'pending'
                  ? t('templates.deletePendingConfirm', { name: templateToDelete.name })
                  : templateToDelete
                    ? t('templates.deleteConfirm', { name: templateToDelete.name })
                    : ''}
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
                    deleteMutation.mutate(templateToDelete.name)
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

      {showCreateDialog && (
        <CreateTemplateDialog
          onCreate={(name) => {
            setCreateError(null)
            const normalizedName = normalizeTemplateName(name)
            if (!normalizedName) return

            const uniqueName = ensureUniqueTemplateName(normalizedName)
            createTemplateMutation.mutate(uniqueName)
          }}
          onClose={() => {
            setCreateError(null)
            setShowCreateDialog(false)
          }}
          error={createError}
          isPending={createTemplateMutation.isPending}
        />
      )}

      {showGitHubImportDialog && (
        <ImportGitHubTemplateDialog
          onImport={(data) => importGitHubMutation.mutate(data)}
          onClose={() => setShowGitHubImportDialog(false)}
          isPending={importGitHubMutation.isPending}
        />
      )}
    </PageShell>
  )
}
