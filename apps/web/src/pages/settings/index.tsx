import { cn, GlassHeader, GlassPanel } from '@shadowob/ui'
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router'
import { Bot, MessageCircle, PawPrint, Settings, Store, Target, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../../hooks/use-app-status'
import { useUnreadCount } from '../../hooks/use-unread-count'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { MyBuddySettingsContent } from '../buddy-management'
import { PersonalShopPage } from '../commerce'
import { DirectChatView } from '../dm-chat'
import { UnifiedContactSidebar } from '../friends'
import { SettingsModal } from './settings-modal'
import { TaskSettings } from './tasks'
import { WalletSettings, type WalletSettingsSection } from './wallet'

type SettingsTab = 'dm' | 'buddy' | 'tasks' | 'wallet' | 'shop'
type SettingsModalTab =
  | 'profile'
  | 'account'
  | 'appearance'
  | 'notification'
  | 'subscriptions'
  | 'developer'
type MergedSettingsSection =
  | 'invite'
  | 'entitlements'
  | 'assets'
  | 'settlements'
  | 'actions'
  | 'orders'
  | 'market'
  | 'buddies'

interface NavItem {
  id: SettingsTab
  icon: typeof Bot
  labelKey: string
  labelFallback: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'buddy', icon: PawPrint, labelKey: 'settings.tabBuddy', labelFallback: '我的 Buddy' },
  { id: 'tasks', icon: Target, labelKey: 'settings.tabTasks', labelFallback: '赚取虾币' },
  { id: 'wallet', icon: Wallet, labelKey: 'settings.tabWallet', labelFallback: '钱包' },
  { id: 'shop', icon: Store, labelKey: 'settings.tabShop', labelFallback: '我的店铺' },
]

function normalizeSettingsSection(section?: string): MergedSettingsSection | undefined {
  if (
    section === 'invite' ||
    section === 'entitlements' ||
    section === 'assets' ||
    section === 'settlements' ||
    section === 'actions' ||
    section === 'orders' ||
    section === 'market'
  ) {
    return section
  }
  return undefined
}

function normalizeSettingsPath(pathname: string) {
  return pathname.replace(/^\/app(?=\/|$)/, '').replace(/\/+$/, '')
}

function resolveSettingsLocationFromPath(pathname: string): {
  tab: SettingsTab
  section?: MergedSettingsSection
} {
  const path = normalizeSettingsPath(pathname)

  if (path === '/settings') {
    return { tab: 'buddy' }
  }

  if (path === '/settings/dm') {
    return { tab: 'buddy' }
  }

  if (path.startsWith('/settings/buddy/market')) {
    return { tab: 'buddy', section: 'market' }
  }

  if (
    path.startsWith('/settings/buddy/detail') ||
    path.startsWith('/settings/buddy/create') ||
    path === '/settings/buddy'
  ) {
    return { tab: 'buddy', section: 'buddies' }
  }

  if (path === '/settings/invite') {
    return { tab: 'tasks', section: 'invite' }
  }

  if (path === '/settings/tasks') {
    return { tab: 'tasks' }
  }

  if (path === '/settings/wallet' || path.startsWith('/settings/wallet/')) {
    const normalizedSection = path.split('/settings/wallet/')[1]
    if (normalizedSection && normalizeSettingsSection(normalizedSection)) {
      return { tab: 'wallet', section: normalizeSettingsSection(normalizedSection) }
    }
    return { tab: 'wallet' }
  }

  if (path === '/settings/shop' || path.startsWith('/settings/shop/')) {
    const normalizedSection = path.split('/settings/shop/')[1]
    if (normalizedSection === 'orders') {
      return { tab: 'shop', section: 'orders' }
    }
    return { tab: 'shop' }
  }

  if (
    path === '/settings/entitlements' ||
    path === '/settings/assets' ||
    path === '/settings/settlements' ||
    path === '/settings/actions'
  ) {
    return { tab: 'wallet', section: normalizeSettingsSection(path.replace('/settings/', '')) }
  }

  if (
    path === '/settings/profile' ||
    path === '/settings/account' ||
    path === '/settings/appearance' ||
    path === '/settings/notification' ||
    path === '/settings/subscriptions' ||
    path === '/settings/friends' ||
    path === '/settings/quickstart'
  ) {
    return { tab: 'buddy' }
  }

  return { tab: 'buddy' }
}

function resolveModalTabFromPath(pathname: string): SettingsModalTab | undefined {
  const path = normalizeSettingsPath(pathname)
  if (path === '/settings/profile') return 'profile'
  if (path === '/settings/account') return 'account'
  if (path === '/settings/appearance') return 'appearance'
  if (path === '/settings/notification') return 'notification'
  if (path === '/settings/subscriptions') return 'subscriptions'
  return undefined
}

