import Editor, { type Monaco } from '@monaco-editor/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  ArrowLeft,
  Check,
  Clock,
  Cpu,
  Edit3,
  FileJson,
  GitFork,
  History,
  Layers,
  Loader2,
  Rocket,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Trash2,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, EmptyState } from '@shadowob/ui'
import { Breadcrumb } from '@/components/Breadcrumb'
import {
  parseTemplateAgents,
  type TemplateAgentInfo,
  TemplateAgentsTab,
  TemplateConfigTab,
  TemplateDetailShell,
} from '@/components/TemplateDetailShared'
import { api, type ValidateResult } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/stores/toast'

// ── Editor Tab ────────────────────────────────────────────────────────────────

function EditorTab({
  name,
  content: initialContent,
  templateSlug,
}: {
  name: string
  content: unknown
  templateSlug: string | null
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [content, setContent] = useState(() =>
    initialContent ? JSON.stringify(initialContent, null, 2) : '',
  )
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null)
  const [saved, setSaved] = useState(true)

  useEffect(() => {
    if (initialContent) setContent(JSON.stringify(initialContent, null, 2))
  }, [initialContent])

  const saveMutation = useMutation({
    mutationFn: (parsed: unknown) => api.myTemplates.save(name, parsed, templateSlug ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      queryClient.invalidateQueries({ queryKey: ['my-template', name] })
      setSaved(true)
      toast.success(t('templateDetail.templateSaved'))
    },
    onError: (err) => toast.error(`${t('templateDetail.saveFailed')}: ${err.message}`),
  })

  const validateMutation = useMutation({
    mutationFn: (config: unknown) => api.validate(config),
    onSuccess: (result) => {
      setValidateResult(result)
      if (result.valid) {
        toast.success(
          t('templateDetail.validationSummaryValid', {
            agents: result.agents,
            configurations: result.configurations,
          }),
        )
      } else {
        toast.error(
          t('templateDetail.validationSummaryInvalid', {
            count: result.violations.length,
          }),
        )
      }
    },
  })

  const handleSave = () => {
    try {
      saveMutation.mutate(JSON.parse(content))
    } catch {
      toast.error(t('templateDetail.invalidJSONCannotSave'))
    }
  }

  const handleValidate = () => {
    try {
      setValidateResult(null)
      validateMutation.mutate(JSON.parse(content))
    } catch {
      toast.error(t('templateDetail.invalidJSONSyntax'))
    }
  }

  const handleFormat = () => {
    try {
      setContent(JSON.stringify(JSON.parse(content), null, 2))
      toast.info(t('templateDetail.formatted'))
    } catch {
      toast.error(t('templateDetail.cannotFormat'))
    }
  }

  const handleChange = useCallback((val: string | undefined) => {
    setContent(val ?? '')
    setSaved(false)
    setValidateResult(null)
  }, [])

  const isValidJson = useMemo(() => {
    try {
      JSON.parse(content)
      return true
    } catch {
      return false
    }
  }, [content])

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>
            {content.split('\n').length} {t('templateDetail.lines')}
          </span>
          <span>·</span>
          <span className={isValidJson ? 'text-green-600' : 'text-red-500'}>
            {content.trim()
              ? isValidJson
                ? t('templateDetail.validJSON')
                : t('templateDetail.invalidJSON')
              : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={handleFormat}
            disabled={!isValidJson}
            variant="ghost"
            size="sm"
          >
            <FileJson size={12} />
            {t('templateDetail.format')}
          </Button>
          <Button
            type="button"
            onClick={handleValidate}
            disabled={!isValidJson || validateMutation.isPending}
            variant="ghost"
            size="sm"
          >
            <Shield size={12} />
            {t('templateDetail.validate')}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isValidJson || saveMutation.isPending}
            variant="secondary"
            size="sm"
          >
            {saved ? <Check size={12} /> : <Save size={12} />}
            {saved ? t('common.saved') : t('common.save')}
          </Button>
        </div>
      </div>

      {/* Validation result */}
      {validateResult && (
        <div
          className={cn(
            'border rounded-lg p-3 mb-3 flex items-center gap-2 text-sm',
            validateResult.valid
              ? 'bg-green-900/20 border-green-800 text-green-400'
              : 'bg-red-900/20 border-red-800 text-red-400',
          )}
        >
          <Shield size={14} />
          {validateResult.valid
            ? t('templateDetail.validationSummaryValid', {
              agents: validateResult.agents,
              configurations: validateResult.configurations,
            })
            : t('templateDetail.validationSummaryInvalid', {
              count: validateResult.violations.length,
            })}
        </div>
      )}

      {/* Monaco Editor */}
      <div className="border border-gray-700 rounded-lg overflow-hidden min-h-[500px]">
        <Editor
          height="500px"
          language="json"
          value={content}
          onChange={handleChange}
          onMount={async (_editor, monaco: Monaco) => {
            try {
              const schema = await api.schema()
              monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                validate: true,
                allowComments: false,
                schemaValidation: 'error',
                schemas: [
                  {
                    uri: 'https://raw.githubusercontent.com/BuggyBlues/shadow/main/apps/cloud/schemas/config.schema.json',
                    fileMatch: ['*'],
                    schema,
                  },
                ],
              })
            } catch {
              // Schema fetch failed — editor works without validation
            }
          }}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            formatOnPaste: true,
            automaticLayout: true,
            padding: { top: 8 },
          }}
        />
      </div>
    </div>
  )
}

