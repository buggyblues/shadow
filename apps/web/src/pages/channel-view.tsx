import { Button, GlassPanel } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Clock, Loader2, Lock, Send } from 'lucide-react'
import { useEffect, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChatArea } from '../components/chat/chat-area'
import { MemberList } from '../components/member/member-list'
import { fetchApi } from '../lib/api'
import { setLastChannelId } from '../lib/last-channel'
import { joinChannel, leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'
import { useUIStore } from '../stores/ui.store'

export function ChannelView() {
  const { t } = useTranslation()
  const { channelId } = useParams({ strict: false }) as { channelId: string }
  const activeServerId = useChatStore((s) => s.activeServerId)
  const setMobileView = useUIStore((s) => s.setMobileView)
  const queryClient = useQueryClient()
  const {
    data: access,
    isLoading: isAccessLoading,
    isError: isAccessError,
  } = useQuery({
    queryKey: ['channel-access', channelId],
    queryFn: () =>
      fetchApi<{
        canAccess: boolean
        requiresApproval: boolean
        joinRequestStatus: 'pending' | 'approved' | 'rejected' | null
        channel: { id: string; name: string; serverId: string; isPrivate: boolean }
      }>(`/api/channels/${channelId}/access`),
    enabled: !!channelId,
    retry: false,
  })
  const canAccessChannel = access?.canAccess === true

  const { data: channel } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () =>
      fetchApi<{ id: string; name: string; serverId: string; isPrivate: boolean }>(
        `/api/channels/${channelId}`,
      ),
    enabled: !!channelId && canAccessChannel,
  })

  const requestAccess = useMutation({
    mutationFn: () =>
      fetchApi(`/api/channels/${channelId}/join-requests`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-access', channelId] })
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  // Sync channel ID from URL → store before paint
  useLayoutEffect(() => {
    const prev = useChatStore.getState().activeChannelId
    if (prev && prev !== channelId) {
      leaveChannel(prev)
    }
    useChatStore.getState().setActiveChannel(channelId)
    if (canAccessChannel) joinChannel(channelId)
    setMobileView('chat')

    return () => {
      if (canAccessChannel) leaveChannel(channelId)
    }
  }, [canAccessChannel, channelId, setMobileView])

  useEffect(() => {
    if (activeServerId && channel?.serverId === activeServerId) {
      setLastChannelId(activeServerId, channelId)
    }
  }, [activeServerId, channel?.serverId, channelId])

  if (isAccessLoading || (!access && !isAccessError)) {
    return (
      <div className="flex flex-1 items-center justify-center bg-bg-primary/70 text-text-muted backdrop-blur-xl">
        <Loader2 size={18} className="animate-spin opacity-60" />
      </div>
    )
  }

  if (isAccessError || !access) {
    return (
      <div className="flex flex-1 items-center justify-center bg-bg-primary/70 px-6 text-center text-sm font-bold text-text-muted backdrop-blur-xl">
        {t('channel.accessUnavailable', '无法查看此频道')}
      </div>
    )
  }

  if (!access.canAccess) {
    const isPending = access.joinRequestStatus === 'pending' || requestAccess.isSuccess
    const wallChannel = access.channel ?? channel

    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <GlassPanel className="w-full max-w-md rounded-2xl border border-white/10 bg-bg-primary/80 p-6 text-center shadow-[0_18px_64px_rgba(0,0,0,0.32)]">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
            {isPending ? <Clock size={28} /> : <Lock size={28} />}
          </div>
          <h2 className="text-xl font-black text-text-primary">
            {wallChannel?.name ? `#${wallChannel.name}` : t('channel.privateChannel')}
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            {t('channel.privateChannelGateDesc')}
          </p>
          <Button
            type="button"
            className="mt-5 w-full cursor-pointer rounded-xl"
            disabled={isPending || requestAccess.isPending}
            loading={requestAccess.isPending}
            onClick={() => requestAccess.mutate()}
          >
            {isPending ? <Clock size={16} /> : <Send size={16} />}
            <span>{isPending ? t('channel.requestPending') : t('channel.requestAccess')}</span>
          </Button>
        </GlassPanel>
      </div>
    )
  }

  return (
    <>
      <ChatArea key={channelId} />
      <MemberList />
    </>
  )
}
