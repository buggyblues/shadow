import { Link, useRouterState } from '@tanstack/react-router'
import {
  BarChart3,
  Box,
  ChevronDown,
  Copy,
  Globe,
  Home,
  Layers,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sun,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { type Theme, useThemeStore } from '@/stores/theme'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string
  labelKey: string
  icon: typeof Home
  exact?: boolean
}

interface NavSection {
  id: string
  labelKey: string
  icon: typeof Home
  items: NavItem[]
  defaultOpen?: boolean
}

// ── Navigation Sections ───────────────────────────────────────────────────────

const NAV_SECTIONS: NavSection[] = [
  {
    id: 'deploy',
    labelKey: 'nav.deploy',
    icon: Home,
    defaultOpen: true,
    items: [
      { to: '/', labelKey: 'nav.consoleHome', icon: Home, exact: true },
      { to: '/store', labelKey: 'nav.agentStore', icon: ShoppingBag },
      { to: '/my-templates', labelKey: 'nav.myTemplates', icon: Copy },
    ],
  },
  {
    id: 'manage',
    labelKey: 'nav.manage',
    icon: Layers,
    defaultOpen: true,
    items: [
      { to: '/deployments', labelKey: 'nav.deployments', icon: Layers },
      { to: '/secrets', labelKey: 'nav.secrets', icon: ShieldCheck },
      { to: '/monitoring', labelKey: 'nav.monitoring', icon: BarChart3 },
    ],
  },
  {
    id: 'system',
    labelKey: 'nav.system',
    icon: Box,
    defaultOpen: false,
    items: [{ to: '/settings', labelKey: 'nav.settings', icon: Settings }],
  },
]

// ── Components ────────────────────────────────────────────────────────────────

function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { t } = useTranslation()
  const { location } = useRouterState()
  const active = item.exact
    ? location.pathname === item.to
    : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)

  const Icon = item.icon
  return (
    <Link
      to={item.to}
      className={cn(
        'group flex items-center gap-3 rounded-[22px] px-3 py-2.5 text-sm transition-all duration-300',
        active ? 'font-black' : 'font-semibold hover:-translate-y-0.5',
        collapsed && 'justify-center px-2',
      )}
      style={{
        background: active
          ? 'linear-gradient(135deg, rgba(0,243,255,0.14) 0%, rgba(124,77,255,0.10) 100%)'
          : 'transparent',
        color: active ? 'var(--nf-text-high)' : 'var(--nf-text-mid)',
        boxShadow: active ? 'var(--nf-shadow-soft)' : 'none',
      }}
      title={collapsed ? t(item.labelKey) : undefined}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all"
        style={{
          background: active ? 'rgba(0, 243, 255, 0.14)' : 'var(--nf-bg-raised)',
          borderColor: active ? 'rgba(0, 243, 255, 0.2)' : 'var(--nf-border)',
        }}
      >
        <Icon
          size={16}
          style={{ color: active ? 'var(--color-nf-cyan)' : 'var(--nf-text-muted)' }}
          className="group-hover:opacity-100 transition-opacity"
        />
      </span>
      {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
    </Link>
  )
}

