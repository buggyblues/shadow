import { Download, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ImageViewerProps {
  src: string
  filename?: string
  size?: number
  onClose: () => void
}

export function ImageViewer({ src, filename, size, onClose }: ImageViewerProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [scale, setScale] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [startPos, setStartPos] = useState({ x: 0, y: 0 })
  const [isLoaded, setIsLoaded] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Prevent body scroll when viewer is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  // Format file size
  const formatSize = useCallback((bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }, [])

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(s * 1.25, 5))
  }, [])

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(s / 1.25, 0.5))
  }, [])

  const handleReset = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  // Mouse drag handlers for panning
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale > 1) {
        e.preventDefault()
        setIsDragging(true)
        setStartPos({ x: e.clientX - position.x, y: e.clientY - position.y })
      }
    },
    [scale, position],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging && scale > 1) {
        setPosition({
          x: e.clientX - startPos.x,
          y: e.clientY - startPos.y,
        })
      }
    },
    [isDragging, startPos, scale],
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Touch handlers for mobile swipe to close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || scale > 1) return
      const touch = e.touches[0]
      if (!touch) return
      const deltaY = touch.clientY - touchStartRef.current.y
      const deltaX = touch.clientX - touchStartRef.current.x

      // If swiping down more than 50px, close the viewer
      if (deltaY > 50 && Math.abs(deltaY) > Math.abs(deltaX)) {
        onClose()
      }
    },
    [onClose, scale],
  )

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null
  }, [])

  // Double click to reset zoom
  const handleDoubleClick = useCallback(() => {
    if (scale !== 1) {
      handleReset()
    } else {
      setScale(2)
    }
  }, [scale, handleReset])

  // Download image
  const handleDownload = useCallback(() => {
    const link = document.createElement('a')
    link.href = src
    link.download = filename || 'image'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [src, filename])

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.imageViewer', 'Image viewer')}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={(e) => {
        // Close when clicking background
        if (e.target === containerRef.current) {
          onClose()
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 shrink-0">
        <div className="flex-1 min-w-0 mr-4">
          {filename && <p className="text-white text-sm font-medium truncate">{filename}</p>}
          {size && <p className="text-white/60 text-xs">{formatSize(size)}</p>}
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition"
            title={t('common.zoomOut')}
          >
            <ZoomOut size={20} />
          </button>
          <span className="text-white/60 text-sm min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition"
            title={t('common.zoomIn')}
          >
            <ZoomIn size={20} />
          </button>
          <div className="w-px h-6 bg-white/20 mx-2" />
          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition"
            title={t('common.download')}
          >
            <Download size={20} />
          </button>
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition"
            title={t('common.close')}
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Image container */}
      <div
        role="img"
        aria-label={filename || 'Image'}
        className="flex-1 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          ref={imageRef}
          src={src}
          alt={filename || 'Image'}
          className={`max-w-full max-h-full object-contain transition-transform duration-200 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          }}
          onLoad={() => setIsLoaded(true)}
          onDoubleClick={handleDoubleClick}
          draggable={false}
        />
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Mobile hint */}
      <div className="md:hidden px-4 py-2 bg-black/50 text-center">
        <p className="text-white/40 text-xs">
          {t('chat.imageViewerHint', 'Swipe down to close · Double tap to zoom')}
        </p>
      </div>
    </div>
  )
}
