import { Ear, Mic, MicOff, Monitor, MonitorOff, PhoneOff, Settings, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useVoiceBridge } from '@/hooks/useVoiceBridge'
import { useVoiceStore } from '@/stores/voice.store'
import { ScreenShareViewer } from './ScreenShareViewer'
import { VoiceSettings } from './VoiceSettings'

// Threshold for "speaking" state based on Agora volume indicator (0-100)
const SPEAKING_THRESHOLD = 20

/**
 * Voice Channel Panel — Discord-style voice panel at the bottom of sidebar.
 *
 * Shows:
 * - Connected channel name with glass surface
 * - Member list with avatars, speaking indicators (green ring), and status icons
 * - Bottom control bar: Mic, Screen Share, Settings, Disconnect
 *
 * Design: Neon Frost + Discord UX patterns, supports light/dark mode.
 *
 * Architecture:
 * - useVoiceBridge watches store.activeChannelId and automatically
 *   joins/leaves Agora RTC when the user joins/leaves a voice channel.
 * - Socket.IO event listeners live in useVoiceBridge (single source).
 */
export function VoiceChannel() {
  const { activeChannelId, activeChannelName, members, isMuted, isScreenSharing, error, canSpeak } =
    useVoiceStore()

  const {
    leaveAgora,
    toggleMute,
    toggleScreenShare,
    retryMicrophone,
    getMicrophones,
    setMicrophoneDevice,
    screenSharerId,
    screenShareTrack,
  } = useVoiceBridge()

  const [settingsOpen, setSettingsOpen] = useState(false)

  // Find screen sharer's display name
  const screenSharerName = useMemo(() => {
    if (!screenSharerId) return ''
    const member = members.find((m) => m.userId === screenSharerId)
    return member?.displayName || member?.username || 'Unknown'
  }, [screenSharerId, members])

  // Screen share viewer state
  const [viewerDismissed, setViewerDismissed] = useState(false)
  const showScreenShareViewer = screenShareTrack && screenSharerName && !viewerDismissed

  // Reset viewer dismissed state when sharer changes
  useEffect(() => {
    setViewerDismissed(false)
  }, [screenSharerId])

  if (!activeChannelId) return null

  return (
    <>
      <div className="border-t border-border-subtle bg-bg-secondary/80 backdrop-blur-xl dark:bg-bg-secondary/60">
        {/* Error banner */}
        {error && (
          <div className="px-3 py-1.5 text-xs text-[#FF2A55] bg-[#FF2A55]/5 border-b border-[#FF2A55]/10 dark:border-[#FF2A55]/20">
            {error}
          </div>
        )}

        {/* Channel header — glass surface */}
        <div className="px-3 py-2.5 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#00F3FF]/10 flex items-center justify-center">
              <Volume2 className="h-3.5 w-3.5 text-[#00F3FF]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-text-primary truncate">
                {activeChannelName}
              </p>
              <p className="text-[11px] text-text-muted">{members.length + 1} 人已连接</p>
            </div>
          </div>
        </div>

        {/* Member list — Discord style */}
        <div className="px-2 py-1.5 max-h-[160px] overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent dark:scrollbar-thumb-white/5">
          {/* Current user (self) */}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-tertiary/50 transition-colors group">
            <div className="relative">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-150 ${
                  canSpeak && !isMuted
                    ? 'bg-gradient-to-br from-[#00F3FF]/30 to-[#00c6d1]/20 text-[#00F3FF] dark:from-[#00F3FF]/25 dark:to-[#00c6d1]/15'
                    : 'bg-bg-tertiary text-text-muted'
                }`}
              >
                {canSpeak ? '我' : <Ear className="h-4 w-4" />}
              </div>
              <div
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-secondary ${
                  !canSpeak ? 'bg-[#FFA726]' : isMuted ? 'bg-text-muted/30' : 'bg-[#00E676]'
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-text-primary truncate">
                {canSpeak ? '你' : '只听模式'}
              </p>
            </div>
            {canSpeak && isMuted && <MicOff className="h-3 w-3 text-text-muted/50" />}
            {canSpeak && isScreenSharing && <Monitor className="h-3 w-3 text-[#00F3FF]/60" />}
          </div>

          {/* Remote members */}
          {members.map((m) => {
            const initials = (m.displayName || m.username).slice(0, 2).toUpperCase()
            const isSpeaking = !m.muted && m.volume > SPEAKING_THRESHOLD

            return (
              <div
                key={m.userId}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-tertiary/50 transition-colors"
              >
                <div className="relative">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-150 ${
                      isSpeaking
                        ? 'bg-gradient-to-br from-[#00E676]/30 to-[#00E676]/10 text-[#00E676] ring-2 ring-[#00E676]/40 dark:from-[#00E676]/25 dark:to-[#00E676]/5 dark:ring-[#00E676]/30'
                        : 'bg-bg-tertiary text-text-muted/50'
                    }`}
                  >
                    {initials}
                  </div>
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-secondary ${
                      m.muted ? 'bg-text-muted/30' : 'bg-[#00E676]'
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[12px] font-medium truncate transition-colors ${
                      isSpeaking ? 'text-text-primary' : 'text-text-muted/70'
                    }`}
                  >
                    {m.displayName || m.username}
                  </p>
                </div>
                {m.muted && <MicOff className="h-3 w-3 text-text-muted/50" />}
                {m.screenSharing && <Monitor className="h-3 w-3 text-[#00F3FF]/60" />}
              </div>
            )
          })}
        </div>

        {/* Control bar — Discord style */}
        <div className="px-2 py-2 border-t border-border-subtle">
          <div className="flex items-center justify-center gap-1.5">
            {/* Mic toggle / retry */}
            {canSpeak ? (
              <button
                type="button"
                onClick={toggleMute}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 ${
                  isMuted
                    ? 'bg-[#FF2A55]/20 text-[#FF2A55] hover:bg-[#FF2A55]/30 dark:bg-[#FF2A55]/15 dark:hover:bg-[#FF2A55]/25'
                    : 'bg-bg-tertiary/60 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                }`}
                title={isMuted ? '取消静音' : '静音'}
              >
                {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={retryMicrophone}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 bg-[#FFA726]/20 text-[#FFA726] hover:bg-[#FFA726]/30 dark:bg-[#FFA726]/15 dark:hover:bg-[#FFA726]/25"
                title="重新尝试麦克风"
              >
                <Mic className="h-4 w-4" />
              </button>
            )}

            {/* Screen share toggle */}
            <button
              type="button"
              onClick={toggleScreenShare}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 ${
                isScreenSharing
                  ? 'bg-[#00F3FF]/20 text-[#00F3FF] hover:bg-[#00F3FF]/30 dark:bg-[#00F3FF]/15 dark:hover:bg-[#00F3FF]/25'
                  : 'bg-bg-tertiary/60 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              }`}
              title={isScreenSharing ? '停止共享' : '共享屏幕'}
            >
              {isScreenSharing ? (
                <MonitorOff className="h-4 w-4" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
            </button>

            {/* Settings */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-bg-tertiary/60 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-all duration-200 active:scale-95"
              title="语音设置"
            >
              <Settings className="h-4 w-4" />
            </button>

            {/* Disconnect */}
            <button
              type="button"
              onClick={leaveAgora}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-[#FF2A55]/15 text-[#FF2A55]/80 hover:bg-[#FF2A55]/25 hover:text-[#FF2A55] transition-all duration-200 active:scale-95 dark:bg-[#FF2A55]/10 dark:hover:bg-[#FF2A55]/20"
              title="断开连接"
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Voice settings modal */}
      <VoiceSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        getMicrophones={getMicrophones}
        setMicrophoneDevice={setMicrophoneDevice}
      />

      {/* Screen share viewer */}
      {showScreenShareViewer && (
        <ScreenShareViewer
          track={screenShareTrack}
          sharerName={screenSharerName}
          onClose={() => setViewerDismissed(true)}
        />
      )}
    </>
  )
}
