import { Button, Card, Dialog, DialogContent, Input } from '@shadowob/ui'
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
import { NewcomerGuide } from './newcomer-guide'
import { RentalGuide } from './rental-guide'

interface OnboardingModalProps {
  open: boolean
  onClose: () => void
}

type Step =
  | 'newcomer-guide'
  | 'rent-buddy'
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
    color: 'text-primary',
  },
  {
    icon: Rocket,
    titleKey: 'onboarding.featureAI',
    descKey: 'onboarding.featureAIDesc',
    color: 'text-warning',
  },
  {
    icon: Globe,
    titleKey: 'onboarding.featureCommunity',
    descKey: 'onboarding.featureCommunityDesc',
    color: 'text-info',
  },
  {
    icon: Hash,
    titleKey: 'onboarding.featureChannels',
    descKey: 'onboarding.featureChannelsDesc',
    color: 'text-info',
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
  const [step, setStep] = useState<Step>('newcomer-guide')
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
      <div className="px-8 py-8 mt-2">
        <div className="flex justify-between">
          {timelineSteps.map((s, idx) => {
            const isCompleted = idx < currentIndex
            const isCurrent = idx === currentIndex
            return (
              <div key={s.id} className="flex flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
                      isCompleted
                        ? 'bg-primary text-bg-deep'
                        : isCurrent
                          ? 'bg-primary/20 text-primary border-2 border-primary'
                          : 'bg-bg-tertiary/30 backdrop-blur-xl border border-border-subtle text-text-muted'
                    }`}
                  >
                    {isCompleted ? <Check size={14} /> : idx + 1}
                  </div>
                  <span
                    className={`text-[11px] mt-1 hidden md:block font-black uppercase tracking-widest ${
                      isCurrent ? 'text-primary' : 'text-text-muted'
                    }`}
                  >
                    {t(s.labelKey, s.labelDefault)}
                  </span>
                </div>
                {idx < timelineSteps.length - 1 && (
                  <div className="flex-1 h-8 flex items-center mx-2">
                    <div
                      className={`w-full h-0.5 ${isCompleted ? 'bg-primary' : 'bg-bg-tertiary'}`}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <Dialog isOpen={open} onClose={onClose}>
      <DialogContent className="!rounded-[40px] !max-w-3xl !p-0 !max-h-[90vh] overflow-hidden">
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          icon={X}
          onClick={onClose}
          className="absolute top-4 right-4 z-10 !h-9 !w-9"
        />

        {/* Timeline - PC only */}
        {!isMobile &&
          step !== 'newcomer-guide' &&
          step !== 'rent-buddy' &&
          step !== 'welcome' &&
          step !== 'complete' && <Timeline />}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Newcomer Guide */}
          {step === 'newcomer-guide' && (
            <NewcomerGuide
              onHaveBuddy={() => setStep('welcome')}
              onNoBuddy={() => setStep('rent-buddy')}
            />
          )}

          {/* Rental Guide */}
          {step === 'rent-buddy' && (
            <RentalGuide
              onRentSuccess={async (listingId, contractId) => {
                onClose()
                // Fetch contract to get agentUserId
                try {
                  const contract = await fetchApi<{ agentUserId: string | null }>(
                    `/api/marketplace/contracts/${contractId}`,
                  )
                  if (contract.agentUserId) {
                    // Create DM channel
                    const channel = await fetchApi<{ id: string }>('/api/dm/channels', {
                      method: 'POST',
                      body: JSON.stringify({ userId: contract.agentUserId }),
                    })
                    // Navigate to DM
                    navigate({
                      to: '/settings',
                      // Cast to any to avoid strict route typing issues if validation is missing
                      search: { tab: 'chat', dm: channel.id } as any,
                    })
                  }
                } catch (e) {
                  console.error('Failed to setup DM', e)
                  // Fallback to contract page
                  navigate({
                    to: '/marketplace/contracts/$contractId',
                    params: { contractId },
                  })
                }
              }}
              onBack={() => setStep('newcomer-guide')}
            />
          )}

          {/* Welcome step */}
          {step === 'welcome' && (
            <div className="p-8">
              <div className="text-center mb-8">
                <div className="w-24 h-24 mx-auto mb-6 relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary via-primary to-info animate-pulse opacity-75" />
                  <div className="relative w-24 h-24 rounded-2xl bg-gradient-to-br from-primary to-primary flex items-center justify-center shadow-lg shadow-primary/25">
                    <Server size={48} className="text-bg-deep" />
                  </div>
                </div>
                <h1 className="text-2xl font-black uppercase tracking-tight text-text-primary mb-2">
                  {t('onboarding.welcome', '欢迎来到 Shadow！')}
                </h1>
                <p className="text-text-muted text-sm">
                  {t('onboarding.welcomeDesc', '构建你的 AI 社区，让 AI 搭子成为你的队友')}
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
                          <Card variant="glass" className="!rounded-[40px]">
                            <div className="p-6 text-center">
                              <feature.icon size={32} className={`mx-auto mb-3 ${feature.color}`} />
                              <h3 className="font-black text-text-primary mb-1">
                                {t(feature.titleKey)}
                              </h3>
                              <p className="text-sm text-text-muted font-bold italic">
                                {t(feature.descKey)}
                              </p>
                            </div>
                          </Card>
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
                    <Card key={idx} variant="glass" hoverable className="!rounded-[40px]">
                      <div className="p-4 text-center">
                        <feature.icon size={24} className={`mx-auto mb-2 ${feature.color}`} />
                        <h3 className="font-black text-text-primary text-sm">
                          {t(feature.titleKey)}
                        </h3>
                        <p className="text-xs text-text-muted font-bold italic mt-1">
                          {t(feature.descKey)}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" icon={SkipForward} onClick={handleSkip}>
                  {t('common.skip', '跳过')}
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  iconRight={ArrowRight}
                  onClick={() => setStep('create-server')}
                >
                  {t('onboarding.getStarted', '开始使用')}
                </Button>
              </div>
            </div>
          )}

          {/* Create server step */}
          {step === 'create-server' && (
            <div className="p-8">
              <Button
                variant="ghost"
                size="icon"
                icon={ChevronLeft}
                onClick={() => setStep('welcome')}
                className="mb-4"
              />

              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-success to-success flex items-center justify-center shadow-lg shadow-success/25">
                  <Plus size={32} className="text-bg-deep" />
                </div>
                <h2 className="text-xl font-black uppercase tracking-tight text-text-primary mb-2">
                  {t('onboarding.createServer', '创建你的服务器')}
                </h2>
                <p className="text-text-muted text-sm">
                  {t('onboarding.createServerDesc', '给你的社区起个名字')}
                </p>
              </div>

              <div className="mb-6">
                <Input
                  label={t('onboarding.serverName', '服务器名称')}
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder={t('onboarding.serverNamePlaceholder', '我的社区')}
                />
              </div>

              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={() => setStep('join-server')}>
                  {t('onboarding.joinInstead', '加入现有服务器')}
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => createServer.mutate(serverName || '我的社区')}
                  loading={createServer.isPending}
                >
                  {createServer.isPending
                    ? t('common.creating', '创建中...')
                    : t('onboarding.create', '创建服务器')}
                </Button>
              </div>

              {createServer.isError && (
                <p className="mt-3 text-sm text-danger text-center font-black">
                  {t('onboarding.createError', '创建失败，请重试')}
                </p>
              )}
            </div>
          )}

          {/* Join server step */}
          {step === 'join-server' && (
            <div className="p-8">
              <Button
                variant="ghost"
                size="icon"
                icon={ChevronLeft}
                onClick={() => setStep('create-server')}
                className="mb-4"
              />

              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-info to-info flex items-center justify-center shadow-lg shadow-info/25">
                  <Search size={32} className="text-white" />
                </div>
                <h2 className="text-xl font-black uppercase tracking-tight text-text-primary mb-2">
                  {t('onboarding.joinServer', '加入服务器')}
                </h2>
                <p className="text-text-muted text-sm">
                  {t('onboarding.joinServerDesc', '输入邀请码或选择公开服务器')}
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-black uppercase tracking-widest text-text-primary mb-2">
                  {t('onboarding.inviteCode', '邀请码')}
                </label>
                <div className="flex gap-2">
                  <Input
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="XXXXXX"
                    className="flex-1 font-mono uppercase"
                  />
                  <Button
                    variant="primary"
                    onClick={() => inviteCode && joinServer.mutate(inviteCode)}
                    loading={joinServer.isPending}
                    disabled={!inviteCode}
                  >
                    {joinServer.isPending ? '...' : t('common.join', '加入')}
                  </Button>
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
                      className="w-full flex items-center gap-3 p-3 bg-bg-tertiary/30 backdrop-blur-xl border border-border-subtle hover:border-primary/30 rounded-2xl transition text-left"
                    >
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary flex items-center justify-center text-bg-deep font-black">
                        {server.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-text-primary truncate">{server.name}</p>
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

              <Button variant="ghost" className="w-full" onClick={handleComplete}>
                {t('onboarding.skipForNow', '暂时跳过')}
              </Button>
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
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-success to-success flex items-center justify-center shadow-lg shadow-success/25">
                <Check size={40} className="text-bg-deep" />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-text-primary mb-2">
                {t('onboarding.allSet', '一切就绪！')}
              </h2>
              <p className="text-text-muted font-bold italic mb-8">
                {t('onboarding.allSetDesc', '你已准备好开始使用 Shadow')}
              </p>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={handleNavigateToServer}
              >
                {t('onboarding.goToServer', '进入服务器')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
  const [name, setName] = useState('AI 搭子')
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
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-accent to-accent flex items-center justify-center shadow-lg shadow-accent/25">
          <Bot size={32} className="text-bg-deep" />
        </div>
        <h2 className="text-xl font-black uppercase tracking-tight text-text-primary mb-2">
          {t('buddyOnboarding.createTitle', '创建你的 AI 搭子')}
        </h2>
        <p className="text-sm text-text-muted">
          {t('buddyOnboarding.createDesc', '给你的 AI 搭子起个名字，它将在频道中与你对话')}
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <Input
            label={t('buddyOnboarding.buddyName', '搭子名称')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="AI 搭子"
            maxLength={64}
          />
        </div>

        <div>
          <Input
            label={t('buddyOnboarding.buddyUsername', '用户名')}
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
            placeholder="buddy_xxx"
            className="font-mono"
            maxLength={32}
          />
          <p className="text-xs text-text-muted mt-1">@{username || 'buddy_xxx'}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-2xl text-sm text-danger font-black backdrop-blur-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={onSkip}>
          {t('common.skipForNow', '暂时跳过')}
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={handleCreate}
          loading={creating}
          disabled={!name.trim()}
          icon={creating ? Loader2 : Plus}
        >
          {creating
            ? t('common.creating', '创建中...')
            : t('buddyOnboarding.createBuddy', '创建 Buddy')}
        </Button>
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
    <div className="p-8 pt-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black uppercase tracking-tight text-text-primary mb-1">
          {t('buddyOnboarding.configTitle', '配置 Buddy 连接')}
        </h2>
        <p className="text-sm text-text-muted">
          {t('buddyOnboarding.configDesc', '使用 Shadow 桌面端连接你的 Buddy')}
        </p>
      </div>

      {/* Token display */}
      <div className="mb-6">
        <label className="block text-xs font-black uppercase text-text-muted mb-2 tracking-widest">
          {t('buddyOnboarding.yourToken', '你的 Token')}
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 p-3 bg-bg-tertiary/30 backdrop-blur-xl border border-border-subtle rounded-2xl text-primary font-mono text-sm overflow-x-auto scrollbar-thin">
            {token}
          </code>
          <Button
            variant="ghost"
            size="icon"
            icon={copied ? Check : Copy}
            onClick={() => handleCopy(token)}
            className={copied ? 'text-success' : ''}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Method 1: Download desktop */}
        <Card variant="glass" className="!rounded-[40px]">
          <div className="p-4">
            <h3 className="text-sm font-black text-text-primary mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-black">
                1
              </span>
              {t('buddyOnboarding.method1', '使用桌面端')}
            </h3>
            <a
              href="https://github.com/buggyblues/shadow/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center p-3 bg-bg-tertiary/30 border border-border-subtle hover:border-primary/30 rounded-2xl transition mb-2"
            >
              <Download size={20} className="mx-auto mb-1 text-primary" />
              <span className="text-xs font-black text-text-primary">
                {t('buddyOnboarding.downloadDesktopApp', '下载 Shadow 桌面端')}
              </span>
            </a>
          </div>
        </Card>

        {/* Method 2: Command */}
        <Card variant="glass" className="!rounded-[40px]">
          <div className="p-4">
            <h3 className="text-sm font-black text-text-primary mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-black">
                2
              </span>
              {t('buddyOnboarding.method2', '使用命令')}
            </h3>
            <div className="p-2 bg-bg-tertiary/30 border border-border-subtle rounded-2xl mb-2 flex items-center gap-2">
              <code className="flex-1 text-[11px] text-text-secondary font-mono truncate">
                {bindCommand}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(bindCommand)}
                className="text-text-muted hover:text-primary transition shrink-0"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex gap-3 mt-auto">
        <Button variant="ghost" className="flex-1" onClick={onSkip}>
          {t('common.skipForNow', '稍后配置')}
        </Button>
        <Button variant="primary" className="flex-1" onClick={onConfigured}>
          {t('buddyOnboarding.configured', '我已配置完成')}
        </Button>
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
            content: '👋 大家好！我是 AI 搭子，有什么可以帮助你们的吗？',
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
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-primary flex items-center justify-center shadow-lg shadow-primary/25">
            <Loader2 size={32} className="text-bg-deep animate-spin" />
          </div>
          <h2 className="text-xl font-black text-text-primary mb-2">
            {t('buddyOnboarding.waiting', '等待 Buddy 上线...')}
          </h2>
          <p className="text-sm text-text-muted mb-4">
            {t('buddyOnboarding.waitingDesc', '请在 Shadow 桌面端完成配置')}
          </p>
          <div className="text-3xl font-black text-primary mb-4">{countdown}s</div>
          <div className="w-full bg-bg-tertiary/30 border border-border-subtle rounded-full h-2 mb-4">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-1000"
              style={{ width: `${((30 - countdown) / 30) * 100}%` }}
            />
          </div>
        </>
      )}

      {status === 'adding' && (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-success to-success flex items-center justify-center shadow-lg shadow-success/25">
            <Loader2 size={32} className="text-bg-deep animate-spin" />
          </div>
          <h2 className="text-xl font-black text-text-primary mb-2">
            {t('buddyOnboarding.adding', '正在添加 Buddy 到服务器...')}
          </h2>
        </>
      )}

      {status === 'sending' && (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-info to-info flex items-center justify-center shadow-lg shadow-info/25">
            <MessageCircle size={32} className="text-white" />
          </div>
          <h2 className="text-xl font-black text-text-primary mb-2">
            {t('buddyOnboarding.sending', '发送欢迎消息...')}
          </h2>
        </>
      )}

      {status === 'done' && (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-success to-success flex items-center justify-center shadow-lg shadow-success/25">
            <Check size={32} className="text-bg-deep" />
          </div>
          <h2 className="text-xl font-black text-text-primary mb-2">
            {t('buddyOnboarding.ready', 'Buddy 已就绪！')}
          </h2>
        </>
      )}

      {status === 'timeout' && (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-accent to-accent flex items-center justify-center shadow-lg shadow-accent/25">
            <Server size={32} className="text-bg-deep" />
          </div>
          <h2 className="text-xl font-black text-text-primary mb-2">
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
