/**
 * Desktop Onboarding Page
 *
 * 完整的 Onboarding 流程：
 * 1. 欢迎
 * 2. 配置模型
 * 3. 创建 Buddy
 * 4. 绑定 Buddy
 * 5. 完成
 *
 * 参考原有的 onboard.tsx 实现
 */

import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@web/stores/auth.store'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  GraduationCap,
  Headphones,
  Heart,
  Languages,
  LayoutDashboard,
  Link2,
  Loader2,
  Megaphone,
  MessageCircle,
  PenTool,
  Plane,
  Power,
  Rocket,
  Scale,
  Server,
  Sparkles,
  Terminal,
  User,
  UserPlus,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import type { AgentConfig, BuddyConnection, ModelProviderEntry } from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import {
  CATEGORY_LABELS,
  getPresetsByCategory,
  PROVIDER_PRESETS,
  type ProviderCategory,
  type ProviderPreset,
} from './model-presets'
import { GlowRing, OpenClawIcon, SparkleField } from './openclaw-brand'
import type { OpenClawPage } from './openclaw-layout'
import { OpenClawButton } from './openclaw-ui'

type OnboardingStep = 'welcome' | 'auth' | 'model' | 'agent' | 'buddy' | 'done'

// 时间线步骤
const STEPS: OnboardingStep[] = ['welcome', 'auth', 'model', 'agent', 'buddy', 'done']

// Buddy 预设模板
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
    title: '通用搭子',
    desc: '万能 AI 搭子，适合日常问答',
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
    soul: `# 学习导师\n\n你是一位耐心的学习导师，擅长将复杂知识拆解为易懂的内容。\n\n## 教学方法\n- 由浅入深，循序渐进\n- 多用类比和生活化的例子\n- 主动确认学生的理解程度\n- 鼓励思考，引导而非直接给答案\n\n## 教学领域\n数学、物理、编程、语言学习、历史、哲学等各学科。`,
  },
  {
    icon: User,
    color: '#8b5cf6',
    title: '自定义',
    desc: '创建你自己的 AI 搭子',
    agentName: '',
    soul: '',
  },
]

interface DesktopOnboardPageProps {
  onNavigate?: (page: OpenClawPage) => void
}

