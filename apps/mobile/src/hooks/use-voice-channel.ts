import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isNativeVoiceModuleError, loadAgoraRuntime } from '../lib/agora'
import { getSocket } from '../lib/socket'

export interface VoiceParticipant {
  id: string
  channelId: string
  userId: string
  uid: number
  screenUid: number
  username: string
  displayName: string | null
  avatarUrl: string | null
  isBot: boolean
  isMuted: boolean
  isDeafened: boolean
  isSpeaking: boolean
  isScreenSharing: boolean
  joinedAt: string
  updatedAt: string
  clientId: string | null
}

interface VoiceCredentials {
  appId: string
  channelId: string
  agoraChannelName: string
  uid: number
  screenUid: number
  token: string | null
  screenToken: string | null
  expiresAt: string | null
}

interface VoiceState {
  channelId: string
  agoraChannelName: string
  participants: VoiceParticipant[]
  participantCount: number
  emptySince: string | null
  graceEndsAt: string | null
}

interface VoiceJoinResult {
  credentials: VoiceCredentials
  participant: VoiceParticipant
  state: VoiceState
}

interface VoiceRenewResult {
  credentials: VoiceCredentials
  state: VoiceState
}

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

function socketCall<T>(event: string, payload: unknown): Promise<T> {
  const socket = getSocket()
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    const finish = (fn: () => void) => {
      clearTimeout(timer)
      fn()
    }
    const emit = () => {
      socket.emit(event, payload, (res: { ok: boolean; data?: T; error?: string }) => {
        if (res?.ok) finish(() => resolve(res.data as T))
        else finish(() => reject(new Error(res?.error ?? 'Voice request failed')))
      })
    }
    timer = setTimeout(() => {
      socket.off('connect', emit)
      reject(new Error('Voice socket request timed out'))
    }, 8000)
    if (socket.connected) emit()
    else {
      socket.once('connect', emit)
      socket.connect()
    }
  })
}

