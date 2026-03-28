import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  Bell,
  Bot,
  ChevronDown,
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
import { InviteSettings } from './invite'
import { NotificationSettings } from './notification'
import { ProfileSettings } from './profile'
import { QuickstartSettings } from './quickstart'
import { TaskSettings } from './tasks'

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

interface NavItem {
  id: SettingsTab
  icon: typeof User
  label: string
}

interface NavSection {
  key: string
  label: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    key: 'start',
    label: '快速开始',
    items: [{ id: 'quickstart', icon: Rocket, label: '快速开始' }],
  },
  {
    key: 'social',
    label: '社交',
    items: [
      { id: 'friends', icon: Users, label: '好友' },
      { id: 'chat', icon: MessageCircle, label: '聊天' },
    ],
  },
  {
    key: 'personal',
    label: '个人设置',
    items: [
      { id: 'profile', icon: User, label: '个人资料' },
      { id: 'appearance', icon: Paintbrush, label: '外观' },
    ],
  },
  {
    key: 'work',
    label: '工作与安全',
    items: [
      { id: 'notification', icon: Bell, label: '通知' },
      { id: 'tasks', icon: Target, label: '任务中心' },
      { id: 'account', icon: Shield, label: '账号安全' },
    ],
  },
  {
    key: 'ecosystem',
    label: '生态与邀请',
    items: [
      { id: 'buddy', icon: Bot, label: 'Buddy 管理' },
      { id: 'invite', icon: Link2, label: '邀请好友' },
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
    <div className="flex-1 flex flex-col md:flex-row bg-bg-primary overflow-hidden">
      {/* Mobile tab bar */}
      <div className="md:hidden flex overflow-x-auto border-b border-border-subtle bg-bg-secondary px-2 py-2 gap-1 shrink-0">
        {NAV_SECTIONS.flatMap((section) => section.items).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => handleTabChange(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
              activeTab === id
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Desktop Sidebar - OpenClaw Style */}
      <aside className="w-[240px] shrink-0 hidden md:flex flex-col bg-bg-secondary/40 overflow-hidden">
        <div className="desktop-drag-titlebar h-7 shrink-0 border-b border-border-subtle" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto no-scrollbar">
          {NAV_SECTIONS.map((section) => {
            const isOpen = !collapsed[section.key]
            const hasActivePage = section.items.some((item) => item.id === activeTab)

            return (
              <div key={section.key}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted/70 hover:text-text-muted transition-colors cursor-pointer"
                >
                  <ChevronDown
                    size={12}
                    className={`shrink-0 transition-transform duration-200 ${
                      isOpen || hasActivePage ? '' : '-rotate-90'
                    }`}
                  />
                  {section.label}
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
                          className={`
                            w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 group
                            ${
                              isActive
                                ? 'bg-primary text-white shadow-md shadow-primary/25'
                                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
                            }
                          `}
                        >
                          <item.icon
                            className={`w-[18px] h-[18px] shrink-0 ${
                              isActive
                                ? 'text-white'
                                : 'text-text-muted group-hover:text-primary transition-colors'
                            }`}
                            strokeWidth={2.2}
                          />
                          <span className="truncate">{item.label}</span>
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
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary transition-all duration-200 group"
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
          <button
            onClick={() => handleTabChange('account')}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold text-danger hover:bg-danger/10 transition-all duration-200"
          >
            <LogOut size={18} className="shrink-0" strokeWidth={2.2} />
            <span className="truncate">{t('settings.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Content Area */}
      <main className="flex-1 min-w-0 h-full overflow-hidden flex flex-col bg-bg-primary">
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
              {activeTab === 'buddy' && <BuddyManagementContent />}
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
      <h3 className="text-lg font-semibold text-text-secondary mb-2">
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
    online: 'bg-[#23a559]',
    idle: 'bg-amber-500',
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
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-border-subtle bg-bg-primary shrink-0">
        <MessageCircle size={20} className="text-text-muted" />
        <h2 className="text-base font-bold text-text-primary">{t('dm.chatTitle', '聊天消息')}</h2>
      </div>

      {/* Search */}
      <div className="px-4 md:px-6 pt-4 pb-2">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('dm.searchConversations', '搜索对话')}
            className="w-full bg-bg-tertiary text-text-primary rounded-md pl-3 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 md:px-4">
        <div className="text-[11px] font-bold uppercase text-text-secondary tracking-wide px-2 mb-2">
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
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-bg-modifier-hover transition text-left group ${
                  activeDmChannelId === ch.id ? 'bg-bg-modifier-active' : ''
                }`}
              >
                <div className="relative">
                  <UserAvatar
                    userId={ch.otherUser?.id ?? ''}
                    avatarUrl={ch.otherUser?.avatarUrl ?? null}
                    displayName={ch.otherUser?.displayName ?? ch.otherUser?.username ?? '?'}
                    size="md"
                  />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-bg-primary ${
                      statusColor[ch.otherUser?.status ?? 'offline'] ?? statusColor.offline
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-primary text-sm truncate">
                      {ch.otherUser?.displayName ?? ch.otherUser?.username}
                    </span>
                    {ch.otherUser?.isBot && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">
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
