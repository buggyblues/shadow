#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const defaultScenes = [
  ['CapCut Marketing Video', 'From hours to minutes'],
  ['The growth team bottleneck', 'Briefs, edits, captions, versions'],
  ['AI video studio', 'Templates, captions, dubbing'],
  ['One creator, many channels', 'Launch faster with reusable assets'],
  ['Ready for review', 'Clear message, brand-safe CTA'],
  ['Create with CapCut', 'Ship the next campaign'],
]

function parseArgs(argv) {
  const args = { duration: 36, width: 1280, height: 720, json: true }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    const next = argv[i + 1]
    if (key === '--help' || key === '-h') args.help = true
    else if (key === '--script') args.script = next && argv[++i]
    else if (key === '--output') args.output = next && argv[++i]
    else if (key === '--title') args.title = next && argv[++i]
    else if (key === '--duration') args.duration = Number(next && argv[++i])
    else if (key === '--width') args.width = Number(next && argv[++i])
    else if (key === '--height') args.height = Number(next && argv[++i])
    else if (key === '--no-json') args.json = false
    else throw new Error(`Unknown argument: ${key}`)
  }
  return args
}

function usage() {
  return [
    'Usage: shadow-video-render --script <script.md> --output <video.mp4> [--title <title>]',
    '',
    'Creates a low-memory fallback MP4 using ffmpeg color/drawtext/anullsrc only.',
  ].join('\n')
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 8 })
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`${command} exited ${result.status}: ${details}`.slice(0, 4000))
  }
  return result.stdout.trim()
}

function asciiText(value, fallback) {
  const clean = String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return clean || fallback
}

function pickScenes(scriptText, title) {
  const lines = scriptText
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, '')
        .replace(/^[-*]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .trim(),
    )
    .filter((line) => line.length >= 8 && line.length <= 120)

  const picked = []
  for (const pattern of [/hook/i, /problem|pain|痛点/i, /solution|功能|AI/i, /caption|字幕/i, /CTA|行动/i]) {
    const line = lines.find((item) => pattern.test(item) && !picked.includes(item))
    if (line) picked.push(line)
  }
  for (const line of lines) {
    if (picked.length >= 6) break
    if (!picked.includes(line)) picked.push(line)
  }

  const scenes = defaultScenes.map(([heading, subheading], index) => [
    index === 0 ? asciiText(title, heading).slice(0, 48) : heading,
    asciiText(picked[index], subheading).slice(0, 64),
  ])
  return scenes
}

function escapeDrawtext(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
}

function fontOption() {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  ]
  for (const candidate of candidates) {
    try {
      statSync(candidate)
      return `fontfile=${escapeDrawtext(candidate)}:`
    } catch {
      // try the next known font path
    }
  }
  return ''
}

function createSegment({ output, width, height, duration, color, heading, subheading, index }) {
  const font = fontOption()
  const filters = [
    `drawtext=${font}text='${escapeDrawtext(heading)}':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=230`,
    `drawtext=${font}text='${escapeDrawtext(subheading)}':fontcolor=0xd1d5db:fontsize=30:x=(w-text_w)/2:y=315`,
    `drawtext=${font}text='${String(index + 1).padStart(2, '0')} / 06':fontcolor=0x93c5fd:fontsize=22:x=w-150:y=h-70`,
  ].join(',')

  const baseArgs = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=${width}x${height}:d=${duration}:r=30`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
  ]

  try {
    run('ffmpeg', [...baseArgs.slice(0, 8), '-vf', filters, ...baseArgs.slice(8), output])
  } catch {
    run('ffmpeg', [...baseArgs, output])
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (!args.script || !args.output) throw new Error('Both --script and --output are required')
  const duration = Number.isFinite(args.duration) && args.duration > 0 ? args.duration : 36
  const width = Number.isFinite(args.width) && args.width > 0 ? args.width : 1280
  const height = Number.isFinite(args.height) && args.height > 0 ? args.height : 720
  const output = resolve(args.output)
  mkdirSync(dirname(output), { recursive: true })

  const scriptText = readFileSync(args.script, 'utf8')
  const scenes = pickScenes(scriptText, args.title)
  const tempDir = mkdtempSync(resolve(tmpdir(), 'shadow-video-render-'))
  const colors = ['0x111827', '0x172554', '0x064e3b', '0x3b0764', '0x7c2d12', '0x0f172a']
  const segmentDuration = Math.max(3, duration / scenes.length)

  try {
    const segments = scenes.map((scene, index) => {
      const segment = resolve(tempDir, `segment-${index}.mp4`)
      createSegment({
        output: segment,
        width,
        height,
        duration: segmentDuration,
        color: colors[index % colors.length],
        heading: scene[0],
        subheading: scene[1],
        index,
      })
      return segment
    })
    const concatFile = resolve(tempDir, 'concat.txt')
    writeFileSync(
      concatFile,
      segments.map((segment) => `file '${segment.replace(/'/g, "'\\''")}'`).join('\n'),
    )
    run('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatFile,
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-shortest',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      output,
    ])
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }

  const size = statSync(output).size
  const probedDuration = run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nokey=1:noprint_wrappers=1',
    output,
  ])
  const result = {
    ok: true,
    output,
    mimeType: 'video/mp4',
    size,
    duration: Number(probedDuration),
    width,
    height,
    scenes: scenes.map(([heading, subheading]) => ({ heading, subheading })),
  }
  if (args.json) console.log(JSON.stringify(result, null, 2))
  else console.log(output)
}

try {
  main()
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: String(error?.message ?? error) }, null, 2))
  process.exit(1)
}
