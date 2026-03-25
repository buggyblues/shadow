import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  Bell,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Compass,
  Copy,
  ExternalLink,
  FileText,
  Heart,
  HelpCircle,
  Home,
  Link2,
  LogOut,
  MessageCircle,
  Monitor,
  Moon,
  Paintbrush,
  Plus,
  Rocket,
  Save,
  Shield,
  Sparkles,
  Sun,
  Target,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../components/common/avatar'
import { AvatarEditor } from '../components/common/avatar-editor'
import { LanguageSwitcher } from '../components/common/language-switcher'
import { PriceDisplay } from '../components/shop/ui/currency'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import { disconnectSocket } from '../lib/socket'
import { useAuthStore } from '../stores/auth.store'
import { type ThemeMode, useUIStore } from '../stores/ui.store'
import { BuddyManagementContent } from './buddy-management'
import { DmChatView } from './dm-chat'
import { FriendsContent } from './friends'

export function SettingsPage() {
  const { t } = useTranslation()
  const unreadCount = useUnreadCount()
  useAppStatus({
    title: t('settings.sidebarTitle'),
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })
  const navigate = useNavigate()
  const searchParams = useSearch({ strict: false }) as { tab?: string; dm?: string }
  const { user, setUser, logout } = useAuthStore()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState<
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
  >((searchParams.tab as 'chat') || 'quickstart')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [activeDmChannelId, setActiveDmChannelId] = useState<string | null>(searchParams.dm || null)
  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => fetchApi<{ balance: number }>('/api/wallet'),
  })

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '')
      setSelectedAvatar(user.avatarUrl ?? null)
    }
  }, [user])

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    setSaveSuccess(false)
    try {
      const result = await fetchApi<{
        id: string
        email: string
        username: string
        displayName: string | null
        avatarUrl: string | null
      }>('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: displayName || undefined,
          avatarUrl: selectedAvatar,
        }),
      })
      setUser({ ...user!, ...result })
      setMessage(t('common.saveSuccess'))
      setSaveSuccess(true)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('common.saveFailed'))
      setSaveSuccess(false)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = () => {
    disconnectSocket()
    logout()
    navigate({ to: '/login' })
  }

  if (!user) return null

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-bg-primary overflow-hidden">
      {/* Mobile tab bar */}
      <div className="md:hidden flex overflow-x-auto border-b border-border-subtle bg-bg-secondary px-2 py-2 gap-1 shrink-0">
        {[
          { key: 'quickstart' as const, icon: Rocket, label: t('settings.tabQuickStart') },
          { key: 'friends' as const, icon: Users, label: t('friends.title', '好友') },
          { key: 'chat' as const, icon: MessageCircle, label: t('dm.chatTitle', '聊天') },
          { key: 'profile' as const, icon: User, label: t('settings.tabProfile') },
          { key: 'appearance' as const, icon: Paintbrush, label: t('settings.tabAppearance') },
          { key: 'notification' as const, icon: Bell, label: '通知' },
          { key: 'tasks' as const, icon: Target, label: '任务中心' },
          { key: 'buddy' as const, icon: Bot, label: t('settings.tabBuddy') },
          { key: 'account' as const, icon: Shield, label: t('settings.tabAccount') },
          { key: 'invite' as const, icon: Link2, label: t('settings.tabInvite') },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
              activeTab === key
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Desktop Sidebar */}
      <div className="w-64 bg-bg-secondary hidden md:flex flex-col shrink-0">
        <div className="desktop-drag-titlebar h-7 shrink-0 border-b border-border-subtle" />
        <nav className="px-3 pt-4 space-y-0.5 overflow-y-auto">
          <div className="px-2 py-1 text-[11px] font-bold uppercase text-text-secondary tracking-wide">
            快速开始
          </div>
          <button
            onClick={() => setActiveTab('quickstart')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'quickstart'
                ? 'bg-bg-modifier-active text-text-primary'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
          >
            <Rocket
              size={18}
              className={`shrink-0 ${activeTab === 'quickstart' ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
            />
            {t('settings.tabQuickStart')}
          </button>

          {/* Social section */}
          <div className="px-2 py-3 text-[11px] font-bold uppercase text-text-secondary tracking-wide mt-2">
            {t('friends.sectionSocial', '社交')}
          </div>
          <button
            onClick={() => setActiveTab('friends')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'friends'
                ? 'bg-bg-modifier-active text-text-primary'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
          >
            <Users
              size={18}
              className={`shrink-0 ${activeTab === 'friends' ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
            />
            {t('friends.title', '好友')}
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'chat'
                ? 'bg-bg-modifier-active text-text-primary'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
          >
            <MessageCircle
              size={18}
              className={`shrink-0 ${activeTab === 'chat' ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
            />
            {t('dm.chatTitle', '聊天')}
          </button>

          <div className="px-2 py-3 text-[11px] font-bold uppercase text-text-secondary tracking-wide mt-2">
            个人设置
          </div>
          <button
            onClick={() => setActiveTab('profile')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'profile'
                ? 'bg-bg-modifier-active text-text-primary'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
          >
            <User
              size={18}
              className={`shrink-0 ${activeTab === 'profile' ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
            />
            {t('settings.tabProfile')}
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'appearance'
                ? 'bg-bg-modifier-active text-text-primary'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
          >
            <Paintbrush
              size={18}
              className={`shrink-0 ${activeTab === 'appearance' ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
            />
            {t('settings.tabAppearance')}
          </button>

          <div className="px-2 py-3 text-[11px] font-bold uppercase text-text-secondary tracking-wide mt-2">
            工作与安全
          </div>
          {'desktopAPI' in window && (
            <button
              onClick={() => navigate({ to: '/desktop-settings' })}
              className="group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary transition"
            >
              <Monitor size={18} className="shrink-0 opacity-60 group-hover:text-text-primary" />
              {t('desktop.settingsTitle', '桌面端设置')}
            </button>
          )}
          <button
            onClick={() => setActiveTab('notification')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'notification'
                ? 'bg-bg-modifier-active text-text-primary'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
          >
            <Bell
              size={18}
              className={`shrink-0 ${activeTab === 'notification' ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
            />
            通知
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'tasks'
                ? 'bg-bg-modifier-active text-text-primary'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
          >
            <Target
              size={18}
              className={`shrink-0 ${activeTab === 'tasks' ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
            />
            任务中心
          </button>
          <button
            onClick={() => setActiveTab('account')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'account'
                ? 'bg-bg-modifier-active text-text-primary'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
          >
            <Shield
              size={18}
              className={`shrink-0 ${activeTab === 'account' ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
            />
            {t('settings.tabAccount')}
          </button>

          <div className="px-2 py-3 text-[11px] font-bold uppercase text-text-secondary tracking-wide mt-2">
            生态与邀请
          </div>
          <button
            onClick={() => setActiveTab('buddy')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'buddy'
                ? 'bg-bg-modifier-active text-text-primary'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
          >
            <Bot
              size={18}
              className={`shrink-0 ${activeTab === 'buddy' ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
            />
            {t('settings.tabBuddy')}
          </button>
          <button
            onClick={() => setActiveTab('invite')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'invite'
                ? 'bg-bg-modifier-active text-text-primary'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
          >
            <Link2
              size={18}
              className={`shrink-0 ${activeTab === 'invite' ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
            />
            {t('settings.tabInvite')}
          </button>
        </nav>
        <div className="mt-auto p-4 border-t-2 border-bg-tertiary">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium text-danger hover:bg-danger/10 transition"
          >
            <LogOut size={16} />
            {t('settings.logout')}
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab !== 'friends' && activeTab !== 'chat' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-4 md:p-8">
            {activeTab === 'quickstart' && (
              <QuickstartPage navigate={navigate} setActiveTab={setActiveTab} />
            )}

            {activeTab === 'profile' && (
              <>
                <h2 className="text-2xl font-bold text-text-primary mb-6">
                  {t('settings.profileTitle')}
                </h2>

                {/* Preview card */}
                <div className="bg-bg-secondary rounded-xl p-6 mb-8 border border-border-subtle">
                  <div className="flex items-center gap-4">
                    <UserAvatar
                      userId={user.id}
                      avatarUrl={selectedAvatar}
                      displayName={displayName || user.username}
                      size="xl"
                    />
                    <div>
                      <h3 className="text-lg font-bold text-text-primary">
                        {displayName || user.username}
                      </h3>
                      <p className="text-sm text-text-muted">@{user.username}</p>
                      <p className="text-xs text-text-muted mt-1">{user.email}</p>
                      <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-tertiary border border-border-subtle">
                        <span className="text-xs text-text-muted">虾币</span>
                        <PriceDisplay amount={wallet?.balance ?? 0} size={13} className="ml-0.5" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Display name */}
                <div className="mb-6">
                  <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                    {t('settings.displayNameLabel')}
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary transition"
                    placeholder={user.username}
                  />
                </div>

                {/* Avatar picker */}
                <div className="mb-8">
                  <label className="block text-[12px] font-bold uppercase text-text-secondary mb-3 tracking-wide">
                    {t('settings.avatarLabel')}
                  </label>
                  <AvatarEditor value={selectedAvatar ?? undefined} onChange={setSelectedAvatar} />
                </div>

                {/* Language */}
                <div className="mb-8">
                  <label className="block text-xs font-bold uppercase text-text-secondary mb-3">
                    {t('settings.languageLabel')}
                  </label>
                  <LanguageSwitcher />
                </div>

                {/* Save */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-hover text-white font-bold rounded-lg transition disabled:opacity-50"
                  >
                    <Save size={16} />
                    {saving ? t('common.saving') : t('common.saveChanges')}
                  </button>
                  {message && (
                    <span className={`text-sm ${saveSuccess ? 'text-green-400' : 'text-red-400'}`}>
                      {message}
                    </span>
                  )}
                </div>
              </>
            )}

            {activeTab === 'appearance' && <AppearanceSettings />}

            {activeTab === 'notification' && <NotificationSettings />}

            {activeTab === 'account' && (
              <>
                <h2 className="text-2xl font-bold text-text-primary mb-6">
                  {t('settings.accountTitle')}
                </h2>

                <div className="bg-bg-secondary rounded-xl p-6 space-y-5 border border-border-subtle">
                  <div>
                    <label className="block text-xs font-bold uppercase text-text-secondary mb-1">
                      {t('settings.emailLabel')}
                    </label>
                    <p className="text-text-primary">{user.email}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-text-secondary mb-1">
                      {t('settings.usernameLabel')}
                    </label>
                    <p className="text-text-primary">@{user.username}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-text-secondary mb-1">
                      {t('settings.userIdLabel')}
                    </label>
                    <p className="text-text-muted text-xs font-mono">{user.id}</p>
                  </div>
                </div>

                <div className="mt-8 p-6 bg-bg-secondary rounded-xl border border-danger/20">
                  <h3 className="text-lg font-bold text-danger mb-2">
                    {t('settings.dangerTitle')}
                  </h3>
                  <p className="text-sm text-text-muted mb-4">
                    {t('settings.dangerLogoutWarning')}
                  </p>
                  <button
                    onClick={() => setShowLogoutConfirm(true)}
                    className="px-4 py-2 bg-danger/10 text-danger border border-danger/20 rounded-lg hover:bg-danger/20 transition text-sm font-bold"
                  >
                    {t('settings.logout')}
                  </button>
                </div>
              </>
            )}

            {activeTab === 'invite' && <InviteManagement />}

            {activeTab === 'tasks' && <TaskCenter onSwitchTab={setActiveTab} />}

            {activeTab === 'buddy' && <BuddyManagementContent />}
          </div>
        </div>
      )}
      {/* Friends content — full width, not in the constrained container */}
      {activeTab === 'friends' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <FriendsContent
            onStartChat={(dmChannelId) => {
              setActiveDmChannelId(dmChannelId)
              setActiveTab('chat')
            }}
          />
        </div>
      )}

      {/* Chat / DM — split layout: channel list + chat view */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* DM channel list sidebar (hidden on mobile when chat is open) */}
          <div
            className={`${activeDmChannelId ? 'hidden md:flex' : 'flex'} w-full md:w-72 lg:w-80 flex-col border-r border-border-subtle shrink-0`}
          >
            <DmChannelList
              activeDmChannelId={activeDmChannelId}
              onSelectChannel={setActiveDmChannelId}
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

      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="bg-bg-secondary rounded-xl p-6 w-full max-w-96 mx-4 border border-border-subtle"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-text-primary mb-2">
              {t('settings.logoutConfirmTitle')}
            </h2>
            <p className="text-text-muted text-sm mb-6">{t('settings.logoutConfirmMessage')}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-danger text-white rounded-lg hover:bg-red-600 transition font-bold"
              >
                {t('settings.logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: pref } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () =>
      fetchApi<{
        strategy: 'all' | 'mention_only' | 'none'
        mutedServerIds: string[]
        mutedChannelIds: string[]
      }>('/api/notifications/preferences'),
  })

  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () =>
      fetchApi<
        Array<{ server: { id: string; name: string; slug: string | null; iconUrl: string | null } }>
      >('/api/servers'),
  })

  const updatePref = useMutation({
    mutationFn: (
      payload: Partial<{
        strategy: 'all' | 'mention_only' | 'none'
        mutedServerIds: string[]
        mutedChannelIds: string[]
      }>,
    ) =>
      fetchApi('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const mutedServers = servers.filter((s) => (pref?.mutedServerIds ?? []).includes(s.server.id))

  return (
    <>
      <h2 className="text-2xl font-bold text-text-primary mb-2">通知设置</h2>
      <p className="text-text-muted text-sm mb-6">管理通知策略、频道/服务器静音。</p>

      <div className="bg-bg-secondary rounded-xl border border-border-subtle p-6 mb-6">
        <label className="block text-xs font-bold uppercase text-text-secondary mb-4 tracking-wide">
          通知策略
        </label>
        <div className="space-y-2">
          {[
            {
              value: 'all' as const,
              title: '全部通知',
              desc: '接收提及、回复与系统通知。',
            },
            {
              value: 'mention_only' as const,
              title: '仅提及',
              desc: '只接收@提及和系统通知。',
            },
            {
              value: 'none' as const,
              title: '仅系统',
              desc: '屏蔽消息类通知，仅保留系统通知。',
            },
          ].map((item) => {
            const checked = (pref?.strategy ?? 'all') === item.value
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => updatePref.mutate({ strategy: item.value })}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  checked
                    ? 'border-primary bg-primary/10'
                    : 'border-border-subtle hover:border-border-dim bg-bg-tertiary'
                }`}
              >
                <p
                  className={`text-sm font-bold ${checked ? 'text-primary' : 'text-text-primary'}`}
                >
                  {item.title}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{item.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-bg-secondary rounded-xl border border-border-subtle p-6">
        <h3 className="text-lg font-bold text-text-primary mb-3">已静音服务器</h3>
        {mutedServers.length === 0 ? (
          <p className="text-sm text-text-muted">暂无已静音服务器</p>
        ) : (
          <div className="space-y-2">
            {mutedServers.map((s) => (
              <div
                key={s.server.id}
                className="flex items-center justify-between rounded-lg bg-bg-tertiary px-3 py-2"
              >
                <span className="text-sm text-text-primary truncate">{s.server.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    updatePref.mutate({
                      mutedServerIds: (pref?.mutedServerIds ?? []).filter(
                        (id) => id !== s.server.id,
                      ),
                    })
                  }
                  className="text-xs px-2 py-1 rounded bg-bg-modifier-hover hover:bg-bg-modifier-active text-text-secondary"
                >
                  取消静音
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-text-muted mt-4">频道静音可在频道列表右键菜单中设置。</p>
      </div>
    </>
  )
}

interface InviteCode {
  id: string
  code: string
  createdBy: string
  usedBy: string | null
  note: string | null
  isActive: boolean
  usedAt: string | null
  createdAt: string
  usedByUser: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

function InviteManagement() {
  const { t } = useTranslation()
  const { data: referralSummary } = useQuery({
    queryKey: ['task-referral-summary'],
    queryFn: () =>
      fetchApi<{
        rewardPerUser: number
        rewardForInviter: number
        rewardForInvitee: number
        successfulInvites: number
        totalInviteRewards: number
        campaignText: string
      }>('/api/tasks/referral-summary'),
  })
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [note, setNote] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [friendRequestSent, setFriendRequestSent] = useState<Set<string>>(new Set())

  const fetchCodes = async () => {
    try {
      const data = await fetchApi<InviteCode[]>('/api/invite-codes')
      setCodes(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetch on mount only
  useEffect(() => {
    fetchCodes()
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await fetchApi('/api/invite-codes', {
        method: 'POST',
        body: JSON.stringify({ count: 1, note: note || undefined }),
      })
      setNote('')
      setShowCreateForm(false)
      await fetchCodes()
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  const handleDeactivate = async (id: string) => {
    try {
      await fetchApi(`/api/invite-codes/${id}/deactivate`, { method: 'PATCH' })
      await fetchCodes()
    } catch {
      // ignore
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetchApi(`/api/invite-codes/${id}`, { method: 'DELETE' })
      await fetchCodes()
    } catch {
      // ignore
    }
  }

  const copyCode = (code: string, id: string) => {
    const registerUrl = `${window.location.origin}/app/register?code=${code}`
    navigator.clipboard.writeText(registerUrl)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleAddFriend = async (username: string, userId: string) => {
    try {
      await fetchApi('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username }),
      })
      setFriendRequestSent((prev) => new Set(prev).add(userId))
    } catch {
      // ignore
    }
  }

  return (
    <>
      <div className="bg-gradient-to-r from-primary/15 to-emerald-500/15 border border-primary/20 rounded-xl p-4 mb-6">
        <p className="text-sm font-bold text-text-primary">
          {referralSummary?.campaignText ?? '邀请好友完成注册登录，你和好友均可获得 500 虾币'}
        </p>
        <p className="text-xs text-text-muted mt-1">
          已成功邀请 {referralSummary?.successfulInvites ?? 0} 人，累计获得{' '}
          {referralSummary?.totalInviteRewards ?? 0} 虾币
        </p>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">{t('settings.inviteTitle')}</h2>
          <p className="text-sm text-text-muted mt-1">{t('settings.inviteDesc')}</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition font-bold text-sm"
        >
          {showCreateForm ? <X size={16} /> : <Plus size={16} />}
          {showCreateForm ? t('common.cancel') : t('settings.inviteCreate')}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-bg-secondary rounded-xl p-4 mb-6 border border-border-subtle">
          <div className="flex gap-3">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  handleCreate()
                }
              }}
              placeholder={t('settings.inviteNotePlaceholder')}
              className="flex-1 bg-bg-tertiary text-text-primary rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary transition text-sm"
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg transition font-bold text-sm disabled:opacity-50"
            >
              {creating ? t('common.loading') : t('settings.inviteGenerate')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-text-muted py-12">{t('common.loading')}</div>
      ) : codes.length === 0 ? (
        <div className="text-center text-text-muted py-12 bg-bg-secondary rounded-xl border border-border-subtle">
          <Link2 size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{t('settings.inviteEmpty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {codes.map((code) => {
            const isUsed = !!code.usedBy
            const isActive = code.isActive && !isUsed

            return (
              <div
                key={code.id}
                className={`bg-bg-secondary rounded-xl p-4 border transition ${
                  isActive ? 'border-border-subtle' : 'border-border-subtle opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold text-text-primary tracking-wider">
                        {code.code}
                      </span>
                      {isUsed && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded font-medium">
                          {t('settings.inviteUsed')}
                        </span>
                      )}
                      {!isActive && !isUsed && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 rounded font-medium">
                          {t('settings.inviteInactive')}
                        </span>
                      )}
                      {isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded font-medium">
                          {t('settings.inviteActive')}
                        </span>
                      )}
                    </div>
                    {code.note && <p className="text-xs text-text-muted truncate">{code.note}</p>}
                    {isUsed && code.usedByUser && (
                      <div className="flex items-center gap-2 mt-1">
                        <UserAvatar
                          userId={code.usedByUser.id}
                          avatarUrl={code.usedByUser.avatarUrl}
                          size="xs"
                        />
                        <p className="text-xs text-text-muted">
                          {t('settings.inviteUsedBy')}:{' '}
                          {code.usedByUser.displayName || code.usedByUser.username}
                          {code.usedAt && (
                            <span className="ml-2 text-text-muted/60">
                              {new Date(code.usedAt).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    <p className="text-[11px] text-text-muted/50 mt-0.5">
                      {new Date(code.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isUsed && code.usedByUser && !friendRequestSent.has(code.usedByUser.id) && (
                      <button
                        onClick={() =>
                          handleAddFriend(code.usedByUser!.username, code.usedByUser!.id)
                        }
                        className="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition"
                        title={t('friends.addFriend', '添加好友')}
                      >
                        <UserPlus size={15} />
                      </button>
                    )}
                    {isUsed && code.usedByUser && friendRequestSent.has(code.usedByUser.id) && (
                      <span className="p-2 text-green-400">
                        <Check size={15} />
                      </span>
                    )}
                    {isActive && (
                      <button
                        onClick={() => copyCode(code.code, code.id)}
                        className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-modifier-active rounded-lg transition"
                        title={t('settings.inviteCopyLink')}
                      >
                        {copiedId === code.id ? (
                          <Check size={15} className="text-green-400" />
                        ) : (
                          <Copy size={15} />
                        )}
                      </button>
                    )}
                    {isActive && (
                      <button
                        onClick={() => handleDeactivate(code.id)}
                        className="p-2 text-text-muted hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition"
                        title={t('settings.inviteDeactivate')}
                      >
                        <X size={15} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(code.id)}
                      className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                      title={t('common.delete')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function TaskCenter({
  onSwitchTab,
}: {
  onSwitchTab: (
    tab:
      | 'quickstart'
      | 'profile'
      | 'account'
      | 'invite'
      | 'tasks'
      | 'buddy'
      | 'appearance'
      | 'notification',
  ) => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { setPendingAction } = useUIStore()

  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  const taskGuides: Record<string, string> = {
    create_server:
      '1. 进入「发现」页面\n2. 点击「创建服务器」按钮\n3. 填写服务器名称、头像等信息\n4. 服务器创建后会自动包含一个默认频道',
    create_channel:
      '1. 进入已加入的服务器\n2. 在频道列表上方点击 ＋ 号\n3. 输入频道名称，选择频道类型（文字/语音/公告）\n4. 设置频道权限（公开/私密）',
    first_message:
      '1. 进入任意服务器的频道\n2. 在底部消息输入框中输入内容\n3. 按回车键或点击发送按钮即可\n4. 支持 Markdown 格式、表情、图片等',
    create_buddy:
      '1. 进入「Buddy 管理」页面\n2. 点击「创建 Buddy」按钮\n3. 填写 Buddy 名称、描述等信息\n4. 创建后可通过 OpenClaw 连接 Buddy',
    list_buddy:
      '1. 进入「Buddy 管理」页面\n2. 选择要挂单的 Buddy\n3. 点击「上架到集市」\n4. 填写设备信息、技能标签和费率',
    rent_buddy:
      '1. 进入「Buddy 集市」页面（/buddies）\n2. 浏览可租赁的 Buddy 列表\n3. 点击感兴趣的 Buddy 查看详情\n4. 确认费用后签署租赁合同',
    list_product:
      '1. 进入已加入的服务器\n2. 点击侧边栏的「商店管理」\n3. 点击「上架商品」按钮\n4. 填写商品信息、规格和价格',
    invite_signup:
      '1. 进入「邀请好友」页面\n2. 复制你的专属邀请链接\n3. 分享给朋友注册\n4. 好友注册成功后双方均可获得虾币奖励',
  }

  const canNavigate = (taskKey: string): boolean => {
    switch (taskKey) {
      case 'create_channel':
      case 'first_message':
      case 'list_product':
        return !!servers[0]?.server?.slug
      default:
        return true
    }
  }

  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () =>
      fetchApi<
        Array<{ server: { id: string; name: string; slug: string | null; iconUrl: string | null } }>
      >('/api/servers'),
  })

  const getActionLabel = (taskKey: string) => {
    switch (taskKey) {
      case 'create_server':
        return '去创建服务器'
      case 'create_channel':
        return '去创建频道'
      case 'first_message':
        return '去发消息'
      case 'create_buddy':
        return '去创建 Buddy'
      case 'list_buddy':
        return '去挂单 Buddy'
      case 'rent_buddy':
        return '去租赁 Buddy'
      case 'list_product':
        return '去上架商品'
      case 'invite_signup':
        return '去邀请好友'
      default:
        return '去完成'
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['task-center'],
    queryFn: () =>
      fetchApi<{
        wallet: { balance: number }
        summary: { totalTasks: number; claimableTasks: number; completedTasks: number }
        tasks: Array<{
          key: string
          title: string
          description: string
          reward: number
          type: 'one_time' | 'repeatable'
          completed: boolean
          claimable: boolean
          claimedCount: number
        }>
      }>('/api/tasks'),
  })

  const { data: rewardLogs } = useQuery({
    queryKey: ['task-reward-history'],
    queryFn: () =>
      fetchApi<
        Array<{
          id: string
          rewardKey: string
          amount: number
          note: string | null
          createdAt: string
        }>
      >('/api/tasks/rewards?limit=20'),
  })

  const claimMutation = useMutation({
    mutationFn: (taskKey: string) => fetchApi(`/api/tasks/${taskKey}/claim`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-center'] })
      queryClient.invalidateQueries({ queryKey: ['task-referral-summary'] })
    },
  })

  return (
    <>
      <h2 className="text-2xl font-bold text-text-primary mb-2">任务中心</h2>
      <p className="text-text-muted text-sm mb-6">完成任务赚取虾币，支持一次性任务与活动任务。</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-bg-secondary rounded-xl border border-border-subtle p-4">
          <p className="text-[11px] text-text-muted uppercase font-bold">任务总数</p>
          <p className="text-lg font-extrabold text-text-primary">
            {data?.summary.totalTasks ?? 0}
          </p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border-subtle p-4">
          <p className="text-[11px] text-text-muted uppercase font-bold">可领取</p>
          <p className="text-lg font-extrabold text-emerald-400">
            {data?.summary.claimableTasks ?? 0}
          </p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border-subtle p-4">
          <p className="text-[11px] text-text-muted uppercase font-bold">已完成</p>
          <p className="text-lg font-extrabold text-primary">{data?.summary.completedTasks ?? 0}</p>
        </div>
      </div>

      <div className="bg-bg-secondary rounded-xl border border-border-subtle p-5 mb-6">
        <p className="text-xs text-text-muted uppercase font-bold mb-1">当前虾币</p>
        <div className="flex items-center gap-2">
          <PriceDisplay amount={data?.wallet.balance ?? 0} size={20} />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-text-muted py-12">加载任务中…</div>
      ) : (
        <div className="space-y-3">
          {data?.tasks.map((task) => (
            <div
              key={task.key}
              className="bg-bg-secondary rounded-xl border border-border-subtle p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-bold text-text-primary">{task.title}</p>
                  <p className="text-xs text-text-muted mt-1">{task.description}</p>
                  <div className="text-xs text-emerald-400 mt-1 inline-flex items-center gap-1">
                    <span>奖励：</span>
                    <PriceDisplay amount={task.reward} size={12} />
                  </div>
                </div>

                {task.type === 'repeatable' ? (
                  task.claimedCount > 0 ? (
                    <span className="text-xs px-2 py-1 rounded bg-emerald-500/15 text-emerald-400">
                      已完成 {task.claimedCount} 次
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSwitchTab('invite')}
                      className="text-xs px-2 py-1 rounded bg-primary/20 hover:bg-primary/30 text-primary"
                    >
                      {getActionLabel(task.key)}
                    </button>
                  )
                ) : task.claimable ? (
                  <button
                    type="button"
                    onClick={() => claimMutation.mutate(task.key)}
                    disabled={claimMutation.isPending}
                    className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-bold disabled:opacity-50"
                  >
                    领取
                  </button>
                ) : task.completed ? (
                  <span className="text-xs px-2 py-1 rounded bg-green-500/15 text-green-400">
                    已领取
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {canNavigate(task.key) && (
                      <button
                        type="button"
                        onClick={() => {
                          switch (task.key) {
                            case 'create_server':
                              setPendingAction('create-server')
                              navigate({ to: '/discover' })
                              break
                            case 'create_channel': {
                              const firstSlug = servers[0]?.server?.slug
                              if (firstSlug) {
                                setPendingAction('create-channel')
                                navigate({
                                  to: '/servers/$serverSlug',
                                  params: { serverSlug: firstSlug },
                                })
                              }
                              break
                            }
                            case 'first_message': {
                              const slug = servers[0]?.server?.slug
                              if (slug) {
                                navigate({
                                  to: '/servers/$serverSlug',
                                  params: { serverSlug: slug },
                                })
                              }
                              break
                            }
                            case 'create_buddy':
                              setPendingAction('create-buddy')
                              onSwitchTab('buddy')
                              break
                            case 'list_buddy':
                              onSwitchTab('buddy')
                              break
                            case 'rent_buddy':
                              window.location.href = '/buddies'
                              break
                            case 'list_product': {
                              const shopSlug = servers[0]?.server?.slug
                              if (shopSlug) {
                                navigate({
                                  to: '/servers/$serverSlug/shop/admin',
                                  params: { serverSlug: shopSlug },
                                })
                              }
                              break
                            }
                            case 'invite_signup':
                              onSwitchTab('invite')
                              break
                            default:
                              break
                          }
                        }}
                        className="text-xs px-2 py-1 rounded bg-zinc-500/20 hover:bg-zinc-500/30 text-zinc-200"
                      >
                        {getActionLabel(task.key)}
                      </button>
                    )}
                    {taskGuides[task.key] && (
                      <button
                        type="button"
                        onClick={() => setExpandedTask(expandedTask === task.key ? null : task.key)}
                        className={`text-xs px-2 py-1 rounded ${
                          !canNavigate(task.key)
                            ? 'bg-primary/20 hover:bg-primary/30 text-primary font-bold'
                            : 'bg-primary/10 hover:bg-primary/20 text-primary'
                        }`}
                      >
                        {expandedTask === task.key ? '收起' : '查看教程'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Expandable task guide */}
              {expandedTask === task.key && taskGuides[task.key] && (
                <div className="mt-3 pt-3 border-t border-border-subtle animate-in slide-in-from-top-2 duration-200">
                  <div className="bg-bg-tertiary rounded-lg p-3">
                    <p className="text-xs font-bold text-text-muted uppercase mb-2">📖 教程步骤</p>
                    <p className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed">
                      {taskGuides[task.key]}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 bg-bg-secondary rounded-xl border border-border-subtle p-5">
        <h3 className="text-sm font-bold text-text-primary mb-3">奖励记录</h3>
        {rewardLogs && rewardLogs.length > 0 ? (
          <div className="space-y-2">
            {rewardLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-lg bg-bg-tertiary px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs text-text-primary truncate">{log.note || log.rewardKey}</p>
                  <p className="text-[11px] text-text-muted">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
                <PriceDisplay amount={log.amount} size={13} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">暂无奖励记录</p>
        )}
      </div>
    </>
  )
}

function AppearanceSettings() {
  const { t } = useTranslation()
  const { theme, setTheme } = useUIStore()

  const options: { value: ThemeMode; icon: typeof Sun; label: string; desc: string }[] = [
    {
      value: 'light',
      icon: Sun,
      label: t('settings.themeLight'),
      desc: t('settings.themeLightDesc'),
    },
    {
      value: 'dark',
      icon: Moon,
      label: t('settings.themeDark'),
      desc: t('settings.themeDarkDesc'),
    },
    {
      value: 'system',
      icon: Monitor,
      label: t('settings.themeSystem'),
      desc: t('settings.themeSystemDesc'),
    },
  ]

  return (
    <>
      <h2 className="text-2xl font-bold text-text-primary mb-2">{t('settings.tabAppearance')}</h2>
      <p className="text-text-muted text-sm mb-6">{t('settings.appearanceDesc')}</p>

      <div className="bg-bg-secondary rounded-xl border border-border-subtle p-6">
        <label className="block text-xs font-bold uppercase text-text-secondary mb-4 tracking-wide">
          {t('settings.themeLabel')}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map(({ value, icon: Icon, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                theme === value
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent bg-bg-tertiary hover:border-border-dim'
              }`}
            >
              <Icon size={28} className={theme === value ? 'text-primary' : 'text-text-muted'} />
              <span
                className={`text-sm font-bold ${theme === value ? 'text-primary' : 'text-text-primary'}`}
              >
                {label}
              </span>
              <span className="text-[11px] text-text-muted text-center leading-tight">{desc}</span>
              {theme === value && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
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

/** Quickstart page with modern UI/UX and better guidance */
function QuickstartPage({
  navigate,
  setActiveTab,
}: {
  navigate: (opts: { to: string }) => void
  setActiveTab: (
    tab:
      | 'quickstart'
      | 'profile'
      | 'account'
      | 'invite'
      | 'tasks'
      | 'buddy'
      | 'appearance'
      | 'notification',
  ) => void
}) {
  const { t } = useTranslation()

  const quickActions = [
    {
      icon: Compass,
      title: t('guide.discoverTitle'),
      desc: t('guide.discoverDesc'),
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      action: () => navigate({ to: '/discover' }),
    },
    {
      icon: Bot,
      title: 'Buddy 管理',
      desc: '创建和配置你的 AI 助手',
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      action: () => setActiveTab('buddy'),
    },
    {
      icon: Sparkles,
      title: 'Buddy 集市',
      desc: '浏览和租赁 AI 助手',
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      action: () => {
        window.location.href = '/buddies'
      },
    },
  ]

  const guideSteps = [
    {
      step: 1,
      title: '创建或加入服务器',
      desc: '服务器是你的社群空间。你可以创建自己的服务器，或通过邀请链接加入他人的服务器。',
      icon: Plus,
      action: () => navigate({ to: '/discover' }),
      actionLabel: '发现服务器',
    },
    {
      step: 2,
      title: '设置个人资料',
      desc: '上传头像、设置昵称，让其他人更容易认识你。',
      icon: User,
      action: () => setActiveTab('profile'),
      actionLabel: '编辑资料',
    },
    {
      step: 3,
      title: '开始聊天',
      desc: '在服务器的频道中发消息，或与好友进行私信交流。支持文字、图片、文件等多种格式。',
      icon: MessageCircle,
      action: () => setActiveTab('friends'),
      actionLabel: '开始聊天',
    },
  ]

  const buddySteps = [
    {
      step: 1,
      title: '创建 Buddy',
      desc: 'Buddy 是你的 AI 助手。在「Buddy 管理」中创建一个新 Buddy，设置名称和描述。',
    },
    {
      step: 2,
      title: '配置技能',
      desc: '为 Buddy 安装技能，让它具备各种能力：搜索网页、控制设备、处理文件等。',
    },
    {
      step: 3,
      title: '连接 OpenClaw',
      desc: '下载 OpenClaw 桌面端，用它可以连接你的 Buddy 并在本地运行。',
    },
    {
      step: 4,
      title: '上架集市（可选）',
      desc: '将你的 Buddy 上架到集市，让其他人也可以租赁使用。',
    },
  ]

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-bg-secondary border border-border-subtle mb-4">
          <img src="/Logo.svg" alt="Shadow" className="w-12 h-12 opacity-90" />
        </div>
        <h1 className="text-2xl font-extrabold text-text-primary mb-2">
          {t('common.welcomeTitle')}
        </h1>
        <p className="text-text-secondary text-[15px] max-w-md mx-auto">
          {t('common.welcomeDesc')}
        </p>
      </div>

      {/* Quick Actions */}
      <section>
        <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <Zap size={18} className="text-amber-400" />
          快速开始
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {quickActions.map((item, idx) => (
            <button
              key={idx}
              onClick={item.action}
              className="group relative bg-bg-secondary hover:bg-bg-tertiary border border-border-subtle rounded-xl p-5 text-left transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${item.bgColor} mb-3`}>
                <item.icon size={20} className={item.color} />
              </div>
              <h3 className="font-bold text-text-primary text-[15px] mb-1 group-hover:text-primary transition-colors">
                {item.title}
              </h3>
              <p className="text-text-muted text-[13px]">{item.desc}</p>
              <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </section>

      {/* New User Guide */}
      <section>
        <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          新手指南
        </h2>
        <div className="bg-bg-secondary rounded-xl border border-border-subtle overflow-hidden">
          {guideSteps.map((step, idx) => (
            <div
              key={step.step}
              className={`flex items-start gap-4 p-5 ${
                idx < guideSteps.length - 1 ? 'border-b border-border-subtle' : ''
              }`}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                {step.step}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-text-primary text-[14px] mb-1">
                      {step.title}
                    </h3>
                    <p className="text-text-muted text-[13px] leading-relaxed">{step.desc}</p>
                  </div>
                  <button
                    onClick={step.action}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition"
                  >
                    {step.actionLabel}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Buddy Guide */}
      <section>
        <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <Bot size={18} className="text-cyan-400" />
          Buddy 入门
        </h2>
        <div className="bg-bg-secondary rounded-xl border border-border-subtle p-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-500/10 shrink-0">
              <Bot size={20} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary mb-1">什么是 Buddy？</h3>
              <p className="text-text-muted text-[13px] leading-relaxed">
                Buddy 是你的个人 AI 助手。它可以帮你搜索信息、处理文档、控制设备，甚至可以作为智能客服为你服务。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {buddySteps.map((step) => (
              <div
                key={step.step}
                className="flex items-start gap-3 p-3 rounded-lg bg-bg-tertiary"
              >
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 font-bold text-xs shrink-0">
                  {step.step}
                </div>
                <div>
                  <h4 className="font-medium text-text-primary text-[13px] mb-0.5">{step.title}</h4>
                  <p className="text-text-muted text-[12px]">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border-subtle">
            <button
              onClick={() => setActiveTab('buddy')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white font-bold text-sm transition"
            >
              <Bot size={16} />
              创建 Buddy
            </button>
            <a
              href="/buddies"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-bg-tertiary hover:bg-bg-modifier-hover text-text-primary font-bold text-sm transition"
            >
              <ExternalLink size={16} />
              浏览集市
            </a>
          </div>
        </div>
      </section>

      {/* Help Section */}
      <section>
        <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <HelpCircle size={18} className="text-violet-400" />
          需要帮助？
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="/product/index.html"
            className="flex items-center gap-4 p-4 bg-bg-secondary hover:bg-bg-tertiary border border-border-subtle rounded-xl transition group"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-500/10">
              <BookOpen size={20} className="text-violet-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-text-primary text-[14px] group-hover:text-primary transition-colors">
                文档中心
              </h3>
              <p className="text-text-muted text-[12px]">查看详细使用教程和 API 文档</p>
            </div>
            <ExternalLink size={16} className="text-text-muted group-hover:text-primary transition-colors" />
          </a>
          <a
            href="/?forceHome=true"
            className="flex items-center gap-4 p-4 bg-bg-secondary hover:bg-bg-tertiary border border-border-subtle rounded-xl transition group"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/10">
              <Home size={20} className="text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-text-primary text-[14px] group-hover:text-primary transition-colors">
                返回官网
              </h3>
              <p className="text-text-muted text-[12px]">访问 Shadow 官方首页</p>
            </div>
            <ExternalLink size={16} className="text-text-muted group-hover:text-primary transition-colors" />
          </a>
        </div>
      </section>

      {/* Footer Tips */}
      <div className="flex items-center justify-center gap-2 py-4 text-text-muted text-xs">
        <Heart size={12} className="text-pink-400" />
        <span>遇到问题？在任意频道中 @管理员 获取帮助</span>
      </div>
    </div>
  )
}

/** DM channel list — shows recent conversations as a sidebar */
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
          {t('dm.directMessages', '私信消息')} — {filtered.length}
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
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-bg-primary ${statusColor[ch.otherUser?.status ?? 'offline'] ?? statusColor.offline}`}
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
