import { useNavigate } from '@tanstack/react-router'
import { KeyRound, LogOut, Shield } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { disconnectSocket } from '../../lib/socket'
import { useAuthStore } from '../../stores/auth.store'

export function AccountSettings() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError(t('settings.passwordMismatch'))
      return
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError(t('settings.passwordTooShort'))
      return
    }

    setPasswordLoading(true)
    try {
      await fetchApi('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword,
          confirmPassword: passwordForm.confirmPassword,
        }),
      })
      setPasswordSuccess(true)
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
      setTimeout(() => {
        setShowPasswordModal(false)
        setPasswordSuccess(false)
      }, 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to change password'
      setPasswordError(msg)
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleLogout = () => {
    disconnectSocket()
    logout()
    navigate({ to: '/login' })
  }

  if (!user) return null

  return (
    <>
      <h2 className="text-2xl font-bold text-text-primary mb-6">{t('settings.accountTitle')}</h2>

      <div className="bg-bg-secondary rounded-xl p-6 space-y-5 border border-border-subtle">
        <div>
          <p className="text-xs font-bold uppercase text-text-secondary mb-1">
            {t('settings.emailLabel')}
          </p>
          <p className="text-text-primary">{user.email}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-text-secondary mb-1">
            {t('settings.usernameLabel')}
          </p>
          <p className="text-text-primary">@{user.username}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-text-secondary mb-1">
            {t('settings.userIdLabel')}
          </p>
          <p className="text-text-muted text-xs font-mono">{user.id}</p>
        </div>
      </div>

      {/* Change Password Section */}
      <div className="mt-6 bg-bg-secondary rounded-xl p-6 border border-border-subtle">
        <h3 className="text-lg font-bold text-text-primary mb-2 flex items-center gap-2">
          <KeyRound size={20} />
          {t('settings.changePasswordTitle')}
        </h3>
        <p className="text-sm text-text-muted mb-4">{t('settings.changePasswordDesc')}</p>
        <button
          type="button"
          onClick={() => setShowPasswordModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition text-sm font-bold"
        >
          <KeyRound size={16} />
          {t('settings.changePassword')}
        </button>
      </div>

      {/* Danger Zone */}
      <div className="mt-8 p-6 bg-bg-secondary rounded-xl border border-danger/20">
        <h3 className="text-lg font-bold text-danger mb-2 flex items-center gap-2">
          <Shield size={20} />
          {t('settings.dangerTitle')}
        </h3>
        <p className="text-sm text-text-muted mb-4">{t('settings.dangerLogoutWarning')}</p>
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger border border-danger/20 rounded-lg hover:bg-danger/20 transition text-sm font-bold"
        >
          <LogOut size={16} />
          {t('settings.logout')}
        </button>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          onClick={() => !passwordLoading && setShowPasswordModal(false)}
          onKeyDown={(e) => e.key === 'Escape' && !passwordLoading && setShowPasswordModal(false)}
        >
          <div
            className="bg-bg-secondary rounded-xl p-6 w-full max-w-md mx-4 border border-border-subtle"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="document"
          >
            <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <KeyRound size={20} />
              {t('settings.changePasswordTitle')}
            </h2>

            {passwordSuccess && (
              <div className="mb-4 p-3 bg-success/10 text-success rounded-lg text-sm font-medium">
                {t('settings.passwordChangedSuccess')}
              </div>
            )}

            {passwordError && (
              <div className="mb-4 p-3 bg-danger/10 text-danger rounded-lg text-sm">
                {passwordError}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label
                  htmlFor="oldPassword"
                  className="block text-xs font-bold uppercase text-text-secondary mb-1"
                >
                  {t('settings.oldPasswordLabel')}
                </label>
                <input
                  id="oldPassword"
                  type="password"
                  value={passwordForm.oldPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                  className="w-full bg-bg-primary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary border border-border-subtle"
                  placeholder={t('settings.oldPasswordPlaceholder')}
                  disabled={passwordLoading}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-xs font-bold uppercase text-text-secondary mb-1"
                >
                  {t('settings.newPasswordLabel')}
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="w-full bg-bg-primary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary border border-border-subtle"
                  placeholder={t('settings.newPasswordPlaceholder')}
                  disabled={passwordLoading}
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs font-bold uppercase text-text-secondary mb-1"
                >
                  {t('settings.confirmPasswordLabel')}
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                  }
                  className="w-full bg-bg-primary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary border border-border-subtle"
                  placeholder={t('settings.confirmPasswordPlaceholder')}
                  disabled={passwordLoading}
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
                  disabled={passwordLoading}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition font-bold disabled:opacity-50"
                  disabled={passwordLoading}
                >
                  {passwordLoading ? t('settings.changingPassword') : t('settings.changePassword')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowLogoutConfirm(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowLogoutConfirm(false)}
        >
          <div
            className="bg-bg-secondary rounded-xl p-6 w-full max-w-96 mx-4 border border-border-subtle"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="document"
          >
            <h2 className="text-xl font-bold text-text-primary mb-2">
              {t('settings.logoutConfirmTitle')}
            </h2>
            <p className="text-text-muted text-sm mb-6">{t('settings.logoutConfirmMessage')}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2 bg-danger text-white rounded-lg hover:bg-red-600 transition font-bold"
              >
                {t('settings.logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}