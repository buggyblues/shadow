import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { listPluginLibrary } from '../src/application/plugin-library.js'

const execFileAsync = promisify(execFile)
const packageRoot = resolve(import.meta.dirname, '..')
const outputDir = join(packageRoot, 'src/assets/connector-icons')
const hiddenPluginIds = new Set([
  'agent-pack',
  'claude-plugin',
  'model-provider',
  'shadowob',
  'skills',
])
const USER_AGENT = 'Mozilla/5.0 (compatible; ShadowConnectorIconSync/1.0; +https://shadow.ob)'
const ICON_DISCOVERY_WEBSITE: Record<string, string> = {
  'taobao-aipaas': 'https://www.alibabagroup.com',
}
const ICON_SOURCE_OVERRIDE: Record<string, string> = {
  // Yuque's apple-touch icon is a monochrome mask. Its official shortcut icon carries the product mark.
  yuque:
    'https://mdn.alipayobjects.com/huamei_0prmtq/afts/img/A*vMxOQIh4KBMAAAAAAAAAAAAADvuFAQ/original',
}

type IconSourceRecord = {
  website: string
  sourceUrl: string | null
  sourceType: 'official-site' | 'official-favicon-cache' | 'generated-fallback'
  sha256: string
  visualBounds: { width: number; height: number; x: number; y: number }
}

function htmlAttribute(tag: string, name: string) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null
}

function iconCandidates(html: string, website: string) {
  const candidates: Array<{ url: string; score: number }> = []
  const parsedWebsite = new URL(website)
  const githubOwner =
    parsedWebsite.hostname === 'github.com'
      ? parsedWebsite.pathname.split('/').filter(Boolean)[0]
      : undefined
  if (githubOwner) {
    candidates.push({
      url: `https://github.com/${encodeURIComponent(githubOwner)}.png?size=256`,
      score: 20_000,
    })
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = htmlAttribute(tag, 'rel')?.toLowerCase() ?? ''
    if (!rel.includes('icon')) continue
    const href = htmlAttribute(tag, 'href')
    if (!href || href.startsWith('data:')) continue
    const sizes = htmlAttribute(tag, 'sizes') ?? ''
    const size = Math.max(
      0,
      ...[...sizes.matchAll(/(\d+)x(\d+)/g)].map((match) => Number(match[1]) || 0),
    )
    const type = htmlAttribute(tag, 'type')?.toLowerCase() ?? ''
    const score =
      (rel.includes('apple-touch-icon') ? 10_000 : 0) +
      (type.includes('svg') || href.endsWith('.svg') ? 5_000 : 0) +
      size
    try {
      candidates.push({ url: new URL(href, website).toString(), score })
    } catch {
      // Ignore malformed icon links from third-party page content.
    }
  }
  const origin = parsedWebsite.origin
  candidates.push({ url: `${origin}/favicon.ico`, score: -1 })
  return [
    ...new Map(
      candidates.sort((a, b) => b.score - a.score).map((item) => [item.url, item]),
    ).values(),
  ]
}