export function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const unreadCount = useUnreadCount()
  const searchParams = useSearch({ strict: false }) as { dm?: string; tab?: string }
  const { user } = useAuthStore()
  const normalizedLocation = resolveSettingsLocationFromPath(location.pathname)
  const modalTabFromPath = resolveModalTabFromPath(location.pathname)

  useAppStatus({
    title: t('settings.sidebarTitle'),
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })

  const activeTab = normalizedLocation.tab
  const [activeDirectChannelId, setActiveDirectChannelId] = useState<string | null>(
    searchParams.dm || null,
  )
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)

  // Backward compatibility: legacy ?tab=developer URLs auto-open the SettingsModal
  useEffect(() => {
    if (searchParams.tab === 'developer' || modalTabFromPath) {
      setSettingsModalOpen(true)
    }
  }, [modalTabFromPath, searchParams.tab])

  useEffect(() => {
    if (normalizeSettingsPath(location.pathname) === '/settings/dm' && searchParams.dm) {
      navigate({
        to: '/dm/$dmChannelId',
        params: { dmChannelId: searchParams.dm },
        replace: true,
      })
    }
  }, [location.pathname, navigate, searchParams.dm])

  // Sync direct chat channel with URL search params
  useEffect(() => {
    if (searchParams.dm !== undefined) {
      setActiveDirectChannelId(searchParams.dm || null)
    }
  }, [searchParams.dm])

  const handleTabChange = (tab: SettingsTab) => {
    let nextPath = '/settings/buddy'
    if (tab === 'dm') {
      nextPath = '/settings/dm'
    } else if (tab === 'buddy') {
      nextPath = '/settings/buddy'
    } else if (tab === 'tasks') {
      nextPath = '/settings/tasks'
    } else if (tab === 'wallet') {
      nextPath = '/settings/wallet'
    } else if (tab === 'shop') {
      nextPath = '/settings/shop'
    }
    navigate({
      to: nextPath,
      search: tab === 'dm' && activeDirectChannelId ? { dm: activeDirectChannelId } : undefined,
      replace: true,
    })
  }

  const activeNavItem = NAV_ITEMS.find((n) => n.id === activeTab)
  const activeSection: MergedSettingsSection | undefined =
    normalizedLocation.tab === activeTab ? normalizedLocation.section : undefined

  if (!user) return null

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden relative">
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

      {/* Content Area */}
      <main className="flex-1 min-w-0 h-full overflow-hidden flex flex-col relative z-10">
        {activeTab !== 'dm' && activeTab !== 'buddy' && (
          <GlassPanel className="flex-1 h-full overflow-hidden flex flex-col">
            {/* Unified Header */}
            <GlassHeader className="gap-3">
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
            </GlassHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto p-4 md:p-8">
                {activeTab === 'tasks' && (
                  <TaskSettings initialSection={activeSection === 'invite' ? 'invite' : 'tasks'} />
                )}
                {activeTab === 'wallet' && (
                  <WalletSettings
                    initialSection={(activeSection as WalletSettingsSection) ?? 'transactions'}
                  />
                )}
                {activeTab === 'shop' && (
                  <PersonalShopPage
                    initialSection={activeSection === 'orders' ? 'orders' : 'shop'}
                  />
                )}
              </div>
            </div>
          </GlassPanel>
        )}

        {/* Buddy - full height split layout */}
        {activeTab === 'buddy' && (
          <div className="flex flex-1 min-h-0 gap-3">
            <MyBuddySettingsContent
              initialSection={activeSection === 'market' ? 'market' : 'buddies'}
            />
          </div>
        )}

        {/* DM - unified contact sidebar + chat */}
        {activeTab === 'dm' && (
          <div className="flex flex-1 h-full min-h-0 gap-3">
            {/* Left sidebar: unified contacts */}
            <GlassPanel
              className={cn(
                'chat-panel h-full w-full shrink-0 flex-col overflow-hidden md:w-72 lg:w-80',
                activeDirectChannelId ? 'hidden md:flex' : 'flex',
              )}
            >
              <UnifiedContactSidebar
                activeDirectChannelId={activeDirectChannelId}
                onSelectChannel={(id) => {
                  setActiveDirectChannelId(id)
                  navigate({ to: '/settings/dm', search: { dm: id }, replace: true })
                }}
                onStartChatWithUser={async (userId) => {
                  const data = await fetchApi<{ id: string }>('/api/channels/dm', {
                    method: 'POST',
                    body: JSON.stringify({ userId }),
                  })
                  setActiveDirectChannelId(data.id)
                  navigate({
                    to: '/settings/dm',
                    search: { dm: data.id },
                    replace: true,
                  })
                }}
              />
            </GlassPanel>

            {/* Right panel: chat or default view */}
            <div
              className={cn(
                'min-w-0 h-full flex-1 flex-col',
                activeDirectChannelId ? 'flex' : 'hidden md:flex',
              )}
            >
              {activeDirectChannelId ? (
                <DirectChatView
                  channelId={activeDirectChannelId}
                  onBack={() => setActiveDirectChannelId(null)}
                />
              ) : (
                <GlassPanel className="chat-panel h-full flex-1 overflow-hidden">
                  <DmDefaultView />
                </GlassPanel>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Aggregated settings modal */}
      <SettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        initialTab={
          searchParams.tab === 'developer'
            ? 'developer'
            : modalTabFromPath
              ? modalTabFromPath
              : searchParams.tab === 'profile'
                ? 'profile'
                : searchParams.tab === 'account'
                  ? 'account'
                  : searchParams.tab === 'appearance'
                    ? 'appearance'
                    : searchParams.tab === 'notification'
                      ? 'notification'
                      : undefined
        }
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
