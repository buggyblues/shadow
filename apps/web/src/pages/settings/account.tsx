import { Button, Card, FormField, Input, SectionHeader } from '@shadowob/ui'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, Key, Lock, LogOut, Mail, Shield, User } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { disconnectSocket } from '../../lib/socket'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'

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
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl pb-20">
      <SectionHeader
        title={t('settings.accountTitle', '账号设置')}
        description={t('settings.accountDesc', '管理你的账号信息和安全设置')}
        icon={Shield}
      />

      {/* Account Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6 group hover:bg-bg-tertiary/50 transition-all">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <Mail size={20} strokeWidth={2.5} />
            </div>
            <span className="text-[11px] font-black uppercase tracking-widest text-text-muted">
              {t('settings.emailLabel')}
            </span>
          </div>
          <p className="text-base font-bold text-text-primary">{user.email}</p>
        </Card>

        <Card className="p-6 group hover:bg-bg-tertiary/50 transition-all">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <User size={20} strokeWidth={2.5} />
            </div>
            <span className="text-[11px] font-black uppercase tracking-widest text-text-muted">
              {t('settings.usernameLabel')}
            </span>
          </div>
          <p className="text-base font-bold text-text-primary">@{user.username}</p>
        </Card>
      </div>

      {/* Change Password - Inline */}
      <section className="space-y-6">
        <label className="block text-xs font-black uppercase tracking-widest text-text-muted">
          {t('settings.changePasswordTitle')}
        </label>

        <Card className="p-8 space-y-8 shadow-xl">
          <div className="space-y-6">
            <FormField label={t('settings.oldPasswordLabel')}>
              <Input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
              />
            </FormField>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        </Card>
      </section>

      {/* Danger Zone */}
      <section className="space-y-6 pt-10 border-t border-border-subtle">
        <label className="block text-xs font-black uppercase tracking-widest text-danger/60">
          {t('settings.dangerTitle', 'Danger Zone')}
        </label>

        <Card className="p-8 bg-danger/5 border-danger/20 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <h4 className="text-lg font-black text-danger mb-1 uppercase">
              {t('settings.logout')}
            </h4>
            <p className="text-sm font-bold text-text-muted italic">
              {t('settings.dangerLogoutWarning')}
            </p>
          </div>
          <Button variant="danger" size="lg" onClick={handleLogout} icon={LogOut} className="px-10">
            {t('settings.logout')}
          </Button>
        </Card>
      </section>
    </div>
  )
}
