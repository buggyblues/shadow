/* ─────────────────────────────────────────────────────────────────────────────
 *  Shadow OS — Widget Shell  (v2 — Borderless-first)
 *
 *  Visual wrapper for each widget instance on the canvas.
 *
 *  Design principles:
 *   1. Borderless by default — no card chrome. Content "floats" on canvas.
 *   2. In edit mode, a subtle dashed outline + corner handles appear.
 *   3. "Contained" widgets get a frosted-glass capsule (no title bar).
 *   4. Double-click → open widget micro-settings.
 *   5. Drag-to-move via pointer capture (edit mode only).
 * ───────────────────────────────────────────────────────────────────────────── */

import { cn } from '@shadowob/ui'
import { Move, Settings2, Trash2 } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from 'react'
import type { WidgetAppearance, WidgetInstance, WidgetManifest } from '../../../lib/widget-engine'
import { useWidgetEngine } from '../../../lib/widget-engine'

interface WidgetShellProps {
  instance: WidgetInstance
  manifest?: WidgetManifest
  children: React.ReactNode
}

export function WidgetShell({ instance, manifest, children }: WidgetShellProps) {
  const { isEditing, selectedWidgetId, selectWidget, moveWidget, removeWidget, bringToFront } =
    useWidgetEngine()
  const isSelected = selectedWidgetId === instance.instanceId
  const shellRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, origX: 0, origY: 0 })

  const appearance: WidgetAppearance = {
    borderless: false,
    transparent: false,
    radius: null,
    ...(manifest?.appearance ?? {}),
    ...instance.appearance,
  }

  const isBorderless = appearance.borderless || appearance.transparent
  const radius = isBorderless ? 0 : (appearance.radius ?? 24)

  /* ── Drag to move (edit mode) ── */
  const onDragStart = useCallback(
    (e: ReactPointerEvent) => {
      if (!isEditing) return
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        origX: instance.rect.x,
        origY: instance.rect.y,
      }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      bringToFront(instance.instanceId)
      selectWidget(instance.instanceId)
    },
    [isEditing, instance.rect.x, instance.rect.y, instance.instanceId, bringToFront, selectWidget],
  )

  const onDragMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!isDragging) return
      const { zoom } = useWidgetEngine.getState().viewport
      const dx = (e.clientX - dragStart.current.x) / zoom
      const dy = (e.clientY - dragStart.current.y) / zoom
      moveWidget(instance.instanceId, {
        x: dragStart.current.origX + dx,
        y: dragStart.current.origY + dy,
      })
    },
    [isDragging, instance.instanceId, moveWidget],
  )

  const onDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  /* ── Select on click in edit mode ── */
  const handleClick = useCallback(() => {
    if (isEditing) selectWidget(instance.instanceId)
  }, [isEditing, instance.instanceId, selectWidget])

  if (!instance.visible) return null

  return (
    <div
      ref={shellRef}
      className={cn(
        'absolute group transition-all duration-300',
        /* Contained mode: frosted glass capsule */
        !isBorderless &&
          'bg-[var(--glass-bg)] backdrop-blur-2xl border border-white/[0.06] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]',
        /* Edit mode: selection ring */
        isEditing && !isBorderless && 'ring-1 ring-dashed ring-primary/20',
        isEditing && isBorderless && isSelected && 'ring-1 ring-dashed ring-primary/40',
        isSelected && isEditing && 'ring-2 ring-primary/60',
        isDragging && 'scale-[1.005] transition-none',
      )}
      style={{
        left: instance.rect.x,
        top: instance.rect.y,
        width: instance.rect.w || undefined,
        height: instance.rect.h || undefined,
        zIndex: instance.rect.z,
        borderRadius: radius,
        overflow: isBorderless ? 'visible' : 'hidden',
      }}
      onClick={handleClick}
      onKeyDown={
        isEditing
          ? (e) => {
              if (e.key === 'Delete' || e.key === 'Backspace') {
                removeWidget(instance.instanceId)
              }
            }
          : undefined
      }
      tabIndex={isEditing ? 0 : undefined}
    >
      {/* ── Edit-mode floating toolbar (appears on hover / selection) ── */}
      {isEditing && (
        <div
          className={cn(
            'absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-0.5',
            'bg-bg-deep/90 backdrop-blur-2xl rounded-xl px-1.5 py-1 border border-white/[0.08]',
            'shadow-xl z-50 transition-all duration-200',
            isSelected || isDragging
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0',
          )}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
        >
          <Move size={11} className="text-text-muted/60 cursor-grab active:cursor-grabbing mr-1" />
          <button
            type="button"
            className="p-1 rounded-lg text-text-muted hover:text-primary hover:bg-white/[0.06] transition"
            title="Settings"
            onClick={(e) => e.stopPropagation()}
          >
            <Settings2 size={11} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              removeWidget(instance.instanceId)
            }}
            className="p-1 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition"
            title="Remove"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}

      {/* ── Widget content ── */}
      <div className={cn('w-full h-full', !isBorderless && 'p-4')}>{children}</div>

      {/* ── Resize corner (edit + selected) ── */}
      {isEditing && isSelected && (
        <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-50">
          <div className="absolute bottom-1 right-1 w-2 h-2 rounded-sm bg-primary/60" />
        </div>
      )}
    </div>
  )
}
