import Editor, { type Monaco } from '@monaco-editor/react'
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
  GlassPanel,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
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
  Upload,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DashboardEmptyState } from '@/components/DashboardEmptyState'
import { PageShell } from '@/components/PageShell'
import {
  parseTemplateAgents,
  TemplateAgentsTab,
  TemplateDetailQuickInfoPanel,
  TemplateDetailShell,
} from '@/components/TemplateDetailShared'
import { type ValidateResult } from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
import { formatJson, isValidJson as isValidJsonText, parseJson, stringifyJson } from '@/lib/json'
import { configureMonacoWorkers } from '@/lib/monaco'
import { cn } from '@/lib/utils'
import { useToast } from '@/stores/toast'

configureMonacoWorkers()

// ── Editor Tab ────────────────────────────────────────────────────────────────

function EditorTab({
  name,
  content: initialContent,
  templateSlug,
  readOnly = false,
}: {
  name: string
  content: unknown
  templateSlug: string | null
  readOnly?: boolean
}) {
  const api = useApiClient()
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [content, setContent] = useState(() =>
    initialContent ? stringifyJson(initialContent) : '',
  )
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null)
  const [schemaLoadError, setSchemaLoadError] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)

  useEffect(() => {
    if (initialContent) setContent(stringifyJson(initialContent))
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
    const parsed = parseJson(content)
    if (!parsed.ok) {
      toast.error(t('templateDetail.invalidJSONCannotSave'))
      return
    }

    saveMutation.mutate(parsed.value)
  }

  const handleValidate = () => {
    const parsed = parseJson(content)
    if (!parsed.ok) {
      toast.error(t('templateDetail.invalidJSONSyntax'))
      return
    }

    setValidateResult(null)
    validateMutation.mutate(parsed.value)
  }

  const handleFormat = () => {
    const formatted = formatJson(content)
    if (!formatted.ok) {
      toast.error(t('templateDetail.cannotFormat'))
      return
    }

    setContent(formatted.value)
    toast.info(t('templateDetail.formatted'))
  }

  const handleChange = useCallback((val: string | undefined) => {
    setContent(val ?? '')
    setSaved(false)
    setValidateResult(null)
  }, [])

  const isValidJson = useMemo(() => isValidJsonText(content), [content])

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
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
            disabled={readOnly || !isValidJson || saveMutation.isPending}
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

      {schemaLoadError && (
        <div className="mb-3 rounded-lg border border-yellow-800 bg-yellow-900/20 p-3 text-sm text-yellow-300">
          {schemaLoadError}
        </div>
      )}

      {/* Monaco Editor */}
      <div className="overflow-hidden rounded-xl border border-border-subtle min-h-[500px]">
        <Editor
          height="500px"
          language="json"
          value={content}
          onChange={readOnly ? undefined : handleChange}
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
              setSchemaLoadError(null)
            } catch (error) {
              setSchemaLoadError(
                t('templateDetail.schemaLoadFailed', {
                  message: error instanceof Error ? error.message : t('common.error'),
                }),
              )
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
            readOnly,
          }}
        />
      </div>
    </div>
  )
}

// ── Versions Tab ──────────────────────────────────────────────────────────────

