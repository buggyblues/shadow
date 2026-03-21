/**
 * Model Configuration Page — Full-featured Provider & Model Management
 *
 * Features:
 * - Wizard-style provider setup with guided steps
 * - Rich model browser with context window, pricing, capabilities
 * - Batch model selection with tier/capability filters
 * - Connection test & validation
 * - Provider card with detailed model info
 * - Advanced settings (base URL, custom headers, etc.)
 *
 * Uses comprehensive presets from ./model-presets.ts for all provider/model metadata.
 */

import {
  AlertCircle,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Coins,
  Crown,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  Info,
  Key,
  Lightbulb,
  Link,
  Loader2,
  Package,
  Plus,
  Ruler,
  Save,
  Search,
  Server,
  Sparkles,
  Star,
  Trash2,
  Type,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModelDefinition, ModelProviderEntry } from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import {
  CAPABILITY_LABELS,
  CATEGORY_LABELS,
  type CodingPlanInfo,
  formatContextWindow,
  formatMaxTokens,
  formatPrice,
  getPresetsByCategory,
  getProviderPreset,
  type ModelCapability,
  type ModelPreset,
  type ModelTier,
  PROVIDER_PRESETS,
  type ProviderCategory,
  type ProviderPreset,
  TIER_INFO,
} from './model-presets'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function presetToModelDefs(models: ModelPreset[]): ModelDefinition[] {
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    reasoning: m.capabilities.includes('thinking') || m.capabilities.includes('reasoning'),
    input: m.capabilities.includes('vision') ? (['text', 'image'] as const) : (['text'] as const),
    cost: {
      input: m.inputPricePer1M ?? 0,
      output: m.outputPricePer1M ?? 0,
      cacheRead: m.cachedInputPricePer1M ?? 0,
      cacheWrite: 0,
    },
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
  }))
}

function modelDefsToIds(defs: ModelDefinition[]): string[] {
  return defs.map((d) => d.id)
}

