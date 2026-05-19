import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import {
  CC_CONNECT_FORK_PACKAGE_VERSION,
  CC_CONNECT_FORK_REF,
  CC_CONNECT_FORK_REPO,
  CC_CONNECT_FORK_SHORT_REF,
} from './cc-connect-fork.js'

interface RunOptions {
  cwd?: string
  dryRun: boolean
  env?: NodeJS.ProcessEnv
}

export interface CcConnectInstallOptions {
  dryRun: boolean
  log?: (message: string) => void
}

export interface CcConnectInstallResult {
  binaryPath: string
  source: 'env' | 'cache' | 'release' | 'source'
}

export interface CcConnectBinaryStatus {
  binaryPath: string
  usable: boolean
  source: 'env' | 'cache'
}

const NAME = 'cc-connect'

const RELEASE_ARCHIVE_SHA256: Record<string, string> = {
  'cc-connect-v1.3.3-beta.5-darwin-amd64.tar.gz':
    '71677cd565f6ea79e186ffc1b842e4548faa3baeb2e3dd2ced25ab2e95c416a3',
  'cc-connect-v1.3.3-beta.5-darwin-arm64.tar.gz':
    'c1fc5a3d4cfe6db97a5d864ea844dbfd86345b89cea3d89871330568e6eb43cf',
  'cc-connect-v1.3.3-beta.5-linux-amd64.tar.gz':
    '812484d19733044c8c5d67d997a921e351e2ae4e9a200ce5ae258ab338400bc1',
  'cc-connect-v1.3.3-beta.5-linux-arm64.tar.gz':
    '290110a60e905f5e25f6133f52c1b3988ab6aeff1b1199318398cfef06f81e9a',
  'cc-connect-v1.3.3-beta.5-windows-amd64.zip':
    'a90f8a669a48412fc5896613173b5e9b3dc5fdebdee731b6f6b9d4625a200952',
  'cc-connect-v1.3.3-beta.5-windows-arm64.zip':
    '3c5ff24769d95c42b95a717949dc6369169c029e1110ab4bdd76d12e0043d283',
}

const PLATFORM_MAP: Record<string, string | undefined> = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
}

const ARCH_MAP: Record<string, string | undefined> = {
  x64: 'amd64',
  arm64: 'arm64',
}

function log(options: CcConnectInstallOptions, message: string): void {
  options.log?.(message)
}

function quoteArg(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value)
}

function expandHome(value: string): string {
  return value.startsWith('~/') ? resolve(homedir(), value.slice(2)) : resolve(value)
}

function installRoot(): string {
  const override = process.env.SHADOW_CC_CONNECT_HOME?.trim()
  return override ? expandHome(override) : resolve(homedir(), '.shadowob/connector/cc-connect')
}

function binaryName(): string {
  return process.platform === 'win32' ? `${NAME}.exe` : NAME
}

function cachedBinaryPath(): string {
  return resolve(installRoot(), CC_CONNECT_FORK_SHORT_REF, 'bin', binaryName())
}

