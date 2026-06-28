import {
  Button,
  DecorativeImage,
  cn,
  GlassPanel,
  Modal,
  ModalBody,
  ModalContent,
} from '@shadowob/ui'
import {
  CheckCircle2,
  Clock,
  Compass,
  DoorOpen,
  Lock,
  type LucideIcon,
  Send,
  Sparkles,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const NEWCOMER_LANDING_DISMISSED_KEY = 'shadow.newcomerLanding.dismissed:v1'
const PLAY_LAUNCH_ENTRY_KEY = 'shadow.playLaunch.redirected:v1'
const PLAY_LAUNCH_ENTRY_TTL_MS = 10 * 60 * 1000

export function markPlayLaunchRedirectEntry() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(PLAY_LAUNCH_ENTRY_KEY, String(Date.now()))
  } catch {
    // Session storage is best-effort; the landing remains usable without it.
  }
}

function consumePlayLaunchRedirectEntry() {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.sessionStorage.getItem(PLAY_LAUNCH_ENTRY_KEY)
    if (!raw) return false
    window.sessionStorage.removeItem(PLAY_LAUNCH_ENTRY_KEY)
    const timestamp = Number(raw)
    return Number.isFinite(timestamp) && Date.now() - timestamp < PLAY_LAUNCH_ENTRY_TTL_MS
  } catch {
    return false
  }
}

function newcomerLandingDismissed(userId?: string | null) {
  if (typeof window === 'undefined' || !userId) return true
  try {
    return window.localStorage.getItem(`${NEWCOMER_LANDING_DISMISSED_KEY}:${userId}`) === '1'
  } catch {
    return true
  }
}

function dismissNewcomerLanding(userId?: string | null) {
  if (typeof window === 'undefined' || !userId) return
  try {
    window.localStorage.setItem(`${NEWCOMER_LANDING_DISMISSED_KEY}:${userId}`, '1')
  } catch {
    // Dismissal persistence is a convenience only.
  }
}

type ServerLandingMode = 'public' | 'private'

