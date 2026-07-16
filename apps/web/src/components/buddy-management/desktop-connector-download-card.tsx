import { Popover, PopoverContent, PopoverTrigger } from '@shadowob/ui'
import type { TFunction } from 'i18next'
import { ChevronDown, Download, Loader2, MonitorCheck, Terminal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConfigCodeBlock } from './config-code-block'

type DesktopDownloadPlatform = 'macos-arm64' | 'macos-x64' | 'windows-x64' | 'linux-x64'

const DESKTOP_DOWNLOAD_PLATFORMS: DesktopDownloadPlatform[] = [
  'windows-x64',
  'macos-arm64',
  'macos-x64',
  'linux-x64',
]

function recommendedDesktopDownloadPlatform(): DesktopDownloadPlatform {
  if (typeof navigator === 'undefined') return 'macos-arm64'
  const userAgent = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()
  if (userAgent.includes('windows') || platform.includes('win')) return 'windows-x64'
  if (userAgent.includes('linux') || platform.includes('linux')) return 'linux-x64'
  if (userAgent.includes('mac') || platform.includes('mac')) return 'macos-arm64'
  return 'macos-arm64'
}

function desktopDownloadHref(platform: DesktopDownloadPlatform): string {
  const path = `/desktop/download/${platform}`
  const apiBase = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? ''
  if (/^https?:\/\//.test(apiBase)) return `${apiBase.replace(/\/+$/, '')}${path}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(path, window.location.origin).toString()
  }
  return path
}

function desktopPlatformFamily(platform: DesktopDownloadPlatform): 'macos' | 'windows' | 'linux' {
  if (platform.startsWith('macos')) return 'macos'
  if (platform.startsWith('windows')) return 'windows'
  return 'linux'
}

function DesktopConnectorFlowGraphic() {
  return (
    <svg
      viewBox="0 0 420 112"
      className="h-auto w-full text-primary"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M106 56h66m76 0h66"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
        opacity="0.35"
      />
      <path
        d="M156 48l10 8-10 8M298 48l10 8-10 8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
        opacity="0.65"
      />

      <g>
        <rect x="24" y="20" width="82" height="72" rx="18" fill="currentColor" opacity="0.09" />
        <rect
          x="24.75"
          y="20.75"
          width="80.5"
          height="70.5"
          rx="17.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.35"
        />
        <rect
          x="45"
          y="38"
          width="40"
          height="27"
          rx="4"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d="M59 75h12M65 65v10"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3"
        />
      </g>

      <g>
        <rect x="172" y="20" width="76" height="72" rx="18" fill="currentColor" opacity="0.12" />
        <rect
          x="172.75"
          y="20.75"
          width="74.5"
          height="70.5"
          rx="17.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.4"
        />
        <path
          d="M195 62c0 8 6 14 14 14h2c8 0 14-6 14-14v-1M196 51v-5a10 10 0 0 1 20 0v20a10 10 0 0 0 20 0v-5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <circle cx="195" cy="51" r="4" fill="currentColor" />
        <circle cx="236" cy="61" r="4" fill="currentColor" />
      </g>

      <g>
        <rect x="314" y="20" width="82" height="72" rx="18" fill="currentColor" opacity="0.09" />
        <rect
          x="314.75"
          y="20.75"
          width="80.5"
          height="70.5"
          rx="17.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.35"
        />
        <rect x="339" y="36" width="15" height="15" rx="4" fill="currentColor" opacity="0.9" />
        <rect x="360" y="36" width="15" height="15" rx="4" fill="currentColor" opacity="0.42" />
        <rect x="339" y="57" width="15" height="15" rx="4" fill="currentColor" opacity="0.42" />
        <rect x="360" y="57" width="15" height="15" rx="4" fill="currentColor" opacity="0.9" />
      </g>
    </svg>
  )
}