function runCommand(command: string, args: string[], options: RunOptions): void {
  const rendered = [command, ...args].map(quoteArg).join(' ')
  if (options.dryRun) {
    console.log(`[dry-run] ${rendered}`)
    return
  }

  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status ?? 'unknown'}: ${rendered}`)
  }
}

function platformInfo(): { platform: string; arch: string; ext: '.tar.gz' | '.zip' } {
  const platform = PLATFORM_MAP[process.platform]
  const arch = ARCH_MAP[process.arch]
  if (!platform || !arch) {
    throw new Error(
      `Unsupported cc-connect platform: ${process.platform}/${process.arch}. Supported: linux/darwin/windows x64/arm64`,
    )
  }
  return { platform, arch, ext: platform === 'windows' ? '.zip' : '.tar.gz' }
}

function fetchBuffer(url: string, redirects = 5): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    if (redirects <= 0) {
      reject(new Error(`Too many redirects for ${url}`))
      return
    }

    const client = url.startsWith('https:') ? httpsGet : httpGet
    const request = client(url, { headers: { 'User-Agent': 'shadowob-connector' } }, (response) => {
      const location = response.headers.location
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        location
      ) {
        response.resume()
        const next = new URL(location, url).toString()
        resolvePromise(fetchBuffer(next, redirects - 1))
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`HTTP ${response.statusCode ?? 'unknown'} for ${url}`))
        return
      }

      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => resolvePromise(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    request.on('error', reject)
  })
}

function findExtractedBinary(dir: string): string | undefined {
  const expected = binaryName()
  const entries = readdirSync(dir)
  if (entries.includes(expected)) return resolve(dir, expected)
  return entries
    .filter((entry) => entry.startsWith(NAME))
    .map((entry) => resolve(dir, entry))
    .find((entry) =>
      process.platform === 'win32' ? entry.endsWith('.exe') : !entry.endsWith('.gz'),
    )
}

function extractReleaseArchive(archivePath: string, binDir: string, ext: '.tar.gz' | '.zip'): void {
  if (ext === '.tar.gz') {
    runCommand('tar', ['xzf', archivePath, '-C', binDir], { dryRun: false })
  } else {
    const unzip = spawnSync('unzip', ['-o', archivePath, '-d', binDir], { stdio: 'inherit' })
    if (unzip.status !== 0) {
      runCommand('powershell', ['-Command', `Expand-Archive -Force '${archivePath}' '${binDir}'`], {
        dryRun: false,
      })
    }
  }

  const extracted = findExtractedBinary(binDir)
  const target = resolve(binDir, binaryName())
  if (!extracted) throw new Error('cc-connect release archive did not contain a binary')
  if (extracted !== target) renameSync(extracted, target)
}

function verifyReleaseChecksum(filename: string, data: Buffer): void {
  const expected = RELEASE_ARCHIVE_SHA256[filename]
  if (!expected) throw new Error(`No pinned SHA-256 for ${filename}`)
  const actual = createHash('sha256').update(data).digest('hex')
  if (actual !== expected) {
    throw new Error(`SHA-256 mismatch for ${filename}: expected ${expected}, got ${actual}`)
  }
}

async function installFromRelease(
  binaryPath: string,
  options: CcConnectInstallOptions,
): Promise<boolean> {
  const { platform, arch, ext } = platformInfo()
  const version = `v${CC_CONNECT_FORK_PACKAGE_VERSION}`
  const filename = `${NAME}-${version}-${platform}-${arch}${ext}`
  const url = `https://github.com/${CC_CONNECT_FORK_REPO}/releases/download/${version}/${filename}`
  const binDir = dirname(binaryPath)
  const archivePath = resolve(binDir, `_release${ext}`)

  log(options, `[cc-connect] Trying fork release asset ${url}`)
  try {
    const data = await fetchBuffer(url)
    verifyReleaseChecksum(filename, data)
    mkdirSync(binDir, { recursive: true })
    writeFileSync(archivePath, data)
    extractReleaseArchive(archivePath, binDir, ext)
    rmSync(archivePath, { force: true })
    if (process.platform !== 'win32') chmodSync(binaryPath, 0o755)
    return true
  } catch (error) {
    rmSync(archivePath, { force: true })
    log(
      options,
      `[cc-connect] Fork release asset unavailable (${error instanceof Error ? error.message : String(error)}); building from source`,
    )
    return false
  }
}

async function ensureSourceArchive(options: CcConnectInstallOptions): Promise<string> {
  const sourceDir = resolve(installRoot(), CC_CONNECT_FORK_SHORT_REF, 'source')
  if (existsSync(resolve(sourceDir, 'go.mod'))) return sourceDir
  if (existsSync(sourceDir)) rmSync(sourceDir, { recursive: true, force: true })

  const parent = dirname(sourceDir)
  const extractDir = resolve(parent, `_source-${process.pid}-${Date.now()}`)
  const archivePath = resolve(parent, `${CC_CONNECT_FORK_SHORT_REF}.tar.gz`)
  const sourceUrl = `https://github.com/${CC_CONNECT_FORK_REPO}/archive/${CC_CONNECT_FORK_REF}.tar.gz`

  log(options, `[cc-connect] Pulling fork source ${sourceUrl}`)
  mkdirSync(parent, { recursive: true })
  const data = await fetchBuffer(sourceUrl)
  writeFileSync(archivePath, data)
  mkdirSync(extractDir, { recursive: true })
  try {
    runCommand('tar', ['xzf', archivePath, '-C', extractDir], { dryRun: false })
    const extracted = readdirSync(extractDir, { withFileTypes: true }).find((entry) =>
      entry.isDirectory(),
    )
    if (!extracted) throw new Error('cc-connect source archive did not contain a directory')
    mkdirSync(dirname(sourceDir), { recursive: true })
    renameSync(resolve(extractDir, extracted.name), sourceDir)
  } finally {
    rmSync(archivePath, { force: true })
    rmSync(extractDir, { recursive: true, force: true })
  }

  return sourceDir
}

