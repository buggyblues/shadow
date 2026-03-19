/**
 * Model Configuration Page
 *
 * Add, edit, and manage AI model providers (OpenAI, Claude, etc.).
 * Supports provider presets, custom endpoints, API key management,
 * and model lists using the real OpenClaw schema (Record<string, ModelProviderEntry>).
 */

import {
  Brain,
  ChevronLeft,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModelDefinition, ModelProviderEntry } from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'

// ─── Provider Presets ────────────────────────────────────────────────────────

interface ProviderPreset {
  id: string
  name: string
  baseUrl: string
  models: string[]
  description: string
}

interface ProviderQuickGuide {
  docsUrl: string
  codingPlan: string[]
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1',
      'o1-mini',
      'o3-mini',
    ],
    description: 'GPT-4、GPT-3.5 和 O 系列模型',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3.5-sonnet-20241022',
      'claude-3.5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    description: 'Claude 系列 AI 模型',
  },
  {
    id: 'google',
    name: 'Google AI',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ],
    description: 'Gemini 系列 AI 模型',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    description: 'DeepSeek AI 模型',
  },
  {
    id: 'zhipu',
    name: 'Zhipu AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4', 'glm-4-flash', 'glm-4-air'],
    description: 'GLM 系列模型',
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
    description: 'Kimi AI 模型',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.1', 'llama3', 'codellama', 'mistral', 'mixtral', 'phi3', 'qwen2'],
    description: '通过 Ollama 运行本地模型',
  },
  {
    id: 'bailian',
    name: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      'qwen-max',
      'qwen-plus',
      'qwen-turbo',
      'qwen-long',
      'qwq-plus',
      'qwen3-max',
      'qwen3.5-plus',
      'qwen3.5-flash',
      'qwen3-coder-plus',
    ],
    description: '通义千问系列 (Qwen)',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'MiniMax-M2.5-highspeed'],
    description: 'MiniMax 多模态大模型',
  },
  {
    id: 'tencent-hunyuan',
    name: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    models: [
      'hunyuan-turbos-latest',
      'hunyuan-t1-latest',
      'hunyuan-a13b',
      'hunyuan-lite',
      'hunyuan-vision',
    ],
    description: '腾讯混元大模型',
  },
  {
    id: 'custom',
    name: 'Custom',
    baseUrl: '',
    models: [],
    description: '自定义 OpenAI 兼容端点',
  },
]

