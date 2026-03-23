import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Hash,
  MessageCircle,
  Plus,
  Rocket,
  Search,
  Server,
  SkipForward,
  Users,
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

type Step = 'welcome' | 'create-server' | 'join-server' | 'buddy' | 'complete'

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
  const user = useAuthStore((s) => s.user)
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
      // 保存服务器 ID，跳转到 Buddy 绑定步骤
      const serverId = data.slug || data.id
      setCreatedServerId(serverId)
      setStep('buddy')
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
      // 保存服务器 ID，跳转到 Buddy 绑定步骤
      const serverId = data.slug || data.id
      setCreatedServerId(serverId)
      setStep('buddy')
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
    // Mark onboarding as completed
    localStorage.setItem('shadow_onboarding_completed', 'true')
    onClose()
  }

  const handleSkip = () => {
    localStorage.setItem('shadow_onboarding_completed', 'true')
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

        {/* Buddy onboarding step */}
        {step === 'buddy' && createdServerId && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="w-20 h-20 mx-auto mb-6 relative">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 animate-pulse opacity-75" />
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
                  <Rocket size={40} className="text-white" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-text-primary mb-2">
                {t('buddyOnboarding.title', '让你的服务器活起来！')}
              </h2>
              <p className="text-text-muted">
                {t(
                  'buddyOnboarding.desc',
                  '添加 Buddy AI 助手，让它成为你的第一个队友',
                )}
              </p>
            </div>

            {/* Quick actions */}
            <div className="space-y-3 mb-6">
              <a
                href="https://openclaw.ai/download"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 bg-bg-tertiary hover:bg-bg-modifier-hover rounded-xl transition group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-text-primary group-hover:text-primary transition">
                    {t('buddyOnboarding.downloadOpenClaw', '下载 OpenClaw 桌面端')}
                  </p>
                  <p className="text-sm text-text-muted">
                    {t(
                      'buddyOnboarding.downloadOpenClawDesc',
                      '安装后打开，按向导完成 Buddy 绑定',
                    )}
                  </p>
                </div>
              </a>

              <div className="p-4 bg-bg-tertiary rounded-xl">
                <p className="text-sm text-text-muted mb-2">
                  {t('buddyOnboarding.commandLabel', '或在 OpenClaw 对话中输入：')}
                </p>
                <code className="block w-full p-3 bg-bg-secondary rounded-lg text-primary font-mono text-sm">
                  /buddy bind --server {createdServerId}
                </code>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('shadow_onboarding_completed', 'true')
                  onClose()
                  void navigate({
                    to: '/servers/$serverSlug',
                    params: { serverSlug: createdServerId },
                  })
                }}
                className="flex-1 py-3 text-text-muted hover:text-text-primary transition"
              >
                {t('common.skipForNow', '暂时跳过')}
              </button>
              <button
                type="button"
                onClick={() => setStep('complete')}
                className="flex-1 py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 transition"
              >
                {t('buddyOnboarding.bound', '已绑定 Buddy')}
              </button>
            </div>
          </div>
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
export function useOnboarding() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)

  const shouldShow = () => {
    if (!isAuthenticated || !user) return false
    return !localStorage.getItem('shadow_onboarding_completed')
  }

  const markCompleted = () => {
    localStorage.setItem('shadow_onboarding_completed', 'true')
  }

  return { shouldShow, markCompleted }
}
