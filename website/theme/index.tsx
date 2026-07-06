import { InviteCodeDialog, type InviteCodeDialogText } from '@shadowob/views/invite-code'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Helmet, useI18n, useLang, useLocation, usePageData } from 'rspress/runtime'
import Theme from 'rspress/theme'
import { configuredAppBase } from '../api/app-base'
import { hasKnownAuthSession } from '../api/auth-status'
import {
  InviteCodeRequestCancelled,
  redeemInviteCode,
  ShadowApiError,
  WEBSITE_INVITE_CODE_REQUIRED_EVENT,
  type WebsiteInviteCodeRequiredDetail,
} from '../api/shadow-api'
import { LoginModal } from '../components/auth/LoginModal'
import { DesktopDownloadPage } from '../components/desktop/DesktopDownloadPage'
import { HomeContent } from '../components/home/HomeContent'
import { PublicFooter } from '../components/layout/PublicFooter'
import { PublicServerDirectory } from '../components/servers/PublicServerDirectory'
import { useWebsiteTheme } from '../hooks/useWebsiteTheme'
import { getHeaderNavGroups } from '../nav'
import './index.css'

const WEBSITE_LOGIN_EVENT = 'shadow:website-login'

const HEADER_GLASS_STYLE = `
.shadow-home-capsule-inner::before {
  backdrop-filter: blur(30px) saturate(170%) contrast(108%);
  -webkit-backdrop-filter: blur(30px) saturate(170%) contrast(108%);
}
[class*="navContainer"]::before {
  backdrop-filter: blur(28px) saturate(165%) contrast(106%);
  -webkit-backdrop-filter: blur(28px) saturate(165%) contrast(106%);
}
`

function formatI18n(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match))
}

type HomeNavItem = {
  label: string
  href: string
  external?: boolean
}

