import { Alert, AlertDescription, Button, Card, Input } from '@shadowob/ui'
import { useSearch } from '@tanstack/react-router'
import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  CreditCard,
  Gift,
  Lock,
  Play,
  Rocket,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, fetchApi } from '../lib/api'
import { getApiErrorMessage } from '../lib/api-errors'

type PlayAvailability = 'available' | 'gated' | 'coming_soon' | 'misconfigured'

type PlayCatalogItem = {
  id: string
  image: string
  title: string
  titleEn: string
  desc: string
  descEn: string
  category: string
  categoryEn: string
  starts: string
  accentColor: string
  hot?: boolean
  status: PlayAvailability
  action?: {
    kind: 'public_channel' | 'private_room' | 'cloud_deploy' | 'external_oauth_app' | 'landing_page'
    templateSlug?: string
  }
  gates?: {
    membership?: 'none' | 'required'
  }
  template?: {
    slug: string
  }
}

type PlayLaunchResult = {
  ok: boolean
  status: string
  redirectUrl?: string
  deploymentId?: string
  deploymentStatus?: string
  templateSlug?: string
}

type CloudDeploymentStatus = {
  id: string
  status: 'pending' | 'deploying' | 'deployed' | 'failed' | 'destroying' | 'destroyed' | string
  errorMessage?: string | null
  shadowServerId?: string | null
  shadowChannelId?: string | null
}

type ServerMeta = {
  id: string
  slug?: string | null
}

type LaunchPhase = 'loading' | 'ready' | 'launching' | 'gate' | 'wallet' | 'error'

type LaunchOptions = {
  inviteCode?: string
}

