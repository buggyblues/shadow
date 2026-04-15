import { useLocation, usePageData } from 'rspress/runtime'
import Theme from 'rspress/theme'
import { PublicFooter } from '../components/Layout'
import './index.css'

function CustomNavTitle() {
  const { siteData } = usePageData()
  const { pathname } = useLocation()
  const base = (siteData.base || '/').replace(/\/$/, '')
  const isZh = pathname.startsWith(`${base}/zh`)
  const prefix = isZh ? '/zh' : ''

  return (
    <a
      href={`${base}${prefix}/`}
      className="flex items-center gap-3 w-full h-full text-base font-semibold transition-opacity duration-300 hover:opacity-60"
      style={{ textDecoration: 'none' }}
    >
      <img src={`${base}/Logo.svg`} alt="Shadow Logo" className="w-9 h-9" />
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

function NavLangSwitcher() {
  const { siteData } = usePageData()
  const { pathname } = useLocation()
  const base = (siteData.base || '/').replace(/\/$/, '')
  const isZh = pathname.startsWith(`${base}/zh`)

  const otherHref = isZh
    ? `${base}${pathname.replace(/^(\/[^/]+)?\/zh(\/|$)/, '$1/')}` || `${base}/`
    : `${base}/zh${pathname.replace(new RegExp(`^${base}`), '') || '/'}`

  return (
    <a
      href={otherHref}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-bold transition hover:opacity-70"
      style={{ textDecoration: 'none', color: 'var(--rp-c-text-2)' }}
      title={isZh ? 'Switch to English' : '切换为中文'}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.987 7.987 0 0 1 5.08 16zm2.95-8H5.08a7.987 7.987 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z" />
      </svg>
      {isZh ? 'EN' : '中文'}
    </a>
  )
}

const Layout = () => (
  <Theme.Layout
    navTitle={<CustomNavTitle />}
    afterNavMenu={<LaunchButton />}
    bottom={<GlobalFooter />}
  />
)

export default {
  ...Theme,
  Layout,
}
export * from 'rspress/theme'
