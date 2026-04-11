import { cn } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Bot, Gift, MessageCircle, Monitor, Settings, Target, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../../components/common/avatar'
import { ShrimpCoinIcon } from '../../components/shop/ui/currency'
import { useAppStatus } from '../../hooks/use-app-status'
import { useUnreadCount } from '../../hooks/use-unread-count'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { BuddyManagementContent } from '../buddy-management'
import { DmChatView } from '../dm-chat'
import { UnifiedContactSidebar } from '../friends'
import { InviteSettings } from './invite'
import { SettingsModal } from './settings-modal'
import { TaskSettings } from './tasks'
import { WalletSettings } from './wallet'

type SettingsTab = 'dm' | 'buddy' | 'tasks' | 'wallet' | 'invite'

interface NavItem {
  id: SettingsTab
  icon: typeof Bot
  labelKey: string
  labelFallback: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dm', icon: MessageCircle, labelKey: 'settings.tabDM', labelFallback: '消息' },
  { id: 'buddy', icon: Bot, labelKey: 'settings.tabBuddy', labelFallback: '我的 Buddy' },
  { id: 'tasks', icon: Target, labelKey: 'settings.tabTasks', labelFallback: '赚取虾币' },
  { id: 'wallet', icon: Wallet, labelKey: 'settings.tabWallet', labelFallback: '钱包' },
  { id: 'invite', icon: Gift, labelKey: 'settings.tabInvite', labelFallback: '邀请返利' },
]

