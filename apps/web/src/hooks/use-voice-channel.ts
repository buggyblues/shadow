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

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error'
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

interface UseVoiceChannelOptions {
  deviceDiscoveryEnabled?: boolean
}

const VOICE_MICROPHONE_POLICY_BLOCKED = 'VOICE_MICROPHONE_POLICY_BLOCKED'
const VOICE_MICROPHONE_PERMISSION_DENIED = 'VOICE_MICROPHONE_PERMISSION_DENIED'
const VOICE_SCREEN_POLICY_BLOCKED = 'VOICE_SCREEN_POLICY_BLOCKED'
const VOICE_MICROPHONE_DEVICE_KEY = 'shadow.voice.microphoneDevice:v1'
const VOICE_SPEAKER_DEVICE_KEY = 'shadow.voice.speakerDevice:v1'
const SYSTEM_DEFAULT_DEVICE_ID = 'default'

class VoiceOperationCancelledError extends Error {
  constructor() {
    super('Voice operation cancelled')
    this.name = 'VoiceOperationCancelledError'
  }
}

function isVoiceOperationCancelled(error: unknown) {
  return error instanceof VoiceOperationCancelledError
}

function closeLocalMediaTrack(track: any) {
  try {
    track?.getMediaStreamTrack?.()?.stop?.()
  } catch {
    // Ignore release failures; Agora cleanup below is still best effort.
  }
  try {
    track?.stop?.()
  } catch {
    // Ignore release failures; close may still release the capture device.
  }
  try {
    track?.close?.()
  } catch {
    // Browser capture indicators should not survive a failed close attempt.
  }
}

function loadStoredVoiceDevice(key: string) {
  if (typeof window === 'undefined') return SYSTEM_DEFAULT_DEVICE_ID
  try {
    const stored = localStorage.getItem(key)?.trim()
    return stored || SYSTEM_DEFAULT_DEVICE_ID
  } catch {
    return SYSTEM_DEFAULT_DEVICE_ID
  }
}

function storeVoiceDevice(key: string, deviceId: string) {
  if (typeof window === 'undefined') return
  try {
    if (deviceId && deviceId !== SYSTEM_DEFAULT_DEVICE_ID) localStorage.setItem(key, deviceId)
    else localStorage.removeItem(key)
  } catch {
    // Device persistence is a convenience only.
  }
}

function agoraDeviceId(deviceId: string) {
  return deviceId === SYSTEM_DEFAULT_DEVICE_ID ? SYSTEM_DEFAULT_DEVICE_ID : deviceId || undefined
}

function normalizeDeviceList(devices: VoiceDevice[]) {
  const seen = new Set<string>()
  return devices.filter((device) => {
    if (!device.deviceId || seen.has(device.deviceId)) return false
    seen.add(device.deviceId)
    return device.deviceId !== SYSTEM_DEFAULT_DEVICE_ID
  })
}

function selectedDeviceStillAvailable(devices: VoiceDevice[], deviceId: string) {
  return (
    !deviceId ||
    deviceId === SYSTEM_DEFAULT_DEVICE_ID ||
    devices.some((device) => device.deviceId === deviceId)
  )
}

function reconcileVoiceParticipants(participants: VoiceParticipant[], onlineUids: Set<number>) {
  if (onlineUids.size === 0) return participants
  const byUserId = new Map<string, VoiceParticipant>()
  for (const participant of participants) {
    if (!onlineUids.has(participant.uid)) continue
    const current = byUserId.get(participant.userId)
    if (
      !current ||
      participant.isSpeaking ||
      new Date(participant.updatedAt).getTime() > new Date(current.updatedAt).getTime()
    ) {
      byUserId.set(participant.userId, participant)
    }
  }
  return participants.filter(
    (participant) => byUserId.get(participant.userId)?.id === participant.id,
  )
}

interface BrowserPermissionsPolicy {
  allowsFeature?: (feature: string, origin?: string) => boolean
}

