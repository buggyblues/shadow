import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { get as httpsGet } from 'node:https'
import { homedir, platform, tmpdir } from 'node:os'
import { dirname, resolve, sep } from 'node:path'

export const CONNECTOR_MANAGED_NODE_VERSION =
  process.env.SHADOW_CONNECTOR_NODE_VERSION?.trim() || '22.16.0'

const PATH_KEY = process.platform === 'win32' ? 'Path' : 'PATH'
const NODE_PLATFORM: Record<string, string | undefined> = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'win',
}
const NODE_ARCH: Record<string, string | undefined> = {
  x64: 'x64',
  arm64: 'arm64',
}

let loginShellPath: string | null | undefined
let cachedNvmBinDirs: string[] | undefined
let cachedConnectorPath: string | undefined

export function expandHome(value: string): string {
  return value.startsWith('~/') ? resolve(homedir(), value.slice(2)) : resolve(value)
}

export function connectorHome(): string {
  const override = process.env.SHADOW_CONNECTOR_HOME?.trim()
  return override ? expandHome(override) : resolve(homedir(), '.shadowob/connector')
}

function tempInstallAllowed(): boolean {
  return process.env.SHADOW_CONNECTOR_ALLOW_TEMP_HOME === '1'
}

function isPathInside(path: string, parent: string): boolean {
  const resolvedPath = resolve(path)
  const resolvedParent = resolve(parent)
  return resolvedPath === resolvedParent || resolvedPath.startsWith(`${resolvedParent}${sep}`)
}

function isSystemTempPath(path: string): boolean {
  return isPathInside(path, tmpdir())
}

export function assertDurableConnectorHome(): void {
  const root = connectorHome()
  if (!isSystemTempPath(root) || tempInstallAllowed()) return
  throw new Error(
    `${root} is under a system temporary directory and may be cleaned by the OS. ` +
      'Use the default ~/.shadowob/connector location, set SHADOW_CONNECTOR_HOME to a durable directory, ' +
      'or set SHADOW_CONNECTOR_ALLOW_TEMP_HOME=1 only for disposable tests.',
  )
}

export function managedNodeRoot(): string {
  return resolve(connectorHome(), 'node', `v${CONNECTOR_MANAGED_NODE_VERSION}`)
}

export function managedNodeBinDir(): string {
  return process.platform === 'win32' ? managedNodeRoot() : resolve(managedNodeRoot(), 'bin')
}

export function nodeGlobalRoot(): string {
  return resolve(connectorHome(), 'node-global')
}

export function nodeGlobalBinDir(): string {
  return process.platform === 'win32' ? nodeGlobalRoot() : resolve(nodeGlobalRoot(), 'bin')
}

function splitPath(value: string | undefined): string[] {
  return (value ?? '').split(process.platform === 'win32' ? ';' : ':').filter(Boolean)
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of paths) {
    const item = raw.trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

function readLoginShellPath(): string[] {
  if (process.env.SHADOW_CONNECTOR_SKIP_LOGIN_SHELL === '1') return []
  if (loginShellPath !== undefined) return splitPath(loginShellPath ?? '')
  const shells = dedupePaths(
    [process.env.SHELL, '/bin/zsh', '/bin/bash'].filter((item): item is string =>
      Boolean(item?.trim()),
    ),
  )
  for (const shell of shells) {
    const result = spawnSync(shell, ['-lc', 'printf %s "$PATH"'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1800,
    })
    if (result.status === 0 && result.stdout.trim()) {
      loginShellPath = result.stdout.trim()
      return splitPath(loginShellPath)
    }
  }
  loginShellPath = null
  return []
}

function nvmBinDirs(): string[] {
  if (cachedNvmBinDirs) return cachedNvmBinDirs
  const roots = dedupePaths(
    [process.env.NVM_DIR, resolve(homedir(), '.nvm')]
      .filter((item): item is string => Boolean(item?.trim()))
      .map(expandHome),
  )
  const bins: string[] = []
  if (process.env.NVM_BIN?.trim()) bins.push(process.env.NVM_BIN.trim())
  for (const root of roots) {
    const versionsDir = resolve(root, 'versions/node')
    if (!existsSync(versionsDir)) continue
    try {
      const versions = readdirSync(versionsDir)
        .filter((entry) => /^v?\d+\.\d+\.\d+/.test(entry))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      for (const version of versions) bins.push(resolve(versionsDir, version, 'bin'))
    } catch {
      // Ignore unreadable nvm directories.
    }
  }
  cachedNvmBinDirs = bins
  return bins
}

function windowsCommonBinDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  if (process.platform !== 'win32') return []
  const appData =
    env.APPDATA || (env.USERPROFILE ? resolve(env.USERPROFILE, 'AppData/Roaming') : '')
  const localAppData =
    env.LOCALAPPDATA || (env.USERPROFILE ? resolve(env.USERPROFILE, 'AppData/Local') : '')
  return [
    appData ? resolve(appData, 'npm') : '',
    localAppData ? resolve(localAppData, 'agy/bin') : '',
    localAppData ? resolve(localAppData, 'Microsoft/WinGet/Links') : '',
    localAppData ? resolve(localAppData, 'Microsoft/WindowsApps') : '',
    localAppData ? resolve(localAppData, 'Programs') : '',
    localAppData ? resolve(localAppData, 'Microsoft/WinGet/Packages') : '',
    env.USERPROFILE ? resolve(env.USERPROFILE, '.local/bin') : '',
  ].filter(Boolean)
}

function commonBinDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    ...windowsCommonBinDirs(env),
    resolve(homedir(), '.local/bin'),
    nodeGlobalBinDir(),
    managedNodeBinDir(),
    resolve(homedir(), '.npm-global/bin'),
    resolve(homedir(), '.npm/bin'),
    resolve(homedir(), '.volta/bin'),
    resolve(homedir(), '.bun/bin'),
    resolve(homedir(), '.deno/bin'),
    resolve(homedir(), '.cargo/bin'),
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]
}

export function connectorPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env === process.env && cachedConnectorPath) return cachedConnectorPath
  const value = dedupePaths([
    ...commonBinDirs(env),
    ...nvmBinDirs(),
    ...readLoginShellPath(),
    ...splitPath(env.PATH ?? env.Path),
  ]).join(process.platform === 'win32' ? ';' : ':')
  if (env === process.env) cachedConnectorPath = value
  return value
}

export function connectorProcessEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {
    ...env,
    SHADOW_CONNECTOR_HOME: connectorHome(),
    NPM_CONFIG_PREFIX: nodeGlobalRoot(),
    npm_config_prefix: nodeGlobalRoot(),
  }
  next[PATH_KEY] = connectorPath(env)
  next.PATH = next[PATH_KEY]
  return next
}

export function findCommandOnConnectorPath(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (command.includes('/') || (process.platform === 'win32' && command.includes('\\'))) {
    return isExecutableFile(command) ? command : null
  }
  const extensions =
    process.platform === 'win32'
      ? splitPath(env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').map((item) => item.toLowerCase())
      : ['']
  for (const dir of splitPath(connectorPath(env))) {
    for (const ext of extensions) {
      const candidate = resolve(dir, process.platform === 'win32' ? `${command}${ext}` : command)
      if (isExecutableFile(candidate)) return candidate
    }
  }
  return null
}

function isExecutableFile(path: string): boolean {
  try {
    const stat = statSync(path)
    if (!stat.isFile()) return false
    if (process.platform !== 'win32') accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function commandExistsOnConnectorPath(command: string, _args = ['--version']): boolean {
  return Boolean(findCommandOnConnectorPath(command))
}

function nodeAssetInfo(): {
  filename: string
  url: string
  shasumsUrl: string
  ext: '.tar.xz' | '.zip'
} {
  const nodePlatform = NODE_PLATFORM[process.platform]
  const nodeArch = NODE_ARCH[process.arch]
  if (!nodePlatform || !nodeArch) {
    throw new Error(`Unsupported managed Node platform: ${platform()}/${process.arch}`)
  }
  const ext = nodePlatform === 'win' ? '.zip' : '.tar.xz'
  const filename = `node-v${CONNECTOR_MANAGED_NODE_VERSION}-${nodePlatform}-${nodeArch}${ext}`
  const baseUrl = `https://nodejs.org/dist/v${CONNECTOR_MANAGED_NODE_VERSION}`
  return {
    filename,
    url: `${baseUrl}/${filename}`,
    shasumsUrl: `${baseUrl}/SHASUMS256.txt`,
    ext,
  }
}

function fetchBuffer(url: string, redirects = 5): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    if (redirects <= 0) {
      reject(new Error(`Too many redirects for ${url}`))
      return
    }
    const request = httpsGet(url, { headers: { 'User-Agent': 'shadowob-connector' } }, (res) => {
      const location = res.headers.location
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && location) {
        res.resume()
        resolvePromise(fetchBuffer(new URL(location, url).toString(), redirects - 1))
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode ?? 'unknown'} for ${url}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolvePromise(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    request.on('error', reject)
  })
}

function verifyNodeArchive(filename: string, archive: Buffer, shasums: string): void {
  const line = shasums
    .split(/\r?\n/)
    .find(
      (entry) => entry.trim().endsWith(`  ${filename}`) || entry.trim().endsWith(` ${filename}`),
    )
  const expected = line?.trim().split(/\s+/)[0]
  if (!expected) throw new Error(`No Node.js SHA-256 found for ${filename}`)
  const actual = createHash('sha256').update(archive).digest('hex')
  if (actual !== expected) {
    throw new Error(`Node.js SHA-256 mismatch for ${filename}: expected ${expected}, got ${actual}`)
  }
}

function runExtract(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: 'ignore' })
  if (result.status !== 0) {
    throw new Error(`Failed to extract managed Node.js archive with ${command}`)
  }
}

