import { useLocation, usePageData } from 'rspress/runtime'
import Theme from 'rspress/theme'
import { PublicFooter } from '../components/Layout'
import './index.css'

/**
 * Floating capsule nav — rendered only on the homepage.
 * rspress nav is hidden via uiSwitch.showNavbar=false on those pages.
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

        {/* Center nav links — no search */}
        <nav className="shadow-home-nav-links">
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
        </nav>

        {/* Right side: lang toggle + launch */}
        <div className="shadow-home-nav-right">
          <a
            href={isZh ? `${base}/` : `${base}/zh/`}
            className="shadow-home-lang"
            style={{ textDecoration: 'none' }}
          >
            {isZh ? 'EN' : '中文'}
          </a>
          <a
            href="/app"
            className="btn-primary zcool text-base px-5 py-1.5"
            style={{ textDecoration: 'none' }}
          >
            {isZh ? '启动！' : 'Launch'}
          </a>
        </div>
      </div>
    </header>
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

  // Doc pages — let rspress render its default full-width nav
  // (logo comes from rspress.config.ts, language switcher is rspress built-in)
  return <Theme.Layout afterNavMenu={<LaunchButton />} bottom={<GlobalFooter />} />
}

export default {
  ...Theme,
  Layout,
}
export * from 'rspress/theme'
