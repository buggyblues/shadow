import { Link, useRouterState } from '@tanstack/react-router'
import {
  BarChart3,
  Copy,
  Layers,
  type LucideIcon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'

interface NavItem {
  to: string
  labelKey: string
  icon: LucideIcon
  exact?: boolean
}

interface NavSection {
  id: string
  labelKey: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: 'discover',
    labelKey: 'nav.deploy',
    items: [
      { to: '/', labelKey: 'nav.agentStore', icon: ShoppingBag, exact: true },
      { to: '/my-templates', labelKey: 'nav.myTemplates', icon: Copy },
    ],
  },
  {
    id: 'manage',
    labelKey: 'nav.manage',
    items: [
      { to: '/monitoring', labelKey: 'nav.monitoring', icon: BarChart3 },
      { to: '/deployments', labelKey: 'nav.deployments', icon: Layers },
      { to: '/secrets', labelKey: 'nav.secrets', icon: ShieldCheck },
    ],
  },
]

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
          className="transition-opacity group-hover:opacity-100"
        />
      </span>
      {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
    </Link>
  )
}

function SidebarSection({ section, collapsed }: { section: NavSection; collapsed: boolean }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-1.5">
      {!collapsed && (
        <p
          className="px-4 py-1 text-[10px] font-black uppercase tracking-[0.22em]"
          style={{ color: 'var(--nf-text-muted)' }}
        >
          {t(section.labelKey)}
        </p>
      )}

      <div className="space-y-0.5">
        {section.items.map((item) => (
          <SidebarNavItem key={item.to} item={item} collapsed={collapsed} />
        ))}
      </div>
    </div>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const collapsed = useAppStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const { location } = useRouterState()
  const settingsActive =
    location.pathname === '/settings' || location.pathname.startsWith('/settings/')

  return (
    <aside
      className={cn(
        'relative z-20 shrink-0 transition-[width] duration-300',
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
              'mb-3 flex items-center gap-3 rounded-[28px] p-3',
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
                <p className="truncate text-sm font-black" style={{ color: 'var(--nf-text-high)' }}>
                  {t('nav.shadowCloud')}
                </p>
                <p className="truncate text-[11px]" style={{ color: 'var(--nf-text-muted)' }}>
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
            className="grid grid-cols-2 gap-2 rounded-[26px] border p-2"
            style={{
              background: 'var(--nf-bg-glass-2)',
              borderColor: 'var(--nf-border)',
            }}
          >
            <Link
              to="/settings"
              className="flex h-11 items-center justify-center rounded-2xl transition-all duration-300 hover:-translate-y-0.5"
              style={{
                color: settingsActive ? 'var(--color-nf-cyan)' : 'var(--nf-text-mid)',
                background: settingsActive
                  ? 'linear-gradient(135deg, rgba(0,243,255,0.14) 0%, rgba(124,77,255,0.10) 100%)'
                  : 'var(--nf-bg-raised)',
                border: '1px solid var(--nf-border)',
                boxShadow: settingsActive ? 'var(--nf-shadow-soft)' : 'none',
              }}
              title={t('nav.settings')}
            >
              <Settings size={16} />
            </Link>

            <button
              type="button"
              onClick={toggleSidebar}
              className="flex h-11 items-center justify-center rounded-2xl transition-all duration-300 hover:-translate-y-0.5"
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
