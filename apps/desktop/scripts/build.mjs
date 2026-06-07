// Build script: build main/preload and desktop-only local windows. The community
// frontend is always loaded directly from the configured App base URL.
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')
const sharedRoot = resolve(root, '../../packages/shared')
const connectorRoot = resolve(root, '../../packages/connector')
const env = { ...process.env, NODE_ENV: 'production' }

console.log('[build] Building shared package...')
execSync('pnpm build', {
  cwd: sharedRoot,
  stdio: 'inherit',
  env,
})

console.log('[build] Building shared connector package...')
execSync('pnpm build', {
  cwd: connectorRoot,
  stdio: 'inherit',
  env,
})

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

console.log('[build] Building desktop local renderer...')
execSync('npx rsbuild build -c rsbuild.renderer.config.mts', {
  cwd: root,
  stdio: 'inherit',
  env,
})

console.log('[build] Done!')
