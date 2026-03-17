import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Reanimated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fontSize, spacing, useColors } from '../../theme'

export function SettingsHeader({ title, right }: { title: string; right?: ReactNode }) {
  const colors = useColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  return (
    <Reanimated.View
      entering={FadeIn.duration(300)}
      style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface }]}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        style={({ pressed }) => pressed && { opacity: 0.5 }}
      >
        <ChevronLeft size={24} color={colors.text} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
      <View style={{ minWidth: 24 }}>{right ?? null}</View>
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
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
})
