import { useEffect, useState } from 'react'
import { useI18n } from 'rspress/runtime'
import { GlobeIcon } from './Icons'

/* ─── Base URL helper (prepends DOCS_BASE in Docker builds) ─── */
function getBase(): string {
  return ((typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/').replace(
    /\/$/,
    '',
  )
}

/* ─── Build the other-language URL from the current page path ─── */
function getOtherLangUrl(currentLang: 'zh' | 'en'): string {
  if (typeof window === 'undefined') return currentLang === 'zh' ? '/' : '/zh/'
  const path = window.location.pathname
  const base = getBase()
  const relative = base ? path.replace(new RegExp(`^${base}`), '') || '/' : path
  if (currentLang === 'zh') {
    return `${base}${relative.replace(/^\/zh(\/|$)/, '/') || '/'}`
  }
  return `${base}/zh${relative === '/' ? '/' : relative}`
}

/* ─── Dark mode toggle ─── */
function DarkModeToggle() {
  const t = useI18n()
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('shadow-theme') || localStorage.getItem('rspress-theme-appearance')
    const isDark = stored === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : stored !== 'light'
    setDark(isDark)
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    document.documentElement.style.colorScheme = next ? 'dark' : 'light'
    localStorage.setItem('shadow-theme', next ? 'dark' : 'light')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition"
      title={dark ? t('common.lightMode') : t('common.darkMode')}
      style={{ color: 'var(--shadow-text-muted)' }}
    >
      {dark ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}

/* ─── GitHub link ─── */
function GitHubLink() {
  return (
    <a
      href="https://github.com/buggyblues/shadow"
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition"
      title="GitHub"
      style={{ color: 'var(--shadow-text-muted)' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
      </svg>
    </a>
  )
}

/* ─── Search button (navigates to docs where Rspress search is available) ─── */
function SearchButton({ lang }: { lang: 'zh' | 'en' }) {
  const t = useI18n()
  const placeholder = t('common.searchDocs')

  const handleClick = () => {
    const base = getBase()
    const prefix = lang === 'zh' ? '/zh' : ''
    // Try triggering Rspress search via ⌘K
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      code: 'KeyK',
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
    })
    document.dispatchEvent(event)
    // If search modal didn't open (e.g. on blank pages), navigate to docs
    setTimeout(() => {
      if (
        !document.querySelector('[class*="rspress-search"]') &&
        !document.querySelector('[class*="SearchPanel"]')
      ) {
        window.location.href = `${base}${prefix}/platform/introduction`
      }
    }, 150)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition"
      style={{
        background: 'var(--shadow-card-bg)',
        border: '1px solid var(--shadow-card-border)',
        color: 'var(--shadow-text-dim)',
        minWidth: '160px',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <span className="flex-1 text-left">{placeholder}</span>
      <kbd
        className="text-xs px-1.5 py-0.5 rounded"
        style={{ background: 'var(--shadow-card-border)', fontSize: '10px' }}
      >
        ⌘K
      </kbd>
    </button>
  )
}

function FooterLanguageSwitcher({ lang }: { lang: 'zh' | 'en' }) {
  const t = useI18n()
  const otherUrl = getOtherLangUrl(lang)
  const currentLabel = t('common.language.current')
  const otherLabel = t('common.language.other')

  return (
    <div className="shadow-footer-language">
      <button className="shadow-footer-language-trigger" type="button">
        <GlobeIcon className="w-4 h-4" />
        <span>{currentLabel}</span>
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
      <div className="shadow-footer-language-menu">
        <span className="shadow-footer-language-item is-current">{currentLabel}</span>
        <a
          href={otherUrl}
          className="shadow-footer-language-item"
          onClick={() => {
            const nextLang = lang === 'zh' ? 'en' : 'zh-CN'
            localStorage.setItem('shadow-lang', nextLang)
          }}
        >
          {otherLabel}
        </a>
      </div>
    </div>
  )
}

/* ─── Shared public navigation component ─── */
export function PublicNav({ lang = 'zh' }: { lang?: 'zh' | 'en' }) {
  const t = useI18n()
  const base = getBase()
  const prefix = lang === 'zh' ? '/zh' : ''
  return (
    <nav
      className="glass-nav"
      style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 48px)',
        maxWidth: '1120px',
        zIndex: 100,
        borderRadius: '999px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        transition: 'all 0.3s ease',
      }}
    >
      <a
        href={`${base}${prefix}/`}
        className="flex items-center gap-3 cursor-pointer hover:scale-105 transition"
        style={{ textDecoration: 'none' }}
      >
        <img src={`${base}/Logo.svg`} alt="Shadow Logo" className="w-10 h-10" />
        <span
          className="zcool text-2xl font-bold tracking-wider"
          style={{ color: 'var(--shadow-text)' }}
        >
          {t('common.brand')}
          <span className="text-lg text-cyan-600 ml-1 font-sans font-black">
            {t('common.ownBuddy')}
          </span>
        </span>
      </a>
      <div className="hidden md:flex gap-8 text-base font-bold">
        <a
          href={`${base}${prefix}/product/`}
          className="hover:text-cyan-600 transition border-b-2 border-transparent hover:border-cyan-500 py-1"
          style={{ textDecoration: 'none', color: 'var(--shadow-text-muted)' }}
        >
          {t('footer.product')}
        </a>
        <a
          href={`${base}${prefix}/platform/introduction`}
          className="hover:text-cyan-600 transition border-b-2 border-transparent hover:border-cyan-500 py-1"
          style={{ textDecoration: 'none', color: 'var(--shadow-text-muted)' }}
        >
          {t('footer.developerPlatform')}
        </a>
      </div>
      <div className="flex items-center gap-2">
        <SearchButton lang={lang} />
        <DarkModeToggle />
        <GitHubLink />
        <a
          href="/app"
          className="btn-primary zcool text-lg px-6 py-2 hover:scale-105 transition-transform duration-300 shadow-lg hover:shadow-cyan-500/30"
          style={{ textDecoration: 'none' }}
        >
          {t('common.launch')}
        </a>
      </div>
    </nav>
  )
}

/* ─── Shared footer component ─── */
export function PublicFooter({ lang = 'zh' }: { lang?: 'zh' | 'en' }) {
  const t = useI18n()
  const base = getBase()
  const prefix = lang === 'zh' ? '/zh' : ''

  const columns = [
    {
      title: t('footer.product'),
      links: [
        { text: t('footer.helpCenter'), href: `${base}${prefix}/product/` },
        { text: t('footer.quickStart'), href: `${base}${prefix}/product/quick-start` },
        { text: t('footer.playLaunch'), href: `${base}${prefix}/product/play-launch` },
        { text: t('footer.aiBuddies'), href: `${base}${prefix}/product/ai-assistants` },
        { text: t('footer.channels'), href: `${base}${prefix}/product/channels` },
        { text: t('footer.desktopDownload'), href: `${base}${prefix}/product/download` },
      ],
    },
    {
      title: t('footer.resources'),
      links: [
        { text: t('footer.developerPlatform'), href: `${base}${prefix}/platform/introduction` },
        { text: t('footer.cloud'), href: `${base}${prefix}/platform/cloud` },
        { text: 'Cloud CLI', href: `${base}${prefix}/platform/cloud-cli` },
        { text: t('footer.templateDocs'), href: `${base}${prefix}/platform/cloud-templates` },
        { text: t('footer.pluginDocs'), href: `${base}${prefix}/platform/cloud-plugins` },
      ],
    },
    {
      title: t('footer.community'),
      links: [
        { text: 'GitHub', href: 'https://github.com/buggyblues/shadow', external: true },
        { text: 'Discord', href: '#' },
        { text: 'Twitter / X', href: '#' },
      ],
    },
    {
      title: t('footer.legalTitle'),
      links: [
        { text: 'Privacy', href: `${base}${prefix}/privacy` },
        { text: 'Terms', href: `${base}${prefix}/terms` },
        { text: t('footer.communityGuidelines'), href: `${base}${prefix}/community-guidelines` },
        {
          text: 'Skills',
          href: 'https://github.com/buggyblues/shadow/blob/main/skills/shadowob-cli/SKILL.md',
          external: true,
        },
      ],
    },
  ]

  return (
    <footer
      className="glass-nav mt-auto py-12 border-t-2 relative z-10 w-full"
      style={{ borderColor: 'var(--shadow-card-border)' }}
    >
      <div className="max-w-6xl mx-auto px-8 md:px-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
          {/* Brand column */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src={`${base}/Logo.svg`} className="w-8 h-8" alt="Shadow cat" />
              <span className="zcool text-lg font-bold" style={{ color: 'var(--shadow-text)' }}>
                {t('common.brand')}
              </span>
            </div>
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--shadow-text-dim)' }}>
              {t('footer.tagline')}
            </p>
          </div>
          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="zcool text-sm font-bold mb-4" style={{ color: 'var(--shadow-text)' }}>
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.text}>
                    <a
                      href={link.href}
                      {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                      className="text-xs font-medium hover:text-cyan-500 transition"
                      style={{ textDecoration: 'none', color: 'var(--shadow-text-dim)' }}
                    >
                      {link.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* Bottom bar — copyright left, lang switcher right */}
        <div
          className="pt-6 flex flex-col md:flex-row justify-between items-center gap-3 border-t"
          style={{ borderColor: 'var(--shadow-card-border)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--shadow-text-dim)' }}>
            {t('footer.legal')}
          </span>
          <FooterLanguageSwitcher lang={lang} />
        </div>
      </div>
    </footer>
  )
}
