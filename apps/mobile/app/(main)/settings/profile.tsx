import { Save } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Avatar } from '../../../src/components/common/avatar'
import { AvatarEditor } from '../../../src/components/common/avatar-editor'
import { LanguageSwitcher } from '../../../src/components/common/language-switcher'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import {
  AppText,
  BackgroundSurface,
  GlassPanel,
  IconButton,
  TextField,
} from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { spacing, useColors } from '../../../src/theme'

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
    <BackgroundSurface style={styles.container}>
      <SettingsHeader
        title={t('settings.tabProfile')}
        right={
          <IconButton
            icon={Save}
            variant="primary"
            size="icon"
            loading={saving}
            disabled={saving}
            onPress={handleSave}
          />
        }
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Avatar */}
        <GlassPanel style={styles.card}>
          <AppText variant="label" tone="secondary" style={styles.label}>
            {t('settings.avatarLabel')}
          </AppText>
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
        </GlassPanel>

        {/* Display name */}
        <GlassPanel style={styles.card}>
          <TextField
            label={t('settings.displayNameLabel')}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={user.username}
          />
        </GlassPanel>

        {/* Language */}
        <GlassPanel style={styles.card}>
          <AppText variant="label" tone="secondary" style={styles.label}>
            {t('settings.languageLabel')}
          </AppText>
          <LanguageSwitcher />
        </GlassPanel>

        {message ? (
          <AppText
            variant="label"
            style={{
              color:
                message.includes('成功') ||
                message.includes('success') ||
                message.includes('Success')
                  ? colors.success
                  : colors.error,
              marginTop: spacing.sm,
              textAlign: 'center',
            }}
          >
            {message}
          </AppText>
        ) : null}
      </ScrollView>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  card: { gap: spacing.md },
  avatarRow: { alignItems: 'center', marginBottom: spacing.md },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
})
