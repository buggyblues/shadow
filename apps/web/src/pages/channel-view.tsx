import { Button, GlassPanel } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Clock, Lock, Send } from 'lucide-react'
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
    staleTime: 30_000,
  })
  const canAccessChannel = access?.canAccess === true

  const { data: channel } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () =>
      fetchApi<{ id: string; name: string; serverId: string; isPrivate: boolean }>(
        `/api/channels/${channelId}`,
      ),
    enabled: !!channelId && canAccessChannel,
    staleTime: 30_000,
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
    return <ChannelContentLoading />
  }

  if (isAccessError || !access) {
    return (
      <GlassPanel className="flex flex-1 items-center justify-center px-6 text-center text-sm font-bold text-text-muted">
        {t('channel.accessUnavailable', '无法查看此频道')}
      </GlassPanel>
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

function LoadingShape({ className }: { className: string }) {
  return <div className={`animate-pulse bg-white/8 ${className}`} />
}

function ChannelContentLoading() {
  return (
    <>
      <GlassPanel
        className="flex h-full min-w-0 flex-1 flex-col overflow-hidden"
        style={{
          background: 'var(--chat-panel-bg)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
        aria-hidden
      >
        <div className="app-header flex items-center gap-3 border-b border-border-subtle/30 px-6">
          <LoadingShape className="h-8 w-8 rounded-full" />
          <LoadingShape className="h-5 w-28 rounded-full" />
          <LoadingShape className="hidden h-5 w-40 rounded-full sm:block" />
          <div className="ml-auto flex gap-2">
            <LoadingShape className="h-8 w-8 rounded-full" />
            <LoadingShape className="h-8 w-8 rounded-full" />
          </div>
        </div>
        <div className="flex-1 space-y-6 px-6 py-7">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex gap-4">
              <LoadingShape className="h-11 w-11 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2 pt-1">
                <div className="flex items-center gap-3">
                  <LoadingShape className="h-4 w-24 rounded-full" />
                  <LoadingShape className="h-3 w-20 rounded-full" />
                </div>
                <LoadingShape className="h-4 w-[min(78%,34rem)] rounded-full" />
                <LoadingShape className="h-4 w-[min(58%,24rem)] rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <LoadingShape className="h-14 w-full rounded-[28px]" />
        </div>
      </GlassPanel>

      <GlassPanel
        className="hidden h-full w-[240px] shrink-0 overflow-hidden pt-4 lg:block"
        aria-hidden
      >
        <div className="px-4 pb-4 pt-2">
          <LoadingShape className="h-[54px] w-full rounded-full" />
        </div>
        <div className="space-y-5 px-4">
          <div className="space-y-3">
            <LoadingShape className="h-3 w-24 rounded-full" />
            <div className="space-y-2">
              <LoadingShape className="h-[66px] w-full rounded-2xl" />
              <LoadingShape className="h-[56px] w-[88%] rounded-2xl" />
            </div>
          </div>
          <div className="space-y-3">
            <LoadingShape className="h-3 w-24 rounded-full" />
            <LoadingShape className="h-[56px] w-[78%] rounded-2xl" />
          </div>
        </div>
      </GlassPanel>
    </>
  )
}
