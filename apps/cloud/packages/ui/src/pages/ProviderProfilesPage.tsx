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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NativeSelect,
  SecretInput,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownUp,
  ArrowLeft,
  Bell,
  CheckCircle,
  ChevronRight,
  Gauge,
  Globe2,
  Info,
  KeyRound,
  Loader2,
  Mail,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  ShieldCheck,
  TestTube2,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/PageShell'
import type {
  LlmLimitRule,
  LlmRouteAssignment,
  LlmRoutingPolicy,
  ProviderCatalogEntry,
  ProviderProfile,
  ProviderTestResult,
} from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
import { cn } from '@/lib/utils'
import { useToast } from '@/stores/toast'

interface ProviderProfileFormState {
  id?: string
  providerId: string
  name: string
  apiKey: string
  baseUrl: string
  apiFormat: 'openai' | 'anthropic' | 'gemini'
  authType: 'api_key'
  models: ProviderProfileModelFormState[]
  enabled: boolean
}

interface ProviderProfileModelFormState {
  clientId: string
  id: string
  name: string
  tags: string[]
  contextWindow: string
  maxTokens: string
  inputCost: string
  outputCost: string
  vision: boolean
  tools: boolean
  reasoning: boolean
}

interface LimitRuleFormState {
  id?: string
  metric: 'tokens' | 'cost'
  threshold: string
  period: 'day' | 'month'
  blockRequests: boolean
}

const MODEL_TAGS = ['default', 'fast', 'flash', 'reasoning', 'vision', 'tools'] as const
const ROUTE_IDS = ['default', 'simple', 'standard', 'complex', 'reasoning'] as const
const COMPLEXITY_ROUTE_IDS = ['simple', 'standard', 'complex', 'reasoning'] as const
const ROUTING_MODES = ['default', 'taskSpecific', 'custom'] as const

const EMPTY_FORM: ProviderProfileFormState = {
  providerId: '',
  name: '',
  apiKey: '',
  baseUrl: '',
  apiFormat: 'openai',
  authType: 'api_key',
  models: [],
  enabled: true,
}

const EMPTY_RULE_FORM: LimitRuleFormState = {
  metric: 'tokens',
  threshold: '',
  period: 'day',
  blockRequests: false,
}

function defaultProfileName(providerId: string): string {
  return providerId ? `${providerId}-default` : ''
}

function profileBaseUrl(profile: ProviderProfile): string {
  const value = profile.config.baseUrl
  return typeof value === 'string' ? value : ''
}

function catalogApiFormat(
  catalog: ProviderCatalogEntry | undefined,
): 'openai' | 'anthropic' | 'gemini' {
  if (catalog?.provider.api === 'google' || catalog?.provider.api === 'google-generative-ai') {
    return 'gemini'
  }
  if (catalog?.provider.api === 'anthropic' || catalog?.provider.api === 'anthropic-messages') {
    return 'anthropic'
  }
  return 'openai'
}

function providerDisplayName(catalog: ProviderCatalogEntry | undefined, fallback?: string): string {
  const raw = catalog?.pluginName ?? catalog?.provider.id ?? fallback ?? ''
  return raw
    .split(/[-_]/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ')
}

function providerInitial(catalog: ProviderCatalogEntry | undefined, fallback?: string): string {
  return providerDisplayName(catalog, fallback).charAt(0).toUpperCase() || 'P'
}

function providerProfileFor(
  profiles: ProviderProfile[],
  providerId: string,
): ProviderProfile | undefined {
  return profiles.find((profile) => profile.providerId === providerId)
}

function profileApiFormat(
  profile: ProviderProfile,
  catalog: ProviderCatalogEntry | undefined,
): 'openai' | 'anthropic' | 'gemini' {
  if (profile.config.apiFormat === 'gemini') return 'gemini'
  if (profile.config.apiFormat === 'anthropic') return 'anthropic'
  return catalogApiFormat(catalog)
}

function primarySecretKey(catalog: ProviderCatalogEntry | undefined): string {
  return catalog?.provider.envKey ?? ''
}

function statusText(result: ProviderTestResult | undefined): string | null {
  return result?.message ?? result?.error ?? null
}

function makeClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `model-${Date.now()}-${Math.random()}`
}

function emptyModel(): ProviderProfileModelFormState {
  return {
    clientId: makeClientId(),
    id: '',
    name: '',
    tags: ['default'],
    contextWindow: '',
    maxTokens: '',
    inputCost: '',
    outputCost: '',
    vision: false,
    tools: true,
    reasoning: false,
  }
}

function makeLimitRuleId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `rule-${Date.now()}-${Math.random()}`
}

function limitRuleForm(rule?: LlmLimitRule): LimitRuleFormState {
  if (!rule) return EMPTY_RULE_FORM
  return {
    id: rule.id,
    metric: rule.metric,
    threshold: String(rule.threshold),
    period: rule.period,
    blockRequests: rule.blockRequests,
  }
}

function serializeLimitRule(form: LimitRuleFormState): LlmLimitRule {
  return {
    id: form.id ?? makeLimitRuleId(),
    metric: form.metric,
    threshold: Number(form.threshold) || 0,
    period: form.period,
    blockRequests: form.blockRequests,
    enabled: true,
    triggered: 0,
  }
}

function formatThreshold(rule: LlmLimitRule): string {
  const value = Number.isInteger(rule.threshold)
    ? String(rule.threshold)
    : rule.threshold.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return rule.metric === 'cost' ? `$${value}` : value
}

function alertEmail(): string {
  const token = localStorage.getItem('accessToken')
  if (!token) return 'admin@shadowob.app'
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { email?: unknown }
    return typeof payload.email === 'string' && payload.email ? payload.email : 'admin@shadowob.app'
  } catch {
    return 'admin@shadowob.app'
  }
}

