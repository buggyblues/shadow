import type { ILocalVideoTrack, IRemoteVideoTrack } from 'agora-rtc-sdk-ng'
import { Maximize2, Minimize2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface ScreenShareViewerProps {
  /** Remote screen share track (from another user) */
  remoteTrack?: IRemoteVideoTrack | null
  /** Local screen share track (for self-preview) */
  localTrack?: ILocalVideoTrack | null
  /** Display name of the screen sharer */
  sharerName: string
  /** Whether local user is the sharer */
  isLocal?: boolean
  onClose: () => void
}

/**
 * Full-screen screen share viewer with zoom & fullscreen support.
 * Supports both remote tracks (Agora IRemoteVideoTrack) and local
 * tracks (ILocalVideoTrack for self-preview).
 */
export function ScreenShareViewer({
  remoteTrack,
  localTrack,
  sharerName,
  isLocal,
  onClose,
}: ScreenShareViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const activeTrack = isLocal ? localTrack : remoteTrack

  // Play track into container
  useEffect(() => {
    if (activeTrack && containerRef.current) {
      activeTrack.play(containerRef.current, { fit: 'contain' })
    }
    return () => {
      // Don't stop/close the track — managed by the bridge
    }
  }, [activeTrack])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Prevent body scroll
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [])

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && wrapperRef.current) {
      wrapperRef.current.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const handleZoomIn = useCallback(() => setScale((s) => Math.min(s * 1.25, 5)), [])
  const handleZoomOut = useCallback(() => setScale((s) => Math.max(s / 1.25, 0.5)), [])
  const handleReset = useCallback(() => setScale(1), [])

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale((s) => Math.max(0.5, Math.min(5, s - e.deltaY * 0.002)))
  }, [])

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 z-50 bg-bg-deep/95 flex flex-col"
      onWheel={handleWheel}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-bg-deep/60 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#00F3FF]/20 flex items-center justify-center">
            <span className="text-sm font-bold text-[#00F3FF]">
              {sharerName.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">
              {isLocal ? '你正在共享屏幕' : `${sharerName} 正在共享屏幕`}
            </p>
            {scale !== 1 && (
              <p className="text-xs text-text-muted">缩放 {Math.round(scale * 100)}%</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Zoom out */}
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-2 text-white/80 hover:text-white hover:bg-bg-modifier-hover rounded-lg transition"
            title="缩小"
          >
            <ZoomOut size={18} />
          </button>
          {/* Scale display / reset */}
          <button
            type="button"
            onClick={handleReset}
            className="px-2 text-white/60 text-sm hover:text-white hover:bg-bg-modifier-hover rounded-lg transition min-w-[60px] text-center"
            title="重置缩放"
          >
            {Math.round(scale * 100)}%
          </button>
          {/* Zoom in */}
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-2 text-white/80 hover:text-white hover:bg-bg-modifier-hover rounded-lg transition"
            title="放大"
          >
            <ZoomIn size={18} />
          </button>
          <div className="w-px h-6 bg-white/20 mx-1" />
          {/* Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 text-white/80 hover:text-white hover:bg-bg-modifier-hover rounded-lg transition"
            title={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-bg-modifier-hover rounded-lg transition"
            title="关闭"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Screen content area */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'VIDEO') {
            setScale((s) => (s !== 1 ? 1 : 2))
          }
        }}
      >
        <div
          ref={containerRef}
          className="w-full h-full transition-transform duration-150"
          style={{ transform: `scale(${scale})` }}
        />
      </div>

      {/* Mobile hint */}
      <div className="md:hidden px-4 py-2 bg-bg-deep/50 text-center">
        <p className="text-white/40 text-xs">双指缩放 · 点击关闭</p>
      </div>
    </div>
  )
}