export function ServerLandingPanel({
  server,
  mode,
  pending,
  loading,
  onJoin,
}: {
  server?: {
    name?: string | null
    description?: string | null
    iconUrl?: string | null
    bannerUrl?: string | null
    isPublic?: boolean
  } | null
  mode: ServerLandingMode
  pending?: boolean
  loading?: boolean
  onJoin: () => void
}) {
  const { t } = useTranslation()
  const isPublic = mode === 'public'
  const title = server?.name || (isPublic ? t('server.publicServer') : t('server.privateServer'))
  const description =
    server?.description ||
    (isPublic ? t('server.publicServerGateDesc') : t('server.privateServerGateDesc'))
  const cta = isPublic ? t('server.joinPublicServer') : t('server.requestAccess')

  return (
    <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <GlassPanel className="grid w-full max-w-4xl overflow-hidden p-0 md:grid-cols-[minmax(0,0.95fr)_minmax(340px,1.05fr)]">
        <div className="relative min-h-[260px] overflow-hidden bg-bg-secondary/40">
          {server?.bannerUrl ? (
            <DecorativeImage
              src={server.bannerUrl}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <DecorativeImage
              src="/landing/community-onboarding.png"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-tr from-bg-primary/90 via-bg-primary/20 to-transparent" />
          <div className="absolute bottom-5 left-5 flex items-center gap-3">
            <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-white/20 bg-bg-primary/75 text-xl font-black text-text-primary shadow-xl backdrop-blur">
              {server?.iconUrl ? (
                <DecorativeImage src={server.iconUrl} className="h-full w-full object-cover" />
              ) : isPublic ? (
                <Users size={28} />
              ) : (
                <Lock size={28} />
              )}
            </div>
            <span className="rounded-full border border-white/18 bg-bg-primary/70 px-3 py-1 text-xs font-black text-text-secondary backdrop-blur">
              {isPublic ? t('server.publicBadge') : t('server.privateServer')}
            </span>
          </div>
        </div>
        <div className="flex min-h-[320px] flex-col justify-center p-6 sm:p-8">
          <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            {pending ? <Clock size={24} /> : isPublic ? <DoorOpen size={24} /> : <Lock size={24} />}
          </div>
          <h1 className="text-2xl font-black leading-tight text-text-primary sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 max-w-xl text-sm font-bold leading-6 text-text-muted">{description}</p>
          <div className="mt-6 grid gap-3 text-left text-sm text-text-secondary sm:grid-cols-3">
            {(
              [
                { key: 'server.landingBenefitPeople', icon: Users },
                { key: 'server.landingBenefitBuddies', icon: Sparkles },
                { key: 'server.landingBenefitStart', icon: Compass },
              ] satisfies Array<{ key: string; icon: LucideIcon }>
            ).map(({ key, icon: Icon }) => (
              <div
                key={key}
                className="rounded-xl border border-border-subtle bg-bg-secondary/45 p-3"
              >
                <Icon size={17} className="mb-2 text-primary" />
                <span className="font-bold">{t(key)}</span>
              </div>
            ))}
          </div>
          <Button
            type="button"
            className="mt-7 h-12 w-full rounded-xl sm:w-auto"
            disabled={pending || loading}
            loading={loading}
            onClick={onJoin}
          >
            {pending ? <Clock size={16} /> : isPublic ? <DoorOpen size={16} /> : <Send size={16} />}
            <span>{pending ? t('server.requestPending') : cta}</span>
          </Button>
        </div>
      </GlassPanel>
    </div>
  )
}

export function NewcomerLandingModal({
  enabled,
  userId,
}: {
  enabled: boolean
  userId?: string | null
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setOpen(false)
      return
    }
    if (!userId) return
    if (newcomerLandingDismissed(userId)) return
    if (consumePlayLaunchRedirectEntry()) return
    setOpen(true)
  }, [enabled, userId])

  const close = () => {
    dismissNewcomerLanding(userId)
    setOpen(false)
  }

  const steps = [
    {
      icon: Users,
      title: t('serverLanding.stepCommunityTitle'),
      body: t('serverLanding.stepCommunityBody'),
    },
    {
      icon: Sparkles,
      title: t('serverLanding.stepBuddiesTitle'),
      body: t('serverLanding.stepBuddiesBody'),
    },
    {
      icon: CheckCircle2,
      title: t('serverLanding.stepStartTitle'),
      body: t('serverLanding.stepStartBody'),
    },
  ]

  return (
    <Modal open={open} onClose={close}>
      <ModalContent maxWidth="max-w-3xl" className="overflow-hidden p-0">
        <ModalBody className="p-0">
          <div className="grid overflow-hidden rounded-2xl bg-bg-primary text-text-primary md:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <div className="relative min-h-[260px] md:min-h-full">
              <DecorativeImage
                src="/landing/community-onboarding.png"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-bg-primary/65 via-transparent to-transparent md:bg-gradient-to-r" />
            </div>
            <div className="p-6 sm:p-7">
              <div className="mb-3 inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                {t('serverLanding.eyebrow')}
              </div>
              <h2 className="text-2xl font-black leading-tight">{t('serverLanding.title')}</h2>
              <p className="mt-3 text-sm font-bold leading-6 text-text-muted">
                {t('serverLanding.body')}
              </p>
              <div className="mt-6 space-y-3">
                {steps.map((step, index) => (
                  <div
                    key={step.title}
                    className={cn(
                      'grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 rounded-xl border border-border-subtle bg-bg-secondary/45 p-3',
                      index === steps.length - 1 && 'border-primary/25 bg-primary/8',
                    )}
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-bg-tertiary/75 text-primary">
                      <step.icon size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black">{step.title}</h3>
                      <p className="mt-1 text-xs font-bold leading-5 text-text-muted">
                        {step.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" className="mt-6 h-11 w-full rounded-xl" onClick={close}>
                {t('serverLanding.cta')}
              </Button>
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
