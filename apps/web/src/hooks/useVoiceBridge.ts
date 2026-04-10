import AgoraRTC, {
  ILocalAudioTrack,
  ILocalVideoTrack,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng'
import { useCallback, useEffect, useRef } from 'react'
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
 *   3. Creates & publishes audio track, subscribes to remote users
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
  }, [])

  // ── Internal: connect to Agora (no Socket.IO) ────────────────────
  const connectAgora = useCallback(
    async (channelId: string, channelName: string) => {
      try {
        store.setError(null)

        // ⚠️ Disconnect existing client before creating a new one.
        // Prevents leaking the old client when switching channels.
        // The cleanup effect also calls disconnectAgora, but that races
        // with this async function — doing it here first is safest.
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
        // If a user is already publishing when we join, their user-published
        // event fires during join() — we must have listeners ready.
        client.on('user-published', async (remoteUser, mediaType) => {
          await client.subscribe(remoteUser, mediaType)
          if (mediaType === 'audio') {
            remoteUser.audioTrack?.play()
          }
          // Note: uid→userId mapping is registered in voice:user-joined handler,
          // which receives the actual userId. We can't register it here because
          // remoteUser.uid is a number, not a userId.
        })

        client.on('user-unpublished', async (remoteUser, mediaType) => {
          if (mediaType === 'audio') {
            remoteUser.audioTrack?.stop()
          }
        })

        // Join channel (may trigger user-published for existing users)
        await client.join(tokenInfo.appId, tokenInfo.channelName, tokenInfo.token, tokenInfo.uid)

        // Create & publish local audio track (triggers mic permission)
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: 'music_standard',
        })
        localAudioRef.current = audioTrack
        await client.publish(audioTrack)

        // Volume indicator for speaking ring animation
        client.enableAudioVolumeIndicator()
        client.on('volume-indicator', (volumes) => {
          for (const v of volumes) {
            if (v.uid !== 0 && v.uid !== tokenInfo.uid) {
              store.updateVolume(Number(v.uid), v.level)
            }
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
    [store, disconnectAgora],
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

  // ── Mute (controls actual Agora track + syncs via Socket.IO) ────
  const toggleMute = useCallback(async () => {
    const track = localAudioRef.current
    if (!track) return
    // Use setEnabled() — the proper Agora API for toggling track state.
    // Directly setting .enabled does not trigger internal Agora events
    // and can cause the remote side to not receive audio.
    const isCurrentlyEnabled = track.enabled
    try {
      await track.setEnabled(!isCurrentlyEnabled)
      store.setMuted(isCurrentlyEnabled)
    } catch (err) {
      // If setEnable fails, don't update store state
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
          // Re-enter to stop
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
              // Force reset refs on error to avoid stale state
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
      // Force reset refs on error
      screenVideoRef.current = null
      screenAudioRef.current = null
      store.setScreenSharing(false)
    }
  }, [store])

  // ── Expose joinChannel for manual sidebar use ────────────────────
  const joinChannel = useCallback(
    async (channelId: string, channelName: string) => {
      store.joinChannel(channelId, channelName)
    },
    [store],
  )

  // ── Cleanup on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      localAudioRef.current?.close()
      screenVideoRef.current?.close()
      screenAudioRef.current?.close()
      agoraClientRef.current?.leave()
      agoraChannelIdRef.current = null
    }
  }, [])

  return {
    joinChannel,
    leaveAgora,
    toggleMute,
    toggleScreenShare,
  }
}
