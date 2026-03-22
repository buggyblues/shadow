/**
 * Demo GIF Engine — Core Renderer
 *
 * Generic rendering pipeline that processes a scene list and produces
 * animated GIF(s) using pluggable theme functions for branding.
 *
 * The renderer is product-agnostic: all brand-specific visuals (title
 * card backgrounds, logos, colour tokens) are supplied via a **theme**
 * object so that any project can reuse the same pipeline.
 *
 * Usage:
 *   import { renderGif } from './engine/renderer.mjs'
 *   await renderGif({ sharp, config, scenesFor, locales, theme, paths })
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import { easeInOutCubic, crossfade, zoomAtT, zoomCrop, highlightSvg, labelBadgeSvg } from './effects.mjs'
import { checkFfmpeg, assembleGif } from './assembler.mjs'

// ── Frame writer ────────────────────────────────────────

class FrameWriter {
  constructor(dir) {
    this.dir = dir
    this.idx = 0
    this.frames = []
  }

  async emit(buf, duration) {
    const name = `frame-${String(this.idx++).padStart(4, '0')}.png`
    await fs.writeFile(path.join(this.dir, name), buf)
    this.frames.push({ name, duration })
  }
}

// ── Scene rendering helpers ─────────────────────────────

async function loadBaseFrame(sharp, source, framesDir, W, H) {
  const raw = await fs.readFile(path.join(framesDir, source))
  return sharp(raw).resize(W, H).ensureAlpha().png().toBuffer()
}

async function annotateFrame(sharp, buf, scene, W, H, style) {
  const overlays = []
  if (scene.highlight) {
    const color = style.accentColor ?? '#00f3ff'
    overlays.push({ input: Buffer.from(highlightSvg(scene.highlight, W, H, color)), top: 0, left: 0 })
  }
  if (scene.label) {
    overlays.push({ input: Buffer.from(labelBadgeSvg(scene.label, W, H, style)), top: 0, left: 0 })
  }
  if (overlays.length === 0) return buf
  return sharp(buf).composite(overlays).png().toBuffer()
}

// ── Main pipeline ───────────────────────────────────────

/**
 * Render one or more animated GIFs from a scene script.
 *
 * @param {object} opts
 * @param {Function}  opts.sharp     — sharp constructor (caller supplies version)
 * @param {object}    opts.config    — timing config (durations, delays, frame counts)
 * @param {Function}  opts.scenesFor — (lang) => Scene[]  — i18n scene resolver
 * @param {string[]}  opts.locales   — e.g. ['en', 'zh']
 * @param {object}    opts.theme     — brand-specific rendering functions
 * @param {Function}  opts.theme.renderTitleFrame(sharp, scene, W, H, charCount, lang)
 * @param {object}    opts.theme.style — { font, accentColor, accentMuted, … }
 * @param {object}    opts.paths     — directory paths
 * @param {string}    opts.paths.framesDir   — Playwright-captured PNGs
 * @param {string}    opts.paths.showcaseDir — output base dir
 */
