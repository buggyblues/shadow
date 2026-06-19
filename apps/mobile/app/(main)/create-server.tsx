import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SettingsHeader } from '../../src/components/common/settings-header'
import { AppSwitch, AppText, BackgroundSurface, Button, TextField } from '../../src/components/ui'
import { fetchApi } from '../../src/lib/api'
import { selectionHaptic } from '../../src/lib/haptics'
import { showToast } from '../../src/lib/toast'
import { useChatStore } from '../../src/stores/chat.store'
import { border, radius, size, spacing, useColors } from '../../src/theme'

export default function CreateServerScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const setActiveServer = useChatStore((s) => s.setActiveServer)

  const [name, setName] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const createMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), isPublic }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setActiveServer(data.id)
      router.replace('/(main)')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <BackgroundSurface style={styles.surface}>
        <SettingsHeader title={t('server.createTitle')} />
        <View style={styles.content}>
          <TextField
            label={t('server.nameLabel')}
            value={name}
            onChangeText={setName}
            placeholder={t('server.namePlaceholder')}
            autoFocus
            returnKeyType="done"
            editable={!createMutation.isPending}
          />

          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: isPublic }}
            onPress={() => {
              selectionHaptic()
              setIsPublic((value) => !value)
            }}
            style={({ pressed }) => [
              styles.switchRow,
              {
                backgroundColor: pressed ? colors.surfaceHover : colors.frostedPanel,
                borderColor: colors.frostedBorder,
              },
            ]}
          >
            <View style={styles.switchCopy}>
              <AppText variant="bodyStrong">{t('server.publicServer')}</AppText>
              <AppText variant="label" tone="secondary">
                {t('server.publicServerDesc')}
              </AppText>
            </View>
            <AppSwitch value={isPublic} onValueChange={setIsPublic} />
          </Pressable>
        </View>

        <View
          style={[
            styles.bottomBar,
            {
              paddingBottom: insets.bottom + spacing.md,
              backgroundColor: colors.frostedPanelStrong,
              borderTopColor: colors.frostedBorder,
            },
          ]}
        >
          <Button
            variant="primary"
            size="lg"
            containerStyle={styles.fullWidth}
            style={styles.fullWidth}
            onPress={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            loading={createMutation.isPending}
          >
            {t('server.create')}
          </Button>
        </View>
      </BackgroundSurface>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  surface: { flex: 1 },
  content: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: size.navBar + spacing['2xl'],
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: size.settingsRowMinHeight,
    borderRadius: radius['2xl'],
    borderWidth: border.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  switchCopy: {
    flex: 1,
    minWidth: 0,
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  bottomBar: {
    borderTopWidth: border.hairline,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
})
