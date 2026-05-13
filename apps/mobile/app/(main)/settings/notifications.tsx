import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, Target, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { AppText, BackgroundSurface, GlassPanel, MenuItem } from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { radius, spacing, useColors } from '../../../src/theme'

export default function NotificationSettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const queryClient = useQueryClient()

  const { data: pref } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () =>
      fetchApi<{
        strategy: 'all' | 'mention_only' | 'none'
        mutedServerIds: string[]
        mutedChannelIds: string[]
      }>('/api/notifications/preferences'),
  })

  const updatePref = useMutation({
    mutationFn: (payload: { strategy?: string }) =>
      fetchApi('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-preferences'] }),
  })

  const strategies = [
    {
      value: 'all',
      icon: Bell,
      title: t('settings.notificationAllTitle'),
      desc: t('settings.notificationAllDesc'),
    },
    {
      value: 'mention_only',
      icon: Target,
      title: t('settings.notificationMentionTitle'),
      desc: t('settings.notificationMentionDesc'),
    },
    {
      value: 'none',
      icon: X,
      title: t('settings.notificationSystemTitle'),
      desc: t('settings.notificationSystemDesc'),
    },
  ] as const

  return (
    <BackgroundSurface style={styles.container}>
      <SettingsHeader title={t('settings.tabNotification')} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <AppText variant="label" tone="secondary" style={styles.groupTitle}>
          {t('settings.notificationStrategy').toUpperCase()}
        </AppText>
        <GlassPanel style={styles.card}>
          {strategies.map((s) => {
            const active = (pref?.strategy ?? 'all') === s.value
            return (
              <MenuItem
                key={s.value}
                icon={s.icon}
                tone={active ? 'primary' : 'muted'}
                title={s.title}
                subtitle={s.desc}
                onPress={() => updatePref.mutate({ strategy: s.value })}
                right={active ? <Check size={16} color={colors.primary} /> : null}
              />
            )
          })}
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
  card: { marginHorizontal: spacing.md, borderRadius: radius.xl, overflow: 'hidden', padding: 4 },
})
