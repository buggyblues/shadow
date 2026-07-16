import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useVoiceChannel, type VoiceState } from '../../hooks/use-voice-channel'
import { useAuthStore } from '../../stores/auth.store'

export interface VoiceChannelSummary {
  id: string
  name: string
  serverSlug?: string | null
  serverId?: string | null
}

type VoiceSessionContextValue = {
  connectedVoiceChannel: VoiceChannelSummary | null
  showVoiceSettings: boolean
  setShowVoiceSettings: (show: boolean | ((show: boolean) => boolean)) => void
  voice: ReturnType<typeof useVoiceChannel>
  joinVoiceChannel: (channel: VoiceChannelSummary) => Promise<void>
  leaveVoiceChannel: () => Promise<void>
}

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null)

export function VoiceSessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [connectedVoiceChannel, setConnectedVoiceChannel] = useState<VoiceChannelSummary | null>(
    null,
  )
  const [voiceAutoJoinRequest, setVoiceAutoJoinRequest] = useState(0)
  const [showVoiceSettings, setShowVoiceSettings] = useState(false)
  const lastVoiceAutoJoinRef = useRef(0)
  const voice = useVoiceChannel(connectedVoiceChannel?.id ?? null, {
    deviceDiscoveryEnabled: Boolean(connectedVoiceChannel),
  })

  const clearVoiceStateCache = useCallback(
    (channelId: string) => {
      queryClient.setQueryData<VoiceState>(['voice-state', channelId], (old) => {
        if (!old) return old
        const participants = currentUserId
          ? old.participants.filter((participant) => participant.userId !== currentUserId)
          : []
        return {
          ...old,
          participants,
          participantCount: participants.length,
          emptySince: participants.length === 0 ? new Date().toISOString() : old.emptySince,
        }
      })
      void queryClient.invalidateQueries({ queryKey: ['voice-state', channelId] })
    },
    [currentUserId, queryClient],
  )

  const joinVoiceChannel = useCallback(
    async (channel: VoiceChannelSummary) => {
      if (connectedVoiceChannel?.id === channel.id) {
        if (voice.status === 'idle' || voice.status === 'error') {
          void voice.join()
        }
        return
      }

      if (
        connectedVoiceChannel &&
        (voice.status === 'connected' ||
          voice.status === 'connecting' ||
          voice.status === 'disconnecting')
      ) {
        const previousChannelId = connectedVoiceChannel.id
        await voice.leave()
        clearVoiceStateCache(previousChannelId)
      }

      setShowVoiceSettings(false)
      setConnectedVoiceChannel(channel)
      setVoiceAutoJoinRequest((value) => value + 1)
    },
    [clearVoiceStateCache, connectedVoiceChannel, voice],
  )

  const leaveVoiceChannel = useCallback(async () => {
    const channelId = connectedVoiceChannel?.id
    const leavePromise = voice.leave()
    if (channelId) clearVoiceStateCache(channelId)
    setConnectedVoiceChannel(null)
    setShowVoiceSettings(false)
    await leavePromise
  }, [clearVoiceStateCache, connectedVoiceChannel?.id, voice])

  const sessionUserIdRef = useRef(currentUserId)
  useEffect(() => {
    const previousUserId = sessionUserIdRef.current
    sessionUserIdRef.current = currentUserId
    if (!previousUserId || previousUserId === currentUserId || !connectedVoiceChannel) return
    void leaveVoiceChannel()
  }, [connectedVoiceChannel, currentUserId, leaveVoiceChannel])

  useEffect(() => {
    if (!connectedVoiceChannel) return
    if (voice.status !== 'idle') return
    if (lastVoiceAutoJoinRef.current === voiceAutoJoinRequest) return
    lastVoiceAutoJoinRef.current = voiceAutoJoinRequest
    void voice.join()
  }, [connectedVoiceChannel, voice, voiceAutoJoinRequest])

  return (
    <VoiceSessionContext.Provider
      value={{
        connectedVoiceChannel,
        showVoiceSettings,
        setShowVoiceSettings,
        voice,
        joinVoiceChannel,
        leaveVoiceChannel,
      }}
    >
      {children}
    </VoiceSessionContext.Provider>
  )
}

export function useVoiceSession() {
  const context = useContext(VoiceSessionContext)
  if (!context) {
    throw new Error('useVoiceSession must be used within VoiceSessionProvider')
  }
  return context
}
