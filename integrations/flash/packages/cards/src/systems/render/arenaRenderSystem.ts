// ══════════════════════════════════════════════════════════════
// Arena Render System — draws arena overlays on a 2D canvas
//
// ECS render system. Replaces arenas/arenaRenderer.ts.
// Follows the pattern of constraintRenderSystem.ts.
//
// Export `drawArenas()` — call from the overlay canvas RAF loop.
// Export `arenaEdgeHitTest()` — call from pointer event handlers.
// ══════════════════════════════════════════════════════════════

import type { ViewportData } from '../../components/viewportComponent'
import type { Arena } from '../scene/arenaSystem'

// ─────────────────────────────────────
// Coordinate utilities
// ─────────────────────────────────────

function worldToScreen(wx: number, wy: number, vp: ViewportData) {
  return {
    sx: (wx - vp.offsetX) * vp.zoom,
    sy: (wy - vp.offsetY) * vp.zoom,
  }
}

// ─────────────────────────────────────
// Hit testing helpers (for drag/resize)
// ─────────────────────────────────────

/** Screen-space: returns 'center' | 'edge' | null for pointer interaction */
export function arenaEdgeHitTest(
  arena: Arena,
  screenX: number,
  screenY: number,
  vp: ViewportData,
): 'center' | 'edge' | null {
  const { sx, sy } = worldToScreen(arena.x, arena.y, vp)
  const screenRadius = arena.radius * vp.zoom
  const dx = screenX - sx
  const dy = screenY - sy
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist <= 14) return 'center'

  if (arena.shape === 'circle') {
    if (dist <= screenRadius + 18 && dist >= screenRadius - 18) return 'edge'
  } else {
    const screenHH = (arena.halfHeight ?? arena.radius * 0.7) * vp.zoom
    // Right-edge handle dot
    const ex = screenRadius
    const ey = 0
    const edgeDx = dx - ex
    const edgeDy = dy - ey
    if (Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy) <= 14) return 'edge'
    // Also hit on right border strip
    if (Math.abs(dx - screenRadius) <= 16 && Math.abs(dy) <= screenHH + 16) return 'edge'
  }

  return null
}

/** World-space: tests if (wx,wy) is inside arena */
export function containsWorldPoint(arena: Arena, wx: number, wy: number): boolean {
  const dx = wx - arena.x
  const dy = wy - arena.y
  if (arena.shape === 'circle') {
    return dx * dx + dy * dy <= arena.radius * arena.radius
  }
  return Math.abs(dx) <= arena.radius && Math.abs(dy) <= arena.halfHeight
}

// ─────────────────────────────────────
// Main draw function
// ─────────────────────────────────────

export function drawArenas(
  ctx: CanvasRenderingContext2D,
  arenas: Arena[],
  vp: ViewportData,
  w: number,
  h: number,
  _now: number,
  selectedId?: string | null,
): void {
  if (arenas.length === 0) return

  for (const arena of arenas) {
    const { sx, sy } = worldToScreen(arena.x, arena.y, vp)
    const screenRadius = arena.radius * vp.zoom

    if (sx + screenRadius < -50 || sx - screenRadius > w + 50) continue
    if (sy + screenRadius < -50 || sy - screenRadius > h + 50) continue

    const color = arena.color ?? '#a855f7'
    const isSelected = selectedId === arena.id
    ctx.save()
    ctx.translate(sx, sy)

    if (arena.shape === 'circle') {
      _drawCircleArena(ctx, arena, screenRadius, color)
    } else {
      const screenHW = arena.radius * vp.zoom
      const screenHH = (arena.halfHeight ?? arena.radius * 0.7) * vp.zoom
      _drawRectArena(ctx, arena, screenHW, screenHH, color)
    }

    // ── Selection ring ──
    if (isSelected) {
      _drawSelectionRing(ctx, arena, screenRadius, vp.zoom)
    }

    // ── Interaction handles (only when selected) ──
    if (isSelected) {
      _drawHandles(ctx, arena, screenRadius, color)
    }

    ctx.restore()
  }
}

