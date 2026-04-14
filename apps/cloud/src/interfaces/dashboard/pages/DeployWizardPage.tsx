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
import { Badge } from '@/components/Badge'
import { Breadcrumb } from '@/components/Breadcrumb'
import { type Step, StepIndicator } from '@/components/StepIndicator'
import { useSSEStream } from '@/hooks/useSSEStream'
import { api, type ProviderSettings } from '@/lib/api'
import { API_PRESETS } from '@/lib/presets'
import { getCategoryColor, getTemplateMeta } from '@/lib/store-data'
import { cn, pluralize } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

// ── Step Definitions ──────────────────────────────────────────────────────────

const WIZARD_STEPS: Step[] = [
  { id: 'overview', label: 'Template', description: 'Review template' },
  { id: 'configure', label: 'Configure', description: 'Set namespace & env' },
  { id: 'deploy', label: 'Deploy', description: 'Deploy & monitor' },
]

function getProviderSecretEnvName(providerId: string): string {
  return `${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`
}

// ── Step 1: Template Overview ─────────────────────────────────────────────────

function StepOverview({ name, onNext }: { name: string; onNext: () => void }) {
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: api.templates.list,
  })

  const template = templates?.find((t) => t.name === name)
  const meta = getTemplateMeta(name)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Review Template</h2>
        <p className="text-sm text-gray-500">
          Confirm the template you want to deploy to your Kubernetes cluster.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <span className="text-4xl">{meta.emoji}</span>
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-1">{name}</h3>
            <p className="text-sm text-gray-400 mb-3">{template?.description ?? 'Loading...'}</p>

            <div className="flex items-center gap-2 mb-4">
              <Badge variant="default" className={getCategoryColor(meta.category)}>
                {meta.category}
              </Badge>
              {meta.featured && (
                <Badge variant="info" icon={<Sparkles size={10} />}>
                  Featured
                </Badge>
              )}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                  <Users size={11} />
                  Agents
                </div>
                <p className="text-lg font-semibold">{template?.agentCount ?? '—'}</p>
              </div>
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                  <FolderOpen size={11} />
                  Namespace
                </div>
                <p className="text-sm font-mono mt-1">{template?.namespace ?? '—'}</p>
              </div>
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                  <Clock size={11} />
                  Deploy Time
                </div>
                <p className="text-sm mt-1">{meta.estimatedDeployTime}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Highlights */}
      <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-1.5">
          <Sparkles size={13} />
          What you'll get
        </h4>
        <ul className="space-y-1.5">
          {meta.highlights.map((h) => (
            <li key={h} className="flex items-center gap-2 text-sm text-gray-300">
              <CheckCircle size={13} className="text-green-400 shrink-0" />
              {h}
            </li>
          ))}
        </ul>
      </div>

      {/* Requirements */}
      {meta.requirements.length > 0 && (
        <div className="bg-yellow-950/10 border border-yellow-900/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-yellow-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle size={13} />
            Prerequisites
          </h4>
          <ul className="space-y-1.5">
            {meta.requirements.map((r) => (
              <li key={r} className="flex items-center gap-2 text-sm text-gray-400">
                <ChevronRight size={11} className="text-yellow-600 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          Continue
          <ArrowRight size={16} />
        </button>
      </div>
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
  onBack,
}: {
  name: string
  config: DeployConfig
  onChange: (config: DeployConfig) => void
  onNext: () => void
  onBack: () => void
}) {
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: api.templates.list,
  })
  const template = templates?.find((t) => t.name === name)

  // Fetch required env var refs from template
  const { data: envRefsData } = useQuery({
    queryKey: ['template-env-refs', name],
    queryFn: () => api.templates.envRefs(name),
  })

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
    queryKey: ['env'],
    queryFn: api.env.list,
  })

  const requiredVars = envRefsData?.requiredEnvVars ?? []

  // Build a lookup of saved env var keys → masked values
  const savedLookup = useMemo(() => {
    const lookup: Record<string, string> = {}
    for (const ev of savedEnvData?.envVars ?? []) {
      lookup[ev.key] = ev.maskedValue
    }
    return lookup
  }, [savedEnvData])

  // Auto-populate from saved values on first load
  const initializedRef = useRef(false)
  useEffect(() => {
    if (initializedRef.current || Object.keys(savedLookup).length === 0) return
    // Wait until template env refs are loaded (or if there are none)
    if (envRefsData === undefined) return
    initializedRef.current = true
    const merged = { ...config.envVars }
    let changed = false
    // Auto-fill Shadow connection fields
    for (const shadowKey of ['SHADOW_SERVER_URL', 'SHADOW_USER_TOKEN']) {
      if (!merged[shadowKey] && savedLookup[shadowKey]) {
        merged[shadowKey] = '__SAVED__'
        changed = true
      }
    }
    // Auto-fill template-required env vars
    for (const key of requiredVars) {
      if (!merged[key] && savedLookup[key]) {
        merged[key] = '__SAVED__'
        changed = true
      }
    }
    if (changed) onChange({ ...config, envVars: merged })
  }, [requiredVars, savedLookup, config, onChange, envRefsData])

  const [extraVars, setExtraVars] = useState<Array<{ key: string; value: string }>>([])
  const [validationError, setValidationError] = useState<string | null>(null)
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})

  const updateVar = (key: string, value: string) => {
    onChange({ ...config, envVars: { ...config.envVars, [key]: value } })
  }

  const handleNext = () => {
    // Validate Shadow connection fields
    const shadowUrl = config.envVars.SHADOW_SERVER_URL
    const shadowToken = config.envVars.SHADOW_USER_TOKEN
    const missingShadow: string[] = []
    if (!shadowUrl || (shadowUrl !== '__SAVED__' && !shadowUrl.trim())) {
      if (!savedLookup.SHADOW_SERVER_URL) missingShadow.push('SHADOW_SERVER_URL')
    }
    if (!shadowToken || (shadowToken !== '__SAVED__' && !shadowToken.trim())) {
      if (!savedLookup.SHADOW_USER_TOKEN) missingShadow.push('SHADOW_USER_TOKEN')
    }

    // Validate required vars
    const missing = requiredVars.filter((k) => {
      const val = config.envVars[k]
      return !val || val.trim() === ''
    })
    // Check if they have saved values (from secrets)
    const trulyMissing = missing.filter((k) => !savedLookup[k])
    const allMissing = [...missingShadow, ...trulyMissing]
    if (allMissing.length > 0) {
      setValidationError(`Missing required variables: ${allMissing.join(', ')}`)
      return
    }
    setValidationError(null)
    onNext()
  }

  const toggleShowPassword = (key: string) => {
    setShowPasswords((p) => ({ ...p, [key]: !p[key] }))
  }

  const useSavedValue = (key: string) => {
    // Mark as "__SAVED__" — the backend will resolve from stored secrets/env
    onChange({ ...config, envVars: { ...config.envVars, [key]: '__SAVED__' } })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Configure Deployment</h2>
        <p className="text-sm text-gray-500">
          Set namespace and provide required environment variables for this template.
        </p>
      </div>

      {/* Namespace */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <label htmlFor="namespace" className="block text-sm font-medium mb-2">
          Namespace
        </label>
        <p className="text-xs text-gray-500 mb-3">Kubernetes namespace for this deployment.</p>
        <input
          id="namespace"
          type="text"
          value={config.namespace}
          onChange={(e) => onChange({ ...config, namespace: e.target.value })}
          placeholder={template?.namespace ?? name}
          className="w-full max-w-md bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
        />
        <p className="text-[10px] text-gray-600 mt-2">
          Default: <code className="font-mono text-gray-500">{template?.namespace ?? name}</code>
        </p>
      </div>

      {/* Shadow Connection */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <div className="mb-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Unplug size={14} className="text-purple-400" />
            Shadow Platform Connection
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Server URL and API token for provisioning Shadow resources (servers, channels, buddies).
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-xs font-mono text-gray-300 flex items-center gap-1.5">
                {config.envVars.SHADOW_SERVER_URL === '__SAVED__' ||
                config.envVars.SHADOW_SERVER_URL?.trim() ? (
                  <CheckCircle size={12} className="text-green-400" />
                ) : (
                  <AlertTriangle size={12} className="text-yellow-500" />
                )}
                SHADOW_SERVER_URL
                <span className="text-red-400 text-[10px]">*</span>
              </label>
              {savedLookup.SHADOW_SERVER_URL &&
                config.envVars.SHADOW_SERVER_URL !== '__SAVED__' && (
                  <button
                    type="button"
                    onClick={() => useSavedValue('SHADOW_SERVER_URL')}
                    className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded px-2 py-0.5 transition-colors"
                  >
                    Restore saved value
                  </button>
                )}
            </div>
            {config.envVars.SHADOW_SERVER_URL === '__SAVED__' ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-green-950/30 border border-green-900/50 rounded px-3 py-2 text-xs text-green-400 font-mono flex items-center gap-2">
                  <CheckCircle size={12} />
                  Using saved value from Secrets
                </div>
                <button
                  type="button"
                  onClick={() => updateVar('SHADOW_SERVER_URL', '')}
                  className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
                >
                  Override
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={config.envVars.SHADOW_SERVER_URL ?? ''}
                onChange={(e) => updateVar('SHADOW_SERVER_URL', e.target.value)}
                placeholder="https://your-shadow-server.example.com"
                className={cn(
                  'w-full bg-gray-950 border rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500',
                  !config.envVars.SHADOW_SERVER_URL?.trim() && 'border-yellow-800/50',
                  config.envVars.SHADOW_SERVER_URL?.trim() && 'border-gray-700',
                )}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-xs font-mono text-gray-300 flex items-center gap-1.5">
                {config.envVars.SHADOW_USER_TOKEN === '__SAVED__' ||
                config.envVars.SHADOW_USER_TOKEN?.trim() ? (
                  <CheckCircle size={12} className="text-green-400" />
                ) : (
                  <AlertTriangle size={12} className="text-yellow-500" />
                )}
                SHADOW_USER_TOKEN
                <span className="text-red-400 text-[10px]">*</span>
              </label>
              {savedLookup.SHADOW_USER_TOKEN &&
                config.envVars.SHADOW_USER_TOKEN !== '__SAVED__' && (
                  <button
                    type="button"
                    onClick={() => useSavedValue('SHADOW_USER_TOKEN')}
                    className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded px-2 py-0.5 transition-colors"
                  >
                    Restore saved value
                  </button>
                )}
            </div>
            {config.envVars.SHADOW_USER_TOKEN === '__SAVED__' ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-green-950/30 border border-green-900/50 rounded px-3 py-2 text-xs text-green-400 font-mono flex items-center gap-2">
                  <CheckCircle size={12} />
                  Using saved value from Secrets
                </div>
                <button
                  type="button"
                  onClick={() => updateVar('SHADOW_USER_TOKEN', '')}
                  className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
                >
                  Override
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type={showPasswords.SHADOW_USER_TOKEN ? 'text' : 'password'}
                  value={config.envVars.SHADOW_USER_TOKEN ?? ''}
                  onChange={(e) => updateVar('SHADOW_USER_TOKEN', e.target.value)}
                  placeholder="pat_..."
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  className={cn(
                    'w-full bg-gray-950 border rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 pr-8',
                    !config.envVars.SHADOW_USER_TOKEN?.trim() && 'border-yellow-800/50',
                    config.envVars.SHADOW_USER_TOKEN?.trim() && 'border-gray-700',
                  )}
                />
                <button
                  type="button"
                  onClick={() => toggleShowPassword('SHADOW_USER_TOKEN')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                >
                  {showPasswords.SHADOW_USER_TOKEN ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Required Environment Variables */}
      {requiredVars.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Key size={14} className="text-yellow-400" />
                Required Environment Variables
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                This template requires {requiredVars.length} environment{' '}
                {pluralize(requiredVars.length, 'variable')}. All must be provided before
                deployment.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {requiredVars.map((key) => {
              const hasSaved = !!savedLookup[key]
              const isUsingSaved = config.envVars[key] === '__SAVED__'
              const currentValue = config.envVars[key] ?? ''
              const isFilled = currentValue.trim() !== '' || isUsingSaved

              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-mono text-gray-300 flex items-center gap-1.5">
                      {isFilled ? (
                        <CheckCircle size={12} className="text-green-400" />
                      ) : (
                        <AlertTriangle size={12} className="text-yellow-500" />
                      )}
                      {key}
                      <span className="text-red-400 text-[10px]">*</span>
                    </label>
                    {hasSaved && !isUsingSaved && (
                      <button
                        type="button"
                        onClick={() => useSavedValue(key)}
                        className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded px-2 py-0.5 transition-colors"
                      >
                        Restore saved value
                      </button>
                    )}
                  </div>
                  {isUsingSaved ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-green-950/30 border border-green-900/50 rounded px-3 py-2 text-xs text-green-400 font-mono flex items-center gap-2">
                        <CheckCircle size={12} />
                        Using saved value from Secrets
                      </div>
                      <button
                        type="button"
                        onClick={() => updateVar(key, '')}
                        className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
                      >
                        Override
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type={showPasswords[key] ? 'text' : 'password'}
                        value={currentValue}
                        onChange={(e) => updateVar(key, e.target.value)}
                        placeholder={
                          key.includes('KEY') || key.includes('TOKEN') || key.includes('SECRET')
                            ? 'sk-...'
                            : 'Enter value'
                        }
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                        name={`env-${key}`}
                        className={cn(
                          'w-full bg-gray-950 border rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 pr-8',
                          !isFilled && 'border-yellow-800/50',
                          isFilled && 'border-gray-700',
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => toggleShowPassword(key)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                      >
                        {showPasswords[key] ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Extra env vars (optional) */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium">Additional Variables</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Optional key-value pairs beyond the required ones.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExtraVars([...extraVars, { key: '', value: '' }])}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded px-3 py-1.5 transition-colors"
          >
            <Plus size={12} />
            Add Variable
          </button>
        </div>

        {extraVars.length === 0 && (
          <div className="text-center py-4 text-xs text-gray-600 border border-dashed border-gray-800 rounded-lg">
            No additional variables.
          </div>
        )}

        {extraVars.length > 0 && (
          <div className="space-y-2">
            {extraVars.map((env, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
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
                  className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
                <span className="text-gray-600">=</span>
                <input
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
                  className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
                <button
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
                  className="text-gray-600 hover:text-red-400 transition-colors p-1"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Validation error */}
      {validationError && (
        <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3 flex items-center gap-2">
          <XCircle size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-400">{validationError}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          Continue
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Providers ─────────────────────────────────────────────────────────

export function StepProviders({
  providers,
  onChange,
  onNext,
  onBack,
}: {
  providers: ProviderSettings[]
  onChange: (providers: ProviderSettings[]) => void
  onNext: () => void
  onBack: () => void
}) {
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
        <h2 className="text-lg font-semibold mb-1">LLM Providers</h2>
        <p className="text-sm text-gray-500">
          Configure at least one LLM provider. Agents need API access to function.
        </p>
      </div>

      {/* Use existing settings toggle */}
      {existingProviders.length > 0 && (
        <div className="bg-green-950/20 border border-green-900/30 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-400">
                {existingProviders.length} {pluralize(existingProviders.length, 'provider')}{' '}
                configured in Settings
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Your existing provider settings will be used.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useExisting}
              onChange={(e) => {
                setUseExisting(e.target.checked)
                if (e.target.checked) onChange(existingProviders)
                else onChange([])
              }}
              className="accent-blue-500"
            />
            <span className="text-xs text-gray-400">Use existing</span>
          </label>
        </div>
      )}

      {/* Provider list */}
      <div className="space-y-3">
        {providers.map((provider, i) => (
          <div
            key={`${provider.id}-${i}`}
            className="bg-gray-900 border border-gray-800 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Key size={14} className="text-gray-500" />
                <span className="text-sm font-medium">{provider.id}</span>
                <span className="text-xs text-gray-600 font-mono">{provider.api}</span>
              </div>
              <button
                type="button"
                onClick={() => removeProvider(i)}
                className="text-gray-600 hover:text-red-400 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-gray-950 border border-gray-800 rounded px-3 py-2.5">
                <label className="text-xs text-gray-500 mb-1 block">
                  {t('settings.secretEnvKey')}
                </label>
                <code className="text-xs font-mono text-yellow-400/90 break-all">
                  {getProviderSecretEnvName(provider.id)}
                </code>
                <p className="text-[11px] text-gray-600 mt-2">
                  {t('settings.credentialsManagedInSecrets')}
                </p>
              </div>
              {provider.baseUrl !== undefined && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {t('settings.baseUrl')}
                  </label>
                  <input
                    type="text"
                    value={provider.baseUrl ?? ''}
                    onChange={(e) => updateProvider(i, 'baseUrl', e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add provider */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-600">Add provider:</span>
        {API_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => addPreset(preset)}
            disabled={providers.some((p) => p.id === preset.id)}
            className="text-xs text-gray-400 hover:text-white bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-30"
          >
            + {preset.label}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          Review & Deploy
          <Rocket size={16} />
        </button>
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
  const { t } = useTranslation()
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
  const meta = getTemplateMeta(name)

  const taskUrl = taskInfo ? new URL(taskInfo.url, window.location.origin).toString() : ''

  // Auto-scroll log
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new lines
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

      // Step 2: Deploy with the template config directly (no need for separate config.get)
      const deployConfig = typeof templateConfig === 'object' ? { ...templateConfig } : {}
      deployConfig.templateSlug = name
      if (config.namespace) {
        deployConfig.namespace = config.namespace
      }
      // Include env vars so the backend can resolve ${env:VAR} placeholders
      if (config.envVars && Object.keys(config.envVars).length > 0) {
        deployConfig.envVars = config.envVars
      }

      const result = await startFetch('/api/deploy', deployConfig, {
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

      if (!result.success) {
        setDeploySuccess(false)
        throw new Error(result.error || `Deploy failed (exit code ${result.exitCode})`)
      }

      setDeploySuccess(true)

      // Save user-entered env vars to Secrets for future deploys
      const envEntries = Object.entries(config.envVars).filter(
        ([, v]) => v && v !== '__SAVED__' && v.trim() !== '',
      )
      for (const [key, value] of envEntries) {
        try {
          await api.env.upsert('global', key, value, true)
        } catch {
          /* non-critical */
        }
      }

      // Record activity
      addActivity({
        type: 'deploy',
        title: `Deployed ${name}`,
        detail: `Template: ${name}, Namespace: ${config.namespace || meta.emoji}`,
        namespace: config.namespace || name,
        template: name,
      })
      addRecentDeploy(name, config.namespace || name)

      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      toast.success(`Successfully deployed ${name}!`)
    } catch (err) {
      setDeploySuccess(false)
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Deploy failed: ${errorMsg}`)
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
            ? 'Review & Deploy'
            : isDone
              ? 'Deployment Complete'
              : isError
                ? 'Deployment Failed'
                : 'Deploying...'}
        </h2>
        <p className="text-sm text-gray-500">
          {!deployStarted
            ? 'Review your configuration and start the deployment.'
            : isDone
              ? 'Your agent team has been deployed successfully.'
              : isError
                ? 'Deployment encountered an error. Check the logs below.'
                : 'Deploying your agent team to the cluster...'}
        </p>
      </div>

      {/* Review summary (before deploy) */}
      {!deployStarted && (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">Template</span>
              <span className="text-sm font-medium flex items-center gap-2">
                <span>{meta.emoji}</span>
                {name}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">Namespace</span>
              <span className="text-sm font-mono text-gray-300">
                {config.namespace || '(default)'}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">Env Variables</span>
              <span className="text-sm text-gray-300">
                {Object.keys(config.envVars).filter((k) => config.envVars[k]).length} configured
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">Agents</span>
              <span className="text-sm text-gray-300">
                {getTemplateMeta(name).features.length > 0
                  ? `Includes: ${getTemplateMeta(name).features.slice(0, 2).join(', ')}`
                  : 'As configured'}
              </span>
            </div>
          </div>

          <div className="bg-blue-950/20 border border-blue-900/30 rounded-lg p-4">
            <p className="text-xs text-blue-400">
              <strong>What happens next:</strong> Shadow Cloud will initialize the template,
              generate Kubernetes manifests, and deploy them to your cluster. You can monitor the
              progress in real time below.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex justify-between">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition-colors"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <button
              type="button"
              onClick={handleDeploy}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
            >
              <Rocket size={16} />
              Start Deployment
            </button>
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
              isDone && 'bg-green-950/20 border-green-900/30',
              isError && 'bg-red-950/20 border-red-900/30',
              isDeploying && 'bg-blue-950/20 border-blue-900/30',
            )}
          >
            {isDeploying && <Loader2 size={18} className="text-blue-400 animate-spin" />}
            {isDone && <CheckCircle size={18} className="text-green-400" />}
            {isError && <XCircle size={18} className="text-red-400" />}
            <div>
              <p
                className={cn(
                  'text-sm font-medium',
                  isDone && 'text-green-400',
                  isError && 'text-red-400',
                  isDeploying && 'text-blue-400',
                )}
              >
                {isDeploying && 'Deploying...'}
                {isDone && 'Deployment Successful!'}
                {isError && 'Deployment Failed'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {lines.length} log {pluralize(lines.length, 'line')} received
              </p>
            </div>
          </div>

          {taskInfo && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 mb-1">{t('deployTask.taskUrl')}</p>
                  <code className="block text-xs font-mono text-gray-300 break-all">{taskUrl}</code>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyTaskUrl}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors"
                  >
                    <Copy size={12} />
                    {t('deployTask.copyLink')}
                  </button>
                  <Link
                    to="/deploy-tasks/$taskId"
                    params={{ taskId: String(taskInfo.id) }}
                    className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-2 transition-colors"
                  >
                    <Server size={12} />
                    {t('deployTask.openTask')}
                  </Link>
                  <Link
                    to="/deployments"
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors"
                  >
                    <Activity size={12} />
                    {t('nav.deployments')}
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Log viewer */}
          <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-900/50">
              <span className="text-xs text-gray-500 font-medium">Deployment Log</span>
              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadLog}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <Download size={11} />
                  Download
                </button>
              )}
            </div>
            <div
              ref={logRef}
              className="h-80 overflow-auto p-4 font-mono text-xs text-gray-300 space-y-0.5"
            >
              {lines.length === 0 && isDeploying && (
                <span className="text-gray-600">Initializing deployment...</span>
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
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-green-400 mb-2">Deployment Successful!</h3>
              <p className="text-sm text-gray-400 mb-8">
                Your agent is now running in the{' '}
                <code className="text-gray-300">{config.namespace}</code> namespace.
              </p>

              {/* What's Next cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
                <button
                  onClick={() => {
                    if (!taskInfo) return
                    navigate({
                      to: '/deploy-tasks/$taskId',
                      params: { taskId: String(taskInfo.id) },
                    })
                  }}
                  className="p-4 bg-gray-800/50 border border-gray-800 rounded-lg hover:bg-gray-800 transition-colors group"
                >
                  <Server size={20} className="text-gray-400 mb-2" />
                  <div className="text-sm font-medium text-gray-300 group-hover:text-gray-200">
                    {t('deployTask.openTask')}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('deployTask.openTaskDescription')}
                  </p>
                </button>
                <button
                  onClick={() => navigate({ to: '/monitoring' })}
                  className="p-4 bg-gray-800/50 border border-gray-800 rounded-lg hover:bg-gray-800 transition-colors group"
                >
                  <Activity size={20} className="text-gray-400 mb-2" />
                  <div className="text-sm font-medium text-gray-300 group-hover:text-gray-200">
                    Monitor Health
                  </div>
                  <p className="text-xs text-gray-500 mt-1">See health checks and events</p>
                </button>
              </div>
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-3">
              <Link
                to="/store"
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition-colors"
              >
                Back to Store
              </Link>
              <button
                type="button"
                onClick={() => {
                  setDeployStarted(false)
                  setDeploySuccess(null)
                }}
                className="flex items-center gap-1.5 text-sm text-yellow-400 hover:text-yellow-300 border border-yellow-800 hover:border-yellow-600 px-4 py-2 rounded-lg transition-colors"
              >
                Retry
              </button>
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
  const [deployConfig, setDeployConfig] = useState<DeployConfig>({
    namespace: '',
    envVars: {},
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Breadcrumb
        items={[
          { label: t('store.title'), to: '/store' },
          { label: name, to: `/store/${name}` },
          { label: t('common.deploy') },
        ]}
        className="mb-6"
      />

      {/* Step indicator */}
      <div className="mb-8">
        <StepIndicator steps={WIZARD_STEPS} currentStep={currentStep} />
      </div>

      {/* Step content */}
      <div className="min-h-[500px]">
        {currentStep === 0 && <StepOverview name={name} onNext={() => setCurrentStep(1)} />}
        {currentStep === 1 && (
          <StepConfigure
            name={name}
            config={deployConfig}
            onChange={setDeployConfig}
            onNext={() => setCurrentStep(2)}
            onBack={() => setCurrentStep(0)}
          />
        )}
        {currentStep === 2 && (
          <StepDeploy name={name} config={deployConfig} onBack={() => setCurrentStep(1)} />
        )}
      </div>
    </div>
  )
}
