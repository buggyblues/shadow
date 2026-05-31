// Dev script: build main/preload, run the real web dev server, run the
// desktop-local dev server, then launch Electron.
import { execSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')
const webRoot = resolve(root, '../web')
const connectorRoot = resolve(root, '../../packages/connector')
const env = { ...process.env, NODE_ENV: 'development' }
const defaultServerBaseUrl = 'https://shadowob.com'
const desktopWebDevPort = process.env.DESKTOP_WEB_DEV_PORT ?? '39100'
const desktopLocalDevPort = process.env.DESKTOP_LOCAL_DEV_PORT ?? '39110'
const persistedDesktopSettingsPath = desktopSettingsPath()
const persistedDesktopApiOrigin = readPersistedDesktopApiOrigin()
const desktopApiOrigin = persistedDesktopApiOrigin ?? normalizeHttpOrigin(defaultServerBaseUrl)
const desktopApiOriginSource = persistedDesktopApiOrigin ? 'desktop-settings' : 'default'

function normalizeHttpOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function desktopSettingsPath() {
  if (process.env.SHADOW_DESKTOP_SETTINGS_PATH) return process.env.SHADOW_DESKTOP_SETTINGS_PATH
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library/Application Support/Shadow/desktop-settings.json')
  }
  if (process.platform === 'win32') {
    return join(
      process.env.APPDATA || join(homedir(), 'AppData/Roaming'),
      'Shadow',
      'desktop-settings.json',
    )
  }
  return join(
    process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
    'Shadow',
    'desktop-settings.json',
  )
}

function readPersistedDesktopApiOrigin() {
  const path = persistedDesktopSettingsPath
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return normalizeHttpOrigin(parsed?.serverBaseUrl)
  } catch {
    return null
  }
}

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

const webServer = startDevServer({
  label: `web renderer dev server (apps/web on :${desktopWebDevPort})`,
  cwd: webRoot,
  args: ['rsbuild', 'dev', '-c', 'rsbuild.config.ts', '--port', desktopWebDevPort],
  env: {
    ...env,
    SHADOW_DESKTOP_DYNAMIC_PROXY: '1',
    SHADOW_DESKTOP_SETTINGS_PATH: persistedDesktopSettingsPath,
  },
})

const localServer = startDevServer({
  label: `desktop local renderer dev server (desktop-local on :${desktopLocalDevPort})`,
  cwd: root,
  args: ['rsbuild', 'dev', '-c', 'rsbuild.renderer.config.mts', '--port', desktopLocalDevPort],
  env,
})

await Promise.all([webServer.ready, localServer.ready])

const webUrl = devServerOrigin(webServer.url, `http://localhost:${desktopWebDevPort}`)
const localUrl = devServerOrigin(localServer.url, `http://localhost:${desktopLocalDevPort}`)

console.log(
  `[dev] Launching Electron with web renderer at ${webUrl} and settings-driven API proxy ${desktopApiOrigin} (${desktopApiOriginSource}; ${persistedDesktopSettingsPath})...`,
)
const electronPath = String((await import('electron')).default)
const electron = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...env,
    DESKTOP_WEB_DEV_URL: webUrl,
    DESKTOP_LOCAL_DEV_URL: localUrl,
  },
})

electron.on('exit', (code) => {
  webServer.child.kill()
  localServer.child.kill()
  process.exit(code ?? 0)
})

const cleanup = () => {
  webServer.child.kill()
  localServer.child.kill()
  electron.kill()
  process.exit(0)
}
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
