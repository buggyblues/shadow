import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const [inputDirectoryArg, outputFileArg] = process.argv.slice(2)

if (!inputDirectoryArg || !outputFileArg) {
  throw new Error('Usage: node frames-to-video.mjs <recording-directory> <output.mp4>')
}

const inputDirectory = resolve(inputDirectoryArg)
const outputFile = resolve(outputFileArg)
const frames = JSON.parse(await readFile(`${inputDirectory}/frames.json`, 'utf8'))

if (!Array.isArray(frames) || frames.length < 2) {
  throw new Error(`Recording has too few frames: ${inputDirectory}`)
}

const concatLines = ['ffconcat version 1.0']
for (let index = 0; index < frames.length - 1; index += 1) {
  const current = frames[index]
  const next = frames[index + 1]
  const duration = Math.max(1 / 120, Number(next.timestamp) - Number(current.timestamp))
  concatLines.push(`file '${resolve(inputDirectory, current.file).replaceAll("'", "'\\''")}'`)
  concatLines.push(`duration ${duration.toFixed(6)}`)
}
const lastFrame = resolve(inputDirectory, frames.at(-1).file).replaceAll("'", "'\\''")
concatLines.push(`file '${lastFrame}'`)
concatLines.push(`duration ${(1 / 30).toFixed(6)}`)
concatLines.push(`file '${lastFrame}'`)

const concatFile = `${inputDirectory}/frames.ffconcat`
await writeFile(concatFile, `${concatLines.join('\n')}\n`)

const result = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-hide_banner',
    '-loglevel',
    'warning',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatFile,
    '-vf',
    'fps=30,scale=1920:1080:flags=lanczos',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputFile,
  ],
  { encoding: 'utf8' },
)

if (result.status !== 0) {
  throw new Error(result.stderr || `ffmpeg exited with status ${result.status}`)
}

console.log(
  JSON.stringify({
    frames: frames.length,
    duration: Number(frames.at(-1).timestamp) - Number(frames[0].timestamp),
    outputFile,
  }),
)
