import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { useAuthStore } from '../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

export default function AccountSettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { user } = useAuthStore()

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
})
