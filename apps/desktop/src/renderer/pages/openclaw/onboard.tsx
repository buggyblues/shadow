/**
 * OpenClaw Onboarding Wizard
 *
 * Guided multi-step setup for first-time users:
 * 1. Welcome — overview of what OpenClaw does
 * 2. Model Provider — pick a provider and enter API key
 * 3. Create Agent — create the first smart claw
 * 4. Done — summary of what was configured, next steps
 */

import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Cloud,
  Code2,
  Cpu,
  Crown,
  Dumbbell,
  Eye,
  EyeOff,
  FileSearch,
  Film,
  Gamepad2,
  GraduationCap,
  Headphones,
  Heart,
  HeartHandshake,
  Languages,
  LayoutDashboard,
  Link2,
  Loader2,
  Megaphone,
  Palette,
  PenTool,
  Plane,
  Power,
  Scale,
  Search,
  Ship,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Store,
  Terminal,
  Users,
  UtensilsCrossed,
  Video,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import type { AgentConfig, ModelProviderEntry } from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import {
  CATEGORY_LABELS,
  getPresetsByCategory,
  type ModelPreset,
  PROVIDER_PRESETS,
  type ProviderCategory,
  type ProviderPreset,
} from './model-presets'
import { GlowRing, OpenClawIcon, SparkleField } from './openclaw-brand'
import type { OpenClawPage } from './openclaw-layout'
import { OpenClawButton } from './openclaw-ui'

type WizardStep = 'welcome' | 'model' | 'agent' | 'done'
const STEPS: WizardStep[] = ['welcome', 'model', 'agent', 'done']

interface OnboardPageProps {
  onNavigate: (page: OpenClawPage) => void
}