function numericField(value: string): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function profileModels(profile: ProviderProfile): ProviderProfileModelFormState[] {
  const rawModels = Array.isArray(profile.config.models) ? profile.config.models : []
  const models = rawModels
    .map((raw): ProviderProfileModelFormState | null => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
      const record = raw as Record<string, unknown>
      const id = typeof record.id === 'string' ? record.id.trim() : ''
      if (!id) return null
      return {
        clientId: makeClientId(),
        id,
        name: typeof record.name === 'string' ? record.name : '',
        tags: Array.isArray(record.tags)
          ? record.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
        contextWindow:
          typeof record.contextWindow === 'number' && Number.isFinite(record.contextWindow)
            ? String(record.contextWindow)
            : '',
        maxTokens:
          typeof record.maxTokens === 'number' && Number.isFinite(record.maxTokens)
            ? String(record.maxTokens)
            : '',
        inputCost:
          typeof (record.cost as Record<string, unknown> | undefined)?.input === 'number'
            ? String((record.cost as Record<string, number>).input)
            : '',
        outputCost:
          typeof (record.cost as Record<string, unknown> | undefined)?.output === 'number'
            ? String((record.cost as Record<string, number>).output)
            : '',
        vision: Boolean((record.capabilities as Record<string, unknown> | undefined)?.vision),
        tools:
          (record.capabilities as Record<string, unknown> | undefined)?.tools === undefined
            ? true
            : Boolean((record.capabilities as Record<string, unknown> | undefined)?.tools),
        reasoning: Boolean((record.capabilities as Record<string, unknown> | undefined)?.reasoning),
      }
    })
    .filter((model): model is ProviderProfileModelFormState => Boolean(model))

  const legacyModel = profile.config.modelId ?? profile.config.defaultModel ?? profile.config.model
  if (typeof legacyModel === 'string' && legacyModel.trim()) {
    models.push({
      ...emptyModel(),
      id: legacyModel.trim(),
      tags: ['default'],
    })
  }

  return models
}

function serializeModels(models: ProviderProfileModelFormState[]): Array<Record<string, unknown>> {
  const serialized: Array<Record<string, unknown>> = []

  for (const model of models) {
    const id = model.id.trim()
    if (!id) continue

    const contextWindow = numericField(model.contextWindow)
    const maxTokens = numericField(model.maxTokens)
    const inputCost = numericField(model.inputCost)
    const outputCost = numericField(model.outputCost)

    serialized.push({
      id,
      ...(model.name.trim() ? { name: model.name.trim() } : {}),
      ...(model.tags.length > 0 ? { tags: model.tags } : {}),
      ...(contextWindow ? { contextWindow } : {}),
      ...(maxTokens ? { maxTokens } : {}),
      ...(inputCost || outputCost
        ? {
            cost: {
              ...(inputCost ? { input: inputCost } : {}),
              ...(outputCost ? { output: outputCost } : {}),
            },
          }
        : {}),
      capabilities: {
        vision: model.vision,
        tools: model.tools,
        reasoning: model.reasoning,
      },
    })
  }

  return serialized
}