const PROVIDER_QUICK_GUIDES: Record<string, ProviderQuickGuide> = {
  openai: {
    docsUrl: 'https://platform.openai.com/docs/overview',
    codingPlan: [
      '在 OpenAI 控制台创建 API Key（建议为 Shadow 单独创建项目）。',
      '选择默认模型（推荐 gpt-4o / gpt-4o-mini），并为高成本模型设置预算告警。',
      '将 Key 粘贴到本页 API Key，点击保存即可一键完成接入。',
    ],
  },
  anthropic: {
    docsUrl: 'https://docs.anthropic.com/',
    codingPlan: [
      '在 Anthropic Console 开通 API 并生成密钥。',
      '按业务场景选择 Claude Sonnet / Opus 作为主模型。',
      '填入 API Key 并保存，即可完成一键配置。',
    ],
  },
  google: {
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    codingPlan: [
      '在 Google AI Studio 创建 Gemini API Key。',
      '推荐优先配置 gemini-2.5-flash，复杂任务再切换 gemini-2.5-pro。',
      '写入 API Key 后保存，立即可用。',
    ],
  },
  deepseek: {
    docsUrl: 'https://platform.deepseek.com/docs',
    codingPlan: [
      '在 DeepSeek 平台创建 API Key。',
      '编码任务推荐 deepseek-coder；通用对话推荐 deepseek-chat。',
      '保存后即可一键完成配置。',
    ],
  },
  zhipu: {
    docsUrl: 'https://open.bigmodel.cn/dev/howuse/introduction',
    codingPlan: [
      '在智谱开放平台创建密钥并启用模型权限。',
      '推荐先用 glm-4-flash 验证，再切换 glm-4-plus。',
      '粘贴 Key 并保存即可接入。',
    ],
  },
  moonshot: {
    docsUrl: 'https://platform.moonshot.cn/docs',
    codingPlan: [
      '在 Moonshot 控制台创建 API Key。',
      '按上下文需求选择 8k/32k/128k 版本。',
      '保存后即完成一键配置。',
    ],
  },
  ollama: {
    docsUrl: 'https://github.com/ollama/ollama',
    codingPlan: [
      '本机启动 Ollama 服务（默认 http://localhost:11434/v1）。',
      '先拉取一个模型，例如 llama3.1 或 qwen2。',
      '无需 API Key，保存即可使用本地模型。',
    ],
  },
  bailian: {
    docsUrl:
      'https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope',
    codingPlan: [
      '在阿里云百炼控制台创建 API Key。',
      '推荐先用 qwen-plus 验证，再切换 qwen-max。',
      '填入 API Key 保存即可使用。',
    ],
  },
  minimax: {
    docsUrl: 'https://platform.minimaxi.com/docs',
    codingPlan: [
      '在 MiniMax 开放平台创建 API Key。',
      '推荐先用 MiniMax-M2.7 模型。',
      '保存即可使用。',
    ],
  },
  'tencent-hunyuan': {
    docsUrl: 'https://cloud.tencent.com/document/product/1729/111007',
    codingPlan: [
      '在腾讯云混元控制台创建 API Key。',
      '推荐先用 hunyuan-turbos-latest 模型。',
      '保存即可使用。',
    ],
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function modelDefsToIds(defs: ModelDefinition[]): string[] {
  return defs.map((d) => d.id)
}

function idsToModelDefs(ids: string[]): ModelDefinition[] {
  return ids.map((id) => ({ id }))
}

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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-text-primary mb-1">
              {t('openclaw.models.title', '模型提供商')}
            </h2>
            <p className="text-sm text-text-muted">
              {t('openclaw.models.subtitle', '配置 AI 模型提供商和 API 密钥')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView('add')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 transition"
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
  const [showKey, setShowKey] = useState(false)
  const preset = PROVIDER_PRESETS.find((p) => p.id === id)

  const maskedKey = entry.apiKey
    ? `${entry.apiKey.substring(0, 8)}${'•'.repeat(24)}${entry.apiKey.substring(entry.apiKey.length - 4)}`
    : ''

  const modelIds = modelDefsToIds(entry.models ?? [])

  return (
    <div className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4 group">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0">
          <Brain size={18} className="text-text-muted" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">{preset?.name ?? id}</p>
            <span className="text-xs text-text-muted font-mono">{id}</span>
          </div>

          {entry.apiKey && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-text-muted font-mono">
                {showKey ? entry.apiKey : maskedKey}
              </span>
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="text-text-muted hover:text-text-primary transition"
              >
                {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          )}

          <p className="text-xs text-text-muted mt-1 truncate">{entry.baseUrl}</p>

          {modelIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {modelIds.slice(0, 6).map((mid) => (
                <span
                  key={mid}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted font-mono"
                >
                  {mid}
                </span>
              ))}
              {modelIds.length > 6 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">
                  +{modelIds.length - 6} 更多
                </span>
              )}
            </div>
          )}
        </div>

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
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Brain size={48} className="text-text-muted mb-4" />
      <h3 className="text-base font-medium text-text-primary mb-1">
        {t('openclaw.models.noProviders', '暂无模型提供商')}
      </h3>
      <p className="text-sm text-text-muted max-w-sm mb-4">
        {t('openclaw.models.noProvidersDesc', '添加模型提供商，为 AI 智能体提供语言模型支持。')}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 transition"
      >
        <Plus size={14} />
        {t('openclaw.models.addProvider', '添加提供商')}
      </button>
    </div>
  )
}

// ─── Add Provider View ───────────────────────────────────────────────────────

