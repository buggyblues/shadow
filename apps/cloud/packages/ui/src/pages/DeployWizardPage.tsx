import { Badge, Button, Checkbox, Input } from '@shadowob/ui'
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
  Clock,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
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
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertBanner, AlertBannerList } from '@/components/AlertBanner'
import { Breadcrumb } from '@/components/Breadcrumb'
import { useSSEStream } from '@/hooks/useSSEStream'
import { api, type ProviderSettings } from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
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
  return translate(`store.categories.${category}`)
}

function getDifficultyLabel(
  difficulty: string,
  translate: (key: string, options?: Record<string, unknown>) => string,
) {
  return translate(`store.difficulties.${difficulty}`)
}

function getProviderSecretEnvName(providerId: string): string {
  return `${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{t('deploy.reviewTemplate')}</h2>
        <p className="text-sm text-text-muted">{t('deploy.confirmDeployKubernetes')}</p>
      </div>

      <div className="bg-bg-secondary border border-border-subtle rounded-xl p-6">
        <div className="flex items-start gap-4">
          <span className="text-4xl">{template?.emoji ?? '📦'}</span>
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-1">{name}</h3>
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
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-bg-deep border border-border-subtle rounded-lg p-3">
                <div className="text-xs text-text-muted flex items-center gap-1 mb-1">
                  <Users size={11} />
                  {t('deploy.agentsLabel')}
                </div>
                <p className="text-lg font-semibold">{template?.agentCount ?? '—'}</p>
              </div>
              <div className="bg-bg-deep border border-border-subtle rounded-lg p-3">
                <div className="text-xs text-text-muted flex items-center gap-1 mb-1">
                  <FolderOpen size={11} />
                  {t('deploy.namespaceLabel')}
                </div>
                <p className="text-sm font-mono mt-1">{template?.namespace ?? '—'}</p>
              </div>
              <div className="bg-bg-deep border border-border-subtle rounded-lg p-3">
                <div className="text-xs text-text-muted flex items-center gap-1 mb-1">
                  <Clock size={11} />
                  {t('deploy.deployTimeLabel')}
                </div>
                <p className="text-sm mt-1">{template?.estimatedDeployTime ?? '—'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Highlights */}
      <AlertBanner variant="info" icon={Sparkles} title={t('deploy.whatYouWillGet')}>
        <AlertBannerList
          variant="info"
          items={template?.highlights ?? []}
          bulletIcon={CheckCircle}
        />
      </AlertBanner>

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

interface DeployConfig {
  namespace: string
  envVars: Record<string, string>
}

function StepConfigure({
  name,
  config,
  onChange,
  onNext,
}: {
  name: string
  config: DeployConfig
  onChange: (config: DeployConfig) => void
  onNext: () => void
}) {
  const api = useApiClient()
  const { t, i18n } = useTranslation()
  const { data: detailData } = useQuery({
    queryKey: ['template-detail', name, i18n.language],
    queryFn: () => api.templates.detail(name, i18n.language),
  })
  const template = detailData?.template
  const resolvedNamespace = config.namespace || template?.namespace || name

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

  const [selectedGroup, setSelectedGroup] = useState<string>('')

  const groups = useMemo(() => {
    const set = new Set<string>(['default'])
    for (const g of globalEnvData?.groups ?? []) set.add(g)
    for (const ev of globalEnvData?.envVars ?? []) set.add(ev.groupName ?? 'default')
    return [...set].sort()
  }, [globalEnvData])

  // Auto-fill namespace with template default on first mount
  const nsInitRef = useRef(false)
  useEffect(() => {
    if (nsInitRef.current || !template) return
    if (!config.namespace) {
      nsInitRef.current = true
      onChange({ ...config, namespace: template.namespace ?? name })
    }
  }, [template, config, onChange, name])

  // Fetch already-saved env vars + secrets from backend
  const { data: savedEnvData } = useQuery({
    queryKey: ['deployment-env', resolvedNamespace, 'effective'],
    queryFn: () => api.deployments.env.list(resolvedNamespace, 'effective'),
    enabled: Boolean(resolvedNamespace),
  })

  const requiredVars =
    envRefsData?.requiredEnvVars ??
    (isEnvRefsError ? extractClientEnvRefs(ownTemplateForEnv?.content) : [])

  // Build a lookup of saved env var keys → masked values (from effective deployment env)
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
    for (const ev of globalEnvData?.envVars ?? []) {
      if (!selectedGroup || (ev.groupName ?? 'default') === selectedGroup) {
        lookup[ev.key] = ev.maskedValue
      }
    }
    return lookup
  }, [globalEnvData, selectedGroup])

  // Combined lookup: deployment-effective takes priority, then group-filtered global
  const combinedLookup = useMemo(
    () => ({ ...globalLookup, ...savedLookup }),
    [globalLookup, savedLookup],
  )

  // Auto-populate from saved values on first load
  const initializedRef = useRef(false)
  useEffect(() => {
    initializedRef.current = false
  }, [resolvedNamespace])

  useEffect(() => {
    if (initializedRef.current || Object.keys(combinedLookup).length === 0) return
    if (envRefsData === undefined) return
    initializedRef.current = true
    const merged = { ...config.envVars }
    let changed = false
    for (const shadowKey of ['SHADOW_SERVER_URL', 'SHADOW_USER_TOKEN']) {
      if (!merged[shadowKey] && combinedLookup[shadowKey]) {
        merged[shadowKey] = '__SAVED__'
        changed = true
      }
    }
    for (const key of requiredVars) {
      if (!merged[key] && combinedLookup[key]) {
        merged[key] = '__SAVED__'
        changed = true
      }
    }
    if (changed) onChange({ ...config, envVars: merged })
  }, [requiredVars, combinedLookup, config, onChange, envRefsData])

  // When group changes, re-fill any already-saved marked vars that now have values
  const applyGroup = (group: string) => {
    setSelectedGroup(group)
    const groupVars: Record<string, string> = {}
    for (const ev of globalEnvData?.envVars ?? []) {
      if ((ev.groupName ?? 'default') === group) groupVars[ev.key] = ev.maskedValue
    }
    const merged = { ...config.envVars }
    let changed = false
    const allKeys = ['SHADOW_SERVER_URL', 'SHADOW_USER_TOKEN', ...requiredVars]
    for (const key of allKeys) {
      if (groupVars[key] || savedLookup[key]) {
        merged[key] = '__SAVED__'
        changed = true
      }
    }
    if (changed) onChange({ ...config, envVars: merged })
  }

  const [extraVars, setExtraVars] = useState<Array<{ key: string; value: string }>>([])
  const [validationError, setValidationError] = useState<string | null>(null)
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})

  const updateVar = (key: string, value: string) => {
    onChange({ ...config, envVars: { ...config.envVars, [key]: value } })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const shadowUrl = config.envVars.SHADOW_SERVER_URL
    const shadowToken = config.envVars.SHADOW_USER_TOKEN
    const missingShadow: string[] = []
    if (!shadowUrl || (shadowUrl !== '__SAVED__' && !shadowUrl.trim())) {
      if (!combinedLookup.SHADOW_SERVER_URL) missingShadow.push('SHADOW_SERVER_URL')
    }
    if (!shadowToken || (shadowToken !== '__SAVED__' && !shadowToken.trim())) {
      if (!combinedLookup.SHADOW_USER_TOKEN) missingShadow.push('SHADOW_USER_TOKEN')
    }
    const missing = requiredVars.filter((k) => {
      const val = config.envVars[k]
      return !val || val.trim() === ''
    })
    const trulyMissing = missing.filter((k) => !combinedLookup[k])
    const allMissing = [...missingShadow, ...trulyMissing]
    if (allMissing.length > 0) {
      setValidationError(`${t('deploy.missingRequiredVars')} ${allMissing.join(', ')}`)
      return
    }
    setValidationError(null)
    onNext()
  }

  const toggleShowPassword = (key: string) => {
    setShowPasswords((p) => ({ ...p, [key]: !p[key] }))
  }

  // Reusable env var row: shows saved chip or input
  const EnvVarRow = ({
    envKey,
    placeholder,
    isPassword = true,
  }: {
    envKey: string
    placeholder?: string
    isPassword?: boolean
  }) => {
    const isUsingSaved = config.envVars[envKey] === '__SAVED__'
    const hasSaved = !!combinedLookup[envKey]
    const isFilled = isUsingSaved || Boolean(config.envVars[envKey]?.trim())

    return (
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-mono text-text-secondary">
          {isFilled ? (
            <CheckCircle size={11} className="text-success" />
          ) : (
            <AlertTriangle size={11} className="text-warning" />
          )}
          {envKey}
          <span className="text-danger text-[10px]">*</span>
        </label>
        {isUsingSaved ? (
          <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/8 px-3 py-2">
            <CheckCircle size={12} className="text-success shrink-0" />
            <span className="flex-1 text-xs text-success font-mono">
              {t('deploy.usingSavedValue')}
            </span>
            <button
              type="button"
              onClick={() => updateVar(envKey, '')}
              className="text-[11px] text-text-muted hover:text-text-primary transition-colors shrink-0"
            >
              {t('deploy.override')}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={isPassword && !showPasswords[envKey] ? 'password' : 'text'}
                value={config.envVars[envKey] ?? ''}
                onChange={(e) => updateVar(envKey, e.target.value)}
                placeholder={placeholder}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
              {isPassword && (
                <button
                  type="button"
                  onClick={() => toggleShowPassword(envKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  {showPasswords[envKey] ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              )}
            </div>
            {hasSaved && (
              <button
                type="button"
                onClick={() => updateVar(envKey, '__SAVED__')}
                className="text-[11px] text-primary hover:text-primary/80 transition-colors whitespace-nowrap shrink-0"
              >
                {t('deploy.useSaved')}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <form id="wizard-configure-form" onSubmit={handleSubmit} className="space-y-5">
      {/* Group auto-fill selector */}
      {groups.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-secondary/50 px-4 py-3">
          <Database size={14} className="text-text-muted shrink-0" />
          <span className="text-xs text-text-secondary shrink-0">{t('deploy.fillFromGroup')}</span>
          <select
            value={selectedGroup}
            onChange={(e) => applyGroup(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-xs text-text-primary border border-border-subtle rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary/50"
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

      {/* Namespace */}
      <div className="rounded-xl border border-border-subtle bg-bg-secondary/50 p-4 space-y-3">
        <div>
          <label htmlFor="namespace" className="block text-sm font-semibold mb-0.5">
            {t('deploy.namespace')}
          </label>
          <p className="text-xs text-text-muted">{t('deploy.kubernetesNamespaceDesc')}</p>
        </div>
        <Input
          id="namespace"
          type="text"
          value={config.namespace}
          onChange={(e) => onChange({ ...config, namespace: e.target.value })}
          placeholder={template?.namespace ?? name}
        />
      </div>

      {/* Shadow Connection */}
      <div className="rounded-xl border border-border-subtle bg-bg-secondary/50 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Unplug size={14} className="text-purple-400" />
          <div>
            <h3 className="text-sm font-semibold">{t('deploy.shadowConnectionTitle')}</h3>
            <p className="text-xs text-text-muted">{t('deploy.shadowConnectionDescription')}</p>
          </div>
        </div>
        <EnvVarRow
          envKey="SHADOW_SERVER_URL"
          placeholder="https://your-shadow-server.example.com"
          isPassword={false}
        />
        <EnvVarRow envKey="SHADOW_USER_TOKEN" placeholder="pat_..." />
      </div>

      {/* Required Environment Variables */}
      {requiredVars.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-bg-secondary/50 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Key size={14} className="text-warning" />
            <div>
              <h3 className="text-sm font-semibold">{t('deploy.requiredEnvVars')}</h3>
              <p className="text-xs text-text-muted">
                {t('deploy.templateRequiresVars', { count: requiredVars.length })}{' '}
                {t('deploy.envVarsAllRequired')}
              </p>
            </div>
          </div>
          {requiredVars.map((key) => (
            <EnvVarRow
              key={key}
              envKey={key}
              placeholder={
                key.includes('KEY') || key.includes('TOKEN') || key.includes('SECRET')
                  ? 'sk-...'
                  : t('deploy.enterValue')
              }
            />
          ))}
        </div>
      )}

      {/* Extra env vars (optional) */}
      <div className="rounded-xl border border-border-subtle bg-bg-secondary/50 p-4 space-y-3">
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
          <div className="text-center py-3 text-xs text-text-muted border border-dashed border-border-subtle rounded-lg">
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
                      const updated = { ...config.envVars }
                      delete updated[removed.key]
                      onChange({ ...config, envVars: updated })
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

      {/* Validation error */}
      {validationError && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/8 p-3">
          <XCircle size={14} className="text-danger shrink-0" />
          <p className="text-xs text-danger">{validationError}</p>
        </div>
      )}
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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{t('deploy.providersTitle')}</h2>
        <p className="text-sm text-text-muted">{t('deploy.providersDescription')}</p>
      </div>

      {/* Use existing settings toggle */}
      {existingProviders.length > 0 && (
        <div className="bg-success/8 border border-success/25 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-success" />
            <div>
              <p className="text-sm font-medium text-success">
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
          <div
            key={`${provider.id}-${i}`}
            className="bg-bg-secondary border border-border-subtle rounded-lg p-4"
          >
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
              <div className="bg-bg-deep border border-border-subtle rounded px-3 py-2.5">
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
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const addActivity = useAppStore((s) => s.addActivity)
  const addRecentDeploy = useAppStore((s) => s.addRecentDeploy)
  const { lines, status, error: _sseError, startFetch } = useSSEStream()
  const [deployStarted, setDeployStarted] = useState(false)
  const [deploySuccess, setDeploySuccess] = useState<boolean | null>(null)
  const [taskInfo, setTaskInfo] = useState<{ id: number; url: string } | null>(null)
  const { data: detailData } = useQuery({
    queryKey: ['template-detail', name, i18n.language],
    queryFn: () => api.templates.detail(name, i18n.language),
  })
  const template = detailData?.template
  const targetNamespace = config.namespace || template?.namespace || name

  const taskUrl = taskInfo ? new URL(taskInfo.url, window.location.origin).toString() : ''

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [lines.length])

  // Initialize and deploy
  const initMutation = useMutation({
    mutationFn: () => api.init(name),
  })

  const handleDeploy = async () => {
    setDeployStarted(true)
    setTaskInfo(null)

    try {
      // Step 1: Initialize from template (returns template JSON and persists to DB)
      const templateConfig = await initMutation.mutateAsync()

      // Step 2: Deploy — SaaS mode uses api.deployFn if available
      const deployConfig = typeof templateConfig === 'object' ? { ...templateConfig } : {}
      deployConfig.templateSlug = name
      if (config.namespace) {
        deployConfig.namespace = config.namespace
      }
      // Include env vars so the backend can resolve ${env:VAR} placeholders
      if (config.envVars && Object.keys(config.envVars).length > 0) {
        deployConfig.envVars = config.envVars
      }

      let result: { success: boolean; error?: string }

      if (typeof (api as { deployFn?: unknown }).deployFn === 'function') {
        // SaaS mode: use the injected deployFn (bypasses local SSE /api/deploy)
        result = await (api as { deployFn: typeof api.deployFn & Function }).deployFn({
          templateSlug: name,
          namespace: targetNamespace,
          name: targetNamespace,
          resourceTier: 'lightweight',
          envVars: config.envVars,
        })
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
        setDeploySuccess(false)
        throw new Error(
          result.error ||
            t('deploy.deployFailedWithCode', { code: result.exitCode ?? t('common.none') }),
        )
      }

      setDeploySuccess(true)

      // Save user-entered env vars to Secrets for future deploys
      const envEntries = Object.entries(config.envVars).filter(
        ([, v]) => v && v !== '__SAVED__' && v.trim() !== '',
      )
      for (const [key, value] of envEntries) {
        try {
          await api.deployments.env.upsert(targetNamespace, key, value, true)
        } catch {
          /* non-critical */
        }
      }

      // Record activity
      addActivity({
        type: 'deploy',
        title: `Deployed ${name}`,
        detail: `Template: ${name}, Namespace: ${targetNamespace}`,
        namespace: targetNamespace,
        template: name,
      })
      addRecentDeploy(name, targetNamespace)

      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['deployment-env', targetNamespace] })
      queryClient.invalidateQueries({ queryKey: ['namespace-costs', targetNamespace] })
      queryClient.invalidateQueries({ queryKey: ['cost-overview'] })
      toast.success(t('deploy.successfullyDeployed', { name }))
    } catch (err) {
      setDeploySuccess(false)
      const errorMsg = err instanceof Error ? err.message : t('deploy.unknownError')
      toast.error(t('deploy.deployFailedWithMessage', { message: errorMsg }))
      addActivity({
        type: 'deploy',
        title: `Failed to deploy ${name}`,
        detail: errorMsg,
        template: name,
      })
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

  const isDeploying =
    deployStarted && deploySuccess === null && status !== 'done' && status !== 'error'
  const isDone = deploySuccess === true
  const isError = deploySuccess === false

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">
          {!deployStarted
            ? t('deploy.reviewDeploy')
            : isDone
              ? t('deploy.deploymentComplete')
              : isError
                ? t('deploy.deploymentFailed')
                : t('deploy.deploying')}
        </h2>
        <p className="text-sm text-text-muted">
          {!deployStarted
            ? t('deploy.reviewConfig')
            : isDone
              ? t('deploy.deploySuccessDesc')
              : isError
                ? t('deploy.deployFailDesc')
                : t('deploy.deployingToCluster')}
        </p>
      </div>

      {/* Review summary (before deploy) */}
      {!deployStarted && (
        <>
          <div className="bg-bg-secondary border border-border-subtle rounded-lg divide-y divide-border-subtle">
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-text-muted">{t('deploy.template')}</span>
              <span className="text-sm font-medium flex items-center gap-2">
                <span>{template?.emoji ?? '📦'}</span>
                {name}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-text-muted">{t('deploy.namespace')}</span>
              <span className="text-sm font-mono text-text-secondary">{targetNamespace}</span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-text-muted">{t('deploy.envVariables')}</span>
              <span className="text-sm text-text-secondary">
                {Object.keys(config.envVars).filter((k) => config.envVars[k]).length}{' '}
                {t('deploy.configured')}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-text-muted">{t('deploy.agentsLabel')}</span>
              <span className="text-sm text-text-secondary">
                {(template?.features.length ?? 0) > 0
                  ? `${t('deploy.includes')}: ${(template?.features ?? []).slice(0, 2).join(', ')}`
                  : t('deploy.asConfigured')}
              </span>
            </div>
          </div>

          <div className="bg-primary/8 border border-primary/25 rounded-lg p-4">
            <p className="text-xs text-primary">
              <strong>{t('deploy.whatHappensNext')}</strong> {t('deploy.whatHappensNextDesc')}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex justify-between">
            <Button type="button" onClick={onBack} variant="ghost">
              <ArrowLeft size={14} />
              {t('common.back')}
            </Button>
            <Button type="button" onClick={handleDeploy} variant="primary">
              <Rocket size={16} />
              {t('deploy.startDeployment')}
            </Button>
          </div>
        </>
      )}

      {/* Deploy progress */}
      {deployStarted && (
        <>
          {/* Status bar */}
          <div
            className={cn(
              'flex items-center gap-3 p-4 rounded-lg border',
              isDone && 'bg-success/8 border-success/25',
              isError && 'bg-danger/8 border-danger/25',
              isDeploying && 'bg-primary/8 border-primary/25',
            )}
          >
            {isDeploying && <Loader2 size={18} className="text-primary animate-spin" />}
            {isDone && <CheckCircle size={18} className="text-success" />}
            {isError && <XCircle size={18} className="text-danger" />}
            <div>
              <p
                className={cn(
                  'text-sm font-medium',
                  isDone && 'text-success',
                  isError && 'text-danger',
                  isDeploying && 'text-primary',
                )}
              >
                {isDeploying && t('deploy.deploying')}
                {isDone && t('deploy.deploymentSuccessful')}
                {isError && t('deploy.deploymentFailed')}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {t('deploy.logLinesReceived', { count: lines.length })}
              </p>
            </div>
          </div>

          {taskInfo && (
            <div className="bg-bg-secondary border border-border-subtle rounded-lg p-4">
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
                    className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary border border-border-dim hover:border-border rounded-lg px-3 py-2 transition-colors"
                  >
                    <Activity size={12} />
                    {t('nav.deployments')}
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Log viewer */}
          <div className="bg-bg-deep border border-border-subtle rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-bg-secondary/50">
              <span className="text-xs text-text-muted font-medium">
                {t('deploy.deploymentLog')}
              </span>
              {lines.length > 0 && (
                <Button type="button" onClick={handleDownloadLog} variant="ghost" size="sm">
                  <Download size={11} />
                  {t('deploy.download')}
                </Button>
              )}
            </div>
            <div
              ref={logRef}
              className="min-h-[16rem] max-h-[28rem] overflow-auto p-4 font-mono text-xs text-text-secondary space-y-1"
            >
              {lines.length === 0 && isDeploying && (
                <span className="text-text-muted">{t('deploy.initializingDeployment')}</span>
              )}
              {lines.map((line, i) => (
                <div key={i} className="leading-relaxed">
                  {line || '\u00a0'}
                </div>
              ))}
            </div>
          </div>

          {/* Post-deploy actions */}
          {isDone && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-success" />
              </div>
              <h3 className="text-xl font-semibold text-success mb-2">
                {t('deploy.deploymentSuccessful')}
              </h3>
              <p className="text-sm text-text-secondary mb-8">
                {t('deploy.agentRunningInNamespace', { namespace: targetNamespace })}
              </p>

              {/* What's Next cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
                <Button
                  onClick={() => {
                    if (!taskInfo) return
                    navigate({
                      to: '/deploy-tasks/$taskId',
                      params: { taskId: String(taskInfo.id) },
                    })
                  }}
                  variant="ghost"
                  className="h-auto rounded-lg border border-border-subtle bg-bg-secondary/50 p-4 transition-colors group hover:bg-bg-secondary"
                >
                  <Server size={20} className="text-text-secondary mb-2" />
                  <div className="text-sm font-medium text-text-secondary group-hover:text-text-primary">
                    {t('deployTask.openTask')}
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    {t('deployTask.openTaskDescription')}
                  </p>
                </Button>
                <Button
                  onClick={() =>
                    navigate({
                      to: '/deployments/$namespace',
                      params: { namespace: targetNamespace },
                    })
                  }
                  variant="ghost"
                >
                  <Activity size={20} className="text-text-secondary mb-2" />
                  <div className="text-sm font-medium text-text-secondary group-hover:text-text-primary">
                    {t('deploy.openNamespace')}
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    {t('deploy.openNamespaceDescription')}
                  </p>
                </Button>
              </div>
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-3">
              <Link
                to="/store"
                className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary border border-border-dim hover:border-border px-4 py-2 rounded-lg transition-colors"
              >
                {t('store.backToStore')}
              </Link>
              <Button
                type="button"
                onClick={() => {
                  setDeployStarted(false)
                  setDeploySuccess(null)
                }}
                variant="ghost"
              >
                {t('common.retry')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main Wizard Page ──────────────────────────────────────────────────────────

export function DeployWizardPage() {
  const { t } = useTranslation()
  const { name } = useParams({ strict: false }) as { name: string }
  const [currentStep, setCurrentStep] = useState(0)
  const steps = getWizardSteps(t)
  const [deployConfig, setDeployConfig] = useState<DeployConfig>({
    namespace: '',
    envVars: {},
  })

  // Determine nav button label for current step
  const nextLabel =
    currentStep === 0 ? t('common.continue') : currentStep === 1 ? t('common.continue') : null // step 2 has its own deploy button

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Sticky top header */}
      <div className="sticky top-0 z-20 bg-bg-base/95 backdrop-blur border-b border-border-subtle">
        <div className="px-6 py-4">
          <Breadcrumb
            items={[
              { label: t('store.title'), to: '/store' },
              { label: name, to: `/store/${name}` },
              { label: t('common.deploy') },
            ]}
            className="mb-3"
          />
          <div className="flex items-center gap-4">
            {/* Classic step indicators with connectors */}
            <div className="flex items-center flex-1 min-w-0">
              {steps.map((step, index) => {
                const status =
                  index < currentStep ? 'completed' : index === currentStep ? 'active' : 'upcoming'
                const isClickable = status === 'completed'
                return (
                  <div key={step.id} className="flex items-center flex-1 last:flex-none">
                    <button
                      type="button"
                      disabled={!isClickable}
                      onClick={() => isClickable && setCurrentStep(index)}
                      className={cn(
                        'flex items-center gap-2 group',
                        isClickable ? 'cursor-pointer' : 'cursor-default',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all',
                          status === 'active' &&
                            'bg-primary text-white shadow-sm shadow-primary/40',
                          status === 'completed' &&
                            'bg-success/15 text-success ring-1 ring-success/40 group-hover:bg-success group-hover:text-white',
                          status === 'upcoming' &&
                            'bg-bg-secondary text-text-muted ring-1 ring-border-subtle',
                        )}
                      >
                        {status === 'completed' ? <CheckCircle2 size={14} /> : index + 1}
                      </div>
                      <span
                        className={cn(
                          'text-sm font-medium hidden sm:inline whitespace-nowrap transition-colors',
                          status === 'active' && 'text-text-primary',
                          status === 'completed' &&
                            'text-text-secondary group-hover:text-text-primary',
                          status === 'upcoming' && 'text-text-muted',
                        )}
                      >
                        {step.label}
                      </span>
                    </button>
                    {index < steps.length - 1 && (
                      <div
                        className={cn(
                          'mx-3 h-px flex-1 transition-colors',
                          index < currentStep ? 'bg-success/50' : 'bg-border-subtle',
                        )}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            {/* Nav buttons */}
            <div className="flex items-center gap-2 shrink-0">
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
        </div>
      </div>

      {/* Step content */}
      <div className="p-6">
        {currentStep === 0 && <StepOverview name={name} />}
        {currentStep === 1 && (
          <StepConfigure
            name={name}
            config={deployConfig}
            onChange={setDeployConfig}
            onNext={() => setCurrentStep(2)}
          />
        )}
        {currentStep === 2 && (
          <StepDeploy name={name} config={deployConfig} onBack={() => setCurrentStep(1)} />
        )}
      </div>
    </div>
  )
}
