import { Button, FormField, Input } from '@shadowob/ui'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Key, LogOut, Mail, Shield, User } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { disconnectSocket } from '../../lib/socket'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'
import { SettingsCard, SettingsDanger, SettingsHeader, SettingsPanel } from './_shared'

export function AccountSettings() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) {
        throw new Error(t('settings.passwordMismatch'))
      }
      if (newPassword.length < 8) {
        throw new Error(t('settings.passwordTooShort'))
      }
      await fetchApi('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
      })
    },
    onSuccess: () => {
      showToast(t('settings.passwordChangedSuccess', '密码修改成功'), 'success')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : 'Failed to change password', 'error')
    },
  })

  const handleLogout = () => {
    disconnectSocket()
    logout()
    navigate({ to: '/login' })
  }

  if (!user) return null

  return (
    <SettingsPanel>
      <SettingsHeader
        titleKey="settings.tabAccount"
        titleFallback="账号与安全"
        descKey="settings.accountDesc"
        descFallback="管理你的账号信息和安全设置"
        icon={Shield}
      />

      {/* Account Info */}
      <SettingsCard>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Mail size={16} className="text-text-muted shrink-0" />
            <span className="text-sm text-text-muted">{t('settings.emailLabel', '邮箱')}</span>
            <span className="text-sm font-bold text-text-primary ml-auto truncate max-w-[240px]">
              {user.email}
            </span>
          </div>
          <div className="border-t border-border-subtle" />
          <div className="flex items-center gap-3">
            <User size={16} className="text-text-muted shrink-0" />
            <span className="text-sm text-text-muted">{t('settings.usernameLabel', '用户名')}</span>
            <span className="text-sm font-bold text-text-primary ml-auto">@{user.username}</span>
          </div>
        </div>
      </SettingsCard>

      {/* Change Password */}
      <SettingsCard>
        <div className="space-y-5">
          <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60">
            {t('settings.changePasswordTitle')}
          </span>

          <FormField label={t('settings.oldPasswordLabel')}>
            <Input
              id="old-password"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="••••••••"
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField label={t('settings.newPasswordLabel')}>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </FormField>
            <FormField label={t('settings.confirmPasswordLabel')}>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </FormField>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => changePasswordMutation.mutate()}
              disabled={!oldPassword || !newPassword || !confirmPassword}
              loading={changePasswordMutation.isPending}
              icon={Key}
              size="lg"
              className="px-10"
            >
              {t('settings.changePassword')}
            </Button>
          </div>
        </div>
      </SettingsCard>

      {/* Danger Zone */}
      <SettingsDanger>
        <Button variant="danger" onClick={handleLogout} icon={LogOut}>
          {t('settings.logout')}
        </Button>
      </SettingsDanger>
    </SettingsPanel>
  )
}