function AddProviderView({ onBack, onSave }: { onBack: () => void; onSave: () => void }) {
  const { t } = useTranslation()
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [providerId, setProviderId] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [customModel, setCustomModel] = useState('')
  const [saving, setSaving] = useState(false)
  const selectedGuide = selectedPreset ? PROVIDER_QUICK_GUIDES[selectedPreset] : undefined

  const selectPreset = (preset: ProviderPreset) => {
    setSelectedPreset(preset.id)
    setProviderId(preset.id)
    setBaseUrl(preset.baseUrl)
    setModels([...preset.models])
  }

  const handleAddModel = () => {
    const m = customModel.trim()
    if (m && !models.includes(m)) {
      setModels([...models, m])
      setCustomModel('')
    }
  }

  const handleSave = async () => {
    const id = providerId.trim()
    if (!id) return
    setSaving(true)
    try {
      await openClawApi.saveModel(id, {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        models: idsToModelDefs(models),
      })
      onSave()
    } finally {
      setSaving(false)
    }
  }

  if (!selectedPreset) {
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
          <h2 className="text-lg font-bold text-text-primary mb-1">
            {t('openclaw.models.selectProvider', '选择提供商')}
          </h2>
          <p className="text-sm text-text-muted mb-6">
            {t('openclaw.models.selectProviderDesc', '选择预设或配置自定义 OpenAI 兼容端点')}
          </p>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
          >
            {PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectPreset(preset)}
                className="bg-bg-secondary rounded-xl border border-bg-tertiary p-4 text-left hover:border-danger/30 transition group"
              >
                <Brain size={20} className="text-text-muted group-hover:text-danger transition" />
                <p className="text-sm font-semibold text-text-primary mt-2 group-hover:text-danger transition">
                  {preset.name}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{preset.description}</p>
                <p className="text-[10px] text-text-muted mt-1">{preset.models.length} 个模型</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <ProviderForm
      title={t('openclaw.models.addProvider', '添加提供商')}
      providerId={providerId}
      setProviderId={setProviderId}
      idEditable
      baseUrl={baseUrl}
      setBaseUrl={setBaseUrl}
      apiKey={apiKey}
      setApiKey={setApiKey}
      models={models}
      customModel={customModel}
      setCustomModel={setCustomModel}
      onAddModel={handleAddModel}
      onRemoveModel={(m) => setModels(models.filter((x) => x !== m))}
      saving={saving}
      onSave={handleSave}
      onBack={() => setSelectedPreset(null)}
      quickGuide={selectedGuide}
    />
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
  const [baseUrl, setBaseUrl] = useState(entry.baseUrl)
  const [apiKey, setApiKey] = useState(entry.apiKey ?? '')
  const [models, setModels] = useState<string[]>(modelDefsToIds(entry.models ?? []))
  const [customModel, setCustomModel] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAddModel = () => {
    const m = customModel.trim()
    if (m && !models.includes(m)) {
      setModels([...models, m])
      setCustomModel('')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await openClawApi.saveModel(id, {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        models: idsToModelDefs(models),
      })
      onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProviderForm
      title={t('openclaw.models.editProvider', '编辑提供商')}
      providerId={id}
      setProviderId={() => {}}
      idEditable={false}
      baseUrl={baseUrl}
      setBaseUrl={setBaseUrl}
      apiKey={apiKey}
      setApiKey={setApiKey}
      models={models}
      customModel={customModel}
      setCustomModel={setCustomModel}
      onAddModel={handleAddModel}
      onRemoveModel={(m) => setModels(models.filter((x) => x !== m))}
      saving={saving}
      onSave={handleSave}
      onBack={onBack}
    />
  )
}

// ─── Provider Form ───────────────────────────────────────────────────────────

function ProviderForm({
  title,
  providerId,
  setProviderId,
  idEditable,
  baseUrl,
  setBaseUrl,
  apiKey,
  setApiKey,
  models,
  customModel,
  setCustomModel,
  onAddModel,
  onRemoveModel,
  saving,
  onSave,
  onBack,
  quickGuide,
}: {
  title: string
  providerId: string
  setProviderId: (v: string) => void
  idEditable: boolean
  baseUrl: string
  setBaseUrl: (v: string) => void
  apiKey: string
  setApiKey: (v: string) => void
  models: string[]
  customModel: string
  setCustomModel: (v: string) => void
  onAddModel: () => void
  onRemoveModel: (m: string) => void
  saving: boolean
  onSave: () => void
  onBack: () => void
  quickGuide?: ProviderQuickGuide
}) {
  const { t } = useTranslation()
  const [showApiKey, setShowApiKey] = useState(false)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 pt-5 pb-6 max-w-2xl">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition mb-4"
        >
          <ChevronLeft size={16} />
          {t('common.back', '返回')}
        </button>

        <h2 className="text-lg font-bold text-text-primary mb-6">{title}</h2>

        <div className="space-y-4">
          {quickGuide && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-text-primary">
                  {t('openclaw.models.quickGuide', '一键配置教程（CodingPlan）')}
                </p>
                <a
                  href={quickGuide.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  官方文档
                  <ExternalLink size={12} />
                </a>
              </div>
              <ol className="list-decimal pl-4 space-y-1">
                {quickGuide.codingPlan.map((step) => (
                  <li key={step} className="text-xs text-text-secondary leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Provider ID */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              {t('openclaw.models.providerId', '提供商 ID')}
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
              disabled={!idEditable}
              placeholder="e.g. openai"
              className="w-full px-3 py-2.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition font-mono disabled:opacity-60"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              {t('openclaw.models.baseUrl', 'API 基础地址')}
            </label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2.5 rounded-lg bg-bg-secondary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition font-mono"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              {t('openclaw.models.apiKey', 'API 密钥')}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2.5 pr-10 rounded-lg bg-bg-secondary border border-bg-tertiary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition"
              >
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Models */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              {t('openclaw.models.modelList', '模型列表')}
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {models.map((model) => (
                <span
                  key={model}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-bg-tertiary text-text-secondary font-mono group"
                >
                  {model}
                  <button
                    type="button"
                    onClick={() => onRemoveModel(model)}
                    className="text-text-muted hover:text-red-500 transition"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onAddModel()
                  }
                }}
                placeholder={t('openclaw.models.addModel', '添加模型名称...')}
                className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-bg-tertiary text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/50 transition font-mono"
              />
              <button
                type="button"
                onClick={onAddModel}
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
            onClick={onSave}
            disabled={saving || !providerId.trim()}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 disabled:opacity-50 transition"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {t('common.save', '保存')}
          </button>
        </div>
      </div>
    </div>
  )
}
