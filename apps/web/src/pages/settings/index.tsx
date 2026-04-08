import { cn } from '@shadowob/ui'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  Bell,
  Bot,
  Code2,
  Link2,
  LogOut,
  MessageCircle,
  Monitor,
  Paintbrush,
  Shield,
  Target,
  User,
  Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../../components/common/avatar'
import { useAppStatus } from '../../hooks/use-app-status'
import { useUnreadCount } from '../../hooks/use-unread-count'
import { fetchApi } from '../../lib/api'
import { disconnectSocket } from '../../lib/socket'
import { useAuthStore } from '../../stores/auth.store'
import { BuddyManagementContent } from '../buddy-management'
import { DmChatView } from '../dm-chat'
import { UnifiedContactSidebar } from '../friends'
import { AccountSettings } from './account'
import { AppearanceSettings } from './appearance'
import { DeveloperSettings } from './developer'
import { InviteSettings } from './invite'
import { NotificationSettings } from './notification'
import { ProfileSettings } from './profile'
import { TaskSettings } from './tasks'
import { WalletSettings } from './wallet'

type SettingsTab =
  | 'profile'
  | 'account'
  | 'invite'
  | 'tasks'
  | 'buddy'
  | 'appearance'
  | 'notification'
  | 'dm'
  | 'developer'
  | 'wallet'

interface NavItem {
  id: SettingsTab
  icon: typeof User
  labelKey: string
  labelFallback: string
}

interface NavSection {
  key: string
  labelKey: string
  labelFallback: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    key: 'basic',
    labelKey: 'settings.sectionBasic',
    labelFallback: '基本',
    items: [
      { id: 'buddy', icon: Bot, labelKey: 'settings.tabBuddy', labelFallback: 'Buddy' },
      { id: 'dm', icon: MessageCircle, labelKey: 'settings.tabDM', labelFallback: '私信' },
    ],
  },
  {
    key: 'activity',
    labelKey: 'settings.sectionActivity',
    labelFallback: '活动',
    items: [
      { id: 'tasks', icon: Target, labelKey: 'settings.tabTasks', labelFallback: '任务中心' },
      { id: 'invite', icon: Link2, labelKey: 'settings.tabInvite', labelFallback: '邀请链接' },
    ],
  },
  {
    key: 'settings',
    labelKey: 'settings.sectionSettings',
    labelFallback: '设置',
    items: [
      {
        id: 'appearance',
        icon: Paintbrush,
        labelKey: 'settings.tabAppearance',
        labelFallback: '外观',
      },
      {
        id: 'notification',
        icon: Bell,
        labelKey: 'settings.tabNotification',
        labelFallback: '通知',
      },
    ],
  },
  {
    key: 'accountPayment',
    labelKey: 'settings.sectionAccountPayment',
    labelFallback: '账号与支付',
    items: [
      {
        id: 'account',
        icon: Shield,
        labelKey: 'settings.tabAccount',
        labelFallback: '账号与安全',
      },
      { id: 'wallet', icon: Wallet, labelKey: 'settings.tabWallet', labelFallback: '钱包' },
      { id: 'developer', icon: Code2, labelKey: 'settings.tabDeveloper', labelFallback: '开发者' },
    ],
  },
]

