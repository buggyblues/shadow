import AgoraRTC, {
  ILocalAudioTrack,
  ILocalVideoTrack,
  IMicrophoneAudioTrack,
  IRemoteVideoTrack,
} from 'agora-rtc-sdk-ng'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSocketEvent } from '@/hooks/use-socket'
import { fetchApi } from '@/lib/api'
import { useVoiceStore } from '@/stores/voice.store'

/**
 * useVoiceBridge — bridges Socket.IO signaling with Agora RTC.
 *
 * Architecture:
 *   - Socket.IO signaling is driven by the store (sidebar calls store.joinChannel)
 *   - This hook watches store.activeChannelId and connects/disconnects Agora automatically
 *   - Socket.IO event listeners update the store (single source of truth)
 *
 * Flow on join:
 *   1. Sidebar → store.joinChannel() → Socket.IO voice:join
 *   2. This hook sees activeChannelId change → fetches Agora token → joins RTC
 *   3. Creates & publishes audio track (or listen-only if mic denied), subscribes to remote users
 *
 * Syncs mute/screenshare between both layers automatically.
 */
export function useVoiceBridge() {
  const store = useVoiceStore()
  const activeChannelId = useVoiceStore((s) => s.activeChannelId)
  const activeChannelName = useVoiceStore((s) => s.activeChannelName)

  const agoraClientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null)
  const localAudioRef = useRef<IMicrophoneAudioTrack | null>(null)
  const screenVideoRef = useRef<ILocalVideoTrack | null>(null)
  const screenAudioRef = useRef<ILocalAudioTrack | null>(null)
  const agoraChannelIdRef = useRef<string | null>(null)

  // ── Remote screen share state ─────────────────────────────────────
  const [screenSharerId, setScreenSharerId] = useState<string | null>(null)
  const [screenShareTrack, setScreenShareTrack] = useState<IRemoteVideoTrack | null>(null)

  // ── Socket.IO signaling events (single source of listeners) ──────
  useSocketEvent(
    'voice:user-joined',
    (data: { userId: string; username: string; displayName: string; agoraUid?: number }) => {
      const state = useVoiceStore.getState()
      state.updateMembers([
        ...state.members,
        {
          userId: data.userId,
          username: data.username,
          displayName: data.displayName,
          muted: false,
          screenSharing: false,
          joinedAt: new Date().toISOString(),
          volume: 0,
        },
      ])
      // Register agoraUid → userId mapping for volume indicator
      if (data.agoraUid && data.agoraUid !== 0) {
        store.registerUidMapping(data.agoraUid, data.userId)
      }
    },
  )

  useSocketEvent('voice:user-left', (data: { userId: string }) => {
    const state = useVoiceStore.getState()
    state.updateMembers(state.members.filter((m) => m.userId !== data.userId))
    // If the leaving user was screen sharing, clean up
    if (screenSharerId === data.userId) {
      setScreenSharerId(null)
      setScreenShareTrack(null)
    }
  })

  useSocketEvent('voice:user-muted', (data: { userId: string; muted: boolean }) => {
    const state = useVoiceStore.getState()
    state.updateMembers(
      state.members.map((m) => (m.userId === data.userId ? { ...m, muted: data.muted } : m)),
    )
  })

  useSocketEvent('voice:screenshare-started', (data: { userId: string }) => {
    const state = useVoiceStore.getState()
    state.updateMembers(
      state.members.map((m) => (m.userId === data.userId ? { ...m, screenSharing: true } : m)),
    )
  })

  useSocketEvent('voice:screenshare-stopped', (data: { userId: string }) => {
    const state = useVoiceStore.getState()
    state.updateMembers(
      state.members.map((m) => (m.userId === data.userId ? { ...m, screenSharing: false } : m)),
    )
    // If the user who stopped was the current screen sharer, clean up
    if (screenSharerId === data.userId) {
      setScreenSharerId(null)
      setScreenShareTrack(null)
    }
  })

  // ── Internal: disconnect from Agora (no Socket.IO) ───────────────
  const disconnectAgora = useCallback(async () => {
    try {
      localAudioRef.current?.close()
      localAudioRef.current = null
      screenVideoRef.current?.close()
      screenVideoRef.current = null
      screenAudioRef.current?.close()
      screenAudioRef.current = null
      await agoraClientRef.current?.leave()
      agoraClientRef.current?.removeAllListeners()
      agoraClientRef.current = null
    } catch {
      // Non-critical
    }
    agoraChannelIdRef.current = null
    setScreenSharerId(null)
    setScreenShareTrack(null)
  }, [])

  // ── Internal: connect to Agora (no Socket.IO) ────────────────────
  const connectAgora = useCallback(
    async (channelId: string, channelName: string) => {
      try {
        store.setError(null)

        // ⚠️ Disconnect existing client before creating a new one.
        if (agoraClientRef.current) {
          await disconnectAgora()
        }

        // Fetch Agora token
        const tokenInfo: {
          appId: string
          channelName: string
          uid: number
          token: string
          expireAt: number
        } = await fetchApi(`/api/channels/${channelId}/rtc-join`, { method: 'POST' })

        // Register uid mapping for local user
        store.registerUidMapping(tokenInfo.uid, 'local')

        // Create Agora client
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
        agoraClientRef.current = client

        // Keep console logs for debugging
        AgoraRTC.setLogLevel(1) // 1 = INFO, WARNING, ERROR

        // ⚠️ CRITICAL: Register remote user event handlers BEFORE join.
        // uid→userId mapping is provided by voice:user-joined (Socket.IO),
        // which receives the real userId + agoraUid from the server.
        client.on('user-published', async (remoteUser, mediaType) => {
          await client.subscribe(remoteUser, mediaType)
          if (mediaType === 'audio') {
            remoteUser.audioTrack?.play()
          }
          if (mediaType === 'video') {
            // Remote user is screen sharing — track it for viewer
            setScreenSharerId(remoteUser.uid.toString())
            setScreenShareTrack(remoteUser.videoTrack)
          }
        })

        client.on('user-unpublished', async (remoteUser, mediaType) => {
          if (mediaType === 'audio') {
            remoteUser.audioTrack?.stop()
          }
          if (mediaType === 'video') {
            // Remote user stopped screen sharing
            if (screenSharerId === remoteUser.uid.toString()) {
              setScreenSharerId(null)
              setScreenShareTrack(null)
            }
          }
        })

        // Join channel (may trigger user-published for existing users)
        await client.join(tokenInfo.appId, tokenInfo.channelName, tokenInfo.token, tokenInfo.uid)

        // Create & publish local audio track
        // ⚠️ If mic permission is denied, join as listen-only mode
        let canSpeak = true
        try {
          const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: 'music_standard',
          })
          localAudioRef.current = audioTrack
          await client.publish(audioTrack)
        } catch (err) {
          // Permission denied or no mic available → listen-only mode
          // Still allow the user to hear others
          canSpeak = false
          const message =
            err instanceof Error && err.name === 'NotAllowedError'
              ? '麦克风权限被拒绝，已加入为只听模式'
              : '无法访问麦克风，已加入为只听模式'
          store.setError(message)
        }
        store.setCanSpeak(canSpeak)
        // Auto-set muted if can't speak
        if (!canSpeak) {
          store.setMuted(true)
        }

        // Volume indicator for speaking ring animation
        // Fires every 2 seconds with volume levels for all users in the channel.
        // uid→userId mapping is provided by voice:user-joined (Socket.IO) which
        // receives the real userId + agoraUid from the server.
        client.enableAudioVolumeIndicator()
        client.on('volume-indicator', (volumes) => {
          for (const v of volumes) {
            if (v.uid === 0 || v.uid === tokenInfo.uid) continue
            const uidNum = Number(v.uid)
            store.updateVolume(uidNum, v.level)
          }
        })

        agoraChannelIdRef.current = channelId
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to join voice channel'
        store.setError(message)
        agoraChannelIdRef.current = null
        // Clean up on failure
        try {
          localAudioRef.current?.close()
          localAudioRef.current = null
          await agoraClientRef.current?.leave()
          agoraClientRef.current?.removeAllListeners()
          agoraClientRef.current = null
        } catch {
          // Non-critical
        }
      }
    },
    [store, disconnectAgora, screenSharerId],
  )

  // ── Auto-connect/disconnect Agora when store activeChannelId changes
  useEffect(() => {
    // Already connected to this channel?
    if (agoraChannelIdRef.current === activeChannelId) return

    // Left channel?
    if (!activeChannelId || !activeChannelName) {
      disconnectAgora()
      return
    }

    // Joining a new channel — connect Agora (Socket.IO already done by store)
    connectAgora(activeChannelId, activeChannelName)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId, activeChannelName])

  // ── Leave (Agora cleanup + Socket.IO leave) ──────────────────────
  const leaveAgora = useCallback(async () => {
    await disconnectAgora()
    // Signal leave via store (Socket.IO voice:leave)
    store.leaveChannel()
  }, [disconnectAgora, store])

  // ── Retry Microphone (listen-only → can speak) ────────────────
  const retryMicrophone = useCallback(async () => {
    const client = agoraClientRef.current
    if (!client || localAudioRef.current) return

    try {
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: 'music_standard',
      })
      localAudioRef.current = audioTrack
      await client.publish(audioTrack)
      store.setCanSpeak(true)
      store.setMuted(false)
      store.setError(null)
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'NotAllowedError'
          ? '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问'
          : `无法访问麦克风: ${err instanceof Error ? err.message : '未知错误'}`
      store.setError(message)
    }
  }, [store])

  // ── Mute (controls actual Agora track + syncs via Socket.IO) ────
  const toggleMute = useCallback(async () => {
    const track = localAudioRef.current
    if (!track) return
    const isCurrentlyEnabled = track.enabled
    try {
      await track.setEnabled(!isCurrentlyEnabled)
      store.setMuted(isCurrentlyEnabled)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to toggle mute'
      store.setError(message)
    }
  }, [store])

  // ── Screen Share (Agora screen tracks + Socket.IO sync) ─────────
  const toggleScreenShare = useCallback(async () => {
    const client = agoraClientRef.current
    if (!client) return

    try {
      if (screenVideoRef.current) {
        // Stop screen sharing
        await client.unpublish(screenVideoRef.current)
        screenVideoRef.current.stop()
        screenVideoRef.current.close()
        screenVideoRef.current = null

        if (screenAudioRef.current) {
          await client.unpublish(screenAudioRef.current)
          screenAudioRef.current.stop()
          screenAudioRef.current.close()
          screenAudioRef.current = null
        }

        store.setScreenSharing(false)
      } else {
        // Start screen sharing
        const screenTrack = await AgoraRTC.createScreenVideoTrack(
          { encoderConfig: '1080p', optimizationMode: 'detail' },
          'auto',
        )

        if (Array.isArray(screenTrack)) {
          const [videoTrack, audioTrack] = screenTrack
          await client.publish([videoTrack, audioTrack])
          screenVideoRef.current = videoTrack
          screenAudioRef.current = audioTrack
        } else {
          await client.publish(screenTrack)
          screenVideoRef.current = screenTrack
        }

        store.setScreenSharing(true)

        // Handle browser-native stop button
        const videoTrack = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack
        const stopHandler = () => {
          void (async () => {
            try {
              if (screenVideoRef.current && agoraClientRef.current) {
                await agoraClientRef.current.unpublish(screenVideoRef.current)
                screenVideoRef.current.stop()
                screenVideoRef.current.close()
                screenVideoRef.current = null
                if (screenAudioRef.current) {
                  await agoraClientRef.current.unpublish(screenAudioRef.current)
                  screenAudioRef.current.stop()
                  screenAudioRef.current.close()
                  screenAudioRef.current = null
                }
                store.setScreenSharing(false)
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Failed to stop screen share'
              store.setError(message)
              screenVideoRef.current = null
              screenAudioRef.current = null
              store.setScreenSharing(false)
            }
          })()
        }
        videoTrack.on('track-ended', stopHandler)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to toggle screen share'
      store.setError(message)
      screenVideoRef.current = null
      screenAudioRef.current = null
      store.setScreenSharing(false)
    }
  }, [store])

  // ── Device management for settings ───────────────────────────────
  const getMicrophones = useCallback(async () => {
    return AgoraRTC.getMicrophones()
  }, [])

  const getPlaybackDevices = useCallback(async () => {
    return AgoraRTC.getPlaybackDevices()
  }, [])

  const setMicrophoneDevice = useCallback(async (deviceId: string) => {
    const track = localAudioRef.current
    if (track) {
      await track.setDevice(deviceId)
    }
  }, [])

  // ── Cleanup on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      localAudioRef.current?.close()
      screenVideoRef.current?.close()
      screenAudioRef.current?.close()
      agoraClientRef.current?.leave()
    }
  }, [])

  return {
    leaveAgora,
    toggleMute,
    toggleScreenShare,
    retryMicrophone,
    // Device management
    getMicrophones,
    getPlaybackDevices,
    setMicrophoneDevice,
    // Screen share state
    screenSharerId,
    screenShareTrack,
  }
}
