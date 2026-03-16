import { useQuery } from '@tanstack/react-query'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { HeaderButton, HeaderButtonGroup } from '../../../../src/components/common/header-button'
import { fetchApi } from '../../../../src/lib/api'
import { useChatStore } from '../../../../src/stores/chat.store'
import { useColors } from '../../../../src/theme'

export default function ServerLayout() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const setActiveServer = useChatStore((s) => s.setActiveServer)

  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () =>
      fetchApi<{ id: string; name: string; slug: string | null; iconUrl: string | null }>(
        `/api/servers/${serverSlug}`,
      ),
    enabled: !!serverSlug,
  })

  useEffect(() => {
    if (server) {
      setActiveServer(server.id)
    }
    return () => {
      setActiveServer(null)
    }
  }, [server, setActiveServer])

  const headerLeft = () => (
    <HeaderButtonGroup>
      <HeaderButton
        icon={ChevronLeft}
        onPress={() => router.back()}
        color={colors.text}
        size={22}
      />
    </HeaderButtonGroup>
  )

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerBackVisible: false,
        headerBackTitle: '',
        headerLeft,
      }}
    >
      <Stack.Screen name="index" options={{ title: server?.name ?? t('common.loading') }} />
      <Stack.Screen name="channels/[channelId]" options={{ headerShown: false }} />
      <Stack.Screen name="shop" options={{ title: t('server.shop') }} />
      <Stack.Screen name="workspace" options={{ title: t('server.workspace') }} />
      <Stack.Screen name="apps" options={{ title: t('server.apps') }} />
      <Stack.Screen name="shop-admin" options={{ title: t('shop.addProduct') }} />
      <Stack.Screen name="members" options={{ title: t('server.members') }} />
      <Stack.Screen name="channel-members" options={{ title: t('channel.members', '频道成员') }} />
      <Stack.Screen name="invite" options={{ title: t('members.inviteMembers', '邀请成员') }} />
      <Stack.Screen name="server-settings" options={{ title: t('channel.serverSettings') }} />
    </Stack>
  )
}
