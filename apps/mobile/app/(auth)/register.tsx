import { Redirect, useLocalSearchParams } from 'expo-router'

export default function RegisterScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>()
  const href = code ? `/(auth)/login?inviteCode=${encodeURIComponent(code)}` : '/(auth)/login'
  return <Redirect href={href as never} />
}
