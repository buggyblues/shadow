import { EmptyState, GlassPanel } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Hash, Loader2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'
import { leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'

type ChannelMeta = {
  id: string
  name: string
  position?: number | null
  isArchived?: boolean | null
}

export function ServerHomeView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { serverSlug } = useParams({ strict: false }) as { serverSlug: string }
  const { data: channels, isLoading } = useQuery({
    queryKey: ['server-home-channels', serverSlug],
    queryFn: () =>
      fetchApi<ChannelMeta[]>(`/api/servers/${encodeURIComponent(serverSlug)}/channels`),
    enabled: !!serverSlug,
    retry: false,
  })

  const firstChannel = useMemo(() => {
    return (
      channels
        ?.filter((channel) => !channel.isArchived)
        .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))[0] ?? null
    )
  }, [channels])

  // Clear channel state when entering server home
  useLayoutEffect(() => {
    const prev = useChatStore.getState().activeChannelId
    if (prev) {
      leaveChannel(prev)
      useChatStore.getState().setActiveChannel(null)
    }
  }, [])

  useEffect(() => {
    if (!serverSlug || isLoading || !channels || !firstChannel) return
    navigate({
      to: '/servers/$serverSlug/channels/$channelId',
      params: { serverSlug, channelId: firstChannel.id },
      replace: true,
    })
  }, [channels, firstChannel, isLoading, navigate, serverSlug])

  if (isLoading || firstChannel) {
    return (
      <GlassPanel className="flex flex-1 items-center justify-center text-text-muted">
        <Loader2 size={18} className="animate-spin opacity-60" />
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="flex flex-1 items-center justify-center px-6">
      <EmptyState
        icon={Hash}
        title={t('serverHome.noChannelsTitle')}
        description={t('serverHome.noChannelsDesc')}
      />
    </GlassPanel>
  )
}
