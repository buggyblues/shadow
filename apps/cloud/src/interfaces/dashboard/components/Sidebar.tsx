import { Link, useRouterState } from '@tanstack/react-router'
import {
  Activity,
  BarChart3,
  Box,
  ChevronDown,
  Copy,
  FolderClock,
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
      { to: '/clusters', labelKey: 'nav.clusters', icon: Layers },
      { to: '/deploy-tasks', labelKey: 'nav.deployTasks', icon: FolderClock },
      { to: '/secrets', labelKey: 'nav.secrets', icon: ShieldCheck },
      { to: '/monitoring', labelKey: 'nav.monitoring', icon: BarChart3 },
    ],
  },
  {
    id: 'system',
    labelKey: 'nav.system',
    icon: Box,
    defaultOpen: false,
    items: [
      { to: '/activity', labelKey: 'nav.activity', icon: Activity },
      { to: '/settings', labelKey: 'nav.settings', icon: Settings },
    ],
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
        'flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-sm transition-all duration-200 group',
        active ? 'font-bold' : 'hover:opacity-90',
        collapsed && 'justify-center px-2',
      )}
      style={{
        background: active ? 'var(--nf-sidebar-active)' : 'transparent',
        color: active ? 'var(--color-nf-cyan)' : 'var(--nf-text-mid)',
      }}
      title={collapsed ? t(item.labelKey) : undefined}
    >
      <Icon
        size={15}
        style={{ color: active ? 'var(--color-nf-cyan)' : 'var(--nf-text-muted)' }}
        className="group-hover:opacity-100 transition-opacity"
      />
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
        className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
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
        'flex items-center gap-2 w-full p-1.5 rounded-xl transition-colors text-sm',
        collapsed && 'justify-center',
      )}
      style={{ color: 'var(--nf-text-muted)' }}
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
        'flex items-center gap-2 w-full p-1.5 rounded-xl transition-colors text-sm',
        collapsed && 'justify-center',
      )}
      style={{ color: 'var(--nf-text-muted)' }}
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
        'flex flex-col transition-[width] duration-200 shrink-0 relative z-20',
        collapsed ? 'w-14' : 'w-56',
      )}
      style={{
        background: 'var(--nf-sidebar-bg)',
        borderRight: '1px solid var(--nf-border)',
      }}
    >
      {/* Header */}
      <div
        className={cn('flex items-center', collapsed ? 'px-2 py-4 justify-center' : 'px-4 py-4')}
        style={{ borderBottom: '1px solid var(--nf-border)' }}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Package size={20} style={{ color: 'var(--color-nf-cyan)' }} className="shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-sm truncate" style={{ color: 'var(--nf-text-high)' }}>
                {t('nav.shadowCloud')}
              </p>
              <p className="text-[10px] truncate" style={{ color: 'var(--nf-text-muted)' }}>
                {t('nav.console')}
              </p>
            </div>
          </div>
        )}
        {collapsed && <Package size={20} style={{ color: 'var(--color-nf-cyan)' }} />}
      </div>

      {/* Navigation */}
      <nav className={cn('flex-1 overflow-y-auto py-3 space-y-3', collapsed ? 'px-1' : 'px-2')}>
        {NAV_SECTIONS.map((section) => (
          <SidebarSection key={section.id} section={section} collapsed={collapsed} />
        ))}
      </nav>

      {/* Footer: Theme + Language + Collapse */}
      <div className="p-2 space-y-0.5" style={{ borderTop: '1px solid var(--nf-border)' }}>
        <ThemeToggle collapsed={collapsed} />
        <LanguageToggle collapsed={collapsed} />
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex items-center justify-center w-full p-1.5 rounded-xl transition-colors"
          style={{ color: 'var(--nf-text-muted)' }}
          title={collapsed ? t('common.expand') : t('common.collapse')}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
    </aside>
  )
}
