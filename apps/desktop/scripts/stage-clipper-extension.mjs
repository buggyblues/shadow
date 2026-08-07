import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = fileURLToPath(new URL('.', import.meta.url))
const desktopRoot = resolve(scriptsDir, '..')
const target = resolve(desktopRoot, 'dist/clipper-extension')
const candidates = [
  process.env.SHADOW_CLIPPER_EXTENSION_PATH,
  join(homedir(), 'Documents', 'clipper', 'dist'),
  join(homedir(), 'Projects', 'clipper', 'dist'),
].filter(Boolean)

const source = candidates.find((candidate) => {
  const manifestPath = join(resolve(candidate), 'manifest.json')
  if (!existsSync(manifestPath)) return false
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    return manifest.manifest_version === 3 && typeof manifest.name === 'string'
  } catch {
    return false
  }
})

if (!source) {
  console.warn(
    '[build] Shadow Clipper extension was not staged. Set SHADOW_CLIPPER_EXTENSION_PATH for release builds.',
  )
  process.exit(0)
}

rmSync(target, { force: true, recursive: true })
cpSync(resolve(source), target, { recursive: true })
console.log(`[build] Staged Shadow Clipper from ${resolve(source)}`)
