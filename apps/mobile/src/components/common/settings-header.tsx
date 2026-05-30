import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { MobileBackButton, MobileNavigationBar } from '../ui'

export function SettingsHeader({ title, right }: { title: string; right?: ReactNode }) {
  const router = useRouter()

  return (
    <MobileNavigationBar
      title={title}
      left={<MobileBackButton onPress={() => router.back()} />}
      right={right}
    />
  )
}