async function buildFromSource(
  binaryPath: string,
  options: CcConnectInstallOptions,
): Promise<void> {
  const sourceDir = await ensureSourceArchive(options)
  const buildTime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const ldflags = [
    '-s',
    '-w',
    '-X',
    'main.version=dev',
    '-X',
    `main.commit=${CC_CONNECT_FORK_SHORT_REF}`,
    '-X',
    `main.buildTime=${buildTime}`,
  ].join(' ')

  mkdirSync(dirname(binaryPath), { recursive: true })
  runCommand(
    'go',
    ['build', '-tags', 'no_web', '-ldflags', ldflags, '-o', binaryPath, './cmd/cc-connect'],
    {
      cwd: sourceDir,
      dryRun: false,
      env: goBuildEnv(),
    },
  )
  if (process.platform !== 'win32') chmodSync(binaryPath, 0o755)
}

function goBuildEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CGO_ENABLED: '0',
    GOPROXY: process.env.SHADOW_CC_CONNECT_GOPROXY?.trim() || 'https://proxy.golang.org,direct',
    GOSUMDB:
      process.env.SHADOW_CC_CONNECT_GOSUMDB?.trim() || process.env.GOSUMDB || 'sum.golang.org',
  }
}

function binaryLooksUsable(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    const out = execFileSync(path, ['--version'], { encoding: 'utf8', timeout: 5000 })
    return out.includes(CC_CONNECT_FORK_SHORT_REF) || out.includes(CC_CONNECT_FORK_PACKAGE_VERSION)
  } catch {
    return false
  }
}

export function getCcConnectBinaryStatus(): CcConnectBinaryStatus {
  const override = process.env.SHADOW_CC_CONNECT_BIN?.trim()
  if (override) {
    const binaryPath = expandHome(override)
    return { binaryPath, usable: binaryLooksUsable(binaryPath), source: 'env' }
  }

  const binaryPath = cachedBinaryPath()
  return { binaryPath, usable: binaryLooksUsable(binaryPath), source: 'cache' }
}

export async function ensureCcConnectFork(
  options: CcConnectInstallOptions,
): Promise<CcConnectInstallResult> {
  const override = process.env.SHADOW_CC_CONNECT_BIN?.trim()
  if (override) {
    const binaryPath = expandHome(override)
    if (!existsSync(binaryPath))
      throw new Error(`SHADOW_CC_CONNECT_BIN does not exist: ${binaryPath}`)
    return { binaryPath, source: 'env' }
  }

  const binaryPath = cachedBinaryPath()
  if (binaryLooksUsable(binaryPath)) {
    return { binaryPath, source: 'cache' }
  }

  if (options.dryRun) {
    console.log(
      `[dry-run] install ${CC_CONNECT_FORK_REPO}@${CC_CONNECT_FORK_SHORT_REF} -> ${binaryPath}`,
    )
    return { binaryPath, source: 'source' }
  }

  mkdirSync(dirname(binaryPath), { recursive: true })
  const fromRelease = await installFromRelease(binaryPath, options)
  if (!fromRelease) await buildFromSource(binaryPath, options)

  if (!binaryLooksUsable(binaryPath)) {
    throw new Error(`Installed cc-connect binary did not pass version verification: ${binaryPath}`)
  }

  return { binaryPath, source: fromRelease ? 'release' : 'source' }
}