function VersionsTab({ name }: { name: string }) {
  const api = useApiClient()
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
      <div className="flex items-center justify-center py-12 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('templateDetail.loadingVersions')}
      </div>
    )
  }

  const versions = data?.versions ?? []

  if (versions.length <= 1) {
    return (
      <DashboardEmptyState
        icon={History}
        title={t('templateDetail.noVersionHistory')}
        description={t('templateDetail.editAndSaveToCreate')}
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
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
                : 'bg-bg-secondary/70 border-border-subtle hover:border-border-dim',
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                  v.current ? 'bg-primary text-black' : 'bg-bg-tertiary text-text-muted',
                )}
              >
                v{v.version}
              </div>
              <div>
                <span className="text-sm text-text-primary">
                  {t('templateDetail.versionLabel', { version: v.version })}
                  {v.current && (
                    <Badge variant="info" size="sm">
                      {t('templateDetail.current')}
                    </Badge>
                  )}
                </span>
                {v.createdAt && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
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
  const api = useApiClient()
  const { t } = useTranslation()
  const { name } = useParams({ strict: false }) as { name: string }
  const [activeTab, setActiveTab] = useState('agents')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['my-template', name],
    queryFn: () => api.myTemplates.get(name),
  })

  const reviewStatus = data?.reviewStatus
  const canEdit = !reviewStatus || reviewStatus === 'draft' || reviewStatus === 'rejected'
  const canSubmit = !reviewStatus || reviewStatus === 'draft' || reviewStatus === 'rejected'
  const isResubmit = reviewStatus === 'rejected'

  const deleteMutation = useMutation({
    mutationFn: () => api.myTemplates.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      toast.success(t('templateDetail.templateDeleted'))
      navigate({ to: '/my-templates' })
    },
    onError: () => toast.error(t('templateDetail.templateDeleteFailed')),
  })

  const publishMutation = useMutation({
    mutationFn: () => api.community.publish(name),
    onSuccess: () => {
      setPublishDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['my-template', name] })
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      toast.success(t('templateDetail.publishSuccess'))
    },
    onError: () => {
      setPublishDialogOpen(false)
      toast.error(t('templateDetail.publishFailed'))
    },
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
      <div className="flex items-center justify-center py-20 text-sm text-text-muted">
        <Loader2 size={18} className="animate-spin mr-2" />
        {t('templateDetail.loadingTemplate')}
      </div>
    )
  }

  if (!data) {
    return (
      <PageShell
        breadcrumb={[{ label: t('templates.title'), to: '/my-templates' }, { label: name }]}
        breadcrumbPosition="inside"
        narrow
        title={name}
        description={t('templateDetail.missingTemplateDescription', { name })}
        actions={
          <Button asChild variant="primary" size="sm">
            <Link to="/my-templates">{t('templateDetail.backToTemplates')}</Link>
          </Button>
        }
      >
        <DashboardEmptyState
          title={t('storeDetail.templateNotFound')}
          description={t('templateDetail.missingTemplateDescription', { name })}
        />
      </PageShell>
    )
  }

  return (
    <>
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
          </>
        }
        description={
          data.templateSlug
            ? t('templateDetail.forkedDescription', { name: data.templateSlug })
            : t('templateDetail.customDescription')
        }
        actions={
          <>
            <Button asChild variant="primary">
              <Link to="/store/$name/deploy" params={{ name: data.templateSlug ?? name }}>
                <Rocket size={14} />
                <span>{t('common.deploy')}</span>
              </Link>
            </Button>
            {/* Review status action — state machine */}
            {canSubmit && (
              <Button
                type="button"
                variant="secondary"
                disabled={publishMutation.isPending}
                onClick={() => setPublishDialogOpen(true)}
                title={t('templateDetail.publishTooltip')}
              >
                <Upload size={12} />
                <span>
                  {publishMutation.isPending
                    ? t('templateDetail.publishing')
                    : isResubmit
                      ? t('templateDetail.resubmitToCommunity')
                      : t('templateDetail.publishToCommunity')}
                </span>
              </Button>
            )}
            <Button type="button" onClick={() => setDeleteDialogOpen(true)} variant="ghost">
              <Trash2 size={14} />
              {t('common.delete')}
            </Button>
          </>
        }
        sidebar={
          <TemplateDetailQuickInfoPanel
            title={t('templateDetail.quickInfo')}
            items={[
              {
                icon: <Users size={12} />,
                label: t('templateDetail.agents'),
                value: <span className="font-medium text-text-primary">{agents.length}</span>,
              },
              {
                icon: <Layers size={12} />,
                label: t('clusters.namespace'),
                value: (
                  <span className="font-mono text-text-primary">
                    {namespace ?? t('common.none')}
                  </span>
                ),
              },
              {
                icon: <Settings size={12} />,
                label: t('templateDetail.configurations'),
                value: Array.isArray(configurations) ? configurations.length : 0,
              },
              {
                icon: <Cpu size={12} />,
                label: t('templateDetail.providers'),
                value: Array.isArray(providers) ? providers.length : 0,
              },
            ]}
          >
            {data.reviewStatus === 'rejected' && data.reviewNote ? (
              <div className="mt-1 rounded-lg border border-red-800/40 bg-red-900/20 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-red-400">
                  <Shield size={11} />
                  {t('templateDetail.reviewNoteLabel')}
                </p>
                <p className="text-xs leading-relaxed text-red-300">{data.reviewNote}</p>
              </div>
            ) : null}
            {data.templateSlug ? (
              <div className="space-y-2 border-t border-border-subtle pt-3">
                <div className="text-[11px] font-semibold text-text-muted flex items-center gap-1.5">
                  <GitFork size={12} />
                  <span>{t('templateDetail.forkedFrom')}</span>
                </div>
                <Link
                  to="/store/$name"
                  params={{ name: data.templateSlug }}
                  className="text-sm text-text-secondary transition-colors hover:text-primary"
                >
                  {data.templateSlug}
                </Link>
              </div>
            ) : null}
          </TemplateDetailQuickInfoPanel>
        }
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        <GlassPanel className="rounded-3xl p-6">
          {activeTab === 'agents' && (
            <TemplateAgentsTab
              agents={agents}
              emptyTitle={t('templateDetail.noAgents')}
              emptyDescription={t('templateDetail.noAgents')}
              introText={t('templateDetail.agentsInTemplate', { count: agents.length })}
            />
          )}
          {activeTab === 'editor' && (
            <>
              {!canEdit && (
                <div
                  className={cn(
                    'mb-4 rounded-lg border p-3 flex items-center gap-2 text-sm',
                    reviewStatus === 'pending'
                      ? 'bg-yellow-900/20 border-yellow-800/40 text-yellow-300'
                      : 'bg-blue-900/20 border-blue-800/40 text-blue-300',
                  )}
                >
                  <Shield size={14} />
                  {reviewStatus === 'pending'
                    ? t('templateDetail.editorLockedPending')
                    : t('templateDetail.editorLockedApproved')}
                </div>
              )}
              <EditorTab
                name={name}
                content={data.content}
                templateSlug={data.templateSlug}
                readOnly={!canEdit}
              />
            </>
          )}
          {activeTab === 'versions' && <VersionsTab name={name} />}
        </GlassPanel>
      </TemplateDetailShell>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('templates.deleteConfirm', { name })}
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
                onClick={() => deleteMutation.mutate()}
              >
                {t('common.delete')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isResubmit
                ? t('templateDetail.resubmitConfirmTitle')
                : t('templateDetail.publishConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isResubmit
                ? t('templateDetail.resubmitConfirmDescription')
                : t('templateDetail.publishConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="primary"
                loading={publishMutation.isPending}
                onClick={() => publishMutation.mutate()}
              >
                <Upload size={14} />
                {isResubmit
                  ? t('templateDetail.resubmitToCommunity')
                  : t('templateDetail.publishToCommunity')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
