import { Badge, Button, FormField, Input } from '@shadowob/ui'
import { InviteCodeRedeemForm, type InviteCodeRedeemText } from '@shadowob/views/invite-code'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Github,
  Key,
  Link2,
  Mail,
  MonitorSmartphone,
  ShieldCheck,
  Ticket,
  Unlink,
  User,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api-errors'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'
import { SettingsCard, SettingsPanel } from './_shared'

export function AccountSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user, setUser } = useAuthStore()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const passwordErrors = {
    newPassword:
      touched.newPassword && newPassword.length > 0 && newPassword.length < 8
        ? t('settings.passwordTooShort')
        : null,
    confirmPassword:
      touched.confirmPassword && confirmPassword.length > 0 && newPassword !== confirmPassword
        ? t('settings.passwordMismatch')
        : null,
  }

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
      showToast(t('settings.passwordChangedSuccess'), 'success')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : t('settings.passwordChangeFailed'), 'error')
    },
  })

  const inviteRedeemText = useMemo(
    () =>
      ({
        codeLabel: t('settings.membershipRedeemTitle'),
        codePlaceholder: t('settings.membershipRedeemPlaceholder'),
        submit: t('settings.membershipRedeemAction'),
        submitting: t('inviteCodeGate.submitting'),
        required: t('inviteCodeGate.required'),
      }) satisfies InviteCodeRedeemText,
    [t],
  )

  const redeemInviteMutation = useMutation({
    mutationFn: async (code: string) =>
      fetchApi<NonNullable<typeof user>['membership']>('/api/membership/redeem-invite', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    onSuccess: (membership) => {
      const currentUser = useAuthStore.getState().user
      if (membership && currentUser) {
        const nextUser = { ...currentUser, membership }
        setUser(nextUser)
        queryClient.setQueryData(['me'], nextUser)
      }
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      setInviteCode('')
      showToast(t('settings.membershipRedeemedSuccess'), 'success')
    },
    onError: (err) => {
      showToast(getApiErrorMessage(err, t, 'settings.membershipRedeemFailed'), 'error')
    },
  })

  const { data: oauthAccounts = [] } = useQuery({
    queryKey: ['oauth-accounts'],
    queryFn: () =>
      fetchApi<
        Array<{ id: string; provider: string; providerEmail: string | null; createdAt: string }>
      >('/api/auth/oauth/accounts'),
  })

  const { data: sessions = [] } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () =>
      fetchApi<
        Array<{
          id: string
          deviceName: string | null
          userAgent: string | null
          ipAddress: string | null
          lastSeenAt: string
          createdAt: string
          revokedAt: string | null
          current: boolean
        }>
      >('/api/auth/sessions'),
  })

  const unlinkOAuthMutation = useMutation({
    mutationFn: (accountId: string) =>
      fetchApi('/api/auth/oauth/accounts/' + accountId, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oauth-accounts'] })
      showToast(t('settings.oauthUnlinked'), 'success')
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : t('settings.oauthUnlinkFailed'), 'error')
    },
  })

  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      fetchApi('/api/auth/sessions/' + sessionId, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] })
      showToast(t('settings.deviceRevoked'), 'success')
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : t('settings.deviceRevokeFailed'), 'error')
    },
  })

  if (!user) return null

  const membership = user.membership
  const tierKey = membership?.status ?? 'visitor'
  const tierLabel = t(`settings.membershipTiers.${tierKey}`, membership?.tier?.label ?? tierKey)
  const capabilityLabels =
    membership?.capabilities.map((capability) => {
      const capabilityKey = capability.replace(/[:.]/g, '_')
      return t(`settings.membershipCapabilityLabels.${capabilityKey}`, capability)
    }) ?? []

  return (
    <SettingsPanel>
      {/* Account Info */}
      <SettingsCard>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Mail size={16} className="text-text-muted shrink-0" />
            <span className="text-sm text-text-muted">{t('settings.emailLabel')}</span>
            <span className="text-sm font-bold text-text-primary ml-auto truncate max-w-[240px]">
              {user.email}
            </span>
          </div>
          <div className="border-t border-border-subtle" />
          <div className="flex items-center gap-3">
            <User size={16} className="text-text-muted shrink-0" />
            <span className="text-sm text-text-muted">{t('settings.usernameLabel')}</span>
            <span className="text-sm font-bold text-text-primary ml-auto">@{user.username}</span>
          </div>
          <div className="border-t border-border-subtle" />
          <div className="flex items-center gap-3">
            <ShieldCheck size={16} className="text-text-muted shrink-0" />
            <span className="text-sm text-text-muted">{t('settings.membershipStatusLabel')}</span>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant={membership?.isMember ? 'success' : 'neutral'}>{tierLabel}</Badge>
              <span className="text-xs font-bold text-text-muted">
                {t('settings.membershipLevelLabel', { level: membership?.level ?? 0 })}
              </span>
            </div>
          </div>
          <div className="border-t border-border-subtle" />
          <div className="flex items-center gap-3">
            <Ticket size={16} className="text-text-muted shrink-0" />
            <span className="text-sm text-text-muted">
              {t('settings.membershipCapabilitiesLabel')}
            </span>
            <span className="text-xs font-bold text-text-primary ml-auto">
              {capabilityLabels.length
                ? capabilityLabels.join(', ')
                : t('settings.membershipNoCapabilities')}
            </span>
          </div>
        </div>
      </SettingsCard>

      {!membership?.isMember ? (
        <SettingsCard>
          <div className="space-y-4">
            <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60">
              {t('settings.membershipRedeemTitle')}
            </span>
            <InviteCodeRedeemForm
              text={inviteRedeemText}
              value={inviteCode}
              onValueChange={setInviteCode}
              onSubmit={(code) => redeemInviteMutation.mutate(code)}
              submitting={redeemInviteMutation.isPending}
              layout="inline"
            />
            <p className="text-xs text-text-muted">{t('settings.membershipVisitorHint')}</p>
          </div>
        </SettingsCard>
      ) : null}

      <SettingsCard>
        <div className="space-y-4">
          <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60">
            {t('settings.oauthAccountsTitle')}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(['google', 'github'] as const).map((provider) => {
              const account = oauthAccounts.find((item) => item.provider === provider)
              const ProviderIcon = provider === 'github' ? Github : Link2
              return (
                <div
                  key={provider}
                  className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-bg-secondary/30 px-3 py-3"
                >
                  <ProviderIcon size={16} className="text-text-muted shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-text-primary capitalize">{provider}</p>
                    <p className="text-xs text-text-muted truncate">
                      {account?.providerEmail ?? t('settings.oauthNotConnected')}
                    </p>
                  </div>
                  {account ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      icon={Unlink}
                      loading={unlinkOAuthMutation.isPending}
                      onClick={() => unlinkOAuthMutation.mutate(account.id)}
                      aria-label={t('settings.oauthDisconnect')}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Link2}
                      onClick={() => {
                        void fetchApi<{ url: string }>(`/api/auth/oauth/${provider}/link`, {
                          method: 'POST',
                          body: JSON.stringify({ redirect: '/app/settings/account' }),
                        }).then(({ url }) => {
                          window.location.href = url
                        })
                      }}
                    >
                      {t('settings.oauthConnect')}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="space-y-4">
          <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60">
            {t('settings.devicesTitle')}
          </span>
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-bg-secondary/30 px-3 py-3"
              >
                <MonitorSmartphone size={16} className="text-text-muted shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-text-primary truncate">
                      {session.deviceName || session.userAgent || t('settings.unknownDevice')}
                    </p>
                    {session.current ? (
                      <Badge variant="success">{t('settings.currentDevice')}</Badge>
                    ) : null}
                    {session.revokedAt ? (
                      <Badge variant="neutral">{t('settings.revokedDevice')}</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-text-muted truncate">
                    {t('settings.lastSeenAt', {
                      date: new Date(session.lastSeenAt).toLocaleString(),
                    })}
                    {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                  </p>
                </div>
                {!session.current && !session.revokedAt ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revokeSessionMutation.mutate(session.id)}
                    loading={revokeSessionMutation.isPending}
                  >
                    {t('settings.revokeDevice')}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </SettingsCard>

      {/* Change Password */}
      <SettingsCard>
        <form autoComplete="off" onSubmit={(e) => e.preventDefault()} className="space-y-5">
          <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60">
            {t('settings.changePasswordTitle')}
          </span>

          <FormField label={t('settings.oldPasswordLabel')}>
            <Input
              id="old-password"
              type="password"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="••••••••"
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField
              label={t('settings.newPasswordLabel')}
              error={passwordErrors.newPassword ?? undefined}
            >
              <Input
                id="new-password"
                type="password"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, newPassword: true }))}
                placeholder="••••••••"
                className={passwordErrors.newPassword ? 'border-danger' : ''}
              />
            </FormField>
            <FormField
              label={t('settings.confirmPasswordLabel')}
              error={passwordErrors.confirmPassword ?? undefined}
            >
              <Input
                id="confirm-password"
                type="password"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
                placeholder="••••••••"
                className={passwordErrors.confirmPassword ? 'border-danger' : ''}
              />
            </FormField>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => changePasswordMutation.mutate()}
              disabled={
                !oldPassword ||
                !newPassword ||
                !confirmPassword ||
                !!passwordErrors.newPassword ||
                !!passwordErrors.confirmPassword
              }
              loading={changePasswordMutation.isPending}
              icon={Key}
              size="lg"
              className="px-10"
            >
              {t('settings.changePassword')}
            </Button>
          </div>
        </form>
      </SettingsCard>
    </SettingsPanel>
  )
}
