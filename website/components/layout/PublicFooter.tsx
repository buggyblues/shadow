import { persistLanguagePreference, websiteLanguagePreference } from '@shadowob/views/preferences'
import { useEffect, useState } from 'react'
import { useI18n } from 'rspress/runtime'
import { getHeaderNavGroups } from '../../nav'
import { GlobeIcon } from '../icons/Icons'

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

function FooterLanguageSwitcher({ lang }: { lang: 'zh' | 'en' }) {
  const t = useI18n()
  const [otherUrl, setOtherUrl] = useState(() => (lang === 'zh' ? '/' : '/zh/'))
  const currentLabel = t('common.language.current')
  const otherLabel = t('common.language.other')

  useEffect(() => {
    setOtherUrl(getOtherLangUrl(lang))
  }, [lang])

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
            const nextLang = lang === 'zh' ? 'en' : 'zh'
            persistLanguagePreference(websiteLanguagePreference(nextLang))
          }}
        >
          {otherLabel}
        </a>
      </div>
    </div>
  )
}

type FooterLink = {
  text: string
  href: string
  external?: boolean
}

type FooterColumn = {
  title: string
  links: FooterLink[]
}

/* ─── Shared footer component ─── */
export function PublicFooter({ lang = 'zh' }: { lang?: 'zh' | 'en' }) {
  const t = useI18n()
  const base = getBase()
  const prefix = lang === 'zh' ? '/zh' : ''
  const navGroups = getHeaderNavGroups(lang, base)
  const footerNavLinks = (groupKey: string): FooterLink[] =>
    navGroups
      .find((group) => group.key === groupKey)
      ?.items.map((item) => ({
        text: item.label,
        href: item.href,
        external: item.external,
      })) ?? []

  const columns: FooterColumn[] = [
    {
      title: t('footer.platform'),
      links: footerNavLinks('platform'),
    },
    {
      title: t('footer.resources'),
      links: footerNavLinks('resources'),
    },
    {
      title: t('footer.legalTitle'),
      links: [
        { text: t('footer.privacy'), href: `${base}${prefix}/privacy` },
        { text: t('footer.terms'), href: `${base}${prefix}/terms` },
        { text: t('footer.communityGuidelines'), href: `${base}${prefix}/community-guidelines` },
      ],
    },
  ]

  return (
    <footer
      className="glass-nav mt-auto py-12 border-t-2 relative z-10 w-full"
      style={{ borderColor: 'var(--shadow-card-border)' }}
    >
      <div className="max-w-6xl mx-auto px-8 md:px-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand column */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src={`${base}/Logo.svg`} className="w-8 h-8" alt="Shadow cat" />
              <span className="zcool text-lg font-bold" style={{ color: 'var(--shadow-text)' }}>
                {t('common.brand')}
              </span>
            </div>
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--shadow-text-muted)' }}>
              {t('footer.tagline')}
            </p>
          </div>
          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="zcool text-sm font-bold mb-4" style={{ color: 'var(--shadow-text)' }}>
                {col.title}
              </h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.text}>
                    <a
                      href={link.href}
                      {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                      className="text-xs font-medium hover:text-cyan-500 transition"
                      style={{ textDecoration: 'none', color: 'var(--shadow-text-muted)' }}
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
          <span className="text-xs font-medium" style={{ color: 'var(--shadow-text-muted)' }}>
            {t('footer.legal')}
          </span>
          <FooterLanguageSwitcher lang={lang} />
        </div>
      </div>
    </footer>
  )
}