type WakeLockSentinelLike = {
  released?: boolean
  release: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
  removeEventListener?: (type: 'release', listener: () => void) => void
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
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

export function useVoiceChannel(channelId: string | null, options: UseVoiceChannelOptions = {}) {
  const deviceDiscoveryEnabled = options.deviceDiscoveryEnabled ?? Boolean(channelId)
  const baseClientId = useMemo<string>(
    () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    [],
  )
  const activeClientIdRef = useRef<string>(baseClientId)
  const operationRef = useRef<Promise<void>>(Promise.resolve())
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
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const joinOperationRef = useRef(0)
  const screenShareOperationRef = useRef(0)

  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<VoiceErrorKey>(null)
  const [participants, setParticipants] = useState<VoiceParticipant[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [microphones, setMicrophones] = useState<VoiceDevice[]>([])
  const [speakers, setSpeakers] = useState<VoiceDevice[]>([])
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>(() =>
    loadStoredVoiceDevice(VOICE_MICROPHONE_DEVICE_KEY),
  )
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>(() =>
    loadStoredVoiceDevice(VOICE_SPEAKER_DEVICE_KEY),
  )
  const [micTestLevel, setMicTestLevel] = useState(0)
  const [inputVolume, setInputVolume] = useState(0)
  const [outputVolume, setOutputVolumeState] = useState(100)
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>('unknown')
  const [isTestingMic, setIsTestingMic] = useState(false)
  const [remoteScreens, setRemoteScreens] = useState<RemoteScreen[]>([])
  const [localScreenTrack, setLocalScreenTrack] = useState<any>(null)
  const [onlineVoiceUids, setOnlineVoiceUids] = useState<Set<number>>(new Set())
  const leaveRef = useRef<(options?: { silent?: boolean }) => Promise<void>>(async () => undefined)
  const participantsRef = useRef<VoiceParticipant[]>([])
  const statusRef = useRef<ConnectionStatus>('idle')

  const setConnectionStatus = useCallback((next: ConnectionStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const nextClientId = useCallback(() => {
    const suffix = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return `${baseClientId}:${suffix}`
  }, [baseClientId])

  const emitVoiceState = useCallback(
    (patch: {
      muted?: boolean
      deafened?: boolean
      speaking?: boolean
      screenSharing?: boolean
    }) => {
      if (!channelId) return
      getSocket().emit('voice:state:update', {
        channelId,
        clientId: activeClientIdRef.current,
        ...patch,
      })
    },
    [channelId],
  )

  const applyState = useCallback(
    (state: VoiceState | undefined) => {
      if (!state || state.channelId !== channelId) return
      participantsRef.current = state.participants
      setParticipants(state.participants)
    },
    [channelId],
  )

  const displayedParticipants = useMemo(
    () => reconcileVoiceParticipants(participants, onlineVoiceUids),
    [onlineVoiceUids, participants],
  )

  const applySpeakerDevice = useCallback(
    async (deviceId: string) => {
      const playbackDeviceId = agoraDeviceId(deviceId)
      for (const track of remoteAudioTracksRef.current.values()) {
        if (playbackDeviceId && typeof track.setPlaybackDevice === 'function') {
          await track.setPlaybackDevice(playbackDeviceId).catch(() => undefined)
        }
        if (typeof track.setVolume === 'function') {
          track.setVolume(outputVolume)
        }
        if (!isDeafened) {
          track.play?.()
        }
      }
    },
    [isDeafened, outputVolume],
  )

  const updateLocalParticipant = useCallback(
    (
      patch: Partial<
        Pick<VoiceParticipant, 'isMuted' | 'isDeafened' | 'isSpeaking' | 'isScreenSharing'>
      >,
    ) => {
      const cleanPatch = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ) as Partial<
        Pick<VoiceParticipant, 'isMuted' | 'isDeafened' | 'isSpeaking' | 'isScreenSharing'>
      >
      if (Object.keys(cleanPatch).length === 0) return
      const credentials = credentialsRef.current
      let changed = false
      const nextParticipants = participantsRef.current.map((participant) => {
        const isLocal =
          participant.clientId === activeClientIdRef.current ||
          (credentials && participant.uid === credentials.uid)
        if (!isLocal) return participant
        changed = true
        return {
          ...participant,
          ...cleanPatch,
          updatedAt: new Date().toISOString(),
        }
      })
      if (!changed) return
      participantsRef.current = nextParticipants
      setParticipants(nextParticipants)
    },
    [],
  )

  const replacePublishedMicrophone = useCallback(
    async (deviceId: string) => {
      if (statusRef.current !== 'connected') return
      const currentTrack = localAudioTrackRef.current
      const client = clientRef.current
      const microphoneId = agoraDeviceId(deviceId)

      if (currentTrack?.setDevice && microphoneId) {
        try {
          await currentTrack.setDevice(microphoneId)
          await currentTrack.setEnabled?.(!isMuted)
          emitVoiceState({ muted: isMuted, speaking: false })
          return
        } catch {
          // Fall back to recreating and republishing the track below.
        }
      }

      const connectionState = (client as { connectionState?: string } | null)?.connectionState
      if (!client || (connectionState && connectionState !== 'CONNECTED')) return

      const nextTrack = await AgoraRTC.createMicrophoneAudioTrack({
        microphoneId,
        encoderConfig: 'music_standard',
      })
      await nextTrack.setEnabled(!isMuted)

      if (currentTrack) {
        await client.unpublish([currentTrack]).catch(() => undefined)
        closeLocalMediaTrack(currentTrack)
      }
      localAudioTrackRef.current = nextTrack
      await client.publish([nextTrack])
      emitVoiceState({ muted: isMuted, speaking: false })
    },
    [emitVoiceState, isMuted],
  )

  const refreshDevices = useCallback(async () => {
    const [micList, speakerList] = await Promise.all([
      AgoraRTC.getMicrophones().catch(() => []),
      AgoraRTC.getPlaybackDevices().catch(() => []),
    ])
    const nextMicrophones = normalizeDeviceList(
      micList.map((device) => ({
        deviceId: device.deviceId,
        label: device.label,
      })),
    )
    const nextSpeakers = normalizeDeviceList(
      speakerList.map((device) => ({
        deviceId: device.deviceId,
        label: device.label,
      })),
    )

    setMicrophones(nextMicrophones)
    setSpeakers(nextSpeakers)

    const nextMicrophoneId = selectedDeviceStillAvailable(nextMicrophones, selectedMicrophoneId)
      ? selectedMicrophoneId || SYSTEM_DEFAULT_DEVICE_ID
      : SYSTEM_DEFAULT_DEVICE_ID
    if (nextMicrophoneId !== selectedMicrophoneId) {
      setSelectedMicrophoneId(nextMicrophoneId)
      storeVoiceDevice(VOICE_MICROPHONE_DEVICE_KEY, nextMicrophoneId)
    }
    if (
      nextMicrophoneId === SYSTEM_DEFAULT_DEVICE_ID ||
      nextMicrophoneId !== selectedMicrophoneId
    ) {
      await replacePublishedMicrophone(nextMicrophoneId).catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to switch microphone'
        setError(message)
        setErrorKey(voiceErrorKey(err))
      })
    }

    const nextSpeakerId = selectedDeviceStillAvailable(nextSpeakers, selectedSpeakerId)
      ? selectedSpeakerId || SYSTEM_DEFAULT_DEVICE_ID
      : SYSTEM_DEFAULT_DEVICE_ID
    if (nextSpeakerId !== selectedSpeakerId) {
      setSelectedSpeakerId(nextSpeakerId)
      storeVoiceDevice(VOICE_SPEAKER_DEVICE_KEY, nextSpeakerId)
    }
    if (nextSpeakerId === SYSTEM_DEFAULT_DEVICE_ID || nextSpeakerId !== selectedSpeakerId) {
      await applySpeakerDevice(nextSpeakerId)
    }
  }, [applySpeakerDevice, replacePublishedMicrophone, selectedMicrophoneId, selectedSpeakerId])

  const stopMicTest = useCallback(() => {
    if (micTestTimerRef.current) {
      clearInterval(micTestTimerRef.current)
      micTestTimerRef.current = null
    }
    closeLocalMediaTrack(micTestTrackRef.current)
    micTestTrackRef.current = null
    setMicTestLevel(0)
    setIsTestingMic(false)
  }, [])

  const releaseLocalCapture = useCallback(() => {
    closeLocalMediaTrack(localAudioTrackRef.current)
    closeLocalMediaTrack(localScreenTrackRef.current)
    localAudioTrackRef.current = null
    localScreenTrackRef.current = null
    setLocalScreenTrack(null)
    setIsScreenSharing(false)
    setInputVolume(0)
    stopMicTest()
  }, [stopMicTest])

  const startMicTest = useCallback(async () => {
    stopMicTest()
    setError(null)
    setErrorKey(null)
    try {
      await assertMicrophoneCaptureAllowed()
      const track = await AgoraRTC.createMicrophoneAudioTrack({
        microphoneId: agoraDeviceId(selectedMicrophoneId),
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
      clientId: activeClientIdRef.current,
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
  }, [applyState, scheduleTokenRenewal])

  useEffect(() => {
    renewTokensRef.current = renewTokens
  }, [renewTokens])

  const performLeave = useCallback(
    async (options: { silent?: boolean } = {}) => {
      joinOperationRef.current += 1
      screenShareOperationRef.current += 1
      const activeChannelId = credentialsRef.current?.channelId ?? null
      const activeClientId = activeClientIdRef.current
      const client = clientRef.current
      const screenClient = screenClientRef.current
      if (activeChannelId && !options.silent) {
        playVoiceCue('leave')
      }
      if (activeChannelId || client || screenClient) {
        setConnectionStatus('disconnecting')
      }
      releaseLocalCapture()
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
      setErrorKey(null)
      setError(null)
      participantsRef.current = []
      setParticipants([])
      setIsScreenSharing(false)
      setInputVolume(0)
      setNetworkQuality('unknown')
      setOnlineVoiceUids(new Set())

      await Promise.all([
        screenClient?.leave().catch(() => undefined),
        client?.leave().catch(() => undefined),
        activeChannelId
          ? socketCall('voice:leave', {
              channelId: activeChannelId,
              clientId: activeClientId,
            }).catch(() => undefined)
          : Promise.resolve(),
      ])
      setConnectionStatus('idle')
    },
    [clearTokenRenewal, releaseLocalCapture, setConnectionStatus],
  )

  const leave = useCallback(
    async (options: { silent?: boolean } = {}) => {
      joinOperationRef.current += 1
      screenShareOperationRef.current += 1
      if (statusRef.current === 'connected' || statusRef.current === 'connecting') {
        setConnectionStatus('disconnecting')
      }
      releaseLocalCapture()
      const nextOperation = operationRef.current
        .catch(() => undefined)
        .then(() => performLeave(options))
      operationRef.current = nextOperation.catch(() => undefined)
      return nextOperation
    },
    [performLeave, releaseLocalCapture, setConnectionStatus],
  )

  const subscribeRemoteUser = useCallback(
    async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
      const client = clientRef.current
      if (!client) return
      setOnlineVoiceUids((prev) => {
        const next = new Set(prev)
        next.add(Number(user.uid))
        return next
      })
      await client.subscribe(user, mediaType)
      if (mediaType === 'audio' && user.audioTrack) {
        remoteAudioTracksRef.current.set(user.uid, user.audioTrack)
        if (!isDeafened) {
          const playbackDeviceId = agoraDeviceId(selectedSpeakerId)
          if (playbackDeviceId && typeof user.audioTrack.setPlaybackDevice === 'function') {
            await user.audioTrack.setPlaybackDevice(playbackDeviceId).catch(() => undefined)
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

  const markRemoteUserOffline = useCallback((uid: string | number) => {
    remoteAudioTracksRef.current.delete(uid)
    setRemoteScreens((prev) => prev.filter((screen) => screen.uid !== uid))
    setOnlineVoiceUids((prev) => {
      const next = new Set(prev)
      next.delete(Number(uid))
      return next
    })
  }, [])

  const join = useCallback(async () => {
    const nextOperation = operationRef.current
      .catch(() => undefined)
      .then(async () => {
        if (!channelId) return
        if (
          statusRef.current === 'connected' ||
          statusRef.current === 'connecting' ||
          statusRef.current === 'disconnecting'
        ) {
          return
        }
        const joinOperationId = ++joinOperationRef.current
        const assertJoinActive = () => {
          if (joinOperationRef.current !== joinOperationId) {
            throw new VoiceOperationCancelledError()
          }
        }
        const joinClientId = nextClientId()
        activeClientIdRef.current = joinClientId
        setConnectionStatus('connecting')
        setError(null)
        setErrorKey(null)
        let localAudioTrack: Awaited<
          ReturnType<typeof AgoraRTC.createMicrophoneAudioTrack>
        > | null = null
        try {
          assertJoinActive()
          await assertMicrophoneCaptureAllowed()
          assertJoinActive()
          localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
            microphoneId: agoraDeviceId(selectedMicrophoneId),
            encoderConfig: 'music_standard',
          })
          assertJoinActive()
          localAudioTrackRef.current = localAudioTrack
          await localAudioTrack.setEnabled(!isMuted)
          assertJoinActive()

          const result = await socketCall<VoiceJoinResult>('voice:join', {
            channelId,
            clientId: joinClientId,
            muted: isMuted,
            deafened: isDeafened,
          })
          credentialsRef.current = result.credentials
          scheduleTokenRenewal(result.credentials)
          applyState(result.state)
          assertJoinActive()

          const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
          clientRef.current = client
          client.on('user-joined', (user) => {
            setOnlineVoiceUids((prev) => {
              const next = new Set(prev)
              next.add(Number(user.uid))
              return next
            })
          })
          client.on('user-published', subscribeRemoteUser)
          client.on('user-unpublished', (user, mediaType) => {
            if (mediaType === 'audio') remoteAudioTracksRef.current.delete(user.uid)
            if (mediaType === 'video') {
              setRemoteScreens((prev) => prev.filter((screen) => screen.uid !== user.uid))
            }
          })
          client.on('user-left', (user) => {
            markRemoteUserOffline(user.uid)
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
          assertJoinActive()
          setOnlineVoiceUids(
            new Set([
              result.credentials.uid,
              ...client.remoteUsers.map((user) => Number(user.uid)),
            ]),
          )
          await client.publish([localAudioTrack])
          assertJoinActive()
          setConnectionStatus('connected')
          playVoiceCue('join')
          await refreshDevices()
          assertJoinActive()
          heartbeatRef.current = setInterval(() => {
            getSocket().emit('voice:heartbeat', { channelId, clientId: joinClientId })
          }, 30_000)
        } catch (err) {
          const cancelled = isVoiceOperationCancelled(err)
          const message = err instanceof Error ? err.message : 'Failed to join voice channel'
          await performLeave({ silent: true })
          if (localAudioTrackRef.current === localAudioTrack) {
            localAudioTrackRef.current = null
          }
          closeLocalMediaTrack(localAudioTrack)
          if (cancelled) {
            setConnectionStatus('idle')
            return
          }
          setError(message)
          setErrorKey(voiceErrorKey(err))
          setConnectionStatus('error')
        }
      })
    operationRef.current = nextOperation.catch(() => undefined)
    return nextOperation
  }, [
    applyState,
    channelId,
    emitVoiceState,
    nextClientId,
    isDeafened,
    isMuted,
    markRemoteUserOffline,
    performLeave,
    refreshDevices,
    scheduleTokenRenewal,
    selectedMicrophoneId,
    setConnectionStatus,
    subscribeRemoteUser,
  ])

  const toggleMute = useCallback(async () => {
    const next = !isMuted
    setIsMuted(next)
    updateLocalParticipant({ isMuted: next, isSpeaking: next ? false : undefined })
    await localAudioTrackRef.current?.setEnabled?.(!next)
    emitVoiceState({ muted: next, speaking: next ? false : undefined })
  }, [emitVoiceState, isMuted, updateLocalParticipant])

  const toggleDeafen = useCallback(() => {
    const next = !isDeafened
    setIsDeafened(next)
    updateLocalParticipant({ isDeafened: next })
    for (const track of remoteAudioTracksRef.current.values()) {
      if (next) track.stop?.()
      else {
        const playbackDeviceId = agoraDeviceId(selectedSpeakerId)
        if (playbackDeviceId && typeof track.setPlaybackDevice === 'function') {
          void track.setPlaybackDevice(playbackDeviceId).catch(() => undefined)
        }
        track.play?.()
      }
    }
    emitVoiceState({ deafened: next })
  }, [emitVoiceState, isDeafened, selectedSpeakerId, updateLocalParticipant])

  const setMicrophoneDevice = useCallback(
    async (deviceId: string) => {
      setSelectedMicrophoneId(deviceId)
      storeVoiceDevice(VOICE_MICROPHONE_DEVICE_KEY, deviceId)
      await replacePublishedMicrophone(deviceId)
    },
    [replacePublishedMicrophone],
  )

  const setSpeakerDevice = useCallback(
    async (deviceId: string) => {
      setSelectedSpeakerId(deviceId)
      storeVoiceDevice(VOICE_SPEAKER_DEVICE_KEY, deviceId)
      await applySpeakerDevice(deviceId)
    },
    [applySpeakerDevice],
  )

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
    screenShareOperationRef.current += 1
    closeLocalMediaTrack(localScreenTrackRef.current)
    localScreenTrackRef.current = null
    setLocalScreenTrack(null)
    await screenClientRef.current?.leave().catch(() => undefined)
    screenClientRef.current = null
    setIsScreenSharing(false)
    updateLocalParticipant({ isScreenSharing: false })
    emitVoiceState({ screenSharing: false })
  }, [emitVoiceState, updateLocalParticipant])

  const startScreenShare = useCallback(async () => {
    const credentials = credentialsRef.current
    if (!credentials || isScreenSharing) return
    const screenShareOperationId = ++screenShareOperationRef.current
    const assertScreenShareActive = () => {
      if (
        screenShareOperationRef.current !== screenShareOperationId ||
        statusRef.current !== 'connected'
      ) {
        throw new VoiceOperationCancelledError()
      }
    }
    setError(null)
    setErrorKey(null)
    let screenTrack: any = null
    let screenClient: ReturnType<typeof AgoraRTC.createClient> | null = null
    try {
      assertScreenShareActive()
      assertScreenCaptureAllowed()
      const trackResult = await AgoraRTC.createScreenVideoTrack(
        { encoderConfig: '1080p_1' },
        'disable',
      )
      screenTrack = Array.isArray(trackResult) ? trackResult[0] : trackResult
      assertScreenShareActive()
      localScreenTrackRef.current = screenTrack
      screenTrack.on?.('track-ended', () => void stopScreenShare())

      screenClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
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
      assertScreenShareActive()
      await screenClient.publish([screenTrack])
      assertScreenShareActive()
      setLocalScreenTrack(screenTrack)
      setRemoteScreens((prev) =>
        prev.filter((screen) => Number(screen.uid) !== credentials.screenUid),
      )
      setIsScreenSharing(true)
      updateLocalParticipant({ isScreenSharing: true })
      emitVoiceState({ screenSharing: true })
    } catch (err) {
      const cancelled = isVoiceOperationCancelled(err)
      const message = err instanceof Error ? err.message : 'Failed to share screen'
      const ownsCurrentScreenTrack = localScreenTrackRef.current === screenTrack
      const shouldClearShareState =
        ownsCurrentScreenTrack ||
        screenShareOperationRef.current === screenShareOperationId ||
        statusRef.current !== 'connected'
      if (ownsCurrentScreenTrack) {
        closeLocalMediaTrack(localScreenTrackRef.current)
        localScreenTrackRef.current = null
        setLocalScreenTrack(null)
      }
      if (screenClient) {
        await screenClient.leave().catch(() => undefined)
      }
      if (screenClient && screenClientRef.current === screenClient) {
        screenClientRef.current = null
      }
      if (shouldClearShareState) {
        setIsScreenSharing(false)
        updateLocalParticipant({ isScreenSharing: false })
        if (!cancelled) {
          setError(message)
          setErrorKey(screenShareErrorKey(err))
        }
        emitVoiceState({ screenSharing: false })
      }
      closeLocalMediaTrack(screenTrack)
    }
  }, [emitVoiceState, isScreenSharing, stopScreenShare, updateLocalParticipant])

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
    if (!deviceDiscoveryEnabled) return undefined
    void refreshDevices()
    const agoraDeviceEvents = AgoraRTC as typeof AgoraRTC & {
      onMicrophoneChanged?: (info: unknown) => void
      onPlaybackDeviceChanged?: (info: unknown) => void
    }
    const previousMicrophoneChanged = agoraDeviceEvents.onMicrophoneChanged
    const previousPlaybackDeviceChanged = agoraDeviceEvents.onPlaybackDeviceChanged
    agoraDeviceEvents.onMicrophoneChanged = () => {
      void refreshDevices()
    }
    agoraDeviceEvents.onPlaybackDeviceChanged = () => {
      void refreshDevices()
    }
    if (typeof navigator === 'undefined') {
      return () => {
        agoraDeviceEvents.onMicrophoneChanged = previousMicrophoneChanged
        agoraDeviceEvents.onPlaybackDeviceChanged = previousPlaybackDeviceChanged
      }
    }
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.addEventListener) {
      return () => {
        agoraDeviceEvents.onMicrophoneChanged = previousMicrophoneChanged
        agoraDeviceEvents.onPlaybackDeviceChanged = previousPlaybackDeviceChanged
      }
    }
    const onDeviceChange = () => {
      void refreshDevices()
    }
    mediaDevices.addEventListener('devicechange', onDeviceChange)
    return () => {
      agoraDeviceEvents.onMicrophoneChanged = previousMicrophoneChanged
      agoraDeviceEvents.onPlaybackDeviceChanged = previousPlaybackDeviceChanged
      mediaDevices.removeEventListener('devicechange', onDeviceChange)
    }
  }, [deviceDiscoveryEnabled, refreshDevices])

  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return undefined
    if (status !== 'connected') {
      void wakeLockRef.current?.release().catch(() => undefined)
      wakeLockRef.current = null
      return undefined
    }

    let disposed = false
    const requestWakeLock = async () => {
      const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock
      if (!wakeLock || document.visibilityState !== 'visible') return
      try {
        const sentinel = await wakeLock.request('screen')
        if (disposed) {
          await sentinel.release().catch(() => undefined)
          return
        }
        wakeLockRef.current = sentinel
      } catch {
        // Screen Wake Lock is unavailable on some browsers; voice still works while visible.
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        void requestWakeLock()
      }
    }

    void requestWakeLock()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void wakeLockRef.current?.release().catch(() => undefined)
      wakeLockRef.current = null
    }
  }, [status])

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
    participants: displayedParticipants,
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
