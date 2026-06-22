import { useQuery } from '@tanstack/react-query'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'
import { fetchApi } from '../../../../src/lib/api'
import { useChatStore } from '../../../../src/stores/chat.store'

export default function ServerLayout() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="channels/[channelId]" options={{ keyboardHandlingEnabled: false }} />
      <Stack.Screen name="shop" />
      <Stack.Screen name="shop-admin" />
      <Stack.Screen name="channel-members" />
      <Stack.Screen
        name="create-channel"
        options={{
          presentation: 'transparentModal',
          animation: 'slide_from_bottom',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="invite" />
      <Stack.Screen name="server-settings" />
    </Stack>
  )
}
