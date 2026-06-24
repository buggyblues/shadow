import {
  Badge,
  Button,
  Checkbox,
  GlassPanel,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  SecretInput,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock,
  Copy,
  Database,
  DollarSign,
  Download,
  FolderOpen,
  Key,
  Loader2,
  Plus,
  Rocket,
  Server,
  Sparkles,
  Trash2,
  Unplug,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FieldErrors } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { AlertBanner, AlertBannerList } from '@/components/AlertBanner'
import { LogsPanel } from '@/components/LogsPanel'
import { LogsPanelHeaderActions } from '@/components/LogsPanelHeaderActions'
import { MetricCardContent, MetricCardWrapper } from '@/components/MetricCard'
import { PageShell } from '@/components/PageShell'
import { StatsGrid } from '@/components/StatsGrid'
import { useSSEStream } from '@/hooks/useSSEStream'
import { type ProviderSettings, type TemplateEnvField } from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
import { useAppNavigation } from '@/lib/app-navigation'
import { API_PRESETS } from '@/lib/presets'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

// ── Step Definitions ──────────────────────────────────────────────────────────

interface WizardStep {
  id: string
  label: string
  description?: string
}

function getWizardSteps(
  t: (key: string, options?: Record<string, unknown>) => string,
): WizardStep[] {
  return [
    {
      id: 'overview',
      label: t('deploy.stepTemplateLabel'),
      description: t('deploy.stepTemplateDescription'),
    },
    {
      id: 'configure',
      label: t('deploy.stepConfigureLabel'),
      description: t('deploy.stepConfigureDescription'),
    },
    {
      id: 'deploy',
      label: t('deploy.stepDeployLabel'),
      description: t('deploy.stepDeployDescription'),
    },
  ]
}

function getCategoryLabel(
  category: string,
  translate: (key: string, options?: Record<string, unknown>) => string,
) {
  const key = `store.categories.${category}`
  const value = translate(key)
  return value === key ? category : value
}

function getDifficultyLabel(
  difficulty: string,
  translate: (key: string, options?: Record<string, unknown>) => string,
) {
  return translate(`store.difficulties.${difficulty}`)
}

function translateOptional(
  translate: (key: string, options?: Record<string, unknown>) => string,
  key: string,
): string | undefined {
  const value = translate(key)
  return value === key ? undefined : value
}

function getProviderSecretEnvName(providerId: string): string {
  return `${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`
}

