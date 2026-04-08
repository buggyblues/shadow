/* ─────────────────────────────────────────────────────────────────────────────
 *  Shadow OS — Infinite Canvas (v2 — Depth / Ambience)
 *
 *  A pannable, zoomable infinite canvas with layered depth:
 *   Layer 0  — Ambient background (blurred gradient orbs, follows theme)
 *   Layer 1  — Widget layer (transform group)
 *   Layer 2  — HUD (controls, edit mode indicator, always screen-space)
 *
 *  Interactions:
 *   - Trackpad scroll → pan,  ctrl/meta + scroll → zoom
 *   - Middle-click drag → pan,  Space + left-click drag → pan
 *   - Edit-mode grid (subtle, only when editing)
 * ───────────────────────────────────────────────────────────────────────────── */

import { cn } from '@shadowob/ui'
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useWidgetEngine } from '../../../lib/widget-engine'

interface InfiniteCanvasProps {
  children: React.ReactNode
  className?: string
}

export function InfiniteCanvas({ children, className }: InfiniteCanvasProps) {
  const { viewport, pan, zoom, resetViewport, isEditing } = useWidgetEngine()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const lastPointer = useRef({ x: 0, y: 0 })

  /* ── Space key for pan mode ── */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !e.repeat &&
        !(e.target as HTMLElement).closest('input, textarea')
      ) {
        e.preventDefault()
        setSpaceHeld(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  /* ── Wheel zoom / pan ── */
  const onWheel = useCallback(
    (e: ReactWheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return
        zoom(-e.deltaY * 0.002, e.clientX - rect.left, e.clientY - rect.top)
      } else {
        pan(-e.deltaX, -e.deltaY)
      }
    },
    [pan, zoom],
  )

  /* ── Pointer pan ── */
  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button === 1 || (spaceHeld && e.button === 0)) {
        e.preventDefault()
        setIsPanning(true)
        lastPointer.current = { x: e.clientX, y: e.clientY }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      }
    },
    [spaceHeld],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!isPanning) return
      const dx = e.clientX - lastPointer.current.x
      const dy = e.clientY - lastPointer.current.y
      lastPointer.current = { x: e.clientX, y: e.clientY }
      pan(dx, dy)
    },
    [isPanning, pan],
  )

  const onPointerUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  /* ── Edit-mode grid ── */
  const gridSize = 40 * viewport.zoom
  const gridOffsetX = ((viewport.panX % gridSize) + gridSize) % gridSize
  const gridOffsetY = ((viewport.panY % gridSize) + gridSize) % gridSize

  return (
    <div
      ref={canvasRef}
      className={cn(
        'relative w-full h-full overflow-hidden select-none',
        isPanning || spaceHeld ? 'cursor-grab' : '',
        isPanning ? 'cursor-grabbing' : '',
        className,
      )}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* ── Layer 0: Ambient background ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Parallax orbs — move at half the pan speed for depth */}
        <div
          className="absolute inset-[-200px]"
          style={{
            transform: `translate(${viewport.panX * 0.15}px, ${viewport.panY * 0.15}px)`,
            willChange: 'transform',
          }}
        >
          <div className="absolute top-[10%] left-[15%] w-[500px] h-[500px] rounded-full bg-primary/[0.07] blur-[120px] animate-pulse" />
          <div className="absolute top-[50%] right-[10%] w-[400px] h-[400px] rounded-full bg-accent/[0.06] blur-[100px] animate-pulse [animation-delay:2s]" />
          <div className="absolute bottom-[15%] left-[40%] w-[350px] h-[350px] rounded-full bg-info/[0.05] blur-[100px] animate-pulse [animation-delay:4s]" />
        </div>
      </div>

      {/* ── Edit grid (only visible in edit mode) ── */}
      {isEditing && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.08] transition-opacity duration-500"
          style={{
            backgroundImage:
              'radial-gradient(circle, var(--color-text-muted) 1px, transparent 1px)',
            backgroundSize: `${gridSize}px ${gridSize}px`,
            backgroundPosition: `${gridOffsetX}px ${gridOffsetY}px`,
          }}
        />
      )}

      {/* ── Layer 1: Widget transform group ── */}
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
          willChange: 'transform',
        }}
      >
        {children}
      </div>

      {/* ── Layer 2: HUD — viewport controls ── */}
      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 bg-bg-primary/60 backdrop-blur-2xl rounded-2xl border border-white/[0.06] px-1 py-0.5 shadow-xl z-50">
        <button
          type="button"
          onClick={() => zoom(-0.2, 0, 0)}
          className="p-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition"
          title="Zoom out"
        >
          <Minimize2 size={13} />
        </button>
        <span className="text-[10px] font-black text-text-muted/60 min-w-[32px] text-center tabular-nums">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoom(0.2, 0, 0)}
          className="p-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition"
          title="Zoom in"
        >
          <Maximize2 size={13} />
        </button>
        <div className="w-px h-3.5 bg-white/[0.06]" />
        <button
          type="button"
          onClick={resetViewport}
          className="p-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition"
          title="Reset view"
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  )
}
