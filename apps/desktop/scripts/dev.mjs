// Dev script: build main/preload, run the desktop-local dev server, then launch
// Electron. The community frontend is loaded directly from the configured App
// base URL so desktop behavior stays aligned with the hosted web app.
import { execSync, spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')
const connectorRoot = resolve(root, '../../packages/connector')
const env = { ...process.env, NODE_ENV: 'development' }
const desktopLocalDevPort = process.env.DESKTOP_LOCAL_DEV_PORT ?? '39110'

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

console.log('[dev] Building shared connector package...')
execSync('pnpm build', {
  cwd: connectorRoot,
  stdio: 'inherit',
  env,
})

function startDevServer({ label, cwd, args, env: serverEnv }) {
  console.log(`[dev] Starting ${label}...`)
  const child = spawn('npx', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: serverEnv,
  })

  let devUrl = ''
  const ready = new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} startup timeout (60s)`)), 60000)
    let started = false

    child.stdout.on('data', (data) => {
      const text = data.toString()
      process.stdout.write(text)

      const urls = [...text.matchAll(/https?:\/\/localhost:\d+/g)].map((match) => match[0])
      if (!devUrl && urls[0]) {
        devUrl = urls[0]
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
        setTimeout(resolveReady, 500)
      }
    })
    child.stderr.on('data', (data) => process.stderr.write(data))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (!started) {
        clearTimeout(timeout)
        reject(new Error(`${label} exited with code ${code}`))
      }
    })
  })

  return {
    child,
    ready,
    get url() {
      return devUrl
    },
  }
}

function devServerOrigin(rawUrl, fallbackUrl) {
  try {
    return new URL(rawUrl || fallbackUrl).origin
  } catch {
    return fallbackUrl
  }
}

const localServer = startDevServer({
  label: `desktop local renderer dev server (desktop-local on :${desktopLocalDevPort})`,
  cwd: root,
  args: ['rsbuild', 'dev', '-c', 'rsbuild.renderer.config.mts', '--port', desktopLocalDevPort],
  env,
})

await localServer.ready

const localUrl = devServerOrigin(localServer.url, `http://localhost:${desktopLocalDevPort}`)

console.log(`[dev] Launching Electron with desktop-local renderer at ${localUrl}...`)
const electronPath = String((await import('electron')).default)
const electron = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...env,
    DESKTOP_LOCAL_DEV_URL: localUrl,
  },
})

electron.on('exit', (code) => {
  localServer.child.kill()
  process.exit(code ?? 0)
})

const cleanup = () => {
  localServer.child.kill()
  electron.kill()
  process.exit(0)
}
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
