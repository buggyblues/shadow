import { ChevronDown, Download, Terminal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useI18n, usePageData } from 'rspress/runtime'
import {
  type DesktopDownloadPlatform,
  type DesktopReleaseDownload,
  type DesktopReleaseInfo,
  desktopDownloadUrl,
  fallbackDesktopRelease,
  fetchLatestDesktopRelease,
} from '../../api/desktopRelease'

type DownloadPageLang = 'en' | 'zh'

const PLATFORM_LABEL_KEYS: Record<DesktopDownloadPlatform, string> = {
  'macos-arm64': 'download.desktop.platform.macosArm64',
  'macos-x64': 'download.desktop.platform.macosX64',
  'windows-x64': 'download.desktop.platform.windowsX64',
  'linux-x64': 'download.desktop.platform.linuxX64',
}

const RECOMMENDED_PLATFORM_ORDER: DesktopDownloadPlatform[] = [
  'windows-x64',
  'macos-arm64',
  'macos-x64',
  'linux-x64',
]

const CONNECTOR_COMMAND =
  'npx @shadowob/connector@latest --daemon --server-url https://shadowob.com --api-key <machine-key>'

function userAgentPlatform(): DesktopDownloadPlatform | null {
  if (typeof navigator === 'undefined') return null
  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.includes('windows')) return 'windows-x64'
  if (userAgent.includes('linux')) return 'linux-x64'
  if (userAgent.includes('mac')) return 'macos-arm64'
  return null
}

function selectPrimaryDownload(downloads: DesktopReleaseDownload[]) {
  const platform = userAgentPlatform()
  if (platform) {
    const match = downloads.find((download) => download.id === platform && download.assetName)
    if (match) return match
  }
  return (
    RECOMMENDED_PLATFORM_ORDER.map((id) =>
      downloads.find((download) => download.id === id && download.assetName),
    ).find(Boolean) ??
    downloads.find((download) => download.assetName) ??
    null
  )
}

function platformFamily(platform: DesktopDownloadPlatform): 'macos' | 'windows' | 'linux' {
  if (platform.startsWith('macos')) return 'macos'
  if (platform.startsWith('windows')) return 'windows'
  return 'linux'
}

function stablePlatformDownloads(downloads: DesktopReleaseDownload[]) {
  return RECOMMENDED_PLATFORM_ORDER.map((id) => {
    const match = downloads.find((download) => download.id === id)
    return (
      match ?? {
        id,
        label: id,
        url: desktopDownloadUrl(id),
        assetName: null,
      }
    )
  })
}

export function DesktopDownloadPage({ lang = 'zh' }: { lang?: DownloadPageLang }) {
  const t = useI18n()
  const { siteData } = usePageData()
  const base = (siteData.base || '/').replace(/\/$/, '')
  const [release, setRelease] = useState<DesktopReleaseInfo>(() => fallbackDesktopRelease())

  useEffect(() => {
    let cancelled = false

    const loadRelease = async () => {
      const latestRelease = await fetchLatestDesktopRelease()
      if (cancelled) return
      setRelease(latestRelease ?? fallbackDesktopRelease())
    }

    void loadRelease()

    return () => {
      cancelled = true
    }
  }, [])

  const primaryDownload = useMemo(() => selectPrimaryDownload(release.downloads), [release])
  const primaryFallbackPlatform = userAgentPlatform() ?? 'windows-x64'
  const primaryPlatform = primaryDownload?.id ?? primaryFallbackPlatform
  const primaryHref = primaryDownload?.url ?? desktopDownloadUrl(primaryFallbackPlatform)
  const downloadOptions = useMemo(() => stablePlatformDownloads(release.downloads), [release])

  return (
    <main className="desktop-download-page shadow-page" data-lang={lang}>
      <section className="desktop-download-hero">
        <img
          src={`${base}/home-sections/space-ringed-planet.png`}
          alt=""
          className="desktop-download-hero-bg"
          draggable={false}
        />
        <div className="desktop-download-hero-copy">
          <img
            src={`${base}/home-stickers/tech_raccoon_laptop.png`}
            alt=""
            className="desktop-download-sticker"
            draggable={false}
          />
          <h1>{t('download.desktop.title')}</h1>
          <p>{t('download.desktop.subtitle')}</p>
          <div className="desktop-download-actions">
            <div className="desktop-download-split">
              <a href={primaryHref} className="desktop-download-primary">
                <Download size={18} aria-hidden="true" />
                {t(`download.desktop.default.${platformFamily(primaryPlatform)}`)}
              </a>
              <details className="desktop-download-dropdown">
                <summary aria-label={t('download.desktop.moreOptions')}>
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <div className="desktop-download-menu">
                  <div className="desktop-download-menu-section">
                    <p>{t('download.desktop.otherPlatformsTitle')}</p>
                    {downloadOptions.map((download) => (
                      <a
                        key={download.id}
                        href={download.assetName ? download.url : desktopDownloadUrl(download.id)}
                        className="desktop-download-menu-item"
                      >
                        <Download size={15} aria-hidden="true" />
                        <span>{t(PLATFORM_LABEL_KEYS[download.id])}</span>
                      </a>
                    ))}
                  </div>
                  <details className="desktop-download-connector">
                    <summary>
                      <Terminal size={15} aria-hidden="true" />
                      <span>{t('download.desktop.connectorCliTitle')}</span>
                    </summary>
                    <div>
                      <p>{t('download.desktop.connectorCliDescription')}</p>
                      <code>{CONNECTOR_COMMAND}</code>
                    </div>
                  </details>
                </div>
              </details>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