export function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const unreadCount = useUnreadCount()
  const searchParams = useSearch({ strict: false }) as { tab?: string; dm?: string }
  const { user, logout } = useAuthStore()

  useAppStatus({
    title: t('settings.sidebarTitle'),
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })

  const [activeTab, setActiveTab] = useState<SettingsTab>(
    (searchParams.tab as SettingsTab) || 'profile',
  )
  const [activeDmChannelId, setActiveDmChannelId] = useState<string | null>(searchParams.dm || null)

  // Sync activeTab with URL search params
  useEffect(() => {
    if (searchParams.tab) {
      setActiveTab(searchParams.tab as SettingsTab)
    }
    if (searchParams.dm !== undefined) {
      setActiveDmChannelId(searchParams.dm || null)
    }
  }, [searchParams.tab, searchParams.dm])

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab)
    navigate({
      to: '/settings',
      search: { tab, ...(tab === 'dm' && activeDmChannelId ? { dm: activeDmChannelId } : {}) },
      replace: true,
    })
  }

  const handleLogout = () => {
    disconnectSocket()
    logout()
    navigate({ to: '/login' })
  }

  if (!user) return null

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
      {/* Gradient background orbs */}
      <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="absolute -top-[150px] left-[5%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,var(--color-primary)_0%,transparent_70%)] opacity-[0.08] blur-[120px] animate-[float_25s_ease-in-out_infinite]" />
        <div className="absolute top-[25%] -right-[150px] w-[700px] h-[700px] rounded-full bg-[radial-gradient(circle,var(--color-danger)_0%,transparent_70%)] opacity-[0.06] blur-[120px] animate-[float_25s_ease-in-out_infinite_-7s]" />
      </div>

      {/* Mobile tab bar */}
      <div className="md:hidden flex overflow-x-auto border-b border-border-subtle bg-[var(--glass-bg)] backdrop-blur-2xl px-2 gap-1 shrink-0 relative z-10">
        {NAV_SECTIONS.flatMap((section) => section.items).map(
          ({ id, icon: Icon, labelKey, labelFallback }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all',
                activeTab === id
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary/50',
              )}
            >
              <Icon size={14} />
              {t(labelKey, labelFallback)}
            </button>
          ),
        )}
      </div>

      {/* Desktop Sidebar — Glassmorphism */}
      <aside className="w-[240px] shrink-0 hidden md:flex flex-col bg-[var(--glass-bg)] backdrop-blur-2xl border-r border-[var(--glass-border)] overflow-hidden relative z-10">
        <div className="desktop-drag-titlebar h-7 shrink-0" />

        {/* Account info header — click to go to profile */}
        <button
          type="button"
          onClick={() => handleTabChange('profile')}
          className={cn(
            'flex items-center gap-3 px-4 py-3 mx-3 mt-1 mb-1 rounded-2xl transition-all duration-200 group cursor-pointer',
            activeTab === 'profile' ? 'bg-primary/15' : 'hover:bg-bg-tertiary/50',
          )}
        >
          <UserAvatar
            userId={user.id}
            avatarUrl={user.avatarUrl ?? null}
            displayName={user.displayName ?? user.username}
            size="sm"
          />
          <div className="flex-1 min-w-0 text-left">
            <p
              className={cn(
                'text-[13px] font-bold truncate transition-colors',
                activeTab === 'profile'
                  ? 'text-primary'
                  : 'text-text-primary group-hover:text-primary',
              )}
            >
              {user.displayName ?? user.username}
            </p>
            <p className="text-[11px] text-text-muted truncate">@{user.username}</p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleLogout()
            }}
            className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
            title={t('settings.logout')}
          >
            <LogOut size={14} strokeWidth={2.2} />
          </button>
        </button>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto scrollbar-hidden">
          {NAV_SECTIONS.map((section) => (
            <div key={section.key}>
              <span className="block px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60">
                {t(section.labelKey, section.labelFallback)}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {section.items.map((item) => {
                  const isActive = activeTab === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleTabChange(item.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-full text-[13px] font-bold transition-all duration-300 group',
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary',
                      )}
                    >
                      <item.icon
                        className={cn(
                          'w-[18px] h-[18px] shrink-0 transition-colors',
                          isActive ? 'text-primary' : 'text-text-muted group-hover:text-primary',
                        )}
                        strokeWidth={2.2}
                      />
                      <span className="truncate">{t(item.labelKey, item.labelFallback)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Desktop Settings Link */}
          {'desktopAPI' in window && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <button
                onClick={() => navigate({ to: '/desktop-settings' })}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-full text-[13px] font-bold text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary transition-all duration-300 group"
              >
                <Monitor
                  size={18}
                  className="shrink-0 text-text-muted group-hover:text-primary transition-colors"
                  strokeWidth={2.2}
                />
                <span className="truncate">{t('desktop.settingsTitle', '桌面端设置')}</span>
              </button>
            </div>
          )}
        </nav>
      </aside>

      {/* Content Area */}
      <main className="flex-1 min-w-0 h-full overflow-hidden flex flex-col relative z-10">
        {activeTab !== 'dm' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto p-4 md:p-8">
              {activeTab === 'profile' && <ProfileSettings />}
              {activeTab === 'appearance' && <AppearanceSettings />}
              {activeTab === 'notification' && <NotificationSettings />}
              {activeTab === 'account' && <AccountSettings />}
              {activeTab === 'invite' && <InviteSettings />}
              {activeTab === 'tasks' && <TaskSettings />}
              {activeTab === 'wallet' && <WalletSettings />}
              {activeTab === 'buddy' && <BuddyManagementContent />}
              {activeTab === 'developer' && <DeveloperSettings />}
            </div>
          </div>
        )}

        {/* DM - unified contact sidebar + chat */}
        {activeTab === 'dm' && (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left sidebar: unified contacts */}
            <div
              className={cn(
                'w-full md:w-72 lg:w-80 flex-col border-r border-border-subtle shrink-0',
                activeDmChannelId ? 'hidden md:flex' : 'flex',
              )}
            >
              <UnifiedContactSidebar
                activeDmChannelId={activeDmChannelId}
                onSelectChannel={(id) => {
                  setActiveDmChannelId(id)
                  navigate({ to: '/settings', search: { tab: 'dm', dm: id }, replace: true })
                }}
                onStartChatWithUser={async (userId) => {
                  const data = await fetchApi<{ id: string }>('/api/dm/channels', {
                    method: 'POST',
                    body: JSON.stringify({ userId }),
                  })
                  setActiveDmChannelId(data.id)
                  navigate({
                    to: '/settings',
                    search: { tab: 'dm', dm: data.id },
                    replace: true,
                  })
                }}
              />
            </div>

            {/* Right panel: chat or default view */}
            <div
              className={cn(
                'flex-1 flex-col min-w-0',
                activeDmChannelId ? 'flex' : 'hidden md:flex',
              )}
            >
              {activeDmChannelId ? (
                <DmChatView
                  dmChannelId={activeDmChannelId}
                  onBack={() => setActiveDmChannelId(null)}
                />
              ) : (
                <DmDefaultView />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

/** Default right panel when no conversation is selected — useful content */
function DmDefaultView() {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="max-w-sm space-y-6 animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto">
          <MessageCircle size={28} className="text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-black text-text-primary mb-1.5">
            {t('dm.defaultTitle', '私信')}
          </h3>
          <p className="text-text-muted text-sm leading-relaxed">
            {t('dm.defaultDesc', '从左侧选择联系人开始对话，或搜索用户名直接触达')}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-left">
          <div className="rounded-2xl border border-border-subtle bg-bg-secondary/30 p-3">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-primary/60 mb-1">
              {t('dm.tipSearch', '搜索')}
            </div>
            <p className="text-text-muted text-xs">
              {t('dm.tipSearchDesc', '输入用户名快速定位联系人')}
            </p>
          </div>
          <div className="rounded-2xl border border-border-subtle bg-bg-secondary/30 p-3">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-primary/60 mb-1">
              {t('dm.tipAdd', '添加')}
            </div>
            <p className="text-text-muted text-xs">
              {t('dm.tipAddDesc', '点击 + 图标通过用户名添加好友')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