// ─────────────────────────────────────
// Shape drawing
// ─────────────────────────────────────

function _drawCircleArena(
  ctx: CanvasRenderingContext2D,
  arena: Arena,
  screenRadius: number,
  color: string,
): void {
  const isActivated = arena.activationCount > 0

  // Outer glow ring
  const glowGrad = ctx.createRadialGradient(0, 0, screenRadius * 0.7, 0, 0, screenRadius * 1.15)
  glowGrad.addColorStop(0, `${color}00`)
  glowGrad.addColorStop(0.6, isActivated ? `${color}20` : `${color}10`)
  glowGrad.addColorStop(1, `${color}00`)
  ctx.fillStyle = glowGrad
  ctx.beginPath()
  ctx.arc(0, 0, screenRadius * 1.15, 0, Math.PI * 2)
  ctx.fill()

  // Inner fill — very subtle so cards behind are fully visible
  const innerGrad = ctx.createRadialGradient(0, -screenRadius * 0.2, 0, 0, 0, screenRadius)
  if (isActivated) {
    innerGrad.addColorStop(0, `${color}22`)
    innerGrad.addColorStop(1, `${color}05`)
  } else {
    innerGrad.addColorStop(0, `${color}10`)
    innerGrad.addColorStop(1, `${color}03`)
  }
  ctx.fillStyle = innerGrad
  ctx.beginPath()
  ctx.arc(0, 0, screenRadius, 0, Math.PI * 2)
  ctx.fill()

  // Border
  ctx.strokeStyle = isActivated ? `${color}cc` : `${color}55`
  ctx.lineWidth = isActivated ? 2.5 : 1.5
  if (!isActivated) ctx.setLineDash([8, 6])
  ctx.beginPath()
  ctx.arc(0, 0, screenRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  if (arena.kind === 'magic-circle') {
    _drawRunicRing(ctx, screenRadius, color, isActivated)
  }

  _drawLabel(ctx, arena.label, 0, screenRadius + 18, color)
}

function _drawRectArena(
  ctx: CanvasRenderingContext2D,
  arena: Arena,
  hw: number,
  hh: number,
  color: string,
): void {
  const isActivated = arena.activationCount > 0
  const r = Math.min(hw, hh) * 0.08

  ctx.fillStyle = isActivated ? `${color}15` : `${color}08`
  ctx.beginPath()
  ctx.roundRect(-hw, -hh, hw * 2, hh * 2, r)
  ctx.fill()

  ctx.strokeStyle = isActivated ? `${color}cc` : `${color}55`
  ctx.lineWidth = isActivated ? 2.5 : 1.5
  if (!isActivated) ctx.setLineDash([10, 6])
  ctx.beginPath()
  ctx.roundRect(-hw, -hh, hw * 2, hh * 2, r)
  ctx.stroke()
  ctx.setLineDash([])

  if (arena.kind === 'grid' && isActivated) {
    ctx.strokeStyle = `${color}20`
    ctx.lineWidth = 1
    const cellW = 180
    for (let x = -hw + cellW; x < hw; x += cellW) {
      ctx.beginPath()
      ctx.moveTo(x, -hh)
      ctx.lineTo(x, hh)
      ctx.stroke()
    }
  }

  // Corner accents
  const accentLen = Math.min(hw, hh) * 0.12
  ctx.strokeStyle = `${color}aa`
  ctx.lineWidth = 2
  for (const [cx, cy, dx, dy] of [
    [-hw, -hh, 1, 1],
    [hw, -hh, -1, 1],
    [hw, hh, -1, -1],
    [-hw, hh, 1, -1],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(cx + dx * accentLen, cy)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx, cy + dy * accentLen)
    ctx.stroke()
  }

  _drawLabel(ctx, arena.label, 0, hh + 18, color)
}

// ─────────────────────────────────────
// Decoration helpers
// ─────────────────────────────────────

function _drawRunicRing(
  ctx: CanvasRenderingContext2D,
  r: number,
  color: string,
  activated: boolean,
): void {
  const numSymbols = 8
  const symbolR = r * 0.85
  const symbols = ['⬟', '✦', '◈', '⬡', '✧', '◇', '⬢', '✦']

  ctx.save()
  ctx.font = `${Math.max(10, r * 0.08)}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = activated ? `${color}cc` : `${color}55`

  for (let i = 0; i < numSymbols; i++) {
    const angle = (i / numSymbols) * Math.PI * 2 - Math.PI / 2
    ctx.fillText(symbols[i], Math.cos(angle) * symbolR, Math.sin(angle) * symbolR)
  }

  ctx.strokeStyle = activated ? `${color}44` : `${color}22`
  ctx.lineWidth = 1
  ctx.setLineDash([4, 8])
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

function _drawHandles(
  ctx: CanvasRenderingContext2D,
  arena: Arena,
  screenRadius: number,
  color: string,
): void {
  // Center move handle — cross/move icon
  ctx.strokeStyle = `${color}cc`
  ctx.lineWidth = 2
  const arm = 8
  for (const [dx, dy] of [
    [-arm, 0],
    [arm, 0],
    [0, -arm],
    [0, arm],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(dx, dy)
    ctx.stroke()
  }
  ctx.fillStyle = `rgba(10,10,20,0.6)`
  ctx.beginPath()
  ctx.arc(0, 0, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = `${color}cc`
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(0, 0, 5, 0, Math.PI * 2)
  ctx.stroke()

  // Edge resize handle
  const ex = arena.shape === 'circle' ? 0 : screenRadius
  const ey = arena.shape === 'circle' ? -screenRadius : 0

  ctx.fillStyle = 'rgba(10,10,20,0.6)'
  ctx.beginPath()
  ctx.arc(ex, ey, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = `${color}ee`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(ex, ey, 6, 0, Math.PI * 2)
  ctx.stroke()
  // Small expand icon inside handle
  ctx.strokeStyle = `${color}ee`
  ctx.lineWidth = 1.5
  const hlen = 3
  if (arena.shape === 'circle') {
    ctx.beginPath()
    ctx.moveTo(ex - hlen, ey)
    ctx.lineTo(ex + hlen, ey)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(ex, ey - hlen)
    ctx.lineTo(ex, ey + hlen)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.moveTo(ex - hlen, ey - hlen)
    ctx.lineTo(ex + hlen, ey + hlen)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(ex + hlen, ey - hlen)
    ctx.lineTo(ex - hlen, ey + hlen)
    ctx.stroke()
  }
}

function _drawSelectionRing(
  ctx: CanvasRenderingContext2D,
  arena: Arena,
  screenRadius: number,
  zoom: number,
): void {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])

  if (arena.shape === 'circle') {
    ctx.beginPath()
    ctx.arc(0, 0, screenRadius + 10, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    const hw = arena.radius * zoom + 10
    const hh = (arena.halfHeight ?? arena.radius * 0.7) * zoom + 10
    const r = 8
    ctx.beginPath()
    ctx.roundRect(-hw, -hh, hw * 2, hh * 2, r)
    ctx.stroke()
  }

  ctx.setLineDash([])
  ctx.restore()
}

function _drawLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.save()
  ctx.font = '13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const metrics = ctx.measureText(label)
  const tw = metrics.width + 16
  const th = 20
  ctx.fillStyle = 'rgba(10,10,20,0.7)'
  ctx.beginPath()
  ctx.roundRect(x - tw / 2, y, tw, th, 6)
  ctx.fill()
  ctx.fillStyle = color
  ctx.fillText(label, x, y + 3)
  ctx.restore()
}
