// ══════════════════════════════════════════════════════════════
// Constraint Renderer — Draws elastic rope connections
//
// Renders Matter.js constraints (from /link command) as catenary
// curves on a 2D canvas overlay. Supports:
//   - Elastic rope visualization with sag
//   - Tension-based color (taut = bright, slack = dim)
//   - Spring oscillation effect
// ══════════════════════════════════════════════════════════════

import type Matter from 'matter-js'
import type { ViewportData } from '../../components/viewportComponent'

export interface ConstraintRenderConfig {
  /** Base rope color */
  color?: string
  /** Rope width in pixels */
  width?: number
  /** Glow intensity 0..1 */
  glow?: number
}

const DEFAULT_CONFIG: Required<ConstraintRenderConfig> = {
  color: '#c4a035',
  width: 2.5,
  glow: 0.6,
}

/**
 * Draw all constraints as elastic ropes on a 2D canvas overlay.
 */
export function drawConstraints(
  ctx: CanvasRenderingContext2D,
  constraints: Map<string, Matter.Constraint>,
  viewport: ViewportData,
  config?: ConstraintRenderConfig,
): void {
  if (constraints.size === 0) return

  const cfg = { ...DEFAULT_CONFIG, ...config }
  const { zoom, offsetX, offsetY } = viewport

  ctx.save()

  for (const [_key, constraint] of constraints) {
    const bodyA = constraint.bodyA
    const bodyB = constraint.bodyB
    if (!bodyA || !bodyB) continue

    // World to screen
    const ax = (bodyA.position.x - offsetX) * zoom
    const ay = (bodyA.position.y - offsetY) * zoom
    const bx = (bodyB.position.x - offsetX) * zoom
    const by = (bodyB.position.y - offsetY) * zoom

    // Calculate tension (how stretched the rope is)
    const dx = bodyB.position.x - bodyA.position.x
    const dy = bodyB.position.y - bodyA.position.y
    const currentLength = Math.sqrt(dx * dx + dy * dy)
    const restLength = constraint.length || 100
    const tension = Math.min(2, Math.max(0, currentLength / restLength))

    // Sag based on inverse tension (slack rope sags more)
    const sag = Math.max(0, (1 - tension) * 40) * zoom

    // Midpoint with sag (gravity-like droop)
    const mx = (ax + bx) / 2
    const my = (ay + by) / 2 + sag

    // Color based on tension
    const alpha = 0.4 + tension * 0.4
    const tensionColor =
      tension > 1.2
        ? `rgba(255, 100, 80, ${alpha})` // Overstretched: red
        : tension > 0.8
          ? `rgba(196, 160, 53, ${alpha})` // Normal: gold
          : `rgba(100, 200, 255, ${alpha})` // Slack: blue

    // Draw glow
    if (cfg.glow > 0) {
      ctx.strokeStyle = tensionColor
      ctx.lineWidth = (cfg.width + 4) * Math.min(zoom, 1)
      ctx.globalAlpha = cfg.glow * 0.3
      ctx.filter = `blur(${4 * Math.min(zoom, 1)}px)`
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.quadraticCurveTo(mx, my, bx, by)
      ctx.stroke()
      ctx.filter = 'none'
    }

    // Draw rope
    ctx.globalAlpha = 1
    ctx.strokeStyle = tensionColor
    ctx.lineWidth = cfg.width * Math.min(zoom, 1)
    ctx.lineCap = 'round'
    ctx.setLineDash(tension > 1 ? [] : [6 * zoom, 3 * zoom])

    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.quadraticCurveTo(mx, my, bx, by)
    ctx.stroke()

    ctx.setLineDash([])

    // Draw anchor dots
    const dotRadius = 3 * Math.min(zoom, 1)
    ctx.fillStyle = tensionColor
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    ctx.arc(ax, ay, dotRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(bx, by, dotRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/**
 * Draw highlight glow around a card body.
 */
export function drawHighlight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  intensity: number,
  zoom: number,
): void {
  ctx.save()
  ctx.globalAlpha = intensity * 0.6

  // Outer glow
  ctx.shadowColor = color
  ctx.shadowBlur = 20 * Math.min(zoom, 1)
  ctx.strokeStyle = color
  ctx.lineWidth = 2 * Math.min(zoom, 1)

  const hw = (w / 2) * zoom
  const hh = (h / 2) * zoom

  ctx.beginPath()
  ctx.roundRect(x - hw, y - hh, hw * 2, hh * 2, 14 * Math.min(zoom, 1))
  ctx.stroke()

  ctx.restore()
}