async function download(url: string) {
  const response = await fetch(url, {
    headers: { Accept: 'image/*,*/*;q=0.8', 'User-Agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) {
    throw new Error(`Unexpected icon size: ${bytes.length}`)
  }
  return { bytes, finalUrl: response.url || url }
}

async function convertToPng(input: Buffer, outputPath: string, workDir: string) {
  const inputPath = join(workDir, 'source-image')
  await writeFile(inputPath, input)
  const { stdout: alphaBounds } = await execFileAsync('magick', [
    `${inputPath}[0]`,
    '-alpha',
    'extract',
    '-threshold',
    '1',
    '-trim',
    '-format',
    '%@',
    'info:',
  ])
  const cropGeometry = /^\d+x\d+[-+]\d+[-+]\d+$/.test(alphaBounds.trim())
    ? alphaBounds.trim()
    : undefined
  await execFileAsync('magick', [
    `${inputPath}[0]`,
    ...(cropGeometry ? ['-crop', cropGeometry, '+repage'] : []),
    '-background',
    'none',
    '-alpha',
    'on',
    '-resize',
    '116x116',
    '-gravity',
    'center',
    '-extent',
    '128x128',
    '-strip',
    outputPath,
  ])
}

async function readVisualBounds(path: string) {
  const { stdout } = await execFileAsync('magick', ['identify', '-format', '%@', path])
  const match = /^(\d+)x(\d+)\+(-?\d+)\+(-?\d+)$/.exec(stdout.trim())
  if (!match) throw new Error(`Cannot read icon visual bounds: ${stdout}`)
  return {
    width: Number(match[1]),
    height: Number(match[2]),
    x: Number(match[3]),
    y: Number(match[4]),
  }
}

async function generatedFallback(_name: string, outputPath: string) {
  await execFileAsync('magick', [
    '-size',
    '128x128',
    'xc:none',
    '-fill',
    '#111827',
    '-draw',
    'roundrectangle 8,8 120,120 28,28',
    '-fill',
    '#67e8f9',
    '-draw',
    'circle 64,64 64,38',
    '-fill',
    '#111827',
    '-draw',
    'circle 64,64 64,51',
    '-strip',
    outputPath,
  ])
}

async function syncIcon(plugin: ReturnType<typeof listPluginLibrary>[number]) {
  if (!plugin.website) throw new Error(`${plugin.id} has no official website`)
  const discoveryWebsite = ICON_DISCOVERY_WEBSITE[plugin.id] ?? plugin.website
  const workDir = await mkdtemp(join(tmpdir(), `shadow-connector-${plugin.id}-`))
  const outputPath = join(outputDir, `${plugin.id}.png`)
  try {
    let html = ''
    try {
      const page = await fetch(discoveryWebsite, {
        headers: { Accept: 'text/html,*/*;q=0.8', 'User-Agent': USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      })
      if (page.ok) html = await page.text()
    } catch {
      // The origin favicon fallback below may still be available.
    }

    const candidates = iconCandidates(html, discoveryWebsite)
    const sourceOverride = ICON_SOURCE_OVERRIDE[plugin.id]
    if (sourceOverride) candidates.unshift({ url: sourceOverride, score: 30_000 })
    for (const candidate of candidates) {
      try {
        const downloaded = await download(candidate.url)
        await convertToPng(downloaded.bytes, outputPath, workDir)
        const png = await readFile(outputPath)
        return {
          website: plugin.website,
          sourceUrl: downloaded.finalUrl,
          sourceType: 'official-site',
          sha256: createHash('sha256').update(png).digest('hex'),
          visualBounds: await readVisualBounds(outputPath),
        } satisfies IconSourceRecord
      } catch {
        // Try the next official icon declared by the site.
      }
    }

    try {
      const cached = await download(
        `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(discoveryWebsite)}&sz=128`,
      )
      await convertToPng(cached.bytes, outputPath, workDir)
      const png = await readFile(outputPath)
      return {
        website: plugin.website,
        sourceUrl: cached.finalUrl,
        sourceType: 'official-favicon-cache',
        sha256: createHash('sha256').update(png).digest('hex'),
        visualBounds: await readVisualBounds(outputPath),
      } satisfies IconSourceRecord
    } catch {
      // A generated fallback still guarantees that every connector has an icon.
    }

    await generatedFallback(plugin.name, outputPath)
    const png = await readFile(outputPath)
    return {
      website: plugin.website,
      sourceUrl: null,
      sourceType: 'generated-fallback',
      sha256: createHash('sha256').update(png).digest('hex'),
      visualBounds: await readVisualBounds(outputPath),
    } satisfies IconSourceRecord
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  const requestedIds = new Set(process.argv.slice(2))
  const plugins = listPluginLibrary().filter(
    (plugin) =>
      !hiddenPluginIds.has(plugin.id) && (requestedIds.size === 0 || requestedIds.has(plugin.id)),
  )
  const sourcesPath = join(outputDir, 'sources.json')
  let sources: Record<string, IconSourceRecord> = {}
  try {
    sources = JSON.parse(await readFile(sourcesPath, 'utf8')) as Record<string, IconSourceRecord>
  } catch {
    // The first sync creates the source manifest.
  }
  for (const [index, plugin] of plugins.entries()) {
    sources[plugin.id] = await syncIcon(plugin)
    console.log(`[${index + 1}/${plugins.length}] ${plugin.id}: ${sources[plugin.id]?.sourceType}`)
  }
  await writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`)
  const fallbackIds = Object.entries(sources)
    .filter(([, source]) => source.sourceType === 'generated-fallback')
    .map(([id]) => id)
  console.log(
    `Synced ${plugins.length} connector icons; remaining fallbacks: ${fallbackIds.join(', ') || 'none'}`,
  )
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
