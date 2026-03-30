const getBase = () =>
  ((typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/').replace(/\/$/, '')

const items = {
  en: [
    { text: 'Getting Started', link: '/play/' },
    { text: 'Shrimp Coins', link: '/play/shrimp-coins' },
    { text: 'Buddy System', link: '/play/buddy-system' },
    { text: 'Community Features', link: '/play/community-features' },
    { text: 'Advanced Tips', link: '/play/advanced-tips' },
  ],
  zh: [
    { text: '新手入门', link: '/zh/play/' },
    { text: '虾币', link: '/zh/play/shrimp-coins' },
    { text: 'Buddy 系统', link: '/zh/play/buddy-system' },
    { text: '社区玩法', link: '/zh/play/community-features' },
    { text: '进阶技巧', link: '/zh/play/advanced-tips' },
  ],
}

export function PlaySubNav({ lang = 'en' }: { lang?: 'en' | 'zh' }) {
  const base = getBase()
  const navItems = items[lang]
  const current = typeof window !== 'undefined' ? window.location.pathname : ''

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
