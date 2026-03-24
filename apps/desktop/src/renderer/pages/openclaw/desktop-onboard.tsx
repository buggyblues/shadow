/**
 * Desktop Onboarding Page
 *
 * 完整的 Onboarding 流程：
 * 1. 欢迎
 * 2. 登录/注册
 * 3. 配置模型
 * 4. 创建龙虾
 * 5. 绑定 Buddy
 * 6. 完成
 */

import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@web/stores/auth.store'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  Link2,
  Loader2,
  LogIn,
  Power,
  Server,
  Sparkles,
  User,
  UserPlus,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import type { AgentConfig, ModelProviderEntry } from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import { BuddyConnectionForm } from './buddy-connection-form'
import { PROVIDER_PRESETS, type ProviderPreset } from './model-presets'
import { GlowRing, OpenClawIcon, SparkleField } from './openclaw-brand'
import type { OpenClawPage } from './openclaw-layout'
import { OpenClawButton } from './openclaw-ui'

type OnboardingStep = 'welcome' | 'auth' | 'model' | 'agent' | 'buddy' | 'done'

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
  if (isAuthenticated && step === 'auth') {
    setStep('model')
  }

  const goNext = () => {
    const steps: OnboardingStep[] = ['welcome', 'auth', 'model', 'agent', 'buddy', 'done']
    const idx = steps.indexOf(step)
    if (idx < steps.length - 1) {
      setStep(steps[idx + 1]!)
    }
  }

  const goBack = () => {
    const steps: OnboardingStep[] = ['welcome', 'auth', 'model', 'agent', 'buddy', 'done']
    const idx = steps.indexOf(step)
    if (idx > 0) {
      setStep(steps[idx - 1]!)
    }
  }

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

  const stepIndex = ['welcome', 'auth', 'model', 'agent', 'buddy', 'done'].indexOf(step)

  return (
    <div className="h-screen flex flex-col bg-bg-primary overflow-hidden">
      {/* Progress bar */}
      {step !== 'welcome' && step !== 'done' && (
        <div className="px-6 pt-4">
          <div className="flex items-center gap-2">
            {['auth', 'model', 'agent', 'buddy'].map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= stepIndex - 1 ? 'bg-danger' : 'bg-bg-tertiary'
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
            <AuthStep
              onNext={goNext}
              onBack={goBack}
              onAuthenticated={(userId) => {
                goNext()
              }}
            />
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
          {t('onboard.welcome', '欢迎使用 OpenClaw')}
        </h1>
        <p className="text-text-muted text-sm leading-relaxed">
          {t('onboard.welcomeDesc', '只需几步，完成配置，开启你的 AI 助手之旅')}
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
  onAuthenticated: (userId: string) => void
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
      onAuthenticated(data.user.id)
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
      onAuthenticated(data.user.id)
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
            : t('onboard.registerDesc', '创建账号以使用 OpenClaw')}
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
          <LogIn size={14} className="inline mr-1.5" />
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
          <UserPlus size={14} className="inline mr-1.5" />
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
            <LogIn size={16} />
          ) : (
            <UserPlus size={16} />
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Quick presets for onboarding
  const quickPresets = PROVIDER_PRESETS.filter((p) =>
    ['openai', 'anthropic', 'gemini', 'deepseek', 'moonshot'].includes(p.id),
  )

  const handleSave = async () => {
    if (!selected || !apiKey.trim()) return
    setSaving(true)
    setError('')
    try {
      const allModels = selected.models.filter((m) => !m.deprecated)
      const pickedModels = allModels.length > 0 ? allModels : selected.models.slice(0, 3)

      const entry: ModelProviderEntry = {
        baseUrl: selected.baseUrl,
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
          {quickPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setSelected(preset)}
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
 * Step 4: Create Agent
 * ═════════════════════════════════════════════════════════════════════════════ */

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
  const [agentName, setAgentName] = useState('AI 助手')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!agentName.trim()) return
    setSaving(true)
    setError('')
    try {
      const agentId = `agent-${Date.now()}`
      const agent: AgentConfig = {
        id: agentId,
        name: agentName.trim(),
        agentDir: agentId,
        skills: [],
      }
      await openClawApi.createAgent(agent)
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
          {t('onboard.agentTitle', '创建你的 AI 助手')}
        </h2>
        <p className="text-sm text-text-muted">
          {t('onboard.agentDesc', '给你的 AI 助手起个名字')}
        </p>
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
          placeholder="AI 助手"
          maxLength={50}
        />
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
 * Step 5: Bind Buddy (使用公共组件 BuddyConnectionForm)
 * ═════════════════════════════════════════════════════════════════════════════ */

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
  const [agents, setAgents] = useState<AgentConfig[]>([])

  // Load agents
  useEffect(() => {
    openClawApi
      .listAgents()
      .then(setAgents)
      .catch(() => {})
  }, [])

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
          {t('onboard.buddyDesc', '将 AI 助手连接到 Shadow 服务器')}
        </p>
      </div>

      <BuddyConnectionForm
        agents={agents}
        initialAgentId={savedAgentId}
        initialMode="create"
        showTitle={false}
        onSave={() => {
          onSaved(savedAgentId)
          onNext()
        }}
      />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 text-sm text-text-muted hover:text-text-primary transition"
        >
          {t('onboard.back', '返回')}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 py-2.5 text-sm text-text-muted hover:text-text-primary transition"
        >
          {t('onboard.skipForNow', '暂时跳过 →')}
        </button>
      </div>
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
    { label: t('onboard.doneAgent', `AI 助手「${savedAgentName}」已创建`), done: !!savedAgentName },
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
        <p className="text-sm text-text-muted">{t('onboard.doneDesc', '你的 AI 助手已准备就绪')}</p>
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
