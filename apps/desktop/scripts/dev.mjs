// Dev script: bundle openclaw, build main+preload, start renderer dev server (HMR), then launch Electron
import { execSync, spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')
const env = { ...process.env, NODE_ENV: 'development' }

// 0. Bundle OpenClaw gateway + plugin (ensures build/ is up to date)
console.log('[dev] Bundling OpenClaw resources...')
execSync('node scripts/bundle-openclaw.mjs', {
  cwd: root,
  stdio: 'inherit',
  env,
})

// 1. Build main and preload (one-shot)
console.log('[dev] Building main process...')
execSync('npx rspack build -c rspack.main.config.mjs --mode development', {
  cwd: root,
  stdio: 'inherit',
  env,
})

console.log('[dev] Building preload...')
execSync('npx rspack build -c rspack.preload.config.mjs --mode development', {
  cwd: root,
  stdio: 'inherit',
  env,
})

// 2. Start rsbuild dev server for renderer with HMR
console.log('[dev] Starting renderer dev server (HMR on :3100)...')
const devServer = spawn('npx', ['rsbuild', 'dev', '-c', 'rsbuild.renderer.config.ts'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env,
})

// Wait for dev server to be ready and extract the actual port
let devUrl = 'http://localhost:3100'
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Dev server startup timeout (60s)')), 60000)
  let started = false

  devServer.stdout.on('data', (data) => {
    const text = data.toString()
    process.stdout.write(text)

    // Extract the actual URL from rsbuild output (e.g., "Local:    http://localhost:3101/")
    const urlMatch = text.match(/Local:\s+(https?:\/\/localhost:\d+)/)
    if (urlMatch) {
      devUrl = urlMatch[1]
    }

    if (
      !started &&
      (text.includes('compiled') ||
        text.includes('Loopback:') ||
        text.includes('Local:') ||
        text.includes('ready'))
    ) {
      started = true
      clearTimeout(timeout)
      // Small delay to ensure server is fully accepting connections
      setTimeout(resolve, 500)
    }
  })
  devServer.stderr.on('data', (data) => process.stderr.write(data))
  devServer.on('error', reject)
  devServer.on('exit', (code) => {
    if (!started) {
      clearTimeout(timeout)
      reject(new Error(`Dev server exited with code ${code}`))
    }
  })
})

// 3. Launch Electron pointing at the dev server
console.log(`[dev] Launching Electron with renderer at ${devUrl}...`)
const electronPath = String((await import('electron')).default)
const electron = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...env, DESKTOP_DEV_URL: devUrl },
})

electron.on('exit', (code) => {
  devServer.kill()
  process.exit(code ?? 0)
})

const cleanup = () => {
  devServer.kill()
  electron.kill()
  process.exit(0)
}
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
