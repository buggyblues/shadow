import { KeyRound } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import {
  AppText,
  BackgroundSurface,
  Button,
  GlassPanel,
  MenuItem,
  TextField,
} from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

export default function AccountSettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
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
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <AppText variant="label" tone="secondary" style={styles.groupTitle}>
          {t('settings.tabAccount').toUpperCase()}
        </AppText>
        <GlassPanel style={styles.card}>
          <View style={[styles.row, { borderBottomColor: colors.glassLine }]}>
            <AppText variant="label" tone="secondary" style={styles.label}>
              {t('settings.emailLabel')}
            </AppText>
            <AppText variant="label">{user.email}</AppText>
          </View>
          <View style={[styles.row, { borderBottomColor: colors.glassLine }]}>
            <AppText variant="label" tone="secondary" style={styles.label}>
              {t('settings.usernameLabel')}
            </AppText>
            <AppText variant="label">@{user.username}</AppText>
          </View>
          <View style={[styles.row, { borderBottomColor: colors.glassLine }]}>
            <AppText variant="label" tone="secondary" style={styles.label}>
              {t('settings.membershipStatusLabel')}
            </AppText>
            <AppText
              variant="label"
              style={{ color: membership?.isMember ? colors.success : colors.textMuted }}
            >
              {`${tierLabel} · ${t('settings.membershipLevelLabel', { level: membership?.level ?? 0 })}`}
            </AppText>
          </View>
          <View style={[styles.row, { borderBottomColor: colors.glassLine }]}>
            <AppText variant="label" tone="secondary" style={styles.label}>
              {t('settings.membershipCapabilitiesLabel')}
            </AppText>
            <AppText
              variant="label"
              tone="secondary"
              style={{
                fontSize: fontSize.xs,
                flex: 1,
                textAlign: 'right',
              }}
            >
              {capabilityLabels.length
                ? capabilityLabels.join(', ')
                : t('settings.membershipNoCapabilities')}
            </AppText>
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <AppText variant="label" tone="secondary" style={styles.label}>
              {t('settings.userIdLabel')}
            </AppText>
            <AppText
              variant="label"
              tone="secondary"
              style={{ fontSize: 10, fontFamily: 'monospace' }}
            >
              {user.id}
            </AppText>
          </View>
        </GlassPanel>

        {!membership?.isMember ? (
          <GlassPanel style={styles.card}>
            <AppText variant="label" style={[styles.label, { marginBottom: spacing.sm }]}>
              {t('settings.membershipRedeemTitle')}
            </AppText>
            <TextField
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder={t('settings.membershipRedeemPlaceholder')}
              autoCapitalize="characters"
              editable={!inviteLoading}
            />
            {inviteError ? (
              <AppText variant="label" tone="danger">
                {inviteError}
              </AppText>
            ) : inviteSuccess ? (
              <AppText variant="label" tone="success">
                {t('settings.membershipRedeemedSuccess')}
              </AppText>
            ) : (
              <AppText variant="label" tone="secondary">
                {t('settings.membershipVisitorHint')}
              </AppText>
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
          </GlassPanel>
        ) : null}

        {/* Change Password Section */}
        <AppText variant="label" tone="secondary" style={styles.groupTitle}>
          {t('settings.security').toUpperCase()}
        </AppText>
        <GlassPanel style={styles.card}>
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
              <AppText variant="label" style={[styles.label, { marginBottom: spacing.sm }]}>
                {t('settings.changePasswordTitle')}
              </AppText>

              {passwordSuccess && (
                <View
                  style={[
                    styles.messageBox,
                    { backgroundColor: `${colors.success}20`, borderColor: colors.success },
                  ]}
                >
                  <AppText variant="label" tone="success">
                    {t('settings.passwordChangedSuccess')}
                  </AppText>
                </View>
              )}

              {passwordError && (
                <View
                  style={[
                    styles.messageBox,
                    { backgroundColor: `${colors.error}20`, borderColor: colors.error },
                  ]}
                >
                  <AppText variant="label" tone="danger">
                    {passwordError}
                  </AppText>
                </View>
              )}

              <TextField
                placeholder={t('settings.oldPasswordPlaceholder')}
                secureTextEntry
                value={passwordForm.oldPassword}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, oldPassword: text })}
                editable={!passwordLoading}
              />

              <TextField
                placeholder={t('settings.newPasswordPlaceholder')}
                secureTextEntry
                value={passwordForm.newPassword}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, newPassword: text })}
                editable={!passwordLoading}
              />

              <TextField
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
        </GlassPanel>
      </ScrollView>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: spacing.xl * 2 },
  groupTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  card: { marginHorizontal: spacing.md, borderRadius: radius.xl, overflow: 'hidden' },
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  passwordForm: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  messageBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
})
