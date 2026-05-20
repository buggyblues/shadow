// ══════════════════════════════════════════════════════════════
// Resource — Card Face Material
//
// High-quality static card-face base painted once into the baked texture.
// Keep this GPU-friendly: gradients and cached grain pattern only, no
// per-card per-pixel loops on the hot path.
// ══════════════════════════════════════════════════════════════

interface Rgb {
  r: number
  g: number
  b: number
}

const grainPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>()

export function paintCardFaceBase(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bgColor = '#fdf8f0',
): void {
  const base = parseColor(bgColor)
  const top = mix(base, { r: 255, g: 253, b: 247 }, 0.58)
  const mid = mix(base, { r: 255, g: 248, b: 235 }, 0.32)
  const bottom = mix(base, { r: 232, g: 218, b: 196 }, 0.12)

  ctx.save()

  const wash = ctx.createLinearGradient(0, 0, 0, height)
  wash.addColorStop(0, rgba(top, 1))
  wash.addColorStop(0.48, rgba(mid, 1))
  wash.addColorStop(1, rgba(bottom, 1))
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, width, height)

  const glow = ctx.createRadialGradient(width * 0.22, height * 0.08, 4, width * 0.22, 0, width)
  glow.addColorStop(0, 'rgba(255,255,255,0.58)')
  glow.addColorStop(0.45, 'rgba(255,255,255,0.12)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  const lowerShade = ctx.createRadialGradient(
    width * 0.74,
    height * 1.04,
    height * 0.06,
    width * 0.74,
    height * 1.04,
    height * 0.68,
  )
  lowerShade.addColorStop(0, 'rgba(128,92,48,0.12)')
  lowerShade.addColorStop(0.56, 'rgba(128,92,48,0.04)')
  lowerShade.addColorStop(1, 'rgba(128,92,48,0)')
  ctx.fillStyle = lowerShade
  ctx.fillRect(0, 0, width, height)

  const grain = getGrainPattern(ctx)
  if (grain) {
    ctx.globalAlpha = 0.1
    ctx.fillStyle = grain
    ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = 1
  }

  ctx.restore()
}

export function paintCardFacePatch(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  bgColor = '#fdf8f0',
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  paintCardFaceBase(ctx, width, height, bgColor)
  ctx.restore()
}

function getGrainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grainPatterns.has(ctx)) return grainPatterns.get(ctx) ?? null

  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 48
  const g = canvas.getContext('2d')
  if (!g) {
    grainPatterns.set(ctx, null)
    return null
  }

  g.clearRect(0, 0, canvas.width, canvas.height)
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const n = hash2d(x, y)
      if (n < 0.5) continue
      const alpha = (n - 0.5) * 0.055
      g.fillStyle = n > 0.78 ? `rgba(255,255,255,${alpha})` : `rgba(78,52,28,${alpha})`
      g.fillRect(x, y, 1, 1)
    }
  }

  const pattern = ctx.createPattern(canvas, 'repeat')
  grainPatterns.set(ctx, pattern)
  return pattern
}

function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return n - Math.floor(n)
}

function parseColor(color: string): Rgb {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return {
      r: parseInt(color.slice(1, 3), 16),
      g: parseInt(color.slice(3, 5), 16),
      b: parseInt(color.slice(5, 7), 16),
    }
  }
  return { r: 253, g: 248, b: 240 }
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount))
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  }
}

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color.r},${color.g},${color.b},${alpha})`
}