export function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const unreadCount = useUnreadCount()
  const searchParams = useSearch({ strict: false }) as { tab?: string; dm?: string }
  const { user } = useAuthStore()

  useAppStatus({
    title: t('settings.sidebarTitle'),
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })

  const MODAL_TABS = ['profile', 'account', 'appearance', 'notification', 'developer'] as const
  const initialModalTab = MODAL_TABS.includes(searchParams.tab as (typeof MODAL_TABS)[number])
    ? (searchParams.tab as (typeof MODAL_TABS)[number])
    : undefined

  const [activeTab, setActiveTab] = useState<SettingsTab>(
    initialModalTab ? 'dm' : (searchParams.tab as SettingsTab) || 'dm',
  )
  const [activeDmChannelId, setActiveDmChannelId] = useState<string | null>(searchParams.dm || null)
  const [settingsModalOpen, setSettingsModalOpen] = useState(!!initialModalTab)

  // Fetch wallet balance for nav display
  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => fetchApi<{ id: string; balance: number; frozenAmount: number }>('/api/wallet'),
  })

  // Sync activeTab with URL search params
  const isModalTab = searchParams.tab
    ? MODAL_TABS.includes(searchParams.tab as (typeof MODAL_TABS)[number])
    : false
  useEffect(() => {
    if (searchParams.tab) {
      if (isModalTab) {
        setSettingsModalOpen(true)
      } else {
        setActiveTab(searchParams.tab as SettingsTab)
      }
    }
    if (searchParams.dm !== undefined) {
      setActiveDmChannelId(searchParams.dm || null)
    }
  }, [searchParams.tab, searchParams.dm, isModalTab])

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab)
    navigate({
      to: '/settings',
      search: { tab, ...(tab === 'dm' && activeDmChannelId ? { dm: activeDmChannelId } : {}) },
      replace: true,
    })
  }

  const activeNavItem = NAV_ITEMS.find((n) => n.id === activeTab)

  if (!user) return null

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative gap-3">
      {/* Gradient background orbs */}
      <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="absolute -top-[150px] left-[5%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,var(--color-primary)_0%,transparent_70%)] opacity-[0.08] blur-[120px] animate-[float_25s_ease-in-out_infinite]" />
        <div className="absolute top-[25%] -right-[150px] w-[700px] h-[700px] rounded-full bg-[radial-gradient(circle,var(--color-danger)_0%,transparent_70%)] opacity-[0.06] blur-[120px] animate-[float_25s_ease-in-out_infinite_-7s]" />
      </div>

      {/* Mobile tab bar */}
      <div className="md:hidden flex overflow-x-auto border-b border-border-subtle bg-[var(--glass-bg)] backdrop-blur-2xl px-2 gap-1 shrink-0 relative z-10">
        {NAV_ITEMS.map(({ id, icon: Icon, labelKey, labelFallback }) => (
          <button
            type="button"
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
        ))}
        {/* Settings gear → opens modal */}
        <button
          type="button"
          onClick={() => setSettingsModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap text-text-muted hover:text-text-primary hover:bg-bg-tertiary/50 transition-all"
        >
          <Settings size={14} />
          {t('settings.sectionSettings', '设置')}
        </button>
      </div>

      {/* Desktop Sidebar — Glassmorphism */}
      <aside className="w-[240px] shrink-0 hidden md:flex flex-col glass-panel relative z-10">
        {/* Account info header — click opens settings modal */}
        <button
          type="button"
          onClick={() => setSettingsModalOpen(true)}
          className="flex items-center gap-3 px-4 py-3 mx-2 mt-2 mb-1 rounded-2xl transition-all duration-200 group cursor-pointer hover:bg-bg-tertiary/50"
        >
          <UserAvatar
            userId={user.id}
            avatarUrl={user.avatarUrl ?? null}
            displayName={user.displayName ?? user.username}
            size="sm"
          />
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[13px] font-bold truncate transition-colors text-text-primary group-hover:text-primary">
              {user.displayName ?? user.username}
            </p>
            <p className="text-[11px] text-text-muted truncate">@{user.username}</p>
          </div>
          <Settings
            size={16}
            className="shrink-0 text-text-muted group-hover:text-primary transition-colors"
            strokeWidth={2.2}
          />
        </button>

        {/* Navigation — flat list of 5 high-frequency items */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto scrollbar-hidden">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id
            const isAsset = item.id === 'tasks' || item.id === 'wallet'
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabChange(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-full text-[13px] font-bold transition-all duration-300 group',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : isAsset
                      ? 'text-text-secondary hover:bg-primary/8 hover:text-text-primary'
                      : 'text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary',
                )}
              >
                <item.icon
                  className={cn(
                    'w-[18px] h-[18px] shrink-0 transition-colors',
                    isActive
                      ? 'text-primary'
                      : isAsset
                        ? 'text-warning/70 group-hover:text-primary'
                        : 'text-text-muted group-hover:text-primary',
                  )}
                  strokeWidth={2.2}
                />
                <span className="truncate">{t(item.labelKey, item.labelFallback)}</span>
                {/* Show wallet balance inline with highlight */}
                {item.id === 'wallet' && wallet?.balance != null && (
                  <span className="ml-auto text-[11px] font-black tabular-nums text-warning bg-warning/10 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    {wallet.balance.toLocaleString()}{' '}
                    <ShrimpCoinIcon size={12} className="text-warning" />
                  </span>
                )}
              </button>
            )
          })}

          {/* Desktop Settings Link */}
          {'desktopAPI' in window && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <button
                type="button"
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
          <div className="flex-1 glass-panel h-full overflow-hidden flex flex-col">
            {/* Unified Header */}
            <div className="glass-header gap-3">
              <div className="w-8 h-8 rounded-full bg-bg-tertiary/50 flex items-center justify-center text-primary shrink-0 shadow-inner">
                {activeNavItem ? (
                  <activeNavItem.icon size={16} strokeWidth={2.5} />
                ) : (
                  <Settings size={16} strokeWidth={2.5} />
                )}
              </div>
              <h3 className="font-black text-text-primary text-[15px] truncate uppercase tracking-tight">
                {activeNavItem ? t(activeNavItem.labelKey, activeNavItem.labelFallback) : '...'}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto p-4 md:p-8">
                {activeTab === 'invite' && <InviteSettings />}
                {activeTab === 'tasks' && <TaskSettings />}
                {activeTab === 'wallet' && <WalletSettings />}
                {activeTab === 'buddy' && <BuddyManagementContent />}
              </div>
            </div>
          </div>
        )}

        {/* DM - unified contact sidebar + chat */}
        {activeTab === 'dm' && (
          <div className="flex flex-1 min-h-0 gap-3">
            {/* Left sidebar: unified contacts */}
            <div
              className={cn(
                'chat-panel glass-panel w-full shrink-0 flex-col overflow-hidden md:w-72 lg:w-80',
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
                'min-w-0 flex-1 flex-col',
                activeDmChannelId ? 'flex' : 'hidden md:flex',
              )}
            >
              {activeDmChannelId ? (
                <DmChatView
                  dmChannelId={activeDmChannelId}
                  onBack={() => setActiveDmChannelId(null)}
                />
              ) : (
                <div className="chat-panel glass-panel flex-1 overflow-hidden">
                  <DmDefaultView />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Aggregated settings modal */}
      <SettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        initialTab={initialModalTab}
      />
    </div>
  )
}

/** Default right panel when no conversation is selected — useful content */
function DmDefaultView() {
  const { t } = useTranslation()
  return (
    <div className="chat-scroll-surface flex flex-1 flex-col items-center justify-center p-8 text-center">
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
