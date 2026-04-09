import AgoraRTC from 'agora-rtc-sdk-ng'
import { Mic, MicOff, Monitor, MonitorOff, PhoneOff, Volume2 } from 'lucide-react'
import { useEffect } from 'react'
import { useSocketEvent } from '@/hooks/use-socket'
import { useVoiceStore } from '@/stores/voice.store'

// Threshold for "speaking" state based on Agora volume indicator (0-100)
const SPEAKING_THRESHOLD = 20

/**
 * Voice Channel Panel — Discord-style voice panel at the bottom of sidebar.
 *
 * Shows:
 * - Connected channel name with glass surface
 * - Member list with avatars, speaking indicators (green ring), and status icons
 * - Bottom control bar: Mic, Screen Share, Disconnect
 *
 * Design: Neon Frost + Discord UX patterns
 */
export function VoiceChannel() {
  const { activeChannelId, activeChannelName, members, isMuted, isScreenSharing, error } =
    useVoiceStore()
  const leaveChannel = useVoiceStore((s) => s.leaveChannel)
  const setMuted = useVoiceStore((s) => s.setMuted)
  const setScreenSharing = useVoiceStore((s) => s.setScreenSharing)
  const updateVolume = useVoiceStore((s) => s.updateVolume)

  // ── Socket.IO event listeners ────────────────────────────────────
  useSocketEvent(
    'voice:user-joined',
    (data: { userId: string; username: string; displayName: string }) => {
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

  // ── Agora volume indicator for speaking ring animation ───────────
  // Listens to AgoraRTC global volume indicator and updates store
  useEffect(() => {
    const handleVolumeIndicator = (volumes: { uid: number; level: number }[]) => {
      for (const v of volumes) {
        if (v.uid !== 0) {
          // uid 0 is local user, skip for remote detection
          updateVolume(v.uid, v.level)
        }
      }
    }

    // Register global listener
    const handler = (volumes: { uid: number; level: number }[]) => {
      handleVolumeIndicator(volumes)
    }

    AgoraRTC.onMicrophoneChanged = undefined
    AgoraRTC.on('volume-indicator', handler)

    return () => {
      AgoraRTC.off('volume-indicator', handler)
    }
  }, [updateVolume])

  if (!activeChannelId) return null

  return (
    <div className="border-t border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
      {/* Error banner */}
      {error && (
        <div className="px-3 py-1.5 text-xs text-[#FF2A55] bg-[#FF2A55]/5 border-b border-[#FF2A55]/10">
          {error}
        </div>
      )}

      {/* Channel header — glass surface */}
      <div className="px-3 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#00F3FF]/10 flex items-center justify-center">
            <Volume2 className="h-3.5 w-3.5 text-[#00F3FF]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-white truncate">{activeChannelName}</p>
            <p className="text-[11px] text-white/40">{members.length + 1} 人已连接</p>
          </div>
        </div>
      </div>

      {/* Member list — Discord style */}
      <div className="px-2 py-1.5 max-h-[160px] overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {/* Current user (self) */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group">
          <div className="relative">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-150 ${
                !isMuted
                  ? 'bg-gradient-to-br from-[#00F3FF]/30 to-[#00c6d1]/20 text-[#00F3FF]'
                  : 'bg-white/5 text-white/30'
              }`}
            >
              我
            </div>
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a0a0f] ${
                isMuted ? 'bg-white/20' : 'bg-[#00E676]'
              }`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-white truncate">你</p>
          </div>
          {isMuted && <MicOff className="h-3 w-3 text-white/30" />}
          {isScreenSharing && <Monitor className="h-3 w-3 text-[#00F3FF]/60" />}
        </div>

        {/* Remote members */}
        {members.map((m) => {
          const initials = (m.displayName || m.username).slice(0, 2).toUpperCase()
          const isSpeaking = !m.muted && m.volume > SPEAKING_THRESHOLD

          return (
            <div
              key={m.userId}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <div className="relative">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-150 ${
                    isSpeaking
                      ? 'bg-gradient-to-br from-[#00E676]/30 to-[#00E676]/10 text-[#00E676] ring-2 ring-[#00E676]/40'
                      : 'bg-white/5 text-white/40'
                  }`}
                >
                  {initials}
                </div>
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a0a0f] ${
                    m.muted ? 'bg-white/20' : 'bg-[#00E676]'
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-[12px] font-medium truncate transition-colors ${
                    isSpeaking ? 'text-white' : 'text-white/50'
                  }`}
                >
                  {m.displayName || m.username}
                </p>
              </div>
              {m.muted && <MicOff className="h-3 w-3 text-white/30" />}
              {m.screenSharing && <Monitor className="h-3 w-3 text-[#00F3FF]/60" />}
            </div>
          )
        })}
      </div>

      {/* Control bar — Discord style */}
      <div className="px-2 py-2 border-t border-white/5">
        <div className="flex items-center justify-center gap-1.5">
          {/* Mic toggle */}
          <button
            type="button"
            onClick={() => setMuted(!isMuted)}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 ${
              isMuted
                ? 'bg-[#FF2A55]/20 text-[#FF2A55] hover:bg-[#FF2A55]/30'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title={isMuted ? '取消静音' : '静音'}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          {/* Screen share toggle */}
          <button
            type="button"
            onClick={() => setScreenSharing(!isScreenSharing)}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 ${
              isScreenSharing
                ? 'bg-[#00F3FF]/20 text-[#00F3FF] hover:bg-[#00F3FF]/30'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title={isScreenSharing ? '停止共享' : '共享屏幕'}
          >
            {isScreenSharing ? <MonitorOff className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
          </button>

          {/* Disconnect */}
          <button
            type="button"
            onClick={leaveChannel}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[#FF2A55]/15 text-[#FF2A55]/80 hover:bg-[#FF2A55]/25 hover:text-[#FF2A55] transition-all duration-200 active:scale-95"
            title="断开连接"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
