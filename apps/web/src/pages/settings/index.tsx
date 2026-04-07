import { Button, cn, Input } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  Bell,
  Bot,
  ChevronDown,
  Code2,
  Link2,
  LogOut,
  MessageCircle,
  Monitor,
  Paintbrush,
  Rocket,
  Shield,
  Target,
  User,
  Users,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../../components/common/avatar'
import { useAppStatus } from '../../hooks/use-app-status'
import { useUnreadCount } from '../../hooks/use-unread-count'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { BuddyManagementContent } from '../buddy-management'
import { DmChatView } from '../dm-chat'
import { FriendsContent } from '../friends'
import { AccountSettings } from './account'
import { AppearanceSettings } from './appearance'
import { DeveloperSettings } from './developer'
import { InviteSettings } from './invite'
import { NotificationSettings } from './notification'
import { ProfileSettings } from './profile'
import { QuickstartSettings } from './quickstart'
import { TaskSettings } from './tasks'
import { WalletSettings } from './wallet'

type SettingsTab =
  | 'quickstart'
  | 'profile'
  | 'account'
  | 'invite'
  | 'tasks'
  | 'buddy'
  | 'appearance'
  | 'notification'
  | 'friends'
  | 'chat'
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
    key: 'start',
    labelKey: 'settings.sectionStart',
    labelFallback: '快速开始',
    items: [
      {
        id: 'quickstart',
        icon: Rocket,
        labelKey: 'settings.tabQuickStart',
        labelFallback: '快速开始',
      },
    ],
  },
  {
    key: 'social',
    labelKey: 'settings.sectionSocial',
    labelFallback: '社交',
    items: [
      { id: 'friends', icon: Users, labelKey: 'settings.tabFriends', labelFallback: '好友' },
      { id: 'chat', icon: MessageCircle, labelKey: 'settings.tabChat', labelFallback: '聊天' },
    ],
  },
  {
    key: 'personal',
    labelKey: 'settings.sectionPersonal',
    labelFallback: '个人设置',
    items: [
      { id: 'profile', icon: User, labelKey: 'settings.tabProfile', labelFallback: '个人资料' },
      {
        id: 'appearance',
        icon: Paintbrush,
        labelKey: 'settings.tabAppearance',
        labelFallback: '外观',
      },
    ],
  },
  {
    key: 'work',
    labelKey: 'settings.sectionWork',
    labelFallback: '工作与安全',
    items: [
      {
        id: 'notification',
        icon: Bell,
        labelKey: 'settings.tabNotification',
        labelFallback: '通知',
      },
      { id: 'tasks', icon: Target, labelKey: 'settings.tabTasks', labelFallback: '任务中心' },
      { id: 'wallet', icon: Wallet, labelKey: 'settings.tabWallet', labelFallback: '钱包' },
      { id: 'account', icon: Shield, labelKey: 'settings.tabAccount', labelFallback: '账号安全' },
    ],
  },
  {
    key: 'ecosystem',
    labelKey: 'settings.sectionEcosystem',
    labelFallback: '生态与邀请',
    items: [
      { id: 'buddy', icon: Bot, labelKey: 'settings.tabBuddy', labelFallback: 'Buddy 管理' },
      { id: 'invite', icon: Link2, labelKey: 'settings.tabInvite', labelFallback: '邀请好友' },
      { id: 'developer', icon: Code2, labelKey: 'settings.tabDeveloper', labelFallback: '开发者' },
    ],
  },
]

function loadCollapsedState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('settings-nav-collapsed')
    if (raw) return JSON.parse(raw) as Record<string, boolean>
  } catch {
    /* ignore */
  }
  return {
    start: false,
    social: false,
    personal: false,
    work: false,
    ecosystem: false,
  }
}

