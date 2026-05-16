import type { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng'
import AgoraRTC from 'agora-rtc-sdk-ng'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSocket } from '../lib/socket'

const AGORA_LOG_LEVEL_ERROR = 3

try {
  AgoraRTC.disableLogUpload?.()
  AgoraRTC.setLogLevel?.(AGORA_LOG_LEVEL_ERROR)
} catch {
  // Agora runtime configuration is best-effort; joining still reports real errors below.
}

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

export interface VoiceCredentials {
  appId: string
  channelId: string
  agoraChannelName: string
  uid: number
  screenUid: number
  token: string | null
  screenToken: string | null
  expiresAt: string | null
}

export interface VoiceState {
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

export interface VoiceDevice {
  deviceId: string
  label: string
}

export interface RemoteScreen {
  uid: string | number
  userId: string | null
  displayName: string
  track: {
    play: (element: HTMLElement, config?: { fit?: 'contain' | 'cover' }) => void
    stop?: () => void
  }
}

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'
type VoiceErrorKey =
  | 'rtcNotConfigured'
  | 'microphonePermission'
  | 'microphonePolicy'
  | 'microphoneNotFound'
  | 'screenPermission'
  | 'screenPolicy'
  | null
export type NetworkQuality = 'unknown' | 'excellent' | 'good' | 'fair' | 'poor'

type VoiceCue = 'join' | 'leave'
type CaptureFeature = 'microphone' | 'display-capture'

const VOICE_MICROPHONE_POLICY_BLOCKED = 'VOICE_MICROPHONE_POLICY_BLOCKED'
const VOICE_MICROPHONE_PERMISSION_DENIED = 'VOICE_MICROPHONE_PERMISSION_DENIED'
const VOICE_SCREEN_POLICY_BLOCKED = 'VOICE_SCREEN_POLICY_BLOCKED'

interface BrowserPermissionsPolicy {
  allowsFeature?: (feature: string, origin?: string) => boolean
}

let voiceCueContext: AudioContext | null = null

function playVoiceCue(cue: VoiceCue) {
  if (typeof window === 'undefined') return
  const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext }
  const AudioContextCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext
  if (!AudioContextCtor) return

  try {
    voiceCueContext ??= new AudioContextCtor()
    const context = voiceCueContext
    void context.resume?.()
    const now = context.currentTime
    const output = context.createGain()
    output.gain.setValueAtTime(0.0001, now)
    output.gain.exponentialRampToValueAtTime(0.08, now + 0.015)
    output.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)
    output.connect(context.destination)

    const frequencies = cue === 'join' ? [523.25, 659.25] : [392, 261.63]
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.075)
      oscillator.connect(output)
      oscillator.start(now + index * 0.075)
      oscillator.stop(now + index * 0.075 + 0.13)
      oscillator.addEventListener('ended', () => oscillator.disconnect(), { once: true })
    })

    window.setTimeout(() => output.disconnect(), 320)
  } catch {
    // Browsers may block cues without a user gesture; voice UX should continue silently.
  }
}

function socketCall<T>(event: string, payload: unknown): Promise<T> {
  const socket = getSocket()
  return new Promise((resolve, reject) => {
    const emit = () => {
      socket.emit(event, payload, (res: { ok: boolean; data?: T; error?: string }) => {
        if (res?.ok) resolve(res.data as T)
        else {
          reject(
            Object.assign(new Error(res?.error ?? 'Voice request failed'), {
              code: (res as { code?: string })?.code,
            }),
          )
        }
      })
    }
    if (socket.connected) emit()
    else {
      socket.once('connect', emit)
      socket.connect()
    }
  })
}

function createCodedError(message: string, code: string) {
  return Object.assign(new Error(message), { code })
}

function getDocumentPermissionsPolicy() {
  if (typeof document === 'undefined') return null
  const policyDocument = document as Document & {
    permissionsPolicy?: BrowserPermissionsPolicy
    featurePolicy?: BrowserPermissionsPolicy
  }
  return policyDocument.permissionsPolicy ?? policyDocument.featurePolicy ?? null
}

function isCaptureBlockedByPolicy(feature: CaptureFeature) {
  const policy = getDocumentPermissionsPolicy()
  if (typeof policy?.allowsFeature !== 'function') return false

  try {
    return policy.allowsFeature(feature) === false
  } catch {
    return false
  }
}

async function getBrowserPermissionState(name: 'microphone') {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null

  try {
    const status = await navigator.permissions.query({ name: name as PermissionName })
    return status.state
  } catch {
    return null
  }
}