export async function renderGif(opts) {
  const { sharp, config, scenesFor, locales, theme, paths } = opts
  const { framesDir, showcaseDir } = paths

  console.log('Demo GIF Engine\n')

  // Verify frame sources from the first locale
  const enScenes = scenesFor(locales[0])
  for (const s of enScenes) {
    if (s.type !== 'frame') continue
    try {
      await fs.access(path.join(framesDir, s.source))
    } catch {
      console.error(`Missing: ${s.source}\nRun the Playwright capture step first.`)
      process.exit(1)
    }
  }

  // Compute canvas dimensions from first product frame
  const first = enScenes.find((s) => s.type === 'frame')
  const W = config.outputWidth
  let H
  if (first) {
    const meta = await sharp(await fs.readFile(path.join(framesDir, first.source))).metadata()
    H = Math.round(meta.height * (W / meta.width))
  } else {
    H = Math.round(W * 0.636)
  }
  console.log(`  Canvas: ${W}×${H}\n`)

  if (!checkFfmpeg()) {
    console.error('  ffmpeg not found — brew install ffmpeg')
    process.exit(1)
  }

  const style = theme.style ?? {}

  for (const lang of locales) {
    const suffix = lang === locales[0] ? '' : `-${lang}`
    const gifDir = path.join(showcaseDir, `gif-frames${suffix}`)
    const outPath = path.join(showcaseDir, `demo${suffix}.gif`)
    const scenes = scenesFor(lang)

    console.log(`  ── ${lang.toUpperCase()} ──`)

    await fs.rm(gifDir, { recursive: true, force: true })
    await fs.mkdir(gifDir, { recursive: true })

    const writer = new FrameWriter(gifDir)

    // Pre-build "hold" images for crossfade targets
    const holdImages = []
    for (const scene of scenes) {
      if (scene.type === 'title') {
        holdImages.push(await theme.renderTitleFrame(sharp, scene, W, H, Infinity, lang))
      } else {
        const base = await loadBaseFrame(sharp, scene.source, framesDir, W, H)
        holdImages.push(await annotateFrame(sharp, base, scene, W, H, style))
      }
      process.stdout.write(`  ✓ ${scene.id}\n`)
    }
    console.log(`\n  ${scenes.length} scenes ready. Rendering frames…\n`)

    // Render all frames
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]

      if (scene.type === 'title') {
        if (scene.typewriter) {
          const fullText = scene.text.replace(/\n/g, '')
          const totalChars = fullText.length
          const step = totalChars <= 10 ? 1 : Math.max(1, Math.round(totalChars / 14))
          for (let c = step; c < totalChars; c += step) {
            const frame = await theme.renderTitleFrame(sharp, scene, W, H, c, lang)
            await writer.emit(frame, config.typewriterDelay * step)
          }
        }
        await writer.emit(holdImages[i], scene.duration)
      }

      if (scene.type === 'frame') {
        const base = await loadBaseFrame(sharp, scene.source, framesDir, W, H)

        if (scene.zoom) {
          const annotated = await annotateFrame(sharp, base, scene, W, H, style)
          await writer.emit(annotated, scene.duration)

          const n = config.zoomFrames
          for (let f = 1; f <= n; f++) {
            const t = easeInOutCubic(f / n)
            const zoomed = await zoomAtT(sharp, base, scene.zoom, t, W, H)
            await writer.emit(zoomed, config.zoomFrameDelay)
          }
          const zoomedFull = await zoomCrop(sharp, base, scene.zoom, scene.zoom.scale, W, H)
          await writer.emit(zoomedFull, config.frameZoomedDuration ?? 1200)
          for (let f = n - 1; f >= 0; f--) {
            const t = easeInOutCubic(f / n)
            const zoomed = await zoomAtT(sharp, base, scene.zoom, t, W, H)
            await writer.emit(zoomed, config.zoomFrameDelay)
          }
          holdImages[i] = annotated
        } else {
          await writer.emit(holdImages[i], scene.duration)
        }
      }

      // Crossfade to next scene
      if (i < scenes.length - 1) {
        const n = config.crossfadeFrames
        const src = holdImages[i]
        let dst = holdImages[i + 1]
        if (scenes[i + 1].type === 'title' && scenes[i + 1].typewriter) {
          dst = await theme.renderTitleFrame(sharp, scenes[i + 1], W, H, 0, lang)
        }
        for (let f = 1; f <= n; f++) {
          const t = easeInOutCubic(f / (n + 1))
          const blended = await crossfade(sharp, src, dst, t, W, H)
          await writer.emit(blended, config.crossfadeDelay)
        }
      }
    }

    console.log(`  ${writer.frames.length} frames rendered`)
    console.log('  Assembling GIF…')
    await assembleGif(gifDir, outPath, writer.frames)

    const stats = await fs.stat(outPath)
    const mb = (stats.size / 1024 / 1024).toFixed(2)
    console.log(`  ✓ ${path.relative(paths.showcaseDir, outPath) || path.basename(outPath)} (${mb} MB)\n`)
  }
}
