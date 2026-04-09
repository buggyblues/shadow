/**
 * OpenClaw Layout — Cute, Rounded & Modern
 *
 * Uses the app's existing design-token system (text-text-primary, bg-bg-secondary, etc.)
 * so all sub-pages render correctly without color conflicts.
 */

import {
  AlertCircle,
  Bot,
  Calendar,
  ChevronDown,
  Cloud,
  Cpu,
  Globe,
  HelpCircle,
  LayoutDashboard,
  Loader2,
  Sparkles,
  Store,
  Terminal,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GatewayStatus } from '../../lib/openclaw-api'
import { GlowRing, OpenClawIcon } from './openclaw-brand'

export type OpenClawPage =
  | 'dashboard'
  | 'skillhub'
  | 'channels'
  | 'models'
  | 'agents'
  | 'cron'
  | 'buddy'
  | 'debug'
  | 'help'
  | 'onboard'

interface OpenClawLayoutProps {
  activePage: OpenClawPage
  onNavigate: (page: OpenClawPage) => void
  gatewayStatus?: GatewayStatus | null
  children: ReactNode
}

type NavItem = {
  id: OpenClawPage
  icon: typeof LayoutDashboard
  labelKey: string
  defaultLabel: string
}

type NavSection = {
  key: string
  labelKey: string
  defaultLabel: string
  defaultCollapsed: boolean
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    key: 'start',
    labelKey: 'openclaw.nav.sectionStart',
    defaultLabel: '开始',
    defaultCollapsed: false,
    items: [
      { id: 'onboard', icon: Sparkles, labelKey: 'openclaw.nav.onboard', defaultLabel: '设置向导' },
      {
        id: 'dashboard',
        icon: LayoutDashboard,
        labelKey: 'openclaw.nav.dashboard',
        defaultLabel: '仪表盘',
      },
    ],
  },
  {
    key: 'basic',
    labelKey: 'openclaw.nav.sectionBasic',
    defaultLabel: '基本',
    defaultCollapsed: false,
    items: [
      { id: 'agents', icon: Bot, labelKey: 'openclaw.nav.agents', defaultLabel: '我的龙虾' },
      { id: 'buddy', icon: Cloud, labelKey: 'openclaw.nav.buddy', defaultLabel: '连接 Buddy' },
      { id: 'skillhub', icon: Store, labelKey: 'openclaw.nav.skillhub', defaultLabel: '技能商店' },
      { id: 'cron', icon: Calendar, labelKey: 'openclaw.nav.cron', defaultLabel: '定时任务' },
      { id: 'help', icon: HelpCircle, labelKey: 'openclaw.nav.help', defaultLabel: '帮助中心' },
    ],
  },
  {
    key: 'advanced',
    labelKey: 'openclaw.nav.sectionAdvanced',
    defaultLabel: '进阶',
    defaultCollapsed: true,
    items: [
      { id: 'models', icon: Cpu, labelKey: 'openclaw.nav.models', defaultLabel: '模型提供商' },
      { id: 'channels', icon: Globe, labelKey: 'openclaw.nav.channels', defaultLabel: 'IM 通道' },
      { id: 'debug', icon: Terminal, labelKey: 'openclaw.nav.debug', defaultLabel: '调试控制台' },
    ],
  },
]

function loadCollapsedState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('openclaw-nav-collapsed')
    if (raw) return JSON.parse(raw) as Record<string, boolean>
  } catch {
    /* ignore */
  }
  const defaults: Record<string, boolean> = {}
  for (const s of NAV_SECTIONS) defaults[s.key] = s.defaultCollapsed
  return defaults
}