// ── Versions Tab ──────────────────────────────────────────────────────────────

function VersionsTab({ name }: { name: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['my-template-versions', name],
    queryFn: () => api.myTemplates.versions(name),
  })

  const restoreMutation = useMutation({
    mutationFn: (version: number) => api.myTemplates.restoreVersion(name, version),
    onSuccess: (_, version) => {
      queryClient.invalidateQueries({ queryKey: ['my-template', name] })
      queryClient.invalidateQueries({ queryKey: ['my-template-versions', name] })
      toast.success(t('templateDetail.restored', { version }))
    },
    onError: (err) => toast.error(`${t('templateDetail.restoreFailed')}: ${err.message}`),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('templateDetail.loadingVersions')}
      </div>
    )
  }

  const versions = data?.versions ?? []

  if (versions.length <= 1) {
    return (
      <EmptyState
        icon={History}
        title={t('templateDetail.noVersionHistory')}
        description={t('templateDetail.editAndSaveToCreate')}
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {t('templateDetail.currentVersion')}{' '}
        <span className="text-white font-medium">v{data?.current ?? 1}</span>
        {' · '}
        {versions.length} {t('templateDetail.totalVersions')}
      </p>
      <div className="space-y-2">
        {versions.map((v) => (
          <div
            key={v.version}
            className={cn(
              'flex items-center justify-between px-4 py-3 rounded-lg border transition-colors',
              v.current
                ? 'bg-blue-900/20 border-blue-800/50'
                : 'bg-gray-900/50 border-gray-800 hover:border-gray-700',
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                  v.current ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400',
                )}
              >
                v{v.version}
              </div>
              <div>
                <span className="text-sm text-gray-200">
                  {t('templateDetail.versionLabel', { version: v.version })}
                  {v.current && (
                    <Badge variant="info" size="sm">
                      {t('templateDetail.current')}
                    </Badge>
                  )}
                </span>
                {v.createdAt && (
                  <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    {new Date(v.createdAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            {!v.current && (
              <Button
                type="button"
                onClick={() => restoreMutation.mutate(v.version)}
                disabled={restoreMutation.isPending}
                variant="ghost"
                size="sm"
              >
                <RotateCcw size={12} />
                {t('templateDetail.restore')}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function MyTemplateDetailPage() {
  const { t } = useTranslation()
  const { name } = useParams({ strict: false }) as { name: string }
  const [activeTab, setActiveTab] = useState('overview')
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['my-template', name],
    queryFn: () => api.myTemplates.get(name),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.myTemplates.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      toast.success(t('templateDetail.templateDeleted'))
      navigate({ to: '/my-templates' })
    },
    onError: () => toast.error(t('templateDetail.templateDeleteFailed')),
  })

  const agents = useMemo(
    () => (data?.content ? parseTemplateAgents(data.content) : []),
    [data?.content],
  )
  const templateContent = data?.content as Record<string, unknown> | undefined
  const deployments = templateContent?.deployments as Record<string, unknown> | undefined
  const namespace = deployments?.namespace as string | undefined
  const configurations = (templateContent?.configurations ?? deployments?.configurations) as
    | unknown[]
    | undefined
  const providers = (templateContent?.providers ?? deployments?.providers) as unknown[] | undefined

  const tabs = [
    { id: 'overview', label: t('templateDetail.overview'), icon: <FileJson size={13} /> },
    {
      id: 'agents',
      label: t('templateDetail.agents'),
      count: agents.length,
      icon: <Users size={13} />,
    },
    { id: 'editor', label: t('templateDetail.editor'), icon: <Edit3 size={13} /> },
    {
      id: 'versions',
      label: t('templateDetail.versions'),
      count: data?.version,
      icon: <History size={13} />,
    },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
        <Loader2 size={18} className="animate-spin mr-2" />
        {t('templateDetail.loadingTemplate')}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6">
        <Breadcrumb
          items={[{ label: t('templates.title'), to: '/my-templates' }, { label: name }]}
          className="mb-4"
        />
        <EmptyState
          title={t('storeDetail.templateNotFound')}
          description={t('templateDetail.missingTemplateDescription', { name })}
          action={
            <Button asChild variant="primary" size="sm">
              <Link to="/my-templates">{t('templateDetail.backToTemplates')}</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <TemplateDetailShell
      breadcrumbItems={[{ label: t('templates.title'), to: '/my-templates' }, { label: name }]}
      heroIcon={
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <FileJson size={24} className="text-primary" />
        </div>
      }
      title={name}
      titleMeta={
        <>
          <Badge variant="neutral" size="sm">
            v{data.version ?? 1}
          </Badge>
          {data.templateSlug && (
            <Badge variant="neutral" size="sm">
              <GitFork size={10} />
              {data.templateSlug}
            </Badge>
          )}
        </>
      }
      description={
        data.templateSlug
          ? t('templateDetail.forkedDescription', { name: data.templateSlug })
          : t('templateDetail.customDescription')
      }
      supportingText={
        data.templateSlug ? (
          <p className="text-xs text-gray-600 flex items-center gap-1">
            <GitFork size={12} />
            <span>{t('templateDetail.forkedFrom')}</span>
            <Link
              to="/store/$name"
              params={{ name: data.templateSlug }}
              className="text-gray-400 hover:text-blue-400 transition-colors"
            >
              {data.templateSlug}
            </Link>
          </p>
        ) : null
      }
      chips={
        <>
          <div className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-secondary px-3 py-1.5 text-xs text-text-secondary">
            <Users size={11} className="text-primary" />
            {t('templateDetail.agentsCount', { count: agents.length })}
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-secondary px-3 py-1.5 text-xs text-text-secondary">
            <Layers size={11} className="text-primary" />
            {Array.isArray(configurations) ? configurations.length : 0}{' '}
            {t('templateDetail.configurations')}
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-secondary px-3 py-1.5 text-xs text-text-secondary">
            <Cpu size={11} className="text-primary" />
            {Array.isArray(providers) ? providers.length : 0} {t('templateDetail.providers')}
          </div>
        </>
      }
      actions={
        <>
          <Button asChild variant="primary" size="sm">
            <Link
              to="/store/$name/deploy"
              params={{ name: data.templateSlug ?? name }}
            >
              <Rocket size={16} />
              {t('common.deploy')}
            </Link>
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (confirm(t('templates.deleteConfirm', { name }))) deleteMutation.mutate()
            }}
            variant="ghost"
            size="sm"
          >
            <Trash2 size={14} />
            {t('common.delete')}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/my-templates">
              <ArrowLeft size={14} />
              {t('common.back')}
            </Link>
          </Button>
        </>
      }
      sidebar={
        <div className="glass-panel space-y-4 rounded-[24px] p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {t('templateDetail.quickInfo')}
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <Users size={12} />
                {t('templateDetail.agents')}
              </span>
              <span className="text-sm font-medium text-text-primary">{agents.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <Layers size={12} />
                {t('clusters.namespace')}
              </span>
              <span className="text-sm font-mono text-text-primary">
                {namespace ?? t('common.none')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <Settings size={12} />
                {t('templateDetail.configurations')}
              </span>
              <span className="text-sm text-text-primary">
                {Array.isArray(configurations) ? configurations.length : 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <Cpu size={12} />
                {t('templateDetail.providers')}
              </span>
              <span className="text-sm text-text-primary">
                {Array.isArray(providers) ? providers.length : 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <History size={12} />
                {t('templateDetail.version')}
              </span>
              <span className="text-sm font-mono text-text-primary">v{data.version ?? 1}</span>
            </div>
          </div>
        </div>
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'overview' && <OverviewPanel content={data.content} agents={agents} />}
      {activeTab === 'agents' && (
        <TemplateAgentsTab
          agents={agents}
          emptyTitle={t('templateDetail.noAgents')}
          emptyDescription={t('templateDetail.noAgents')}
          introText={t('templateDetail.agentsInTemplate', { count: agents.length })}
        />
      )}
      {activeTab === 'editor' && (
        <EditorTab name={name} content={data.content} templateSlug={data.templateSlug} />
      )}
      {activeTab === 'versions' && <VersionsTab name={name} />}
    </TemplateDetailShell>
  )
}

// ── Overview Panel ────────────────────────────────────────────────────────────

function OverviewPanel({ content, agents }: { content: unknown; agents: TemplateAgentInfo[] }) {
  const { t } = useTranslation()

  if (!content || typeof content !== 'object') {
    return (
      <EmptyState
        title={t('templateDetail.noContent')}
        description={t('templateDetail.noContentDescription')}
      />
    )
  }
  const data = content as Record<string, unknown>
  const deployments = data.deployments as Record<string, unknown> | undefined
  const namespace = deployments?.namespace as string | undefined
  const configs = (data.configurations ?? deployments?.configurations) as unknown[] | undefined
  const providers = (data.providers ?? deployments?.providers) as unknown[] | undefined

  return (
    <div className="space-y-5">
      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label={t('templateDetail.agents')}
          value={agents.length}
          icon={<Users size={14} className="text-primary" />}
        />
        <StatCard
          label={t('clusters.namespace')}
          value={namespace ?? t('common.none')}
          icon={<Layers size={14} className="text-primary" />}
        />
        <StatCard
          label={t('templateDetail.configurations')}
          value={Array.isArray(configs) ? configs.length : 0}
          icon={<Settings size={14} className="text-primary" />}
        />
        <StatCard
          label={t('templateDetail.providers')}
          value={Array.isArray(providers) ? providers.length : 0}
          icon={<Cpu size={14} className="text-primary" />}
        />
      </div>

      {/* Agent summary */}
      <div className="glass-panel rounded-[22px] p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Users size={14} className="text-primary" />
          {t('templateDetail.agentSummary')}
        </h3>
        <div className="space-y-2">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-text-primary">{a.identity?.name ?? a.id}</span>
                <Badge variant="neutral" size="sm">
                  {a.runtime}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {a.integrations?.map((i) => (
                  <Badge key={i.name} variant="neutral" size="sm">
                    {i.name}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Raw config preview */}
      <TemplateConfigTab
        templateData={content}
        description={t('templateDetail.configPreviewDescription')}
        title={t('templateDetail.configPreview')}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
}) {
  return (
    <div className="glass-panel rounded-[20px] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase text-text-muted">
        {icon}
        {label}
      </div>
      <p className="font-mono text-lg font-semibold text-text-primary">{value}</p>
    </div>
  )
}
