import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { fetchApi } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import { useAuthStore } from '../../src/stores/auth.store'
import { useChatStore } from '../../src/stores/chat.store'
import { fontSize, spacing, useColors } from '../../src/theme'

export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setActiveServer = useChatStore((s) => s.setActiveServer)

  const joinMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ id: string; slug?: string }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: code }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setActiveServer(data.id)
      router.replace('/(main)' as never)
    },
    onError: (err: unknown) => {
      const error = err as { status?: number; message?: string }
      if (error?.status === 409) {
        // Already a member
        queryClient.invalidateQueries({ queryKey: ['servers'] })
        router.replace('/(main)')
      } else {
        showToast(error?.message || t('common.error'), 'error')
        router.replace('/(main)')
      }
    },
  })

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(`/(auth)/login?inviteCode=${code}`)
      return
    }
    if (code) {
      joinMutation.mutate()
    }
  }, [code, isAuthenticated, joinMutation.mutate, router.replace])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>{t('invite.joining')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { marginTop: spacing.lg, fontSize: fontSize.md },
})