function saveCollapsedState(state: Record<string, boolean>) {
  try {
    localStorage.setItem('settings-nav-collapsed', JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

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

  const [activeTab, setActiveTab] = useState<SettingsTab>(
    (searchParams.tab as SettingsTab) || 'quickstart',
  )
  const [activeDmChannelId, setActiveDmChannelId] = useState<string | null>(searchParams.dm || null)
  const [collapsed, setCollapsed] = useState(loadCollapsedState)

  // Sync activeTab with URL search params
  useEffect(() => {
    if (searchParams.tab) {
      setActiveTab(searchParams.tab as SettingsTab)
    }
    if (searchParams.dm !== undefined) {
      setActiveDmChannelId(searchParams.dm || null)
    }
  }, [searchParams.tab, searchParams.dm])

  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      saveCollapsedState(next)
      return next
    })
  }, [])

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab)
    // Update URL to reflect the current tab
    navigate({
      to: '/settings',
      search: { tab, ...(tab === 'chat' && activeDmChannelId ? { dm: activeDmChannelId } : {}) },
      replace: true,
    })
  }

  if (!user) return null

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-bg-deep overflow-hidden">
      {/* Mobile tab bar */}
      <div className="md:hidden flex overflow-x-auto border-b border-border-subtle bg-bg-primary/60 backdrop-blur-xl px-2 py-2 gap-1 shrink-0">
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

      {/* Desktop Sidebar - OpenClaw Style */}
      <aside className="w-[240px] shrink-0 hidden md:flex flex-col bg-bg-primary/60 backdrop-blur-xl border-r border-border-subtle overflow-hidden">
        <div className="desktop-drag-titlebar h-7 shrink-0 border-b border-border-subtle" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto scrollbar-hidden">
          {NAV_SECTIONS.map((section) => {
            const isOpen = !collapsed[section.key]
            const hasActivePage = section.items.some((item) => item.id === activeTab)

            return (
              <div key={section.key}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 hover:text-text-muted transition-colors cursor-pointer"
                >
                  <ChevronDown
                    size={12}
                    className={`shrink-0 transition-transform duration-200 ${
                      isOpen || hasActivePage ? '' : '-rotate-90'
                    }`}
                  />
                  {t(section.labelKey, section.labelFallback)}
                </button>
                {(isOpen || hasActivePage) && (
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
                              isActive
                                ? 'text-primary'
                                : 'text-text-muted group-hover:text-primary',
                            )}
                            strokeWidth={2.2}
                          />
                          <span className="truncate">{t(item.labelKey, item.labelFallback)}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

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

        {/* Logout Button */}
        <div className="p-4 border-t border-border-subtle">
          <Button
            variant="ghost"
            onClick={() => handleTabChange('account')}
            className="w-full justify-start gap-3 px-3.5 py-2.5 h-auto rounded-full text-[13px] font-bold text-danger hover:bg-danger/10 hover:text-danger"
          >
            <LogOut size={18} className="shrink-0" strokeWidth={2.2} />
            <span className="truncate">{t('settings.logout')}</span>
          </Button>
        </div>
      </aside>

      {/* Content Area */}
      <main className="flex-1 min-w-0 h-full overflow-hidden flex flex-col bg-bg-deep">
        {activeTab !== 'friends' && activeTab !== 'chat' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto p-4 md:p-8">
              {activeTab === 'quickstart' && <QuickstartSettings />}
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

        {/* Friends content - full width */}
        {activeTab === 'friends' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <FriendsContent
              onStartChat={(dmChannelId) => {
                setActiveDmChannelId(dmChannelId)
                handleTabChange('chat')
              }}
            />
          </div>
        )}

        {/* Chat / DM - split layout */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* DM channel list sidebar */}
            <div
              className={`${activeDmChannelId ? 'hidden md:flex' : 'flex'} w-full md:w-72 lg:w-80 flex-col border-r border-border-subtle shrink-0`}
            >
              <DmChannelList
                activeDmChannelId={activeDmChannelId}
                onSelectChannel={(id) => {
                  setActiveDmChannelId(id)
                  navigate({
                    to: '/settings',
                    search: { tab: 'chat', dm: id },
                    replace: true,
                  })
                }}
              />
            </div>
            {/* Chat view */}
            <div
              className={`${activeDmChannelId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}
            >
              {activeDmChannelId ? (
                <DmChatView
                  dmChannelId={activeDmChannelId}
                  onBack={() => setActiveDmChannelId(null)}
                />
              ) : (
                <DmChatEmptyState />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

/** Empty state when no conversation is selected */
function DmChatEmptyState() {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <MessageCircle size={56} className="text-text-muted/20 mb-4" />
      <h3 className="text-lg font-black text-text-secondary mb-2">
        {t('dm.selectConversation', '选择一个对话')}
      </h3>
      <p className="text-text-muted text-sm max-w-xs">
        {t('dm.selectConversationDesc', '从左侧列表选择一个好友开始聊天，或者去好友列表添加新好友')}
      </p>
    </div>
  )
}

/** DM channel list - shows recent conversations as a sidebar */
function DmChannelList({
  activeDmChannelId,
  onSelectChannel,
}: {
  activeDmChannelId?: string | null
  onSelectChannel?: (id: string) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  interface DmChannelEntry {
    id: string
    userAId: string
    userBId: string
    lastMessageAt: string | null
    createdAt: string
    otherUser: {
      id: string
      username: string
      displayName: string | null
      avatarUrl: string | null
      status: string
      isBot: boolean
    } | null
  }

  const { data: dmChannels = [], isLoading } = useQuery({
    queryKey: ['dm-channels'],
    queryFn: () => fetchApi<DmChannelEntry[]>('/api/dm/channels'),
  })

  const statusColor: Record<string, string> = {
    online: 'bg-success',
    idle: 'bg-warning',
    dnd: 'bg-danger',
    offline: 'bg-text-muted',
  }

  // Sort by last message time
  const sorted = [...dmChannels]
    .filter((ch) => ch.otherUser)
    .sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bTime - aTime
    })

  const filtered = sorted.filter((ch) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      (ch.otherUser?.username ?? '').toLowerCase().includes(q) ||
      (ch.otherUser?.displayName ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-border-subtle bg-bg-deep/80 backdrop-blur-xl shrink-0">
        <MessageCircle size={20} className="text-text-muted" />
        <h2 className="text-base font-bold text-text-primary">{t('dm.chatTitle', '聊天消息')}</h2>
      </div>

      {/* Search */}
      <div className="px-4 md:px-6 pt-4 pb-2">
        <div className="relative">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('dm.searchConversations', '搜索对话')}
            className="h-9 rounded-xl text-sm px-3 py-2"
          />
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 md:px-4">
        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 px-2 mb-2">
          {t('dm.directMessages', '私信消息')} - {filtered.length}
        </div>

        {isLoading ? (
          <div className="text-text-muted text-sm py-8 text-center">
            {t('common.loading', '加载中...')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle size={48} className="mx-auto text-text-muted/30 mb-4" />
            <p className="text-text-muted text-sm">
              {searchQuery
                ? t('dm.noSearchResults', '没有找到匹配的对话')
                : t('dm.noConversations', '还没有聊天消息，去好友列表添加好友开始聊天吧！')}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  if (onSelectChannel) {
                    onSelectChannel(ch.id)
                  } else {
                    navigate({ to: '/dm/$dmChannelId', params: { dmChannelId: ch.id } })
                  }
                }}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2.5 rounded-2xl hover:bg-bg-tertiary/50 transition-all text-left group',
                  activeDmChannelId === ch.id && 'bg-bg-tertiary/30 border border-border-subtle',
                )}
              >
                <div className="relative">
                  <UserAvatar
                    userId={ch.otherUser?.id ?? ''}
                    avatarUrl={ch.otherUser?.avatarUrl ?? null}
                    displayName={ch.otherUser?.displayName ?? ch.otherUser?.username ?? '?'}
                    size="md"
                  />
                  <span
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-bg-deep',
                      statusColor[ch.otherUser?.status ?? 'offline'] ?? statusColor.offline,
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-text-primary text-sm truncate">
                      {ch.otherUser?.displayName ?? ch.otherUser?.username}
                    </span>
                    {ch.otherUser?.isBot && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-bold">
                        Buddy
                      </span>
                    )}
                  </div>
                  <span className="text-text-muted text-xs">
                    {ch.lastMessageAt
                      ? new Date(ch.lastMessageAt).toLocaleDateString()
                      : t('dm.noMessagesYet', '暂无消息')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
