import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { BackgroundSurface } from '../../../../src/components/ui'
import { UnifiedCreateChannelSheet } from '../../../../src/features/home/overlays'
import type { ServerEntry } from '../../../../src/features/home/types'
import { fetchApi } from '../../../../src/lib/api'
import { serverChannelHref } from '../../../../src/lib/routes'
import { useChatStore } from '../../../../src/stores/chat.store'
import { useColors } from '../../../../src/theme'

type ChannelType = 'text' | 'voice' | 'announcement'

interface ServerData {
  id: string
  name: string
  slug: string | null
  iconUrl: string | null
  bannerUrl?: string | null
  description?: string | null
  isPublic?: boolean
  memberCount?: number
  channelCount?: number
}

function normalizeChannelType(value: string | undefined): ChannelType {
  if (value === 'voice' || value === 'announcement') return value
  return 'text'
}

export default function CreateChannelScreen() {
  const { serverSlug, type } = useLocalSearchParams<{ serverSlug: string; type?: string }>()
  const router = useRouter()
  const colors = useColors()
  const setActiveServer = useChatStore((state) => state.setActiveServer)
  const setActiveChannel = useChatStore((state) => state.setActiveChannel)

  const { data: server, isLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<ServerData>(`/api/servers/${serverSlug}`),
    enabled: Boolean(serverSlug),
  })

  if (isLoading || !server) return <LoadingScreen />

  const entry: ServerEntry = {
    server,
    member: { role: 'admin' },
  }

  return (
    <BackgroundSurface>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]} />
      <UnifiedCreateChannelSheet
        visible
        server={entry}
        initialType={normalizeChannelType(type)}
        onClose={() => router.back()}
        onCreated={(channelId) => {
          setActiveServer(server.id)
          setActiveChannel(channelId)
          router.replace(serverChannelHref(server.slug ?? server.id, channelId) as never)
        }}
      />
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
})