export function DesktopOnboardPage({ onNavigate }: DesktopOnboardPageProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')

  // State
  const [savedProviderId, setSavedProviderId] = useState('')
  const [savedAgentId, setSavedAgentId] = useState('')
  const [savedAgentName, setSavedAgentName] = useState('')
  const [savedServerId, setSavedServerId] = useState('')

  const setUser = useAuthStore((s) => s.setUser)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  // Check if already authenticated
  useEffect(() => {
    if (isAuthenticated && step === 'auth') {
      setStep('model')
    }
  }, [isAuthenticated, step])

  const stepIndex = STEPS.indexOf(step)

  const goNext = useCallback(() => {
    const nextIdx = stepIndex + 1
    if (nextIdx < STEPS.length) setStep(STEPS[nextIdx]!)
  }, [stepIndex])

  const goBack = useCallback(() => {
    const prevIdx = stepIndex - 1
    if (prevIdx >= 0) setStep(STEPS[prevIdx]!)
  }, [stepIndex])

  const handleComplete = async () => {
    // Start gateway
    try {
      await openClawApi.startGateway()
      await openClawApi.saveDesktopSettings({ autoStart: true })
    } catch {
      // Best effort
    }

    // Notify main process
    if ('desktopAPI' in window) {
      const api = (window as Record<string, unknown>).desktopAPI as {
        completeOnboarding?: (result: { completed: boolean }) => void
      }
      api.completeOnboarding?.({
        completed: true,
      })
    }

    // Navigate to main app
    onNavigate?.('dashboard')
  }

  const handleSkip = () => {
    if ('desktopAPI' in window) {
      const api = (window as Record<string, unknown>).desktopAPI as {
        completeOnboarding?: (result: { completed: boolean }) => void
      }
      api.completeOnboarding?.({ completed: false })
    }
  }

  return (
    <div className="h-screen flex flex-col bg-bg-primary overflow-hidden">
      {/* Top padding for window controls */}
      <div className="h-12 shrink-0" />

      {/* Progress bar */}
      {step !== 'welcome' && step !== 'done' && (
        <div className="px-6">
          <div className="flex items-center gap-2">
            {['model', 'agent', 'buddy'].map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= stepIndex - 2 ? 'bg-danger' : 'bg-bg-tertiary'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-6 py-8">
          {step === 'welcome' && <WelcomeStep onNext={goNext} onSkip={handleSkip} />}
          {step === 'auth' && (
            <AuthStep onNext={goNext} onBack={goBack} onAuthenticated={() => goNext()} />
          )}
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
          {step === 'buddy' && (
            <BuddyStep
              onNext={goNext}
              onBack={goBack}
              savedAgentId={savedAgentId}
              savedAgentName={savedAgentName}
              onSaved={(serverId) => setSavedServerId(serverId)}
            />
          )}
          {step === 'done' && (
            <DoneStep
              onComplete={handleComplete}
              savedAgentName={savedAgentName}
              savedServerId={savedServerId}
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

function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="text-center space-y-6 animate-fade-in-up">
      <div className="flex justify-center">
        <div className="relative">
          <GlowRing size={80} className="absolute -inset-3" />
          <SparkleField count={8} className="-inset-8" />
          <OpenClawIcon size={80} glow animated />
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-black text-text-primary">
          {t('onboard.welcome', '欢迎使用 Shadow 桌面端')}
        </h1>
        <p className="text-text-muted text-sm leading-relaxed">
          {t('onboard.welcomeDesc', '只需几步，完成配置，开启你的 AI 搭子之旅')}
        </p>
      </div>

      <div className="space-y-3 pt-4">
        <OpenClawButton onClick={onNext} className="w-full gap-2">
          {t('onboard.startSetup', '开始设置')}
          <ArrowRight size={16} />
        </OpenClawButton>

        <button
          type="button"
          onClick={onSkip}
          className="w-full text-sm text-text-muted hover:text-text-primary transition"
        >
          {t('onboard.skip', '跳过设置')}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Step 2: Auth (Login/Register)
 * ═════════════════════════════════════════════════════════════════════════════ */

function AuthStep({
  onNext,
  onBack,
  onAuthenticated,
}: {
  onNext: () => void
  onBack: () => void
  onAuthenticated: () => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const setUser = useAuthStore((s) => s.setUser)

  const login = useMutation({
    mutationFn: async () => {
      const res = await fetchApi<{
        user: {
          id: string
          email: string
          username: string
          displayName: string | null
          avatarUrl: string | null
        }
        accessToken: string
        refreshToken: string
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      return res
    },
    onSuccess: (data) => {
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken)
      setUser(data.user)
      onAuthenticated()
    },
    onError: (err: Error) => {
      setError(err.message || '登录失败')
    },
  })

  const register = useMutation({
    mutationFn: async () => {
      const res = await fetchApi<{
        user: {
          id: string
          email: string
          username: string
          displayName: string | null
          avatarUrl: string | null
        }
        accessToken: string
        refreshToken: string
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, username, password, inviteCode }),
      })
      return res
    },
    onSuccess: (data) => {
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken)
      setUser(data.user)
      onAuthenticated()
    },
    onError: (err: Error) => {
      setError(err.message || '注册失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (mode === 'login') {
      login.mutate()
    } else {
      register.mutate()
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-xl bg-danger/10 flex items-center justify-center">
          <User size={24} className="text-danger" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">
          {mode === 'login' ? t('onboard.login', '登录账号') : t('onboard.register', '注册账号')}
        </h2>
        <p className="text-sm text-text-muted">
          {mode === 'login'
            ? t('onboard.loginDesc', '登录以同步你的设置和数据')
            : t('onboard.registerDesc', '创建账号以使用 Shadow 桌面端')}
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 p-1 bg-bg-tertiary rounded-lg">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
            mode === 'login'
              ? 'bg-bg-secondary text-text-primary'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <UserPlus size={14} className="inline mr-1.5" />
          {t('onboard.loginTab', '登录')}
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
            mode === 'register'
              ? 'bg-bg-secondary text-text-primary'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Users size={14} className="inline mr-1.5" />
          {t('onboard.registerTab', '注册')}
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">
              {t('onboard.username', '用户名')}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/40"
              placeholder={t('onboard.usernamePlaceholder', 'yourname')}
              required
            />
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary">
            {t('onboard.email', '邮箱')}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/40"
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary">
            {t('onboard.password', '密码')}
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 pr-10 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/40"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {mode === 'register' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">
              {t('onboard.inviteCode', '邀请码')}
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/40 font-mono uppercase"
              placeholder="XXXXXX"
              required
            />
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
        )}

        <OpenClawButton
          type="submit"
          disabled={login.isPending || register.isPending}
          className="w-full gap-2"
        >
          {login.isPending || register.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : mode === 'login' ? (
            <UserPlus size={16} />
          ) : (
            <Users size={16} />
          )}
          {mode === 'login' ? t('onboard.loginBtn', '登录') : t('onboard.registerBtn', '注册')}
        </OpenClawButton>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition"
      >
        <ArrowLeft size={14} />
        {t('onboard.back', '返回')}
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Step 3: Model Provider
 * ═════════════════════════════════════════════════════════════════════════════ */

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const categories = useMemo(() => getPresetsByCategory(), [])

  // Quick presets for onboarding (common providers)
  const quickPresetIds = ['openai', 'anthropic', 'gemini', 'deepseek', 'moonshot']
  const quickPresets = PROVIDER_PRESETS.filter((p) => quickPresetIds.includes(p.id))
  const otherPresets = PROVIDER_PRESETS.filter((p) => !quickPresetIds.includes(p.id))

  const handleSelect = (preset: ProviderPreset) => {
    setSelected(preset)
    setBaseUrl(preset.baseUrl)
  }

  const handleSave = async () => {
    if (!selected || !apiKey.trim()) return
    setSaving(true)
    setError('')
    try {
      const allModels = selected.models.filter((m) => !m.deprecated)
      const pickedModels = allModels.length > 0 ? allModels : selected.models.slice(0, 3)

      const entry: ModelProviderEntry = {
        baseUrl: baseUrl.trim() || selected.baseUrl,
        apiKey: apiKey.trim(),
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
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-xl bg-danger/10 flex items-center justify-center">
          <Cpu size={24} className="text-danger" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">
          {t('onboard.modelTitle', '配置 AI 模型')}
        </h2>
        <p className="text-sm text-text-muted">
          {t('onboard.modelDesc', '选择一个模型提供商并填入 API Key')}
        </p>
      </div>

      {!selected ? (
        <div className="space-y-2">
          {/* Quick presets */}
          {quickPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelect(preset)}
              className="w-full flex items-center gap-3 p-3 bg-bg-tertiary hover:bg-bg-modifier-hover rounded-xl transition text-left group"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
                style={{ backgroundColor: `${preset.brandColor}15`, color: preset.brandColor }}
              >
                {preset.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-text-primary group-hover:text-danger transition truncate">
                  {preset.name}
                </div>
                <div className="text-xs text-text-muted truncate">{preset.description}</div>
              </div>
              <ChevronRight size={16} className="text-text-muted/50 shrink-0" />
            </button>
          ))}

          {/* Show more toggle */}
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="w-full flex items-center justify-center gap-2 p-3 text-sm text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-xl transition"
          >
            <ChevronRight
              size={16}
              className={`transition-transform ${showAll ? 'rotate-90' : ''}`}
            />
            {showAll ? t('onboard.showLess', '收起') : t('onboard.showMore', '展开更多模型')}
          </button>

          {/* All presets by category */}
          {showAll && (
            <div className="space-y-4 pt-2 border-t border-bg-tertiary">
              {(Object.keys(categories) as ProviderCategory[]).map((cat) => (
                <div key={cat}>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    {CATEGORY_LABELS[cat]}
                  </h3>
                  <div className="space-y-2">
                    {categories[cat]?.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelect(preset)}
                        className="w-full flex items-center gap-3 p-3 bg-bg-tertiary hover:bg-bg-modifier-hover rounded-xl transition text-left group"
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
                          style={{
                            backgroundColor: `${preset.brandColor}15`,
                            color: preset.brandColor,
                          }}
                        >
                          {preset.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-text-primary group-hover:text-danger transition truncate">
                            {preset.name}
                          </div>
                          <div className="text-xs text-text-muted truncate">
                            {preset.description}
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-text-muted/50 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-bg-tertiary rounded-xl">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
              style={{ backgroundColor: `${selected.brandColor}15`, color: selected.brandColor }}
            >
              {selected.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-text-primary">{selected.name}</div>
              <div className="text-xs text-text-muted">{selected.description}</div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              {t('onboard.change', '更换')}
            </button>
          </div>

          {/* Base URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">API Base URL</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/40"
              placeholder={selected.baseUrl}
            />
            <p className="text-xs text-text-muted">
              {t('onboard.baseUrlHint', '可选，使用默认值即可')}
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/40"
              placeholder={selected.apiKeyPlaceholder || 'sk-...'}
            />
            {selected.guide?.apiKeyUrl && (
              <a
                href={selected.guide.apiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-danger hover:underline"
              >
                {t('onboard.getApiKey', '获取 API Key →')}
              </a>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex-1 py-2.5 text-sm text-text-muted hover:text-text-primary transition"
            >
              {t('onboard.backToList', '返回列表')}
            </button>
            <OpenClawButton
              type="button"
              onClick={handleSave}
              disabled={!apiKey.trim() || saving}
              className="flex-1 gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {t('onboard.saveAndContinue', '保存并继续')}
            </OpenClawButton>
          </div>
        </div>
      )}

      {!selected && (
        <div className="flex justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition"
          >
            <ArrowLeft size={14} />
            {t('onboard.back', '返回')}
          </button>
          <button
            type="button"
            onClick={onNext}
            className="text-sm text-text-muted hover:text-text-primary transition"
          >
            {t('onboard.skipStep', '稍后配置 →')}
          </button>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Step 4: Create Agent (使用预设模板 + SOUL.md)
 * ═════════════════════════════════════════════════════════════════════════════ */

function AgentStep({
  onNext,
  onBack,
  savedProviderId: _savedProviderId,
  onSaved,
}: {
  onNext: () => void
  onBack: () => void
  savedProviderId: string
  onSaved: (id: string, name: string) => void
}) {
  const { t } = useTranslation()
  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0)
  const [agentName, setAgentName] = useState(PERSONA_PRESETS[0]?.agentName || 'AI 搭子')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const currentPreset = PERSONA_PRESETS[selectedPresetIdx]

  useEffect(() => {
    if (currentPreset) {
      setAgentName(currentPreset.agentName)
    }
  }, [currentPreset])

  const handleCreate = async () => {
    if (!agentName.trim() || !currentPreset) return
    setSaving(true)
    setError('')
    try {
      const agentId = `agent-${Date.now()}`
      const agentDir = agentId
      const agent: AgentConfig = {
        id: agentId,
        name: agentName.trim(),
        agentDir,
        skills: [],
      }
      await openClawApi.createAgent(agent)
      await openClawApi.writeBootstrapFile(agentDir, 'SOUL.md', currentPreset.soul)
      onSaved(agentId, agentName.trim())
      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-xl bg-danger/10 flex items-center justify-center">
          <Bot size={24} className="text-danger" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">
          {t('onboard.agentTitle', '创建你的 AI 搭子')}
        </h2>
        <p className="text-sm text-text-muted">
          {t('onboard.agentDesc', '选择一个预设，给你的 AI 搭子起个名字')}
        </p>
      </div>

      {/* Persona presets grid */}
      <div className="grid grid-cols-2 gap-2">
        {PERSONA_PRESETS.map((preset, idx) => {
          const Icon = preset.icon
          const isSelected = selectedPresetIdx === idx
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedPresetIdx(idx)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition text-left ${
                isSelected
                  ? 'bg-primary/10 border-2 border-primary'
                  : 'bg-bg-tertiary border-2 border-transparent hover:bg-bg-modifier-hover'
              }`}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${preset.color}20` }}
              >
                <Icon size={16} style={{ color: preset.color }} />
              </div>
              <span
                className={`text-xs font-medium ${isSelected ? 'text-primary' : 'text-text-primary'}`}
              >
                {preset.title}
              </span>
            </button>
          )
        })}
      </div>

      {/* Selected preset details */}
      {currentPreset && (
        <div className="space-y-4">
          <div className="p-3 bg-bg-tertiary rounded-xl">
            <p className="text-sm text-text-secondary">{currentPreset.desc}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">
              {t('onboard.agentName', '助手名称')}
            </label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger/40"
              placeholder={currentPreset.agentName}
              maxLength={50}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 text-sm text-text-muted hover:text-text-primary transition"
        >
          {t('onboard.back', '返回')}
        </button>
        <OpenClawButton
          type="button"
          onClick={handleCreate}
          disabled={!agentName.trim() || saving}
          className="flex-1 gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {t('onboard.createAgent', '创建助手')}
        </OpenClawButton>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Step 5: Bind Buddy (创建云端 Buddy + 关联本地智能体)
 * ═════════════════════════════════════════════════════════════════════════════ */

interface RemoteBuddy {
  id: string
  userId: string
  status: 'running' | 'stopped' | 'error'
  lastHeartbeat: string | null
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

function BuddyStep({
  onNext,
  onBack,
  savedAgentId,
  savedAgentName,
  onSaved,
}: {
  onNext: () => void
  onBack: () => void
  savedAgentId: string
  savedAgentName: string
  onSaved: (serverId: string) => void
}) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleCreateAndBind = async () => {
    if (!savedAgentId) return
    setSaving(true)
    setError('')
    try {
      const serverUrl = (import.meta.env.VITE_API_BASE as string) || 'https://shadowob.com'

      // 1. 创建云端 Buddy
      const username = `buddy-${Date.now().toString(36)}`
      const remoteBuddy = await fetchApi<{ id: string }>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: savedAgentName || 'OpenClaw Buddy',
          username,
          kernelType: 'openclaw',
        }),
      })

      // 2. 生成 Token
      const tokenResp = await fetchApi<{ token: string; agent: { id: string } }>(
        `/api/agents/${remoteBuddy.id}/token`,
        { method: 'POST' },
      )

      // 3. 添加 Buddy 连接
      const connection: Omit<BuddyConnection, 'status'> = {
        id: crypto.randomUUID(),
        label: savedAgentName || 'Buddy',
        serverUrl,
        apiToken: tokenResp.token,
        remoteAgentId: tokenResp.agent.id,
        agentId: savedAgentId,
        autoConnect: true,
      }
      await openClawApi.addBuddyConnection(connection)

      // 4. 连接 Buddy
      await openClawApi.connectAllBuddies()

      onSaved(remoteBuddy.id)
      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : '绑定失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-xl bg-danger/10 flex items-center justify-center">
          <Link2 size={24} className="text-danger" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">
          {t('onboard.buddyTitle', '绑定 Buddy')}
        </h2>
        <p className="text-sm text-text-muted">
          {t('onboard.buddyDesc', '将 AI 搭子连接到 Shadow 服务器')}
        </p>
      </div>

      {/* Connection preview */}
      <div className="p-4 bg-bg-tertiary rounded-xl">
        <div className="flex items-center justify-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-lg bg-bg-secondary flex items-center justify-center">
              <Server size={18} className="text-primary" />
            </div>
            <span className="text-[10px] text-text-muted">
              {t('onboard.localAgent', '本地智能体')}
            </span>
          </div>
          <ArrowRight size={14} className="text-primary" />
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot size={18} className="text-primary" />
            </div>
            <span className="text-[10px] text-text-primary">{savedAgentName || 'Buddy'}</span>
          </div>
          <ArrowRight size={14} className="text-primary" />
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-lg bg-bg-secondary flex items-center justify-center">
              <Globe size={18} className="text-primary" />
            </div>
            <span className="text-[10px] text-text-muted">{t('onboard.users', '用户')}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 text-sm text-text-muted hover:text-text-primary transition"
        >
          {t('onboard.back', '返回')}
        </button>
        <OpenClawButton
          type="button"
          onClick={handleCreateAndBind}
          disabled={saving}
          className="flex-1 gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
          {t('onboard.bindBuddy', '绑定 Buddy')}
        </OpenClawButton>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full text-sm text-text-muted hover:text-text-primary transition"
      >
        {t('onboard.skipForNow', '暂时跳过 →')}
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Step 6: Done
 * ═════════════════════════════════════════════════════════════════════════════ */

function DoneStep({
  onComplete,
  savedAgentName,
  savedServerId,
}: {
  onComplete: () => void
  savedAgentName: string
  savedServerId: string
}) {
  const { t } = useTranslation()

  const completedItems = [
    { label: t('onboard.doneAuth', '账号登录成功'), done: true },
    { label: t('onboard.doneModel', '模型提供商已配置'), done: true },
    { label: t('onboard.doneAgent', `AI 搭子「${savedAgentName}」已创建`), done: !!savedAgentName },
    { label: t('onboard.doneBuddy', 'Buddy 已绑定到 Shadow'), done: !!savedServerId },
  ]

  return (
    <div className="text-center space-y-6 animate-fade-in-up">
      <div className="flex justify-center">
        <div className="relative">
          <GlowRing size={64} className="absolute -inset-2" />
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 size={32} className="text-green-400" />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-black text-text-primary">
          {t('onboard.doneTitle', '设置完成！')}
        </h2>
        <p className="text-sm text-text-muted">{t('onboard.doneDesc', '你的 AI 搭子已准备就绪')}</p>
      </div>

      <div className="space-y-2 text-left">
        {completedItems.map((item) => (
          <div key={item.label} className="flex items-center gap-3 p-3 bg-bg-tertiary rounded-xl">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                item.done ? 'bg-green-500/20' : 'bg-bg-modifier-hover'
              }`}
            >
              <Check size={12} className={item.done ? 'text-green-400' : 'text-text-muted'} />
            </div>
            <span className="text-sm text-text-primary">{item.label}</span>
          </div>
        ))}
      </div>

      <OpenClawButton onClick={onComplete} className="w-full gap-2">
        <Power size={16} />
        {t('onboard.launchApp', '启动 OpenClaw')}
      </OpenClawButton>
    </div>
  )
}