export function useVoiceChannel(channelId: string | null) {
  const { t } = useTranslation()
  const engineRef = useRef<any>(null)
  const credentialsRef = useRef<VoiceCredentials | null>(null)
  const channelIdRef = useRef<string | null>(channelId)
  const clientIdRef = useRef(`shadow-mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tokenRenewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renewTokensRef = useRef<() => Promise<void>>(async () => undefined)
  const leaveRef = useRef<() => Promise<void>>(async () => undefined)
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [participants, setParticipants] = useState<VoiceParticipant[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [speakerEnabled, setSpeakerEnabled] = useState(true)
  const [remoteVideoUids, setRemoteVideoUids] = useState<number[]>([])

  useEffect(() => {
    channelIdRef.current = channelId
  }, [channelId])

  const applyState = useCallback((state?: VoiceState) => {
    if (!state) return
    const activeChannelId = credentialsRef.current?.channelId ?? channelIdRef.current
    if (!activeChannelId || state.channelId !== activeChannelId) return
    setParticipants(state.participants)
  }, [])

  const updateLocalParticipant = useCallback(
    (patch: Partial<Pick<VoiceParticipant, 'isMuted' | 'isDeafened' | 'isSpeaking'>>) => {
      const cleanPatch = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ) as Partial<Pick<VoiceParticipant, 'isMuted' | 'isDeafened' | 'isSpeaking'>>
      if (Object.keys(cleanPatch).length === 0) return
      setParticipants((current) =>
        current.map((participant) => {
          const isLocal =
            participant.clientId === clientIdRef.current ||
            (credentialsRef.current && participant.uid === credentialsRef.current.uid)
          return isLocal
            ? { ...participant, ...cleanPatch, updatedAt: new Date().toISOString() }
            : participant
        }),
      )
    },
    [],
  )

  const updateVoiceState = useCallback(
    (patch: {
      muted?: boolean
      deafened?: boolean
      speaking?: boolean
      screenSharing?: boolean
    }) => {
      if (!channelId) return
      void socketCall('voice:state:update', {
        channelId,
        clientId: clientIdRef.current,
        ...patch,
      }).catch(() => null)
    },
    [channelId],
  )

  const clearTokenRenewal = useCallback(() => {
    if (tokenRenewTimerRef.current) {
      clearTimeout(tokenRenewTimerRef.current)
      tokenRenewTimerRef.current = null
    }
  }, [])

  const scheduleTokenRenewal = useCallback(
    (credentials: VoiceCredentials) => {
      clearTokenRenewal()
      if (!credentials.expiresAt) return
      const renewAt = new Date(credentials.expiresAt).getTime() - 5 * 60_000
      const delay = Math.max(30_000, renewAt - Date.now())
      tokenRenewTimerRef.current = setTimeout(() => {
        void renewTokensRef.current()
      }, delay)
    },
    [clearTokenRenewal],
  )

  const renewTokens = useCallback(async () => {
    const activeChannelId = credentialsRef.current?.channelId ?? channelId
    if (!activeChannelId) return
    const result = await socketCall<VoiceRenewResult>('voice:token:renew', {
      channelId: activeChannelId,
      clientId: clientIdRef.current,
    })
    credentialsRef.current = result.credentials
    applyState(result.state)
    if (result.credentials.token) {
      engineRef.current?.renewToken?.(result.credentials.token)
    }
    scheduleTokenRenewal(result.credentials)
  }, [applyState, channelId, scheduleTokenRenewal])

  useEffect(() => {
    renewTokensRef.current = renewTokens
  }, [renewTokens])

  const join = useCallback(async () => {
    if (!channelId) return
    if (status === 'connected' || status === 'connecting') return
    setStatus('connecting')
    setError(null)
    try {
      const agora = await loadAgoraRuntime()
      if (!agora) {
        throw new Error('VOICE_NATIVE_UNAVAILABLE')
      }
      const result = await socketCall<VoiceJoinResult>('voice:join', {
        channelId,
        clientId: clientIdRef.current,
        muted: isMuted,
        deafened: isDeafened,
      })
      credentialsRef.current = result.credentials
      scheduleTokenRenewal(result.credentials)
      applyState(result.state)
      const engine = agora.createAgoraRtcEngine()
      engineRef.current = engine
      const remoteVideoState = agora.RemoteVideoState ?? {}
      engine.initialize({ appId: result.credentials.appId })
      engine.registerEventHandler({
        onJoinChannelSuccess: () => setStatus('connected'),
        onLeaveChannel: () => setStatus('idle'),
        onRequestToken: () => {
          void renewTokensRef.current()
        },
        onTokenPrivilegeWillExpire: () => {
          void renewTokensRef.current()
        },
        onFirstRemoteVideoDecoded: (_connection: unknown, remoteUid: number) => {
          setRemoteVideoUids((prev) => (prev.includes(remoteUid) ? prev : [...prev, remoteUid]))
        },
        onRemoteVideoStateChanged: (_connection: unknown, remoteUid: number, state: number) => {
          if (state === remoteVideoState.RemoteVideoStateDecoding) {
            setRemoteVideoUids((prev) => (prev.includes(remoteUid) ? prev : [...prev, remoteUid]))
            return
          }
          if (
            state === remoteVideoState.RemoteVideoStateStopped ||
            state === remoteVideoState.RemoteVideoStateFailed
          ) {
            setRemoteVideoUids((prev) => prev.filter((uid) => uid !== remoteUid))
          }
        },
        onUserEnableVideo: (_connection: unknown, remoteUid: number, enabled: boolean) => {
          setRemoteVideoUids((prev) =>
            enabled
              ? prev.includes(remoteUid)
                ? prev
                : [...prev, remoteUid]
              : prev.filter((uid) => uid !== remoteUid),
          )
        },
        onUserOffline: (_connection: unknown, remoteUid: number) => {
          setRemoteVideoUids((prev) => prev.filter((uid) => uid !== remoteUid))
        },
        onAudioVolumeIndication: (
          _connection: unknown,
          speakers: Array<{ uid: number; volume: number }>,
        ) => {
          const local = speakers.find((speaker) => speaker.uid === result.credentials.uid)
          updateVoiceState({ speaking: (local?.volume ?? 0) > 30 })
        },
      })
      engine.enableAudio()
      engine.enableAudioVolumeIndication(300, 3, true)
      engine.setEnableSpeakerphone(true)
      engine.muteLocalAudioStream(isMuted)
      engine.muteAllRemoteAudioStreams(isDeafened)
      engine.joinChannel(
        result.credentials.token ?? '',
        result.credentials.agoraChannelName,
        result.credentials.uid,
        {
          channelProfile: agora.ChannelProfileType?.ChannelProfileCommunication,
          clientRoleType: agora.ClientRoleType?.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
        },
      )
      heartbeatRef.current = setInterval(() => {
        const socket = getSocket()
        socket.emit('voice:heartbeat', { channelId, clientId: clientIdRef.current })
      }, 30_000)
    } catch (err) {
      const message = isNativeVoiceModuleError(err)
        ? t('voice.nativeModuleUnavailable')
        : err instanceof Error
          ? err.message
          : t('voice.joinFailed')
      setError(message)
      setStatus('error')
    }
  }, [
    applyState,
    channelId,
    isDeafened,
    isMuted,
    scheduleTokenRenewal,
    status,
    t,
    updateVoiceState,
  ])

  const leave = useCallback(async () => {
    const activeChannelId = credentialsRef.current?.channelId ?? channelId
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    clearTokenRenewal()
    try {
      engineRef.current?.leaveChannel?.()
      engineRef.current?.release?.()
    } catch {
      /* native cleanup best effort */
    }
    engineRef.current = null
    credentialsRef.current = null
    setError(null)
    setRemoteVideoUids([])
    setParticipants([])
    if (activeChannelId) {
      await socketCall('voice:leave', {
        channelId: activeChannelId,
        clientId: clientIdRef.current,
      }).catch(() => null)
    }
    setStatus('idle')
  }, [channelId, clearTokenRenewal])

  const toggleMute = useCallback(() => {
    const next = !isMuted
    setIsMuted(next)
    updateLocalParticipant({ isMuted: next, isSpeaking: next ? false : undefined })
    engineRef.current?.muteLocalAudioStream?.(next)
    updateVoiceState({ muted: next, speaking: next ? false : undefined })
  }, [isMuted, updateLocalParticipant, updateVoiceState])

  const toggleDeafen = useCallback(() => {
    const next = !isDeafened
    setIsDeafened(next)
    updateLocalParticipant({ isDeafened: next })
    engineRef.current?.muteAllRemoteAudioStreams?.(next)
    updateVoiceState({ deafened: next })
  }, [isDeafened, updateLocalParticipant, updateVoiceState])

  const toggleSpeaker = useCallback(() => {
    const next = !speakerEnabled
    setSpeakerEnabled(next)
    engineRef.current?.setEnableSpeakerphone?.(next)
  }, [speakerEnabled])

  useEffect(() => {
    const socket = getSocket()
    const update = (payload: { state?: VoiceState }) => applyState(payload.state)
    socket.on('voice:state', applyState)
    socket.on('voice:participant-joined', update)
    socket.on('voice:participant-left', update)
    socket.on('voice:participant-updated', update)
    return () => {
      socket.off('voice:state', applyState)
      socket.off('voice:participant-joined', update)
      socket.off('voice:participant-left', update)
      socket.off('voice:participant-updated', update)
    }
  }, [applyState])

  useEffect(() => {
    leaveRef.current = leave
  }, [leave])

  useEffect(() => {
    return () => {
      void leaveRef.current()
    }
  }, [])

  return {
    status,
    error,
    participants,
    isMuted,
    isDeafened,
    speakerEnabled,
    remoteVideoUids,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    toggleSpeaker,
  }
}

export type VoiceChannelController = ReturnType<typeof useVoiceChannel>
