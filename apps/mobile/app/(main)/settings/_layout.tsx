import { Stack } from 'expo-router'
import { useColors } from '../../../src/theme'

export default function SettingsLayout() {
  const colors = useColors()

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="profile" />
      <Stack.Screen name="appearance" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="tasks" />
      <Stack.Screen name="buddy" />
      <Stack.Screen name="account" />
      <Stack.Screen name="invite" />
    </Stack>
  )
}
