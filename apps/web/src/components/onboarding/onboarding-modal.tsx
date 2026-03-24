import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Bot,
  Check,
  ChevronLeft,
  Copy,
  Download,
  Globe,
  Hash,
  Loader2,
  MessageCircle,
  Plus,
  Rocket,
  Search,
  Server,
  SkipForward,
  Terminal,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'

interface OnboardingModalProps {
  open: boolean
  onClose: () => void
}

type Step =
  | 'welcome'
  | 'create-server'
  | 'join-server'
  | 'create-buddy'
  | 'buddy-config'
  | 'complete'

const features = [
  {
    icon: MessageCircle,
    titleKey: 'onboarding.featureChat',
    descKey: 'onboarding.featureChatDesc',
    color: 'text-cyan-400',
  },
  {
    icon: Rocket,
    titleKey: 'onboarding.featureAI',
    descKey: 'onboarding.featureAIDesc',
    color: 'text-amber-400',
  },
  {
    icon: Globe,
    titleKey: 'onboarding.featureCommunity',
    descKey: 'onboarding.featureCommunityDesc',
    color: 'text-purple-400',
  },
  {
    icon: Hash,
    titleKey: 'onboarding.featureChannels',
    descKey: 'onboarding.featureChannelsDesc',
    color: 'text-pink-400',
  },
]