export function DesktopConnectorDownloadCard({
  connectorCommand,
  isWaitingForConnector = false,
  onWaitingForConnectorChange,
  onCliFallbackOpen,
  t,
}: {
  connectorCommand: string | null
  isWaitingForConnector?: boolean
  onWaitingForConnectorChange?: (waiting: boolean) => void
  onCliFallbackOpen?: () => void
  t: TFunction
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const recommendedPlatform = useMemo(() => recommendedDesktopDownloadPlatform(), [])
  const downloadPlatforms = [
    recommendedPlatform,
    ...DESKTOP_DOWNLOAD_PLATFORMS.filter((platform) => platform !== recommendedPlatform),
  ]
  const revealGuide = () => {
    setShowGuide(true)
    onWaitingForConnectorChange?.(true)
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#050508] shadow-[0_28px_90px_rgba(0,0,0,0.34)]">
      <div className="relative isolate flex min-h-[360px] items-center justify-center overflow-hidden px-6 py-8 text-center sm:px-10">
        <img
          src="/home-sections/space-ringed-planet.webp"
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover opacity-80"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,8,0.68),rgba(5,5,8,0.3)_48%,rgba(5,5,8,0.94)),radial-gradient(circle_at_50%_34%,rgba(0,198,209,0.16),transparent_48%)]" />
        <div className="relative z-10 flex w-full max-w-2xl flex-col items-center">
          <img
            src="/home-stickers/tech_raccoon_laptop.png"
            alt=""
            draggable={false}
            className="pointer-events-none mb-3 h-auto w-28 -rotate-3 select-none drop-shadow-[0_18px_28px_rgba(0,0,0,0.42)] sm:w-32"
          />
          <h3 className="text-balance text-3xl font-black leading-[1.02] tracking-tight text-white sm:text-4xl">
            {t('agentMgmt.connectorDesktopHeroTitle')}
          </h3>
          <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-300/80">
            {t('agentMgmt.connectorDesktopHeroDescription')}
          </p>

          <div className="mt-6 flex w-full shrink-0 justify-center sm:w-auto">
            <a
              onClick={revealGuide}
              href={desktopDownloadHref(recommendedPlatform)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-12 min-w-0 max-w-[calc(100%-3rem)] items-center justify-center gap-2.5 rounded-l-full bg-primary px-6 text-sm font-black text-bg-primary shadow-[0_16px_40px_rgba(0,198,209,0.24)] transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <Download size={17} />
              <span className="truncate">
                {t(
                  `agentMgmt.connectorDownloadDefault_${desktopPlatformFamily(recommendedPlatform)}`,
                )}
              </span>
            </a>
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t('agentMgmt.connectorDownloadMoreOptions')}
                  className="inline-flex min-h-12 w-12 shrink-0 items-center justify-center rounded-r-full border-l border-bg-primary/25 bg-primary text-bg-primary shadow-[0_16px_40px_rgba(0,198,209,0.24)] transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <ChevronDown
                    size={16}
                    className={menuOpen ? 'rotate-180 transition' : 'transition'}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-2"
              >
                <div className="px-2 pb-2 pt-1 text-xs font-semibold text-text-muted">
                  {t('agentMgmt.connectorOtherPlatformsTitle')}
                </div>
                <div className="space-y-1">
                  {downloadPlatforms.map((platform) => (
                    <a
                      key={platform}
                      href={desktopDownloadHref(platform)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        revealGuide()
                        setMenuOpen(false)
                      }}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-text-secondary transition hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <Download size={15} />
                      <span className="min-w-0 flex-1 truncate">
                        {t(`agentMgmt.connectorPlatform_${platform}`)}
                      </span>
                    </a>
                  ))}
                </div>
                <div className="my-2 h-px bg-border-subtle" />
                <details
                  className="rounded-xl bg-bg-deep/30"
                  onToggle={(event) => {
                    if (event.currentTarget.open) onCliFallbackOpen?.()
                  }}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-text-secondary transition hover:text-text-primary">
                    <Terminal size={15} />
                    {t('agentMgmt.connectorCliFallbackTitle')}
                  </summary>
                  <div className="border-t border-border-subtle px-3 py-3">
                    <p className="mb-3 text-xs leading-5 text-text-muted">
                      {t('agentMgmt.connectorCliFallbackDesc')}
                    </p>
                    {connectorCommand ? (
                      <ConfigCodeBlock content={connectorCommand} mode="single" t={t} />
                    ) : (
                      <div className="rounded-2xl border border-border-subtle bg-bg-deep/40 px-4 py-3 text-xs leading-5 text-text-muted">
                        {t('agentMgmt.connectorCreating')}
                      </div>
                    )}
                  </div>
                </details>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {showGuide && (
        <div className="border-t border-white/10 bg-bg-secondary/92 px-5 py-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <MonitorCheck size={16} className="text-primary" />
            {t('agentMgmt.connectorDesktopGuideTitle')}
          </div>
          {isWaitingForConnector && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-bg-deep/30 px-3 py-2 text-xs font-semibold text-text-secondary">
              <Loader2 size={14} className="animate-spin text-primary" />
              {t('agentMgmt.connectorDesktopGuideWaiting')}
            </div>
          )}
          <div className="mt-4 grid gap-4 md:grid-cols-[minmax(13rem,0.85fr)_minmax(0,1.15fr)] md:items-center">
            <div className="rounded-xl bg-bg-deep/25 px-3 py-2">
              <DesktopConnectorFlowGraphic />
            </div>
            <ol className="space-y-2 text-xs leading-5 text-text-secondary">
              {[
                'connectorDesktopGuideStepInstall',
                'connectorDesktopGuideStepOpen',
                'connectorDesktopGuideStepReturn',
              ].map((key, index) => (
                <li key={key} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span>{t(`agentMgmt.${key}`)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
