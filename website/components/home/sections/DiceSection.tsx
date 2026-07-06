import confetti from 'canvas-confetti'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n, usePageData } from 'rspress/runtime'
import { spaceIconPath } from '../../../data/spaceIcons'
import { SpaceStickerIcon } from '../../icons/SpaceStickerIcon'
import { CategoryBadge } from '../cards/CategoryBadge'
import { ServerEntryCta } from '../primitives/ServerEntryCta'
import type { Play } from '../types'

const SCAN_DURATION_MS = 1800
const RADAR_FRAME_MS = 150
const RADAR_FRAME_NAMES = [
  'radar-frame-1',
  'radar-frame-2',
  'radar-frame-3',
  'radar-frame-4',
  'radar-frame-5',
] as const

export function DiceSection({
  isLoading = false,
  isZh,
  plays,
}: {
  isLoading?: boolean
  isZh: boolean
  plays: Play[]
}) {
  const t = useI18n()
  const { siteData } = usePageData()
  const base = (siteData.base || '/').replace(/\/$/, '')
  const [rolling, setRolling] = useState(false)
  const [scanFrameIndex, setScanFrameIndex] = useState(0)
  const [modalPlay, setModalPlay] = useState<Play | null>(null)
  const scanTimeoutRef = useRef<number | null>(null)
  const canRoll = !isLoading && !rolling && plays.length > 0
  const radarSrc = spaceIconPath(RADAR_FRAME_NAMES[rolling ? scanFrameIndex : 0], base)
  const statusText = isLoading
    ? t('home.random.loading')
    : plays.length === 0
      ? t('home.random.empty')
      : rolling
        ? t('home.random.rolling')
        : null

  useEffect(() => {
    if (!rolling) {
      setScanFrameIndex(0)
      return
    }

    const interval = window.setInterval(() => {
      setScanFrameIndex((current) => (current + 1) % RADAR_FRAME_NAMES.length)
    }, RADAR_FRAME_MS)

    return () => window.clearInterval(interval)
  }, [rolling])

  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current)
    }
  }, [])

  const scanForSpace = () => {
    if (!canRoll) return
    setModalPlay(null)
    setScanFrameIndex(0)
    setRolling(true)

    if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current)
    scanTimeoutRef.current = window.setTimeout(() => {
      const randomPlay = plays[Math.floor(Math.random() * plays.length)]
      setModalPlay(randomPlay)
      setRolling(false)
      scanTimeoutRef.current = null
    }, SCAN_DURATION_MS)
  }

  return (
    <>
      <section className="home-radar-discovery-section">
        <div className="home-radar-section-content">
          <h2
            style={{
              fontSize: '26px',
              fontWeight: 900,
              color: 'var(--rp-c-text-1)',
              marginBottom: '8px',
              marginTop: 0,
              fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
            }}
          >
            {t('home.random.title')}
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--shadow-text-muted)',
              fontWeight: 600,
              marginBottom: '40px',
            }}
          >
            {t('home.random.subtitle')}
          </p>

          <button
            type="button"
            className={`home-radar-button${rolling ? ' is-scanning' : ''}`}
            disabled={!canRoll}
            onClick={scanForSpace}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              scanForSpace()
            }}
            aria-label={t('home.random.rollAria')}
          >
            <img src={radarSrc} alt="" className="home-radar-image" draggable={false} />
          </button>

          {statusText && (
            <p
              style={{
                fontSize: '14px',
                color: rolling ? 'var(--shadow-accent)' : 'var(--shadow-text-muted)',
                fontWeight: 700,
                marginBottom: '24px',
              }}
            >
              {statusText}
            </p>
          )}

          {!rolling && (
            <button
              type="button"
              className="btn-secondary"
              disabled={!canRoll}
              onClick={scanForSpace}
              style={{
                fontSize: '13px',
                padding: '12px 28px',
                gap: '8px',
                opacity: canRoll ? 1 : 0.55,
                cursor: canRoll ? 'pointer' : 'not-allowed',
              }}
            >
              {t('home.random.roll')}
            </button>
          )}
        </div>
      </section>

      {/* Radar result modal */}
      {modalPlay && !rolling && (
        <DiceModal
          play={modalPlay}
          isZh={isZh}
          onClose={() => setModalPlay(null)}
          onRollAgain={() => {
            setModalPlay(null)
            scanForSpace()
          }}
        />
      )}
    </>
  )
}

/* ─── Radar result modal with confetti ─── */

const CONFETTI_COLORS = [
  '#00f3ff',
  '#f8e71c',
  '#a78bfa',
  '#f472b6',
  '#34d399',
  '#fb923c',
  '#f87171',
]

function fireConfetti() {
  const end = Date.now() + 1800
  const frame = () => {
    confetti({
      particleCount: 6,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
      colors: CONFETTI_COLORS,
    })
    confetti({
      particleCount: 6,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
      colors: CONFETTI_COLORS,
    })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
}

function DiceModal({
  play,
  isZh,
  onClose,
  onRollAgain,
}: {
  play: Play
  isZh: boolean
  onClose: () => void
  onRollAgain: () => void
}) {
  const t = useI18n()
  const title = isZh ? play.title : (play.titleEn ?? play.title)
  const desc = (isZh ? play.desc : play.descEn) || t('home.random.serverFallbackDesc')
  const category = t('home.random.publicServerCategory')

  useEffect(() => {
    fireConfetti()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5,5,8,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'modalFadeIn 0.22s ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          background: 'var(--rp-c-bg, #12121a)',
          border: '1px solid rgba(0,243,255,0.22)',
          borderRadius: '32px',
          maxWidth: '460px',
          width: '100%',
          overflow: 'hidden',
          animation: 'modalSlideUp 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 48px rgba(0,243,255,0.08)',
        }}
      >
        {/* Image */}
        <div style={{ position: 'relative', height: '220px', overflow: 'hidden', flexShrink: 0 }}>
          {play.image ? (
            <img
              src={play.image}
              alt={title}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              aria-hidden
              style={{
                width: '100%',
                height: '100%',
                display: 'grid',
                placeItems: 'center',
                background:
                  'radial-gradient(circle at 50% 38%, rgba(0,243,255,0.24), transparent 34%), linear-gradient(135deg, rgba(0,243,255,0.08), rgba(248,231,28,0.07))',
              }}
            >
              <SpaceStickerIcon name="space-planet" className="home-random-modal-fallback-icon" />
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, transparent 40%, rgba(5,5,8,0.88) 100%)',
            }}
          />
          {/* Win badge */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              background: 'linear-gradient(135deg, #f8e71c, #ffb300)',
              borderRadius: '999px',
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 900,
              color: '#050508',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {t('home.random.result')}
          </div>
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '32px',
              height: '32px',
              background: 'rgba(5,5,8,0.55)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%',
              color: 'rgba(255,255,255,0.85)',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={17} strokeWidth={2.6} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 28px 28px' }}>
          <CategoryBadge label={category} color={play.accentColor} />
          <h2
            style={{
              fontSize: '24px',
              fontWeight: 900,
              color: 'var(--rp-c-text-1)',
              marginBottom: '10px',
              fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
              lineHeight: 1.2,
            }}
          >
            {title}
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--shadow-text-muted)',
              fontWeight: 600,
              lineHeight: 1.75,
              marginBottom: '24px',
            }}
          >
            {desc}
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <ServerEntryCta
              play={play}
              isZh={isZh}
              style={{
                flex: 1,
                justifyContent: 'center',
              }}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={onRollAgain}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {t('home.random.again')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
