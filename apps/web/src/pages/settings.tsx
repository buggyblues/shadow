import { useNavigate } from '@tanstack/react-router'
import { Bot, BookOpen, Check, Compass, Copy, FileText, Link2, LogOut, Plus, Rocket, Save, Shield, Trash2, User, X } from 'lucide-react'
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
import { BuddyManagementContent } from './agent-management'

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
  const [activeTab, setActiveTab] = useState<'quickstart' | 'profile' | 'account' | 'invite' | 'buddy'>('quickstart')
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
        <nav className="px-3 pt-4 space-y-0.5">
          <button
            onClick={() => setActiveTab('quickstart')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'quickstart'
                ? 'bg-white/[0.08] text-white'
                : 'text-[#949ba4] hover:bg-white/[0.04] hover:text-[#dbdee1]'
            }`}
          >
            <Rocket
              size={18}
              className={`shrink-0 ${activeTab === 'quickstart' ? 'opacity-80 text-white' : 'opacity-60 group-hover:text-[#dbdee1]'}`}
            />
            {t('settings.tabQuickStart')}
          </button>
          <div className="px-2 py-3 text-[11px] font-bold uppercase text-[#949ba4] tracking-wide mt-2">
            {t('settings.sidebarTitle')}
          </div>
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
            onClick={() => setActiveTab('buddy')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'buddy'
                ? 'bg-white/[0.08] text-white'
                : 'text-[#949ba4] hover:bg-white/[0.04] hover:text-[#dbdee1]'
            }`}
          >
            <Bot
              size={18}
              className={`shrink-0 ${activeTab === 'buddy' ? 'opacity-80 text-white' : 'opacity-60 group-hover:text-[#dbdee1]'}`}
            />
            {t('settings.tabBuddy')}
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
          <button
            onClick={() => setActiveTab('invite')}
            className={`group flex items-center gap-3 w-full px-3 py-2 rounded-md text-[15px] font-medium transition ${
              activeTab === 'invite'
                ? 'bg-white/[0.08] text-white'
                : 'text-[#949ba4] hover:bg-white/[0.04] hover:text-[#dbdee1]'
            }`}
          >
            <Link2
              size={18}
              className={`shrink-0 ${activeTab === 'invite' ? 'opacity-80 text-white' : 'opacity-60 group-hover:text-[#dbdee1]'}`}
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
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-8">
          {activeTab === 'quickstart' && (
            <>
              {/* Profile Card */}
              <div className="bg-bg-secondary rounded-xl border border-white/5 p-6 mb-8 flex items-center gap-5">
                <UserAvatar
                  userId={user.id}
                  avatarUrl={user.avatarUrl}
                  displayName={user.displayName || user.username}
                  size="xl"
                />
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-text-primary truncate">
                    {user.displayName || user.username}
                  </h2>
                  <p className="text-sm text-text-muted">@{user.username}</p>
                  <p className="text-xs text-text-muted mt-1">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary bg-white/5 hover:bg-white/10 rounded-lg transition"
                >
                  {t('common.edit')}
                </button>
              </div>

              {/* Hero */}
              <div className="text-center mb-10">
                <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4 opacity-80" />
                <h2 className="text-2xl font-bold text-text-primary mb-2">{t('common.welcomeTitle')}</h2>
                <p className="text-[#dbdee1] text-[15px]">{t('common.welcomeDesc')}</p>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                <button
                  type="button"
                  onClick={() => navigate({ to: '/app/discover' })}
                  className="bg-bg-secondary hover:bg-bg-tertiary border border-white/5 rounded-xl p-5 text-left transition group"
                >
                  <Compass size={24} className="text-[#23a559] mb-3 group-hover:scale-110 transition-transform" />
                  <h3 className="font-bold text-text-primary text-[15px] mb-1">{t('guide.discoverTitle')}</h3>
                  <p className="text-text-muted text-[13px]">{t('guide.discoverDesc')}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="bg-bg-secondary hover:bg-bg-tertiary border border-white/5 rounded-xl p-5 text-left transition group"
                >
                  <User size={24} className="text-[#80848e] mb-3 group-hover:scale-110 transition-transform" />
                  <h3 className="font-bold text-text-primary text-[15px] mb-1">{t('guide.settingsTitle')}</h3>
                  <p className="text-text-muted text-[13px]">{t('guide.settingsDesc')}</p>
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ to: '/docs' })}
                  className="bg-bg-secondary hover:bg-bg-tertiary border border-white/5 rounded-xl p-5 text-left transition group"
                >
                  <FileText size={24} className="text-[#5865F2] mb-3 group-hover:scale-110 transition-transform" />
                  <h3 className="font-bold text-text-primary text-[15px] mb-1">{t('guide.docsTitle')}</h3>
                  <p className="text-text-muted text-[13px]">{t('guide.docsDesc')}</p>
                </button>
              </div>

              {/* Getting Started Steps */}
              <div className="bg-bg-secondary rounded-xl border border-white/5 p-6 mb-8">
                <h3 className="font-bold text-text-primary text-lg mb-5 flex items-center gap-2">
                  <BookOpen size={20} className="text-primary" />
                  {t('guide.gettingStarted')}
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#5865F2]/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">1</div>
                    <div>
                      <h4 className="font-semibold text-text-primary text-[14px] mb-0.5 flex items-center gap-2">
                        <Plus size={14} className="text-[#23a559]" />
                        {t('guide.step1Title')}
                      </h4>
                      <p className="text-text-muted text-[13px]">{t('guide.step1Desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#5865F2]/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">2</div>
                    <div>
                      <h4 className="font-semibold text-text-primary text-[14px] mb-0.5 flex items-center gap-2">
                        <Link2 size={14} className="text-[#5865F2]" />
                        {t('guide.step2Title')}
                      </h4>
                      <p className="text-text-muted text-[13px]">{t('guide.step2Desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#5865F2]/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">3</div>
                    <div>
                      <h4 className="font-semibold text-text-primary text-[14px] mb-0.5 flex items-center gap-2">
                        <Compass size={14} className="text-[#23a559]" />
                        {t('guide.step3Title')}
                      </h4>
                      <p className="text-text-muted text-[13px]">{t('guide.step3Desc')}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Buddy Guide */}
              <div className="bg-bg-secondary rounded-xl border border-white/5 p-6">
                <h3 className="font-bold text-text-primary text-lg mb-5 flex items-center gap-2">
                  <Bot size={20} className="text-[#23a559]" />
                  {t('guide.buddyGuideTitle')}
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#23a559]/10 flex items-center justify-center shrink-0 text-[#23a559] font-bold text-sm">1</div>
                    <div>
                      <h4 className="font-semibold text-text-primary text-[14px] mb-0.5">{t('guide.buddyStep1Title')}</h4>
                      <p className="text-text-muted text-[13px]">{t('guide.buddyStep1Desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#23a559]/10 flex items-center justify-center shrink-0 text-[#23a559] font-bold text-sm">2</div>
                    <div>
                      <h4 className="font-semibold text-text-primary text-[14px] mb-0.5">{t('guide.buddyStep2Title')}</h4>
                      <p className="text-text-muted text-[13px]">{t('guide.buddyStep2Desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#23a559]/10 flex items-center justify-center shrink-0 text-[#23a559] font-bold text-sm">3</div>
                    <div>
                      <h4 className="font-semibold text-text-primary text-[14px] mb-0.5">{t('guide.buddyStep3Title')}</h4>
                      <p className="text-text-muted text-[13px]">{t('guide.buddyStep3Desc')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#23a559]/10 flex items-center justify-center shrink-0 text-[#23a559] font-bold text-sm">4</div>
                    <div>
                      <h4 className="font-semibold text-text-primary text-[14px] mb-0.5">{t('guide.buddyStep4Title')}</h4>
                      <p className="text-text-muted text-[13px]">{t('guide.buddyStep4Desc')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

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

          {activeTab === 'invite' && <InviteManagement />}

          {activeTab === 'buddy' && <BuddyManagementContent />}
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
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [note, setNote] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

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
    const registerUrl = `${window.location.origin}/register?code=${code}`
    navigator.clipboard.writeText(registerUrl)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <>
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
        <div className="bg-bg-secondary rounded-xl p-4 mb-6 border border-white/5">
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
              autoFocus
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
        <div className="text-center text-text-muted py-12 bg-bg-secondary rounded-xl border border-white/5">
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
                  isActive ? 'border-white/5' : 'border-white/5 opacity-60'
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
                    {code.note && (
                      <p className="text-xs text-text-muted truncate">{code.note}</p>
                    )}
                    {isUsed && code.usedByUser && (
                      <p className="text-xs text-text-muted mt-1">
                        {t('settings.inviteUsedBy')}: {code.usedByUser.displayName || code.usedByUser.username}
                        {code.usedAt && (
                          <span className="ml-2 text-text-muted/60">
                            {new Date(code.usedAt).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    )}
                    <p className="text-[11px] text-text-muted/50 mt-0.5">
                      {new Date(code.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isActive && (
                      <button
                        onClick={() => copyCode(code.code, code.id)}
                        className="p-2 text-text-muted hover:text-text-primary hover:bg-white/10 rounded-lg transition"
                        title={t('settings.inviteCopyLink')}
                      >
                        {copiedId === code.id ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
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