function envKeyToLabel(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const DEFAULT_ENV_GROUP = 'default'
const OFFICIAL_MODEL_PROXY_ENV_KEYS = new Set([
  'OPENAI_COMPATIBLE_API_KEY',
  'OPENAI_COMPATIBLE_BASE_URL',
  'OPENAI_COMPATIBLE_MODEL_ID',
])

type ModelProviderMode = 'official' | 'custom'

interface EnvPersistenceConfig {
  remember: boolean
  bindNamespace: boolean
  groupName: string
}

interface DeployConfig {
  namespace: string
  envVars: Record<string, string>
  envPersistence: EnvPersistenceConfig
  modelProviderMode: ModelProviderMode
}

type BrowserRuntimeContext = {
  locale?: string
  timezone?: string
}

type ModelProxyBilling = {
  enabled: boolean
  currency: 'shrimp'
  model: string
  models: string[]
  shrimpMicrosPerCoin: number
  shrimpPerCny: number
  inputTokensPerShrimp: number | null
  outputTokensPerShrimp: number | null
  inputCacheHitCnyPerMillionTokens: number
  inputCacheMissCnyPerMillionTokens: number
  outputCnyPerMillionTokens: number
  inputCacheHitShrimpPerMillionTokens: number
  inputCacheMissShrimpPerMillionTokens: number
  outputShrimpPerMillionTokens: number
}

type ModelProxyPricingSummary =
  | { kind: 'loading' }
  | { kind: 'tokens'; input: string; output: string }
  | { kind: 'usage'; cacheHit: string; cacheMiss: string; output: string; shrimpPerCny: string }

type ModelProxyApiExtension = {
  modelProxy?: {
    billing: () => Promise<ModelProxyBilling>
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

type TemplateRuntimePreview = {
  greetingMessageCount: number
  greetingChannelCount: number
  entryChannelName?: string
  hasServerApps: boolean
  serverAppCount: number
  routineCount: number
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function readShadowobOptions(config: unknown): Record<string, unknown> | null {
  if (!isRecord(config)) return null
  for (const entry of readRecordArray(config.use)) {
    if (entry.plugin === 'shadowob' && isRecord(entry.options)) return entry.options
  }
  return null
}

function readShadowobChannelNames(options: Record<string, unknown>): Map<string, string> {
  const names = new Map<string, string>()
  for (const server of readRecordArray(options.servers)) {
    for (const channel of readRecordArray(server.channels)) {
      if (typeof channel.id !== 'string') continue
      names.set(channel.id, typeof channel.title === 'string' ? channel.title : channel.id)
    }
  }
  return names
}

function extractTemplateRuntimePreview(config: unknown): TemplateRuntimePreview | null {
  const options = readShadowobOptions(config)
  if (!options || !isRecord(config)) return null

  const greeting = isRecord(options.greeting) ? options.greeting : null
  const greetingMessages = readRecordArray(greeting?.messages)
  const greetingChannelIds = new Set(
    greetingMessages
      .map((message) => message.channelId)
      .filter((channelId): channelId is string => typeof channelId === 'string'),
  )
  const channelNames = readShadowobChannelNames(options)
  const entryChannelId =
    greeting && typeof greeting.entryChannelId === 'string' ? greeting.entryChannelId : null
  const serverAppCount = readRecordArray(options.serverApps).length
  const routineCount = readRecordArray(config.routines).length

  if (greetingMessages.length === 0 && serverAppCount === 0 && routineCount === 0) return null

  return {
    greetingMessageCount: greetingMessages.length,
    greetingChannelCount: greetingChannelIds.size,
    ...(entryChannelId
      ? { entryChannelName: channelNames.get(entryChannelId) ?? entryChannelId }
      : {}),
    hasServerApps: serverAppCount > 0,
    serverAppCount,
    routineCount,
  }
}

function useTemplateRuntimePreview(name: string, enabled = true) {
  const api = useApiClient()
  return useQuery({
    queryKey: ['template-runtime-preview', name],
    queryFn: () => api.templates.get(name),
    enabled,
    retry: false,
    select: extractTemplateRuntimePreview,
  })
}

function shouldHideOfficialModelEnvKey(key: string, mode: ModelProviderMode) {
  return mode === 'official' && OFFICIAL_MODEL_PROXY_ENV_KEYS.has(key)
}

function filterOfficialModelEnvVars(
  envVars: Record<string, string>,
  mode: ModelProviderMode,
): Record<string, string> {
  if (mode !== 'official') return envVars
  return Object.fromEntries(
    Object.entries(envVars).filter(([key]) => !OFFICIAL_MODEL_PROXY_ENV_KEYS.has(key)),
  )
}

function formatBillingNumber(value: number) {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function resolveBrowserRuntimeContext(locale?: string): BrowserRuntimeContext {
  let timezone: string | undefined
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    timezone = undefined
  }

  return {
    ...(locale ? { locale } : {}),
    ...(timezone ? { timezone } : {}),
  }
}

const DEFAULT_ENV_PERSISTENCE: EnvPersistenceConfig = {
  remember: true,
  bindNamespace: true,
  groupName: DEFAULT_ENV_GROUP,
}

function normalizeEnvPersistence(value?: Partial<EnvPersistenceConfig>): EnvPersistenceConfig {
  return {
    ...DEFAULT_ENV_PERSISTENCE,
    ...value,
    groupName: value?.groupName?.trim() || DEFAULT_ENV_GROUP,
  }
}

/** Extract all ${env:VAR_NAME} references from a template content object */
function extractClientEnvRefs(obj: unknown): string[] {
  const refs = new Set<string>()
  const pattern = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g
  function walk(val: unknown) {
    if (typeof val === 'string') {
      for (const match of val.matchAll(pattern)) {
        if (match[1]) refs.add(match[1])
      }
    } else if (Array.isArray(val)) {
      for (const item of val) walk(item)
    } else if (val && typeof val === 'object') {
      for (const v of Object.values(val)) walk(v)
    }
  }
  walk(obj)
  return [...refs].sort()
}

function sortGroups(groups: Iterable<string>): string[] {
  return [...new Set(groups)].sort((a, b) =>
    a === DEFAULT_ENV_GROUP ? -1 : b === DEFAULT_ENV_GROUP ? 1 : a.localeCompare(b),
  )
}

function selectBestEnvGroup({
  groups,
  envVars,
  keys,
}: {
  groups: string[]
  envVars: Array<{ key: string; groupName?: string | null }>
  keys: string[]
}): string {
  const candidateGroups = sortGroups(groups.length > 0 ? groups : [DEFAULT_ENV_GROUP])
  const keySet = new Set(keys.filter(Boolean))
  if (keySet.size === 0) return candidateGroups[0] ?? DEFAULT_ENV_GROUP

  const matchedByGroup = new Map<string, Set<string>>()
  for (const variable of envVars) {
    if (!keySet.has(variable.key)) continue
    const group = variable.groupName?.trim() || DEFAULT_ENV_GROUP
    const matches = matchedByGroup.get(group) ?? new Set<string>()
    matches.add(variable.key)
    matchedByGroup.set(group, matches)
  }

  let best = candidateGroups[0] ?? DEFAULT_ENV_GROUP
  let bestScore = matchedByGroup.get(best)?.size ?? 0

  for (const group of candidateGroups) {
    const score = matchedByGroup.get(group)?.size ?? 0
    if (score > bestScore || (score === bestScore && score > 0 && best === DEFAULT_ENV_GROUP)) {
      best = group
      bestScore = score
    }
  }

  return best
}

// ── Step 1: Template Overview ─────────────────────────────────────────────────

function StepOverview({ name }: { name: string }) {
  const api = useApiClient()
  const { t, i18n } = useTranslation()
  const { data, isError: isStoreError } = useQuery({
    queryKey: ['template-detail', name, i18n.language],
    queryFn: () => api.templates.detail(name, i18n.language),
    retry: false,
  })
  // Fallback: when this is a user's own template (not in store catalog)
  const { data: ownTemplate } = useQuery({
    queryKey: ['my-template-detail', name],
    queryFn: () => api.myTemplates.get(name),
    enabled: isStoreError,
    retry: false,
  })

  const template = data?.template
  const displayTitle = template?.title || name
  const { data: runtimePreview } = useTemplateRuntimePreview(name, !isStoreError)

  return (
    <div className="space-y-4">
      <GlassPanel className="rounded-2xl bg-bg-secondary/18 p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-1">{t('deploy.reviewTemplate')}</h2>
          <p className="text-sm text-text-muted">{t('deploy.confirmDeployKubernetes')}</p>
        </div>
        <div className="flex items-start gap-4">
          <span className="text-4xl">{template?.emoji ?? '📦'}</span>
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-1">{displayTitle}</h3>
            <p className="text-sm text-text-secondary mb-3">
              {template?.description ??
                (ownTemplate ? t('deploy.ownTemplateDescription') : t('common.loading'))}
            </p>

            <div className="flex items-center gap-2 mb-4">
              {template && (
                <Badge variant="neutral">{getCategoryLabel(template.category, t)}</Badge>
              )}
              {template && (
                <Badge variant="neutral">{getDifficultyLabel(template.difficulty, t)}</Badge>
              )}
              {template?.featured && (
                <Badge variant="info">
                  <Sparkles size={10} />
                  {t('store.featured')}
                </Badge>
              )}
            </div>

            {/* Quick stats */}
            <StatsGrid className="mb-0 mt-1 grid-cols-1 md:grid-cols-3">
              <MetricCardWrapper>
                <MetricCardContent
                  label={t('deploy.agentsLabel')}
                  value={template?.agentCount ?? '—'}
                  icon={<Users size={11} />}
                  iconClassName="text-text-muted"
                  valueClassName="text-lg font-semibold"
                />
              </MetricCardWrapper>
              <MetricCardWrapper>
                <MetricCardContent
                  label={t('deploy.namespaceLabel')}
                  value={template?.namespace ?? '—'}
                  icon={<FolderOpen size={11} />}
                  iconClassName="text-text-muted"
                  valueClassName="text-sm font-mono"
                />
              </MetricCardWrapper>
              <MetricCardWrapper>
                <MetricCardContent
                  label={t('deploy.deployTimeLabel')}
                  value={template?.estimatedDeployTime ?? '—'}
                  icon={<Clock size={11} />}
                  iconClassName="text-text-muted"
                  valueClassName="text-sm"
                />
              </MetricCardWrapper>
            </StatsGrid>
          </div>
        </div>
      </GlassPanel>

      {runtimePreview && (
        <GlassPanel className="rounded-2xl bg-bg-secondary/18 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Sparkles size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-text-primary">
                  {t('deploy.proactivePreviewTitle')}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  {t('deploy.proactivePreviewDescription', {
                    channels: runtimePreview.greetingChannelCount,
                    messages: runtimePreview.greetingMessageCount,
                  })}
                </p>
                {runtimePreview.entryChannelName && (
                  <p className="mt-2 text-xs font-medium text-text-secondary">
                    {t('deploy.proactiveEntryChannel', {
                      channel: runtimePreview.entryChannelName,
                    })}
                  </p>
                )}
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3 md:min-w-[360px]">
              <div className="rounded-xl bg-bg-secondary/20 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
                  <Sparkles size={13} className="text-primary" />
                  {t('deploy.proactiveGreetingMetric')}
                </div>
                <p className="mt-1 text-lg font-semibold text-text-primary">
                  {runtimePreview.greetingChannelCount}
                </p>
              </div>
              {runtimePreview.hasServerApps && (
                <div className="rounded-xl bg-bg-secondary/20 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
                    <Server size={13} className="text-success" />
                    {t('deploy.proactiveServerAppMetric')}
                  </div>
                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {runtimePreview.serverAppCount}
                  </p>
                </div>
              )}
              {runtimePreview.routineCount > 0 && (
                <div className="rounded-xl bg-bg-secondary/20 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
                    <Clock size={13} className="text-warning" />
                    {t('deploy.proactiveRoutineMetric')}
                  </div>
                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {runtimePreview.routineCount}
                  </p>
                </div>
              )}
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Requirements */}
      {(template?.requirements.length ?? 0) > 0 && (
        <AlertBanner variant="warning" icon={AlertTriangle} title={t('deploy.prerequisites')}>
          <AlertBannerList
            variant="warning"
            items={template?.requirements ?? []}
            bulletIcon={ChevronRight}
          />
        </AlertBanner>
      )}
    </div>
  )
}

// ── Step 2: Configure — namespace + required env vars ─────────────────────────

function isSensitiveEnvVarKey(key: string): boolean {
  return /(TOKEN|SECRET|PASSWORD|PRIVATE|CREDENTIAL|API_KEY|_KEY$|_B64$)/i.test(key)
}

function EnvVarRow({
  envKey,
  label,
  description,
  placeholder,
  required = true,
  isSecret = false,
  value,
  hasSaved,
  error,
  errorMessage,
  inputRef,
  onValueChange,
  onInputBlur,
  onUseSaved,
  onOverrideSaved,
  t,
}: {
  envKey: string
  label?: string
  description?: string
  placeholder?: string
  required?: boolean
  isSecret?: boolean
  value: string
  hasSaved: boolean
  error?: boolean
  errorMessage?: string
  inputRef?: (el: HTMLInputElement | null) => void
  onValueChange: (value: string) => void
  onInputBlur?: () => void
  onUseSaved: () => void
  onOverrideSaved: () => void
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const inputId = `deploy-env-${envKey.toLowerCase()}`
  const errorId = `${inputId}-error`
  const isUsingSaved = value === '__SAVED__'
  const isFilled = isUsingSaved || Boolean(value.trim())

  return (
    <div
      className={cn(
        'space-y-3 rounded-xl p-3 transition-colors',
        error ? 'bg-danger/8' : isFilled ? 'bg-success/8' : 'bg-bg-secondary/15',
      )}
    >
      <div className="space-y-1.5">
        <label
          htmlFor={isUsingSaved ? undefined : inputId}
          className={cn(
            'flex flex-wrap items-center gap-1.5 text-sm font-semibold',
            error ? 'text-danger' : 'text-text-primary',
          )}
        >
          {error ? (
            <XCircle size={13} className="text-danger" />
          ) : isFilled ? (
            <CheckCircle size={13} className="text-success" />
          ) : isSecret ? (
            <Key size={13} className="text-text-muted" />
          ) : required ? (
            <AlertTriangle size={13} className="text-warning" />
          ) : (
            <Key size={13} className="text-text-muted" />
          )}
          <span>{label || envKey}</span>
          <span className="rounded bg-bg-tertiary px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted">
            {envKey}
          </span>
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              required ? 'bg-warning/12 text-warning' : 'bg-bg-tertiary text-text-muted',
            )}
          >
            {required ? t('deploy.requiredBadge') : t('deploy.optionalBadge')}
          </span>
          {hasSaved && (
            <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
              {t('deploy.savedBadge')}
            </span>
          )}
        </label>
        {description && <p className="text-xs leading-relaxed text-text-muted">{description}</p>}
      </div>
      {isUsingSaved ? (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 transition-colors',
            error ? 'bg-danger/12' : 'bg-success/8',
          )}
        >
          <CheckCircle size={12} className="text-success shrink-0" />
          <span className="flex-1 text-xs text-success font-mono">
            {t('deploy.usingSavedValue')}
          </span>
          <button
            type="button"
            onClick={onOverrideSaved}
            className="text-[11px] text-text-muted hover:text-text-primary transition-colors shrink-0"
          >
            {t('deploy.override')}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl p-1 transition-colors">
          {isSecret ? (
            <SecretInput
              id={inputId}
              data-testid={inputId}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onBlur={onInputBlur}
              placeholder={placeholder}
              autoComplete="new-password"
              className="flex-1"
              error={error}
              ref={inputRef}
              aria-invalid={error}
              aria-describedby={errorMessage ? errorId : undefined}
              data-bwignore="true"
            />
          ) : (
            <Input
              id={inputId}
              data-testid={inputId}
              type="text"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onBlur={onInputBlur}
              placeholder={placeholder}
              autoComplete={envKey === 'SHADOWOB_SERVER_URL' ? 'url' : 'off'}
              className="flex-1"
              error={error}
              ref={inputRef}
              aria-invalid={error}
              aria-describedby={errorMessage ? errorId : undefined}
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              data-bwignore="true"
            />
          )}
          {hasSaved && (
            <button
              type="button"
              onClick={onUseSaved}
              className="text-[11px] text-primary hover:text-primary/80 transition-colors whitespace-nowrap shrink-0"
            >
              {t('deploy.useSaved')}
            </button>
          )}
        </div>
      )}
      {errorMessage && (
        <p id={errorId} className="text-xs font-medium text-danger ml-0.5">
          {errorMessage}
        </p>
      )}
    </div>
  )
}

function getEnvFieldError(
  errors: FieldErrors<DeployConfig>,
  key: string,
): { hasError: boolean; message?: string } {
  const bucket = errors.envVars as Record<string, { message?: string } | undefined> | undefined
  const item = bucket?.[key]
  return {
    hasError: Boolean(item),
    message: typeof item?.message === 'string' ? item.message : undefined,
  }
}

interface EnvFieldGroup {
  id: string
  title: string
  description: string
  source: TemplateEnvField['source']
  helpUrl?: string
  fields: TemplateEnvField[]
}

function StepConfigure({
  name,
  config,
  onChange,
  onBack,
  onNext,
}: {
  name: string
  config: DeployConfig
  onChange: (config: DeployConfig) => void
  onBack: () => void
  onNext: () => void
}) {
  const api = useApiClient()
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const appNavigate = useAppNavigation()
  const isSaasMode = typeof (api as { deployFn?: unknown }).deployFn === 'function'
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const {
    watch,
    getValues,
    setValue,
    setError,
    clearErrors,
    handleSubmit,
    formState: { errors },
  } = useForm<DeployConfig>({
    defaultValues: {
      namespace: config.namespace,
      envVars: config.envVars,
      envPersistence: normalizeEnvPersistence(config.envPersistence),
      modelProviderMode: config.modelProviderMode,
    },
    mode: 'onSubmit',
  })
  const namespace = watch('namespace')
  const envVars = watch('envVars') ?? {}
  const modelProviderMode = watch('modelProviderMode') ?? 'official'
  const rawEnvPersistence = watch('envPersistence')
  const envPersistence = useMemo(
    () => normalizeEnvPersistence(rawEnvPersistence),
    [rawEnvPersistence?.remember, rawEnvPersistence?.bindNamespace, rawEnvPersistence?.groupName],
  )
  const { data: detailData } = useQuery({
    queryKey: ['template-detail', name, i18n.language],
    queryFn: () => api.templates.detail(name, i18n.language),
  })
  const template = detailData?.template
  const resolvedNamespace = namespace || template?.namespace || name

  // Fetch required env var refs from template
  const { data: envRefsData, isError: isEnvRefsError } = useQuery({
    queryKey: ['template-env-refs', name],
    queryFn: () => api.templates.envRefs(name),
    retry: false,
  })
  // Fallback: when this is a user's own template, extract env refs from its content client-side
  const { data: ownTemplateForEnv } = useQuery({
    queryKey: ['my-template-detail', name],
    queryFn: () => api.myTemplates.get(name),
    enabled: isEnvRefsError,
    retry: false,
  })

  // Fetch global env/secrets for group-based auto-fill
  const { data: globalEnvData } = useQuery({
    queryKey: ['env'],
    queryFn: api.env.list,
  })

  const { data: providerProfileData } = useQuery({
    queryKey: ['provider-profiles'],
    queryFn: api.providerProfiles.list,
    enabled: isSaasMode,
    retry: false,
  })
  const { data: modelProxyBilling } = useQuery({
    queryKey: ['model-proxy-billing'],
    queryFn: () =>
      (api as ModelProxyApiExtension).modelProxy?.billing?.() ??
      Promise.resolve(null as ModelProxyBilling | null),
    enabled: isSaasMode,
    retry: false,
  })

  const [selectedGroup, setSelectedGroup] = useState<string>(envPersistence.groupName)
  const groupTouchedRef = useRef(false)
  const [collapsedFieldGroups, setCollapsedFieldGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    groupTouchedRef.current = false
    setSelectedGroup(envPersistence.groupName)
  }, [name])

  const enabledProviderProfiles = useMemo(
    () => (providerProfileData?.profiles ?? []).filter((profile) => profile.enabled),
    [providerProfileData?.profiles],
  )

  const groups = useMemo(() => {
    const set = new Set<string>([DEFAULT_ENV_GROUP])
    for (const g of globalEnvData?.groups ?? []) set.add(g)
    for (const ev of globalEnvData?.envVars ?? []) set.add(ev.groupName ?? DEFAULT_ENV_GROUP)
    return sortGroups(set)
  }, [globalEnvData])

  // Auto-fill namespace with template default on first mount
  const nsInitRef = useRef(false)
  useEffect(() => {
    if (nsInitRef.current || !template) return
    if (!namespace) {
      nsInitRef.current = true
      setValue('namespace', template.namespace ?? name, { shouldDirty: true })
    }
  }, [template, namespace, setValue, name])

  // Fetch already-saved namespace-scoped env vars + secrets from backend
  const { data: savedEnvData } = useQuery({
    queryKey: ['deployment-env', resolvedNamespace, 'scoped'],
    queryFn: () => api.deployments.env.list(resolvedNamespace, 'scoped'),
    enabled: Boolean(resolvedNamespace),
  })

  const requiredVars =
    envRefsData?.requiredEnvVars ??
    (isEnvRefsError ? extractClientEnvRefs(ownTemplateForEnv?.content) : [])

  const templateEnvFields = useMemo<TemplateEnvField[]>(() => {
    const fields = new Map<string, TemplateEnvField>()
    const autoDetectedKeys = new Set(envRefsData?.autoDetectedEnvVars ?? [])

    for (const field of envRefsData?.fields ?? []) {
      if (field.key === 'SHADOWOB_SERVER_URL' || field.key === 'SHADOWOB_USER_TOKEN') continue
      if (shouldHideOfficialModelEnvKey(field.key, modelProviderMode)) continue
      const localizedLabel = translateOptional(t, `deploy.envFieldLabels.${field.key}`)
      const localizedDescription = translateOptional(t, `deploy.envFieldDescriptions.${field.key}`)
      fields.set(field.key, {
        key: field.key,
        label: localizedLabel ?? field.label ?? envKeyToLabel(field.key),
        description:
          localizedDescription ??
          field.description ??
          (field.source === 'plugin'
            ? t('deploy.pluginFieldDescription')
            : t('deploy.templateFieldDescription')),
        required: field.required,
        sensitive: field.sensitive,
        placeholder: field.placeholder,
        source: field.source ?? 'template',
        sourceId: field.sourceId ?? 'template',
        sourceLabel: field.sourceLabel ?? t('deploy.templateFieldSource'),
        helpUrl: field.helpUrl,
      })
    }

    for (const key of requiredVars) {
      if (key === 'SHADOWOB_SERVER_URL' || key === 'SHADOWOB_USER_TOKEN') continue
      if (shouldHideOfficialModelEnvKey(key, modelProviderMode)) continue
      if (!fields.has(key) && !autoDetectedKeys.has(key)) {
        const localizedLabel = translateOptional(t, `deploy.envFieldLabels.${key}`)
        const localizedDescription = translateOptional(t, `deploy.envFieldDescriptions.${key}`)
        fields.set(key, {
          key,
          label: localizedLabel ?? envKeyToLabel(key),
          required: true,
          sensitive: isSensitiveEnvVarKey(key),
          source: 'template',
          sourceId: 'template',
          sourceLabel: t('deploy.templateFieldSource'),
          description: localizedDescription ?? t('deploy.templateFieldDescription'),
        })
      }
    }

    return [...fields.values()].sort((a, b) => a.key.localeCompare(b.key))
  }, [envRefsData?.autoDetectedEnvVars, envRefsData?.fields, modelProviderMode, requiredVars, t])

  const autoDetectedEnvVars = useMemo(
    () =>
      (envRefsData?.autoDetectedEnvVars ?? []).filter(
        (key) => !shouldHideOfficialModelEnvKey(key, modelProviderMode),
      ),
    [envRefsData?.autoDetectedEnvVars, modelProviderMode],
  )

  const requiredTemplateVars = useMemo(
    () => templateEnvFields.filter((field) => field.required).map((field) => field.key),
    [templateEnvFields],
  )

  const expectedSecretKeys = useMemo(() => {
    const keys = new Set<string>()
    if (!isSaasMode) {
      keys.add('SHADOWOB_SERVER_URL')
      keys.add('SHADOWOB_USER_TOKEN')
    }
    for (const field of templateEnvFields) keys.add(field.key)
    for (const key of requiredTemplateVars) keys.add(key)
    return [...keys]
  }, [isSaasMode, requiredTemplateVars, templateEnvFields])

  const templateEnvFieldGroups = useMemo<EnvFieldGroup[]>(() => {
    const groupsById = new Map<string, EnvFieldGroup>()
    for (const field of templateEnvFields) {
      const id = field.source === 'plugin' ? `plugin:${field.sourceId}` : 'template'
      const existing = groupsById.get(id)
      if (existing) {
        existing.fields.push(field)
        existing.helpUrl ??= field.helpUrl
        continue
      }
      groupsById.set(id, {
        id,
        source: field.source,
        title:
          field.source === 'plugin'
            ? field.sourceLabel || field.sourceId
            : t('deploy.templateFieldSource'),
        description:
          field.source === 'plugin'
            ? t('deploy.pluginFieldGroupDescription', {
                plugin: field.sourceLabel || field.sourceId,
              })
            : t('deploy.templateFieldGroupDescription'),
        helpUrl: field.source === 'plugin' ? field.helpUrl : undefined,
        fields: [field],
      })
    }

    return [...groupsById.values()]
      .map((group) => ({
        ...group,
        fields: group.fields.sort((a, b) => {
          if (a.required !== b.required) return a.required ? -1 : 1
          return a.key.localeCompare(b.key)
        }),
      }))
      .sort((a, b) => {
        if (a.id === 'template') return -1
        if (b.id === 'template') return 1
        return a.title.localeCompare(b.title)
      })
  }, [templateEnvFields, t])

  // Build a lookup of saved env var keys -> masked values (from namespace-scoped env)
  const savedLookup = useMemo(() => {
    const lookup: Record<string, string> = {}
    for (const ev of savedEnvData?.envVars ?? []) {
      lookup[ev.key] = ev.maskedValue
    }
    return lookup
  }, [savedEnvData])

  // Build a lookup from global env (for group-based fill)
  const globalLookup = useMemo(() => {
    const lookup: Record<string, string> = {}
    const activeGroup = selectedGroup || DEFAULT_ENV_GROUP
    for (const ev of globalEnvData?.envVars ?? []) {
      if ((ev.groupName ?? DEFAULT_ENV_GROUP) === activeGroup) {
        lookup[ev.key] = ev.maskedValue
      }
    }
    return lookup
  }, [globalEnvData, selectedGroup])

  // Combined lookup: namespace-scoped takes priority, then selected group globals
  const combinedLookup = useMemo(
    () => ({ ...globalLookup, ...savedLookup }),
    [globalLookup, savedLookup],
  )

  useEffect(() => {
    if (groupTouchedRef.current || !globalEnvData) return
    const bestGroup = selectBestEnvGroup({
      groups,
      envVars: globalEnvData.envVars ?? [],
      keys: expectedSecretKeys,
    })
    setSelectedGroup(bestGroup)
    setValue('envPersistence.groupName', bestGroup, { shouldDirty: false })
  }, [expectedSecretKeys, globalEnvData, groups, setValue])

  // Auto-populate from saved values on first load
  const initializedRef = useRef(false)
  useEffect(() => {
    initializedRef.current = false
  }, [resolvedNamespace, selectedGroup])

  useEffect(() => {
    if (initializedRef.current || Object.keys(combinedLookup).length === 0) return
    initializedRef.current = true
    const merged = { ...getValues('envVars') }
    let changed = false
    if (!merged.SHADOWOB_SERVER_URL && combinedLookup.SHADOWOB_SERVER_URL) {
      merged.SHADOWOB_SERVER_URL = '__SAVED__'
      changed = true
    }
    for (const { key } of templateEnvFields) {
      if (!merged[key] && combinedLookup[key]) {
        merged[key] = '__SAVED__'
        changed = true
      }
    }
    if (changed) {
      setValue('envVars', merged, { shouldDirty: true })
    }
  }, [templateEnvFields, combinedLookup, getValues, setValue])

  // When group changes, re-fill any already-saved marked vars that now have values
  const applyGroup = (group: string) => {
    const nextGroup = group || DEFAULT_ENV_GROUP
    groupTouchedRef.current = true
    setSelectedGroup(nextGroup)
    setValue('envPersistence.groupName', nextGroup, { shouldDirty: true })
    const groupVars: Record<string, string> = {}
    for (const ev of globalEnvData?.envVars ?? []) {
      if ((ev.groupName ?? DEFAULT_ENV_GROUP) === nextGroup) groupVars[ev.key] = ev.maskedValue
    }
    const merged = { ...getValues('envVars') }
    let changed = false
    const allKeys = ['SHADOWOB_SERVER_URL', ...templateEnvFields.map((field) => field.key)]
    for (const key of allKeys) {
      if (groupVars[key] || savedLookup[key]) {
        merged[key] = '__SAVED__'
        changed = true
      }
    }
    if (changed) {
      setValue('envVars', merged, { shouldDirty: true })
    }
  }

  const [extraVars, setExtraVars] = useState<Array<{ key: string; value: string }>>([])

  const updateVar = (key: string, value: string) => {
    setValue(`envVars.${key}` as const, value, {
      shouldDirty: true,
      shouldTouch: true,
    })
    clearErrors(`envVars.${key}` as const)
  }

  const updateEnvPersistence = (patch: Partial<EnvPersistenceConfig>) => {
    const next = normalizeEnvPersistence({ ...envPersistence, ...patch })
    setValue('envPersistence', next, { shouldDirty: true })
    if (patch.groupName !== undefined) {
      setSelectedGroup(next.groupName)
    }
  }

  useEffect(() => {
    onChange({
      namespace: namespace ?? '',
      envVars,
      envPersistence: normalizeEnvPersistence({
        ...envPersistence,
        groupName: selectedGroup || envPersistence.groupName,
      }),
      modelProviderMode,
    })
  }, [namespace, envVars, envPersistence, selectedGroup, modelProviderMode, onChange])

  const modelProxyPricing = useMemo<ModelProxyPricingSummary>(() => {
    if (!modelProxyBilling) return { kind: 'loading' }
    if (modelProxyBilling.inputTokensPerShrimp || modelProxyBilling.outputTokensPerShrimp) {
      return {
        kind: 'tokens',
        input: formatBillingNumber(
          modelProxyBilling.inputTokensPerShrimp ?? modelProxyBilling.outputTokensPerShrimp ?? 1000,
        ),
        output: formatBillingNumber(
          modelProxyBilling.outputTokensPerShrimp ?? modelProxyBilling.inputTokensPerShrimp ?? 1000,
        ),
      }
    }
    return {
      kind: 'usage',
      cacheHit: formatBillingNumber(modelProxyBilling.inputCacheHitShrimpPerMillionTokens),
      cacheMiss: formatBillingNumber(modelProxyBilling.inputCacheMissShrimpPerMillionTokens),
      output: formatBillingNumber(modelProxyBilling.outputShrimpPerMillionTokens),
      shrimpPerCny: formatBillingNumber(modelProxyBilling.shrimpPerCny),
    }
  }, [modelProxyBilling])

  const openWallet = () => {
    if (appNavigate) {
      appNavigate({ kind: 'settings-wallet' })
      return
    }
    toast.error(t('deploy.rechargeUnavailable'))
  }

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
        detail: { source: 'deploy-wizard-provider', amount: 10000 },
      }),
    )
    window.setTimeout(() => {
      window.removeEventListener('shadow:open-recharge:ack', onAck)
      if (!acked) {
        openWallet()
      }
    }, 500)
  }

  const onSubmit = () => {
    if (isSaasMode && modelProviderMode === 'custom' && enabledProviderProfiles.length === 0) {
      toast.warning(t('deploy.customProviderRequired'))
      return
    }
    const currentEnvVars = getValues('envVars') ?? {}
    const shadowUrl = currentEnvVars.SHADOWOB_SERVER_URL
    const shadowToken = currentEnvVars.SHADOWOB_USER_TOKEN
    const missingShadow: string[] = []
    if (!isSaasMode) {
      if (!shadowUrl || (shadowUrl !== '__SAVED__' && !shadowUrl.trim())) {
        if (!combinedLookup.SHADOWOB_SERVER_URL) missingShadow.push('SHADOWOB_SERVER_URL')
      }
      if (!shadowToken || (shadowToken !== '__SAVED__' && !shadowToken.trim())) {
        if (!combinedLookup.SHADOWOB_USER_TOKEN) missingShadow.push('SHADOWOB_USER_TOKEN')
      }
    }
    const missing = requiredTemplateVars.filter((k) => {
      const val = currentEnvVars[k]
      return !val || val.trim() === ''
    })
    const trulyMissing = missing.filter((k) => !combinedLookup[k])
    const allMissing = [...missingShadow, ...trulyMissing]
    if (allMissing.length > 0) {
      for (const key of allMissing) {
        setError(`envVars.${key}` as const, {
          type: 'required',
          message: t('deploy.missingRequiredVars'),
        })
      }

      const firstMissingKey = allMissing[0]
      if (firstMissingKey) {
        requestAnimationFrame(() => {
          const el = inputRefs.current[firstMissingKey]
          if (el) {
            el.removeAttribute('disabled')
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.focus({ preventScroll: true })
            el.select?.()
          }
        })
      }

      const preview = allMissing.slice(0, 3).join(', ')
      const suffix = allMissing.length > 3 ? ` ... +${allMissing.length - 3}` : ''
      toast.warning(`${t('deploy.missingRequiredVars')} ${preview}${suffix}`)
      return
    }
    onNext()
  }

  return (
    <form
      id="wizard-configure-form"
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      autoComplete="off"
      data-1p-ignore
      data-lpignore="true"
      data-form-type="other"
    >
      <GlassPanel className="rounded-2xl space-y-4 p-4">
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{t('deploy.stepConfigureLabel')}</h2>
            <p className="text-sm text-text-muted">{t('deploy.stepConfigureDescription')}</p>
          </div>

          {/* Namespace */}
          <div className="rounded-xl bg-bg-secondary/10 p-4 space-y-3">
            <div>
              <label htmlFor="namespace" className="block text-sm font-semibold mb-0.5">
                {t('deploy.namespace')}
              </label>
              <p className="text-xs text-text-muted">{t('deploy.kubernetesNamespaceDesc')}</p>
            </div>
            <Input
              id="namespace"
              type="text"
              value={namespace ?? ''}
              onChange={(e) => setValue('namespace', e.target.value, { shouldDirty: true })}
              placeholder={template?.namespace ?? name}
            />
          </div>

          {/* Group auto-fill selector */}
          {groups.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-bg-secondary/10 px-4 py-3">
              <Database size={14} className="text-text-muted shrink-0" />
              <span className="text-xs text-text-secondary shrink-0">
                {t('deploy.fillFromGroup')}
              </span>
              <select
                value={selectedGroup}
                onChange={(e) => applyGroup(e.target.value)}
                className="flex-1 min-w-0 bg-bg-secondary/20 text-xs text-text-primary rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary/50"
              >
                <option value="">{t('deploy.selectGroup')}</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="rounded-xl bg-bg-secondary/10 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <Key size={14} className="mt-0.5 text-success" />
              <div>
                <h3 className="text-sm font-semibold">{t('deploy.secretPersistenceTitle')}</h3>
                <p className="text-xs text-text-muted">
                  {t('deploy.secretPersistenceDescription', {
                    group: selectedGroup || DEFAULT_ENV_GROUP,
                  })}
                </p>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-bg-secondary/12 px-3 py-2.5">
                <Checkbox
                  checked={envPersistence.remember}
                  onCheckedChange={(checked) =>
                    updateEnvPersistence({ remember: checked === true })
                  }
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-text-primary">
                    {t('deploy.rememberSecrets')}
                  </span>
                  <span className="block text-[11px] leading-relaxed text-text-muted">
                    {t('deploy.rememberSecretsDescription', {
                      group: selectedGroup || DEFAULT_ENV_GROUP,
                    })}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-bg-secondary/12 px-3 py-2.5">
                <Checkbox
                  checked={envPersistence.bindNamespace}
                  onCheckedChange={(checked) =>
                    updateEnvPersistence({ bindNamespace: checked === true })
                  }
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-text-primary">
                    {t('deploy.bindSecretsToNamespace')}
                  </span>
                  <span className="block text-[11px] leading-relaxed text-text-muted">
                    {t('deploy.bindSecretsToNamespaceDescription')}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {isSaasMode && (
            <div className="rounded-xl bg-bg-secondary/10 p-4 space-y-4">
              <div className="flex items-start gap-2">
                <Wallet size={14} className="mt-0.5 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">{t('deploy.modelProviderTitle')}</h3>
                  <p className="text-xs text-text-muted">{t('deploy.modelProviderDescription')}</p>
                </div>
              </div>

              <div
                role="tablist"
                aria-label={t('deploy.modelProviderTitle')}
                className="grid gap-3 md:grid-cols-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={modelProviderMode === 'official'}
                  onClick={() => setValue('modelProviderMode', 'official', { shouldDirty: true })}
                  className={cn(
                    'group rounded-2xl p-3 text-left transition-all shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]',
                    modelProviderMode === 'official'
                      ? 'bg-primary/12 text-text-primary shadow-[0_0_0_1px_rgba(34,211,238,0.45)_inset]'
                      : 'bg-bg-primary/25 text-text-muted hover:bg-bg-primary/35 hover:text-text-primary',
                  )}
                >
                  <span className="mb-3 flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-xl',
                        modelProviderMode === 'official'
                          ? 'bg-primary text-bg-primary'
                          : 'bg-bg-secondary/30 text-text-secondary group-hover:text-primary',
                      )}
                    >
                      <Wallet size={17} />
                    </span>
                    <Badge variant={modelProviderMode === 'official' ? 'primary' : 'neutral'}>
                      {t('deploy.modelProviderOfficialBadge')}
                    </Badge>
                  </span>
                  <span className="block text-sm font-semibold">
                    {t('deploy.modelProviderOfficialTitle')}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-text-muted">
                    {t('deploy.modelProviderOfficialDescription')}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={modelProviderMode === 'custom'}
                  onClick={() => setValue('modelProviderMode', 'custom', { shouldDirty: true })}
                  className={cn(
                    'group rounded-2xl p-3 text-left transition-all shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]',
                    modelProviderMode === 'custom'
                      ? 'bg-primary/12 text-text-primary shadow-[0_0_0_1px_rgba(34,211,238,0.45)_inset]'
                      : 'bg-bg-primary/25 text-text-muted hover:bg-bg-primary/35 hover:text-text-primary',
                  )}
                >
                  <span className="mb-3 flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-xl',
                        modelProviderMode === 'custom'
                          ? 'bg-primary text-bg-primary'
                          : 'bg-bg-secondary/30 text-text-secondary group-hover:text-primary',
                      )}
                    >
                      <Key size={17} />
                    </span>
                    <Badge variant={modelProviderMode === 'custom' ? 'primary' : 'neutral'}>
                      {t('deploy.modelProviderCustomBadge')}
                    </Badge>
                  </span>
                  <span className="block text-sm font-semibold">
                    {t('deploy.modelProviderCustomTitle')}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-text-muted">
                    {t('deploy.modelProviderCustomDescription')}
                  </span>
                </button>
              </div>

              <div
                role="tabpanel"
                className="rounded-2xl bg-bg-primary/25 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset]"
              >
                {modelProviderMode === 'official' ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                        <Wallet size={17} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-text-primary">
                            {t('deploy.modelProviderOfficialTitle')}
                          </h4>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {t('deploy.modelProviderOfficialBadge')}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-text-muted">
                          {t('deploy.modelProviderOfficialDescription')}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {modelProxyPricing.kind === 'loading' && (
                        <div className="rounded-xl bg-bg-secondary/16 px-3 py-2 text-xs leading-relaxed text-text-secondary sm:col-span-3">
                          {t('deploy.modelProviderOfficialPricingLoading')}
                        </div>
                      )}
                      {modelProxyPricing.kind === 'tokens' && (
                        <>
                          <div className="rounded-xl bg-bg-secondary/16 px-3 py-2">
                            <p className="text-[11px] font-semibold text-text-muted">
                              {t('deploy.modelProviderRateInput')}
                            </p>
                            <p className="mt-1 text-sm font-black text-text-primary">
                              {t('deploy.modelProviderRateTokensValue', {
                                tokenCount: modelProxyPricing.input,
                              })}
                            </p>
                          </div>
                          <div className="rounded-xl bg-bg-secondary/16 px-3 py-2">
                            <p className="text-[11px] font-semibold text-text-muted">
                              {t('deploy.modelProviderRateOutput')}
                            </p>
                            <p className="mt-1 text-sm font-black text-text-primary">
                              {t('deploy.modelProviderRateTokensValue', {
                                tokenCount: modelProxyPricing.output,
                              })}
                            </p>
                          </div>
                        </>
                      )}
                      {modelProxyPricing.kind === 'usage' && (
                        <>
                          <div className="rounded-xl bg-bg-secondary/16 px-3 py-2">
                            <p className="text-[11px] font-semibold text-text-muted">
                              {t('deploy.modelProviderRateCacheHit')}
                            </p>
                            <p className="mt-1 text-sm font-black text-text-primary">
                              {t('deploy.modelProviderRatePerMillionValue', {
                                amount: modelProxyPricing.cacheHit,
                              })}
                            </p>
                          </div>
                          <div className="rounded-xl bg-bg-secondary/16 px-3 py-2">
                            <p className="text-[11px] font-semibold text-text-muted">
                              {t('deploy.modelProviderRateCacheMiss')}
                            </p>
                            <p className="mt-1 text-sm font-black text-text-primary">
                              {t('deploy.modelProviderRatePerMillionValue', {
                                amount: modelProxyPricing.cacheMiss,
                              })}
                            </p>
                          </div>
                          <div className="rounded-xl bg-bg-secondary/16 px-3 py-2">
                            <p className="text-[11px] font-semibold text-text-muted">
                              {t('deploy.modelProviderRateOutput')}
                            </p>
                            <p className="mt-1 text-sm font-black text-text-primary">
                              {t('deploy.modelProviderRatePerMillionValue', {
                                amount: modelProxyPricing.output,
                              })}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    {modelProxyPricing.kind === 'usage' && (
                      <div className="rounded-xl bg-primary/8 px-3 py-2 text-xs leading-relaxed text-primary">
                        {t('deploy.modelProviderExchangeRate', {
                          shrimpPerCny: modelProxyPricing.shrimpPerCny,
                        })}
                      </div>
                    )}
                    <div className="rounded-xl bg-bg-secondary/12 px-3 py-2 text-xs leading-relaxed text-text-secondary">
                      {t('deploy.modelProviderOfficialWalletHint')}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button type="button" variant="ghost" size="sm" onClick={openWallet}>
                        <Wallet size={13} />
                        {t('deploy.viewWalletAndBilling')}
                      </Button>
                      <Button type="button" onClick={openRecharge} variant="ghost" size="sm">
                        <DollarSign size={13} />
                        {t('deploy.topUp')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg-secondary/30 text-text-secondary">
                        <Key size={17} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-text-primary">
                            {t('deploy.modelProviderCustomTitle')}
                          </h4>
                          <span className="rounded-full bg-bg-secondary/30 px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                            {t('deploy.modelProviderCustomBadge')}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-text-muted">
                          {t('deploy.modelProviderCustomDescription')}
                        </p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'flex items-start gap-2 rounded-xl px-3 py-2 text-xs',
                        enabledProviderProfiles.length > 0
                          ? 'bg-success/8 text-success'
                          : 'bg-warning/8 text-warning',
                      )}
                    >
                      {enabledProviderProfiles.length > 0 ? (
                        <CheckCircle size={13} className="mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      )}
                      <span>
                        {enabledProviderProfiles.length > 0
                          ? t('deploy.providerProfilesReadyDesc')
                          : t('deploy.providerProfilesMissingDesc')}
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl bg-bg-secondary/16 px-3 py-2 text-xs leading-relaxed text-text-secondary">
                        {t('deploy.modelProviderCustomSelfPaidNote')}
                      </div>
                      <div className="rounded-xl bg-bg-secondary/16 px-3 py-2 text-xs leading-relaxed text-text-secondary">
                        {t('deploy.modelProviderCustomSecureNote')}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate({ to: '/providers' })}
                      className="w-full justify-center"
                    >
                      <CircleHelp size={13} />
                      {t('deploy.manageProviderProfiles')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Shadow Connection */}
          {!isSaasMode && (
            <div className="rounded-xl bg-bg-secondary/10 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Unplug size={14} className="text-text-muted" />
                <div>
                  <h3 className="text-sm font-semibold">{t('deploy.shadowConnectionTitle')}</h3>
                  <p className="text-xs text-text-muted">
                    {t('deploy.shadowConnectionDescription')}
                  </p>
                </div>
              </div>
              <EnvVarRow
                envKey="SHADOWOB_SERVER_URL"
                placeholder="https://your-shadow-server.example.com"
                isSecret={false}
                value={envVars.SHADOWOB_SERVER_URL ?? ''}
                hasSaved={Boolean(combinedLookup.SHADOWOB_SERVER_URL)}
                error={getEnvFieldError(errors, 'SHADOWOB_SERVER_URL').hasError}
                errorMessage={getEnvFieldError(errors, 'SHADOWOB_SERVER_URL').message}
                inputRef={(el) => {
                  inputRefs.current.SHADOWOB_SERVER_URL = el
                }}
                onValueChange={(value) => updateVar('SHADOWOB_SERVER_URL', value)}
                onInputBlur={() => clearErrors('envVars.SHADOWOB_SERVER_URL')}
                onUseSaved={() => updateVar('SHADOWOB_SERVER_URL', '__SAVED__')}
                onOverrideSaved={() => updateVar('SHADOWOB_SERVER_URL', '')}
                t={t}
              />
              <EnvVarRow
                envKey="SHADOWOB_USER_TOKEN"
                placeholder="pat_..."
                isSecret
                value={envVars.SHADOWOB_USER_TOKEN ?? ''}
                hasSaved={Boolean(combinedLookup.SHADOWOB_USER_TOKEN)}
                error={getEnvFieldError(errors, 'SHADOWOB_USER_TOKEN').hasError}
                errorMessage={getEnvFieldError(errors, 'SHADOWOB_USER_TOKEN').message}
                inputRef={(el) => {
                  inputRefs.current.SHADOWOB_USER_TOKEN = el
                }}
                onValueChange={(value) => updateVar('SHADOWOB_USER_TOKEN', value)}
                onInputBlur={() => clearErrors('envVars.SHADOWOB_USER_TOKEN')}
                onUseSaved={() => updateVar('SHADOWOB_USER_TOKEN', '__SAVED__')}
                onOverrideSaved={() => updateVar('SHADOWOB_USER_TOKEN', '')}
                t={t}
              />
            </div>
          )}

          {/* Preset environment variable fields */}
          {(templateEnvFields.length > 0 || autoDetectedEnvVars.length > 0) && (
            <div className="rounded-xl bg-bg-secondary/10 p-4 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-2">
                  <Key size={14} className="mt-0.5 text-warning" />
                  <div>
                    <h3 className="text-sm font-semibold">{t('deploy.envFieldSlotsTitle')}</h3>
                    <p className="text-xs text-text-muted">
                      {t('deploy.envFieldSlotsDescription', {
                        count: templateEnvFields.length,
                        required: requiredTemplateVars.length,
                      })}
                    </p>
                  </div>
                </div>
                <div>
                  <span className="rounded-full bg-warning/10 px-2 py-1 text-[11px] font-semibold text-warning">
                    {t('deploy.requiredCount', { count: requiredTemplateVars.length })}
                  </span>
                </div>
              </div>

              {autoDetectedEnvVars.length > 0 && (
                <div className="rounded-lg bg-bg-secondary/12 px-3 py-2 text-xs text-text-secondary">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-success" />
                    <div className="space-y-1">
                      <p className="font-medium text-success">
                        {t('deploy.autoDetectedVarsTitle', {
                          count: autoDetectedEnvVars.length,
                        })}
                      </p>
                      <p>{t('deploy.autoDetectedVarsDescription')}</p>
                    </div>
                  </div>
                </div>
              )}

              {templateEnvFieldGroups.map((group) => {
                const requiredCount = group.fields.filter((field) => field.required).length
                const collapsed =
                  collapsedFieldGroups[group.id] ??
                  (group.source === 'plugin' && requiredCount === 0)
                const filledCount = group.fields.filter((field) => {
                  const value = envVars[field.key]
                  return (
                    value === '__SAVED__' ||
                    Boolean(value?.trim()) ||
                    Boolean(combinedLookup[field.key])
                  )
                }).length
                return (
                  <div key={group.id} className="overflow-hidden rounded-xl bg-bg-secondary/10">
                    <div className="flex items-center gap-2 px-4 py-3 transition-colors hover:bg-bg-secondary/20">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedFieldGroups((prev) => ({
                            ...prev,
                            [group.id]: !collapsed,
                          }))
                        }
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className={cn(
                              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                              group.source === 'plugin'
                                ? 'bg-bg-secondary/30 text-primary'
                                : 'bg-bg-secondary/30 text-warning',
                            )}
                          >
                            {group.source === 'plugin' ? <Unplug size={14} /> : <Key size={14} />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-semibold text-text-primary">
                                {group.title}
                              </h4>
                              <span className="rounded-full bg-bg-secondary/30 px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                                {group.source === 'plugin'
                                  ? t('deploy.pluginSourceBadge')
                                  : t('deploy.templateSourceBadge')}
                              </span>
                              {requiredCount > 0 && (
                                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                                  {t('deploy.requiredCount', { count: requiredCount })}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-text-muted">
                              {group.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-xs text-text-muted">
                          <span>
                            {t('deploy.fieldGroupProgress', {
                              filled: filledCount,
                              total: group.fields.length,
                            })}
                          </span>
                          <ChevronRight
                            size={15}
                            className={cn('transition-transform', !collapsed && 'rotate-90')}
                          />
                        </div>
                      </button>
                      {group.source === 'plugin' &&
                        (group.helpUrl ? (
                          <a
                            href={group.helpUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 w-8 shrink-0 self-center items-center justify-center rounded-full bg-bg-primary/35 text-text-muted transition-colors hover:bg-primary/12 hover:text-primary"
                            aria-label={t('deploy.openConfigHelp')}
                            title={t('deploy.openConfigHelp')}
                          >
                            <CircleHelp size={15} />
                          </a>
                        ) : (
                          <Link
                            to="/secrets"
                            className="inline-flex h-8 w-8 shrink-0 self-center items-center justify-center rounded-full bg-bg-primary/35 text-text-muted transition-colors hover:bg-primary/12 hover:text-primary"
                            aria-label={t('deploy.openConfigHelp')}
                            title={t('deploy.openConfigHelp')}
                          >
                            <CircleHelp size={15} />
                          </Link>
                        ))}
                    </div>

                    {!collapsed && (
                      <div className="space-y-3 p-3">
                        {group.fields.map((field) => {
                          const { key } = field
                          const fieldError = getEnvFieldError(errors, key)
                          return (
                            <EnvVarRow
                              key={key}
                              envKey={key}
                              label={field.label}
                              description={field.description}
                              required={field.required}
                              isSecret={field.sensitive}
                              placeholder={
                                field.placeholder ??
                                (key.includes('KEY') ||
                                key.includes('TOKEN') ||
                                key.includes('SECRET')
                                  ? 'sk-...'
                                  : t('deploy.enterValue'))
                              }
                              value={envVars[key] ?? ''}
                              hasSaved={Boolean(combinedLookup[key])}
                              error={fieldError.hasError}
                              errorMessage={fieldError.message}
                              inputRef={(el) => {
                                inputRefs.current[key] = el
                              }}
                              onValueChange={(value) => updateVar(key, value)}
                              onInputBlur={() => clearErrors(`envVars.${key}` as const)}
                              onUseSaved={() => updateVar(key, '__SAVED__')}
                              onOverrideSaved={() => updateVar(key, '')}
                              t={t}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Extra env vars (optional) */}
          <div className="rounded-xl bg-bg-secondary/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">{t('deploy.additionalVariables')}</h3>
                <p className="text-xs text-text-muted">{t('deploy.optionalKeyValue')}</p>
              </div>
              <Button
                type="button"
                onClick={() => setExtraVars([...extraVars, { key: '', value: '' }])}
                variant="ghost"
                size="sm"
              >
                <Plus size={12} />
                {t('deploy.addVariable')}
              </Button>
            </div>
            {extraVars.length === 0 ? (
              <div className="text-center py-3 text-xs text-text-muted rounded-lg bg-bg-secondary/10">
                {t('deploy.noAdditionalVars')}
              </div>
            ) : (
              <div className="space-y-2">
                {extraVars.map((env, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={env.key}
                      onChange={(e) => {
                        const updated = [...extraVars]
                        const current = updated[i]
                        if (!current) return
                        updated[i] = { ...current, key: e.target.value }
                        setExtraVars(updated)
                        if (e.target.value) updateVar(e.target.value, env.value)
                      }}
                      placeholder="KEY"
                      className="flex-1"
                    />
                    <span className="text-text-muted text-xs">=</span>
                    <Input
                      type="text"
                      value={env.value}
                      onChange={(e) => {
                        const updated = [...extraVars]
                        const current = updated[i]
                        if (!current) return
                        updated[i] = { ...current, value: e.target.value }
                        setExtraVars(updated)
                        if (env.key) updateVar(env.key, e.target.value)
                      }}
                      placeholder="value"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={() => {
                        const removed = extraVars[i]
                        setExtraVars(extraVars.filter((_, j) => j !== i))
                        if (removed?.key) {
                          const updated = { ...envVars }
                          delete updated[removed.key]
                          setValue('envVars', updated, { shouldDirty: true })
                        }
                      }}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 p-1 text-text-muted hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </GlassPanel>

      <div className="flex items-center justify-between gap-3 px-1">
        <Button type="button" onClick={onBack} variant="ghost">
          <ArrowLeft size={14} />
          {t('common.back')}
        </Button>
        <Button type="submit" variant="primary">
          {t('common.continue')}
          <ArrowRight size={14} />
        </Button>
      </div>
    </form>
  )
}

// ── Step 3: Providers ─────────────────────────────────────────────────────────

export function StepProviders({
  providers,
  onChange,
}: {
  providers: ProviderSettings[]
  onChange: (providers: ProviderSettings[]) => void
}) {
  const api = useApiClient()
  const { t } = useTranslation()
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  })

  const existingProviders = useMemo(() => settings?.providers ?? [], [settings?.providers])
  const [useExisting, setUseExisting] = useState(true)

  // Auto-populate from settings
  useEffect(() => {
    if (existingProviders.length > 0 && providers.length === 0 && useExisting) {
      onChange(existingProviders)
    }
  }, [existingProviders, providers.length, useExisting, onChange])

  const addPreset = (preset: (typeof API_PRESETS)[number]) => {
    const provider: ProviderSettings = {
      id: preset.id,
      api: preset.api,
      ...(preset.baseUrl ? { baseUrl: preset.baseUrl } : {}),
    }
    onChange([...providers, provider])
  }

  const updateProvider = (
    index: number,
    field: keyof Pick<ProviderSettings, 'baseUrl'>,
    value: string,
  ) => {
    const updated = [...providers]
    const current = updated[index]
    if (!current) return
    updated[index] = { ...current, [field]: value }
    onChange(updated)
  }

  const removeProvider = (index: number) => {
    onChange(providers.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold mb-1">{t('deploy.providersTitle')}</h2>
        <p className="text-sm text-text-muted">{t('deploy.providersDescription')}</p>
      </div>

      {/* Use existing settings toggle */}
      {existingProviders.length > 0 && (
        <div className="bg-bg-secondary/18 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-success" />
            <div>
              <p className="text-sm font-medium text-text-primary">
                {t('deploy.providersConfiguredInSettings', { count: existingProviders.length })}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {t('deploy.providersUseExistingDescription')}
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={useExisting}
              onCheckedChange={(checked) => {
                const next = checked === true
                setUseExisting(next)
                if (next) onChange(existingProviders)
                else onChange([])
              }}
            />
            <span className="text-xs text-text-secondary">{t('deploy.useExisting')}</span>
          </label>
        </div>
      )}

      {/* Provider list */}
      <div className="space-y-3">
        {providers.map((provider, i) => (
          <div key={`${provider.id}-${i}`} className="rounded-xl bg-bg-secondary/12 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Key size={14} className="text-text-muted" />
                <span className="text-sm font-medium">{provider.id}</span>
                <span className="text-xs text-text-muted font-mono">{provider.api}</span>
              </div>
              <Button type="button" onClick={() => removeProvider(i)} variant="ghost" size="icon">
                <Trash2 size={13} />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg bg-bg-secondary/20 px-3 py-2.5">
                <label className="text-xs text-text-muted mb-1 block">
                  {t('settings.secretEnvKey')}
                </label>
                <code className="text-xs font-mono text-warning break-all">
                  {getProviderSecretEnvName(provider.id)}
                </code>
                <p className="text-xs text-text-muted mt-2">
                  {t('settings.credentialsManagedInSecrets')}
                </p>
              </div>
              {provider.baseUrl !== undefined && (
                <div>
                  <label className="text-xs text-text-muted mb-1 block">
                    {t('settings.baseUrl')}
                  </label>
                  <Input
                    type="text"
                    value={provider.baseUrl ?? ''}
                    onChange={(e) => updateProvider(i, 'baseUrl', e.target.value)}
                    placeholder="https://api.example.com/v1"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add provider */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-text-muted">{t('deploy.addProvider')}</span>
        {API_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            onClick={() => addPreset(preset)}
            disabled={providers.some((p) => p.id === preset.id)}
            variant="ghost"
            size="sm"
          >
            + {preset.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

// ── Step 4: Deploy ────────────────────────────────────────────────────────────

function StepDeploy({
  name,
  config,
  onBack,
}: {
  name: string
  config: DeployConfig
  onBack: () => void
}) {
  const api = useApiClient()
  const { t, i18n } = useTranslation()
  const logRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollLogRef = useRef(true)
  const [showLogTimestamps, setShowLogTimestamps] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()
  const appNavigate = useAppNavigation()
  const queryClient = useQueryClient()
  const addActivity = useAppStore((s) => s.addActivity)
  const addRecentDeploy = useAppStore((s) => s.addRecentDeploy)
  const {
    lines,
    entries: logLines,
    status,
    error: sseError,
    connect,
    startFetch,
    disconnect,
    clear,
  } = useSSEStream()
  const [deployStarted, setDeployStarted] = useState(false)
  const [deploySuccess, setDeploySuccess] = useState<boolean | null>(null)
  const [taskInfo, setTaskInfo] = useState<{ id: number | string; url: string } | null>(null)
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null)
  const [deploymentStatus, setDeploymentStatus] = useState<
    | 'pending'
    | 'deploying'
    | 'cancelling'
    | 'deployed'
    | 'failed'
    | 'destroying'
    | 'destroyed'
    | null
  >(null)
  const [cancelRequested, setCancelRequested] = useState(false)
  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const [shadowServerId, setShadowServerId] = useState<string | null>(null)
  const terminalHandledRef = useRef(false)
  const { data: detailData } = useQuery({
    queryKey: ['template-detail', name, i18n.language],
    queryFn: () => api.templates.detail(name, i18n.language),
  })
  const template = detailData?.template
  const displayTitle = template?.title || name
  const targetNamespace = config.namespace || template?.namespace || name
  const { data: runtimePreview } = useTemplateRuntimePreview(name)

  // Fetch wallet balance
  const { data: walletData } = useQuery({
    queryKey: ['wallet'],
    queryFn: () =>
      (api as { wallet?: { get: () => Promise<{ balance: number }> } }).wallet?.get?.() ??
      Promise.resolve({ balance: null as number | null }),
    retry: false,
  })
  const walletBalance = walletData?.balance ?? null

  const hourlyCost = 1
  const hasEnoughBalance = walletBalance === null || walletBalance >= hourlyCost
  const deploymentEnvVars = useMemo(
    () => filterOfficialModelEnvVars(config.envVars, config.modelProviderMode),
    [config.envVars, config.modelProviderMode],
  )
  const configuredEnvCount = Object.keys(deploymentEnvVars).filter((key) =>
    Boolean(deploymentEnvVars[key]),
  ).length
  const modelProviderSummary =
    config.modelProviderMode === 'official'
      ? t('deploy.modelProviderOfficialSummary')
      : t('deploy.modelProviderCustomSummary')
  const agentSummary =
    template?.features && template.features.length > 0
      ? `${t('deploy.includes')}: ${(template.features ?? []).slice(0, 2).join(', ')}`
      : t('deploy.asConfigured')
  const walletSummary =
    walletBalance === null ? t('common.loading') : `${walletBalance} ${t('deploy.shrimpCoins')}`

  const taskUrl = taskInfo ? new URL(taskInfo.url, window.location.origin).toString() : ''

  type DeployInvocationResult = {
    success: boolean
    error?: string
    exitCode?: number | null
    deploymentId?: string
    status?:
      | 'pending'
      | 'deploying'
      | 'cancelling'
      | 'deployed'
      | 'failed'
      | 'destroying'
      | 'destroyed'
  }

  const deployApi = api as typeof api & {
    deployFn?: (config: {
      templateSlug: string
      namespace: string
      name: string
      resourceTier: string
      configSnapshot: Record<string, unknown>
      envVars?: Record<string, string>
      runtimeContext?: BrowserRuntimeContext
    }) => Promise<DeployInvocationResult>
    deploymentStatusFn?: (deploymentId: string) => Promise<{
      id: string
      status:
        | 'pending'
        | 'deploying'
        | 'cancelling'
        | 'deployed'
        | 'failed'
        | 'destroying'
        | 'destroyed'
      errorMessage?: string | null
      shadowServerId?: string | null
    }>
    deploymentLogsUrlFn?: (deploymentId: string) => string
    cancelDeploymentFn?: (deploymentId: string) => Promise<{ ok: boolean; status?: string }>
  }

  const handleLogScroll = useCallback(() => {
    const el = logRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    shouldAutoScrollLogRef.current = distanceFromBottom < 64
  }, [])

  // Follow new log output only while the user is still reading near the bottom.
  useEffect(() => {
    const el = logRef.current
    if (!el || !shouldAutoScrollLogRef.current) return
    el.scrollTop = el.scrollHeight
  }, [lines.length])

  const finalizeSuccessfulDeployment = useCallback(async () => {
    if (terminalHandledRef.current) return
    terminalHandledRef.current = true
    setDeploySuccess(true)
    setDeploymentStatus('deployed')
    setSuccessModalOpen(true)

    const envEntries = Object.entries(deploymentEnvVars).filter(
      ([, v]) => v && v !== '__SAVED__' && v.trim() !== '',
    )

    const persistence = normalizeEnvPersistence(config.envPersistence)
    const persistOps: Array<Promise<unknown>> = []
    for (const [key, value] of envEntries) {
      if (persistence.remember) {
        persistOps.push(api.env.upsert('global', key, value, true, persistence.groupName))
      }
      if (persistence.bindNamespace) {
        persistOps.push(api.deployments.env.upsert(targetNamespace, key, value, true))
      }
    }

    if (persistOps.length > 0) {
      const results = await Promise.allSettled(persistOps)
      if (results.some((result) => result.status === 'rejected')) {
        toast.warning(t('deploy.secretSaveFailed'))
      }
    }

    addActivity({
      type: 'deploy',
      title: t('deploy.activityDeployedTitle', { name }),
      detail: t('deploy.activityDeployedDetail', { name, namespace: targetNamespace }),
      namespace: targetNamespace,
      template: name,
    })
    addRecentDeploy(name, targetNamespace)

    queryClient.invalidateQueries({ queryKey: ['deployments'] })
    queryClient.invalidateQueries({ queryKey: ['deployment-env', targetNamespace] })
    queryClient.invalidateQueries({ queryKey: ['env'] })
    queryClient.invalidateQueries({ queryKey: ['namespace-costs', targetNamespace] })
    queryClient.invalidateQueries({ queryKey: ['cost-overview'] })
    queryClient.invalidateQueries({ queryKey: ['deployment-cost-overview'] })
  }, [
    addActivity,
    addRecentDeploy,
    api.env,
    api.deployments.env,
    config.envPersistence,
    deploymentEnvVars,
    name,
    queryClient,
    targetNamespace,
    t,
    toast,
  ])

  const finalizeFailedDeployment = useCallback(
    (message: string, options?: { cancelled?: boolean }) => {
      if (terminalHandledRef.current) return
      terminalHandledRef.current = true
      setDeploySuccess(false)

      if (options?.cancelled) {
        toast.warning(message)
        addActivity({
          type: 'deploy',
          title: `Cancelled deployment ${name}`,
          detail: message,
          template: name,
        })
        return
      }

      toast.error(t('deploy.deployFailedWithMessage', { message }))
      addActivity({
        type: 'deploy',
        title: `Failed to deploy ${name}`,
        detail: message,
        template: name,
      })
    },
    [addActivity, name, t, toast],
  )

  useEffect(() => {
    if (!activeDeploymentId || typeof deployApi.deploymentLogsUrlFn !== 'function') return
    connect(deployApi.deploymentLogsUrlFn(activeDeploymentId))
  }, [activeDeploymentId, connect, deployApi])

  useEffect(() => {
    if (
      !deployStarted ||
      !activeDeploymentId ||
      deploySuccess !== null ||
      typeof deployApi.deploymentStatusFn !== 'function'
    ) {
      return
    }

    let cancelled = false

    const pollStatus = async () => {
      while (!cancelled && !terminalHandledRef.current) {
        try {
          const current = await deployApi.deploymentStatusFn?.(activeDeploymentId)
          if (!current || cancelled) return

          setDeploymentStatus(current.status)
          if (current.shadowServerId) {
            setShadowServerId(current.shadowServerId)
          }

          if (current.status === 'deployed') {
            await finalizeSuccessfulDeployment()
            return
          }

          if (current.status === 'failed') {
            finalizeFailedDeployment(current.errorMessage ?? t('deploy.unknownError'))
            return
          }

          if (current.status === 'destroyed') {
            finalizeFailedDeployment(
              cancelRequested
                ? t('deploy.deploymentCancelled')
                : (current.errorMessage ?? t('deploy.unknownError')),
              { cancelled: cancelRequested },
            )
            return
          }
        } catch (err) {
          finalizeFailedDeployment(err instanceof Error ? err.message : t('deploy.unknownError'))
          return
        }

        await new Promise((resolve) => window.setTimeout(resolve, 2000))
      }
    }

    void pollStatus()

    return () => {
      cancelled = true
    }
  }, [
    activeDeploymentId,
    cancelRequested,
    deployApi,
    deployStarted,
    deploySuccess,
    finalizeFailedDeployment,
    finalizeSuccessfulDeployment,
    t,
  ])

  // Initialize and deploy
  const initMutation = useMutation({
    mutationFn: () => api.init(name),
  })

  const handleDeploy = async () => {
    const runtimeContext = resolveBrowserRuntimeContext(i18n.language)
    terminalHandledRef.current = false
    setDeployStarted(true)
    setDeploySuccess(null)
    setTaskInfo(null)
    setActiveDeploymentId(null)
    setDeploymentStatus(null)
    setCancelRequested(false)
    setSuccessModalOpen(false)
    setShadowServerId(null)
    shouldAutoScrollLogRef.current = true
    disconnect()
    clear()

    try {
      // Step 1: Initialize from template (returns template JSON and persists to DB)
      const templateConfig = await initMutation.mutateAsync()

      // Step 2: Deploy — SaaS mode uses api.deployFn if available
      const deployConfig = typeof templateConfig === 'object' ? { ...templateConfig } : {}
      deployConfig.templateSlug = name
      deployConfig.runtimeContext = runtimeContext
      if (runtimeContext.locale) {
        deployConfig.locale = runtimeContext.locale
      }
      if (config.namespace) {
        deployConfig.namespace = config.namespace
      }
      // Include env vars so the backend can resolve ${env:VAR} placeholders
      if (deploymentEnvVars && Object.keys(deploymentEnvVars).length > 0) {
        deployConfig.envVars = deploymentEnvVars
      }

      const saasConfigSnapshot =
        typeof templateConfig === 'object' && templateConfig !== null
          ? { ...(templateConfig as Record<string, unknown>) }
          : {}

      const existingDeployments =
        saasConfigSnapshot.deployments && typeof saasConfigSnapshot.deployments === 'object'
          ? (saasConfigSnapshot.deployments as Record<string, unknown>)
          : {}

      saasConfigSnapshot.deployments = {
        ...existingDeployments,
        namespace: targetNamespace,
      }
      if (runtimeContext.locale) {
        saasConfigSnapshot.locale = runtimeContext.locale
      }
      const existingRuntime = isRecord(saasConfigSnapshot.__shadowobRuntime)
        ? saasConfigSnapshot.__shadowobRuntime
        : {}
      saasConfigSnapshot.__shadowobRuntime = {
        ...existingRuntime,
        modelProviderMode: config.modelProviderMode,
        officialModelProxy: config.modelProviderMode === 'official',
      }

      let result: DeployInvocationResult

      if (typeof deployApi.deployFn === 'function') {
        // SaaS mode: use the injected deployFn (bypasses local SSE /api/deploy)
        result = await deployApi.deployFn({
          templateSlug: name,
          namespace: targetNamespace,
          name: `${targetNamespace}-${Date.now()}`,
          resourceTier: 'lightweight',
          configSnapshot: saasConfigSnapshot,
          envVars: deploymentEnvVars,
          runtimeContext,
        })

        if (!result.success || !result.deploymentId) {
          setDeploySuccess(false)
          throw new Error(result.error || t('deploy.unknownError'))
        }

        setActiveDeploymentId(result.deploymentId)
        setTaskInfo({
          id: result.deploymentId,
          url: `/app/cloud/deploy-tasks/${encodeURIComponent(result.deploymentId)}`,
        })
        setDeploymentStatus(result.status ?? 'pending')
        return
      } else {
        result = await startFetch('/api/deploy', deployConfig, {
          onEvent: (event, data) => {
            if (
              event === 'task' &&
              data &&
              typeof data === 'object' &&
              'id' in data &&
              'url' in data &&
              typeof data.id === 'number' &&
              typeof data.url === 'string'
            ) {
              setTaskInfo({ id: data.id, url: data.url })
            }
          },
        })
      }

      if (!result.success) {
        throw new Error(
          result.error ||
            t('deploy.deployFailedWithCode', {
              code: 'exitCode' in result ? (result.exitCode ?? t('common.none')) : t('common.none'),
            }),
        )
      }

      await finalizeSuccessfulDeployment()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t('deploy.unknownError')
      finalizeFailedDeployment(errorMsg)
    }
  }

  const handleCancelDeployment = async () => {
    if (!activeDeploymentId || typeof deployApi.cancelDeploymentFn !== 'function') return

    try {
      setCancelRequested(true)
      setDeploymentStatus('cancelling')
      await deployApi.cancelDeploymentFn(activeDeploymentId)
      toast.warning(t('deploy.cancelRequested'))
    } catch (err) {
      setCancelRequested(false)
      setDeploymentStatus('deploying')
      toast.error(
        t('deploy.deployFailedWithMessage', {
          message: err instanceof Error ? err.message : t('deploy.unknownError'),
        }),
      )
    }
  }

  const handleDownloadLog = () => {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `deploy-${name}-${Date.now()}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopyTaskUrl = async () => {
    if (!taskUrl) return

    try {
      await navigator.clipboard.writeText(taskUrl)
      toast.success(t('deployTask.linkCopied'))
    } catch {
      toast.error(t('deployTask.linkCopyFailed'))
    }
  }

  const resetDeploymentState = () => {
    terminalHandledRef.current = false
    disconnect()
    clear()
    setDeployStarted(false)
    setDeploySuccess(null)
    setTaskInfo(null)
    setActiveDeploymentId(null)
    setDeploymentStatus(null)
    setCancelRequested(false)
    setSuccessModalOpen(false)
    setShadowServerId(null)
    shouldAutoScrollLogRef.current = true
  }

  const isDeploying =
    deployStarted &&
    deploySuccess === null &&
    (activeDeploymentId !== null || (status !== 'done' && status !== 'error'))
  const isCancelling = deploymentStatus === 'cancelling'
  const isDone = deploySuccess === true
  const isError = deploySuccess === false
  const openSuccessTarget = () => {
    if (shadowServerId) {
      if (appNavigate) {
        appNavigate({ kind: 'server', serverSlug: shadowServerId })
      } else {
        navigate({
          to: '/deployments/$namespace',
          params: { namespace: targetNamespace },
        })
      }
      return
    }
    navigate({
      to: '/deployments/$namespace',
      params: { namespace: targetNamespace },
    })
  }

  return (
    <div className="space-y-4">
      <GlassPanel className="rounded-2xl p-4">
        <h2 className="text-lg font-semibold mb-1">
          {!deployStarted
            ? t('deploy.reviewDeploy')
            : isDone
              ? t('deploy.deploymentComplete')
              : isError
                ? t('deploy.deploymentFailed')
                : isCancelling
                  ? t('deploy.cancelling')
                  : t('deploy.deploying')}
        </h2>
        <p className="text-sm text-text-muted">
          {!deployStarted
            ? t('deploy.reviewConfig')
            : isDone
              ? t('deploy.deploySuccessDesc')
              : isError
                ? t('deploy.deployFailDesc')
                : isCancelling
                  ? t('deploy.cancelRequested')
                  : t('deploy.deployingToCluster')}
        </p>
      </GlassPanel>

      {/* Review summary (before deploy) */}
      {!deployStarted && (
        <>
          <GlassPanel className="rounded-2xl p-4">
            <StatsGrid className="mb-0 grid-cols-1 md:grid-cols-2">
              <MetricCardWrapper>
                <MetricCardContent
                  label={t('deploy.template')}
                  icon={<Rocket size={11} />}
                  iconClassName="text-text-muted"
                  value={`${template?.emoji ?? '📦'} ${displayTitle}`}
                  valueClassName="text-sm font-medium text-left"
                />
              </MetricCardWrapper>

              <MetricCardWrapper>
                <MetricCardContent
                  label={t('deploy.namespace')}
                  icon={<FolderOpen size={11} />}
                  iconClassName="text-text-muted"
                  value={targetNamespace}
                  valueClassName="text-sm font-mono"
                />
              </MetricCardWrapper>

              <MetricCardWrapper>
                <MetricCardContent
                  label={t('deploy.envVariables')}
                  icon={<Key size={11} />}
                  iconClassName="text-text-muted"
                  value={`${configuredEnvCount} ${t('deploy.configured')}`}
                  valueClassName="text-sm"
                />
              </MetricCardWrapper>

              <MetricCardWrapper>
                <MetricCardContent
                  label={t('deploy.agentsLabel')}
                  icon={<Users size={11} />}
                  iconClassName="text-text-muted"
                  value={agentSummary}
                  valueClassName="text-sm"
                />
              </MetricCardWrapper>

              <MetricCardWrapper>
                <MetricCardContent
                  label={t('deploy.modelProviderSummaryLabel')}
                  icon={<Key size={11} />}
                  iconClassName="text-text-muted"
                  value={modelProviderSummary}
                  valueClassName="text-sm"
                />
              </MetricCardWrapper>

              <MetricCardWrapper>
                <MetricCardContent
                  label={t('deploy.estimatedCost')}
                  icon={<DollarSign size={11} />}
                  iconClassName="text-text-muted"
                  value={`${hourlyCost} ${t('deploy.shrimpCoinsPerHour')}`}
                  valueClassName="text-sm font-medium"
                />
              </MetricCardWrapper>

              <MetricCardWrapper>
                <MetricCardContent
                  label={t('deploy.walletBalance')}
                  icon={<Wallet size={11} />}
                  iconClassName={cn(
                    'text-text-muted',
                    hasEnoughBalance ? 'text-success' : 'text-danger',
                  )}
                  value={walletSummary}
                  valueClassName={cn(
                    'text-sm font-medium',
                    hasEnoughBalance ? 'text-success' : 'text-danger',
                  )}
                />
              </MetricCardWrapper>
            </StatsGrid>

            {!hasEnoughBalance && (
              <div className="mt-4 flex flex-col gap-2.5 rounded-xl bg-danger/8 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <p className="text-xs text-danger">
                  <strong>{t('deploy.insufficientBalance')}</strong>{' '}
                  {t('deploy.insufficientBalanceDesc')}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 w-full sm:w-auto justify-center"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      let acked = false
                      const onAck = () => {
                        acked = true
                        window.removeEventListener('shadow:open-recharge:ack', onAck)
                      }
                      window.addEventListener('shadow:open-recharge:ack', onAck)
                      window.dispatchEvent(
                        new CustomEvent('shadow:open-recharge', {
                          detail: { source: 'deploy-wizard', amount: 10000 },
                        }),
                      )
                      setTimeout(() => {
                        if (!acked) {
                          toast.error(t('deploy.rechargeUnavailable'))
                        }
                      }, 500)
                    }
                  }}
                >
                  {t('deploy.topUp')}
                </Button>
              </div>
            )}

            <div className="mt-3 flex items-start gap-2 rounded-xl bg-bg-secondary/15 px-3 py-2.5">
              <span className="mt-0.5 text-xs text-primary">•</span>
              <p className="text-xs text-text-secondary">
                <strong className="text-text-primary">{t('deploy.whatHappensNext')}</strong>{' '}
                {t(
                  runtimePreview
                    ? 'deploy.whatHappensNextProactiveDesc'
                    : 'deploy.whatHappensNextDesc',
                )}
              </p>
            </div>

            <div className="mt-4 flex justify-between">
              <Button
                type="button"
                onClick={onBack}
                variant="ghost"
                disabled={initMutation.isPending}
              >
                <ArrowLeft size={14} />
                {t('common.back')}
              </Button>
              <Button
                type="button"
                onClick={handleDeploy}
                variant="primary"
                disabled={!hasEnoughBalance || initMutation.isPending}
              >
                {initMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Rocket size={16} />
                )}
                {initMutation.isPending
                  ? t('deploy.preparingDeployment')
                  : t('deploy.startDeployment')}
              </Button>
            </div>
          </GlassPanel>
        </>
      )}

      {/* Deploy progress */}
      {deployStarted && (
        <>
          {/* Status bar */}
          <GlassPanel className="rounded-2xl p-4">
            <div
              className={cn(
                'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl px-3 py-2',
                isDone && 'border-l-2 border-success',
                isError && 'border-l-2 border-danger',
                isCancelling && 'border-l-2 border-warning',
                isDeploying && 'border-l-2 border-primary',
              )}
            >
              <div className="flex items-center gap-3">
                {isCancelling && <Loader2 size={18} className="animate-spin text-warning" />}
                {!isCancelling && isDeploying && (
                  <Loader2 size={18} className="text-primary animate-spin" />
                )}
                {isDone && <CheckCircle size={18} className="text-success" />}
                {isError && <XCircle size={18} className="text-danger" />}
                <div>
                  <p
                    className={cn(
                      'text-sm font-medium',
                      isDone && 'text-success',
                      isError && 'text-danger',
                      isCancelling && 'text-warning',
                      isDeploying && !isCancelling && 'text-primary',
                    )}
                  >
                    {isCancelling && t('deploy.cancelling')}
                    {!isCancelling && isDeploying && t('deploy.deploying')}
                    {isDone && t('deploy.deploymentSuccessful')}
                    {isError && t('deploy.deploymentFailed')}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {isCancelling
                      ? t('deploy.cancelRequested')
                      : t('deploy.logLinesReceived', { count: lines.length })}
                  </p>
                </div>
              </div>
              {activeDeploymentId &&
              typeof deployApi.cancelDeploymentFn === 'function' &&
              !isDone &&
              !isError ? (
                <Button
                  type="button"
                  onClick={handleCancelDeployment}
                  variant="ghost"
                  size="sm"
                  disabled={cancelRequested}
                >
                  {cancelRequested ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <XCircle size={14} />
                  )}
                  {cancelRequested ? t('deploy.cancelling') : t('deploy.cancelDeployment')}
                </Button>
              ) : null}
            </div>
          </GlassPanel>

          {taskInfo && (
            <GlassPanel className="rounded-2xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-text-muted mb-1">{t('deployTask.taskUrl')}</p>
                  <code className="block text-xs font-mono text-text-secondary break-all">
                    {taskUrl}
                  </code>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button type="button" onClick={handleCopyTaskUrl} variant="ghost" size="sm">
                    <Copy size={12} />
                    {t('deployTask.copyLink')}
                  </Button>
                  <Button asChild variant="primary" size="sm">
                    <Link to="/deploy-tasks/$taskId" params={{ taskId: String(taskInfo.id) }}>
                      <Server size={12} />
                      {t('deployTask.openTask')}
                    </Link>
                  </Button>
                  <Link
                    to="/deployments"
                    className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary rounded-xl px-3 py-2 transition-colors"
                  >
                    <Activity size={12} />
                    {t('nav.deployments')}
                  </Link>
                </div>
              </div>
            </GlassPanel>
          )}

          {/* Log viewer */}
          <GlassPanel className="rounded-2xl p-0 overflow-hidden">
            <LogsPanel
              headerLeft={t('deploy.deploymentLog')}
              headerRight={
                <LogsPanelHeaderActions
                  showTimestampsToggle={false}
                  actions={[
                    ...(lines.length > 0
                      ? [
                          {
                            id: 'download',
                            type: 'button' as const,
                            icon: <Download size={11} />,
                            label: t('deploy.download'),
                            onClick: handleDownloadLog,
                          },
                        ]
                      : []),
                  ]}
                />
              }
              lines={logLines}
              collapseRepeats
              showTimestamps={showLogTimestamps}
              footerRight={
                <LogsPanelHeaderActions
                  showTimestamps={showLogTimestamps}
                  onShowTimestampsChange={(checked) => setShowLogTimestamps(checked)}
                  showTimestampsLabel={t('deploy.showTimestamps')}
                  hideTimestampsLabel={t('deploy.hideTimestamps')}
                />
              }
              footerLeft={<span>{t('deploy.logLinesReceived', { count: lines.length })}</span>}
              emptyText={
                isDeploying ? t('deploy.initializingDeployment') : t('deployments.noLogsYet')
              }
              bodyRef={logRef}
              bodyOnScroll={handleLogScroll}
              className="rounded-none border-0"
            />
          </GlassPanel>

          {sseError && (
            <GlassPanel className="rounded-2xl p-4">
              <p className="text-xs text-danger">{sseError}</p>
            </GlassPanel>
          )}

          {isDone && (
            <Modal open={successModalOpen} onClose={() => setSuccessModalOpen(false)}>
              <ModalContent size="md">
                <ModalHeader
                  icon={<CheckCircle2 size={20} className="text-success" />}
                  title={t('deploy.deploymentSuccessful')}
                  subtitle={t(
                    shadowServerId
                      ? 'deploy.shadowServerReadyDescription'
                      : 'deploy.namespaceReadyDescription',
                    { namespace: targetNamespace },
                  )}
                  closeLabel={t('common.close')}
                />
                <ModalBody className="space-y-4">
                  <div className="rounded-2xl bg-bg-secondary/25 px-4 py-3">
                    <p className="text-xs font-medium text-text-muted">{t('deploy.namespace')}</p>
                    <p className="mt-1 font-mono text-sm text-text-primary">{targetNamespace}</p>
                  </div>
                  {taskInfo && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate({
                          to: '/deploy-tasks/$taskId',
                          params: { taskId: String(taskInfo.id) },
                        })
                      }
                      className="flex w-full items-center gap-3 rounded-2xl bg-bg-secondary/20 px-4 py-3 text-left transition-colors hover:bg-primary/5"
                    >
                      <Server size={18} className="text-text-muted" />
                      <span>
                        <span className="block text-sm font-semibold text-text-primary">
                          {t('deployTask.openTask')}
                        </span>
                        <span className="block text-xs text-text-muted">
                          {t('deployTask.openTaskDescription')}
                        </span>
                      </span>
                    </button>
                  )}
                </ModalBody>
                <ModalFooter>
                  <ModalButtonGroup>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setSuccessModalOpen(false)}
                    >
                      {t('common.close')}
                    </Button>
                    <Button type="button" variant="primary" onClick={openSuccessTarget}>
                      <FolderOpen size={14} />
                      {shadowServerId ? t('deploy.openShadowServer') : t('deploy.openNamespace')}
                    </Button>
                  </ModalButtonGroup>
                </ModalFooter>
              </ModalContent>
            </Modal>
          )}
          {isError && (
            <GlassPanel className="rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <Link
                  to="/store"
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary bg-bg-secondary/20 px-4 py-2 rounded-lg transition-colors"
                >
                  {t('store.backToStore')}
                </Link>
                <Button type="button" onClick={resetDeploymentState} variant="ghost">
                  {t('common.retry')}
                </Button>
              </div>
            </GlassPanel>
          )}
        </>
      )}
    </div>
  )
}

// ── Main Wizard Page ──────────────────────────────────────────────────────────

export function DeployWizardPage() {
  const { t, i18n } = useTranslation()
  const api = useApiClient()
  const { name } = useParams({ strict: false }) as { name: string }
  const [currentStep, setCurrentStep] = useState(0)
  const steps = getWizardSteps(t)
  const [deployConfig, setDeployConfig] = useState<DeployConfig>({
    namespace: '',
    envVars: {},
    envPersistence: DEFAULT_ENV_PERSISTENCE,
    modelProviderMode: 'official',
  })
  const { data: detailData } = useQuery({
    queryKey: ['template-detail', name, i18n.language],
    queryFn: () => api.templates.detail(name, i18n.language),
    retry: false,
  })
  const displayTitle = detailData?.template?.title || name

  // Determine nav button label for current step
  const nextLabel =
    currentStep === 0 ? t('common.continue') : currentStep === 1 ? t('common.continue') : null // step 2 has its own deploy button

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  return (
    <PageShell
      breadcrumb={[
        { label: t('store.title'), to: '/store' },
        { label: displayTitle, to: `/store/${name}` },
        { label: t('common.deploy') },
      ]}
      breadcrumbPosition="inside"
      title={displayTitle}
      bodyClassName="space-y-4"
      headerContent={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="grid flex-1 min-w-0 grid-cols-1 sm:grid-cols-3 gap-2">
            {steps.map((step, index) => {
              const status =
                index < currentStep ? 'completed' : index === currentStep ? 'active' : 'upcoming'
              const isClickable = index <= currentStep
              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && setCurrentStep(index)}
                  className={cn(
                    'group relative overflow-hidden rounded-xl px-3 py-2.5 text-left transition-all',
                    isClickable ? 'cursor-pointer hover:-translate-y-[1px]' : 'cursor-default',
                    status === 'active' &&
                      'bg-primary/12 shadow-[0_0_0_1px_rgba(0,243,255,0.06)_inset]',
                    status === 'completed' && 'bg-success/8 hover:bg-success/12',
                    status === 'upcoming' && 'bg-bg-secondary/45 text-text-muted',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-x-0 top-0 h-[2px] opacity-0 transition-opacity',
                      status === 'active' && 'bg-primary/60 opacity-100',
                      status === 'completed' && 'bg-success/50 opacity-100',
                    )}
                  />
                  <div className="relative flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-all',
                        status === 'active' &&
                          'bg-primary text-bg-base shadow-[0_6px_18px_-10px_rgba(0,243,255,0.45)]',
                        status === 'completed' && 'bg-success/20 text-success',
                        status === 'upcoming' && 'bg-bg-secondary text-text-muted',
                      )}
                    >
                      {status === 'completed' ? <CheckCircle2 size={13} /> : index + 1}
                    </div>
                    <div className="min-w-0">
                      <span
                        className={cn(
                          'text-xs md:text-sm font-medium block truncate transition-colors',
                          status === 'active' && 'text-text-primary',
                          status === 'completed' &&
                            'text-text-secondary group-hover:text-text-primary',
                          status === 'upcoming' && 'text-text-muted',
                        )}
                      >
                        {step.label}
                      </span>
                      <span
                        className={cn(
                          'hidden md:block text-[11px] truncate',
                          status === 'active' ? 'text-text-secondary' : 'text-text-muted',
                        )}
                      >
                        {step.description}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-1">
            {currentStep > 0 && currentStep < 2 && (
              <Button type="button" onClick={handleBack} variant="ghost" size="sm">
                <ArrowLeft size={14} />
                {t('common.back')}
              </Button>
            )}
            {nextLabel && currentStep === 0 && (
              <Button type="button" onClick={() => setCurrentStep(1)} variant="primary" size="sm">
                {nextLabel}
                <ArrowRight size={14} />
              </Button>
            )}
            {nextLabel && currentStep === 1 && (
              <Button type="submit" form="wizard-configure-form" variant="primary" size="sm">
                {nextLabel}
                <ArrowRight size={14} />
              </Button>
            )}
          </div>
        </div>
      }
    >
      {currentStep === 0 && <StepOverview name={name} />}
      {currentStep === 1 && (
        <StepConfigure
          name={name}
          config={deployConfig}
          onChange={setDeployConfig}
          onBack={handleBack}
          onNext={() => setCurrentStep(2)}
        />
      )}
      {currentStep === 2 && (
        <StepDeploy name={name} config={deployConfig} onBack={() => setCurrentStep(1)} />
      )}
    </PageShell>
  )
}
