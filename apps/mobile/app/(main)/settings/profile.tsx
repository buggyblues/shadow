import { useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import { AvatarEditor } from '../../../src/components/common/avatar-editor'
import { LanguageSwitcher } from '../../../src/components/common/language-switcher'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import {
  BackgroundSurface,
  IconButton,
  PageScroll,
  Section,
  StatusNotice,
  TextField,
} from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { spacing } from '../../../src/theme'

export default function ProfileSettingsScreen() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
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
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['channel-bootstrap'] })
      queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['channel-members'] })
      queryClient.invalidateQueries({ queryKey: ['server-members'] })
      queryClient.invalidateQueries({ queryKey: ['mention-suggestions'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setMessage(t('common.saveSuccess'))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null
  const messageTone =
    message.includes('成功') || message.includes('success') || message.includes('Success')
      ? 'success'
      : 'danger'

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
      <PageScroll compact>
        <Section title={t('settings.avatarLabel')} padded cardStyle={styles.card}>
          <AvatarEditor
            value={avatarUrl || user.avatarUrl}
            userId={user.id}
            name={displayName || user.displayName || user.username}
            onChange={setAvatarUrl}
          />
        </Section>

        <Section title={t('settings.displayNameLabel')} padded cardStyle={styles.card}>
          <TextField
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={user.username}
          />
        </Section>

        <Section title={t('settings.languageLabel')} padded cardStyle={styles.card}>
          <LanguageSwitcher />
        </Section>

        {message ? (
          <StatusNotice tone={messageTone} style={styles.notice}>
            {message}
          </StatusNotice>
        ) : null}
      </PageScroll>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { gap: spacing.md },
  notice: {
    marginTop: spacing.xs,
  },
})
