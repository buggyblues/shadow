import type { IRemoteVideoTrack } from 'agora-rtc-sdk-ng'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface ScreenShareViewerProps {
  track: IRemoteVideoTrack | null
  sharerName: string
  onClose: () => void
}

/**
 * Full-screen overlay viewer for remote screen sharing.
 * Uses Agora's IRemoteVideoTrack.play() to render into a div ref.
 */
export function ScreenShareViewer({ track, sharerName, onClose }: ScreenShareViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (track && containerRef.current) {
      track.play(containerRef.current, { fit: 'contain' })
    }
    return () => {
      // Don't stop the track here — it's managed by the bridge
      // Just clean up the DOM element
    }
  }, [track])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#00F3FF]/20 flex items-center justify-center">
            <span className="text-sm text-[#00F3FF]">{sharerName.slice(0, 2).toUpperCase()}</span>
          </div>
          <span className="text-sm font-medium text-text-primary">{sharerName} 正在共享屏幕</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 text-text-secondary hover:bg-white/20 hover:text-text-primary transition-colors"
          title="关闭屏幕共享"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Screen share content */}
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}
