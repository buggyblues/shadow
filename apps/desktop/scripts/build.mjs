// Build script: build all three targets with rspack in production mode
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')
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

console.log('[build] Building renderer (rsbuild)...')
execSync('npx rsbuild build -c rsbuild.renderer.config.ts', { cwd: root, stdio: 'inherit', env })

// Bundle OpenClaw gateway + plugins (skip if SKIP_OPENCLAW_BUNDLE=1)
console.log('[build] Bundling OpenClaw...')
execSync('node scripts/bundle-openclaw.mjs', { cwd: root, stdio: 'inherit', env })

console.log('[build] Done!')