function resolveAppUrl(redirectUrl: string) {
  if (/^https?:\/\//.test(redirectUrl)) return redirectUrl
  if (redirectUrl.startsWith('/app/')) return redirectUrl
  if (redirectUrl === '/app') return redirectUrl
  return `/app${redirectUrl.startsWith('/') ? redirectUrl : `/${redirectUrl}`}`
}

function createLaunchSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatCoins(value?: number) {
  return (value ?? 0).toLocaleString()
}

async function resolveServerRedirectUrl(serverId: string, channelId?: string | null) {
  const server = await fetchApi<ServerMeta>(`/api/servers/${encodeURIComponent(serverId)}`)
  const serverPath = `/servers/${encodeURIComponent(server.slug ?? server.id)}`
  return channelId ? `${serverPath}/channels/${encodeURIComponent(channelId)}` : serverPath
}

function canLaunchPlay(play: PlayCatalogItem | null) {
  return play?.status === 'available' || play?.status === 'gated'
}

function playKind(play: PlayCatalogItem | null) {
  if (play?.action?.kind === 'cloud_deploy') return 'cloud'
  if (play?.action?.kind === 'private_room') return 'private'
  return 'community'
}

export function PlayLaunchPage() {
  const { t, i18n } = useTranslation()
  const search = useSearch({ strict: false }) as { play?: string }
  const launchSessionIdRef = useRef(createLaunchSessionId())
  const stepIndexRef = useRef(0)
  const [play, setPlay] = useState<PlayCatalogItem | null>(null)
  const [phase, setPhase] = useState<LaunchPhase>('loading')
  const [error, setError] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [typedStepText, setTypedStepText] = useState('')
  const [membershipGate, setMembershipGate] = useState<{
    capability?: string
    message: string
  } | null>(null)
  const [walletGate, setWalletGate] = useState<{
    requiredAmount?: number
    balance?: number
    shortfall?: number
  } | null>(null)

  const isZh = i18n.language.startsWith('zh')
  const title = play ? (isZh ? play.title : play.titleEn) : ''
  const description = play ? (isZh ? play.desc : play.descEn) : ''
  const category = play ? (isZh ? play.category : play.categoryEn) : ''
  const kind = playKind(play)
  const isCloud = kind === 'cloud'

  const launchSteps = useMemo(() => {
    const group = isCloud ? 'cloudSteps' : kind === 'private' ? 'privateSteps' : 'communitySteps'
    const detailGroup = `${group}Details`
    return [0, 1, 2, 3].map((index) => ({
      label: t(`playLaunch.${group}.${index}`),
      detail: t(`playLaunch.${detailGroup}.${index}`),
    }))
  }, [isCloud, kind, t])

  const activeStep = launchSteps[Math.min(stepIndex, launchSteps.length - 1)]

  const setLaunchStep = (index: number) => {
    stepIndexRef.current = index
    setStepIndex(index)
  }

  const advanceLaunchSteps = async (targetIndex: number, delayMs = 700) => {
    const target = Math.min(targetIndex, launchSteps.length - 1)
    while (stepIndexRef.current < target) {
      setLaunchStep(stepIndexRef.current + 1)
      await wait(delayMs)
    }
  }

  const waitForCloudServer = async (deploymentId: string) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 180_000) {
      const deployment = await fetchApi<CloudDeploymentStatus>(
        `/api/cloud-saas/deployments/${encodeURIComponent(deploymentId)}`,
      )
      if (deployment.status === 'deployed' && deployment.shadowServerId) {
        await advanceLaunchSteps(3, 900)
        return resolveServerRedirectUrl(deployment.shadowServerId, deployment.shadowChannelId)
      }
      if (deployment.status === 'failed') {
        throw new Error(deployment.errorMessage || t('playLaunch.cloudFailed'))
      }
      if (deployment.status === 'deploying') {
        if (stepIndexRef.current < 2) setLaunchStep(2)
      } else if (deployment.status === 'pending') {
        if (stepIndexRef.current < 1) setLaunchStep(1)
      }
      await wait(2400)
    }
    throw new Error(t('playLaunch.cloudTimeout'))
  }

  useEffect(() => {
    let cancelled = false
    async function loadPlay() {
      setPhase('loading')
      setError('')
      try {
        const response = await fetchApi<{ plays: PlayCatalogItem[] }>('/api/play/catalog')
        const selected = response.plays.find(
          (candidate) => candidate.id === search.play || candidate.template?.slug === search.play,
        )
        if (cancelled) return
        if (!selected) {
          setPhase('error')
          setError(t('playLaunch.notFound'))
          return
        }
        setPlay(selected)
        setPhase('ready')
      } catch (err) {
        if (cancelled) return
        setPhase('error')
        setError(getApiErrorMessage(err, t, 'playLaunch.loadFailed'))
      }
    }

    void loadPlay()
    return () => {
      cancelled = true
    }
  }, [search.play, t])

  useEffect(() => {
    if (phase !== 'launching' || !activeStep) {
      setTypedStepText('')
      return
    }
    const fullText = `${activeStep.label}\n${activeStep.detail}`
    setTypedStepText('')
    let cursor = 0
    const interval = window.setInterval(() => {
      cursor += 1
      setTypedStepText(fullText.slice(0, cursor))
      if (cursor >= fullText.length) window.clearInterval(interval)
    }, 24)
    return () => window.clearInterval(interval)
  }, [activeStep, phase])

  const launch = async (options: LaunchOptions = {}) => {
    if (!play || !canLaunchPlay(play)) return
    const normalizedInviteCode = options.inviteCode?.trim()
    setError('')
    setMembershipGate(null)
    setWalletGate(null)
    setPhase('launching')
    setLaunchStep(0)

    try {
      await wait(450)
      const result = await fetchApi<PlayLaunchResult>('/api/play/launch', {
        method: 'POST',
        body: JSON.stringify({
          playId: play.id,
          launchSessionId: launchSessionIdRef.current,
          locale: i18n.language,
          ...(normalizedInviteCode ? { inviteCode: normalizedInviteCode } : {}),
        }),
      })
      if (result.status === 'deploying') {
        await advanceLaunchSteps(1, 700)
      } else {
        await advanceLaunchSteps(2, 650)
      }
      if (result.redirectUrl) {
        await advanceLaunchSteps(3, 650)
        window.location.replace(resolveAppUrl(result.redirectUrl))
        return
      }
      if (isCloud && result.deploymentId) {
        const redirectUrl = await waitForCloudServer(result.deploymentId)
        await wait(650)
        window.location.replace(resolveAppUrl(redirectUrl))
        return
      }
      throw new Error(t('playLaunch.failed'))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVITE_REQUIRED') {
        setMembershipGate({ capability: err.capability, message: err.message })
        setPhase('gate')
        return
      }
      if (err instanceof ApiError && err.code === 'INVALID_INVITE_CODE') {
        setPhase('gate')
        setError(getApiErrorMessage(err, t, 'settings.membershipRedeemFailed'))
        return
      }
      if (
        err instanceof ApiError &&
        (err.code === 'WALLET_INSUFFICIENT_BALANCE' || err.code === 'PLAY_WALLET_INSUFFICIENT')
      ) {
        setWalletGate({
          requiredAmount: err.requiredAmount,
          balance: err.balance,
          shortfall: err.shortfall,
        })
        setPhase('wallet')
        return
      }
      setPhase('error')
      setError(getApiErrorMessage(err, t, 'playLaunch.failed'))
    }
  }

  const openTasks = () => {
    window.location.href = '/app/settings/tasks'
  }

  const openRecharge = () => {
    let acknowledged = false
    const ack = () => {
      acknowledged = true
    }
    window.addEventListener('shadow:open-recharge:ack', ack, { once: true })
    window.dispatchEvent(new CustomEvent('shadow:open-recharge'))
    window.setTimeout(() => {
      window.removeEventListener('shadow:open-recharge:ack', ack)
      if (!acknowledged) window.location.href = '/app/settings/wallet'
    }, 250)
  }

  const redeemInviteAndRetry = async () => {
    const normalizedInviteCode = inviteCode.trim()
    if (!normalizedInviteCode || redeeming) return
    setError('')
    setRedeeming(true)
    try {
      setMembershipGate(null)
      await launch({ inviteCode: normalizedInviteCode })
    } finally {
      setRedeeming(false)
    }
  }

  const statusLabel = play?.status === 'gated' ? t('playLaunch.memberPlay') : t('playLaunch.ready')
  const kindLabel =
    kind === 'cloud'
      ? t('playLaunch.cloudPlay')
      : kind === 'private'
        ? t('playLaunch.privatePlay')
        : t('playLaunch.communityPlay')

  return (
    <div className="min-h-screen bg-bg-deep px-4 py-8 text-text-primary">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <Card variant="glass" className="overflow-hidden border-white/10">
            <div className="relative min-h-[540px]">
              {play?.image ? (
                <img
                  src={play.image}
                  alt={title}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-purple-500/20 to-cyan-500/20" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-bg-deep via-bg-deep/70 to-bg-deep/15" />
              <div className="relative flex h-full min-h-[540px] flex-col justify-between p-7 sm:p-9">
                <a
                  href="/"
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-bg-secondary/30 px-4 py-2 text-sm font-semibold text-text-secondary no-underline transition hover:bg-white/10 hover:text-text-primary"
                >
                  <ArrowLeft size={16} />
                  {t('playLaunch.backHome')}
                </a>

                <div className="max-w-2xl">
                  {play ? (
                    <div className="mb-5 flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide text-bg-deep"
                        style={{ backgroundColor: play.accentColor }}
                      >
                        {category}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-text-secondary">
                        {kind === 'cloud' ? <Cloud size={13} /> : <Users size={13} />}
                        {kindLabel}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-text-secondary">
                        <CheckCircle2 size={13} />
                        {statusLabel}
                      </span>
                    </div>
                  ) : null}

                  <h1 className="text-4xl font-black leading-tight tracking-normal text-text-primary sm:text-5xl">
                    {phase === 'loading' ? t('playLaunch.loadingPlay') : title}
                  </h1>
                  <p className="mt-5 max-w-xl text-base font-medium leading-7 text-text-secondary sm:text-lg">
                    {phase === 'loading' ? t('playLaunch.loadingPlayDesc') : description}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card variant="glass" className="flex flex-col justify-center border-white/10 p-7 sm:p-8">
            {phase === 'launching' ? (
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-primary/30 bg-primary/15">
                  <Rocket className="animate-pulse text-primary" size={36} />
                </div>
                <h2 className="text-2xl font-black">{t('playLaunch.animatingTitle')}</h2>
                <p className="mt-3 text-sm font-medium leading-6 text-text-muted">
                  {t('playLaunch.animatingSubtitle')}
                </p>
                <div className="mt-8 rounded-3xl border border-white/10 bg-bg-secondary/20 p-5 text-left">
                  {launchSteps.map((step, index) => {
                    const active = index === stepIndex
                    const done = index < stepIndex
                    return (
                      <div
                        key={step.label}
                        className={`flex items-center gap-3 rounded-2xl px-3 py-3 transition ${
                          active ? 'bg-primary/15 text-text-primary' : 'text-text-muted'
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                            active || done ? 'bg-primary text-bg-deep' : 'bg-white/10 text-white/50'
                          }`}
                        >
                          {done ? <CheckCircle2 size={15} /> : index + 1}
                        </span>
                        <span className="text-sm font-bold">{step.label}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-5 min-h-[92px] rounded-3xl border border-primary/20 bg-primary/10 p-5 text-left">
                  <p className="text-sm font-black text-primary">
                    {typedStepText.split('\n')[0]}
                    <span className="animate-pulse">|</span>
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-white/65">
                    {typedStepText.split('\n').slice(1).join('\n')}
                  </p>
                </div>
              </div>
            ) : phase === 'gate' ? (
              <div className="space-y-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/10 text-amber-200">
                  <Lock size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-black">{t('playLaunch.inviteRequiredTitle')}</h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-text-muted">
                    {t('playLaunch.inviteRequiredBody')}
                  </p>
                </div>
                {error ? (
                  <Alert variant="destructive" className="text-left">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <Input
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder={t('playLaunch.inviteCodePlaceholder')}
                  className="font-mono tracking-widest"
                />
                <Button
                  type="button"
                  className="w-full rounded-full"
                  disabled={!inviteCode.trim() || redeeming}
                  loading={redeeming}
                  onClick={redeemInviteAndRetry}
                >
                  {redeeming ? t('playLaunch.redeemingInvite') : t('playLaunch.redeemInvite')}
                </Button>
              </div>
            ) : phase === 'wallet' ? (
              <div className="space-y-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-warning/25 bg-warning/10 text-warning">
                  <Wallet size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-black">{t('playLaunch.walletRequiredTitle')}</h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-text-muted">
                    {t('playLaunch.walletRequiredBody')}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-bold text-text-muted">
                      {t('playLaunch.walletCost')}
                    </p>
                    <p className="mt-2 text-xl font-black">
                      {formatCoins(walletGate?.requiredAmount)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-bold text-text-muted">
                      {t('playLaunch.walletBalance')}
                    </p>
                    <p className="mt-2 text-xl font-black">{formatCoins(walletGate?.balance)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-bold text-text-muted">
                      {t('playLaunch.walletShortfall')}
                    </p>
                    <p className="mt-2 text-xl font-black">{formatCoins(walletGate?.shortfall)}</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button type="button" className="rounded-full" onClick={openTasks}>
                    <Gift size={17} />
                    {t('playLaunch.goTasks')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-full"
                    onClick={openRecharge}
                  >
                    <CreditCard size={17} />
                    {t('playLaunch.goRecharge')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                  {isCloud ? <Cloud size={28} /> : <Sparkles size={28} />}
                </div>
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-primary">
                    {t('playLaunch.landingEyebrow')}
                  </p>
                  <h2 className="text-2xl font-black">{t('playLaunch.landingTitle')}</h2>
                  <p className="mt-3 text-sm font-medium leading-6 text-text-muted">
                    {isCloud
                      ? t('playLaunch.cloudLandingBody')
                      : kind === 'private'
                        ? t('playLaunch.privateLandingBody')
                        : t('playLaunch.communityLandingBody')}
                  </p>
                </div>

                {play ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs font-bold text-text-muted">
                        {t('playLaunch.popularity')}
                      </p>
                      <p className="mt-2 text-xl font-black">{play.starts}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs font-bold text-text-muted">{t('playLaunch.access')}</p>
                      <p className="mt-2 text-xl font-black">{statusLabel}</p>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <Alert variant="destructive" className="text-left">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                <Button
                  type="button"
                  className="h-12 w-full rounded-full text-base font-black"
                  disabled={phase === 'loading' || !canLaunchPlay(play)}
                  onClick={() => void launch()}
                >
                  <Play size={17} fill="currentColor" />
                  {phase === 'loading'
                    ? t('playLaunch.loading')
                    : phase === 'error'
                      ? t('playLaunch.retry')
                      : isCloud
                        ? t('playLaunch.startCloud')
                        : t('playLaunch.start')}
                </Button>

                <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-bg-secondary/20 p-4 text-sm font-medium leading-6 text-text-muted">
                  <Shield className="mt-0.5 shrink-0 text-primary" size={18} />
                  <span>{t('playLaunch.noConfigHint')}</span>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
