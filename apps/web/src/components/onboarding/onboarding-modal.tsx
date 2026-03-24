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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'

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
  | 'waiting-buddy'
  | 'complete'

// 时间线步骤定义
const timelineSteps = [
  { id: 'welcome', labelKey: 'onboarding.timeline.welcome', labelDefault: '欢迎' },
  { id: 'create-server', labelKey: 'onboarding.timeline.createServer', labelDefault: '创建服务器' },
  { id: 'create-buddy', labelKey: 'onboarding.timeline.createBuddy', labelDefault: '创建 Buddy' },
  { id: 'buddy-config', labelKey: 'onboarding.timeline.config', labelDefault: '配置连接' },
  { id: 'complete', labelKey: 'onboarding.timeline.complete', labelDefault: '开始使用' },
]

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

// 检测是否为移动端
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

export function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const [step, setStep] = useState<Step>('welcome')
  const [slideIndex, setSlideIndex] = useState(0)
  const [serverName, setServerName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [createdServerId, setCreatedServerId] = useState<string | null>(null)
  const [createdBuddyId, setCreatedBuddyId] = useState<string | null>(null)
  const [buddyToken, setBuddyToken] = useState<string | null>(null)
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
    const threshold = 50

    if (diff > threshold && slideIndex < features.length - 1) {
      setSlideIndex(slideIndex + 1)
    } else if (diff < -threshold && slideIndex > 0) {
      setSlideIndex(slideIndex - 1)
    }
  }

  const handleComplete = () => {
    onClose()
  }

  const handleSkip = () => {
    onClose()
  }

  const handleNavigateToServer = async () => {
    onClose()
    if (createdServerId) {
      await navigate({
        to: '/servers/$serverSlug',
        params: { serverSlug: createdServerId },
      })
    }
  }

  // 获取当前步骤在时间线中的索引
  const getCurrentStepIndex = () => {
    return timelineSteps.findIndex((s) => s.id === step)
  }

  // 时间线组件
  const Timeline = () => {
    const currentIndex = getCurrentStepIndex()
    return (
      <div className="px-6 pt-4">
        <div className="flex items-center justify-between">
          {timelineSteps.map((s, idx) => {
            const isCompleted = idx < currentIndex
            const isCurrent = idx === currentIndex
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      isCompleted
                        ? 'bg-primary text-white'
                        : isCurrent
                          ? 'bg-primary/20 text-primary border-2 border-primary'
                          : 'bg-bg-tertiary text-text-muted'
                    }`}
                  >
                    {isCompleted ? <Check size={14} /> : idx + 1}
                  </div>
                  <span
                    className={`text-[10px] mt-1 hidden md:block ${
                      isCurrent ? 'text-primary font-medium' : 'text-text-muted'
                    }`}
                  >
                    {t(s.labelKey, s.labelDefault)}
                  </span>
                </div>
                {idx < timelineSteps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-primary' : 'bg-bg-tertiary'}`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-bg-secondary rounded-2xl shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-lg transition z-10"
        >
          <X size={20} />
        </button>

        {/* Timeline - PC only */}
        {!isMobile && step !== 'welcome' && step !== 'complete' && <Timeline />}

        {/* Welcome step */}
        {step === 'welcome' && (
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="w-24 h-24 mx-auto mb-6 relative">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-500 animate-pulse opacity-75" />
                <div className="relative w-24 h-24 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                  <Server size={48} className="text-white" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-text-primary mb-2">
                {t('onboarding.welcome', '欢迎来到 Shadow！')}
              </h1>
              <p className="text-text-muted text-sm">
                {t('onboarding.welcomeDesc', '构建你的 AI 社区，让智能体成为你的队友')}
              </p>
            </div>

            {/* Mobile: Feature slides */}
            {isMobile && (
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
            )}

            {/* PC: Feature grid */}
            {!isMobile && (
              <div className="grid grid-cols-2 gap-3 mb-8">
                {features.map((feature, idx) => (
                  <div
                    key={idx}
                    className="bg-bg-tertiary rounded-xl p-4 text-center hover:bg-bg-modifier-hover transition"
                  >
                    <feature.icon size={24} className={`mx-auto mb-2 ${feature.color}`} />
                    <h3 className="font-medium text-text-primary text-sm">{t(feature.titleKey)}</h3>
                    <p className="text-xs text-text-muted mt-1">{t(feature.descKey)}</p>
                  </div>
                ))}
              </div>
            )}

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
            onNext={(buddyId, token) => {
              setCreatedBuddyId(buddyId)
              setBuddyToken(token)
              setStep('buddy-config')
            }}
            onSkip={handleNavigateToServer}
          />
        )}

        {/* Buddy config step */}
        {step === 'buddy-config' && createdBuddyId && buddyToken && (
          <BuddyConfigStep
            buddyId={createdBuddyId}
            token={buddyToken}
            serverId={createdServerId}
            onConfigured={() => setStep('waiting-buddy')}
            onSkip={handleNavigateToServer}
          />
        )}

        {/* Waiting for Buddy to come online */}
        {step === 'waiting-buddy' && createdBuddyId && createdServerId && (
          <WaitingBuddyStep
            buddyId={createdBuddyId}
            serverId={createdServerId}
            onComplete={handleNavigateToServer}
            onTimeout={handleNavigateToServer}
          />
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
              onClick={handleNavigateToServer}
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
  onNext: (buddyId: string, token: string) => void
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
      // 1. 创建 Buddy
      const buddy = await fetchApi<BuddyAgent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          username: username || `buddy_${Math.random().toString(36).slice(2, 8)}`,
          kernelType: 'openclaw',
          config: {},
        }),
      })

      // 2. 自动生成 Token
      const tokenResp = await fetchApi<{ token: string }>(`/api/agents/${buddy.id}/token`, {
        method: 'POST',
      })

      onNext(buddy.id, tokenResp.token)
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
 * Buddy Config Step - 显示配置指南
 * ═════════════════════════════════════════════════════════════════════════════ */

function BuddyConfigStep({
  buddyId: _buddyId,
  token,
  serverId,
  onConfigured,
  onSkip,
}: {
  buddyId: string
  token: string
  serverId: string | null
  onConfigured: () => void
  onSkip: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const bindCommand = `/buddy bind --server ${serverId || 'your-server-id'} --token ${token}`

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

      {/* Token display */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-text-primary mb-2">
          {t('buddyOnboarding.yourToken', '你的 Token')}
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 p-3 bg-bg-tertiary rounded-lg text-primary font-mono text-xs overflow-x-auto">
            {token}
          </code>
          <button
            type="button"
            onClick={() => handleCopy(token)}
            className="p-3 text-text-muted hover:text-primary bg-bg-tertiary rounded-lg transition"
          >
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
          </button>
        </div>
      </div>

      {/* Method 1: Download desktop */}
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
              {t('buddyOnboarding.downloadDesktopApp', '下载 OpenClaw 桌面端')}
            </p>
            <p className="text-xs text-text-muted">
              {t('buddyOnboarding.downloadDesktopHint', '安装后打开，按向导完成配置')}
            </p>
          </div>
        </a>
      </div>

      {/* Method 2: Command */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-text-primary mb-2">
          {t('buddyOnboarding.method2', '方法 2: 使用命令绑定')}
        </h3>
        <div className="p-4 bg-bg-tertiary rounded-xl">
          <p className="text-xs text-text-muted mb-2">
            {t('buddyOnboarding.commandHint', '在 OpenClaw 对话中输入以下命令：')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-3 bg-bg-secondary rounded-lg text-primary font-mono text-xs overflow-x-auto whitespace-nowrap">
              {bindCommand}
            </code>
            <button
              type="button"
              onClick={() => handleCopy(bindCommand)}
              className="p-3 text-text-muted hover:text-primary bg-bg-secondary rounded-lg transition"
            >
              <Copy size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Setup guide */}
      <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <h4 className="text-sm font-semibold text-amber-400 mb-2">
          💡 {t('buddyOnboarding.setupGuide', '配置步骤')}
        </h4>
        <ol className="text-xs text-text-secondary space-y-1 list-decimal list-inside">
          <li>{t('buddyOnboarding.setupStep1', '下载并安装 OpenClaw 桌面端')}</li>
          <li>{t('buddyOnboarding.setupStep2', '打开 OpenClaw，完成初始设置')}</li>
          <li>
            {t('buddyOnboarding.setupStep3', '在对话中输入上述命令，或使用 Buddy 管理页面配置')}
          </li>
          <li>{t('buddyOnboarding.setupStep4', '连接成功后，Buddy 将自动出现在你的服务器中')}</li>
        </ol>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 py-3 text-text-muted hover:text-text-primary transition"
        >
          {t('common.skipForNow', '稍后配置')}
        </button>
        <button
          type="button"
          onClick={onConfigured}
          className="flex-1 py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 transition"
        >
          {t('buddyOnboarding.configured', '我已配置完成')}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * Waiting Buddy Step - 轮询等待 Buddy 上线
 * ═════════════════════════════════════════════════════════════════════════════ */

function WaitingBuddyStep({
  buddyId,
  serverId,
  onComplete,
  onTimeout,
}: {
  buddyId: string
  serverId: string
  onComplete: () => void
  onTimeout: () => void
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'waiting' | 'adding' | 'sending' | 'done' | 'timeout'>(
    'waiting',
  )
  const [countdown, setCountdown] = useState(30)

  // 发送欢迎消息
  const sendWelcomeMessage = useCallback(async () => {
    try {
      const channels = await fetchApi<Array<{ id: string; name: string }>>(
        `/api/servers/${serverId}/channels`,
      )
      const generalChannel = channels.find((c) => c.name === 'general')

      if (generalChannel) {
        await fetchApi(`/api/channels/${generalChannel.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: '👋 大家好！我是 AI 助手，有什么可以帮助你们的吗？',
          }),
        })
      }
    } catch {
      // Ignore errors
    }
  }, [serverId])

  // 添加 Buddy 到服务器
  const addBuddyToServer = useCallback(async () => {
    try {
      await fetchApi(`/api/servers/${serverId}/members`, {
        method: 'POST',
        body: JSON.stringify({ buddyId }),
      })

      setStatus('sending')
      await sendWelcomeMessage()
      setStatus('done')
      setTimeout(onComplete, 1000)
    } catch {
      setStatus('done')
      setTimeout(onComplete, 1000)
    }
  }, [serverId, buddyId, sendWelcomeMessage, onComplete])

  // 轮询 Buddy 状态
  useEffect(() => {
    if (status !== 'waiting') return

    const interval = setInterval(async () => {
      try {
        const buddy = await fetchApi<BuddyAgent>(`/api/agents/${buddyId}`)
        const isOnline =
          buddy.lastHeartbeat && Date.now() - new Date(buddy.lastHeartbeat).getTime() < 90000

        if (isOnline) {
          clearInterval(interval)
          setStatus('adding')
          await addBuddyToServer()
        }
      } catch {
        // Ignore errors
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [buddyId, status, addBuddyToServer])

  // 倒计时
  useEffect(() => {
    if (status !== 'waiting') return

    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer)
          setStatus('timeout')
          return 0
        }
        return c - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [status])

  // 超时处理
  useEffect(() => {
    if (status === 'timeout') {
      const timer = setTimeout(onTimeout, 2000)
      return () => clearTimeout(timer)
    }
  }, [status, onTimeout])

  return (
    <div className="p-8 text-center">
      {status === 'waiting' && (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
            <Loader2 size={32} className="text-white animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">
            {t('buddyOnboarding.waiting', '等待 Buddy 上线...')}
          </h2>
          <p className="text-sm text-text-muted mb-4">
            {t('buddyOnboarding.waitingDesc', '请在 OpenClaw 桌面端完成配置')}
          </p>
          <div className="text-3xl font-bold text-primary mb-4">{countdown}s</div>
          <div className="w-full bg-bg-tertiary rounded-full h-2 mb-4">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-1000"
              style={{ width: `${((30 - countdown) / 30) * 100}%` }}
            />
          </div>
        </>
      )}

      {status === 'adding' && (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
            <Loader2 size={32} className="text-white animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">
            {t('buddyOnboarding.adding', '正在添加 Buddy 到服务器...')}
          </h2>
        </>
      )}

      {status === 'sending' && (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-400 to-violet-500 flex items-center justify-center">
            <MessageCircle size={32} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">
            {t('buddyOnboarding.sending', '发送欢迎消息...')}
          </h2>
        </>
      )}

      {status === 'done' && (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
            <Check size={32} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">
            {t('buddyOnboarding.ready', 'Buddy 已就绪！')}
          </h2>
        </>
      )}

      {status === 'timeout' && (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Server size={32} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">
            {t('buddyOnboarding.timeout', '等待超时')}
          </h2>
          <p className="text-sm text-text-muted mb-4">
            {t('buddyOnboarding.timeoutDesc', '你可以在设置中稍后配置 Buddy')}
          </p>
          <p className="text-xs text-text-muted">
            {t('buddyOnboarding.redirecting', '正在跳转到服务器...')}
          </p>
        </>
      )}
    </div>
  )
}

// Hook to check if onboarding should be shown
export function useOnboarding() {
  const shouldShow = () => false
  const markCompleted = () => {}
  return { shouldShow, markCompleted }
}
