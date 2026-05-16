import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'
import { getSocket } from '../lib/socket'

export interface VoiceParticipant {
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
  agoraChannelName: string
  uid: number
  token: string | null
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

export function useVoiceChannel(channelId: string) {
  const { t } = useTranslation()
  const engineRef = useRef<any>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const leaveRef = useRef<() => Promise<void>>(async () => undefined)
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [participants, setParticipants] = useState<VoiceParticipant[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [speakerEnabled, setSpeakerEnabled] = useState(true)
  const [remoteVideoUids, setRemoteVideoUids] = useState<number[]>([])

  const applyState = useCallback((state?: VoiceState) => {
    if (!state) return
    setParticipants(state.participants)
  }, [])

  const updateVoiceState = useCallback(
    (patch: {
      muted?: boolean
      deafened?: boolean
      speaking?: boolean
      screenSharing?: boolean
    }) => {
      void socketCall('voice:state:update', { channelId, ...patch }).catch(() => null)
    },
    [channelId],
  )

  const join = useCallback(async () => {
    if (status === 'connected' || status === 'connecting') return
    setStatus('connecting')
    setError(null)
    try {
      const agora = await import('react-native-agora')
      const result = await socketCall<VoiceJoinResult>('voice:join', {
        channelId,
        muted: isMuted,
        deafened: isDeafened,
      })
      applyState(result.state)
      const engine = agora.createAgoraRtcEngine()
      engineRef.current = engine
      engine.initialize({ appId: result.credentials.appId })
      engine.registerEventHandler({
        onJoinChannelSuccess: () => setStatus('connected'),
        onLeaveChannel: () => setStatus('idle'),
        onFirstRemoteVideoDecoded: (_connection: unknown, remoteUid: number) => {
          setRemoteVideoUids((prev) => (prev.includes(remoteUid) ? prev : [...prev, remoteUid]))
        },
        onRemoteVideoStateChanged: (_connection: unknown, remoteUid: number, state: number) => {
          if (state === agora.RemoteVideoState.RemoteVideoStateDecoding) {
            setRemoteVideoUids((prev) => (prev.includes(remoteUid) ? prev : [...prev, remoteUid]))
            return
          }
          if (
            state === agora.RemoteVideoState.RemoteVideoStateStopped ||
            state === agora.RemoteVideoState.RemoteVideoStateFailed
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
          channelProfile: agora.ChannelProfileType.ChannelProfileCommunication,
          clientRoleType: agora.ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
        },
      )
      heartbeatRef.current = setInterval(() => {
        const socket = getSocket()
        socket.emit('voice:heartbeat', { channelId })
      }, 30_000)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('voice.joinFailed')
      setError(message)
      setStatus('error')
      Alert.alert(t('common.error'), message)
    }
  }, [applyState, channelId, isDeafened, isMuted, status, t, updateVoiceState])

  const leave = useCallback(async () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    try {
      engineRef.current?.leaveChannel?.()
      engineRef.current?.release?.()
    } catch {
      /* native cleanup best effort */
    }
    engineRef.current = null
    setRemoteVideoUids([])
    setParticipants([])
    await socketCall('voice:leave', { channelId }).catch(() => null)
    setStatus('idle')
  }, [channelId])

  const toggleMute = useCallback(() => {
    const next = !isMuted
    setIsMuted(next)
    engineRef.current?.muteLocalAudioStream?.(next)
    updateVoiceState({ muted: next })
  }, [isMuted, updateVoiceState])

  const toggleDeafen = useCallback(() => {
    const next = !isDeafened
    setIsDeafened(next)
    engineRef.current?.muteAllRemoteAudioStreams?.(next)
    updateVoiceState({ deafened: next })
  }, [isDeafened, updateVoiceState])

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