function SidebarSection({ section, collapsed }: { section: NavSection; collapsed: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(section.defaultOpen ?? false)
  const { location } = useRouterState()

  const isChildActive = section.items.some((item) =>
    item.exact
      ? location.pathname === item.to
      : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  )

  const isOpen = open || isChildActive

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {section.items.map((item) => (
          <SidebarNavItem key={item.to} item={item} collapsed />
        ))}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] transition-colors"
        style={{ color: 'var(--nf-text-muted)' }}
      >
        <span className="truncate">{t(section.labelKey)}</span>
        <ChevronDown
          size={12}
          className={cn('transition-transform', isOpen ? 'rotate-0' : '-rotate-90')}
        />
      </button>
      {isOpen && (
        <div className="mt-0.5 space-y-0.5">
          {section.items.map((item) => (
            <SidebarNavItem key={item.to} item={item} collapsed={false} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Theme Toggle ──────────────────────────────────────────────────────────────

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const { t } = useTranslation()

  const next: Record<Theme, Theme> = { dark: 'light', light: 'system', system: 'dark' }
  const icons: Record<Theme, typeof Sun> = { dark: Moon, light: Sun, system: Globe }
  const Icon = icons[theme]

  return (
    <button
      type="button"
      onClick={() => setTheme(next[theme])}
      className={cn(
        'flex items-center gap-2 w-full rounded-2xl px-3 py-2 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5',
        collapsed && 'justify-center',
      )}
      style={{
        color: 'var(--nf-text-mid)',
        background: 'var(--nf-bg-raised)',
        border: '1px solid var(--nf-border)',
      }}
      title={t(`theme.${theme}`)}
    >
      <Icon size={15} />
      {!collapsed && <span className="font-semibold text-xs">{t(`theme.${theme}`)}</span>}
    </button>
  )
}

// ── Language Toggle ───────────────────────────────────────────────────────────

function LanguageToggle({ collapsed }: { collapsed: boolean }) {
  const { i18n } = useTranslation()
  const current = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en'
  const nextLang = current === 'en' ? 'zh-CN' : 'en'
  const label = current === 'en' ? '中文' : 'EN'

  return (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(nextLang)}
      className={cn(
        'flex items-center gap-2 w-full rounded-2xl px-3 py-2 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5',
        collapsed && 'justify-center',
      )}
      style={{
        color: 'var(--nf-text-mid)',
        background: 'var(--nf-bg-raised)',
        border: '1px solid var(--nf-border)',
      }}
      title={label}
    >
      <Globe size={15} />
      {!collapsed && <span className="font-semibold text-xs">{label}</span>}
    </button>
  )
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const { t } = useTranslation()
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  return (
    <aside
      className={cn(
        'shrink-0 transition-[width] duration-300 relative z-20',
        collapsed ? 'w-24' : 'w-72',
      )}
    >
      <div className="sticky top-4 h-[calc(100vh-2rem)] px-3 pb-4">
        <div
          className="nf-glass flex h-full flex-col rounded-[32px] p-2"
          style={{
            background: 'var(--nf-sidebar-bg)',
            boxShadow: 'var(--nf-sidebar-shadow)',
          }}
        >
          <div
            className={cn(
              'mb-2 flex items-center gap-3 rounded-[28px] p-3',
              collapsed && 'justify-center',
            )}
            style={{
              background: 'var(--nf-bg-glass-2)',
              border: '1px solid var(--nf-border)',
            }}
          >
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-nf-cyan) 0%, var(--color-nf-cyan-strong) 100%)',
                boxShadow: 'var(--nf-shadow-glow)',
              }}
            >
              <Package size={20} className="text-black" />
            </div>

            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-black truncate" style={{ color: 'var(--nf-text-high)' }}>
                  {t('nav.shadowCloud')}
                </p>
                <p className="text-[11px] truncate" style={{ color: 'var(--nf-text-muted)' }}>
                  {t('nav.console')}
                </p>
              </div>
            )}
          </div>

          <nav className={cn('flex-1 overflow-y-auto space-y-4 pb-4', collapsed ? 'px-1' : 'px-2')}>
            {NAV_SECTIONS.map((section) => (
              <SidebarSection key={section.id} section={section} collapsed={collapsed} />
            ))}
          </nav>

          <div
            className="space-y-2 rounded-[26px] border p-2"
            style={{
              background: 'var(--nf-bg-glass-2)',
              borderColor: 'var(--nf-border)',
            }}
          >
            <ThemeToggle collapsed={collapsed} />
            <LanguageToggle collapsed={collapsed} />
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex items-center justify-center w-full rounded-2xl px-3 py-2 transition-all duration-300 hover:-translate-y-0.5"
              style={{
                color: 'var(--nf-text-mid)',
                background: 'var(--nf-bg-raised)',
                border: '1px solid var(--nf-border)',
              }}
              title={collapsed ? t('common.expand') : t('common.collapse')}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
