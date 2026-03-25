import { useNavigate } from '@tanstack/react-router'
import { LogOut, Shield } from 'lucide-react'
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
        <h3 className="text-lg font-bold text-danger mb-2 flex items-center gap-2">
          <Shield size={20} />
          {t('settings.dangerTitle')}
        </h3>
        <p className="text-sm text-text-muted mb-4">{t('settings.dangerLogoutWarning')}</p>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger border border-danger/20 rounded-lg hover:bg-danger/20 transition text-sm font-bold"
        >
          <LogOut size={16} />
          {t('settings.logout')}
        </button>
      </div>

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
    </>
  )
}