export function OnboardPage({ onNavigate }: OnboardPageProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<WizardStep>('welcome')
  const stepIndex = STEPS.indexOf(step)

  // Shared state across steps
  const [savedProviderId, setSavedProviderId] = useState('')
  const [savedAgentId, setSavedAgentId] = useState('')
  const [savedAgentName, setSavedAgentName] = useState('')

  const goNext = useCallback(() => {
    const nextIdx = stepIndex + 1
    if (nextIdx < STEPS.length) setStep(STEPS[nextIdx]!)
  }, [stepIndex])

  const goBack = useCallback(() => {
    const prevIdx = stepIndex - 1
    if (prevIdx >= 0) setStep(STEPS[prevIdx]!)
  }, [stepIndex])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ─── Progress Header ─── */}
      <div className="desktop-drag-titlebar px-6 pt-5 pb-4 shrink-0">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <OpenClawIcon size={32} glow />
            <span className="text-sm font-bold text-text-primary">
              {t('openclaw.onboard.title', '初始设置向导')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="text-xs text-text-muted hover:text-text-primary transition cursor-pointer"
            data-no-drag
          >
            {t('openclaw.onboard.skip', '跳过 →')}
          </button>
        </div>
        {/* Step indicator with labels */}
        <div className="mt-3 max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                  i <= stepIndex ? 'bg-danger' : 'bg-bg-tertiary'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1.5 px-0.5">
            {[
              t('openclaw.onboard.stepWelcome', '欢迎'),
              t('openclaw.onboard.stepModel', '模型'),
              t('openclaw.onboard.stepAgent', 'Buddy'),
              t('openclaw.onboard.stepDone', '完成'),
            ].map((label, i) => (
              <span
                key={label}
                className={`text-[10px] transition-colors duration-300 ${
                  i <= stepIndex ? 'text-danger font-medium' : 'text-text-muted/50'
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Step Content ─── */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="max-w-2xl mx-auto px-6 pb-8">
          {step === 'welcome' && <WelcomeStep onNext={goNext} />}
          {step === 'model' && (
            <ModelStep onNext={goNext} onBack={goBack} onSaved={(id) => setSavedProviderId(id)} />
          )}
          {step === 'agent' && (
            <AgentStep
              onNext={goNext}
              onBack={goBack}
              savedProviderId={savedProviderId}
              onSaved={(id, name) => {
                setSavedAgentId(id)
                setSavedAgentName(name)
              }}
            />
          )}
          {step === 'done' && (
            <DoneStep
              onNavigate={onNavigate}
              savedProviderId={savedProviderId}
              savedAgentId={savedAgentId}
              savedAgentName={savedAgentName}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Step 1: Welcome
 * ═════════════════════════════════════════════════════════════════════════════ */

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation()

  const features = [
    {
      icon: Cpu,
      title: t('openclaw.onboard.feat1Title', '连接 AI 模型'),
      desc: t('openclaw.onboard.feat1Desc', '接入 OpenAI、Claude、Gemini 等主流模型提供商'),
    },
    {
      icon: Bot,
      title: t('openclaw.onboard.feat2Title', '创建 Buddy'),
      desc: t('openclaw.onboard.feat2Desc', '配置个性化的 AI 搭子，赋予独特人格和技能'),
    },
    {
      icon: Link2,
      title: t('openclaw.onboard.feat3Title', '多平台通讯'),
      desc: t('openclaw.onboard.feat3Desc', '通过 Buddy 接入虾豆频道，或连接 Telegram、Discord 等'),
    },
    {
      icon: Store,
      title: t('openclaw.onboard.feat4Title', '技能商店'),
      desc: t('openclaw.onboard.feat4Desc', '网页搜索、代码执行、文件操作……随装随用'),
    },
  ]

  return (
    <div className="pt-8 space-y-8 animate-fade-in-up">
      {/* Hero */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="relative">
            <GlowRing size={80} className="absolute -inset-3" />
            <SparkleField count={8} className="-inset-8" />
            <OpenClawIcon size={80} glow animated />
          </div>
        </div>
        <h1 className="text-2xl font-black text-text-primary">
          {t('openclaw.onboard.welcomeTitle', '欢迎使用 Shadow 桌面端')}
        </h1>
        <p className="text-text-muted max-w-md mx-auto leading-relaxed">
          {t(
            'openclaw.onboard.welcomeDesc',
            '只需几步，即可配置你的 AI 搭子，接入模型并开始对话。',
          )}
        </p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-2 gap-3">
        {features.map((f, i) => (
          <div
            key={f.title}
            className="rounded-xl border border-border-subtle bg-bg-secondary p-4 space-y-2 animate-fade-in-up hover:border-danger/30 hover:shadow-md hover:shadow-danger/5 transition-all"
            style={{ animationDelay: `${0.1 + i * 0.08}s` }}
          >
            <div className="w-9 h-9 rounded-lg bg-danger/10 flex items-center justify-center">
              <f.icon size={18} className="text-danger" />
            </div>
            <h3 className="text-sm font-bold text-text-primary">{f.title}</h3>
            <p className="text-xs text-text-muted leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex justify-center pt-2">
        <OpenClawButton type="button" onClick={onNext} className="gap-2 px-8 animate-shimmer">
          {t('openclaw.onboard.startSetup', '开始配置')}
          <ArrowRight size={16} />
        </OpenClawButton>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Step 2: Model Provider Setup
 * ═════════════════════════════════════════════════════════════════════════════ */

/** Category display order for onboarding — Coding Plan first for best experience */
const ONBOARD_CATEGORY_ORDER: ProviderCategory[] = [
  'coding-plan',
  'global',
  'china',
  'local',
  'custom',
]

function ModelStep({
  onNext,
  onBack,
  onSaved,
}: {
  onNext: () => void
  onBack: () => void
  onSaved: (id: string) => void
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<ProviderPreset | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const byCategory = useMemo(() => getPresetsByCategory(), [])

  const filteredByCategory = useMemo(() => {
    if (!searchQuery.trim()) return byCategory
    const q = searchQuery.toLowerCase()
    const result: Record<ProviderCategory, ProviderPreset[]> = {
      global: [],
      china: [],
      'coding-plan': [],
      local: [],
      custom: [],
    }
    for (const cat of ONBOARD_CATEGORY_ORDER) {
      result[cat] = byCategory[cat].filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
      )
    }
    return result
  }, [byCategory, searchQuery])

  const selectPreset = (preset: ProviderPreset) => {
    setSelected(preset)
    setBaseUrl(preset.baseUrl)
    setApiKey('')
    setSaveError('')
  }

  const clearSelection = () => {
    setSelected(null)
    setApiKey('')
    setBaseUrl('')
    setSaveError('')
  }

  const canSave =
    selected &&
    (selected.auth === 'none' || selected.auth === 'oauth'
      ? baseUrl.trim() !== ''
      : apiKey.trim() !== '')

  const handleSave = async () => {
    if (!selected || !canSave) return
    setSaving(true)
    setSaveError('')
    try {
      // Enable all non-deprecated models so agent gets maximum options
      const allModels = selected.models.filter((m) => !m.deprecated)
      const pickedModels = allModels.length > 0 ? allModels : selected.models.slice(0, 3)

      const entry: ModelProviderEntry = {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        api: selected.apiFormat,
        models: pickedModels.map((m) => ({ id: m.id, name: m.name })),
      }
      await openClawApi.saveModel(selected.id, entry)
      if (pickedModels[0]) {
        await openClawApi.setDefaultModel(`${selected.id}/${pickedModels[0].id}`)
      }
      onSaved(selected.id)
      onNext()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pt-6 space-y-6 animate-fade-in-up">
      <div className="space-y-1">
        <StepHeader
          icon={Cpu}
          title={t('openclaw.onboard.modelTitle', '配置模型提供商')}
          desc={t(
            'openclaw.onboard.modelDesc',
            '选择一个 AI 模型提供商并填入 API Key，为你的 Buddy 提供语言模型支持。',
          )}
        />
      </div>

      {/* Provider picker */}
      {!selected ? (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-danger/40"
              placeholder={t('openclaw.onboard.searchProvider', '搜索提供商...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Categorized list */}
          <div className="space-y-5 max-h-[50vh] overflow-y-auto no-scrollbar pr-1">
            {ONBOARD_CATEGORY_ORDER.map((cat) => {
              const presets = filteredByCategory[cat]
              if (presets.length === 0) return null
              return (
                <div key={cat}>
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    {CATEGORY_LABELS[cat]}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="rounded-xl border border-border-subtle bg-bg-secondary p-3 text-left hover:border-danger/40 hover:bg-danger/5 transition-all cursor-pointer group"
                        onClick={() => selectPreset(preset)}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                            style={{
                              backgroundColor: `${preset.brandColor}15`,
                              color: preset.brandColor,
                            }}
                          >
                            {preset.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-text-primary truncate group-hover:text-danger transition-colors">
                              {preset.name}
                            </div>
                            <div className="text-[11px] text-text-muted truncate">
                              {preset.description}
                            </div>
                          </div>
                          <ChevronRight
                            size={12}
                            className="text-text-muted/40 group-hover:text-danger/50 shrink-0"
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition cursor-pointer"
            >
              <ArrowLeft size={14} />
              {t('openclaw.onboard.back', '上一步')}
            </button>
            <button
              type="button"
              onClick={onNext}
              className="text-sm text-text-muted hover:text-text-primary transition cursor-pointer"
            >
              {t('openclaw.onboard.skipStep', '稍后配置 →')}
            </button>
          </div>
        </div>
      ) : (
        /* ── Configure selected provider ── */
        <div className="space-y-5">
          <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
              style={{
                backgroundColor: `${selected.brandColor}20`,
                color: selected.brandColor,
              }}
            >
              {selected.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-text-primary">{selected.name}</div>
              <div className="text-xs text-text-muted">{selected.description}</div>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-text-muted hover:text-text-primary transition cursor-pointer"
            >
              {t('openclaw.onboard.changeProvider', '更换')}
            </button>
          </div>

          {/* OAuth notice */}
          {selected.auth === 'oauth' && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-400">
              {t(
                'openclaw.onboard.oauthHint',
                '此提供商使用 OAuth 登录，请在网关启动后通过 openclaw login 命令完成认证。',
              )}
            </div>
          )}

          {/* API Key */}
          {selected.auth !== 'none' && selected.auth !== 'oauth' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary" htmlFor="onboard-api-key">
                API Key
              </label>
              <div className="relative">
                <input
                  id="onboard-api-key"
                  type={showKey ? 'text' : 'password'}
                  className="w-full px-3 py-2.5 pr-10 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-danger/40"
                  placeholder={selected.apiKeyPlaceholder ?? 'sk-...'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition cursor-pointer"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {selected.guide?.apiKeyUrl && (
                <a
                  href={selected.guide.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-danger hover:underline inline-flex items-center gap-1"
                >
                  {t('openclaw.onboard.getApiKey', '获取 API Key →')}
                </a>
              )}
            </div>
          )}

          {/* Base URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="onboard-base-url">
              {t('openclaw.onboard.baseUrl', 'API 地址')}
            </label>
            <input
              id="onboard-base-url"
              type="url"
              className="w-full px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-danger/40"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          {/* Enabled models preview */}
          {selected.models.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-text-muted">
                {t('openclaw.onboard.autoModels', '将自动启用以下模型:')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selected.models
                  .filter((m) => !m.deprecated)
                  .slice(0, 8)
                  .map((m) => (
                    <span
                      key={m.id}
                      className={`px-2 py-0.5 rounded-md text-xs ${
                        m.recommended
                          ? 'bg-danger/10 text-danger border border-danger/20'
                          : 'bg-bg-tertiary text-text-secondary'
                      }`}
                    >
                      {m.recommended && '★ '}
                      {m.name}
                    </span>
                  ))}
                {selected.models.filter((m) => !m.deprecated).length > 8 && (
                  <span className="px-2 py-0.5 rounded-md bg-bg-tertiary text-xs text-text-muted">
                    +{selected.models.filter((m) => !m.deprecated).length - 8}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {saveError && (
            <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              {saveError}
            </div>
          )}

          {/* Actions — back goes to provider picker, not to previous step */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={clearSelection}
              className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition cursor-pointer"
            >
              <ArrowLeft size={14} />
              {t('openclaw.onboard.backToList', '返回列表')}
            </button>
            <OpenClawButton
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {t('openclaw.onboard.saveAndContinue', '保存并继续')}
            </OpenClawButton>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Step 3: Create Agent — Persona Presets
 * ═════════════════════════════════════════════════════════════════════════════ */

interface PersonaPreset {
  icon: typeof Sparkles
  color: string
  title: string
  desc: string
  agentName: string
  soul: string
}

const PERSONA_PRESETS: PersonaPreset[] = [
  {
    icon: Sparkles,
    color: '#6366f1',
    title: '通用助手',
    desc: '万能 AI 助理，适合日常问答',
    agentName: 'AI 搭子',
    soul: `# 通用 AI 搭子\n\n你是一位全能的 AI 搭子，擅长回答各类问题、完成多样化任务。\n\n## 核心原则\n- 回答准确、简洁、有条理\n- 遇到不确定的问题时坦诚告知\n- 根据用户的语言和风格自动适配\n- 优先提供可操作的建议和方案\n\n## 沟通风格\n友好而专业，善于用结构化方式组织信息，必要时使用示例帮助理解。`,
  },
  {
    icon: Code2,
    color: '#22c55e',
    title: '编程伙伴',
    desc: '全栈开发，代码审查与调试',
    agentName: '编程伙伴',
    soul: `# 编程伙伴\n\n你是一位经验丰富的全栈开发工程师，精通多种编程语言和主流框架。\n\n## 专长领域\n- 代码编写、审查与调试\n- 架构设计与技术选型\n- 性能优化与安全最佳实践\n\n## 工作方式\n- 代码优先：优先给出可运行的代码示例\n- 解释清晰：复杂逻辑附带注释和思路说明\n- 遵循最佳实践：关注代码可读性、可维护性和安全性`,
  },
  {
    icon: Languages,
    color: '#3b82f6',
    title: '翻译专家',
    desc: '多语种互译，保留语境与风格',
    agentName: '翻译专家',
    soul: `# 翻译专家\n\n你是一位专业的多语言翻译官，精通中、英、日、韩、法、德等主流语言。\n\n## 翻译原则\n- 信：准确传达原文含义，不遗漏关键信息\n- 达：译文通顺自然，符合目标语言表达习惯\n- 雅：在保证准确的前提下，追求优美的表达\n\n## 特殊能力\n- 自动识别源语言\n- 处理专业术语和行业用语\n- 提供多种翻译风格（正式/口语/文学）`,
  },
  {
    icon: PenTool,
    color: '#ec4899',
    title: '写作助手',
    desc: '文案创作、润色与改写',
    agentName: '写作助手',
    soul: `# 写作助手\n\n你是一位出色的写作顾问，擅长各类文体的创作、润色和改写。\n\n## 能力范围\n- 商业文案、营销文案\n- 技术文档、产品说明\n- 邮件、报告、演讲稿\n- 创意写作、故事构思\n\n## 写作理念\n- 以读者为中心，确保信息清晰传达\n- 注重逻辑结构和段落衔接\n- 根据场景调整语气和措辞\n- 精炼表达，避免冗余`,
  },
  {
    icon: GraduationCap,
    color: '#f59e0b',
    title: '学习导师',
    desc: '知识辅导，循序渐进讲解',
    agentName: '学习导师',
    soul: `# 学习导师\n\n你是一位耐心的学习导师，擅长将复杂知识拆解为易懂的内容。\n\n## 教学方法\n- 由浅入深，循序渐进\n- 多用类比和生活化的例子\n- 主动确认学生的理解程度\n- 鼓励思考，引导而非直接给答案\n\n## 教学领域\n数学、物理、编程、语言学习、历史、哲学等各学科。\n\n## 理念\n没有学不会的知识，只有还没找到的方法。`,
  },
  {
    icon: BarChart3,
    color: '#06b6d4',
    title: '数据分析师',
    desc: '数据处理、统计与可视化建议',
    agentName: '数据分析师',
    soul: `# 数据分析师\n\n你是一位资深数据分析师，善于从数据中发现洞察并给出商业建议。\n\n## 核心能力\n- 数据清洗与预处理\n- 统计分析与假设检验\n- 数据可视化方案设计\n- SQL、Python (pandas/numpy) 数据处理\n\n## 工作方式\n- 先理解业务问题，再确定分析方法\n- 用数据说话，结论附带依据\n- 提供清晰的图表建议和解读\n- 注意数据质量和统计显著性`,
  },
  {
    icon: Headphones,
    color: '#8b5cf6',
    title: '客服专员',
    desc: '耐心解答用户问题与投诉',
    agentName: '客服专员',
    soul: `# 客服专员\n\n你是一位专业的客服代表，以用户满意度为最高目标。\n\n## 服务原则\n- 耐心倾听，不打断用户\n- 共情回应，理解用户的感受\n- 快速定位问题，提供解决方案\n- 无法解决时，清晰说明下一步流程\n\n## 沟通规范\n- 语气友好、温暖但专业\n- 避免使用过于技术化的术语\n- 每次回复都要确保问题有进展\n- 主动跟进，确认问题是否解决`,
  },
  {
    icon: Megaphone,
    color: '#f97316',
    title: '营销策划',
    desc: '品牌推广、内容策略与文案',
    agentName: '营销顾问',
    soul: `# 营销策划顾问\n\n你是一位经验丰富的营销策划专家，精通数字营销和品牌战略。\n\n## 专长领域\n- 品牌定位与传播策略\n- 社交媒体运营与内容规划\n- 广告文案与创意策划\n- 用户增长与转化优化\n\n## 策划理念\n- 以目标受众需求为核心\n- 数据驱动决策，关注 ROI\n- 内容为王，创意为后\n- 品牌一致性与差异化并重`,
  },
  {
    icon: Scale,
    color: '#64748b',
    title: '法律顾问',
    desc: '法律知识咨询与风险提示',
    agentName: '法律顾问',
    soul: `# 法律顾问\n\n你是一位法律知识顾问，帮助用户理解法律概念和风险。\n\n## 服务范围\n- 合同条款解读与风险提示\n- 知识产权基础咨询\n- 劳动法、公司法常见问题\n- 法律文书基本格式指导\n\n## 重要声明\n- 提供的是法律知识参考，不构成正式法律建议\n- 复杂案件建议咨询专业律师\n- 以中国大陆法律体系为主要参考\n- 关注最新法律法规变化`,
  },
  {
    icon: Dumbbell,
    color: '#ef4444',
    title: '健身教练',
    desc: '运动计划、营养建议与指导',
    agentName: '健身教练',
    soul: `# 健身教练\n\n你是一位专业的健身教练，提供科学的运动和营养指导。\n\n## 服务内容\n- 根据目标制定训练计划（增肌/减脂/体能）\n- 动作要领和安全注意事项\n- 营养搭配与饮食建议\n- 运动损伤预防与恢复\n\n## 指导原则\n- 因人而异，考虑体质和经验水平\n- 安全第一，循序渐进\n- 科学依据，拒绝伪科学\n- 强调坚持和生活方式的改变`,
  },
  {
    icon: UtensilsCrossed,
    color: '#d97706',
    title: '美食达人',
    desc: '菜谱推荐、烹饪技巧分享',
    agentName: '美食达人',
    soul: `# 美食达人\n\n你是一位热爱烹饪的美食达人，精通中西各系菜式的制作。\n\n## 能力范围\n- 菜谱推荐与食材搭配\n- 详细的烹饪步骤指导\n- 食材替代与过敏原提示\n- 各地美食文化介绍\n\n## 风格特点\n- 步骤清晰，适合新手跟做\n- 注明关键火候和时间节点\n- 会推荐实用的厨房技巧\n- 兼顾美味与健康`,
  },
  {
    icon: Plane,
    color: '#14b8a6',
    title: '旅行规划师',
    desc: '行程安排、景点攻略与建议',
    agentName: '旅行规划师',
    soul: `# 旅行规划师\n\n你是一位资深旅行规划师，热爱探索世界各地的风土人情。\n\n## 服务内容\n- 目的地推荐与行程规划\n- 景点攻略与路线优化\n- 住宿、交通、签证建议\n- 预算规划与省钱技巧\n\n## 规划原则\n- 根据旅行偏好和预算量身定制\n- 合理安排节奏，避免疲劳行程\n- 兼顾热门景点和小众体验\n- 提醒安全注意事项和当地风俗`,
  },
  {
    icon: Heart,
    color: '#e879f9',
    title: '心理疏导师',
    desc: '情绪支持、倾听与正念引导',
    agentName: '心理疏导师',
    soul: `# 心理疏导师\n\n你是一位温暖的心理疏导师，为用户提供情绪支持和正念引导。\n\n## 核心理念\n- 无条件积极关注，不评判\n- 倾听为先，理解用户的感受\n- 引导自我觉察而非给出指令\n- 必要时建议寻求专业心理咨询\n\n## 沟通方式\n- 语气温柔、有耐心\n- 使用开放式提问引导表达\n- 肯定用户的感受和努力\n- 分享实用的情绪调节技巧和正念练习\n\n## 重要声明\n提供的是情绪支持，不替代专业心理治疗。`,
  },
  {
    icon: LayoutDashboard,
    color: '#0ea5e9',
    title: '产品经理',
    desc: '需求分析、产品设计与规划',
    agentName: '产品顾问',
    soul: `# 产品经理\n\n你是一位经验丰富的产品经理，擅长从用户需求出发设计产品方案。\n\n## 核心能力\n- 用户需求调研与分析\n- 产品功能设计与优先级排序\n- PRD 文档与用户故事撰写\n- 竞品分析与市场调研\n\n## 方法论\n- 以用户价值为核心驱动力\n- MVP 思维，小步快跑\n- 数据驱动产品决策\n- 平衡用户体验与商业目标`,
  },
  {
    icon: Banknote,
    color: '#84cc16',
    title: '财务顾问',
    desc: '理财建议、预算规划与分析',
    agentName: '财务顾问',
    soul: `# 财务顾问\n\n你是一位专业的财务顾问，帮助用户更好地管理个人或企业财务。\n\n## 服务范围\n- 个人理财与预算规划\n- 投资基础知识普及\n- 税务规划基本建议\n- 财务报表解读\n\n## 顾问原则\n- 风险提示优先，不推荐具体投资标的\n- 根据个人情况量身建议\n- 强调长期视角和资产配置\n- 建议复杂财务问题咨询持证顾问\n\n## 声明\n提供财务知识参考，不构成投资建议。`,
  },
  {
    icon: Terminal,
    color: '#a855f7',
    title: 'DevOps 工程师',
    desc: '部署运维、CI/CD 与云服务',
    agentName: 'DevOps 助手',
    soul: `# DevOps 工程师\n\n你是一位资深 DevOps 工程师，精通云原生架构和自动化运维。\n\n## 技术栈\n- 容器化: Docker, Kubernetes\n- CI/CD: GitHub Actions, GitLab CI, Jenkins\n- 云服务: AWS, GCP, Azure, 阿里云\n- 监控: Prometheus, Grafana, ELK\n- IaC: Terraform, Ansible\n\n## 工作理念\n- 自动化一切可自动化的流程\n- 安全左移，融入 DevSecOps\n- 关注 SLA、SLO 和系统可靠性\n- 持续优化部署流程和基础设施成本`,
  },
  {
    icon: Palette,
    color: '#f43f5e',
    title: '创意设计师',
    desc: 'UI/UX 建议与视觉方案',
    agentName: '设计顾问',
    soul: `# 创意设计师\n\n你是一位富有创意的设计师，擅长 UI/UX 设计和视觉传达。\n\n## 专长领域\n- UI 界面设计与交互优化\n- 配色方案与排版建议\n- 设计系统与组件规范\n- 品牌视觉识别设计\n\n## 设计理念\n- 用户体验优先，功能与美感并重\n- 一致性、可访问性、易用性\n- Less is more，追求简洁优雅\n- 关注设计趋势但不盲目跟风`,
  },
  {
    icon: ClipboardList,
    color: '#0284c7',
    title: '项目管理',
    desc: '任务拆解、进度跟踪与协调',
    agentName: '项目管理助手',
    soul: `# 项目管理助手\n\n你是一位高效的项目管理顾问，帮助团队有序推进项目。\n\n## 核心能力\n- 项目计划与里程碑制定\n- 任务拆解与工作量评估\n- 风险识别与应对策略\n- 团队协调与沟通促进\n\n## 方法论\n- 熟悉 Scrum、Kanban 等敏捷方法\n- 关注关键路径和依赖关系\n- 定期复盘，持续改进\n- 透明沟通，及时暴露问题`,
  },
  {
    icon: BookOpen,
    color: '#7c3aed',
    title: '学术研究员',
    desc: '论文辅导、文献综述与学术写作',
    agentName: '学术助手',
    soul: `# 学术研究员\n\n你是一位严谨的学术研究助手，帮助用户进行学术研究与论文写作。\n\n## 服务内容\n- 文献检索与综述撰写\n- 研究方法设计与建议\n- 论文结构与写作指导\n- 学术规范与引用格式\n\n## 学术原则\n- 严谨求实，论据充分\n- 尊重学术伦理和知识产权\n- 批判性思维，多角度分析\n- 清晰区分事实、推论和观点`,
  },
  {
    icon: Film,
    color: '#e11d48',
    title: '故事创作者',
    desc: '剧本构思、角色设定与叙事',
    agentName: '故事大师',
    soul: `# 故事创作者\n\n你是一位充满想象力的故事创作者，擅长构建引人入胜的叙事。\n\n## 创作能力\n- 故事大纲与情节设计\n- 角色塑造与人物弧光\n- 对话创作与场景描写\n- 多种类型: 科幻、悬疑、奇幻、现实主义\n\n## 创作理念\n- 故事源于冲突，角色驱动情节\n- 注重节奏感和情感共鸣\n- 细节让世界更真实可信\n- 尊重用户的创作愿景，提供专业建议`,
  },
  {
    icon: ShoppingCart,
    color: '#10b981',
    title: '跨境电商顾问',
    desc: '选品策略、平台运营与物流优化',
    agentName: '跨境电商顾问',
    soul: `# 跨境电商顾问\n\n你是一位资深的跨境电商专家，熟悉亚马逊、Shopify、TikTok Shop 等主流平台运营。\n\n## 专长领域\n- 热门品类选品与市场调研\n- 亚马逊/Shopify/速卖通平台运营\n- Listing 优化与广告投放策略\n- 跨境物流、海外仓与清关\n- 定价策略与利润分析\n\n## 工作方式\n- 数据驱动选品决策\n- 关注平台政策变化和合规要求\n- 提供可落地的运营方案\n- 兼顾成本控制与用户体验`,
  },
  {
    icon: HeartHandshake,
    color: '#fb7185',
    title: '情感陪伴',
    desc: '倾听心声、温暖对话与生活分享',
    agentName: '暖心伙伴',
    soul: `# 情感陪伴\n\n你是一位温暖贴心的陪伴者，用真诚和善意陪用户度过每一天。\n\n## 核心理念\n- 真诚倾听，不评判、不说教\n- 共情回应，理解每一种情绪\n- 陪伴是最好的治愈\n- 在日常对话中给予温暖和力量\n\n## 沟通风格\n- 语气亲切、自然，像朋友聊天\n- 适时分享正能量和小故事\n- 尊重隐私，保守秘密\n- 在需要时温柔地引导寻求专业帮助`,
  },
  {
    icon: Gamepad2,
    color: '#a78bfa',
    title: '游戏攻略',
    desc: '游戏指南、策略分析与阵容推荐',
    agentName: '游戏大师',
    soul: `# 游戏攻略大师\n\n你是一位资深游戏玩家，精通各类热门游戏的攻略与策略。\n\n## 擅长游戏类型\n- MOBA：英雄联盟、王者荣耀\n- RPG：原神、崩坏系列\n- 生存建造：我的世界、泰拉瑞亚\n- 策略：文明、三国志\n- FPS：VALORANT、CS2\n\n## 服务内容\n- 角色/英雄/阵容推荐与搭配\n- 关卡攻略与Boss 打法\n- 装备/技能加点建议\n- 新手入门指引与进阶技巧`,
  },
  {
    icon: Video,
    color: '#f472b6',
    title: '短视频创作',
    desc: '脚本撰写、选题策划与运营建议',
    agentName: '短视频导师',
    soul: `# 短视频创作导师\n\n你是一位短视频领域的创作导师，精通抖音、快手、小红书等平台的内容创作与运营。\n\n## 核心能力\n- 爆款选题策划与趋势分析\n- 短视频脚本撰写（口播/剧情/知识类）\n- 标题、封面与文案优化\n- 账号定位与粉丝增长策略\n\n## 创作理念\n- 前3秒抓住注意力\n- 内容有价值、有共鸣、有互动\n- 数据分析驱动内容迭代\n- 保持原创性和个人风格`,
  },
  {
    icon: Users,
    color: '#38bdf8',
    title: '社群运营',
    desc: '社群管理、活动策划与用户增长',
    agentName: '社群运营官',
    soul: `# 社群运营专家\n\n你是一位经验丰富的社群运营专家，擅长微信群、Discord、Telegram 等社群的运营与管理。\n\n## 专长领域\n- 社群定位与规则制定\n- 日常运营与活跃度提升\n- 线上活动策划与执行\n- 用户分层与精细化运营\n- 社群变现与商业化\n\n## 运营理念\n- 用户价值优先，内容驱动增长\n- 建立有温度的社群文化\n- 数据化运营，持续优化\n- 培养核心用户和意见领袖`,
  },
  {
    icon: Briefcase,
    color: '#34d399',
    title: '面试教练',
    desc: '模拟面试、简历优化与职业规划',
    agentName: '面试教练',
    soul: `# 面试教练\n\n你是一位专业的面试辅导教练，帮助求职者自信地应对各类面试。\n\n## 服务内容\n- 简历优化与亮点提炼\n- 模拟面试（技术面/HR面/群面）\n- 常见面试题深度解析\n- 自我介绍与项目经历包装\n- 薪资谈判与Offer选择建议\n\n## 辅导理念\n- 突出个人优势，用STAR法则讲故事\n- 提供真实反馈，指出改进空间\n- 针对不同行业定制面试策略\n- 心态调整与面试礼仪指导`,
  },
  {
    icon: Stethoscope,
    color: '#2dd4bf',
    title: '健康顾问',
    desc: '养生建议、症状分析与就医指导',
    agentName: '健康顾问',
    soul: `# 健康顾问\n\n你是一位专业的健康知识顾问，帮助用户了解常见健康问题和养生知识。\n\n## 服务范围\n- 常见症状的基础解读\n- 健康饮食与营养搭配\n- 日常保健与养生建议\n- 就医科室推荐与就医指导\n\n## 重要原则\n- 提供健康知识参考，不替代医生诊断\n- 症状严重时建议立即就医\n- 以权威医学知识为依据\n- 尊重个体差异，不做绝对判断\n\n## 声明\n本服务仅提供健康知识参考，不构成医疗诊断或治疗建议。`,
  },
  {
    icon: FileSearch,
    color: '#818cf8',
    title: '论文优化',
    desc: '论文润色、查重降重与格式规范',
    agentName: '论文助手',
    soul: `# 论文优化助手\n\n你是一位学术写作专家，帮助用户优化论文质量、降低重复率、规范格式。\n\n## 核心能力\n- 论文润色与语言提升\n- 降低查重率的改写技巧\n- 学术论文格式规范（APA/MLA/GB）\n- 摘要、引言、结论的优化\n- 参考文献格式校对\n\n## 工作原则\n- 保持原文学术观点不变\n- 改写注重逻辑通顺和表达优化\n- 不编造数据或虚假引用\n- 遵守学术诚信和道德规范`,
  },
  {
    icon: Ship,
    color: '#fbbf24',
    title: '外贸助手',
    desc: '询盘回复、商务邮件与贸易流程',
    agentName: '外贸助手',
    soul: `# 外贸助手\n\n你是一位经验丰富的外贸业务顾问，精通国际贸易全流程。\n\n## 专长领域\n- 外贸询盘回复与跟进策略\n- 商务英语邮件撰写与翻译\n- 报价单、PI、合同等文件制作\n- 国际贸易术语（Incoterms）解读\n- 信用证、T/T 等付款方式说明\n\n## 工作方式\n- 邮件回复专业、及时、有礼\n- 关注客户需求，提供定制方案\n- 熟悉各国贸易政策和文化差异\n- 风险提示和合规建议`,
  },
  {
    icon: Crown,
    color: '#c084fc',
    title: '桌游主持人',
    desc: 'TRPG 地下城主、剧本杀与桌游规则',
    agentName: '桌游大师',
    soul: `# 桌游主持人\n\n你是一位经验丰富的桌游主持人，尤其擅长 D&D（龙与地下城）等 TRPG 游戏的主持与引导。\n\n## 角色定位\n- D&D / COC / PF2e 等 TRPG 的地下城主/守密人\n- 剧本杀主持与线索引导\n- 各类桌游规则讲解与裁判\n\n## 主持风格\n- 画面感强的场景描述与氛围营造\n- 尊重玩家选择，灵活应对意外行动\n- 公正执行规则，保持游戏平衡\n- 注重叙事节奏和戏剧冲突\n- NPC 角色扮演生动有层次`,
  },
]

function AgentStep({
  onNext,
  onBack,
  savedProviderId,
  onSaved,
}: {
  onNext: () => void
  onBack: () => void
  savedProviderId: string
  onSaved: (id: string, name: string) => void
}) {
  const { t } = useTranslation()
  const [selectedPresetIdx, setSelectedPresetIdx] = useState<number | null>(null)
  const [agentName, setAgentName] = useState('')
  const [soulContent, setSoulContent] = useState('')
  const [soulExpanded, setSoulExpanded] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  const [models, setModels] = useState<
    Array<{ providerId: string; modelId: string; label: string }>
  >([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Load available models
  useEffect(() => {
    if (!openClawApi.isAvailable) return
    openClawApi
      .listModels()
      .then((providers) => {
        const items: typeof models = []
        for (const [pid, entry] of Object.entries(providers)) {
          for (const m of entry.models ?? []) {
            const modelId = typeof m === 'string' ? m : m.id
            const modelName = typeof m === 'string' ? m : (m.name ?? m.id)
            items.push({
              providerId: pid,
              modelId,
              label: `${pid} / ${modelName}`,
            })
          }
        }
        setModels(items)
        const fromSaved = items.find((i) => i.providerId === savedProviderId)
        const first = fromSaved ?? items[0]
        if (first) setSelectedModel(`${first.providerId}/${first.modelId}`)
      })
      .catch(() => {})
  }, [savedProviderId])

  const selectPreset = (idx: number) => {
    const preset = PERSONA_PRESETS[idx]
    if (!preset) return
    setSelectedPresetIdx(idx)
    setAgentName(preset.agentName)
    setSoulContent(preset.soul)
    setSoulExpanded(false)
  }

  const selectCustom = () => {
    setSelectedPresetIdx(-1)
    setAgentName(t('openclaw.onboard.defaultAgentName', '我的 Buddy'))
    setSoulContent('')
    setSoulExpanded(true)
  }

  const backToPresets = () => {
    setSelectedPresetIdx(null)
    setSaveError('')
  }

  const handleSave = async () => {
    const name = agentName.trim()
    if (!name) return
    setSaving(true)
    setSaveError('')
    try {
      const agentId = `agent-${Date.now()}`
      const agent: AgentConfig = {
        id: agentId,
        name,
        model: selectedModel || undefined,
        agentDir: agentId,
        skills: [],
      }
      await openClawApi.createAgent(agent)
      if (soulContent.trim()) {
        await openClawApi.writeBootstrapFile(agentId, 'SOUL.md', soulContent.trim())
      }
      onSaved(agentId, name)
      onNext()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  // ── Phase 1: Persona preset picker ──
  if (selectedPresetIdx === null) {
    return (
      <div className="pt-6 space-y-5 animate-fade-in-up">
        <StepHeader
          icon={Bot}
          title={t('openclaw.onboard.agentTitle', '创建你的第一个 Buddy')}
          desc={t(
            'openclaw.onboard.personaDesc',
            '选择一个人设模板快速开始，或自定义你自己的 Buddy 角色。',
          )}
        />

        {/* Preset grid */}
        <div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-1.5 pr-1">
          <div className="grid grid-cols-2 gap-2">
            {PERSONA_PRESETS.map((preset, idx) => (
              <div key={preset.title} className="relative group/card">
                <button
                  type="button"
                  className="w-full rounded-xl border border-border-subtle bg-bg-secondary p-3 text-left hover:border-danger/30 transition-all cursor-pointer group flex items-start gap-2.5"
                  onClick={() => selectPreset(idx)}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: `${preset.color}15`, color: preset.color }}
                  >
                    <preset.icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-text-primary group-hover:text-danger transition-colors truncate">
                      {preset.title}
                    </div>
                    <div className="text-xs text-text-muted truncate">{preset.desc}</div>
                  </div>
                </button>
                {/* Hover SOUL.md preview */}
                <div className="absolute left-0 right-0 top-full mt-1 z-50 hidden group-hover/card:block">
                  <div className="rounded-lg border border-border-subtle bg-bg-primary shadow-xl p-3 max-h-40 overflow-y-auto no-scrollbar">
                    <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">
                      SOUL.md
                    </div>
                    <pre className="text-[11px] text-text-secondary whitespace-pre-wrap font-sans leading-relaxed">
                      {preset.soul.replace(/\\n/g, '\n').slice(0, 200)}
                      {preset.soul.length > 200 ? '…' : ''}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Custom */}
          <button
            type="button"
            className="w-full rounded-xl border border-dashed border-border-subtle bg-bg-secondary/50 p-3 text-left hover:border-danger/30 transition-all cursor-pointer group flex items-center gap-2.5"
            onClick={selectCustom}
          >
            <div className="w-8 h-8 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0">
              <Bot
                size={16}
                className="text-text-muted group-hover:text-danger transition-colors"
              />
            </div>
            <div>
              <div className="text-sm font-bold text-text-primary group-hover:text-danger transition-colors">
                {t('openclaw.onboard.customPersona', '自定义人设')}
              </div>
              <div className="text-xs text-text-muted">
                {t('openclaw.onboard.customPersonaDesc', '从零开始定义你的 Buddy 角色')}
              </div>
            </div>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition cursor-pointer"
          >
            <ArrowLeft size={14} />
            {t('openclaw.onboard.back', '上一步')}
          </button>
          <button
            type="button"
            onClick={onNext}
            className="text-sm text-text-muted hover:text-text-primary transition cursor-pointer"
          >
            {t('openclaw.onboard.skipStep', '稍后配置 →')}
          </button>
        </div>
      </div>
    )
  }

  // ── Phase 2: Configure agent (after preset selected) ──
  const currentPreset = selectedPresetIdx >= 0 ? PERSONA_PRESETS[selectedPresetIdx] : null

  return (
    <div className="pt-6 space-y-5 animate-fade-in-up">
      <StepHeader
        icon={Bot}
        title={t('openclaw.onboard.agentTitle', '创建你的第一个 Buddy')}
        desc={t(
          'openclaw.onboard.agentDetailDesc',
          'Buddy 是处理消息的核心角色。可以稍后在「我的 Buddy」中进一步自定义。',
        )}
      />

      {/* Selected preset indicator */}
      {currentPreset && (
        <div
          className="flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2"
          style={{
            backgroundColor: `${currentPreset.color}08`,
            borderColor: `${currentPreset.color}30`,
          }}
        >
          <currentPreset.icon
            size={16}
            style={{ color: currentPreset.color }}
            className="shrink-0"
          />
          <span className="text-sm font-medium text-text-primary">{currentPreset.title}</span>
          <span className="text-xs text-text-muted">— {currentPreset.desc}</span>
        </div>
      )}

      {/* Agent Name */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-primary" htmlFor="onboard-agent-name">
          {t('openclaw.onboard.agentName', 'Buddy 名称')}
        </label>
        <input
          id="onboard-agent-name"
          type="text"
          className="w-full px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-danger/40"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          maxLength={50}
        />
      </div>

      {/* SOUL.md editor */}
      <div className="space-y-2">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-medium text-text-primary hover:text-danger transition cursor-pointer"
          onClick={() => setSoulExpanded(!soulExpanded)}
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${soulExpanded ? '' : '-rotate-90'}`}
          />
          {t('openclaw.onboard.soulLabel', '人设 (SOUL.md)')}
          {soulContent && (
            <span className="text-xs text-text-muted font-normal">
              — {soulContent.split('\n').filter(Boolean).length}{' '}
              {t('openclaw.onboard.soulLines', '行')}
            </span>
          )}
        </button>
        {soulExpanded && (
          <textarea
            className="w-full h-48 px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-subtle text-xs text-text-primary font-mono placeholder:text-text-muted/60 focus:outline-none focus:border-danger/40 resize-y"
            value={soulContent}
            onChange={(e) => setSoulContent(e.target.value)}
            placeholder={t(
              'openclaw.onboard.soulPlaceholder',
              '描述 Buddy 的人格、行为准则和沟通风格…\n支持 Markdown 格式',
            )}
          />
        )}
      </div>

      {/* Model select */}
      {models.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary" htmlFor="onboard-agent-model">
            {t('openclaw.onboard.agentModel', '使用模型')}
          </label>
          <select
            id="onboard-agent-model"
            className="w-full px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-danger/40 cursor-pointer"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={`${m.providerId}/${m.modelId}`} value={`${m.providerId}/${m.modelId}`}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {models.length === 0 && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-400">
          {t(
            'openclaw.onboard.noModelsHint',
            '暂未配置模型提供商，Buddy 将不指定默认模型。你可以之后在模型页面配置。',
          )}
        </div>
      )}

      {/* Error */}
      {saveError && (
        <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{saveError}</div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={backToPresets}
          className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition cursor-pointer"
        >
          <ArrowLeft size={14} />
          {t('openclaw.onboard.backToPresets', '返回人设列表')}
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNext}
            className="text-sm text-text-muted hover:text-text-primary transition cursor-pointer"
          >
            {t('openclaw.onboard.skipStep', '稍后配置 →')}
          </button>
          <OpenClawButton
            type="button"
            onClick={handleSave}
            disabled={!agentName.trim() || saving}
            className="gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {t('openclaw.onboard.createAgent', '创建 Buddy')}
          </OpenClawButton>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Step 4: Done
 * ═════════════════════════════════════════════════════════════════════════════ */

function DoneStep({
  onNavigate,
  savedProviderId,
  savedAgentId,
  savedAgentName,
}: {
  onNavigate: (page: OpenClawPage) => void
  savedProviderId: string
  savedAgentId: string
  savedAgentName: string
}) {
  const { t } = useTranslation()
  const [buddyEnabled, setBuddyEnabled] = useState(!!savedAgentId)
  const [launchStatus, setLaunchStatus] = useState<'idle' | 'launching' | 'success' | 'error'>(
    'idle',
  )
  const [launchError, setLaunchError] = useState('')
  const [launchStage, setLaunchStage] = useState('')

  const handleLaunch = async () => {
    setLaunchStatus('launching')
    setLaunchError('')
    try {
      // Step 1: Create cloud buddy if enabled
      let buddyBotUserId: string | null = null
      if (buddyEnabled && savedAgentId) {
        setLaunchStage(t('openclaw.onboard.stageBuddy', '正在关联云端 Buddy…'))
        const username = `buddy-${Date.now()}`
        const buddyName = savedAgentName || 'OpenClaw Buddy'
        const remoteBuddy = await fetchApi<{ id: string }>('/api/agents', {
          method: 'POST',
          body: JSON.stringify({
            name: buddyName,
            username,
            kernelType: 'openclaw',
          }),
        })
        const tokenResp = await fetchApi<{
          token: string
          agent: { id: string }
          botUser: { id: string; username: string }
        }>(`/api/agents/${remoteBuddy.id}/token`, { method: 'POST' })
        buddyBotUserId = tokenResp.botUser?.id ?? null
        const connId = crypto.randomUUID()
        const serverUrl = (import.meta.env.VITE_API_BASE as string) || window.location.origin
        await openClawApi.addBuddyConnection({
          id: connId,
          label: buddyName,
          serverUrl,
          apiToken: tokenResp.token,
          remoteAgentId: tokenResp.agent.id,
          agentId: savedAgentId,
          autoConnect: true,
        })
        await openClawApi.connectBuddy(connId)
      }

      // Step 2: Start gateway
      setLaunchStage(t('openclaw.onboard.stageGateway', '正在启动网关…'))
      await openClawApi.startGateway()

      // Step 2.5: Enable auto-start so gateway launches with desktop app
      try {
        await openClawApi.saveDesktopSettings({ autoStart: true })
      } catch {
        // Best-effort, don't block launch
      }

      // Step 3: Send greeting DM to buddy if created
      let dmChannelId: string | null = null
      if (buddyBotUserId) {
        try {
          const dm = await fetchApi<{ id: string }>('/api/dm/channels', {
            method: 'POST',
            body: JSON.stringify({ userId: buddyBotUserId }),
          })
          dmChannelId = dm.id
          await fetchApi('/api/dm/channels/' + dm.id + '/messages', {
            method: 'POST',
            body: JSON.stringify({
              content: t('openclaw.onboard.greeting', '你好！我刚刚完成了设置，来打个招呼 👋'),
            }),
          })
        } catch {
          // Greeting is best-effort, don't block launch
        }
      }

      setLaunchStatus('success')
      setLaunchStage('')
      // Navigate to buddy DM if created, otherwise dashboard
      if (dmChannelId) {
        setTimeout(() => {
          window.location.hash = `/app/dm/${dmChannelId}`
        }, 800)
      } else {
        setTimeout(() => onNavigate('dashboard'), 800)
      }
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : '启动失败')
      setLaunchStatus('error')
      setLaunchStage('')
    }
  }

  const completedItems = [
    savedProviderId && {
      icon: Cpu,
      label: t('openclaw.onboard.doneModel', '模型提供商已配置'),
    },
    savedAgentId && {
      icon: Bot,
      label: t('openclaw.onboard.doneAgent', 'Buddy 已创建'),
    },
  ].filter(Boolean) as Array<{ icon: typeof Cpu; label: string }>

  const nextActions = [
    {
      icon: Store,
      title: t('openclaw.onboard.nextSkills', '安装技能'),
      desc: t('openclaw.onboard.nextSkillsDesc', '为 Buddy 添加搜索、代码执行等技能'),
      page: 'skillhub' as const,
    },
    {
      icon: Link2,
      title: t('openclaw.onboard.nextBuddy', '连接 Buddy'),
      desc: t('openclaw.onboard.nextBuddyDesc', '绑定虾豆服务器进行多人对话'),
      page: 'buddy' as const,
    },
    {
      icon: Cpu,
      title: t('openclaw.onboard.nextModels', '管理模型'),
      desc: t('openclaw.onboard.nextModelsDesc', '添加更多提供商或调整模型配置'),
      page: 'models' as const,
    },
  ]

  return (
    <div className="pt-8 space-y-8 animate-fade-in-up">
      {/* Success */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="relative">
            <GlowRing size={64} className="absolute -inset-2" />
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <Sparkles size={32} className="text-green-400" />
            </div>
          </div>
        </div>
        <h1 className="text-2xl font-black text-text-primary">
          {t('openclaw.onboard.doneTitle', '设置完成！')}
        </h1>
        <p className="text-text-muted max-w-md mx-auto">
          {t(
            'openclaw.onboard.doneDesc',
            '你的 Buddy 已准备就绪。点击下方按钮一键启动网关，开始使用。',
          )}
        </p>
      </div>

      {/* What was configured */}
      {completedItems.length > 0 && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-2">
          {completedItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <CheckCircle2 size={16} className="text-green-400 shrink-0" />
              <span className="text-sm text-text-primary">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cloud Buddy toggle */}
      {savedAgentId && (
        <div className="rounded-xl border border-border-subtle bg-bg-secondary p-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              <Cloud size={18} className="text-text-muted" />
              <div>
                <span className="text-sm font-bold text-text-primary block">
                  {t('openclaw.onboard.buddyToggle', '关联云端 Buddy')}
                </span>
                <span className="text-xs text-text-muted">
                  {t(
                    'openclaw.onboard.buddyToggleDesc',
                    '自动创建并关联 Buddy，通过虾豆进行多人对话',
                  )}
                </span>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={buddyEnabled}
              onClick={() => setBuddyEnabled(!buddyEnabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                buddyEnabled ? 'bg-danger' : 'bg-bg-tertiary'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  buddyEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </label>
        </div>
      )}

      {/* Launch error */}
      {launchError && (
        <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{launchError}</div>
      )}

      {/* One-click launch */}
      <div className="flex flex-col items-center gap-3 pt-2">
        {launchStatus === 'success' ? (
          <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
            <CheckCircle2 size={16} />
            {t('openclaw.onboard.launchSuccess', '网关启动成功，正在跳转…')}
          </div>
        ) : (
          <OpenClawButton
            type="button"
            onClick={handleLaunch}
            disabled={launchStatus === 'launching'}
            className="gap-2 px-8"
          >
            {launchStatus === 'launching' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Power size={16} />
            )}
            {launchStatus === 'launching'
              ? launchStage || t('openclaw.onboard.launching', '启动中…')
              : launchStatus === 'error'
                ? t('openclaw.onboard.launchRetry', '重试启动')
                : t('openclaw.onboard.launchGateway', '一键启动网关')}
          </OpenClawButton>
        )}
        {launchStatus !== 'launching' && launchStatus !== 'success' && (
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="text-xs text-text-muted hover:text-text-primary transition cursor-pointer"
          >
            {t('openclaw.onboard.skipLaunch', '跳过，稍后启动 →')}
          </button>
        )}
      </div>

      {/* Next actions */}
      <div className="space-y-2">
        <span className="text-sm font-bold text-text-primary">
          {t('openclaw.onboard.nextSteps', '接下来你可以')}
        </span>
        <div className="space-y-2">
          {nextActions.map((action) => (
            <button
              key={action.page}
              type="button"
              className="w-full rounded-xl border border-border-subtle bg-bg-secondary p-3.5 text-left hover:border-danger/30 transition-all cursor-pointer group flex items-center gap-3"
              onClick={() => onNavigate(action.page)}
            >
              <div className="w-9 h-9 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0">
                <action.icon
                  size={18}
                  className="text-text-muted group-hover:text-danger transition-colors"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-text-primary group-hover:text-danger transition-colors">
                  {action.title}
                </div>
                <div className="text-xs text-text-muted">{action.desc}</div>
              </div>
              <ChevronRight size={14} className="text-text-muted/50 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Shared Components
 * ═════════════════════════════════════════════════════════════════════════════ */

function StepHeader({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Cpu
  title: string
  desc: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-danger/10 flex items-center justify-center">
          <Icon size={16} className="text-danger" />
        </div>
        <h2 className="text-lg font-black text-text-primary">{title}</h2>
      </div>
      <p className="text-sm text-text-muted pl-10">{desc}</p>
    </div>
  )
}