function saveCollapsedState(state: Record<string, boolean>) {
  try {
    localStorage.setItem('openclaw-nav-collapsed', JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function OpenClawLayout({
  activePage,
  onNavigate,
  gatewayStatus,
  children,
}: OpenClawLayoutProps) {
  const { t } = useTranslation()
  const gatewayState = gatewayStatus?.state ?? 'offline'
  const isGatewayRunning = gatewayState === 'running'
  const isGatewayError = gatewayState === 'error'
  const isGatewayTransitioning = ['installing', 'starting', 'bootstrapping', 'stopping'].includes(
    gatewayState,
  )

  const [collapsed, setCollapsed] = useState(loadCollapsedState)
  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      saveCollapsedState(next)
      return next
    })
  }, [])

  return (
    <div className="flex h-full bg-bg-tertiary text-text-primary selection:bg-primary/20">
      {/* ─── Sidebar ─── */}
      <aside className="w-[240px] shrink-0 flex flex-col bg-bg-secondary/40 overflow-hidden">
        {/* Brand Header — fixed height to prevent layout shifts between states */}
        <div className="desktop-drag-titlebar h-[148px] px-5 flex flex-col items-center justify-center gap-1.5 shrink-0">
          {/* Fixed-size container for mascot — prevents layout shifts between states */}
          <div className="relative w-[72px] h-[72px] flex items-center justify-center shrink-0">
            <button
              type="button"
              className="relative group"
              onClick={() => onNavigate('dashboard')}
              data-no-drag
            >
              {isGatewayRunning && <GlowRing size={56} className="absolute -inset-2" />}
              <div className="absolute -inset-2 bg-danger/15 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <OpenClawIcon size={56} glow animated={isGatewayRunning} />
              {!isGatewayRunning && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-bg-secondary border-2 border-bg-secondary/80 flex items-center justify-center">
                  {isGatewayError ? (
                    <AlertCircle size={13} className="text-red-500" />
                  ) : isGatewayTransitioning ? (
                    <Loader2 size={13} className="text-yellow-500 animate-spin" />
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full bg-text-muted/50" />
                  )}
                </div>
              )}
            </button>
          </div>
          <span className="text-sm font-extrabold text-text-primary tracking-tight select-none">
            OpenClaw
          </span>
          {isGatewayRunning ? (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full text-transparent select-none pointer-events-none"
              data-no-drag
            >
              {'\u00A0'}
            </span>
          ) : (
            <button
              type="button"
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors bg-transparent border-none ${
                isGatewayError
                  ? 'text-red-400 hover:text-red-300 cursor-pointer'
                  : isGatewayTransitioning
                    ? 'text-yellow-500'
                    : 'text-text-muted hover:text-text-secondary cursor-pointer'
              }`}
              onClick={() => onNavigate('dashboard')}
              data-no-drag
            >
              {isGatewayError
                ? t('openclaw.layout.statusError', '服务异常 →')
                : isGatewayTransitioning
                  ? t('openclaw.layout.statusStarting', '启动中...')
                  : t('openclaw.layout.statusOffline', '服务离线 →')}
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-3 overflow-y-auto no-scrollbar">
          {NAV_SECTIONS.map((section) => {
            const isOpen = !collapsed[section.key]
            // Auto-expand section if active page is in it
            const hasActivePage = section.items.some((item) => item.id === activePage)

            return (
              <div key={section.key}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-text-muted/70 hover:text-text-muted transition-colors cursor-pointer"
                >
                  <ChevronDown
                    size={12}
                    className={`shrink-0 transition-transform duration-200 ${
                      isOpen || hasActivePage ? '' : '-rotate-90'
                    }`}
                  />
                  {t(section.labelKey, section.defaultLabel)}
                </button>
                {(isOpen || hasActivePage) && (
                  <div className="mt-0.5 space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = activePage === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onNavigate(item.id)}
                          className={`
                            w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all duration-200 group
                            ${
                              isActive
                                ? 'bg-danger text-white shadow-md shadow-danger/25'
                                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
                            }
                          `}
                        >
                          <item.icon
                            className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-white' : 'text-text-muted group-hover:text-primary transition-colors'}`}
                            strokeWidth={2.2}
                          />
                          <span className="truncate">{t(item.labelKey, item.defaultLabel)}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 mt-auto text-center">
          <div className="text-[10px] text-text-muted font-mono">v2026.3.18</div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="relative flex-1 min-w-0 h-full overflow-hidden flex flex-col bg-bg-primary">
        <div className="desktop-drag-titlebar absolute top-0 inset-x-0 h-5 pointer-events-none z-10" />
        <div className="flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
      </main>
    </div>
  )
}
