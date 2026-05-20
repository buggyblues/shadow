// ECS Content System — Three.js 3D Card
// Draws only a static stage/poster. Runtime scene creation is owned by ECS
// runtimePrepareSystem, and active frames are composited as a GPU layer.
//
// Preset scenes:
//   cube       — wireframe + solid rotating box
//   torus      — metallic torus knot
//   particles  — point-cloud galaxy
//   dna        — double helix with spheres
//   earth      — sphere with grid lines
//   galaxy     — swirling star particles

import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { advance, layoutStore, remainingH } from '../components/layoutComponent'
import { threeDMetaStore } from '../components/metaComponent'
import { styleStore } from '../components/styleComponent'
import { animationManager } from '../resources/animationManager'
import { hasThreeScenePreset } from '../resources/threeScenePresets'
import { fontStr, hexAlpha, safeStr } from '../utils/canvasUtils'

function drawIdle3DPreview(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  accentColor: string,
) {
  const cx = x + w / 2
  const cy = y + h / 2
  const r = Math.min(w, h) * 0.24
  ctx.strokeStyle = hexAlpha(accentColor, 0.55)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx + r * 0.85, cy - r * 0.45)
  ctx.lineTo(cx + r * 0.85, cy + r * 0.55)
  ctx.lineTo(cx, cy + r)
  ctx.lineTo(cx - r * 0.85, cy + r * 0.55)
  ctx.lineTo(cx - r * 0.85, cy - r * 0.45)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx, cy)
  ctx.lineTo(cx + r * 0.85, cy - r * 0.45)
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx - r * 0.85, cy - r * 0.45)
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx, cy + r)
  ctx.stroke()

  ctx.fillStyle = hexAlpha(accentColor, 0.45)
  ctx.beginPath()
  ctx.arc(cx, cy, Math.max(2, r * 0.06), 0, Math.PI * 2)
  ctx.fill()
}

// ─────────────────────────────────────
// System
// ─────────────────────────────────────

export function threeSystem(eid: number): boolean {
  const meta = threeDMetaStore[eid]
  if (!meta) return false
  // Guard: scene must be a recognized preset — skip stressCards with no scene
  const sceneKey = meta.scene || ''
  if (!hasThreeScenePreset(sceneKey)) return false

  const { ctx } = canvasStore[eid]!
  const layout = layoutStore[eid]!
  const { padX, contentW } = layout
  const { accentColor } = styleStore[eid]!
  const { card } = cardDataStore[eid]!

  const availH = remainingH(layout)
  const viewH = Math.min(availH - 24, contentW * 1.1)
  const viewW = contentW
  const vX = padX - 2,
    vY = layout.cursorY + 2

  // ── Runtime canvas is prepared by ECS runtimePrepareSystem ──────────
  const threeCanvas = animationManager.getThreeCanvas(card.id)
  const autoplay = meta.autoplay === true
  animationManager.setAutoplay(card.id, autoplay)
  animationManager.setLayerRect(card.id, {
    x: vX,
    y: vY,
    w: viewW,
    h: viewH,
    radius: 6,
    fit: 'fill',
  })

  if (threeCanvas) {
    drawThreePoster(ctx, threeCanvas, vX, vY, viewW, viewH)
  } else if (!threeCanvas) {
    drawIdle3DPreview(ctx, vX, vY, viewW, viewH, accentColor)
  }

  advance(layout, viewH + 8)

  // Description
  const desc = safeStr(meta.description)
  if (desc && remainingH(layout) > 10) {
    ctx.font = fontStr(7, '', '', '"Noto Sans SC", sans-serif')
    ctx.fillStyle = hexAlpha(accentColor, 0.6)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(desc.slice(0, 44), padX + contentW / 2, layout.cursorY + 2)
    advance(layout, 11)
  }

  return true
}

function drawThreePoster(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 6)
  ctx.clip()
  ctx.drawImage(canvas, x, y, w, h)
  ctx.restore()
}
