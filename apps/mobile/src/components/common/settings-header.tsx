import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Reanimated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fontSize, spacing, useColors } from '../../theme'
import { IconButton } from '../ui'

export function SettingsHeader({ title, right }: { title: string; right?: ReactNode }) {
  const colors = useColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  return (
    <Reanimated.View
      entering={FadeIn.duration(300)}
      style={[
        styles.header,
        {
          paddingTop: insets.top + 8,
          backgroundColor: colors.glassStrong,
          borderBottomColor: colors.glassLine,
          shadowColor: colors.mode === 'dark' ? '#000000' : '#64748B',
        },
      ]}
    >
      <IconButton icon={ChevronLeft} variant="glass" size="icon" onPress={() => router.back()} />
      <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
      <View style={styles.headerRight}>{right ?? null}</View>
    </Reanimated.View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  headerRight: {
    width: 44,
    alignItems: 'flex-end',
  },
})
