import {
  SidebarContent,
  SidebarHeader,
  SidebarItem,
  SidebarSectionLabel,
  Sidebar as UISidebar,
} from '@shadowob/ui'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  BarChart3,
  Copy,
  Layers,
  type LucideIcon,
  Settings,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { SettingsModal } from '@/pages/SettingsPage'
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
      { to: '/store', labelKey: 'nav.shrimp', icon: ShoppingBag },
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

function SidebarNavItem({ item }: { item: NavItem }) {
  const { t } = useTranslation()
  const { location } = useRouterState()
  const active = item.exact
    ? location.pathname === item.to
    : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)

  const Icon = item.icon

  return (
    <SidebarItem asChild variant="dashboard" active={active}>
      <Link to={item.to} className="flex w-full min-w-0 items-center gap-3">
        <Icon size={16} className={cn('shrink-0', active ? 'text-primary' : 'text-text-muted')} />
        <span className="truncate">{t(item.labelKey)}</span>
      </Link>
    </SidebarItem>
  )
}

function SidebarSection({ section }: { section: NavSection }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      <SidebarSectionLabel className="px-3 pb-1 text-[10px] tracking-[0.24em] text-text-muted/70">
        {t(section.labelKey)}
      </SidebarSectionLabel>

      <div className="space-y-1">
        {section.items.map((item) => (
          <SidebarNavItem key={item.to} item={item} />
        ))}
      </div>
    </div>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const { settingsOpen, settingsTab, openSettings, closeSettings } = useAppStore()

  return (
    <aside className="relative z-20 w-[248px] shrink-0 self-stretch">
      <div className="sticky top-3.5 h-screen px-2.5 pb-3">
        <UISidebar className="glass-panel h-full w-full border-0 bg-transparent">
          <SidebarHeader className="border-b-0 bg-transparent p-3">
            <div className="flex items-center justify-between gap-2">
              <Link to="/" className="flex min-w-0 items-center gap-3 rounded-[20px]">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] overflow-hidden border border-white/20 shadow-[0_14px_28px_rgba(0,198,209,0.18),inset_0_1px_0_rgba(255,255,255,0.4)]">
                  <img src="/logo.png" alt="Shadow Cloud" className="h-full w-full object-cover" />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-text-primary">
                    {t('nav.shadowCloud')}
                  </p>
                  <p className="truncate text-[11px] tracking-[0.08em] text-text-muted">
                    {t('nav.console')}
                  </p>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => openSettings()}
                title={t('nav.settings')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-bg-modifier-hover hover:text-text-primary"
              >
                <Settings size={15} />
              </button>
            </div>
          </SidebarHeader>

          <SidebarContent className="space-y-5 px-2 py-2">
            {NAV_SECTIONS.map((section) => (
              <SidebarSection key={section.id} section={section} />
            ))}
          </SidebarContent>
        </UISidebar>
      </div>
      <SettingsModal open={settingsOpen} onClose={closeSettings} initialTab={settingsTab} />
    </aside>
  )
}
