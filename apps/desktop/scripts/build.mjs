// Build script: build main/preload, copy the exact web artifact, and build
// desktop-only local windows separately.
import { execSync } from 'node:child_process'
import { cpSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')
const webRoot = resolve(root, '../web')
const connectorRoot = resolve(root, '../../packages/connector')
const webDist = resolve(webRoot, 'dist')
const rendererDist = resolve(root, 'dist/renderer')
const env = { ...process.env, NODE_ENV: 'production' }

console.log('[build] Building main process...')
execSync('npx rspack build -c rspack.main.config.mjs --mode production', {
  cwd: root,
  stdio: 'inherit',
  env,
})

console.log('[build] Building preload...')
execSync('npx rspack build -c rspack.preload.config.mjs --mode production', {
  cwd: root,
  stdio: 'inherit',
  env,
})

console.log('[build] Building shared connector package...')
execSync('pnpm build', {
  cwd: connectorRoot,
  stdio: 'inherit',
  env,
})

console.log('[build] Building web renderer with apps/web config...')
execSync('npx rsbuild build -c rsbuild.config.ts', {
  cwd: webRoot,
  stdio: 'inherit',
  env,
})

console.log('[build] Copying web renderer artifact...')
rmSync(rendererDist, { recursive: true, force: true })
cpSync(webDist, rendererDist, { recursive: true })

console.log('[build] Building desktop local renderer...')
execSync('npx rsbuild build -c rsbuild.renderer.config.mts', {
  cwd: root,
  stdio: 'inherit',
  env,
})

console.log('[build] Done!')
