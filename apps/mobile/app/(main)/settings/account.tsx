import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useState } from 'react'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { fetchApi } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

export default function AccountSettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { user } = useAuthStore()

  // Change password state
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
      const msg = err instanceof Error ? err.message : 'Failed to change password'
      setPasswordError(msg)
    } finally {
      setPasswordLoading(false)
    }
  }

  if (!user) return null

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SettingsHeader title={t('settings.tabAccount')} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={[styles.groupTitle, { color: colors.textMuted }]}>
          {t('settings.tabAccount').toUpperCase()}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t('settings.emailLabel')}
            </Text>
            <Text style={{ color: colors.text, fontSize: fontSize.sm }}>{user.email}</Text>
          </View>
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t('settings.usernameLabel')}
            </Text>
            <Text style={{ color: colors.text, fontSize: fontSize.sm }}>@{user.username}</Text>
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t('settings.userIdLabel')}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: 'monospace' }}>
              {user.id}
            </Text>
          </View>
        </View>

        {/* Change Password Section */}
        <Text style={[styles.groupTitle, { color: colors.textMuted }]}>
          {t('settings.security').toUpperCase()}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {!showPasswordForm ? (
            <TouchableOpacity
              style={[styles.row, { borderBottomWidth: 0 }]}
              onPress={() => setShowPasswordForm(true)}
            >
              <Text style={[styles.label, { color: colors.textMuted }]}>
                {t('settings.changePassword')}
              </Text>
              <Text style={{ color: colors.primary, fontSize: fontSize.sm }}>
                {t('settings.tapToChange')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.passwordForm}>
              <Text style={[styles.label, { color: colors.text, marginBottom: spacing.sm }]}>
                {t('settings.changePasswordTitle')}
              </Text>

              {passwordSuccess && (
                <View
                  style={[
                    styles.messageBox,
                    { backgroundColor: `${colors.success}20`, borderColor: colors.success },
                  ]}
                >
                  <Text style={{ color: colors.success, fontSize: fontSize.sm }}>
                    {t('settings.passwordChangedSuccess')}
                  </Text>
                </View>
              )}

              {passwordError && (
                <View
                  style={[
                    styles.messageBox,
                    { backgroundColor: `${colors.danger}20`, borderColor: colors.danger },
                  ]}
                >
                  <Text style={{ color: colors.danger, fontSize: fontSize.sm }}>
                    {passwordError}
                  </Text>
                </View>
              )}

              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
                placeholder={t('settings.oldPasswordPlaceholder')}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={passwordForm.oldPassword}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, oldPassword: text })}
                editable={!passwordLoading}
              />

              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
                placeholder={t('settings.newPasswordPlaceholder')}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={passwordForm.newPassword}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, newPassword: text })}
                editable={!passwordLoading}
              />

              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
                placeholder={t('settings.confirmPasswordPlaceholder')}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={passwordForm.confirmPassword}
                onChangeText={(text) =>
                  setPasswordForm({ ...passwordForm, confirmPassword: text })
                }
                editable={!passwordLoading}
              />

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton, { borderColor: colors.border }]}
                  onPress={() => {
                    setShowPasswordForm(false)
                    setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
                    setPasswordError(null)
                  }}
                  disabled={passwordLoading}
                >
                  <Text style={{ color: colors.textMuted }}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.submitButton, { backgroundColor: colors.primary }]}
                  onPress={handleChangePassword}
                  disabled={passwordLoading}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                    {passwordLoading ? t('settings.changingPassword') : t('settings.submit')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
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
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: spacing.sm,
    fontSize: fontSize.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  cancelButton: {
    borderWidth: 1,
  },
  submitButton: {},
  messageBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
})