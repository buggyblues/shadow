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
import { getCategoryColor } from '@/lib/store-data'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

// ── Step Definitions ──────────────────────────────────────────────────────────

function getWizardSteps(t: (key: string, options?: Record<string, unknown>) => string): Step[] {
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

// ── Step 1: Template Overview ─────────────────────────────────────────────────

function StepOverview({ name, onNext }: { name: string; onNext: () => void }) {
  const { t, i18n } = useTranslation()
  const { data } = useQuery({
    queryKey: ['template-detail', name, i18n.language],
    queryFn: () => api.templates.detail(name, i18n.language),
  })

  const template = data?.template

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{t('deploy.reviewTemplate')}</h2>
        <p className="text-sm text-gray-500">{t('deploy.confirmDeployKubernetes')}</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <span className="text-4xl">{template?.emoji ?? '📦'}</span>
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-1">{name}</h3>
            <p className="text-sm text-gray-400 mb-3">
              {template?.description ?? t('common.loading')}
            </p>

            <div className="flex items-center gap-2 mb-4">
              {template && (
                <Badge variant="default" className={getCategoryColor(template.category)}>
                  {getCategoryLabel(template.category, t)}
                </Badge>
              )}
              {template && (
                <Badge variant="default" className="bg-gray-800 text-gray-200 border-gray-700">
                  {getDifficultyLabel(template.difficulty, t)}
                </Badge>
              )}
              {template?.featured && (
                <Badge variant="info" icon={<Sparkles size={10} />}>
                  {t('store.featured')}
                </Badge>
              )}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                  <Users size={11} />
                  {t('deploy.agentsLabel')}
                </div>
                <p className="text-lg font-semibold">{template?.agentCount ?? '—'}</p>
              </div>
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                  <FolderOpen size={11} />
                  {t('deploy.namespaceLabel')}
                </div>
                <p className="text-sm font-mono mt-1">{template?.namespace ?? '—'}</p>
              </div>
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 flex items-center gap-1 mb-1">
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
      <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-1.5">
          <Sparkles size={13} />
          {t('deploy.whatYouWillGet')}
        </h4>
        <ul className="space-y-1.5">
          {(template?.highlights ?? []).map((highlight) => (
            <li key={highlight} className="flex items-center gap-2 text-sm text-gray-300">
              <CheckCircle size={13} className="text-green-400 shrink-0" />
              {highlight}
            </li>
          ))}
        </ul>
      </div>

      {/* Requirements */}
      {(template?.requirements.length ?? 0) > 0 && (
        <div className="bg-yellow-950/10 border border-yellow-900/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-yellow-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle size={13} />
            {t('deploy.prerequisites')}
          </h4>
          <ul className="space-y-1.5">
            {(template?.requirements ?? []).map((requirement) => (
              <li key={requirement} className="flex items-center gap-2 text-sm text-gray-400">
                <ChevronRight size={11} className="text-yellow-600 shrink-0" />
                {requirement}
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
          {t('common.continue')}
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
  const { t, i18n } = useTranslation()
  const { data: detailData } = useQuery({
    queryKey: ['template-detail', name, i18n.language],
    queryFn: () => api.templates.detail(name, i18n.language),
  })
  const template = detailData?.template
  const resolvedNamespace = config.namespace || template?.namespace || name

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
    queryKey: ['deployment-env', resolvedNamespace, 'effective'],
    queryFn: () => api.deployments.env.list(resolvedNamespace, 'effective'),
    enabled: Boolean(resolvedNamespace),
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
    initializedRef.current = false
  }, [resolvedNamespace])

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
  const hasShadowServerUrl =
    config.envVars.SHADOW_SERVER_URL === '__SAVED__' ||
    Boolean(config.envVars.SHADOW_SERVER_URL?.trim())
  const hasShadowUserToken =
    config.envVars.SHADOW_USER_TOKEN === '__SAVED__' ||
    Boolean(config.envVars.SHADOW_USER_TOKEN?.trim())

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
      setValidationError(`${t('deploy.missingRequiredVars')} ${allMissing.join(', ')}`)
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
        <h2 className="text-lg font-semibold mb-1">{t('deploy.configureDeploy')}</h2>
        <p className="text-sm text-gray-500">{t('deploy.setNamespaceEnv')}</p>
      </div>

      {/* Namespace */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <label htmlFor="namespace" className="block text-sm font-medium mb-2">
          {t('deploy.namespace')}
        </label>
        <p className="text-xs text-gray-500 mb-3">{t('deploy.kubernetesNamespaceDesc')}</p>
        <input
          id="namespace"
          type="text"
          value={config.namespace}
          onChange={(e) => onChange({ ...config, namespace: e.target.value })}
          placeholder={template?.namespace ?? name}
          className="w-full max-w-md bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
        />
        <p className="text-[10px] text-gray-600 mt-2">
          {t('deploy.default')}{' '}
          <code className="font-mono text-gray-500">{template?.namespace ?? name}</code>
        </p>
      </div>

      {/* Shadow Connection */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <div className="mb-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Unplug size={14} className="text-purple-400" />
            {t('deploy.shadowConnectionTitle')}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{t('deploy.shadowConnectionDescription')}</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-xs font-mono text-gray-300 flex items-center gap-1.5">
                {hasShadowServerUrl ? (
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
                    {t('deploy.restoreSavedValue')}
                  </button>
                )}
            </div>
            {config.envVars.SHADOW_SERVER_URL === '__SAVED__' ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-green-950/30 border border-green-900/50 rounded px-3 py-2 text-xs text-green-400 font-mono flex items-center gap-2">
                  <CheckCircle size={12} />
                  {t('deploy.usingSavedValue')}
                </div>
                <button
                  type="button"
                  onClick={() => updateVar('SHADOW_SERVER_URL', '')}
                  className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
                >
                  {t('deploy.override')}
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
                {hasShadowUserToken ? (
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
                    {t('deploy.restoreSavedValue')}
                  </button>
                )}
            </div>
            {config.envVars.SHADOW_USER_TOKEN === '__SAVED__' ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-green-950/30 border border-green-900/50 rounded px-3 py-2 text-xs text-green-400 font-mono flex items-center gap-2">
                  <CheckCircle size={12} />
                  {t('deploy.usingSavedValue')}
                </div>
                <button
                  type="button"
                  onClick={() => updateVar('SHADOW_USER_TOKEN', '')}
                  className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
                >
                  {t('deploy.override')}
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
                {t('deploy.requiredEnvVars')}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('deploy.templateRequiresVars', { count: requiredVars.length })}{' '}
                {t('deploy.envVarsAllRequired')}
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
                        {t('deploy.restoreSavedValue')}
                      </button>
                    )}
                  </div>
                  {isUsingSaved ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-green-950/30 border border-green-900/50 rounded px-3 py-2 text-xs text-green-400 font-mono flex items-center gap-2">
                        <CheckCircle size={12} />
                        {t('deploy.usingSavedValue')}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateVar(key, '')}
                        className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
                      >
                        {t('deploy.override')}
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
                            : t('deploy.enterValue')
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
            <h3 className="text-sm font-medium">{t('deploy.additionalVariables')}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('deploy.optionalKeyValue')}</p>
          </div>
          <button
            type="button"
            onClick={() => setExtraVars([...extraVars, { key: '', value: '' }])}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded px-3 py-1.5 transition-colors"
          >
            <Plus size={12} />
            {t('deploy.addVariable')}
          </button>
        </div>

        {extraVars.length === 0 && (
          <div className="text-center py-4 text-xs text-gray-600 border border-dashed border-gray-800 rounded-lg">
            {t('deploy.noAdditionalVars')}
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
          {t('common.back')}
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          {t('common.continue')}
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
        <h2 className="text-lg font-semibold mb-1">{t('deploy.providersTitle')}</h2>
        <p className="text-sm text-gray-500">{t('deploy.providersDescription')}</p>
      </div>

      {/* Use existing settings toggle */}
      {existingProviders.length > 0 && (
        <div className="bg-green-950/20 border border-green-900/30 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-400">
                {t('deploy.providersConfiguredInSettings', { count: existingProviders.length })}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('deploy.providersUseExistingDescription')}
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
            <span className="text-xs text-gray-400">{t('deploy.useExisting')}</span>
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
        <span className="text-xs text-gray-600">{t('deploy.addProvider')}</span>
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
          {t('common.back')}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          {t('deploy.reviewDeploy')}
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
        <p className="text-sm text-gray-500">
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
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">{t('deploy.template')}</span>
              <span className="text-sm font-medium flex items-center gap-2">
                <span>{template?.emoji ?? '📦'}</span>
                {name}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">{t('deploy.namespace')}</span>
              <span className="text-sm font-mono text-gray-300">{targetNamespace}</span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">{t('deploy.envVariables')}</span>
              <span className="text-sm text-gray-300">
                {Object.keys(config.envVars).filter((k) => config.envVars[k]).length}{' '}
                {t('deploy.configured')}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-gray-500">{t('deploy.agentsLabel')}</span>
              <span className="text-sm text-gray-300">
                {(template?.features.length ?? 0) > 0
                  ? `${t('deploy.includes')}: ${(template?.features ?? []).slice(0, 2).join(', ')}`
                  : t('deploy.asConfigured')}
              </span>
            </div>
          </div>

          <div className="bg-blue-950/20 border border-blue-900/30 rounded-lg p-4">
            <p className="text-xs text-blue-400">
              <strong>{t('deploy.whatHappensNext')}</strong> {t('deploy.whatHappensNextDesc')}
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
              {t('common.back')}
            </button>
            <button
              type="button"
              onClick={handleDeploy}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
            >
              <Rocket size={16} />
              {t('deploy.startDeployment')}
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
                {isDeploying && t('deploy.deploying')}
                {isDone && t('deploy.deploymentSuccessful')}
                {isError && t('deploy.deploymentFailed')}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('deploy.logLinesReceived', { count: lines.length })}
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
              <span className="text-xs text-gray-500 font-medium">{t('deploy.deploymentLog')}</span>
              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadLog}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <Download size={11} />
                  {t('deploy.download')}
                </button>
              )}
            </div>
            <div
              ref={logRef}
              className="h-80 overflow-auto p-4 font-mono text-xs text-gray-300 space-y-0.5"
            >
              {lines.length === 0 && isDeploying && (
                <span className="text-gray-600">{t('deploy.initializingDeployment')}</span>
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
              <h3 className="text-xl font-semibold text-green-400 mb-2">
                {t('deploy.deploymentSuccessful')}
              </h3>
              <p className="text-sm text-gray-400 mb-8">
                {t('deploy.agentRunningInNamespace', { namespace: targetNamespace })}
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
                  onClick={() =>
                    navigate({
                      to: '/deployments/$namespace',
                      params: { namespace: targetNamespace },
                    })
                  }
                  className="p-4 bg-gray-800/50 border border-gray-800 rounded-lg hover:bg-gray-800 transition-colors group"
                >
                  <Activity size={20} className="text-gray-400 mb-2" />
                  <div className="text-sm font-medium text-gray-300 group-hover:text-gray-200">
                    {t('deploy.openNamespace')}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('deploy.openNamespaceDescription')}
                  </p>
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
                {t('store.backToStore')}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setDeployStarted(false)
                  setDeploySuccess(null)
                }}
                className="flex items-center gap-1.5 text-sm text-yellow-400 hover:text-yellow-300 border border-yellow-800 hover:border-yellow-600 px-4 py-2 rounded-lg transition-colors"
              >
                {t('common.retry')}
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
        <StepIndicator steps={getWizardSteps(t)} currentStep={currentStep} />
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
