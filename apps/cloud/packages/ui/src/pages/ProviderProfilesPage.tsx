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
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NativeSelect,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Copy,
  DollarSign,
  Globe2,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  TestTube2,
  Trash2,
  Wallet,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DashboardEmptyState } from '@/components/DashboardEmptyState'
import { PageShell } from '@/components/PageShell'
import type { ProviderCatalogEntry, ProviderProfile, ProviderTestResult } from '@/lib/api'
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

type ModelProxyBilling = {
  shrimpPerCny: number
  inputTokensPerShrimp: number | null
  outputTokensPerShrimp: number | null
  inputCacheHitShrimpPerMillionTokens: number
  inputCacheMissShrimpPerMillionTokens: number
  outputShrimpPerMillionTokens: number
}

type ModelProxyApiExtension = {
  modelProxy?: {
    billing: () => Promise<ModelProxyBilling>
  }
}

const MODEL_TAGS = ['default', 'fast', 'flash', 'reasoning', 'vision', 'tools'] as const

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

function formatBillingNumber(value: number) {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function defaultProfileName(providerId: string): string {
  return providerId ? `${providerId}-default` : ''
}

function isMaskedPlaceholder(value: string): boolean {
  return /^[*•●∙·]{3,}$/u.test(value.trim())
}

function profileBaseUrl(profile: ProviderProfile): string {
  const value = profile.config.baseUrl
  return typeof value === 'string' && !isMaskedPlaceholder(value) ? value : ''
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

function formatProviderName(value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  return raw
    .split(/[-_]/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ')
}

function isGenericPluginName(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized.length === 0 || normalized === 'model provider' || normalized === '模型提供商'
}

function providerDisplayName(catalog: ProviderCatalogEntry | undefined, fallback?: string): string {
  const raw =
    catalog && isGenericPluginName(catalog.pluginName)
      ? catalog.provider.id
      : (catalog?.pluginName ?? catalog?.provider.id ?? fallback ?? '')

  return formatProviderName(raw)
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

function profileSecretValue(
  profile: ProviderProfile,
  catalog: ProviderCatalogEntry | undefined,
): string {
  const keys = [catalog?.provider.envKey, ...(catalog?.provider.envKeyAliases ?? [])].filter(
    (key): key is string => Boolean(key),
  )
  const match = profile.envVars.find((envVar) => keys.includes(envVar.key))
  return match?.maskedValue ?? ''
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

function modelFromCatalog(
  catalog: ProviderCatalogEntry | undefined,
): ProviderProfileModelFormState {
  const model =
    catalog?.provider.models.find((item) => item.tags?.includes('default')) ??
    catalog?.provider.models[0]
  return {
    ...emptyModel(),
    id: model?.id ?? '',
    name: model?.name ?? '',
    tags: model?.tags?.length ? model.tags : ['default'],
  }
}

function duplicateModelIndexes(models: ProviderProfileModelFormState[]): Set<number> {
  const seen = new Map<string, number>()
  const duplicates = new Set<number>()

  models.forEach((model, index) => {
    const modelId = model.id.trim()
    if (!modelId) return
    const key = modelId.toLowerCase()
    const firstIndex = seen.get(key)
    if (firstIndex === undefined) {
      seen.set(key, index)
    } else {
      seen.set(key, firstIndex)
      duplicates.add(firstIndex)
      duplicates.add(index)
    }
  })

  return duplicates
}

function serializeHasModelError(models: ProviderProfileModelFormState[]): {
  hasDuplicateModel: boolean
  hasEmptyModelId: boolean
} {
  const duplicateIndexes = duplicateModelIndexes(models)

  return {
    hasDuplicateModel: duplicateIndexes.size > 0,
    hasEmptyModelId: models.some((model) => !model.id.trim()),
  }
}

function duplicateModelIdFor(sourceId: string, models: ProviderProfileModelFormState[]): string {
  const base = sourceId.trim()
  if (!base) return ''

  const exists = new Set(
    models.map((model) => model.id.trim().toLowerCase()).filter((id) => id.length > 0),
  )

  let candidate = `${base}-copy`
  let counter = 1

  while (exists.has(candidate.toLowerCase())) {
    counter += 1
    candidate = `${base}-copy-${counter}`
  }

  return candidate
}

function duplicateModel(
  model: ProviderProfileModelFormState,
  models: ProviderProfileModelFormState[],
) {
  return {
    ...model,
    clientId: makeClientId(),
    id: duplicateModelIdFor(model.id, models),
    tags: [...model.tags],
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
  const seenModelIds = new Set<string>()

  for (const model of models) {
    const id = model.id.trim()
    if (!id) continue
    const normalizedId = id.toLowerCase()
    if (seenModelIds.has(normalizedId)) continue
    seenModelIds.add(normalizedId)

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
  const [connectDialogOpen, setConnectDialogOpen] = useState(false)

  const { data: catalogData, isLoading: isCatalogLoading } = useQuery({
    queryKey: ['provider-catalogs'],
    queryFn: api.providerCatalogs.list,
  })

  const { data: profileData, isLoading: isProfilesLoading } = useQuery({
    queryKey: ['provider-profiles'],
    queryFn: api.providerProfiles.list,
  })
  const { data: modelProxyBilling } = useQuery({
    queryKey: ['model-proxy-billing'],
    queryFn: () =>
      (api as ModelProxyApiExtension).modelProxy?.billing?.() ??
      Promise.resolve(null as ModelProxyBilling | null),
    retry: false,
  })

  const catalogs = catalogData?.providers ?? []
  const profiles = profileData?.profiles ?? []
  const modelProxyPricingText = useMemo(() => {
    if (!modelProxyBilling) return t('providers.officialPricingLoading')
    if (modelProxyBilling.inputTokensPerShrimp || modelProxyBilling.outputTokensPerShrimp) {
      return t('providers.officialPricingTokens', {
        input: formatBillingNumber(
          modelProxyBilling.inputTokensPerShrimp ?? modelProxyBilling.outputTokensPerShrimp ?? 1000,
        ),
        output: formatBillingNumber(
          modelProxyBilling.outputTokensPerShrimp ?? modelProxyBilling.inputTokensPerShrimp ?? 1000,
        ),
      })
    }
    return t('providers.officialPricingDeepSeek', {
      cacheHit: formatBillingNumber(modelProxyBilling.inputCacheHitShrimpPerMillionTokens),
      cacheMiss: formatBillingNumber(modelProxyBilling.inputCacheMissShrimpPerMillionTokens),
      output: formatBillingNumber(modelProxyBilling.outputShrimpPerMillionTokens),
      shrimpPerCny: formatBillingNumber(modelProxyBilling.shrimpPerCny),
    })
  }, [modelProxyBilling, t])
  const catalogById = useMemo(
    () => new Map(catalogs.map((catalog) => [catalog.provider.id, catalog])),
    [catalogs],
  )
  const connectedProfileCount = profiles.filter((profile) => profile.enabled).length
  const selectedCatalog = form ? catalogById.get(form.providerId) : undefined
  const apiKeyCatalogs = useMemo(
    () => catalogs.filter((catalog) => catalog.provider.id !== 'custom'),
    [catalogs],
  )
  const customCatalog = catalogs.find((catalog) => catalog.provider.id === 'custom')

  const saveProfile = useMutation({
    mutationFn: (state: ProviderProfileFormState) => {
      const catalog = catalogById.get(state.providerId)
      const envVars: Record<string, string> = {}
      const secretKey = primarySecretKey(catalog)
      const apiKey = state.apiKey.trim()
      if (secretKey && apiKey && !isMaskedPlaceholder(apiKey)) envVars[secretKey] = apiKey

      const config: Record<string, unknown> = {}
      const baseUrl = state.baseUrl.trim()
      if (baseUrl && !isMaskedPlaceholder(baseUrl)) config.baseUrl = baseUrl
      config.apiFormat = state.apiFormat
      config.authType = 'api_key'
      const models = serializeModels(state.models)
      config.models = models

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

  const toggleProfile = (profile: ProviderProfile) => {
    saveProfile.mutate({
      id: profile.id,
      providerId: profile.providerId,
      name: profile.name,
      apiKey: profileSecretValue(profile, catalogById.get(profile.providerId)),
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
    const catalog = catalogById.get(nextProviderId)
    setForm({
      ...EMPTY_FORM,
      providerId: nextProviderId,
      name: defaultProfileName(nextProviderId),
      apiFormat: catalogApiFormat(catalog),
      authType: 'api_key',
      models: [modelFromCatalog(catalog)],
    })
    setConnectDialogOpen(true)
  }

  const profileFormState = (profile: ProviderProfile): ProviderProfileFormState => ({
    id: profile.id,
    providerId: profile.providerId,
    name: profile.name,
    apiKey: profileSecretValue(profile, catalogById.get(profile.providerId)),
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

  const hasRequiredModel = Boolean(form && serializeModels(form.models).length > 0)
  const modelValidation = serializeHasModelError(form?.models ?? [])
  const duplicateModelIndexSet = duplicateModelIndexes(form?.models ?? [])
  const hasCredential = selectedCatalog
    ? Boolean(form?.apiKey.trim()) || Boolean(form?.id)
    : Boolean(form?.apiKey.trim())
  const secretLabel = primarySecretKey(selectedCatalog) || t('providers.apiKey')
  const submitDisabled =
    saveProfile.isPending ||
    !form?.providerId ||
    !form.name.trim() ||
    !selectedCatalog ||
    !hasCredential ||
    !hasRequiredModel ||
    modelValidation.hasEmptyModelId ||
    modelValidation.hasDuplicateModel
  const providerModelNames = (profile: ProviderProfile) =>
    profileModels(profile).map((model) => model.id)
  const openRecharge = () => {
    if (typeof window === 'undefined') return
    let acked = false
    const onAck = () => {
      acked = true
      window.removeEventListener('shadow:open-recharge:ack', onAck)
    }
    window.addEventListener('shadow:open-recharge:ack', onAck)
    window.dispatchEvent(
      new CustomEvent('shadow:open-recharge', {
        detail: { source: 'provider-profiles', amount: 10000 },
      }),
    )
    window.setTimeout(() => {
      window.removeEventListener('shadow:open-recharge:ack', onAck)
      if (!acked) toast.error(t('deploy.rechargeUnavailable'))
    }, 500)
  }

  return (
    <PageShell
      breadcrumb={[]}
      title={t('providers.title')}
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
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-success/20 bg-success/5 px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                  <ShieldCheck size={13} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-success">
                    {t('providers.encryptionActive')}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">
                    {t('providers.encryptionDescription')}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-bg-secondary/45 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
                {t('providers.connectionCount', { count: profiles.length })}
              </p>
              <p className="mt-1 text-xl font-bold text-text-primary">{profiles.length}</p>
            </div>

            <div className="rounded-xl border border-border-subtle bg-bg-secondary/45 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
                {t('providers.enabledProfiles')}
              </p>
              <p className="mt-1 text-xl font-bold text-text-primary">{connectedProfileCount}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-secondary/35 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <Wallet size={15} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    {t('providers.officialProviderTitle')}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">
                    {t('providers.officialProviderDescription')}
                  </p>
                  <p className="mt-2 text-xs font-medium text-primary">{modelProxyPricingText}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    window.location.assign('/app/settings?tab=wallet')
                  }}
                >
                  <Wallet size={13} />
                  {t('deploy.viewWalletAndBilling')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={openRecharge}>
                  <DollarSign size={13} />
                  {t('deploy.topUp')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      }
    >
      {isCatalogLoading || isProfilesLoading ? (
        <div className="flex items-center justify-center py-20 text-sm text-text-muted">
          <Loader2 size={18} className="mr-2 animate-spin" />
          {t('common.loading')}
        </div>
      ) : profiles.length === 0 ? (
        <DashboardEmptyState
          cardVariant="glass"
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
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => {
            const result = testResults[profile.id]
            const isTesting = testProfile.isPending && testProfile.variables?.id === profile.id
            return (
              <Card key={profile.id} variant="glass" className="flex h-full flex-col p-4">
                <div className="border-b border-border-subtle/60 pb-3">
                  <div className="cardHeader flex min-w-0 items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-black text-text-primary">
                          {profile.name}
                        </h3>
                        <Badge variant={profile.enabled ? 'success' : 'neutral'} size="sm">
                          {profile.enabled ? t('providers.enabled') : t('providers.disabled')}
                        </Badge>
                      </div>
                    </div>
                    <div className="ml-auto mt-1 flex shrink-0 items-center gap-2 sm:mt-0">
                      <Switch
                        id={`provider-profile-enabled-${profile.id}`}
                        checked={profile.enabled}
                        onCheckedChange={() => toggleProfile(profile)}
                        disabled={saveProfile.isPending}
                      />
                    </div>
                  </div>
                </div>

                <div className="cardContent mt-3">
                  <div className="grid grid-cols-1 gap-2">
                    <div className="rounded-lg border border-border-subtle/50 bg-bg-secondary/30 px-2.5 py-2 text-xs">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {(() => {
                          const modelNames = providerModelNames(profile)
                          return t('providers.modelsCount', {
                            count: modelNames.length,
                            modelList:
                              modelNames.length > 0
                                ? modelNames.join(', ')
                                : t('providers.modelsNotConfigured'),
                          })
                        })()}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {providerModelNames(profile).map((name) => (
                          <span
                            key={`${profile.id}-${name}`}
                            className="rounded-full border border-border-subtle/60 bg-bg-primary/10 px-2 py-0.5 text-[11px] leading-tight text-text-muted"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {result && (
                    <div
                      className={cn(
                        'mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs',
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
                </div>

                <div className="cardFooter mt-auto pt-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => testProfile.mutate(profile)}
                      disabled={isTesting || !profile.enabled}
                      title={t('providers.testConnection')}
                      className="flex items-center justify-center gap-2"
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
                      onClick={() => openEdit(profile)}
                      title={t('common.edit')}
                      className="flex items-center justify-center gap-2"
                    >
                      <Pencil size={13} />
                      {t('common.edit')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="flex items-center justify-center gap-2 text-danger/70 hover:text-danger"
                      onClick={() => setDeleteTarget(profile)}
                      title={t('common.delete')}
                    >
                      <Trash2 size={13} />
                      {t('common.delete')}
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
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
            <ModalBody className="space-y-4 py-5">
              <section className="rounded-2xl border border-border-subtle/45 bg-bg-secondary/15 p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase text-primary">
                      {t('providers.connectionTitle')}
                    </p>
                  </div>
                  <div className="flex min-h-10 shrink-0 items-center rounded-full border border-border-subtle/60 bg-bg-primary/25 px-3">
                    <Switch
                      checked={form.enabled}
                      onCheckedChange={(enabled) => setForm({ ...form, enabled })}
                      aria-label={form.enabled ? t('common.enabled') : t('common.disabled')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="provider-profile-name" className="mb-1 block text-xs font-bold">
                      {t('providers.profileName')}
                    </label>
                    <Input
                      id="provider-profile-name"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      placeholder={t('providers.profileNamePlaceholder')}
                    />
                  </div>

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
                    <p className="mt-1 text-xs text-text-muted">{t('providers.baseUrlHelp')}</p>
                  </div>

                  <div className="sm:col-span-2">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <label htmlFor="provider-profile-api-key" className="block text-xs font-bold">
                        {secretLabel}
                      </label>
                    </div>
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
                    <p className="mt-1 text-xs text-text-muted">{t('providers.apiKeyHelp')}</p>
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border border-border-subtle/45 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-text-primary">
                      {t('providers.modelsTitle')}
                      <span className="ml-1 text-danger">*</span>
                    </h3>
                    <p className="text-xs text-text-muted">{t('providers.modelsDescription')}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() =>
                      setForm({
                        ...form,
                        models: [...form.models, emptyModel()],
                      })
                    }
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
                    onClick={() =>
                      setForm({
                        ...form,
                        models: [modelFromCatalog(selectedCatalog)],
                      })
                    }
                  >
                    <Plus size={14} />
                    {t('providers.addFirstModel')}
                  </button>
                ) : (
                  <div className="space-y-3">
                    {form.models.map((model, index) => (
                      <div
                        key={model.clientId}
                        className="rounded-xl border border-border-subtle/45 p-3"
                      >
                        <div className="mb-2 flex flex-nowrap items-center gap-2">
                          <Input
                            value={model.id}
                            onChange={(event) => {
                              const models = [...form.models]
                              models[index] = {
                                ...model,
                                id: event.target.value,
                              }
                              setForm({ ...form, models })
                            }}
                            placeholder={t('providers.modelIdPlaceholder')}
                            list="provider-profile-model-options"
                            className="min-w-0 flex-1"
                          />
                          <span className="w-56 shrink-0">
                            <Select
                              value={model.tags[0] ?? ''}
                              onValueChange={(value) => {
                                const models = [...form.models]
                                models[index] = {
                                  ...model,
                                  tags: [value],
                                }
                                setForm({ ...form, models })
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('providers.modelTag')} />
                              </SelectTrigger>
                              <SelectContent>
                                {MODEL_TAGS.map((tag) => (
                                  <SelectItem key={tag} value={tag}>
                                    {t(`providers.modelTags.${tag}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0 rounded-lg text-text-muted hover:bg-bg-primary/40 hover:text-text-primary"
                            title={t('common.copy')}
                            onClick={() =>
                              setForm({
                                ...form,
                                models: [...form.models, duplicateModel(model, form.models)],
                              })
                            }
                          >
                            <Copy size={14} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0 rounded-lg text-danger/75 hover:bg-danger/10 hover:text-danger"
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
                            <Trash2 size={14} />
                          </Button>
                        </div>
                        <p className="mt-1 text-xs text-text-muted">
                          {t('providers.modelTagHint')}
                        </p>
                        {!model.id.trim() ? (
                          <p className="mt-2 text-xs font-bold text-danger">
                            {t('providers.modelIdRequired')}
                          </p>
                        ) : null}
                        {duplicateModelIndexSet.has(index) ? (
                          <p className="mt-2 text-xs font-bold text-danger">
                            {t('providers.modelDuplicate')}
                          </p>
                        ) : null}
                        <div className="mt-3 h-px bg-gradient-to-r from-transparent via-border-subtle/20 to-transparent" />
                        <details className="pt-3">
                          <summary className="cursor-pointer text-xs font-black text-text-muted">
                            {t('providers.modelDetails')}
                          </summary>
                          <div className="mt-3 space-y-3">
                            <Input
                              value={model.name}
                              onChange={(event) => {
                                const models = [...form.models]
                                models[index] = {
                                  ...model,
                                  name: event.target.value,
                                }
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
                                  models[index] = {
                                    ...model,
                                    maxTokens: event.target.value,
                                  }
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
                                  models[index] = {
                                    ...model,
                                    inputCost: event.target.value,
                                  }
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
                                  models[index] = {
                                    ...model,
                                    outputCost: event.target.value,
                                  }
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
                                      models[index] = {
                                        ...model,
                                        [capability]: checked,
                                      }
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
                {!hasRequiredModel && (
                  <p className="text-xs font-bold text-danger">{t('providers.modelRequired')}</p>
                )}
                {modelValidation.hasDuplicateModel ? (
                  <p className="text-xs font-bold text-danger">{t('providers.modelDuplicate')}</p>
                ) : null}
              </section>
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
              {t('providers.deleteDescription', {
                name: deleteTarget?.name ?? '',
              })}
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
