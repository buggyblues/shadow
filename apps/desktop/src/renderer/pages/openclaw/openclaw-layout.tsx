/**
 * OpenClaw Layout — Cute, Rounded & Modern
 *
 * Uses the app's existing design-token system (text-text-primary, bg-bg-secondary, etc.)
 * so all sub-pages render correctly without color conflicts.
 */

import {
  Bot,
  Calendar,
  Cpu,
  Globe,
  HelpCircle,
  LayoutDashboard,
  Link2,
  Store,
  Terminal,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { OpenClawIcon } from './openclaw-brand'

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

interface OpenClawLayoutProps {
  activePage: OpenClawPage
  onNavigate: (page: OpenClawPage) => void
  children: ReactNode
}

const NAV_ITEMS: Array<{
  id: OpenClawPage
  icon: typeof LayoutDashboard
  labelKey: string
  defaultLabel: string
}> = [
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    labelKey: 'openclaw.nav.dashboard',
    defaultLabel: '仪表盘',
  },
  { id: 'skillhub', icon: Store, labelKey: 'openclaw.nav.skillhub', defaultLabel: '技能商店' },
  { id: 'agents', icon: Bot, labelKey: 'openclaw.nav.agents', defaultLabel: '我的龙虾' },
  { id: 'buddy', icon: Link2, labelKey: 'openclaw.nav.buddy', defaultLabel: 'Buddy 连接' },
  { id: 'channels', icon: Globe, labelKey: 'openclaw.nav.channels', defaultLabel: 'IM 通道' },
  { id: 'models', icon: Cpu, labelKey: 'openclaw.nav.models', defaultLabel: '模型' },
  { id: 'cron', icon: Calendar, labelKey: 'openclaw.nav.cron', defaultLabel: '定时任务' },
  { id: 'help', icon: HelpCircle, labelKey: 'openclaw.nav.help', defaultLabel: '帮助中心' },
  { id: 'debug', icon: Terminal, labelKey: 'openclaw.nav.debug', defaultLabel: '调试控制台' },
]

export function OpenClawLayout({ activePage, onNavigate, children }: OpenClawLayoutProps) {
  const { t } = useTranslation()

  return (
    <div className="flex h-full bg-bg-tertiary text-text-primary selection:bg-primary/20">
      {/* ─── Sidebar ─── */}
      <aside className="w-[240px] shrink-0 flex flex-col bg-bg-secondary/40 overflow-hidden">
        {/* Brand Header */}
        <div className="desktop-drag-titlebar pt-8 pb-4 px-5 flex flex-col items-center gap-2 shrink-0">
          <button
            type="button"
            className="relative group"
            onClick={() => onNavigate('dashboard')}
            data-no-drag
          >
            <div className="absolute -inset-2 bg-danger/15 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <OpenClawIcon size={56} glow />
          </button>
          <span className="text-sm font-extrabold text-text-primary tracking-tight select-none">
            OpenClaw
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto no-scrollbar">
          {NAV_ITEMS.map((item) => {
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