async function assertMicrophoneCaptureAllowed() {
  if (isCaptureBlockedByPolicy('microphone')) {
    throw createCodedError(
      'Microphone capture is blocked by the page permissions policy.',
      VOICE_MICROPHONE_POLICY_BLOCKED,
    )
  }

  const permissionState = await getBrowserPermissionState('microphone')
  if (permissionState === 'denied') {
    throw createCodedError(
      'Microphone permission has been denied by the browser.',
      VOICE_MICROPHONE_PERMISSION_DENIED,
    )
  }
}

function assertScreenCaptureAllowed() {
  if (isCaptureBlockedByPolicy('display-capture')) {
    throw createCodedError(
      'Screen capture is blocked by the page permissions policy.',
      VOICE_SCREEN_POLICY_BLOCKED,
    )
  }
}

function voiceErrorKey(err: unknown): VoiceErrorKey {
  const error = err as { code?: string; message?: string; name?: string }
  const message = error?.message ?? ''
  const normalized = `${error?.code ?? ''} ${error?.name ?? ''} ${message}`.toLowerCase()
  if (
    error?.code === 'VOICE_RTC_NOT_CONFIGURED' ||
    message.includes('Agora RTC is not configured')
  ) {
    return 'rtcNotConfigured'
  }
  if (
    error?.code === VOICE_MICROPHONE_POLICY_BLOCKED ||
    normalized.includes('permissions policy') ||
    normalized.includes('permission policy') ||
    normalized.includes('microphone is not allowed in this document')
  ) {
    return 'microphonePolicy'
  }
  if (
    normalized.includes('notfounderror') ||
    normalized.includes('devicesnotfounderror') ||
    normalized.includes('requested device not found') ||
    normalized.includes('no microphone')
  ) {
    return 'microphoneNotFound'
  }
  if (
    error?.code === VOICE_MICROPHONE_PERMISSION_DENIED ||
    error?.code === 'PERMISSION_DENIED' ||
    normalized.includes('permission_denied') ||
    normalized.includes('notallowederror') ||
    normalized.includes('permission denied')
  ) {
    return 'microphonePermission'
  }
  return null
}