function HomeNavDropdown({ label, items }: { label: string; items: HomeNavItem[] }) {
  return (
    <div className="shadow-home-nav-dropdown">
      <button className="shadow-home-nav-link shadow-home-nav-dropdown-trigger" type="button">
        <span>{label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="shadow-home-nav-dropdown-menu">
        {items.map((item) => (
          <a
            key={`${item.href}:${item.label}`}
            href={item.href}
            className="shadow-home-nav-dropdown-item"
            style={{ textDecoration: 'none' }}
            {...(item.external ? { target: '_blank', rel: 'noreferrer' } : {})}
          >
            <span>{item.label}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

/**
 * Floating capsule nav — homepage only (rspress nav hidden via uiSwitch).
 * Matches preview.html: centered full-width pill, logo left, links+launch right.
 */
function HomeCapsuleNav({ immediateGlass = false }: { immediateGlass?: boolean }) {
  const { siteData } = usePageData()
  const currentLang = useLang()
  const t = useI18n()
  const [glassProgress, setGlassProgress] = useState(immediateGlass ? 1 : 0)
  const base = (siteData.base || '/').replace(/\/$/, '')
  const isZh = currentLang === 'zh'
  const prefix = isZh ? '/zh' : ''
  const navGroups = getHeaderNavGroups(isZh ? 'zh' : 'en', base)

  useEffect(() => {
    if (immediateGlass) {
      setGlassProgress(1)
      return
    }

    let frame = 0

    const updateProgress = () => {
      frame = 0
      const firstScreenHeight = window.innerHeight
      const revealDistance = 160
      const nextProgress = Math.min(
        1,
        Math.max(0, (window.scrollY - firstScreenHeight) / revealDistance),
      )
      setGlassProgress((current) =>
        Math.abs(current - nextProgress) < 0.01 ? current : nextProgress,
      )
    }

    const scheduleUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(updateProgress)
    }

    updateProgress()
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [immediateGlass])

  return (
    <header className="shadow-home-capsule-nav">
      <div
        className="shadow-home-capsule-inner"
        style={{ '--header-glass-progress': glassProgress } as React.CSSProperties}
      >
        {/* Logo — left */}
        <a
          href={`${base}${prefix}/`}
          className="shadow-home-logo"
          style={{ textDecoration: 'none' }}
        >
          <img src={`${base}/Logo.svg`} alt="Shadow Logo" className="w-8 h-8" />
          <span
            className="text-xl font-bold whitespace-nowrap"
            style={{
              color: 'var(--rp-c-text-1)',
              fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
            }}
          >
            {t('common.brand')}
            <span className="text-base text-cyan-600 ml-1 font-black">{t('common.ownBuddy')}</span>
          </span>
        </a>

        {/* Right group: nav links + launch */}
        <div className="shadow-home-nav-right">
          {navGroups.map((group) => (
            <HomeNavDropdown key={group.key} label={group.label} items={group.items} />
          ))}
          <a href="/app" className="btn-primary" style={{ textDecoration: 'none' }}>
            {t('common.launch')}
          </a>
        </div>
      </div>
    </header>
  )
}

/**
 * Full logo for doc-page rspress nav — shows complete "虾豆 OwnBuddy" / "Shadow OwnBuddy" text.
 * navTitleMask (in sidebar) is hidden via CSS to avoid double-logo.
 */
function DocNavTitle() {
  const { siteData } = usePageData()
  const { pathname } = useLocation()
  const t = useI18n()
  const base = (siteData.base || '/').replace(/\/$/, '')
  const isZh = pathname.startsWith(`${base}/zh`)
  const prefix = isZh ? '/zh' : ''

  return (
    <a
      href={`${base}${prefix}/`}
      className="flex items-center gap-3 w-full h-full transition-opacity duration-300 hover:opacity-60"
      style={{ textDecoration: 'none' }}
    >
      <img src={`${base}/Logo.svg`} alt="Shadow Logo" className="w-8 h-8" />
      <span
        className="text-xl font-bold whitespace-nowrap"
        style={{
          color: 'var(--rp-c-text-1)',
          fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
        }}
      >
        {t('common.brand')}
        <span className="text-base text-cyan-600 ml-1 font-black">{t('common.ownBuddy')}</span>
      </span>
    </a>
  )
}

function LaunchButton() {
  const t = useI18n()
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (hasStoredAuthSession()) return
    event.preventDefault()
    requestWebsiteLogin('/app')
  }
  return (
    <a
      href="/app"
      className="btn-primary ml-3 whitespace-nowrap"
      style={{ textDecoration: 'none' }}
      onClick={handleClick}
    >
      {t('common.launch')}
    </a>
  )
}

function hasStoredAuthSession() {
  return hasKnownAuthSession()
}

function requestWebsiteLogin(redirect: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(WEBSITE_LOGIN_EVENT, { detail: { redirect } }))
}

function GlobalFooter() {
  const { pathname } = useLocation()
  const isZh = pathname.includes('/zh')
  return <PublicFooter lang={isZh ? 'zh' : 'en'} />
}

function WebsiteInviteCodeGate({ apiBase }: { apiBase: string }) {
  const t = useI18n()
  const [activeRequest, setActiveRequest] = useState<WebsiteInviteCodeRequiredDetail | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const text = useMemo(
    () =>
      ({
        title: t('inviteCodeGate.title'),
        description: t('inviteCodeGate.description'),
        codeLabel: t('inviteCodeGate.codeLabel'),
        codePlaceholder: t('inviteCodeGate.codePlaceholder'),
        submit: t('inviteCodeGate.submit'),
        submitting: t('inviteCodeGate.submitting'),
        required: t('inviteCodeGate.required'),
        cancel: t('inviteCodeGate.cancel'),
        close: t('loginModal.close'),
        success: t('inviteCodeGate.success'),
        failed: t('inviteCodeGate.failed'),
        capability: (capability: string) =>
          formatI18n(t('inviteCodeGate.capability'), { capability }),
      }) satisfies InviteCodeDialogText,
    [t],
  )

  useEffect(() => {
    const handleInviteRequest = (event: Event) => {
      const detail = (event as CustomEvent<WebsiteInviteCodeRequiredDetail>).detail
      if (!detail?.error) return
      detail.handled = true
      setError('')
      setActiveRequest(detail)
    }
    window.addEventListener(WEBSITE_INVITE_CODE_REQUIRED_EVENT, handleInviteRequest)
    return () => window.removeEventListener(WEBSITE_INVITE_CODE_REQUIRED_EVENT, handleInviteRequest)
  }, [])

  const close = () => {
    if (!activeRequest) return
    activeRequest.reject(new InviteCodeRequestCancelled())
    setActiveRequest(null)
    setError('')
  }

  const submitInviteCode = async (code: string) => {
    if (!activeRequest || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await redeemInviteCode(apiBase, code)
      activeRequest.resolve()
      setActiveRequest(null)
    } catch (err) {
      if (err instanceof ShadowApiError && err.code === 'INVALID_INVITE_CODE') {
        setError(t('inviteCodeGate.invalid'))
      } else {
        setError(err instanceof Error ? err.message : text.failed)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <InviteCodeDialog
      open={Boolean(activeRequest)}
      text={text}
      capability={activeRequest?.error.capability}
      error={error}
      submitting={submitting}
      onSubmit={submitInviteCode}
      onClose={close}
    />
  )
}

const Layout = () => {
  useWebsiteTheme()

  const { page, siteData } = usePageData()
  const { pathname } = useLocation()
  const t = useI18n()
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginRedirect, setLoginRedirect] = useState('/app')
  const base = (siteData.base || '/').replace(/\/$/, '')
  const routePath =
    base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname
  const isZh =
    page.lang === 'zh' || routePath === '/zh' || routePath.startsWith('/zh/') || pathname === '/zh'

  useEffect(() => {
    const handleLoginRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ redirect?: unknown }>).detail
      const redirect = typeof detail?.redirect === 'string' ? detail.redirect : '/app'
      setLoginRedirect(redirect)
      setLoginOpen(true)
    }
    window.addEventListener(WEBSITE_LOGIN_EVENT, handleLoginRequest)
    return () => window.removeEventListener(WEBSITE_LOGIN_EVENT, handleLoginRequest)
  }, [])

  const handleAppClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return
    const anchor = event.target.closest<HTMLAnchorElement>('a[href]')
    if (!anchor) return
    const url = new URL(anchor.href, window.location.href)
    const isAppPath = url.pathname === '/app' || url.pathname.startsWith('/app/')
    if (url.origin !== window.location.origin || !isAppPath) return
    if (hasStoredAuthSession()) return
    event.preventDefault()
    setLoginRedirect(`${url.pathname}${url.search}${url.hash}`)
    setLoginOpen(true)
  }

  // Only locale index pages use the custom homepage shell. Other custom MDX pages must render normally.
  const isHomepage =
    page.pageType === 'custom' && /^(\/|\/index\.html|\/zh\/?|\/zh\/index\.html)$/.test(routePath)
  const isServersDirectory =
    page.pageType === 'custom' && /^\/(?:zh\/)?servers(?:\/|\.html)?$/.test(routePath)
  const isDesktopDownload =
    page.pageType === 'custom' && /^\/(?:zh\/)?download(?:\/|\.html)?$/.test(routePath)

  if (isHomepage) {
    const title = isZh
      ? '虾豆 OwnBuddy - AI 互动空间平台'
      : 'Shadow OwnBuddy - AI Interactive Community Platform'

    return (
      <div onClickCapture={handleAppClick}>
        <Helmet htmlAttributes={{ lang: isZh ? 'zh' : 'en' }}>
          <title>{title}</title>
          <style>{HEADER_GLASS_STYLE}</style>
        </Helmet>
        <HomeCapsuleNav />
        <HomeContent lang={isZh ? 'zh' : 'en'} />
        <GlobalFooter />
        <LoginModal
          open={loginOpen}
          lang={isZh ? 'zh' : 'en'}
          redirect={loginRedirect}
          onClose={() => setLoginOpen(false)}
        />
        <WebsiteInviteCodeGate apiBase={configuredAppBase()} />
      </div>
    )
  }

  if (isServersDirectory) {
    return (
      <div className="public-server-directory-shell" onClickCapture={handleAppClick}>
        <Helmet htmlAttributes={{ lang: isZh ? 'zh' : 'en' }}>
          <title>{t('servers.directory.metaTitle')}</title>
          <style>{HEADER_GLASS_STYLE}</style>
        </Helmet>
        <HomeCapsuleNav immediateGlass />
        <PublicServerDirectory lang={isZh ? 'zh' : 'en'} />
        <GlobalFooter />
        <LoginModal
          open={loginOpen}
          lang={isZh ? 'zh' : 'en'}
          redirect={loginRedirect}
          onClose={() => setLoginOpen(false)}
        />
        <WebsiteInviteCodeGate apiBase={configuredAppBase()} />
      </div>
    )
  }

  if (isDesktopDownload) {
    return (
      <div className="desktop-download-shell" onClickCapture={handleAppClick}>
        <Helmet htmlAttributes={{ lang: isZh ? 'zh' : 'en' }}>
          <title>{t('download.desktop.metaTitle')}</title>
          <style>{HEADER_GLASS_STYLE}</style>
        </Helmet>
        <HomeCapsuleNav immediateGlass />
        <DesktopDownloadPage lang={isZh ? 'zh' : 'en'} />
        <GlobalFooter />
        <LoginModal
          open={loginOpen}
          lang={isZh ? 'zh' : 'en'}
          redirect={loginRedirect}
          onClose={() => setLoginOpen(false)}
        />
        <WebsiteInviteCodeGate apiBase={configuredAppBase()} />
      </div>
    )
  }

  // Doc pages — full-width rspress nav with custom logo text + Launch button
  // (.translation lang switcher hidden via CSS; lang in footer only)
  const footer = page.pageType === 'custom' ? undefined : <GlobalFooter />
  return (
    <>
      <Helmet>
        <style>{HEADER_GLASS_STYLE}</style>
      </Helmet>
      <Theme.Layout navTitle={<DocNavTitle />} afterNavMenu={<LaunchButton />} bottom={footer} />
      <LoginModal
        open={loginOpen}
        lang={isZh ? 'zh' : 'en'}
        redirect={loginRedirect}
        onClose={() => setLoginOpen(false)}
      />
      <WebsiteInviteCodeGate apiBase={configuredAppBase()} />
    </>
  )
}

export default {
  ...Theme,
  Layout,
}
export * from 'rspress/theme'
