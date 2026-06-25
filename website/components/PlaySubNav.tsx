import { useEffect, useState } from 'react'
import { useI18n } from 'rspress/runtime'

const getBase = () =>
  ((typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/').replace(/\/$/, '')

const itemDefs = [
  { key: 'playSubNav.gettingStarted', link: '/play/' },
  { key: 'playSubNav.shrimpCoins', link: '/play/shrimp-coins' },
  { key: 'playSubNav.buddySystem', link: '/play/buddy-system' },
  { key: 'playSubNav.communityFeatures', link: '/play/community-features' },
  { key: 'playSubNav.advancedTips', link: '/play/advanced-tips' },
]

export function PlaySubNav({ lang = 'en' }: { lang?: 'en' | 'zh' }) {
  const t = useI18n()
  const base = getBase()
  const prefix = lang === 'zh' ? '/zh' : ''
  const [current, setCurrent] = useState('')
  const navItems = itemDefs.map((item) => ({
    text: t(item.key),
    link: `${prefix}${item.link}`,
  }))

  useEffect(() => {
    setCurrent(window.location.pathname)
  }, [])

  return (
    <nav className="w-full overflow-x-auto pt-16 pb-2 px-8 md:px-16 flex justify-center">
      <div className="flex gap-2 md:gap-4 text-sm font-bold whitespace-nowrap">
        {navItems.map((item) => {
          const href = `${base}${item.link}`
          const isActive = current === href || current === href.replace(/\/$/, '')
          return (
            <a
              key={item.link}
              href={href}
              className={`px-4 py-2 rounded-full transition-all ${
                isActive
                  ? 'bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              style={{
                textDecoration: 'none',
                color: isActive ? undefined : 'var(--shadow-text-muted)',
              }}
            >
              {item.text}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
