import { useLang, useLocation, usePageData } from 'rspress/runtime'
import Theme from 'rspress/theme'
import { HomeContent } from '../components/HomeContent'
import { PublicFooter } from '../components/Layout'
import './index.css'

/**
 * Replicates @rspress/shared replaceLang — computes equivalent URL in another locale.
 * Source-reversed from @rspress/theme-default@1.47.1 bundle.
 * Works with no versioning and cleanUrls=false (rspress default for static builds).
 */
function getLangUrl(
  pathname: string,
  search: string,
  currentLang: string,
  targetLang: string,
  defaultLang: string,
  base: string,
): string {
  const normalBase = base.endsWith('/') ? base.slice(0, -1) : base
  let url = pathname.startsWith(normalBase) ? pathname.slice(normalBase.length) : pathname
  if (!url) url = '/index.html'
  if (url.endsWith('/')) url += 'index.html'

  const parts = url.split('/').filter(Boolean)
  let langPart = ''

  if (targetLang !== defaultLang) {
    langPart = targetLang
    if (currentLang !== defaultLang) parts.shift() // strip current non-default lang prefix
  } else {
    parts.shift() // strip current non-default lang prefix (target IS default)
  }

  const purePath = parts.join('/') || ''
  const combined = [langPart, purePath].filter(Boolean).join('/')
  return `${normalBase}/${combined}${search}`
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

/**
 * Floating capsule nav — homepage only (rspress nav hidden via uiSwitch).
 * Matches preview.html: centered full-width pill, logo left, links+launch right.
 * Lang switcher uses same replaceLang logic as rspress's native Translation component
 * so switching preserves the current page path.
 */
function HomeCapsuleNav() {
  const { siteData } = usePageData()
  const { pathname, search } = useLocation()
  const currentLang = useLang()
  const base = (siteData.base || '/').replace(/\/$/, '')
  const defaultLang = siteData.lang || 'en'
  const locales: Array<{ lang: string; label: string }> =
    (siteData.locales as Array<{ lang: string; label: string }>) || []
  const isZh = currentLang === 'zh'
  const prefix = isZh ? '/zh' : ''

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
            虾豆
            <span className="text-base text-cyan-600 ml-1 font-black">ShadowOwnBuddy</span>
          </span>
        </a>

        {/* Right group: nav links + launch */}
        <div className="shadow-home-nav-right">
          <a
            href={`${base}/product/`}
            className="shadow-home-nav-link"
            style={{ textDecoration: 'none' }}
          >
            {isZh ? '产品' : 'PRODUCT'}
          </a>
          <a
            href={`${base}/platform/introduction`}
            className="shadow-home-nav-link"
            style={{ textDecoration: 'none' }}
          >
            {isZh ? '开放平台' : 'PLATFORM'}
          </a>
          {/* Lang switcher — same replaceLang logic as rspress Translation component */}
          {locales
            .filter((l) => l.lang !== currentLang)
            .map((l) => (
              <a
                key={l.lang}
                href={getLangUrl(pathname, search, currentLang, l.lang, defaultLang, base)}
                className="shadow-home-nav-link"
                style={{ textDecoration: 'none' }}
              >
                {l.label}
              </a>
            ))}
          <a href="/app" className="btn-primary" style={{ textDecoration: 'none' }}>
            {isZh ? '启动！' : 'Launch'}
          </a>
        </div>
      </div>
    </header>
  )
}

/**
 * Full logo for doc-page rspress nav — shows complete "虾豆 ShadowOwnBuddy" text.
 * navTitleMask (in sidebar) is hidden via CSS to avoid double-logo.
 */
function DocNavTitle() {
  const { siteData } = usePageData()
  const { pathname } = useLocation()
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
        虾豆
        <span className="text-base text-cyan-600 ml-1 font-black">ShadowOwnBuddy</span>
      </span>
    </a>
  )
}

function LaunchButton() {
  const { pathname } = useLocation()
  const isZh = pathname.includes('/zh')
  return (
    <a
      href="/app"
      className="btn-primary ml-3 whitespace-nowrap"
      style={{ textDecoration: 'none' }}
    >
      {isZh ? '启动！' : 'Launch'}
    </a>
  )
}

function GlobalFooter() {
  const { pathname } = useLocation()
  const isZh = pathname.includes('/zh')
  return <PublicFooter lang={isZh ? 'zh' : 'en'} />
}

const Layout = () => {
  const { page } = usePageData()
  // Homepage uses pageType: custom — give it a completely custom capsule nav
  const isHomepage = page.pageType === 'custom'

  if (isHomepage) {
    const isZh =
      page.lang === 'zh' ||
      (typeof window !== 'undefined' && window.location.pathname.startsWith('/zh'))
    return (
      <>
        <HomeOrbs />
        <HomeCapsuleNav />
        <HomeContent lang={isZh ? 'zh' : 'en'} />
        <GlobalFooter />
      </>
    )
  }

  // Doc pages — full-width rspress nav with custom logo text + Launch button
  // (.translation lang switcher hidden via CSS; lang in footer only)
  return (
    <Theme.Layout
      navTitle={<DocNavTitle />}
      afterNavMenu={<LaunchButton />}
      bottom={<GlobalFooter />}
    />
  )
}

export default {
  ...Theme,
  Layout,
}
export * from 'rspress/theme'
