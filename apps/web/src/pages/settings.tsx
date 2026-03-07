import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, LogOut, Save, Shield, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../components/common/avatar'
import { AvatarEditor } from '../components/common/avatar-editor'
import { LanguageSwitcher } from '../components/common/language-switcher'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import { disconnectSocket } from '../lib/socket'
import { useAuthStore } from '../stores/auth.store'

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
  const { user, setUser, logout } = useAuthStore()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'account'>('profile')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

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
    <div className="flex-1 flex bg-bg-primary overflow-hidden">
      {/* Sidebar */}
      <div className="w-60 bg-bg-secondary flex flex-col shrink-0">
        <div className="p-4 border-b-2 border-bg-tertiary">
          <button
            onClick={() => navigate({ to: '/app' })}
            className="flex items-center gap-2 text-[#949ba4] hover:text-[#dbdee1] transition text-[15px] font-medium"
          >
            <ArrowLeft size={16} />
            {t('settings.back')}
          </button>
        </div>
        <div className="px-5 py-3 text-[12px] font-bold uppercase text-[#949ba4] tracking-wide mt-2">
          {t('settings.sidebarTitle')}
        </div>
        <nav className="px-3 space-y-0.5">
          <button
            onClick={() => setActiveTab('profile')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'profile'
                ? 'bg-white/[0.08] text-white'
                : 'text-[#949ba4] hover:bg-white/[0.04] hover:text-[#dbdee1]'
            }`}
          >
            <User
              size={18}
              className={`shrink-0 ${activeTab === 'profile' ? 'opacity-80 text-white' : 'opacity-60 group-hover:text-[#dbdee1]'}`}
            />
            {t('settings.tabProfile')}
          </button>
          <button
            onClick={() => setActiveTab('account')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'account'
                ? 'bg-white/[0.08] text-white'
                : 'text-[#949ba4] hover:bg-white/[0.04] hover:text-[#dbdee1]'
            }`}
          >
            <Shield
              size={18}
              className={`shrink-0 ${activeTab === 'account' ? 'opacity-80 text-white' : 'opacity-60 group-hover:text-[#dbdee1]'}`}
            />
            {t('settings.tabAccount')}
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
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-8">
          {activeTab === 'profile' && (
            <>
              <h2 className="text-2xl font-bold text-text-primary mb-6">
                {t('settings.profileTitle')}
              </h2>

              {/* Preview card */}
              <div className="bg-bg-secondary rounded-xl p-6 mb-8 border border-white/5">
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
                <label className="block text-[12px] font-bold uppercase text-[#b5bac1] mb-3 tracking-wide">
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

          {activeTab === 'account' && (
            <>
              <h2 className="text-2xl font-bold text-text-primary mb-6">
                {t('settings.accountTitle')}
              </h2>

              <div className="bg-bg-secondary rounded-xl p-6 space-y-5 border border-white/5">
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
                <h3 className="text-lg font-bold text-danger mb-2">{t('settings.dangerTitle')}</h3>
                <p className="text-sm text-text-muted mb-4">{t('settings.dangerLogoutWarning')}</p>
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="px-4 py-2 bg-danger/10 text-danger border border-danger/20 rounded-lg hover:bg-danger/20 transition text-sm font-bold"
                >
                  {t('settings.logout')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="bg-bg-secondary rounded-xl p-6 w-96 border border-white/5"
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
