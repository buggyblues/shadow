import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Github, KeyRound, Link2, MonitorSmartphone, Unlink } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import {
  AppText,
  BackgroundSurface,
  Button,
  KeyValueRow,
  MenuItem,
  PageScroll,
  Section,
  StatusNotice,
  TextField,
} from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { iconSize, spacing, useColors } from '../../../src/theme'

export default function AccountSettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const queryClient = useQueryClient()
  const { user, setUser } = useAuthStore()

  // Change password state
  const [inviteCode, setInviteCode] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

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

  const unlinkOAuth = useMutation({
    mutationFn: (accountId: string) =>
      fetchApi('/api/auth/oauth/accounts/' + accountId, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['oauth-accounts'] }),
  })

  const revokeSession = useMutation({
    mutationFn: (sessionId: string) =>
      fetchApi('/api/auth/sessions/' + sessionId, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth-sessions'] }),
  })

  const handleChangePassword = async () => {
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
        setShowPasswordForm(false)
        setPasswordSuccess(false)
      }, 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('settings.passwordChangeFailed')
      setPasswordError(msg)
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleRedeemInvite = async () => {
    if (!inviteCode.trim() || !user) return
    setInviteLoading(true)
    setInviteError(null)
    setInviteSuccess(false)
    try {
      const membership = await fetchApi<NonNullable<typeof user>['membership']>(
        '/api/membership/redeem-invite',
        {
          method: 'POST',
          body: JSON.stringify({ code: inviteCode.trim() }),
        },
      )
      if (membership) setUser({ ...user, membership })
      setInviteCode('')
      setInviteSuccess(true)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : t('settings.membershipRedeemFailed'))
    } finally {
      setInviteLoading(false)
    }
  }

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
    <BackgroundSurface style={styles.container}>
      <SettingsHeader title={t('settings.tabAccount')} />
      <PageScroll compact>
        <Section title={t('settings.tabAccount')}>
          <KeyValueRow label={t('settings.emailLabel')} value={user.email} />
          <KeyValueRow label={t('settings.usernameLabel')} value={`@${user.username}`} />
          <KeyValueRow
            label={t('settings.membershipStatusLabel')}
            value={`${tierLabel} · ${t('settings.membershipLevelLabel', {
              level: membership?.level ?? 0,
            })}`}
            valueTone={membership?.isMember ? 'success' : 'secondary'}
          />
          <KeyValueRow
            label={t('settings.membershipCapabilitiesLabel')}
            value={
              capabilityLabels.length
                ? capabilityLabels.join(', ')
                : t('settings.membershipNoCapabilities')
            }
            valueTone="secondary"
          />
          <KeyValueRow
            label={t('settings.userIdLabel')}
            value={user.id}
            valueTone="secondary"
            mono
            last
          />
        </Section>

        {!membership?.isMember ? (
          <Section title={t('settings.membershipRedeemTitle')} padded cardStyle={styles.formCard}>
            <TextField
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder={t('settings.membershipRedeemPlaceholder')}
              autoCapitalize="characters"
              editable={!inviteLoading}
            />
            {inviteError ? (
              <StatusNotice tone="danger">{inviteError}</StatusNotice>
            ) : inviteSuccess ? (
              <StatusNotice tone="success">{t('settings.membershipRedeemedSuccess')}</StatusNotice>
            ) : (
              <StatusNotice tone="muted">{t('settings.membershipVisitorHint')}</StatusNotice>
            )}
            <Button
              variant="primary"
              size="md"
              onPress={handleRedeemInvite}
              disabled={inviteLoading || !inviteCode.trim()}
              loading={inviteLoading}
            >
              {t('settings.membershipRedeemAction')}
            </Button>
          </Section>
        ) : null}

        <Section title={t('settings.oauthAccountsTitle')}>
          {(['google', 'github'] as const).map((provider) => {
            const account = oauthAccounts.find((item) => item.provider === provider)
            const ProviderIcon = provider === 'github' ? Github : Link2
            return (
              <MenuItem
                key={provider}
                icon={ProviderIcon}
                title={provider === 'github' ? 'GitHub' : 'Google'}
                subtitle={account?.providerEmail ?? t('settings.oauthNotConnected')}
                tone={account ? 'success' : 'primary'}
                onPress={() => {
                  if (account) {
                    unlinkOAuth.mutate(account.id)
                    return
                  }
                  fetchApi<{ url: string }>(`/api/auth/oauth/${provider}/link`, {
                    method: 'POST',
                    body: JSON.stringify({ redirect: 'shadow://oauth-callback' }),
                  }).then(({ url }) => Linking.openURL(url))
                }}
                right={
                  account ? (
                    <Unlink size={iconSize.md} color={colors.textMuted} />
                  ) : (
                    <Link2 size={iconSize.md} color={colors.primary} />
                  )
                }
              />
            )
          })}
        </Section>

        <Section title={t('settings.devicesTitle')}>
          {sessions.map((session) => (
            <MenuItem
              key={session.id}
              icon={MonitorSmartphone}
              title={session.deviceName || session.userAgent || t('settings.unknownDevice')}
              subtitle={t('settings.lastSeenAt', {
                date: new Date(session.lastSeenAt).toLocaleString(),
              })}
              tone={session.current ? 'success' : session.revokedAt ? 'muted' : 'primary'}
              onPress={() => {
                if (!session.current && !session.revokedAt) revokeSession.mutate(session.id)
              }}
              right={
                <AppText variant="label" tone={session.current ? 'success' : 'secondary'}>
                  {session.current
                    ? t('settings.currentDevice')
                    : session.revokedAt
                      ? t('settings.revokedDevice')
                      : t('settings.revokeDevice')}
                </AppText>
              }
            />
          ))}
        </Section>

        <Section title={t('settings.security')} padded={showPasswordForm}>
          {!showPasswordForm ? (
            <MenuItem
              icon={KeyRound}
              title={t('settings.changePassword')}
              subtitle={t('settings.changePasswordDesc')}
              tone="primary"
              onPress={() => setShowPasswordForm(true)}
              right={
                <AppText variant="label" tone="primary">
                  {t('settings.tapToChange')}
                </AppText>
              }
            />
          ) : (
            <View style={styles.passwordForm}>
              <AppText variant="bodyStrong">{t('settings.changePasswordTitle')}</AppText>

              {passwordSuccess && (
                <StatusNotice tone="success">{t('settings.passwordChangedSuccess')}</StatusNotice>
              )}

              {passwordError && <StatusNotice tone="danger">{passwordError}</StatusNotice>}

              <TextField
                label={t('settings.oldPasswordPlaceholder')}
                placeholder={t('settings.oldPasswordPlaceholder')}
                secureTextEntry
                value={passwordForm.oldPassword}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, oldPassword: text })}
                editable={!passwordLoading}
              />

              <TextField
                label={t('settings.newPasswordPlaceholder')}
                placeholder={t('settings.newPasswordPlaceholder')}
                secureTextEntry
                value={passwordForm.newPassword}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, newPassword: text })}
                editable={!passwordLoading}
              />

              <TextField
                label={t('settings.confirmPasswordPlaceholder')}
                placeholder={t('settings.confirmPasswordPlaceholder')}
                secureTextEntry
                value={passwordForm.confirmPassword}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, confirmPassword: text })}
                editable={!passwordLoading}
              />

              <View style={styles.buttonRow}>
                <Button
                  variant="glass"
                  size="sm"
                  onPress={() => {
                    setShowPasswordForm(false)
                    setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
                    setPasswordError(null)
                  }}
                  disabled={passwordLoading}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onPress={handleChangePassword}
                  disabled={passwordLoading}
                  loading={passwordLoading}
                >
                  {t('settings.submit')}
                </Button>
              </View>
            </View>
          )}
        </Section>
      </PageScroll>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  formCard: {
    gap: spacing.md,
  },
  passwordForm: {
    gap: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
})