export function ProviderProfilesPage() {
  const api = useApiClient()
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ProviderProfileFormState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProviderProfile | null>(null)
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({})
  const [activeTab, setActiveTab] = useState('providers')
  const [policyDraft, setPolicyDraft] = useState<LlmRoutingPolicy | null>(null)
  const [connectDialogOpen, setConnectDialogOpen] = useState(false)
  const [routingMode, setRoutingMode] = useState<(typeof ROUTING_MODES)[number]>('default')
  const [ruleForm, setRuleForm] = useState<LimitRuleFormState | null>(null)

  const { data: catalogData, isLoading: isCatalogLoading } = useQuery({
    queryKey: ['provider-catalogs'],
    queryFn: api.providerCatalogs.list,
  })

  const { data: profileData, isLoading: isProfilesLoading } = useQuery({
    queryKey: ['provider-profiles'],
    queryFn: api.providerProfiles.list,
  })

  const { data: routingData, isLoading: isRoutingLoading } = useQuery({
    queryKey: ['provider-routing'],
    queryFn: api.providerRouting.get,
  })

  const catalogs = catalogData?.providers ?? []
  const profiles = profileData?.profiles ?? []
  const catalogById = useMemo(
    () => new Map(catalogs.map((catalog) => [catalog.provider.id, catalog])),
    [catalogs],
  )
  const defaultProfileNames = useMemo(
    () => new Set(catalogs.map((catalog) => defaultProfileName(catalog.provider.id))),
    [catalogs],
  )
  const selectedCatalog = form ? catalogById.get(form.providerId) : undefined
  const apiKeyCatalogs = useMemo(
    () => catalogs.filter((catalog) => catalog.provider.id !== 'custom'),
    [catalogs],
  )
  const customCatalog = catalogs.find((catalog) => catalog.provider.id === 'custom')

  useEffect(() => {
    if (routingData?.policy) setPolicyDraft(routingData.policy)
  }, [routingData?.policy])

  const saveProfile = useMutation({
    mutationFn: (state: ProviderProfileFormState) => {
      const catalog = catalogById.get(state.providerId)
      const envVars: Record<string, string> = {}
      const secretKey = primarySecretKey(catalog)
      if (secretKey && state.apiKey.trim()) envVars[secretKey] = state.apiKey.trim()

      const config: Record<string, unknown> = {}
      if (state.baseUrl.trim()) config.baseUrl = state.baseUrl.trim()
      config.apiFormat = state.apiFormat
      config.authType = 'api_key'
      const models = serializeModels(state.models)
      if (models.length > 0) config.models = models

      return api.providerProfiles.upsert({
        id: state.id,
        providerId: state.providerId,
        name: state.name.trim(),
        enabled: state.enabled,
        config,
        envVars,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['provider-profiles'] })
      setForm(null)
      toast.success(t('providers.profileSaved'))
    },
    onError: () => toast.error(t('providers.profileSaveFailed')),
  })

  const deleteProfile = useMutation({
    mutationFn: (profile: ProviderProfile) => api.providerProfiles.delete(profile.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['provider-profiles'] })
      setDeleteTarget(null)
      toast.success(t('providers.profileDeleted'))
    },
    onError: () => toast.error(t('providers.profileDeleteFailed')),
  })

  const testProfile = useMutation({
    mutationFn: (profile: ProviderProfile) => api.providerProfiles.test(profile.id),
    onSuccess: (result, profile) => {
      setTestResults((current) => ({ ...current, [profile.id]: result }))
      if (result.ok) toast.success(t('providers.testPassed'))
      else toast.error(t('providers.testFailed'))
    },
    onError: (_error, profile) => {
      setTestResults((current) => ({
        ...current,
        [profile.id]: { ok: false, message: t('providers.testFailed') },
      }))
      toast.error(t('providers.testFailed'))
    },
  })

  const refreshModels = useMutation({
    mutationFn: (profile: ProviderProfile) => api.providerProfiles.refreshModels(profile.id),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['provider-profiles'] }),
        queryClient.invalidateQueries({ queryKey: ['provider-routing'] }),
      ])
      if (result.ok) toast.success(t('providers.modelsRefreshed'))
      else toast.error(result.message ?? t('providers.modelsRefreshFailed'))
    },
    onError: () => toast.error(t('providers.modelsRefreshFailed')),
  })

  const saveRouting = useMutation({
    mutationFn: (policy: LlmRoutingPolicy) => api.providerRouting.put(policy),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['provider-routing'] })
      toast.success(t('providers.routingSaved'))
    },
    onError: () => toast.error(t('providers.routingSaveFailed')),
  })

  const toggleProfile = (profile: ProviderProfile) => {
    saveProfile.mutate({
      id: profile.id,
      providerId: profile.providerId,
      name: profile.name,
      apiKey: '',
      baseUrl: profileBaseUrl(profile),
      apiFormat: profileApiFormat(profile, catalogById.get(profile.providerId)),
      authType: 'api_key',
      models: profileModels(profile),
      enabled: !profile.enabled,
    })
  }

  const openConnectDialog = () => {
    setForm(null)
    setConnectDialogOpen(true)
  }

  const openCreate = (providerId?: string) => {
    const nextProviderId = providerId ?? catalogs[0]?.provider.id ?? ''
    setForm({
      ...EMPTY_FORM,
      providerId: nextProviderId,
      name: defaultProfileName(nextProviderId),
      apiFormat: catalogApiFormat(catalogById.get(nextProviderId)),
      authType: 'api_key',
    })
    setConnectDialogOpen(true)
  }

  const profileFormState = (profile: ProviderProfile): ProviderProfileFormState => ({
    id: profile.id,
    providerId: profile.providerId,
    name: profile.name,
    apiKey: '',
    baseUrl: profileBaseUrl(profile),
    apiFormat: profileApiFormat(profile, catalogById.get(profile.providerId)),
    authType: 'api_key',
    models: profileModels(profile),
    enabled: profile.enabled,
  })

  const openEdit = (profile: ProviderProfile) => {
    setConnectDialogOpen(false)
    setForm(profileFormState(profile))
  }

  const openEditFromConnect = (profile: ProviderProfile) => {
    setConnectDialogOpen(true)
    setForm(profileFormState(profile))
  }

  const closeProviderDialog = () => {
    setForm(null)
    setConnectDialogOpen(false)
  }

  const backToProviderList = () => {
    setForm(null)
    setConnectDialogOpen(true)
  }

  const submitDisabled =
    saveProfile.isPending || !form?.providerId || !form.name.trim() || !selectedCatalog
  const availableModels = routingData?.models ?? []
  const accountEmail = useMemo(alertEmail, [])
  const firstEnabledProfile = profiles.find((profile) => profile.enabled)

  const routeAssignment = (
    policy: LlmRoutingPolicy,
    route: (typeof ROUTE_IDS)[number],
  ): LlmRouteAssignment => (route === 'default' ? policy.defaultRoute : policy.complexity[route])

  const updateRoute = (
    route: (typeof ROUTE_IDS)[number],
    updater: (assignment: LlmRouteAssignment) => LlmRouteAssignment,
  ) => {
    setPolicyDraft((current) => {
      if (!current) return current
      if (route === 'default') return { ...current, defaultRoute: updater(current.defaultRoute) }
      return {
        ...current,
        complexity: {
          ...current.complexity,
          [route]: updater(current.complexity[route]),
        },
      }
    })
  }

  const updatePolicy = (updater: (policy: LlmRoutingPolicy) => LlmRoutingPolicy) => {
    setPolicyDraft((current) => (current ? updater(current) : current))
  }

  const addFallbackModel = (route: (typeof ROUTE_IDS)[number]) => {
    updateRoute(route, (current) => {
      const candidate = availableModels.find(
        (model) => model.ref !== current.primary && !current.fallbacks.includes(model.ref),
      )
      if (!candidate) return current
      return { ...current, fallbacks: [...current.fallbacks, candidate.ref].slice(0, 5) }
    })
  }

  const updateFallbackModel = (
    route: (typeof ROUTE_IDS)[number],
    index: number,
    modelRef: string,
  ) => {
    updateRoute(route, (current) => {
      const fallbacks = [...current.fallbacks]
      if (modelRef) fallbacks[index] = modelRef
      else fallbacks.splice(index, 1)
      return { ...current, fallbacks: fallbacks.filter(Boolean).slice(0, 5) }
    })
  }

  const saveRule = () => {
    if (!ruleForm || !policyDraft) return
    const rule = serializeLimitRule(ruleForm)
    if (rule.threshold <= 0) return
    const existing = policyDraft.rules ?? []
    const rules = ruleForm.id
      ? existing.map((item) =>
          item.id === rule.id
            ? { ...rule, triggered: item.triggered, enabled: item.enabled }
            : item,
        )
      : [...existing, rule]
    const nextPolicy = { ...policyDraft, rules }
    setPolicyDraft(nextPolicy)
    saveRouting.mutate(nextPolicy)
    setRuleForm(null)
  }

  const deleteRule = (ruleId: string) => {
    if (!policyDraft) return
    const nextPolicy = {
      ...policyDraft,
      rules: (policyDraft.rules ?? []).filter((rule) => rule.id !== ruleId),
    }
    setPolicyDraft(nextPolicy)
    saveRouting.mutate(nextPolicy)
  }

  const modelLabel = (ref: string | undefined) => {
    if (!ref) return t('providers.autoSelect')
    const model = availableModels.find((item) => item.ref === ref)
    return model ? `${model.profileName} / ${model.name ?? model.id}` : ref
  }

  const providerModelCount = (profile: ProviderProfile) => profileModels(profile).length
  const shouldShowBaseUrlInBasic = Boolean(
    form && (selectedCatalog?.provider.id === 'custom' || form.baseUrl.trim()),
  )

  return (
    <PageShell
      breadcrumb={[]}
      title={t('providers.title')}
      description={t('providers.description')}
      narrow
      actions={
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={openConnectDialog}
          disabled={catalogs.length === 0}
        >
          <Plus size={14} />
          {t('providers.addProvider')}
        </Button>
      }
      headerContent={
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/20 bg-success/5 px-4 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
            <ShieldCheck size={13} />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-semibold text-success">
              {t('providers.encryptionActive')}
            </span>
            <span className="ml-2 text-xs text-text-muted">
              {t('providers.encryptionDescription')}
            </span>
          </div>
          <span className="shrink-0 rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
            {profiles.filter((profile) => profile.enabled).length} {t('providers.enabledProfiles')}
          </span>
        </div>
      }
    >
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabsList className="mb-5 flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-2xl">
          <TabsTrigger value="providers" className="gap-2">
            <KeyRound size={14} />
            {t('providers.tabs.providers')}
          </TabsTrigger>
          <TabsTrigger value="routing" className="gap-2">
            <Route size={14} />
            {t('providers.tabs.routing')}
          </TabsTrigger>
          <TabsTrigger value="limits" className="gap-2">
            <Gauge size={14} />
            {t('providers.tabs.limits')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'providers' && (
        <>
          {isCatalogLoading || isProfilesLoading ? (
            <div className="flex items-center justify-center py-20 text-sm text-text-muted">
              <Loader2 size={18} className="mr-2 animate-spin" />
              {t('common.loading')}
            </div>
          ) : profiles.length === 0 ? (
            <Card variant="glass">
              <EmptyState
                icon={KeyRound}
                title={t('providers.noProfiles')}
                description={t('providers.noProfilesDescription')}
                action={
                  <Button type="button" variant="primary" size="sm" onClick={openConnectDialog}>
                    <Plus size={14} />
                    {t('providers.addProvider')}
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {profiles.map((profile) => {
                const catalog = catalogById.get(profile.providerId)
                const result = testResults[profile.id]
                const isTesting = testProfile.isPending && testProfile.variables?.id === profile.id
                const isRefreshing =
                  refreshModels.isPending && refreshModels.variables?.id === profile.id
                return (
                  <Card key={profile.id} variant="glass" className="p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-sm font-black text-primary">
                          {providerInitial(catalog, profile.providerId)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-black text-text-primary">
                              {profile.name}
                            </h3>
                            <Badge variant={profile.enabled ? 'success' : 'neutral'} size="sm">
                              {profile.enabled ? t('providers.enabled') : t('providers.disabled')}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-text-muted">
                            {catalog?.pluginName ?? profile.providerId}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
                            <span className="rounded-full border border-border-subtle/60 bg-bg-secondary/35 px-2.5 py-1">
                              {profile.envVars.length > 0
                                ? t('providers.keySaved')
                                : t('providers.noSecretValue')}
                            </span>
                            <span className="rounded-full border border-border-subtle/60 bg-bg-secondary/35 px-2.5 py-1">
                              {t('providers.modelsCount', {
                                count: providerModelCount(profile),
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => testProfile.mutate(profile)}
                          disabled={isTesting || !profile.enabled}
                          title={t('providers.testConnection')}
                        >
                          {isTesting ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <TestTube2 size={13} />
                          )}
                          {t('providers.testConnectionShort')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => refreshModels.mutate(profile)}
                          disabled={isRefreshing || !profile.enabled}
                          title={t('providers.refreshModels')}
                        >
                          {isRefreshing ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <RefreshCw size={13} />
                          )}
                          {t('providers.refreshModelsShort')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => openEdit(profile)}
                          title={t('common.edit')}
                        >
                          <Pencil size={13} />
                          {t('common.edit')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="text-danger/70 hover:text-danger"
                          onClick={() => setDeleteTarget(profile)}
                          title={t('common.delete')}
                        >
                          <Trash2 size={13} />
                          {t('common.delete')}
                        </Button>
                        <Switch
                          checked={profile.enabled}
                          onCheckedChange={() => toggleProfile(profile)}
                          disabled={saveProfile.isPending}
                        />
                      </div>
                    </div>

                    {result && (
                      <div
                        className={cn(
                          'mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs',
                          result.ok
                            ? 'border-success/25 bg-success/8 text-success'
                            : 'border-danger/25 bg-danger/8 text-danger',
                        )}
                      >
                        {result.ok ? (
                          <CheckCircle size={13} className="mt-0.5 shrink-0" />
                        ) : (
                          <XCircle size={13} className="mt-0.5 shrink-0" />
                        )}
                        <span className="min-w-0 break-words">{statusText(result)}</span>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'routing' && (
        <Card variant="glass" className="p-6">
          {isRoutingLoading || !policyDraft ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-muted">
              <Loader2 size={18} className="mr-2 animate-spin" />
              {t('common.loading')}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle/35 pb-5">
                <div>
                  <h2 className="text-3xl font-black text-text-primary">
                    {t('providers.routingTitle')}
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    {t('providers.routingManifestDescription', {
                      count: routingData?.summary.enabledProfiles ?? 0,
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={refreshModels.isPending}
                    disabled={profiles.filter((profile) => profile.enabled).length === 0}
                    onClick={() => {
                      for (const profile of profiles.filter((item) => item.enabled)) {
                        refreshModels.mutate(profile)
                      }
                    }}
                  >
                    <RefreshCw size={14} />
                    {t('providers.refreshModels')}
                  </Button>
                  <Button type="button" variant="primary" size="sm" onClick={openConnectDialog}>
                    <Plus size={14} />
                    {t('providers.connectProvidersAction')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={saveRouting.isPending}
                    onClick={() => policyDraft && saveRouting.mutate(policyDraft)}
                  >
                    {t('providers.saveRouting')}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="inline-flex items-center gap-2 text-sm font-bold text-text-muted">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-md text-primary">
                    {providerInitial(
                      catalogById.get(firstEnabledProfile?.providerId ?? ''),
                      firstEnabledProfile?.providerId,
                    )}
                  </span>
                  {t('providers.connectionCount', {
                    count: routingData?.summary.enabledProfiles ?? 0,
                  })}
                </p>
                <a
                  href="#routing-help"
                  className="inline-flex items-center gap-1 text-xs font-semibold italic text-text-muted hover:text-primary"
                >
                  {t('providers.howRoutingWorks')}
                  <Info size={13} />
                </a>
              </div>

              <div className="inline-flex rounded-xl bg-bg-secondary/45 p-1">
                {ROUTING_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={cn(
                      'inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-black transition-colors',
                      routingMode === mode
                        ? 'bg-bg-primary text-text-primary shadow-[var(--shadow-soft)]'
                        : 'text-text-muted hover:text-text-primary',
                    )}
                    onClick={() => setRoutingMode(mode)}
                  >
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        routingMode === mode ? 'bg-primary' : 'bg-border-subtle',
                      )}
                    />
                    {t(`providers.routingModes.${mode}`)}
                  </button>
                ))}
              </div>

              {routingMode === 'default' ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="max-w-3xl text-sm text-text-muted">
                      {t('providers.routeByComplexityDescription')}
                    </p>
                    <label className="inline-flex items-center gap-3 text-sm font-bold text-text-primary">
                      {t('providers.routeByComplexity')}
                      <Switch
                        checked={policyDraft.enabled}
                        onCheckedChange={(enabled) =>
                          updatePolicy((policy) => ({ ...policy, enabled }))
                        }
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
                    {COMPLEXITY_ROUTE_IDS.map((route) => {
                      const assignment = routeAssignment(policyDraft, route)
                      return (
                        <div
                          key={route}
                          className="flex min-h-[300px] flex-col rounded-2xl border border-border-subtle/50 bg-bg-secondary/20 p-4"
                        >
                          <h3 className="text-base font-black text-text-primary">
                            {t(`providers.routes.${route}`)}
                          </h3>

                          <div className="mt-3 rounded-xl border border-border-subtle/45 bg-bg-primary/25 p-3">
                            <div className="mb-2 flex items-center gap-2">
                              <ArrowDownUp size={13} className="text-text-muted" />
                              <Badge variant={assignment.primary ? 'success' : 'neutral'} size="sm">
                                {assignment.primary ? t('providers.manual') : t('providers.auto')}
                              </Badge>
                            </div>
                            <NativeSelect
                              value={assignment.primary ?? ''}
                              onChange={(event) =>
                                updateRoute(route, (current) => ({
                                  ...current,
                                  primary: event.target.value || undefined,
                                }))
                              }
                            >
                              <option value="">{t('providers.autoSelect')}</option>
                              {availableModels.map((model) => (
                                <option key={model.ref} value={model.ref}>
                                  {modelLabel(model.ref)}
                                </option>
                              ))}
                            </NativeSelect>
                            <Input
                              className="mt-2"
                              value={assignment.selector}
                              onChange={(event) =>
                                updateRoute(route, (current) => ({
                                  ...current,
                                  selector: event.target.value,
                                }))
                              }
                              placeholder={t('providers.selectorPlaceholder')}
                            />
                          </div>

                          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
                            {assignment.fallbacks.length === 0 ? (
                              <>
                                <ArrowDownUp size={24} className="text-text-muted/50" />
                                <div>
                                  <p className="text-sm font-black text-text-muted">
                                    {t('providers.noFallbacks')}
                                  </p>
                                  <p className="mt-1 text-xs text-text-muted">
                                    {t('providers.noFallbacksDescription')}
                                  </p>
                                </div>
                              </>
                            ) : (
                              <div className="w-full space-y-2">
                                {assignment.fallbacks.map((fallback, index) => (
                                  <NativeSelect
                                    key={`${fallback}-${index}`}
                                    value={fallback}
                                    onChange={(event) =>
                                      updateFallbackModel(route, index, event.target.value)
                                    }
                                  >
                                    <option value="">
                                      {t('providers.fallbackSlot', { index: index + 1 })}
                                    </option>
                                    {availableModels
                                      .filter((model) => model.ref !== assignment.primary)
                                      .map((model) => (
                                        <option key={model.ref} value={model.ref}>
                                          {modelLabel(model.ref)}
                                        </option>
                                      ))}
                                  </NativeSelect>
                                ))}
                              </div>
                            )}
                            <Button
                              type="button"
                              variant="secondary"
                              size="xs"
                              onClick={() => addFallbackModel(route)}
                              disabled={
                                availableModels.length === 0 || assignment.fallbacks.length >= 5
                              }
                            >
                              <ArrowDownUp size={13} />
                              {t('providers.addFallback')}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-border-subtle/45 bg-bg-secondary/15 p-10 text-center">
                  <p className="text-lg font-black text-text-primary">
                    {t(`providers.routingModeTitles.${routingMode}`)}
                  </p>
                  <p className="mx-auto mt-2 max-w-2xl text-sm text-text-muted">
                    {t(`providers.routingModeDescriptions.${routingMode}`)}
                  </p>
                </div>
              )}

              <div id="routing-help" className="border-t border-border-subtle/35 pt-4 text-right">
                <span className="text-xs text-text-muted">{t('providers.setupInstructions')}</span>
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'limits' && (
        <Card variant="glass" className="p-6">
          {isRoutingLoading || !policyDraft ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-muted">
              <Loader2 size={18} className="mr-2 animate-spin" />
              {t('common.loading')}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle/35 pb-5">
                <div>
                  <h2 className="text-3xl font-black text-text-primary">
                    {t('providers.limitsTitle')}
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    {t('providers.limitsManifestDescription', {
                      count: routingData?.summary.enabledProfiles ?? 0,
                    })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setRuleForm(EMPTY_RULE_FORM)}
                >
                  <Plus size={14} />
                  {t('providers.createRule')}
                </Button>
              </div>

              <div className="flex items-start gap-4 rounded-2xl border border-primary/35 bg-primary/5 p-5">
                <Info size={20} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="text-base font-black text-text-primary">
                    {t('providers.connectProviderForHardLimits')}
                  </p>
                  <p className="mt-2 max-w-4xl text-sm leading-7 text-text-muted">
                    {t('providers.connectProviderForHardLimitsDescription')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-2xl border border-border-subtle/45 bg-bg-secondary/15 p-5">
                <Mail size={22} className="shrink-0 text-primary" />
                <div>
                  <p className="text-base font-black text-text-primary">
                    {t('providers.emailAlerts')}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    {t('providers.emailAlertsDescription', { email: accountEmail })}
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border-subtle/45 bg-bg-secondary/15">
                <div className="p-5">
                  <h3 className="text-base font-black text-text-primary">
                    {t('providers.rulesTitle')}
                  </h3>
                </div>

                {(policyDraft.rules ?? []).length === 0 ? (
                  <div className="flex min-h-64 flex-col items-center justify-center px-6 py-16 text-center">
                    <p className="text-2xl font-black text-text-primary">
                      {t('providers.noRulesYet')}
                    </p>
                    <p className="mt-4 max-w-2xl text-lg text-text-muted">
                      {t('providers.noRulesYetDescription')}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border-t border-border-subtle/35">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="text-text-muted">
                        <tr>
                          <th className="px-6 py-4 font-black">{t('providers.ruleType')}</th>
                          <th className="px-6 py-4 font-black">{t('providers.ruleThreshold')}</th>
                          <th className="px-6 py-4 font-black">{t('providers.ruleTriggered')}</th>
                          <th className="px-6 py-4 text-right font-black">
                            {t('providers.ruleActions')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(policyDraft.rules ?? []).map((rule) => (
                          <tr key={rule.id} className="border-t border-border-subtle/35">
                            <td className="px-6 py-5">
                              <Bell size={18} className="text-text-primary" />
                            </td>
                            <td className="px-6 py-5 text-lg text-text-primary">
                              <span className="font-mono">{formatThreshold(rule)}</span>
                              <span className="ml-2 text-text-muted">
                                {t(`providers.ruleMetrics.${rule.metric}`)}{' '}
                                {t(`providers.rulePeriods.inline.${rule.period}`)}
                              </span>
                            </td>
                            <td className="px-6 py-5 font-mono text-lg text-text-primary">
                              {rule.triggered}
                            </td>
                            <td className="px-6 py-5 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button type="button" variant="ghost" size="icon">
                                    <MoreVertical size={16} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => setRuleForm(limitRuleForm(rule))}
                                  >
                                    <Pencil size={15} />
                                    {t('common.edit')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    variant="danger"
                                    onClick={() => deleteRule(rule.id)}
                                  >
                                    <Trash2 size={15} />
                                    {t('common.delete')}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <details className="rounded-2xl border border-border-subtle/45 bg-bg-secondary/15 p-4">
                <summary className="cursor-pointer text-sm font-black text-text-primary">
                  {t('providers.advancedLimits')}
                </summary>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Input
                    type="number"
                    min={1}
                    value={policyDraft.limits.requestsPerMinute}
                    onChange={(event) =>
                      updatePolicy((policy) => ({
                        ...policy,
                        limits: {
                          ...policy.limits,
                          requestsPerMinute: Number(event.target.value) || 1,
                        },
                      }))
                    }
                    label={t('providers.requestsPerMinute')}
                  />
                  <Input
                    type="number"
                    min={1}
                    value={policyDraft.limits.concurrentRequests}
                    onChange={(event) =>
                      updatePolicy((policy) => ({
                        ...policy,
                        limits: {
                          ...policy.limits,
                          concurrentRequests: Number(event.target.value) || 1,
                        },
                      }))
                    }
                    label={t('providers.concurrentRequests')}
                  />
                  <Input
                    type="number"
                    min={0}
                    value={policyDraft.limits.monthlyBudgetUsd ?? ''}
                    onChange={(event) =>
                      updatePolicy((policy) => ({
                        ...policy,
                        limits: {
                          ...policy.limits,
                          monthlyBudgetUsd: Number(event.target.value) || undefined,
                        },
                      }))
                    }
                    label={t('providers.monthlyBudgetUsd')}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between gap-4 border-t border-border-subtle/35 pt-4">
                  <div>
                    <h3 className="text-sm font-black text-text-primary">
                      {t('providers.fallbackPolicy')}
                    </h3>
                    <p className="text-xs text-text-muted">
                      {t('providers.fallbackPolicyDescription')}
                    </p>
                  </div>
                  <Switch
                    checked={policyDraft.fallback.enabled}
                    onCheckedChange={(enabled) =>
                      updatePolicy((policy) => ({
                        ...policy,
                        fallback: { ...policy.fallback, enabled },
                      }))
                    }
                  />
                </div>
                <Input
                  className="mt-3"
                  value={policyDraft.fallback.statusCodes.join(', ')}
                  onChange={(event) =>
                    updatePolicy((policy) => ({
                      ...policy,
                      fallback: {
                        ...policy.fallback,
                        statusCodes: event.target.value
                          .split(',')
                          .map((value) => Number(value.trim()))
                          .filter((value) => value >= 400 && value <= 599),
                      },
                    }))
                  }
                  placeholder="408, 429, 500, 502, 503, 504"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-4"
                  loading={saveRouting.isPending}
                  onClick={() => policyDraft && saveRouting.mutate(policyDraft)}
                >
                  {t('providers.saveRouting')}
                </Button>
              </details>
            </div>
          )}
        </Card>
      )}

      {connectDialogOpen && !form && (
        <Modal open onClose={closeProviderDialog}>
          <ModalContent size="md">
            <ModalHeader
              icon={<KeyRound size={18} />}
              title={t('providers.connectProvidersTitle')}
              subtitle={t('providers.connectProvidersDescription')}
            />
            <ModalBody className="space-y-4">
              <p className="text-sm text-text-muted">{t('providers.apiKeyProvidersDescription')}</p>

              <div className="space-y-2">
                {apiKeyCatalogs.map((catalog) => {
                  const existingProfile = providerProfileFor(profiles, catalog.provider.id)
                  return (
                    <button
                      key={catalog.provider.id}
                      type="button"
                      className="group flex w-full items-center gap-3 rounded-2xl border border-border-subtle/70 bg-bg-secondary/20 px-4 py-3 text-left transition-colors hover:border-primary/35 hover:bg-primary/5"
                      onClick={() =>
                        existingProfile
                          ? openEditFromConnect(existingProfile)
                          : openCreate(catalog.provider.id)
                      }
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-sm font-black text-primary">
                        {providerInitial(catalog)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-text-primary">
                          {providerDisplayName(catalog)}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {primarySecretKey(catalog)}
                        </span>
                      </span>
                      <Badge variant={existingProfile?.enabled ? 'success' : 'neutral'} size="sm">
                        {existingProfile
                          ? t('providers.providerConnected')
                          : t('providers.providerAvailable')}
                      </Badge>
                      <ChevronRight
                        size={16}
                        className="text-text-muted transition-colors group-hover:text-primary"
                      />
                    </button>
                  )
                })}

                {customCatalog && (
                  <button
                    type="button"
                    className="group flex w-full items-center gap-3 rounded-2xl border border-dashed border-border-subtle/80 bg-bg-secondary/10 px-4 py-3 text-left transition-colors hover:border-primary/35 hover:bg-primary/5"
                    onClick={() => openCreate(customCatalog.provider.id)}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                      <Globe2 size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black text-text-primary">
                        {t('providers.addCustomProvider')}
                      </span>
                      <span className="block text-xs text-text-muted">
                        {t('providers.customProviderDescription')}
                      </span>
                    </span>
                    <ChevronRight
                      size={16}
                      className="text-text-muted transition-colors group-hover:text-primary"
                    />
                  </button>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButtonGroup>
                <Button type="button" variant="ghost" onClick={closeProviderDialog}>
                  {t('common.cancel')}
                </Button>
              </ModalButtonGroup>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      {form && (
        <Modal
          open
          onClose={form.id || !connectDialogOpen ? () => setForm(null) : closeProviderDialog}
        >
          <ModalContent size="md">
            <ModalHeader
              icon={
                <span className="text-sm font-black">
                  {providerInitial(selectedCatalog, form.providerId)}
                </span>
              }
              title={
                form.id
                  ? t('providers.editProfile')
                  : t('providers.connectProviderTitle', {
                      provider: providerDisplayName(selectedCatalog, form.providerId),
                    })
              }
              subtitle={t('providers.profileDialogDescription')}
              action={
                !form.id && connectDialogOpen ? (
                  <Button type="button" variant="ghost" size="xs" onClick={backToProviderList}>
                    <ArrowLeft size={13} />
                    {t('providers.backToProviders')}
                  </Button>
                ) : undefined
              }
            />
            <ModalBody className="space-y-5 py-5">
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-black text-text-primary">
                    {t('providers.basicTitle')}
                  </h3>
                  <p className="text-xs text-text-muted">{t('providers.basicDescription')}</p>
                </div>

                {(!connectDialogOpen || form.id) && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="provider-profile-provider"
                        className="mb-1 block text-xs font-bold"
                      >
                        {t('providers.provider')}
                      </label>
                      <NativeSelect
                        id="provider-profile-provider"
                        value={form.providerId}
                        disabled={Boolean(form.id)}
                        onChange={(event) => {
                          const providerId = event.target.value
                          const shouldRefreshDefaultName =
                            !form.name || defaultProfileNames.has(form.name)
                          setForm({
                            ...form,
                            providerId,
                            name: shouldRefreshDefaultName
                              ? defaultProfileName(providerId)
                              : form.name,
                            apiFormat: catalogApiFormat(catalogById.get(providerId)),
                          })
                        }}
                      >
                        <option value="">{t('providers.selectProvider')}</option>
                        {catalogs.map((catalog) => (
                          <option key={catalog.provider.id} value={catalog.provider.id}>
                            {catalog.provider.id}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>

                    <div>
                      <label
                        htmlFor="provider-profile-name"
                        className="mb-1 block text-xs font-bold"
                      >
                        {t('providers.profileName')}
                      </label>
                      <Input
                        id="provider-profile-name"
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        placeholder={t('providers.profileNamePlaceholder')}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="provider-profile-api-key"
                    className="mb-1 block text-xs font-bold"
                  >
                    {primarySecretKey(selectedCatalog) || t('providers.apiKey')}
                  </label>
                  <SecretInput
                    id="provider-profile-api-key"
                    value={form.apiKey}
                    onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                    placeholder={
                      form.id
                        ? t('providers.apiKeyEditPlaceholder')
                        : t('providers.apiKeyPlaceholder')
                    }
                    autoComplete="new-password"
                    data-bwignore="true"
                  />
                </div>

                {shouldShowBaseUrlInBasic && (
                  <div>
                    <label
                      htmlFor="provider-profile-base-url"
                      className="mb-1 block text-xs font-bold"
                    >
                      {t('providers.baseUrl')}
                    </label>
                    <Input
                      id="provider-profile-base-url"
                      value={form.baseUrl}
                      onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                      placeholder={
                        selectedCatalog?.provider.baseUrl ?? t('providers.baseUrlPlaceholder')
                      }
                    />
                  </div>
                )}

                <label className="flex min-h-12 items-center justify-between rounded-2xl border border-border-subtle/45 bg-bg-secondary/15 px-4 py-2 text-sm font-bold">
                  <span className="text-text-primary">{t('providers.enabled')}</span>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(enabled) => setForm({ ...form, enabled })}
                  />
                </label>
              </section>

              <details className="rounded-2xl border border-border-subtle/45 bg-bg-secondary/15 p-4">
                <summary className="cursor-pointer text-sm font-black text-text-primary">
                  {t('providers.advancedTitle')}
                  <span className="ml-2 text-xs font-semibold text-text-muted">
                    {t('providers.advancedDescription')}
                  </span>
                </summary>

                <div className="mt-4 space-y-4">
                  {!shouldShowBaseUrlInBasic && (
                    <div>
                      <label
                        htmlFor="provider-profile-base-url-advanced"
                        className="mb-1 block text-xs font-bold"
                      >
                        {t('providers.baseUrl')}
                      </label>
                      <Input
                        id="provider-profile-base-url-advanced"
                        value={form.baseUrl}
                        onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                        placeholder={
                          selectedCatalog?.provider.baseUrl ?? t('providers.baseUrlPlaceholder')
                        }
                      />
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="provider-profile-api-format"
                      className="mb-1 block text-xs font-bold"
                    >
                      {t('providers.apiFormat')}
                    </label>
                    <NativeSelect
                      id="provider-profile-api-format"
                      value={form.apiFormat}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          apiFormat: event.target.value as 'openai' | 'anthropic' | 'gemini',
                        })
                      }
                    >
                      <option value="openai">{t('providers.apiFormats.openai')}</option>
                      <option value="anthropic">{t('providers.apiFormats.anthropic')}</option>
                      <option value="gemini">{t('providers.apiFormats.gemini')}</option>
                    </NativeSelect>
                  </div>

                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-text-primary">
                          {t('providers.modelsTitle')}
                        </h3>
                        <p className="text-xs text-text-muted">
                          {t('providers.modelsDescription')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        onClick={() => setForm({ ...form, models: [...form.models, emptyModel()] })}
                      >
                        <Plus size={12} />
                        {t('providers.addModel')}
                      </Button>
                    </div>
                    {selectedCatalog?.provider.models.length ? (
                      <datalist id="provider-profile-model-options">
                        {selectedCatalog.provider.models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name ?? model.id}
                          </option>
                        ))}
                      </datalist>
                    ) : null}
                    {form.models.length === 0 ? (
                      <button
                        type="button"
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border-subtle/50 bg-bg-primary/10 px-4 py-3 text-sm font-bold text-text-muted transition-colors hover:border-primary/40 hover:text-primary"
                        onClick={() => setForm({ ...form, models: [emptyModel()] })}
                      >
                        <Plus size={14} />
                        {t('providers.addFirstModel')}
                      </button>
                    ) : (
                      <div className="space-y-3">
                        {form.models.map((model, index) => (
                          <div
                            key={model.clientId}
                            className="rounded-2xl border border-border-subtle/35 bg-bg-primary/15 p-3"
                          >
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                              <Input
                                value={model.id}
                                onChange={(event) => {
                                  const models = [...form.models]
                                  models[index] = { ...model, id: event.target.value }
                                  setForm({ ...form, models })
                                }}
                                placeholder={t('providers.modelIdPlaceholder')}
                                list="provider-profile-model-options"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-12 w-12 self-end"
                                title={t('common.delete')}
                                onClick={() =>
                                  setForm({
                                    ...form,
                                    models: form.models.filter(
                                      (item) => item.clientId !== model.clientId,
                                    ),
                                  })
                                }
                              >
                                <Trash2 size={15} />
                              </Button>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {MODEL_TAGS.map((tag) => {
                                const active = model.tags.includes(tag)
                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    className={cn(
                                      'rounded-full border px-3 py-1 text-[11px] font-black uppercase transition-colors',
                                      active
                                        ? 'border-primary/50 bg-primary/15 text-primary'
                                        : 'border-border-subtle text-text-muted hover:border-primary/40 hover:text-primary',
                                    )}
                                    onClick={() => {
                                      const tags = active
                                        ? model.tags.filter((item) => item !== tag)
                                        : [...model.tags, tag]
                                      const models = [...form.models]
                                      models[index] = { ...model, tags }
                                      setForm({ ...form, models })
                                    }}
                                  >
                                    {t(`providers.modelTags.${tag}`)}
                                  </button>
                                )
                              })}
                            </div>

                            <details className="mt-3 border-t border-border-subtle/35 pt-3">
                              <summary className="cursor-pointer text-xs font-black text-text-muted">
                                {t('providers.modelDetails')}
                              </summary>
                              <div className="mt-3 space-y-3">
                                <Input
                                  value={model.name}
                                  onChange={(event) => {
                                    const models = [...form.models]
                                    models[index] = { ...model, name: event.target.value }
                                    setForm({ ...form, models })
                                  }}
                                  placeholder={t('providers.modelNamePlaceholder')}
                                />
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={model.contextWindow}
                                    onChange={(event) => {
                                      const models = [...form.models]
                                      models[index] = {
                                        ...model,
                                        contextWindow: event.target.value,
                                      }
                                      setForm({ ...form, models })
                                    }}
                                    placeholder={t('providers.contextWindowPlaceholder')}
                                  />
                                  <Input
                                    type="number"
                                    min={1}
                                    value={model.maxTokens}
                                    onChange={(event) => {
                                      const models = [...form.models]
                                      models[index] = { ...model, maxTokens: event.target.value }
                                      setForm({ ...form, models })
                                    }}
                                    placeholder={t('providers.maxTokensPlaceholder')}
                                  />
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.000001"
                                    value={model.inputCost}
                                    onChange={(event) => {
                                      const models = [...form.models]
                                      models[index] = { ...model, inputCost: event.target.value }
                                      setForm({ ...form, models })
                                    }}
                                    placeholder={t('providers.inputCostPlaceholder')}
                                  />
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.000001"
                                    value={model.outputCost}
                                    onChange={(event) => {
                                      const models = [...form.models]
                                      models[index] = { ...model, outputCost: event.target.value }
                                      setForm({ ...form, models })
                                    }}
                                    placeholder={t('providers.outputCostPlaceholder')}
                                  />
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                  {(['vision', 'tools', 'reasoning'] as const).map((capability) => (
                                    <label
                                      key={capability}
                                      className="flex h-12 items-center justify-between rounded-2xl border border-border-subtle/60 bg-bg-primary/35 px-3 text-xs font-bold text-text-secondary"
                                    >
                                      <span>{t(`providers.capabilities.${capability}`)}</span>
                                      <Switch
                                        checked={model[capability]}
                                        onCheckedChange={(checked) => {
                                          const models = [...form.models]
                                          models[index] = { ...model, [capability]: checked }
                                          setForm({ ...form, models })
                                        }}
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </details>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </details>
            </ModalBody>
            <ModalFooter>
              <ModalButtonGroup>
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  loading={saveProfile.isPending}
                  disabled={submitDisabled}
                  onClick={() => form && saveProfile.mutate(form)}
                >
                  {t('common.save')}
                </Button>
              </ModalButtonGroup>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      {ruleForm && (
        <Modal open onClose={() => setRuleForm(null)}>
          <ModalContent size="md">
            <ModalHeader
              title={ruleForm.id ? t('providers.editRule') : t('providers.createRuleTitle')}
              subtitle={t('providers.createRuleDescription')}
            />
            <ModalBody className="space-y-5 py-5">
              <div>
                <label htmlFor="provider-rule-metric" className="mb-2 block text-sm font-bold">
                  {t('providers.ruleMetric')}
                </label>
                <NativeSelect
                  id="provider-rule-metric"
                  value={ruleForm.metric}
                  onChange={(event) =>
                    setRuleForm({
                      ...ruleForm,
                      metric: event.target.value as LimitRuleFormState['metric'],
                    })
                  }
                >
                  <option value="tokens">{t('providers.ruleMetrics.tokens')}</option>
                  <option value="cost">{t('providers.ruleMetrics.cost')}</option>
                </NativeSelect>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="provider-rule-threshold" className="mb-2 block text-sm font-bold">
                    {t('providers.ruleThreshold')}
                  </label>
                  <Input
                    id="provider-rule-threshold"
                    type="number"
                    min={0}
                    value={ruleForm.threshold}
                    onChange={(event) =>
                      setRuleForm({ ...ruleForm, threshold: event.target.value })
                    }
                    placeholder={t('providers.ruleThresholdPlaceholder')}
                  />
                </div>
                <div>
                  <label htmlFor="provider-rule-period" className="mb-2 block text-sm font-bold">
                    {t('providers.rulePeriod')}
                  </label>
                  <NativeSelect
                    id="provider-rule-period"
                    value={ruleForm.period}
                    onChange={(event) =>
                      setRuleForm({
                        ...ruleForm,
                        period: event.target.value as LimitRuleFormState['period'],
                      })
                    }
                  >
                    <option value="day">{t('providers.rulePeriods.day')}</option>
                    <option value="month">{t('providers.rulePeriods.month')}</option>
                  </NativeSelect>
                </div>
              </div>

              <label className="flex min-h-12 items-center justify-between rounded-2xl border border-border-subtle/45 bg-bg-secondary/15 px-4 py-2 text-sm font-bold">
                <span className="text-text-primary">{t('providers.blockRequests')}</span>
                <Switch
                  checked={ruleForm.blockRequests}
                  onCheckedChange={(blockRequests) => setRuleForm({ ...ruleForm, blockRequests })}
                />
              </label>
            </ModalBody>
            <ModalFooter>
              <ModalButtonGroup>
                <Button type="button" variant="ghost" onClick={() => setRuleForm(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  loading={saveRouting.isPending}
                  disabled={!ruleForm.threshold || Number(ruleForm.threshold) <= 0}
                  onClick={saveRule}
                >
                  {ruleForm.id ? t('common.save') : t('providers.createRule')}
                </Button>
              </ModalButtonGroup>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('providers.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('providers.deleteDescription', { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="danger"
                loading={deleteProfile.isPending}
                onClick={() => deleteTarget && deleteProfile.mutate(deleteTarget)}
              >
                {t('common.delete')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
