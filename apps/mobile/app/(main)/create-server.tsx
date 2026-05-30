import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { SettingsHeader } from '../../src/components/common/settings-header'
import {
  AppSwitch,
  AppText,
  BackgroundSurface,
  Button,
  GlassPanel,
  TextField,
} from '../../src/components/ui'
import { fetchApi } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import { size, spacing } from '../../src/theme'

export default function CreateServerScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const createMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name, description: description || undefined, isPublic }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      router.replace(`/(main)/servers/${data.slug ?? data.id}`)
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <BackgroundSurface>
        <SettingsHeader title={t('server.createTitle')} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <GlassPanel style={styles.panel}>
            <View style={styles.heading}>
              <AppText variant="headline">{t('server.createTitle')}</AppText>
              <AppText variant="body" tone="secondary">
                {t('server.createSubtitle')}
              </AppText>
            </View>

            <TextField
              label={t('server.nameLabel')}
              value={name}
              onChangeText={setName}
              placeholder={t('server.namePlaceholder')}
              autoFocus
            />

            <TextField
              label={t('server.descriptionLabel')}
              value={description}
              onChangeText={setDescription}
              placeholder={t('server.descriptionPlaceholder')}
              multiline
              numberOfLines={3}
              style={styles.textArea}
              inputStyle={styles.textAreaInput}
            />

            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <AppText variant="bodyStrong">{t('server.publicServer')}</AppText>
                <AppText variant="label" tone="secondary">
                  {t('server.publicServerDesc')}
                </AppText>
              </View>
              <AppSwitch value={isPublic} onValueChange={setIsPublic} />
            </View>

            <Button
              variant="primary"
              size="lg"
              onPress={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
              loading={createMutation.isPending}
            >
              {t('server.create')}
            </Button>
          </GlassPanel>
        </ScrollView>
      </BackgroundSurface>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    padding: spacing.md,
    paddingBottom: spacing['4xl'],
  },
  panel: {
    gap: spacing.lg,
    padding: spacing.xl,
  },
  heading: {
    gap: spacing.xs,
  },
  textArea: {
    minHeight: size.textareaLg,
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  textAreaInput: {
    minHeight: size.textareaInputLg,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  switchCopy: {
    flex: 1,
    minWidth: 0,
  },
})