function extractNodeArchive(archivePath: string, outputDir: string, ext: '.tar.xz' | '.zip'): void {
  if (ext === '.tar.xz') {
    runExtract('tar', ['-xJf', archivePath, '-C', outputDir])
    return
  }
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `Expand-Archive -Force '${archivePath}' '${outputDir}'`],
    {
      stdio: 'ignore',
    },
  )
  if (result.status !== 0) runExtract('unzip', ['-q', archivePath, '-d', outputDir])
}

export async function ensureManagedNodeRuntime(options: {
  dryRun: boolean
  log?: (message: string) => void
}): Promise<{ binDir: string; root: string }> {
  if (!options.dryRun) assertDurableConnectorHome()
  const root = managedNodeRoot()
  const binDir = managedNodeBinDir()
  const nodeBinary = resolve(binDir, process.platform === 'win32' ? 'node.exe' : 'node')
  const npmBinary = resolve(binDir, process.platform === 'win32' ? 'npm.cmd' : 'npm')
  if (existsSync(nodeBinary) && existsSync(npmBinary)) return { binDir, root }

  if (options.dryRun) {
    options.log?.(`[dry-run] install Node.js v${CONNECTOR_MANAGED_NODE_VERSION} -> ${root}`)
    return { binDir, root }
  }

  const asset = nodeAssetInfo()
  const parent = dirname(root)
  const tmpDir = resolve(parent, `_node-${process.pid}-${Date.now()}`)
  const archivePath = resolve(parent, asset.filename)
  options.log?.(`[toolchain] Installing managed Node.js v${CONNECTOR_MANAGED_NODE_VERSION}`)
  mkdirSync(parent, { recursive: true })
  const [archive, shasums] = await Promise.all([
    fetchBuffer(asset.url),
    fetchBuffer(asset.shasumsUrl).then((buffer) => buffer.toString('utf8')),
  ])
  verifyNodeArchive(asset.filename, archive, shasums)
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
  writeFileSync(archivePath, archive)
  try {
    extractNodeArchive(archivePath, tmpDir, asset.ext)
    const extracted = readdirSync(tmpDir, { withFileTypes: true }).find((entry) =>
      entry.isDirectory(),
    )
    if (!extracted) throw new Error('Managed Node.js archive did not contain a directory')
    rmSync(root, { recursive: true, force: true })
    renameSync(resolve(tmpDir, extracted.name), root)
    if (process.platform !== 'win32') {
      chmodSync(nodeBinary, 0o755)
      chmodSync(npmBinary, 0o755)
    }
  } finally {
    rmSync(archivePath, { force: true })
    rmSync(tmpDir, { recursive: true, force: true })
  }
  return { binDir, root }
}

export function shellCommandNeedsNpm(command: string): boolean {
  return /(^|[;&|()\s])(?:npm|npx)(?:\.cmd)?(?:\s|$)/.test(command)
}
