import { InviteCodeDialog, type InviteCodeDialogText } from '@shadowob/views/invite-code'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Helmet, useI18n, useLang, useLocation, usePageData } from 'rspress/runtime'
import Theme from 'rspress/theme'
import { HomeContent } from '../components/HomeContent'
import { PublicFooter } from '../components/Layout'
import { LoginModal } from '../components/LoginModal'
import {
  hasKnownAuthSession,
  type WebsiteAuthUser,
  writeWebsiteAuthStatus,
} from '../lib/auth-status'
import {
  InviteCodeRequestCancelled,
  redeemInviteCode,
  ShadowApiError,
  WEBSITE_INVITE_CODE_REQUIRED_EVENT,
  type WebsiteInviteCodeRequiredDetail,
} from '../lib/shadow-api'
import './index.css'

declare const __SHADOW_APP_BASE_URL__: string | undefined
const WEBSITE_LOGIN_EVENT = 'shadow:website-login'
const AUTH_STATUS_MESSAGE = 'shadow.auth.status'

function configuredAppBase() {
  return (typeof __SHADOW_APP_BASE_URL__ !== 'undefined' ? __SHADOW_APP_BASE_URL__ : '').replace(
    /\/$/,
    '',
  )
}

function formatI18n(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match))
}

/**
 * Background orbs — injected only on the homepage to avoid showing on doc pages.
 * position:fixed so they cover the full viewport even when scrolling.
 */
function HomeOrbs() {
  return (
    <>
      <div className="shadow-orb shadow-orb-1" aria-hidden="true" />
      <div className="shadow-orb shadow-orb-2" aria-hidden="true" />
    </>
  )
}

type HomeNavItem = {
  label: string
  href: string
  desc: string
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
          >
            <span>{item.label}</span>
            <small>{item.desc}</small>
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
function HomeCapsuleNav() {
  const { siteData } = usePageData()
  const currentLang = useLang()
  const t = useI18n()
  const base = (siteData.base || '/').replace(/\/$/, '')
  const isZh = currentLang === 'zh'
  const prefix = isZh ? '/zh' : ''
  const docsHref = (path: string) => `${base}${prefix}${path}`
  const productItems = [
    {
      label: t('homeNav.product.overview.label'),
      href: docsHref('/product/'),
      desc: t('homeNav.product.overview.desc'),
    },
    {
      label: t('homeNav.product.help.label'),
      href: docsHref('/product/'),
      desc: t('homeNav.product.help.desc'),
    },
    {
      label: t('homeNav.product.playLaunch.label'),
      href: docsHref('/product/play-launch'),
      desc: t('homeNav.product.playLaunch.desc'),
    },
    {
      label: t('homeNav.product.diyCloud.label'),
      href: '/app/cloud/diy',
      desc: t('homeNav.product.diyCloud.desc'),
    },
    {
      label: t('homeNav.product.desktop.label'),
      href: docsHref('/product/download'),
      desc: t('homeNav.product.desktop.desc'),
    },
  ]
  const platformItems = [
    {
      label: t('homeNav.platform.developer.label'),
      href: docsHref('/platform/introduction'),
      desc: t('homeNav.platform.developer.desc'),
    },
    {
      label: t('homeNav.platform.cloud.label'),
      href: docsHref('/platform/cloud'),
      desc: t('homeNav.platform.cloud.desc'),
    },
    {
      label: t('homeNav.platform.cli.label'),
      href: docsHref('/platform/cloud-cli'),
      desc: t('homeNav.platform.cli.desc'),
    },
    {
      label: t('homeNav.platform.templates.label'),
      href: docsHref('/platform/cloud-templates'),
      desc: t('homeNav.platform.templates.desc'),
    },
  ]
  const resourceItems = [
    {
      label: t('homeNav.resources.pricing.label'),
      href: docsHref('/pricing'),
      desc: t('homeNav.resources.pricing.desc'),
    },
    {
      label: t('homeNav.resources.blog.label'),
      href: docsHref('/blog/'),
      desc: t('homeNav.resources.blog.desc'),
    },
    {
      label: 'GitHub',
      href: 'https://github.com/buggyblues/shadow',
      desc: t('homeNav.resources.github.desc'),
    },
  ]

  return (
    <header className="shadow-home-capsule-nav">
      <div className="shadow-home-capsule-inner">
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
          <HomeNavDropdown label={t('homeNav.product')} items={productItems} />
          <HomeNavDropdown label={t('homeNav.platform')} items={platformItems} />
          <HomeNavDropdown label={t('homeNav.resources')} items={resourceItems} />
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
        style={{ color: 'var(--rp-c-text-1)', fontFamily: '"Nunito", "Noto Sans SC", sans-serif' }}
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

type AuthStatusMessage = {
  type?: unknown
  authenticated?: unknown
  user?: unknown
}

function authStatusUrl() {
  if (typeof window === 'undefined') return ''
  const url = new URL('/app/auth/status', configuredAppBase() || window.location.origin)
  url.searchParams.set('origin', window.location.origin)
  return url.toString()
}

function isAuthStatusMessage(value: unknown): value is AuthStatusMessage {
  return Boolean(value && typeof value === 'object' && 'type' in value)
}

function normalizeAuthStatusUser(value: unknown): WebsiteAuthUser | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.username !== 'string') return null
  return {
    id: record.id,
    username: record.username,
    displayName: typeof record.displayName === 'string' ? record.displayName : null,
    avatarUrl: typeof record.avatarUrl === 'string' ? record.avatarUrl : null,
  }
}

function AuthStatusBridge() {
  const t = useI18n()
  const iframeSrc = useMemo(authStatusUrl, [])

  useEffect(() => {
    if (!iframeSrc || typeof window === 'undefined') return
    const expectedOrigin = configuredAppOrigin()
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin || !isAuthStatusMessage(event.data)) return
      if (event.data.type !== AUTH_STATUS_MESSAGE) return
      writeWebsiteAuthStatus(
        event.data.authenticated === true,
        normalizeAuthStatusUser(event.data.user),
      )
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [iframeSrc])

  if (!iframeSrc) return null

  return (
    <iframe
      title={t('loginModal.brand')}
      src={iframeSrc}
      aria-hidden="true"
      tabIndex={-1}
      referrerPolicy="strict-origin-when-cross-origin"
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        border: 0,
        overflow: 'hidden',
        clipPath: 'inset(50%)',
      }}
    />
  )
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
  const { page, siteData } = usePageData()
  const { pathname } = useLocation()
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

  // Only locale index pages use the custom homepage shell. Other custom MDX pages must render normally.
  const isHomepage =
    page.pageType === 'custom' && /^(\/|\/index\.html|\/zh\/?|\/zh\/index\.html)$/.test(routePath)

  if (isHomepage) {
    const title = isZh
      ? '虾豆 OwnBuddy - 可玩的 AI 社区'
      : 'Shadow OwnBuddy - Playable AI Communities'
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

    return (
      <div onClickCapture={handleAppClick}>
        <Helmet htmlAttributes={{ lang: isZh ? 'zh' : 'en' }}>
          <title>{title}</title>
        </Helmet>
        <HomeOrbs />
        <AuthStatusBridge />
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

  // Doc pages — full-width rspress nav with custom logo text + Launch button
  // (.translation lang switcher hidden via CSS; lang in footer only)
  const footer = page.pageType === 'custom' ? undefined : <GlobalFooter />
  return (
    <>
      <Theme.Layout navTitle={<DocNavTitle />} afterNavMenu={<LaunchButton />} bottom={footer} />
      <AuthStatusBridge />
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
