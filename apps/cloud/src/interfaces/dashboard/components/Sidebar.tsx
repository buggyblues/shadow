import {
  Button,
  Sidebar as UISidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarSectionLabel,
} from '@shadowob/ui'
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
    <Button
      asChild
      variant="ghost"
      size="md"
      className={cn(
        '!h-11 !w-full !justify-start !gap-3 !rounded-[20px] !border !px-3 !py-2.5 !text-sm',
        active
          ? '!border-primary/20 !bg-primary/10 !text-text-primary !shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_28px_rgba(0,198,209,0.14)]'
          : '!border-transparent !bg-transparent !text-text-secondary hover:!bg-bg-modifier-hover hover:!text-text-primary',
        collapsed && '!w-11 !justify-center !px-0',
      )}
    >
      <Link
        to={item.to}
        title={collapsed ? t(item.labelKey) : undefined}
        className={cn('flex w-full min-w-0 items-center gap-3', collapsed && 'justify-center')}
      >
        <Icon size={16} className={cn('shrink-0', active ? 'text-primary' : 'text-text-muted')} />
        {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
      </Link>
    </Button>
  )
}

function SidebarSection({ section, collapsed }: { section: NavSection; collapsed: boolean }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      {!collapsed && (
        <SidebarSectionLabel className="px-3 pb-1 text-[10px] tracking-[0.24em] text-text-muted/70">
          {t(section.labelKey)}
        </SidebarSectionLabel>
      )}

      <div className="space-y-1">
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
        collapsed ? 'w-[84px]' : 'w-[248px]',
      )}
    >
      <div className="sticky top-3.5 h-[calc(100vh-1.75rem)] px-2.5 pb-3">
        <UISidebar className="glass-panel !h-full !w-full !border-0 !bg-transparent">
          <SidebarHeader className={cn('!border-b-0 !bg-transparent !p-3', collapsed && '!p-2.5')}>
            <Link
              to="/"
              className={cn('flex items-center gap-3 rounded-[20px]', collapsed && 'justify-center')}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/20 bg-primary shadow-[0_14px_28px_rgba(0,198,209,0.18),inset_0_1px_0_rgba(255,255,255,0.4)]">
                <Package size={20} className="text-black" />
              </div>

              {!collapsed && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-text-primary">{t('nav.shadowCloud')}</p>
                  <p className="truncate text-[11px] tracking-[0.08em] text-text-muted">{t('nav.console')}</p>
                </div>
              )}
            </Link>
          </SidebarHeader>

          <SidebarContent className={cn('!space-y-5 !px-2 !py-2', collapsed && '!px-1.5')}>
            {NAV_SECTIONS.map((section) => (
              <SidebarSection key={section.id} section={section} collapsed={collapsed} />
            ))}
          </SidebarContent>

          <SidebarFooter className="!mt-auto !border-t !border-border-subtle !bg-transparent !p-2 !pt-3">
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                asChild
                variant={settingsActive ? 'glass' : 'ghost'}
                size="icon"
                className={cn(
                  '!h-11 !w-full !rounded-[16px] !border',
                  settingsActive
                    ? '!border-primary/20 !bg-primary/10 !text-primary'
                    : '!border-border-subtle !text-text-secondary hover:!bg-bg-modifier-hover hover:!text-text-primary',
                )}
              >
                <Link to="/settings" title={t('nav.settings')}>
                  <Settings size={16} />
                </Link>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="!h-11 !w-full !rounded-[16px] !border !border-border-subtle !text-text-secondary hover:!bg-bg-modifier-hover hover:!text-text-primary"
                title={collapsed ? t('common.expand') : t('common.collapse')}
              >
                {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </Button>
            </div>
          </SidebarFooter>
        </UISidebar>
      </div>
    </aside>
  )
}