function screenShareErrorKey(err: unknown): VoiceErrorKey {
  const error = err as { code?: string; message?: string; name?: string }
  const normalized =
    `${error?.code ?? ''} ${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase()
  if (
    error?.code === VOICE_SCREEN_POLICY_BLOCKED ||
    normalized.includes('permissions policy') ||
    normalized.includes('permission policy') ||
    normalized.includes('display-capture')
  ) {
    return 'screenPolicy'
  }
  if (
    normalized.includes('permission_denied') ||
    normalized.includes('notallowederror') ||
    normalized.includes('permission denied')
  ) {
    return 'screenPermission'
  }
  return voiceErrorKey(err)
}

export function useVoiceChannel(channelId: string | null) {
  const clientId = useMemo(() => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, [])
  const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null)
  const screenClientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null)
  const localAudioTrackRef = useRef<any>(null)
  const localScreenTrackRef = useRef<any>(null)
  const credentialsRef = useRef<VoiceCredentials | null>(null)
  const remoteAudioTracksRef = useRef<Map<string | number, any>>(new Map())
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tokenRenewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renewTokensRef = useRef<() => Promise<void>>(async () => undefined)
  const micTestTrackRef = useRef<any>(null)
  const micTestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<VoiceErrorKey>(null)
  const [participants, setParticipants] = useState<VoiceParticipant[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [microphones, setMicrophones] = useState<VoiceDevice[]>([])
  const [speakers, setSpeakers] = useState<VoiceDevice[]>([])
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>('')
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('')
  const [micTestLevel, setMicTestLevel] = useState(0)
  const [inputVolume, setInputVolume] = useState(0)
  const [outputVolume, setOutputVolumeState] = useState(100)
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>('unknown')
  const [isTestingMic, setIsTestingMic] = useState(false)
  const [remoteScreens, setRemoteScreens] = useState<RemoteScreen[]>([])
  const [localScreenTrack, setLocalScreenTrack] = useState<any>(null)
  const leaveRef = useRef<(options?: { silent?: boolean }) => Promise<void>>(async () => undefined)
  const participantsRef = useRef<VoiceParticipant[]>([])

  const emitVoiceState = useCallback(
    (patch: {
      muted?: boolean
      deafened?: boolean
      speaking?: boolean
      screenSharing?: boolean
    }) => {
      if (!channelId) return
      getSocket().emit('voice:state:update', { channelId, clientId, ...patch })
    },
    [channelId, clientId],
  )

  const applyState = useCallback(
    (state: VoiceState | undefined) => {
      if (!state || state.channelId !== channelId) return
      participantsRef.current = state.participants
      setParticipants(state.participants)
    },
    [channelId],
  )

  const refreshDevices = useCallback(async () => {
    const [micList, speakerList] = await Promise.all([
      AgoraRTC.getMicrophones().catch(() => []),
      AgoraRTC.getPlaybackDevices().catch(() => []),
    ])
    setMicrophones(micList.map((device) => ({ deviceId: device.deviceId, label: device.label })))
    setSpeakers(speakerList.map((device) => ({ deviceId: device.deviceId, label: device.label })))
  }, [])

  const stopMicTest = useCallback(() => {
    if (micTestTimerRef.current) {
      clearInterval(micTestTimerRef.current)
      micTestTimerRef.current = null
    }
    micTestTrackRef.current?.stop?.()
    micTestTrackRef.current?.close?.()
    micTestTrackRef.current = null
    setMicTestLevel(0)
    setIsTestingMic(false)
  }, [])

  const startMicTest = useCallback(async () => {
    stopMicTest()
    setError(null)
    setErrorKey(null)
    try {
      await assertMicrophoneCaptureAllowed()
      const track = await AgoraRTC.createMicrophoneAudioTrack({
        microphoneId: selectedMicrophoneId || undefined,
      })
      micTestTrackRef.current = track
      setIsTestingMic(true)
      micTestTimerRef.current = setInterval(() => {
        setMicTestLevel(Math.round((track.getVolumeLevel?.() ?? 0) * 100))
      }, 120)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test microphone'
      setError(message)
      setErrorKey(voiceErrorKey(err))
      setIsTestingMic(false)
      setMicTestLevel(0)
    }
  }, [selectedMicrophoneId, stopMicTest])

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
    const activeChannelId = credentialsRef.current?.channelId
    if (!activeChannelId) return
    const result = await socketCall<VoiceRenewResult>('voice:token:renew', {
      channelId: activeChannelId,
      clientId,
    })
    credentialsRef.current = result.credentials
    applyState(result.state)
    if (result.credentials.token) {
      await clientRef.current?.renewToken?.(result.credentials.token)
    }
    if (result.credentials.screenToken) {
      await screenClientRef.current?.renewToken?.(result.credentials.screenToken)
    }
    scheduleTokenRenewal(result.credentials)
  }, [applyState, clientId, scheduleTokenRenewal])

  useEffect(() => {
    renewTokensRef.current = renewTokens
  }, [renewTokens])

  const leave = useCallback(
    async (options: { silent?: boolean } = {}) => {
      const activeChannelId = credentialsRef.current?.channelId ?? null
      const client = clientRef.current
      const screenClient = screenClientRef.current
      const localAudioTrack = localAudioTrackRef.current
      const localScreenTrack = localScreenTrackRef.current
      if (activeChannelId && !options.silent) {
        playVoiceCue('leave')
      }
      stopMicTest()
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
      clearTokenRenewal()
      setRemoteScreens([])
      setLocalScreenTrack(null)
      remoteAudioTracksRef.current.clear()
      credentialsRef.current = null
      clientRef.current = null
      screenClientRef.current = null
      localAudioTrackRef.current = null
      localScreenTrackRef.current = null
      setStatus('idle')
      setErrorKey(null)
      setError(null)
      participantsRef.current = []
      setParticipants([])
      setIsScreenSharing(false)
      setInputVolume(0)
      setNetworkQuality('unknown')

      localAudioTrack?.stop?.()
      localAudioTrack?.close?.()
      localScreenTrack?.stop?.()
      localScreenTrack?.close?.()

      await Promise.all([
        screenClient?.leave().catch(() => undefined),
        client?.leave().catch(() => undefined),
        activeChannelId
          ? socketCall('voice:leave', { channelId: activeChannelId, clientId }).catch(
              () => undefined,
            )
          : Promise.resolve(),
      ])
    },
    [clearTokenRenewal, clientId, stopMicTest],
  )

  const subscribeRemoteUser = useCallback(
    async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
      const client = clientRef.current
      if (!client) return
      await client.subscribe(user, mediaType)
      if (mediaType === 'audio' && user.audioTrack) {
        remoteAudioTracksRef.current.set(user.uid, user.audioTrack)
        if (!isDeafened) {
          if (selectedSpeakerId && typeof user.audioTrack.setPlaybackDevice === 'function') {
            await user.audioTrack.setPlaybackDevice(selectedSpeakerId).catch(() => undefined)
          }
          if (typeof user.audioTrack.setVolume === 'function') {
            user.audioTrack.setVolume(outputVolume)
          }
          user.audioTrack.play()
        }
      }
      if (mediaType === 'video' && user.videoTrack) {
        const credentials = credentialsRef.current
        if (credentials && Number(user.uid) === credentials.screenUid) {
          setRemoteScreens((prev) =>
            prev.filter((screen) => Number(screen.uid) !== credentials.screenUid),
          )
          return
        }
        setRemoteScreens((prev) => {
          const existing = prev.filter((screen) => screen.uid !== user.uid)
          const owner = participantsRef.current.find(
            (participant) => participant.screenUid === Number(user.uid),
          )
          return [
            ...existing,
            {
              uid: user.uid,
              userId: owner?.userId ?? null,
              displayName: owner?.displayName ?? owner?.username ?? String(user.uid),
              track: user.videoTrack as RemoteScreen['track'],
            },
          ]
        })
      }
    },
    [isDeafened, outputVolume, selectedSpeakerId],
  )

  const join = useCallback(async () => {
    if (!channelId) return
    if (status === 'connected' || status === 'connecting') return
    setStatus('connecting')
    setError(null)
    setErrorKey(null)
    let localAudioTrack: Awaited<ReturnType<typeof AgoraRTC.createMicrophoneAudioTrack>> | null =
      null
    try {
      await assertMicrophoneCaptureAllowed()
      localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        microphoneId: selectedMicrophoneId || undefined,
        encoderConfig: 'music_standard',
      })
      localAudioTrackRef.current = localAudioTrack
      await localAudioTrack.setEnabled(!isMuted)

      const result = await socketCall<VoiceJoinResult>('voice:join', {
        channelId,
        clientId,
        muted: isMuted,
        deafened: isDeafened,
      })
      credentialsRef.current = result.credentials
      scheduleTokenRenewal(result.credentials)
      applyState(result.state)

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      clientRef.current = client
      client.on('user-published', subscribeRemoteUser)
      client.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'audio') remoteAudioTracksRef.current.delete(user.uid)
        if (mediaType === 'video') {
          setRemoteScreens((prev) => prev.filter((screen) => screen.uid !== user.uid))
        }
      })
      client.enableAudioVolumeIndicator()
      client.on('volume-indicator', (volumes) => {
        const local = volumes.find((volume) => Number(volume.uid) === result.credentials.uid)
        const level = local?.level ?? 0
        setInputVolume(level)
        emitVoiceState({ speaking: level > 35 })
      })
      client.on('network-quality', (quality) => {
        const score = Math.max(
          quality.uplinkNetworkQuality ?? 0,
          quality.downlinkNetworkQuality ?? 0,
        )
        setNetworkQuality(
          score <= 0
            ? 'unknown'
            : score <= 2
              ? 'excellent'
              : score === 3
                ? 'good'
                : score === 4
                  ? 'fair'
                  : 'poor',
        )
      })
      client.on('token-privilege-will-expire', () => {
        void renewTokensRef.current()
      })
      client.on('token-privilege-did-expire', () => {
        void renewTokensRef.current()
      })
      await client.join(
        result.credentials.appId,
        result.credentials.agoraChannelName,
        result.credentials.token,
        result.credentials.uid,
      )
      await client.publish([localAudioTrack])
      setStatus('connected')
      playVoiceCue('join')
      await refreshDevices()
      heartbeatRef.current = setInterval(() => {
        getSocket().emit('voice:heartbeat', { channelId, clientId })
      }, 30_000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join voice channel'
      await leave({ silent: true })
      if (localAudioTrackRef.current === localAudioTrack) {
        localAudioTrackRef.current = null
      }
      localAudioTrack?.stop?.()
      localAudioTrack?.close?.()
      setError(message)
      setErrorKey(voiceErrorKey(err))
      setStatus('error')
    }
  }, [
    applyState,
    channelId,
    clientId,
    emitVoiceState,
    isDeafened,
    isMuted,
    leave,
    refreshDevices,
    scheduleTokenRenewal,
    selectedMicrophoneId,
    status,
    subscribeRemoteUser,
  ])

  const toggleMute = useCallback(async () => {
    const next = !isMuted
    setIsMuted(next)
    await localAudioTrackRef.current?.setEnabled?.(!next)
    emitVoiceState({ muted: next })
  }, [emitVoiceState, isMuted])

  const toggleDeafen = useCallback(() => {
    const next = !isDeafened
    setIsDeafened(next)
    for (const track of remoteAudioTracksRef.current.values()) {
      if (next) track.stop?.()
      else track.play?.()
    }
    emitVoiceState({ deafened: next })
  }, [emitVoiceState, isDeafened])

  const setMicrophoneDevice = useCallback(async (deviceId: string) => {
    setSelectedMicrophoneId(deviceId)
    if (localAudioTrackRef.current?.setDevice) {
      await localAudioTrackRef.current.setDevice(deviceId)
    }
  }, [])

  const setSpeakerDevice = useCallback(async (deviceId: string) => {
    setSelectedSpeakerId(deviceId)
    for (const track of remoteAudioTracksRef.current.values()) {
      if (typeof track.setPlaybackDevice === 'function') {
        await track.setPlaybackDevice(deviceId).catch(() => undefined)
      }
    }
  }, [])

  const setOutputVolume = useCallback((volume: number) => {
    const next = Math.max(0, Math.min(100, Math.round(volume)))
    setOutputVolumeState(next)
    for (const track of remoteAudioTracksRef.current.values()) {
      if (typeof track.setVolume === 'function') {
        track.setVolume(next)
      }
    }
  }, [])

  const stopScreenShare = useCallback(async () => {
    localScreenTrackRef.current?.stop?.()
    localScreenTrackRef.current?.close?.()
    localScreenTrackRef.current = null
    setLocalScreenTrack(null)
    await screenClientRef.current?.leave().catch(() => undefined)
    screenClientRef.current = null
    setIsScreenSharing(false)
    emitVoiceState({ screenSharing: false })
  }, [emitVoiceState])

  const startScreenShare = useCallback(async () => {
    const credentials = credentialsRef.current
    if (!credentials || isScreenSharing) return
    setError(null)
    setErrorKey(null)
    let screenTrack: any = null
    try {
      assertScreenCaptureAllowed()
      const trackResult = await AgoraRTC.createScreenVideoTrack(
        { encoderConfig: '1080p_1' },
        'disable',
      )
      screenTrack = Array.isArray(trackResult) ? trackResult[0] : trackResult
      localScreenTrackRef.current = screenTrack
      screenTrack.on?.('track-ended', () => void stopScreenShare())

      const screenClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      screenClientRef.current = screenClient
      screenClient.on('token-privilege-will-expire', () => {
        void renewTokensRef.current()
      })
      screenClient.on('token-privilege-did-expire', () => {
        void renewTokensRef.current()
      })
      await screenClient.join(
        credentials.appId,
        credentials.agoraChannelName,
        credentials.screenToken,
        credentials.screenUid,
      )
      await screenClient.publish([screenTrack])
      setLocalScreenTrack(screenTrack)
      setRemoteScreens((prev) =>
        prev.filter((screen) => Number(screen.uid) !== credentials.screenUid),
      )
      setIsScreenSharing(true)
      emitVoiceState({ screenSharing: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to share screen'
      localScreenTrackRef.current?.stop?.()
      localScreenTrackRef.current?.close?.()
      localScreenTrackRef.current = null
      setLocalScreenTrack(null)
      await screenClientRef.current?.leave().catch(() => undefined)
      screenClientRef.current = null
      setIsScreenSharing(false)
      setError(message)
      setErrorKey(screenShareErrorKey(err))
      emitVoiceState({ screenSharing: false })
      screenTrack?.stop?.()
      screenTrack?.close?.()
    }
  }, [emitVoiceState, isScreenSharing, stopScreenShare])

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
      void leaveRef.current({ silent: true })
    }
  }, [])

  return {
    status,
    error,
    errorKey,
    participants,
    isMuted,
    isDeafened,
    isScreenSharing,
    microphones,
    speakers,
    selectedMicrophoneId,
    selectedSpeakerId,
    micTestLevel,
    inputVolume,
    outputVolume,
    networkQuality,
    isTestingMic,
    remoteScreens,
    localScreenTrack,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    startScreenShare,
    stopScreenShare,
    refreshDevices,
    setMicrophoneDevice,
    setSpeakerDevice,
    setOutputVolume,
    startMicTest,
    stopMicTest,
  }
}