export function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('welcome')
  const [slideIndex, setSlideIndex] = useState(0)
  const [serverName, setServerName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [createdServerId, setCreatedServerId] = useState<string | null>(null)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  // Fetch discover servers for suggestions
  const { data: discoverServers = [] } = useQuery({
    queryKey: ['discover-servers'],
    queryFn: () =>
      fetchApi<
        Array<{
          id: string
          name: string
          slug: string
          iconUrl: string | null
          memberCount: number
        }>
      >('/api/servers/discover'),
    enabled: step === 'join-server',
  })

  // Create server mutation
  const createServer = useMutation({
    mutationFn: (name: string) =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      const serverId = data.slug || data.id
      setCreatedServerId(serverId)
      // 跳转到创建 Buddy 步骤
      setStep('create-buddy')
    },
  })

  // Join server mutation
  const joinServer = useMutation({
    mutationFn: (code: string) =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: code }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      const serverId = data.slug || data.id
      setCreatedServerId(serverId)
      // 跳转到创建 Buddy 步骤
      setStep('create-buddy')
    },
  })

  if (!open) return null

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches[0]) {
      touchStartX.current = e.touches[0].clientX
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches[0]) {
      touchEndX.current = e.touches[0].clientX
    }
  }

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current
    const threshold = 50 // Minimum swipe distance

    if (diff > threshold && slideIndex < features.length - 1) {
      // Swipe left - next slide
      setSlideIndex(slideIndex + 1)
    } else if (diff < -threshold && slideIndex > 0) {
      // Swipe right - previous slide
      setSlideIndex(slideIndex - 1)
    }
  }

  const handleComplete = () => {
    // No need to mark completed - the check is based on whether user has servers
    onClose()
  }

  const handleSkip = () => {
    // User skips onboarding - close the modal
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-bg-secondary rounded-2xl shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          type="button"
          onClick={handleSkip}
          className="absolute top-4 right-4 p-2 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-lg transition z-10"
        >
          <X size={20} />
        </button>

        {/* Welcome step */}
        {step === 'welcome' && (
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <Server size={40} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-text-primary mb-2">
                {t('onboarding.welcome', '欢迎来到 Shadow！')}
              </h1>
              <p className="text-text-muted">
                {t('onboarding.welcomeDesc', '让我们帮你开始构建你的社区')}
              </p>
            </div>

            {/* Feature slides */}
            <div className="relative mb-8">
              <div
                className="overflow-hidden"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div
                  className="flex transition-transform duration-300"
                  style={{ transform: `translateX(-${slideIndex * 100}%)` }}
                >
                  {features.map((feature, idx) => (
                    <div key={idx} className="w-full flex-shrink-0 px-4">
                      <div className="bg-bg-tertiary rounded-xl p-6 text-center">
                        <feature.icon size={32} className={`mx-auto mb-3 ${feature.color}`} />
                        <h3 className="font-semibold text-text-primary mb-1">
                          {t(feature.titleKey)}
                        </h3>
                        <p className="text-sm text-text-muted">{t(feature.descKey)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Slide indicators */}
              <div className="flex justify-center gap-2 mt-4">
                {features.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSlideIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      idx === slideIndex ? 'bg-primary w-4' : 'bg-bg-modifier-active'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSkip}
                className="flex-1 px-4 py-3 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-xl transition flex items-center justify-center gap-2"
              >
                <SkipForward size={18} />
                {t('common.skip', '跳过')}
              </button>
              <button
                type="button"
                onClick={() => setStep('create-server')}
                className="flex-1 px-4 py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 transition flex items-center justify-center gap-2"
              >
                {t('onboarding.getStarted', '开始使用')}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Create server step */}
        {step === 'create-server' && (
          <div className="p-8">
            <button
              type="button"
              onClick={() => setStep('welcome')}
              className="mb-4 p-2 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-lg transition"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                <Plus size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-text-primary mb-2">
                {t('onboarding.createServer', '创建你的服务器')}
              </h2>
              <p className="text-text-muted text-sm">
                {t('onboarding.createServerDesc', '给你的社区起个名字')}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-text-primary mb-2">
                {t('onboarding.serverName', '服务器名称')}
              </label>
              <input
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder={t('onboarding.serverNamePlaceholder', '我的社区')}
                className="w-full px-4 py-3 bg-bg-tertiary border border-border-subtle rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('join-server')}
                className="flex-1 px-4 py-3 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-xl transition"
              >
                {t('onboarding.joinInstead', '加入现有服务器')}
              </button>
              <button
                type="button"
                onClick={() => createServer.mutate(serverName || '我的社区')}
                disabled={createServer.isPending}
                className="flex-1 px-4 py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {createServer.isPending
                  ? t('common.creating', '创建中...')
                  : t('onboarding.create', '创建服务器')}
              </button>
            </div>

            {createServer.isError && (
              <p className="mt-3 text-sm text-red-400 text-center">
                {t('onboarding.createError', '创建失败，请重试')}
              </p>
            )}
          </div>
        )}

        {/* Join server step */}
        {step === 'join-server' && (
          <div className="p-8">
            <button
              type="button"
              onClick={() => setStep('create-server')}
              className="mb-4 p-2 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-lg transition"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-400 to-violet-500 flex items-center justify-center">
                <Search size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-text-primary mb-2">
                {t('onboarding.joinServer', '加入服务器')}
              </h2>
              <p className="text-text-muted text-sm">
                {t('onboarding.joinServerDesc', '输入邀请码或选择公开服务器')}
              </p>
            </div>

            {/* Invite code input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-text-primary mb-2">
                {t('onboarding.inviteCode', '邀请码')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="XXXXXX"
                  className="flex-1 px-4 py-3 bg-bg-tertiary border border-border-subtle rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary font-mono uppercase"
                />
                <button
                  type="button"
                  onClick={() => inviteCode && joinServer.mutate(inviteCode)}
                  disabled={!inviteCode || joinServer.isPending}
                  className="px-4 py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50"
                >
                  {joinServer.isPending ? '...' : t('common.join', '加入')}
                </button>
              </div>
            </div>

            {/* Public servers */}
            <div className="mb-6">
              <p className="text-sm text-text-muted mb-3">
                {t('onboarding.orJoinPublic', '或选择公开服务器')}
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {discoverServers.slice(0, 5).map((server) => (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => joinServer.mutate(server.id)}
                    className="w-full flex items-center gap-3 p-3 bg-bg-tertiary hover:bg-bg-modifier-hover rounded-xl transition text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold">
                      {server.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary truncate">{server.name}</p>
                      <p className="text-xs text-text-muted">
                        {server.memberCount} {t('common.members', '成员')}
                      </p>
                    </div>
                  </button>
                ))}
                {discoverServers.length === 0 && (
                  <p className="text-center text-text-muted py-4">
                    {t('onboarding.noPublicServers', '暂无公开服务器')}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleComplete}
              className="w-full px-4 py-3 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-xl transition"
            >
              {t('onboarding.skipForNow', '暂时跳过')}
            </button>
          </div>
        )}

        {/* Create Buddy step */}
        {step === 'create-buddy' && (
          <CreateBuddyStep
            serverId={createdServerId}
            onNext={() => setStep('buddy-config')}
            onSkip={() => {
              onClose()
              if (createdServerId) {
                void navigate({
                  to: '/servers/$serverSlug',
                  params: { serverSlug: createdServerId },
                })
              }
            }}
          />
        )}

        {/* Buddy config step */}
        {step === 'buddy-config' && createdServerId && (
          <BuddyConfigStep serverId={createdServerId} onComplete={() => setStep('complete')} />
        )}

        {/* Complete step */}
        {step === 'complete' && (
          <div className="p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
              <Check size={40} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              {t('onboarding.allSet', '一切就绪！')}
            </h2>
            <p className="text-text-muted mb-8">
              {t('onboarding.allSetDesc', '你已准备好开始使用 Shadow')}
            </p>
            <button
              type="button"
              onClick={handleComplete}
              className="w-full px-4 py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 transition"
            >
              {t('onboarding.goToServer', '进入服务器')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Hook to check if onboarding should be shown
// Note: The actual check is done in AppLayout by checking if user has servers
// This hook is kept for backward compatibility
export function useOnboarding() {
  const shouldShow = () => {
    // This is now handled in AppLayout
    return false
  }

  const markCompleted = () => {
    // No longer needed - check is based on server count
  }

  return { shouldShow, markCompleted }
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Create Buddy Step
 * ═════════════════════════════════════════════════════════════════════════════ */

interface BuddyAgent {
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

function CreateBuddyStep({
  serverId: _serverId,
  onNext,
  onSkip,
}: {
  serverId: string | null
  onNext: () => void
  onSkip: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('AI 助手')
  const [username, setUsername] = useState(() => {
    const suffix = Math.random().toString(36).slice(2, 8)
    return `buddy_${suffix}`
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    setError('')
    try {
      await fetchApi<BuddyAgent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          username: username || `buddy_${Math.random().toString(36).slice(2, 8)}`,
          kernelType: 'openclaw',
          config: {},
        }),
      })
      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('buddyOnboarding.createError', '创建失败'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-8">
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <Bot size={32} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">
          {t('buddyOnboarding.createTitle', '创建你的 AI 助手')}
        </h2>
        <p className="text-sm text-text-muted">
          {t('buddyOnboarding.createDesc', '给你的 AI 助手起个名字，它将在频道中与你对话')}
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            {t('buddyOnboarding.buddyName', '助手名称')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="AI 助手"
            className="w-full px-4 py-3 bg-bg-tertiary border border-border-subtle rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
            maxLength={64}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            {t('buddyOnboarding.buddyUsername', '用户名')}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
            placeholder="buddy_xxx"
            className="w-full px-4 py-3 bg-bg-tertiary border border-border-subtle rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            maxLength={32}
          />
          <p className="text-xs text-text-muted mt-1">@{username || 'buddy_xxx'}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 py-3 text-text-muted hover:text-text-primary transition"
        >
          {t('common.skipForNow', '暂时跳过')}
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          className="flex-1 py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {creating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {t('common.creating', '创建中...')}
            </>
          ) : (
            <>
              <Plus size={16} />
              {t('buddyOnboarding.createBuddy', '创建 Buddy')}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Buddy Config Step (复用 buddy-management 的配置说明)
 * ═════════════════════════════════════════════════════════════════════════════ */

function BuddyConfigStep({ serverId, onComplete }: { serverId: string; onComplete: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  // 生成绑定命令
  const bindCommand = `/buddy bind --server ${serverId}`

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-8">
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-400 to-violet-500 flex items-center justify-center">
          <Terminal size={32} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">
          {t('buddyOnboarding.configTitle', '配置 Buddy 连接')}
        </h2>
        <p className="text-sm text-text-muted">
          {t('buddyOnboarding.configDesc', '使用 OpenClaw 桌面端连接你的 Buddy')}
        </p>
      </div>

      {/* 方法1: 下载桌面端 */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary mb-2">
          {t('buddyOnboarding.method1', '方法 1: 使用 OpenClaw 桌面端（推荐）')}
        </h3>
        <a
          href="https://openclaw.ai/download"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-4 bg-bg-tertiary hover:bg-bg-modifier-hover rounded-xl transition group"
        >
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
            <Download size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-text-primary group-hover:text-primary transition">
              {t('buddyOnboarding.downloadDesktop', '下载 OpenClaw 桌面端')}
            </p>
            <p className="text-xs text-text-muted">
              {t('buddyOnboarding.downloadDesktopHint', '安装后打开，按向导完成配置')}
            </p>
          </div>
        </a>
      </div>

      {/* 方法2: 命令绑定 */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-text-primary mb-2">
          {t('buddyOnboarding.method2', '方法 2: 使用命令绑定')}
        </h3>
        <div className="p-4 bg-bg-tertiary rounded-xl">
          <p className="text-xs text-text-muted mb-2">
            {t('buddyOnboarding.commandHint', '在 OpenClaw 对话中输入以下命令：')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-3 bg-bg-secondary rounded-lg text-primary font-mono text-sm overflow-x-auto">
              {bindCommand}
            </code>
            <button
              type="button"
              onClick={() => handleCopy(bindCommand)}
              className="p-3 text-text-muted hover:text-primary bg-bg-secondary rounded-lg transition"
              title={t('common.copy', '复制')}
            >
              {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* 配置说明（复用 buddy-management 的样式） */}
      <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <h4 className="text-sm font-semibold text-amber-400 mb-2">
          💡 {t('buddyOnboarding.setupGuide', '配置步骤')}
        </h4>
        <ol className="text-xs text-text-secondary space-y-1 list-decimal list-inside">
          <li>{t('buddyOnboarding.step1', '下载并安装 OpenClaw 桌面端')}</li>
          <li>{t('buddyOnboarding.step2', '打开 OpenClaw，完成初始设置')}</li>
          <li>{t('buddyOnboarding.step3', '在对话中输入上述命令，或使用 Buddy 管理页面配置')}</li>
          <li>{t('buddyOnboarding.step4', '连接成功后，Buddy 将自动出现在你的服务器中')}</li>
        </ol>
      </div>

      <button
        type="button"
        onClick={onComplete}
        className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 transition"
      >
        {t('buddyOnboarding.complete', '完成设置')}
      </button>
    </div>
  )
}
