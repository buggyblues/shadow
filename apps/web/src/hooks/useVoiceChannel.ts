import AgoraRTC, {
  IAgoraRTCClient,
  ICameraVideoTrack,
  ILocalAudioTrack,
  ILocalVideoTrack,
  IMicrophoneAudioTrack,
  UID,
} from 'agora-rtc-sdk-ng'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RTC_APP_ID, RTC_ENABLED } from '@/lib/rtc.config'
import { useVoiceStore } from '@/stores/voice.store'

export interface VoiceChannelUser {
  uid: UID
  isLocal: boolean
  hasAudio: boolean
  hasVideo: boolean
  isScreenShare?: boolean
}

export interface UseVoiceChannelOptions {
  /** Enable microphone on join */
  enableAudio?: boolean
  /** Enable camera on join (default: false for voice channels) */
  enableVideo?: boolean
  /** Auto subscribe to remote tracks */
  autoSubscribe?: boolean
}

export function useVoiceChannel(options: UseVoiceChannelOptions = {}) {
  const { enableAudio = true, enableVideo = false, autoSubscribe = true } = options

  const clientRef = useRef<IAgoraRTCClient | null>(null)
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null)
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null)

  // Screen sharing tracks — can be [videoTrack, audioTrack] or just videoTrack
  const screenVideoTrackRef = useRef<ILocalVideoTrack | null>(null)
  const screenAudioTrackRef = useRef<ILocalAudioTrack | null>(null)

  const [joined, setJoined] = useState(false)
  const [channelId, setChannelId] = useState<string | null>(null)
  const [users, setUsers] = useState<VoiceChannelUser[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([])

  const uidRef = useRef<UID>(0)

  /**
   * Setup device hot-plug listeners.
   * Matches official demo: AgoraRTC.onMicrophoneChanged / onCameraChanged
   */
  useEffect(() => {
    const handleMicChanged = async (changedDevice: {
      state: 'ACTIVE' | 'RELEASED'
      device: { deviceId: string; label: string }
    }) => {
      const track = localAudioTrackRef.current
      if (!track) return

      if (changedDevice.state === 'ACTIVE') {
        // New device plugged in — switch to it
        await track.setDevice(changedDevice.device.deviceId)
      } else if (changedDevice.device.label === track.getTrackLabel()) {
        // Current device unplugged — switch to first available
        const oldMicrophones = await AgoraRTC.getMicrophones()
        if (oldMicrophones[0]) {
          await track.setDevice(oldMicrophones[0].deviceId)
        }
      }
    }

    const handleCamChanged = async (changedDevice: {
      state: 'ACTIVE' | 'RELEASED'
      device: { deviceId: string; label: string }
    }) => {
      const track = localVideoTrackRef.current
      if (!track) return

      if (changedDevice.state === 'ACTIVE') {
        await track.setDevice(changedDevice.device.deviceId)
      } else if (changedDevice.device.label === track.getTrackLabel()) {
        const oldCameras = await AgoraRTC.getCameras()
        if (oldCameras[0]) {
          await track.setDevice(oldCameras[0].deviceId)
        }
      }
    }

    AgoraRTC.onMicrophoneChanged = handleMicChanged
    AgoraRTC.onCameraChanged = handleCamChanged

    return () => {
      AgoraRTC.onMicrophoneChanged = undefined
      AgoraRTC.onCameraChanged = undefined
    }
  }, [])

  /**
   * Enumerate audio/speaker devices
   */
  const enumerateDevices = useCallback(async () => {
    const devices = await AgoraRTC.getMicrophones()
    const speakers = await AgoraRTC.getPlaybackDevices()
    setAudioDevices(devices)
    setSpeakerDevices(speakers)
  }, [])

  /**
   * Stop and close all local tracks.
   */
  const closeAllTracks = useCallback(() => {
    // Microphone audio track
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.stop()
      localAudioTrackRef.current.close()
      localAudioTrackRef.current = null
    }

    // Camera video track
    if (localVideoTrackRef.current) {
      localVideoTrackRef.current.stop()
      localVideoTrackRef.current.close()
      localVideoTrackRef.current = null
    }

    // Screen sharing video track
    if (screenVideoTrackRef.current) {
      screenVideoTrackRef.current.stop()
      screenVideoTrackRef.current.close()
      screenVideoTrackRef.current = null
    }

    // Screen sharing audio track (system audio)
    if (screenAudioTrackRef.current) {
      screenAudioTrackRef.current.stop()
      screenAudioTrackRef.current.close()
      screenAudioTrackRef.current = null
    }
  }, [])

  /**
   * Join a voice channel
   */
  const join = useCallback(
    async (channel: string, token?: string | null, userId?: string) => {
      if (!RTC_ENABLED) {
        setError('RTC App ID not configured')
        return
      }

      try {
        setError(null)

        // Create client — matches official demo config
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
        clientRef.current = client

        // Generate numeric uid from userId string
        const uid = userId
          ? Math.abs([...userId].reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0))
          : 0

        uidRef.current = uid

        // Join the channel — matches official demo: client.join(appid, channel, token, uid)
        await client.join(RTC_APP_ID, channel, token ?? null, uid || null)

        // Create and publish local audio track
        // encoderConfig: "music_standard" — matches official demo for better audio quality
        if (enableAudio) {
          const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: 'music_standard',
          })
          localAudioTrackRef.current = audioTrack
          await client.publish(audioTrack)
        }

        // Optionally create and publish local video track
        if (enableVideo) {
          const videoTrack = await AgoraRTC.createCameraVideoTrack()
          localVideoTrackRef.current = videoTrack
          await client.publish(videoTrack)
        }

        setJoined(true)
        setChannelId(channel)

        // ── Remote user event handlers ──────────────────────────────
        // Matches official demo: client.on("user-published", handleUserPublished)

        client.on('user-published', async (remoteUser, mediaType) => {
          if (autoSubscribe) {
            await client.subscribe(remoteUser, mediaType)
          }

          if (mediaType === 'audio') {
            remoteUser.audioTrack?.play()
          }

          setUsers((prev) => {
            const existing = prev.find((u) => u.uid === remoteUser.uid)
            if (existing) return prev
            return [
              ...prev,
              {
                uid: remoteUser.uid,
                isLocal: false,
                hasAudio: !!remoteUser.audioTrack,
                hasVideo: !!remoteUser.videoTrack,
              },
            ]
          })
        })

        client.on('user-unpublished', async (remoteUser, mediaType) => {
          if (mediaType === 'audio') {
            remoteUser.audioTrack?.stop()
          }

          setUsers((prev) =>
            prev.map((u) =>
              u.uid === remoteUser.uid
                ? {
                    ...u,
                    hasAudio: mediaType === 'audio' ? false : u.hasAudio,
                    hasVideo: mediaType === 'video' ? false : u.hasVideo,
                  }
                : u,
            ),
          )
        })

        client.on('user-left', (remoteUser) => {
          setUsers((prev) => prev.filter((u) => u.uid !== remoteUser.uid))
        })

        // Enable volume indicator for speaking detection
        client.enableAudioVolumeIndicator()
        client.on('volume-indicator', (volumes) => {
          for (const v of volumes) {
            if (v.uid !== 0) {
              const store = useVoiceStore.getState()
              store.updateVolume(Number(v.uid), v.level)
            }
          }
          // volumes: Array<{ uid, level, speechLevel }>
          // level: 0-100, can be used for speaking ring animation
        })

        await enumerateDevices()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to join voice channel'
        setError(message)
        throw err
      }
    },
    [enableAudio, enableVideo, autoSubscribe, enumerateDevices],
  )

  /**
   * Leave the voice channel — matches official demo pattern:
   * 1. Stop and close ALL local tracks (mic, camera, screen video, screen audio)
   * 2. Leave the channel
   * 3. Clear all state
   */
  const leave = useCallback(async () => {
    try {
      // Step 1: Stop and close all local tracks to prevent resource leaks
      closeAllTracks()

      // Step 2: Leave the channel and remove all event listeners
      if (clientRef.current) {
        await clientRef.current.leave()
        clientRef.current.removeAllListeners()
        clientRef.current = null
      }

      // Step 3: Reset state
      setJoined(false)
      setChannelId(null)
      setUsers([])
      setIsMuted(false)
      setIsScreenSharing(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to leave voice channel'
      setError(message)
    }
  }, [closeAllTracks])

  /**
   * Toggle mute/unmute microphone — matches official demo: track.enabled = false
   */
  const toggleMute = useCallback(() => {
    const track = localAudioTrackRef.current
    if (!track) return

    const newMuted = !track.enabled
    track.enabled = !newMuted
    setIsMuted(newMuted)
  }, [])

  /**
   * Switch audio input device — matches official demo: track.setDevice(deviceId)
   */
  const switchAudioDevice = useCallback(async (deviceId: string) => {
    const track = localAudioTrackRef.current
    if (!track) return
    await track.setDevice(deviceId)
  }, [])

  /**
   * Switch speaker device
   */
  const switchSpeaker = useCallback(async (deviceId: string) => {
    const track = localAudioTrackRef.current
    if (!track) return
    await track.setPlaybackDevice(deviceId)
  }, [])

  /**
   * Start screen sharing — matches official demo pattern:
   * - createScreenVideoTrack() can return ILocalVideoTrack | [ILocalVideoTrack, ILocalAudioTrack]
   * - When array: [0] is video track, [1] is system audio track
   * - Must publish BOTH tracks
   * - Must close BOTH tracks when stopping
   */
  const startScreenShare = useCallback(async () => {
    const client = clientRef.current
    if (!client || !joined) return

    try {
      const screenTrack = await AgoraRTC.createScreenVideoTrack(
        {
          encoderConfig: '1080p',
          optimizationMode: 'detail',
        },
        'auto',
      )

      if (Array.isArray(screenTrack)) {
        // screenTrack = [videoTrack, audioTrack] — user chose to share system audio
        const [videoTrack, audioTrack] = screenTrack
        await client.publish([videoTrack, audioTrack])
        screenVideoTrackRef.current = videoTrack
        screenAudioTrackRef.current = audioTrack

        // Handle user stopping screen share from browser UI
        videoTrack.on('track-ended', () => {
          stopScreenShare()
        })
      } else {
        // screenTrack = videoTrack only — no system audio
        await client.publish(screenTrack)
        screenVideoTrackRef.current = screenTrack

        screenTrack.on('track-ended', () => {
          stopScreenShare()
        })
      }

      setIsScreenSharing(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start screen sharing'
      setError(message)
      throw err
    }
  }, [joined])

  /**
   * Stop screen sharing — MUST close both video AND audio tracks
   */
  const stopScreenShare = useCallback(async () => {
    const client = clientRef.current
    if (!client) return

    try {
      // Unpublish and close video track
      if (screenVideoTrackRef.current) {
        await client.unpublish(screenVideoTrackRef.current)
        screenVideoTrackRef.current.stop()
        screenVideoTrackRef.current.close()
        screenVideoTrackRef.current = null
      }

      // Unpublish and close audio track (system audio)
      if (screenAudioTrackRef.current) {
        await client.unpublish(screenAudioTrackRef.current)
        screenAudioTrackRef.current.stop()
        screenAudioTrackRef.current.close()
        screenAudioTrackRef.current = null
      }

      setIsScreenSharing(false)
    } catch {
      // Ignore errors during cleanup
    }
  }, [])

  /**
   * Cleanup on unmount — ensure no resource leaks
   */
  useEffect(() => {
    return () => {
      closeAllTracks()
      if (clientRef.current) {
        clientRef.current.removeAllListeners()
      }
    }
  }, [closeAllTracks])

  return {
    joined,
    channelId,
    users,
    isMuted,
    isScreenSharing,
    error,
    audioDevices,
    speakerDevices,
    join,
    leave,
    toggleMute,
    switchAudioDevice,
    switchSpeaker,
    startScreenShare,
    stopScreenShare,
    enumerateDevices,
  }
}
