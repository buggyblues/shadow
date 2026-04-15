import { useLocation, usePageData } from 'rspress/runtime'
import Theme from 'rspress/theme'
import { PublicFooter } from '../components/Layout'
import './index.css'

/**
 * Floating capsule nav — rendered only on the homepage.
 * rspress nav is hidden via uiSwitch.showNavbar=false on those pages.
 * Right-aligned compact pill: Logo + Launch only (no nav links, no lang toggle).
 */
function HomeCapsuleNav() {
  const { siteData } = usePageData()
  const { pathname } = useLocation()
  const base = (siteData.base || '/').replace(/\/$/, '')
  const isZh = pathname.startsWith(`${base}/zh`)
  const prefix = isZh ? '/zh' : ''

  return (
    <header className="shadow-home-capsule-nav">
      <div className="shadow-home-capsule-inner">
        {/* Logo */}
        <a
          href={`${base}${prefix}/`}
          className="shadow-home-logo"
          style={{ textDecoration: 'none' }}
        >
          <img src={`${base}/Logo.svg`} alt="Shadow Logo" className="w-8 h-8" />
          <span
            className="zcool text-xl font-bold whitespace-nowrap"
            style={{ color: 'var(--rp-c-text-1)' }}
          >
            虾豆
            <span
              className="text-base text-cyan-600 ml-1 font-black"
              style={{ fontFamily: "'Nunito', sans-serif" }}
            >
              ShadowOwnBuddy
            </span>
          </span>
        </a>

        {/* Launch button only — lang is footer-only, nav links removed */}
        <a
          href="/app"
          className="btn-primary zcool text-base px-5 py-1.5"
          style={{ textDecoration: 'none' }}
        >
          {isZh ? '启动！' : 'Launch'}
        </a>
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
        className="zcool text-xl font-bold whitespace-nowrap"
        style={{ color: 'var(--rp-c-text-1)' }}
      >
        虾豆
        <span
          className="text-base text-cyan-600 ml-1 font-black"
          style={{ fontFamily: "'Nunito', sans-serif" }}
        >
          ShadowOwnBuddy
        </span>
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
      className="btn-primary zcool text-base px-5 py-1.5 ml-3 hover:scale-105 transition-transform duration-300 shadow-lg hover:shadow-cyan-500/30 whitespace-nowrap"
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
    return (
      <Theme.Layout
        // biome-ignore lint: rspress LayoutProps type is broad
        uiSwitch={{ showNavbar: false } as never}
        top={<HomeCapsuleNav />}
        bottom={<GlobalFooter />}
      />
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
