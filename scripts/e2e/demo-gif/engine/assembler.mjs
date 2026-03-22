/**
 * Demo GIF Engine — GIF Assembler
 *
 * Assembles a sequence of PNG frames into an animated GIF using ffmpeg's
 * two-pass palettegen/paletteuse pipeline for high-quality dithering.
 *
 * Requires ffmpeg ≥ 5.x on PATH.
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Check whether ffmpeg is available on the system PATH.
 */
export function checkFfmpeg() {
  try {
    execSync('which ffmpeg', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Assemble an animated GIF from a directory of sequentially named PNG
 * frames plus a frame list with per-frame durations.
 *
 * @param {string} framesDir — directory containing the PNG frames
 * @param {string} outputPath — output .gif path
 * @param {{ name: string, duration: number }[]} frames — ordered frame list
 * @param {{ maxColors?: number, dither?: string, bayerScale?: number }} [opts]
 */
export async function assembleGif(framesDir, outputPath, frames, opts = {}) {
  const maxColors = opts.maxColors ?? 160
  const dither = opts.dither ?? 'bayer'
  const bayerScale = opts.bayerScale ?? 2

  // Build ffmpeg concat demuxer input
  const lines = frames.map(
    (f) => `file '${f.name}'\nduration ${(f.duration / 1000).toFixed(3)}`,
  )
  lines.push(`file '${frames.at(-1).name}'`)
  await fs.writeFile(path.join(framesDir, 'concat.txt'), lines.join('\n'), 'utf8')

  const pal = path.join(framesDir, 'palette.png')

  // Pass 1: generate palette
  execSync(
    `ffmpeg -y -f concat -safe 0 -i concat.txt -vf "palettegen=max_colors=${maxColors}:stats_mode=diff" "${pal}"`,
    { cwd: framesDir, stdio: 'pipe' },
  )

  // Pass 2: encode GIF
  execSync(
    `ffmpeg -y -f concat -safe 0 -i concat.txt -i "${pal}" -lavfi "paletteuse=dither=${dither}:bayer_scale=${bayerScale}" -loop 0 "${outputPath}"`,
    { cwd: framesDir, stdio: 'pipe' },
  )
}
