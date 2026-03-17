import { Save } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Avatar } from '../../../src/components/common/avatar'
import { AvatarEditor } from '../../../src/components/common/avatar-editor'
import { LanguageSwitcher } from '../../../src/components/common/language-switcher'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { fetchApi } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

export default function ProfileSettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { user, setUser } = useAuthStore()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
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
          avatarUrl: avatarUrl || undefined,
        }),
      })
      setUser({ ...user!, ...result })
      setMessage(t('common.saveSuccess'))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SettingsHeader
        title={t('settings.tabProfile')}
        right={
          <Pressable onPress={handleSave} disabled={saving} hitSlop={8}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Save size={22} color={colors.primary} />
            )}
          </Pressable>
        }
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Avatar */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('settings.avatarLabel')}
          </Text>
          <View style={styles.avatarRow}>
            <Avatar
              uri={avatarUrl || user.avatarUrl}
              name={user.displayName || user.username}
              size={72}
              userId={user.id}
            />
          </View>
          <AvatarEditor
            value={avatarUrl || user.avatarUrl}
            userId={user.id}
            onChange={setAvatarUrl}
          />
        </View>

        {/* Display name */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('settings.displayNameLabel')}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBackground,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={user.username}
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {/* Language */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('settings.languageLabel')}
          </Text>
          <LanguageSwitcher />
        </View>

        {message ? (
          <Text
            style={{
              color:
                message.includes('成功') ||
                message.includes('success') ||
                message.includes('Success')
                  ? '#23a559'
                  : '#f23f43',
              fontSize: fontSize.sm,
              marginTop: spacing.sm,
              textAlign: 'center',
            }}
          >
            {message}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  card: { padding: spacing.lg, borderRadius: radius.xl },
  avatarRow: { alignItems: 'center', marginBottom: spacing.md },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  input: {
    height: 44,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    borderWidth: 1,
  },
})