function idsToModelDefs(ids: string[], providerPreset?: ProviderPreset): ModelDefinition[] {
  return ids.map((id) => {
    const preset = providerPreset?.models.find((m) => m.id === id)
    if (preset) {
      return {
        id: preset.id,
        name: preset.name,
        reasoning:
          preset.capabilities.includes('thinking') || preset.capabilities.includes('reasoning'),
        input: preset.capabilities.includes('vision')
          ? (['text', 'image'] as const)
          : (['text'] as const),
        cost: {
          input: preset.inputPricePer1M ?? 0,
          output: preset.outputPricePer1M ?? 0,
          cacheRead: preset.cachedInputPricePer1M ?? 0,
          cacheWrite: 0,
        },
        contextWindow: preset.contextWindow,
        maxTokens: preset.maxTokens,
      }
    }
    return { id, name: id }
  })
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TIER_ORDER: ModelTier[] = ['flagship', 'balanced', 'fast', 'economy', 'specialized']

const KEY_CAPABILITIES: ModelCapability[] = [
  'vision',
  'function-calling',
  'thinking',
  'code',
  'reasoning',
  'web-search',
]

// ─── Page ────────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'add' | 'edit'

export function ModelsPage() {
  const { t } = useTranslation()
  const [providers, setProviders] = useState<Record<string, ModelProviderEntry>>({})
  const [view, setView] = useState<ViewMode>('list')
  const [editId, setEditId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const data = await openClawApi.listModels()
      setProviders(data ?? {})
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (openClawApi.isAvailable) loadData()
  }, [loadData])

  const handleDelete = async (id: string) => {
    await openClawApi.deleteModel(id)
    await loadData()
  }

  if (view === 'add') {
    return (
      <AddProviderView
        existingIds={Object.keys(providers)}
        onBack={() => setView('list')}
        onSave={async () => {
          await loadData()
          setView('list')
        }}
      />
    )
  }

  if (view === 'edit' && editId) {
    const entry = providers[editId]
    if (!entry) {
      setView('list')
      return null
    }
    return (
      <EditProviderView
        id={editId}
        entry={entry}
        onBack={() => {
          setEditId(null)
          setView('list')
        }}
        onSave={async () => {
          await loadData()
          setEditId(null)
          setView('list')
        }}
      />
    )
  }

  const entries = Object.entries(providers)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-5 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-text-primary mb-1">
              {t('openclaw.models.title', '模型提供商')}
            </h2>
            <p className="text-sm text-text-muted">
              {t(
                'openclaw.models.subtitle',
                '配置 AI 模型提供商和 API 密钥，为智能体提供语言模型能力',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView('add')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 transition active:scale-95"
          >
            <Plus size={14} />
            {t('openclaw.models.addProvider', '添加提供商')}
          </button>
        </div>

        {entries.length === 0 ? (
          <EmptyState onAdd={() => setView('add')} />
        ) : (
          <div className="space-y-3">
            {entries.map(([id, entry]) => (
              <ProviderCard
                key={id}
                id={id}
                entry={entry}
                onEdit={() => {
                  setEditId(id)
                  setView('edit')
                }}
                onDelete={() => handleDelete(id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Provider Logo ───────────────────────────────────────────────────────────

/** Provider logo with first-letter fallback */
function ProviderLogo({
  preset,
  size = 'md',
}: {
  preset?: ProviderPreset | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const dims = size === 'lg' ? 'w-12 h-12' : size === 'md' ? 'w-8 h-8' : 'w-6 h-6'
  const textSize = size === 'lg' ? 'text-lg' : size === 'md' ? 'text-sm' : 'text-xs'
  const letter = preset?.name?.charAt(0)?.toUpperCase() ?? '?'
  const brandColor = preset?.brandColor ?? 'var(--text-muted)'

  return (
    <div
      className={`${dims} rounded-lg flex items-center justify-center shrink-0 font-bold ${textSize}`}
      style={{
        backgroundColor: `${brandColor}15`,
        color: brandColor,
      }}
    >
      {letter}
    </div>
  )
}

// ─── Provider Card ───────────────────────────────────────────────────────────

function ProviderCard({
  id,
  entry,
  onEdit,
  onDelete,
}: {
  id: string
  entry: ModelProviderEntry
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const preset = getProviderPreset(id)
  const modelIds = modelDefsToIds(entry.models ?? [])

  // Group models by tier if we have preset data
  const modelsByTier = useMemo(() => {
    if (!preset) return null
    const tiers: Partial<Record<ModelTier, { preset: ModelPreset; enabled: boolean }[]>> = {}
    for (const mp of preset.models) {
      const enabled = modelIds.includes(mp.id)
      if (!tiers[mp.tier]) tiers[mp.tier] = []
      tiers[mp.tier]!.push({ preset: mp, enabled })
    }
    return tiers
  }, [preset, modelIds])

  // Cost estimate from presets
  const costSummary = useMemo(() => {
    if (!preset) return null
    const enabledModels = preset.models.filter(
      (m) => modelIds.includes(m.id) && m.inputPricePer1M !== undefined,
    )
    if (enabledModels.length === 0) return null
    const minInput = Math.min(...enabledModels.map((m) => m.inputPricePer1M!))
    const maxInput = Math.max(...enabledModels.map((m) => m.inputPricePer1M!))
    return minInput === maxInput
      ? formatPrice(minInput)
      : `${formatPrice(minInput)} ~ ${formatPrice(maxInput)}`
  }, [preset, modelIds])

  return (
    <div className="bg-bg-secondary rounded-xl border border-bg-tertiary overflow-hidden group">
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Provider logo */}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-base font-bold"
            style={{
              backgroundColor: preset ? `${preset.brandColor}15` : 'var(--bg-tertiary)',
              color: preset?.brandColor ?? 'var(--text-muted)',
            }}
          >
            {preset?.name?.charAt(0)?.toUpperCase() ?? id.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name row */}
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-text-primary">{preset?.name ?? id}</p>
              {preset && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                  {CATEGORY_LABELS[preset.category]}
                </span>
              )}
              {preset?.codingPlan && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                  Coding Plan
                </span>
              )}
            </div>

            {/* Summary line: model count + cost range */}
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-text-muted">{modelIds.length} 个模型</span>
              {preset && modelIds.length < preset.models.length && (
                <span className="text-[10px] text-text-muted">/ {preset.models.length} 可用</span>
              )}
              {costSummary && (
                <span className="text-[10px] text-text-muted">
                  <Coins size={10} className="inline -mt-0.5" /> {costSummary}/1M
                </span>
              )}
              {entry.apiKey && (
                <span className="text-[10px] text-green-400 flex items-center gap-0.5">
                  <Key size={9} />
                  已配置
                </span>
              )}
              {modelIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                >
                  {expanded ? '收起' : '详情'}
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>
              )}
            </div>

            {/* Collapsed: show first few model badges */}
            {!expanded && modelIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {modelIds.slice(0, 5).map((mid) => {
                  const mp = preset?.models.find((m) => m.id === mid)
                  const tier = mp?.tier
                  const tierInfo = tier ? TIER_INFO[tier] : null
                  return (
                    <span
                      key={mid}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        tierInfo
                          ? `${tierInfo.bgColor} ${tierInfo.color}`
                          : 'bg-bg-tertiary text-text-muted'
                      }`}
                    >
                      {mp?.recommended && '★ '}
                      {mid}
                    </span>
                  )
                })}
                {modelIds.length > 5 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                    +{modelIds.length - 5}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onEdit}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition opacity-0 group-hover:opacity-100"
              title={t('common.edit', '编辑')}
            >
              <Edit3 size={15} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-red-500 hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100"
              title={t('common.delete', '删除')}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded model details */}
      {expanded && modelsByTier && (
        <div className="border-t border-bg-tertiary px-4 py-3 space-y-3">
          {TIER_ORDER.filter((tier) => modelsByTier[tier]?.some((m) => m.enabled)).map((tier) => {
            const tierModels = modelsByTier[tier]!.filter((m) => m.enabled)
            const tierInfo = TIER_INFO[tier]
            return (
              <div key={tier}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tierInfo.bgColor} ${tierInfo.color}`}
                  >
                    {tierInfo.label}
                  </span>
                  <span className="text-[10px] text-text-muted">{tierModels.length} 个模型</span>
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {tierModels.map(({ preset: mp }) => (
                    <ModelDetailRow key={mp.id} model={mp} />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Models without preset data */}
          {modelIds
            .filter((id) => !preset?.models.find((m) => m.id === id))
            .map((id) => (
              <div
                key={id}
                className="text-xs font-mono text-text-muted px-2 py-1 rounded bg-bg-tertiary"
              >
                {id}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

/** Compact model detail row for expanded card view */
function ModelDetailRow({ model }: { model: ModelPreset }) {
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-bg-tertiary/50 transition text-xs">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {model.recommended && (
            <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />
          )}
          <span className="font-mono font-medium text-text-primary truncate">{model.id}</span>
          {model.name !== model.id && (
            <span className="text-text-muted truncate">{model.name}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-text-muted">
        <span title="上下文窗口">{formatContextWindow(model.contextWindow)}</span>
        <span title="最大输出">{formatMaxTokens(model.maxTokens)}</span>
        {model.inputPricePer1M !== undefined && (
          <span className="w-16 text-right" title="输入价格/1M tokens">
            {formatPrice(model.inputPricePer1M)}
          </span>
        )}
        <div className="flex gap-0.5">
          {model.capabilities.includes('vision') && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400">
              视觉
            </span>
          )}
          {model.capabilities.includes('thinking') && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400">
              思考
            </span>
          )}
          {model.capabilities.includes('code') && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/10 text-green-400">
              编程
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-2xl bg-bg-secondary border border-bg-tertiary flex items-center justify-center mb-5">
        <Brain size={36} className="text-text-muted" />
      </div>
      <h3 className="text-base font-bold text-text-primary mb-1">
        {t('openclaw.models.noProviders', '暂无模型提供商')}
      </h3>
      <p className="text-sm text-text-muted max-w-md mb-6">
        {t(
          'openclaw.models.noProvidersDesc',
          '添加 AI 模型提供商，为你的龙虾智能体提供语言模型支持。支持 OpenAI、Claude、Gemini 等主流模型，也可以使用 Ollama 运行本地模型。',
        )}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 transition active:scale-95"
      >
        <Plus size={14} />
        {t('openclaw.models.addProvider', '添加提供商')}
      </button>
    </div>
  )
}

// ─── Add Provider View ───────────────────────────────────────────────────────

type WizardStep = 'pick' | 'configure' | 'models' | 'review'

function AddProviderView({
  existingIds,
  onBack,
  onSave,
}: {
  existingIds: string[]
  onBack: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState<WizardStep>('pick')
  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset | null>(null)
  const [providerId, setProviderId] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [defaultModel, setDefaultModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTier, setFilterTier] = useState<ModelTier | 'all'>('all')
  const [filterCap, setFilterCap] = useState<ModelCapability | 'all'>('all')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  // Step 1: Pick preset
  const selectPreset = (preset: ProviderPreset) => {
    setSelectedPreset(preset)
    const id = existingIds.includes(preset.id) ? `${preset.id}-2` : preset.id
    setProviderId(id)
    setBaseUrl(preset.baseUrl)
    // Auto-select all non-deprecated models, default to recommended model
    const allActive = preset.models.filter((m) => !m.deprecated)
    setSelectedModels(new Set(allActive.map((m) => m.id)))
    const recommended = allActive.filter((m) => m.recommended)
    if (recommended[0]) {
      setDefaultModel(recommended[0].id)
    } else if (allActive[0]) {
      setDefaultModel(allActive[0].id)
    }
    setStep('configure')
  }

  const handleAddCustomModel = () => {
    const m = customModel.trim()
    if (m && !selectedModels.has(m)) {
      setSelectedModels(new Set([...selectedModels, m]))
      setCustomModel('')
    }
  }

  const handleSave = async () => {
    const id = providerId.trim()
    if (!id) return
    setSaving(true)
    try {
      const providerPreset = selectedPreset ?? undefined
      await openClawApi.saveModel(id, {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        api: providerPreset?.apiFormat,
        models: idsToModelDefs([...selectedModels], providerPreset),
      })
      // Set default model if one was chosen
      if (defaultModel) {
        await openClawApi.setDefaultModel(`${id}/${defaultModel}`)
      }
      onSave()
    } finally {
      setSaving(false)
    }
  }

  // Test connection
  const handleTest = async () => {
    setTestStatus('testing')
    setTestError('')
    try {
      // Try to save and see if gateway accepts it
      const id = `__test_${Date.now()}`
      const result = await openClawApi.saveModel(id, {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        api: selectedPreset?.apiFormat,
        models: idsToModelDefs([...selectedModels].slice(0, 1), selectedPreset ?? undefined),
      })
      // Clean up test entry
      await openClawApi.deleteModel(id)
      if (result?.success) {
        setTestStatus('success')
      } else {
        setTestStatus('error')
        setTestError('配置验证失败，请检查 API Key 和基础地址')
      }
    } catch (err) {
      setTestStatus('error')
      setTestError(err instanceof Error ? err.message : '连接测试失败')
    }
  }

  if (step === 'pick') {
    return <ProviderPicker onSelect={selectPreset} onBack={onBack} existingIds={existingIds} />
  }

  if (step === 'configure' && selectedPreset) {
    const isOllama = selectedPreset.auth === 'none'
    const isOAuth = selectedPreset.auth === 'oauth'
    const isCustom = selectedPreset.id === 'custom'
    const canProceed =
      isOllama || isOAuth || isCustom ? baseUrl.trim() !== '' : apiKey.trim() !== ''
    const guide = selectedPreset.guide
    const plan = selectedPreset.codingPlan

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-5 pb-6 max-w-lg mx-auto">
          {/* Progress bar */}
          <WizardProgress current="configure" />

          {/* Back button */}
          <button
            type="button"
            onClick={() => setStep('pick')}
            className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition mb-6"
          >
            <ChevronLeft size={16} />
            {t('common.back', '返回')}
          </button>

          {/* Provider Header — compact */}
          <div className="flex items-center gap-3 mb-6">
            <ProviderLogo preset={selectedPreset} size="lg" />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-text-primary">{selectedPreset.name}</h2>
              <p className="text-xs text-text-muted truncate">{selectedPreset.description}</p>
            </div>
          </div>

          {/* Coding Plan Banner */}
          {plan && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 mb-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Sparkles size={12} />
                  {plan.name}
                  {plan.pricing && (
                    <span className="font-normal text-text-muted ml-1">· {plan.pricing}</span>
                  )}
                </p>
                <a
                  href={plan.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-amber-400 hover:underline flex items-center gap-0.5"
                >
                  详情 <ExternalLink size={9} />
                </a>
              </div>
              <p className="text-[11px] text-text-muted mt-1">{plan.description}</p>
            </div>
          )}

          {/* ── Main: API Key or No-Auth ── */}
          {!isOllama && !isOAuth ? (
            <div className="mb-5">
              <label className="block text-sm font-bold text-text-primary mb-2">
                <Key size={14} className="inline mr-1.5 -mt-0.5" />
                {t('openclaw.models.apiKey', 'API 密钥')}
                {!isCustom && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={selectedPreset.apiKeyPlaceholder || 'sk-...'}
                  className="w-full px-4 py-3 pr-12 rounded-xl bg-bg-secondary border-2 border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition font-mono"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition"
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {guide.apiKeyUrl && (
                <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1">
                  <Info size={11} />
                  没有密钥？
                  <a
                    href={guide.apiKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    前往获取 →
                  </a>
                </p>
              )}
            </div>
          ) : isOAuth ? (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 mb-5 flex items-center gap-2.5">
              <Sparkles size={16} className="text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-400">OAuth 授权登录</p>
                <p className="text-[11px] text-text-muted">
                  通过 <code className="font-mono">openclaw login</code> 完成授权，无需 API Key
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 mb-5 flex items-center gap-2.5">
              <CheckCircle2 size={16} className="text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-green-400">无需 API 密钥</p>
                <p className="text-[11px] text-text-muted">本地运行，确保 Ollama 服务已启动</p>
              </div>
            </div>
          )}

          {/* Base URL (custom provider) */}
          {isCustom && (
            <div className="mb-5">
              <label className="block text-sm font-bold text-text-primary mb-2">
                <Server size={14} className="inline mr-1.5 -mt-0.5" />
                API 基础地址
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://your-api-endpoint.com/v1"
                className="w-full px-4 py-3 rounded-xl bg-bg-secondary border-2 border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition font-mono"
              />
              <p className="text-xs text-text-muted mt-1.5">兼容 OpenAI Chat Completions 格式</p>
            </div>
          )}

          {/* Pre-configured summary (non-custom) */}
          {!isCustom && (
            <div className="flex items-center gap-4 text-xs text-text-muted mb-5 px-1">
              <span className="flex items-center gap-1">
                <Globe size={11} />
                <span className="font-mono text-text-secondary truncate max-w-[200px]">
                  {baseUrl}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Sparkles size={11} />
                {selectedPreset.models.filter((m) => !m.deprecated).length} 个可用模型
              </span>
            </div>
          )}

          {/* Setup Guide — compact inline */}
          <details className="rounded-xl border border-bg-tertiary bg-bg-secondary mb-6 group">
            <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-sm font-medium text-text-secondary hover:text-text-primary transition select-none">
              <Lightbulb size={14} className="text-primary shrink-0" />
              配置指南
              <ChevronDown
                size={12}
                className="ml-auto text-text-muted group-open:rotate-180 transition-transform"
              />
              <div className="flex items-center gap-2 ml-2">
                {guide.pricingUrl && (
                  <a
                    href={guide.pricingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-text-muted hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    定价
                  </a>
                )}
                <a
                  href={guide.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  文档 <ExternalLink size={9} className="inline" />
                </a>
              </div>
            </summary>
            <div className="px-4 pb-4 pt-1">
              <ol className="space-y-2">
                {guide.steps.map((s, i) => (
                  <li key={s} className="flex gap-2.5 text-xs text-text-secondary">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
              {guide.tips && guide.tips.length > 0 && (
                <ul className="mt-3 space-y-1 pl-2 border-l-2 border-primary/15">
                  {guide.tips.map((tip) => (
                    <li key={tip} className="text-[11px] text-text-muted leading-relaxed pl-1">
                      {tip}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          {/* Footer */}
          <div className="flex justify-between gap-3 pt-4 border-t border-bg-tertiary">
            <button
              type="button"
              onClick={() => setStep('pick')}
              className="px-4 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition"
            >
              {t('common.back', '上一步')}
            </button>
            <button
              type="button"
              onClick={() => setStep('models')}
              disabled={!canProceed}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 disabled:opacity-50 transition"
            >
              选择模型
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'models' && selectedPreset) {
    const isCustom = selectedPreset.id === 'custom'
    const activeModels = selectedPreset.models.filter((m) => !m.deprecated)

    // Filtering
    const filteredModels = activeModels.filter((m) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !m.id.toLowerCase().includes(q) &&
          !m.name.toLowerCase().includes(q) &&
          !m.description.toLowerCase().includes(q)
        )
          return false
      }
      if (filterTier !== 'all' && m.tier !== filterTier) return false
      if (filterCap !== 'all' && !m.capabilities.includes(filterCap)) return false
      return true
    })

    // Group by tier
    const grouped: Partial<Record<ModelTier, ModelPreset[]>> = {}
    for (const m of filteredModels) {
      if (!grouped[m.tier]) grouped[m.tier] = []
      grouped[m.tier]!.push(m)
    }

    const toggleModel = (id: string) => {
      const next = new Set(selectedModels)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      // If no default model set yet, auto-set the first selected model
      if (!next.has(defaultModel) && next.size > 0) {
        setDefaultModel([...next][0] ?? '')
      }
      if (next.size === 0) setDefaultModel('')
      setSelectedModels(next)
    }

    const selectAll = () => {
      setSelectedModels(new Set(filteredModels.map((m) => m.id)))
    }

    const selectRecommended = () => {
      const rec = activeModels.filter((m) => m.recommended)
      setSelectedModels(new Set(rec.map((m) => m.id)))
      if (rec[0]) setDefaultModel(rec[0].id)
    }

    const clearAll = () => {
      setSelectedModels(new Set())
      setDefaultModel('')
    }

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-5 pb-6">
          <WizardProgress current="models" />

          <button
            type="button"
            onClick={() => setStep('configure')}
            className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition mb-4"
          >
            <ChevronLeft size={16} />
            返回
          </button>

          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-text-primary">选择模型</h2>
              <p className="text-sm text-text-muted">
                选择要启用的模型 · 已选{' '}
                <span className="text-text-primary font-bold">{selectedModels.size}</span> 个
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectRecommended}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Star size={11} />
                推荐
              </button>
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-primary hover:underline"
              >
                全选
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                清空
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          {!isCustom && activeModels.length > 3 && (
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索模型..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition"
                />
              </div>
              <select
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value as ModelTier | 'all')}
                className="px-2.5 py-2 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary focus:outline-none focus:border-danger/50"
              >
                <option value="all">全部级别</option>
                {TIER_ORDER.map((tier) => (
                  <option key={tier} value={tier}>
                    {TIER_INFO[tier].label}
                  </option>
                ))}
              </select>
              <select
                value={filterCap}
                onChange={(e) => setFilterCap(e.target.value as ModelCapability | 'all')}
                className="px-2.5 py-2 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary focus:outline-none focus:border-danger/50"
              >
                <option value="all">全部能力</option>
                {KEY_CAPABILITIES.map((cap) => (
                  <option key={cap} value={cap}>
                    {CAPABILITY_LABELS[cap]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Model Grid */}
          {!isCustom && activeModels.length > 0 ? (
            <div className="space-y-5 mb-4">
              {TIER_ORDER.filter((tier) => grouped[tier] && grouped[tier]!.length > 0).map(
                (tier) => {
                  const tierModels = grouped[tier]!
                  const tierInfo = TIER_INFO[tier]
                  return (
                    <div key={tier}>
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded ${tierInfo.bgColor} ${tierInfo.color}`}
                        >
                          {tierInfo.label}
                        </span>
                        <span className="text-xs text-text-muted">{tierModels.length} 个模型</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {tierModels.map((model) => (
                          <ModelSelectCard
                            key={model.id}
                            model={model}
                            selected={selectedModels.has(model.id)}
                            isDefault={defaultModel === model.id}
                            onToggle={() => toggleModel(model.id)}
                            onSetDefault={() => {
                              if (!selectedModels.has(model.id)) {
                                toggleModel(model.id)
                              }
                              setDefaultModel(model.id)
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )
                },
              )}
              {filteredModels.length === 0 && (
                <div className="text-center py-8 text-sm text-text-muted">未找到匹配的模型</div>
              )}
            </div>
          ) : isCustom ? (
            <div className="mb-4">
              <p className="text-sm text-text-muted mb-3">
                手动添加模型 ID（确保名称与 API 中的模型 ID 一致）
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {[...selectedModels].map((m) => (
                  <span
                    key={m}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-mono ${
                      defaultModel === m
                        ? 'bg-danger/10 text-danger border border-danger/20'
                        : 'bg-bg-tertiary text-text-secondary'
                    }`}
                  >
                    {defaultModel === m && <Crown size={10} />}
                    {m}
                    <button
                      type="button"
                      onClick={() => setDefaultModel(m)}
                      className="text-text-muted hover:text-amber-400 transition"
                      title="设为默认"
                    >
                      <CircleDot size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedModels)
                        next.delete(m)
                        if (defaultModel === m) setDefaultModel([...next][0] ?? '')
                        setSelectedModels(next)
                      }}
                      className="text-text-muted hover:text-red-500 transition"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Custom model input */}
          <div className="mb-6">
            <p className="text-xs text-text-muted mb-1.5">
              {isCustom ? '' : '供应商更新了新模型？手动添加自定义模型 ID：'}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCustomModel()
                  }
                }}
                placeholder="输入模型 ID，如 gpt-4o..."
                className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition font-mono"
              />
              <button
                type="button"
                onClick={handleAddCustomModel}
                disabled={!customModel.trim()}
                className="px-3 py-2 rounded-lg bg-bg-tertiary text-text-secondary text-xs hover:bg-bg-tertiary/80 transition disabled:opacity-40"
              >
                <Plus size={12} />
              </button>
            </div>
            {!isCustom &&
              (() => {
                const presetIds = new Set(activeModels.map((m) => m.id))
                const customIds = [...selectedModels].filter((id) => !presetIds.has(id))
                if (customIds.length === 0) return null
                return (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {customIds.map((m) => (
                      <span
                        key={m}
                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary font-mono"
                      >
                        <Plus size={8} className="inline -mt-0.5" /> {m}
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedModels)
                            next.delete(m)
                            setSelectedModels(next)
                          }}
                          className="text-text-muted hover:text-red-500 transition"
                        >
                          <X size={9} />
                        </button>
                      </span>
                    ))}
                  </div>
                )
              })()}
          </div>

          {/* Cost Table */}
          {!isCustom &&
            selectedModels.size > 0 &&
            (() => {
              const selected = activeModels.filter(
                (m) => selectedModels.has(m.id) && m.inputPricePer1M !== undefined,
              )
              if (selected.length === 0) return null
              return (
                <div className="rounded-xl border border-bg-tertiary bg-bg-secondary p-4 mb-4">
                  <p className="text-xs font-bold text-text-muted mb-3 flex items-center gap-1.5">
                    <Coins size={12} />
                    费用参考（/1M tokens）
                  </p>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-text-muted border-b border-bg-tertiary">
                        <th className="text-left font-medium py-1.5 pr-2">模型</th>
                        <th className="text-right font-medium py-1.5 px-2 w-16">输入</th>
                        <th className="text-right font-medium py-1.5 px-2 w-16">输出</th>
                        <th className="text-right font-medium py-1.5 pl-2 w-16">缓存</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.map((m) => (
                        <tr key={m.id} className="border-b border-bg-tertiary/50 last:border-0">
                          <td className="py-1.5 pr-2">
                            <span className="text-text-secondary font-mono truncate flex items-center gap-1">
                              {defaultModel === m.id && (
                                <Crown size={9} className="text-amber-400 shrink-0" />
                              )}
                              {m.id}
                            </span>
                          </td>
                          <td className="text-right text-text-muted py-1.5 px-2">
                            {formatPrice(m.inputPricePer1M)}
                          </td>
                          <td className="text-right text-text-muted py-1.5 px-2">
                            {formatPrice(m.outputPricePer1M)}
                          </td>
                          <td className="text-right text-text-muted py-1.5 pl-2">
                            {m.cachedInputPricePer1M !== undefined
                              ? formatPrice(m.cachedInputPricePer1M)
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}

          {/* Footer */}
          <div className="flex justify-between gap-3 mt-8 pt-4 border-t border-bg-tertiary">
            <button
              type="button"
              onClick={() => setStep('configure')}
              className="px-4 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition"
            >
              上一步
            </button>
            <button
              type="button"
              onClick={() => setStep('review')}
              disabled={selectedModels.size === 0}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 disabled:opacity-50 transition"
            >
              确认配置
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'review' && selectedPreset) {
    const isOllama = selectedPreset.auth === 'none'
    const isCustom = selectedPreset.id === 'custom'

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-5 pb-6 max-w-2xl">
          <WizardProgress current="review" />

          <button
            type="button"
            onClick={() => setStep('models')}
            className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition mb-4"
          >
            <ChevronLeft size={16} />
            返回
          </button>

          <h2 className="text-lg font-bold text-text-primary mb-1">确认配置</h2>
          <p className="text-sm text-text-muted mb-6">确认以下信息无误后保存</p>

          {/* Review Summary */}
          <div className="space-y-4 mb-6">
            <ReviewItem label="提供商" value={selectedPreset.name} />
            <ReviewItem label="提供商 ID" value={providerId} mono />
            <ReviewItem label="API 地址" value={baseUrl} mono />
            {!isOllama && (
              <ReviewItem
                label="API 密钥"
                value={apiKey ? `${apiKey.substring(0, 6)}${'•'.repeat(16)}` : '未设置'}
                mono
              />
            )}
            <ReviewItem label="已选模型" value={`${selectedModels.size} 个`} />
            <div className="flex flex-wrap gap-1 pl-[88px]">
              {[...selectedModels].slice(0, 12).map((m) => {
                const mp = selectedPreset.models.find((p) => p.id === m)
                return (
                  <span
                    key={m}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted font-mono"
                  >
                    {mp?.recommended && '★ '}
                    {m}
                  </span>
                )
              })}
              {selectedModels.size > 12 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                  +{selectedModels.size - 12}
                </span>
              )}
            </div>
          </div>

          {/* Advanced: editable provider ID & base URL */}
          <AdvancedSection>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">提供商 ID</label>
                <input
                  type="text"
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary font-mono focus:outline-none focus:border-danger/50 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  API 基础地址
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary font-mono focus:outline-none focus:border-danger/50 transition"
                />
              </div>
            </div>
          </AdvancedSection>

          {/* Connection Test */}
          <div className="mt-6 mb-6">
            <button
              type="button"
              onClick={handleTest}
              disabled={testStatus === 'testing'}
              className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition"
            >
              {testStatus === 'testing' ? (
                <Loader2 size={14} className="animate-spin text-primary" />
              ) : testStatus === 'success' ? (
                <CheckCircle2 size={14} className="text-green-400" />
              ) : testStatus === 'error' ? (
                <AlertCircle size={14} className="text-red-400" />
              ) : (
                <Zap size={14} />
              )}
              {testStatus === 'testing'
                ? '测试中...'
                : testStatus === 'success'
                  ? '连接正常'
                  : testStatus === 'error'
                    ? '测试失败'
                    : '测试连接'}
            </button>
            {testStatus === 'error' && testError && (
              <p className="text-xs text-red-400 mt-1 ml-6">{testError}</p>
            )}
          </div>

          {/* Save */}
          <div className="flex justify-between gap-3 pt-4 border-t border-bg-tertiary">
            <button
              type="button"
              onClick={() => setStep('models')}
              className="px-4 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition"
            >
              上一步
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !providerId.trim() || selectedModels.size === 0}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 disabled:opacity-50 transition active:scale-95"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              保存配置
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Fallback (should not reach here)
  return <ProviderPicker onSelect={selectPreset} onBack={onBack} existingIds={existingIds} />
}

// ─── Provider Picker ─────────────────────────────────────────────────────────

function ProviderPicker({
  onSelect,
  onBack,
  existingIds,
}: {
  onSelect: (preset: ProviderPreset) => void
  onBack: () => void
  existingIds: string[]
}) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const byCategory = useMemo(() => getPresetsByCategory(), [])

  const filterPresets = (presets: ProviderPreset[]) => {
    if (!searchQuery) return presets
    const q = searchQuery.toLowerCase()
    return presets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    )
  }

  const categoryOrder: ProviderCategory[] = ['global', 'china', 'coding-plan', 'local', 'custom']
  const hasResults = categoryOrder.some((cat) => filterPresets(byCategory[cat]).length > 0)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-5 pb-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition mb-4"
        >
          <ChevronLeft size={16} />
          {t('common.back', '返回')}
        </button>

        <h2 className="text-lg font-bold text-text-primary mb-1">选择模型提供商</h2>
        <p className="text-sm text-text-muted mb-5">
          选择一个预设提供商快速配置，或自定义 OpenAI 兼容端点
        </p>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索提供商..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-bg-secondary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition"
          />
        </div>

        {/* Provider cards by category */}
        <div className="space-y-6">
          {categoryOrder.map((cat) => {
            const presets = filterPresets(byCategory[cat])
            if (presets.length === 0) return null
            return (
              <div key={cat}>
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                  {CATEGORY_LABELS[cat]}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5">
                  {presets.map((preset) => {
                    const isConfigured = existingIds.includes(preset.id)
                    const modelCount = preset.models.filter((m) => !m.deprecated).length
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onSelect(preset)}
                        className="relative bg-bg-secondary rounded-xl border border-bg-tertiary p-4 text-left hover:border-danger/30 transition group active:scale-[0.98]"
                      >
                        {isConfigured && (
                          <div className="absolute top-2 right-2">
                            <Check size={14} className="text-green-400" />
                          </div>
                        )}
                        <div className="flex items-center gap-2.5 mb-2 min-h-[32px]">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
                            style={{
                              backgroundColor: `${preset.brandColor}15`,
                              color: preset.brandColor,
                            }}
                          >
                            {preset.name.charAt(0).toUpperCase()}
                          </div>
                          <p className="text-sm font-bold text-text-primary group-hover:text-danger transition leading-tight">
                            {preset.name}
                          </p>
                        </div>
                        <p className="text-xs text-text-muted line-clamp-2 mb-2 min-h-[2rem]">
                          {preset.description}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-text-muted">
                          <span>{modelCount} 个模型</span>
                          {preset.auth === 'none' && <span className="text-green-400">免 Key</span>}
                          {preset.auth === 'oauth' && <span className="text-amber-400">OAuth</span>}
                          {(preset.codingPlan || preset.category === 'coding-plan') && (
                            <span className="text-amber-400">Coding Plan</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {!hasResults && (
            <div className="text-center py-8 text-sm text-text-muted">未找到匹配的提供商</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Edit Provider View ──────────────────────────────────────────────────────

function EditProviderView({
  id,
  entry,
  onBack,
  onSave,
}: {
  id: string
  entry: ModelProviderEntry
  onBack: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const preset = getProviderPreset(id)
  const [baseUrl, setBaseUrl] = useState(entry.baseUrl)
  const [apiKey, setApiKey] = useState(entry.apiKey ?? '')
  const [showApiKey, setShowApiKey] = useState(false)
  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    new Set(modelDefsToIds(entry.models ?? [])),
  )
  const [customModel, setCustomModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTier, setFilterTier] = useState<ModelTier | 'all'>('all')
  const [filterCap, setFilterCap] = useState<ModelCapability | 'all'>('all')

  const handleAddCustomModel = () => {
    const m = customModel.trim()
    if (m && !selectedModels.has(m)) {
      setSelectedModels(new Set([...selectedModels, m]))
      setCustomModel('')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await openClawApi.saveModel(id, {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        api: preset?.apiFormat,
        models: idsToModelDefs([...selectedModels], preset ?? undefined),
      })
      onSave()
    } finally {
      setSaving(false)
    }
  }

  const toggleModel = (modelId: string) => {
    const next = new Set(selectedModels)
    if (next.has(modelId)) next.delete(modelId)
    else next.add(modelId)
    setSelectedModels(next)
  }

  const activeModels = preset?.models.filter((m) => !m.deprecated) ?? []
  const filteredModels = activeModels.filter((m) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!m.id.toLowerCase().includes(q) && !m.name.toLowerCase().includes(q)) return false
    }
    if (filterTier !== 'all' && m.tier !== filterTier) return false
    if (filterCap !== 'all' && !m.capabilities.includes(filterCap)) return false
    return true
  })

  const grouped: Partial<Record<ModelTier, ModelPreset[]>> = {}
  for (const m of filteredModels) {
    if (!grouped[m.tier]) grouped[m.tier] = []
    grouped[m.tier]!.push(m)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-5 pb-6 max-w-3xl">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition mb-4"
        >
          <ChevronLeft size={16} />
          {t('common.back', '返回')}
        </button>

        {/* Header */}
        {preset ? (
          <ProviderHeader preset={preset} />
        ) : (
          <h2 className="text-lg font-bold text-text-primary mb-6">编辑提供商: {id}</h2>
        )}

        <div className="space-y-5">
          {/* API Key */}
          <div>
            <label className="block text-sm font-bold text-text-primary mb-2">
              <Key size={14} className="inline mr-1.5 -mt-0.5" />
              API 密钥
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={preset?.apiKeyPlaceholder || 'sk-...'}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-bg-secondary border-2 border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition"
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-sm font-bold text-text-primary mb-2">
              <Server size={14} className="inline mr-1.5 -mt-0.5" />
              API 基础地址
            </label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-bg-secondary border-2 border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition font-mono"
            />
          </div>

          {/* Models Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-text-primary">
                <Sparkles size={14} className="inline mr-1.5 -mt-0.5" />
                模型 ({selectedModels.size} 个已选)
              </label>
              {preset && (
                <button
                  type="button"
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {showModelPicker ? '收起' : '编辑模型列表'}
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${showModelPicker ? 'rotate-180' : ''}`}
                  />
                </button>
              )}
            </div>

            {/* Quick view of selected models */}
            {!showModelPicker && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[...selectedModels].map((m) => {
                  const mp = preset?.models.find((p) => p.id === m)
                  const tierInfo = mp?.tier ? TIER_INFO[mp.tier] : null
                  return (
                    <span
                      key={m}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-mono ${
                        tierInfo
                          ? `${tierInfo.bgColor} ${tierInfo.color}`
                          : 'bg-bg-tertiary text-text-secondary'
                      }`}
                    >
                      {mp?.recommended && <Star size={9} className="fill-current" />}
                      {m}
                      <button
                        type="button"
                        onClick={() => toggleModel(m)}
                        className="opacity-60 hover:opacity-100 transition"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  )
                })}
                {selectedModels.size === 0 && (
                  <span className="text-xs text-text-muted">未选择模型</span>
                )}
              </div>
            )}

            {/* Full model picker (expanded) */}
            {showModelPicker && preset && (
              <div className="border border-bg-tertiary rounded-xl p-3 mb-2 bg-bg-primary">
                {/* Search & Filter */}
                {activeModels.length > 3 && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="relative flex-1">
                      <Search
                        size={13}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                      />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition"
                      />
                    </div>
                    <select
                      value={filterTier}
                      onChange={(e) => setFilterTier(e.target.value as ModelTier | 'all')}
                      className="px-2 py-1.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-[11px] text-text-primary focus:outline-none"
                    >
                      <option value="all">全部级别</option>
                      {TIER_ORDER.map((tier) => (
                        <option key={tier} value={tier}>
                          {TIER_INFO[tier].label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filterCap}
                      onChange={(e) => setFilterCap(e.target.value as ModelCapability | 'all')}
                      className="px-2 py-1.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-[11px] text-text-primary focus:outline-none"
                    >
                      <option value="all">全部能力</option>
                      {KEY_CAPABILITIES.map((cap) => (
                        <option key={cap} value={cap}>
                          {CAPABILITY_LABELS[cap]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Batch actions */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      const rec = activeModels.filter((m) => m.recommended)
                      setSelectedModels(new Set(rec.map((m) => m.id)))
                    }}
                    className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                  >
                    <Star size={10} />
                    推荐
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedModels(new Set(filteredModels.map((m) => m.id)))}
                    className="text-[11px] text-primary hover:underline"
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedModels(new Set())}
                    className="text-[11px] text-text-muted hover:text-text-primary"
                  >
                    清空
                  </button>
                </div>

                {/* Model list */}
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {TIER_ORDER.filter((tier) => grouped[tier] && grouped[tier]!.length > 0).map(
                    (tier) => {
                      const tierModels = grouped[tier]!
                      const tierInfo = TIER_INFO[tier]
                      return (
                        <div key={tier}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tierInfo.bgColor} ${tierInfo.color}`}
                            >
                              {tierInfo.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                            {tierModels.map((model) => (
                              <ModelSelectCard
                                key={model.id}
                                model={model}
                                selected={selectedModels.has(model.id)}
                                onToggle={() => toggleModel(model.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    },
                  )}
                </div>
              </div>
            )}

            {/* Manual model input */}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCustomModel()
                  }
                }}
                placeholder="手动添加模型 ID..."
                className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition font-mono"
              />
              <button
                type="button"
                onClick={handleAddCustomModel}
                className="px-3 py-2 rounded-lg bg-bg-tertiary text-text-secondary text-xs hover:bg-bg-tertiary/80 transition"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-bg-tertiary">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition"
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 disabled:opacity-50 transition active:scale-95"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {t('common.save', '保存')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shared Components ───────────────────────────────────────────────────────

/** Model selection card used in both Add and Edit views */
function ModelSelectCard({
  model,
  selected,
  isDefault,
  onToggle,
  onSetDefault,
}: {
  model: ModelPreset
  selected: boolean
  isDefault?: boolean
  onToggle: () => void
  onSetDefault?: () => void
}) {
  return (
    <div
      className={`relative flex flex-col p-3 rounded-xl text-left transition cursor-pointer ${
        selected
          ? isDefault
            ? 'bg-danger/10 border-2 border-danger/30 ring-1 ring-danger/10'
            : 'bg-danger/8 border-2 border-danger/25'
          : 'bg-bg-secondary border-2 border-bg-tertiary hover:border-bg-tertiary/80'
      }`}
      onClick={onToggle}
      onKeyDown={(e) => e.key === 'Enter' && onToggle()}
      role="button"
      tabIndex={0}
    >
      {/* Top row: checkbox + name + default badge */}
      <div className="flex items-center gap-2">
        <div
          className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
            selected ? 'border-danger bg-danger' : 'border-text-muted/30'
          }`}
        >
          {selected && <Check size={10} className="text-white" />}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {model.recommended && (
            <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />
          )}
          <span className="text-xs font-mono font-medium text-text-primary truncate">
            {model.id}
          </span>
        </div>
        {isDefault && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-danger/15 text-danger font-medium flex items-center gap-0.5 shrink-0">
            <Crown size={8} /> 默认
          </span>
        )}
      </div>

      {/* Description */}
      {model.name !== model.id && (
        <p className="text-[11px] text-text-muted mt-1 ml-6 truncate">{model.name}</p>
      )}
      <p className="text-[10px] text-text-muted mt-0.5 ml-6 line-clamp-2">{model.description}</p>

      {/* Specs row */}
      <div className="flex items-center gap-2.5 mt-2 ml-6 flex-wrap">
        <span className="text-[10px] text-text-muted" title="上下文窗口">
          <Ruler size={9} className="inline -mt-0.5" /> {formatContextWindow(model.contextWindow)}
        </span>
        <span className="text-[10px] text-text-muted" title="最大输出">
          <Type size={9} className="inline -mt-0.5" /> {formatMaxTokens(model.maxTokens)}
        </span>
        {model.inputPricePer1M !== undefined && (
          <span className="text-[10px] text-text-muted" title="输入/输出 /1M tokens">
            <Coins size={9} className="inline -mt-0.5" /> {formatPrice(model.inputPricePer1M)}/
            {formatPrice(model.outputPricePer1M)}
          </span>
        )}
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1 mt-1.5 ml-6">
        {model.capabilities
          .filter((c) => c !== 'chat' && c !== 'streaming')
          .slice(0, 4)
          .map((cap) => (
            <span
              key={cap}
              className="text-[9px] px-1 py-0.5 rounded bg-bg-tertiary text-text-muted"
            >
              {CAPABILITY_LABELS[cap]}
            </span>
          ))}
        {model.capabilities.filter((c) => c !== 'chat' && c !== 'streaming').length > 4 && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-bg-tertiary text-text-muted">
            +{model.capabilities.filter((c) => c !== 'chat' && c !== 'streaming').length - 4}
          </span>
        )}
      </div>

      {/* Set as default button */}
      {selected && !isDefault && onSetDefault && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSetDefault()
          }}
          className="absolute top-2 right-2 text-[9px] text-text-muted hover:text-danger transition px-1.5 py-0.5 rounded hover:bg-danger/10"
          title="设为默认模型"
        >
          设为默认
        </button>
      )}
    </div>
  )
}

/** Wizard progress indicator */
function WizardProgress({ current }: { current: WizardStep }) {
  const steps: { key: WizardStep; label: string }[] = [
    { key: 'pick', label: '选择' },
    { key: 'configure', label: '配置' },
    { key: 'models', label: '模型' },
    { key: 'review', label: '确认' },
  ]
  const currentIdx = steps.findIndex((s) => s.key === current)

  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((step, i) => {
        const isDone = i < currentIdx
        const isCurrent = i === currentIdx
        return (
          <div key={step.key} className="flex items-center">
            {i > 0 && (
              <div className={`w-6 h-px mx-1 ${isDone ? 'bg-danger' : 'bg-bg-tertiary'}`} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isDone
                    ? 'bg-danger text-white'
                    : isCurrent
                      ? 'bg-danger/20 text-danger border border-danger/30'
                      : 'bg-bg-tertiary text-text-muted'
                }`}
              >
                {isDone ? <Check size={10} /> : i + 1}
              </div>
              <span
                className={`text-[11px] font-medium ${
                  isCurrent ? 'text-text-primary' : 'text-text-muted'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Provider header with brand */
function ProviderHeader({ preset }: { preset: ProviderPreset }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <ProviderLogo preset={preset} size="lg" />
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-text-primary">{preset.name}</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
            {CATEGORY_LABELS[preset.category]}
          </span>
          {preset.openaiCompatible && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
              OpenAI 兼容
            </span>
          )}
        </div>
        <p className="text-sm text-text-muted">{preset.description}</p>
      </div>
    </div>
  )
}

/** Review item row */
function ReviewItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-muted w-20 shrink-0 text-right">{label}</span>
      <span className={`text-sm text-text-primary truncate ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

/** Collapsible advanced settings section */
function AdvancedSection({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-bg-tertiary">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition py-3 w-full"
      >
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        高级设置
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  )
}
