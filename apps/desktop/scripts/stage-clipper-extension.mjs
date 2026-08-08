import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = fileURLToPath(new URL('.', import.meta.url))
const desktopRoot = resolve(scriptsDir, '..')
const dependencyPath = resolve(desktopRoot, 'clipper-dependency.json')
const dependency = JSON.parse(readFileSync(dependencyPath, 'utf8'))
const repository = String(dependency.repository ?? '').trim()
const expectedVersion = String(dependency.extensionVersion ?? '').trim()
const protocolVersion = Number(dependency.protocolVersion)
const target = resolve(desktopRoot, 'dist/clipper-extension')
const ref = process.env.SHADOW_CLIPPER_GITHUB_REF?.trim() || String(dependency.ref ?? '').trim()
const workspace = mkdtempSync(join(tmpdir(), 'shadow-clipper-github-'))
const source = join(workspace, 'source')

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error('clipper-dependency.json contains an invalid repository')
}
if (!/^[0-9a-f]{40}$/i.test(ref)) {
  throw new Error('Clipper must be pinned to a full Git commit')
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(expectedVersion)) {
  throw new Error('clipper-dependency.json contains an invalid extension version')
}
if (protocolVersion !== 3) throw new Error('Unsupported Clipper Connector protocol')

function githubToken() {
  const configured =
    process.env.SHADOW_CLIPPER_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()
  if (configured) return configured
  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function cloneSource() {
  const token = githubToken()
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  if (token) {
    env.GIT_CONFIG_COUNT = '1'
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader'
    env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`
  }
  const git = (args) => execFileSync('git', args, { cwd: workspace, env, stdio: 'inherit' })
  const gitOutput = (args) =>
    execFileSync('git', args, {
      cwd: workspace,
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'inherit'],
    }).trim()
  try {
    git(['init', '--quiet', source])
    git(['-C', source, 'remote', 'add', 'origin', `https://github.com/${repository}.git`])
    git(['-C', source, 'sparse-checkout', 'init', '--cone'])
    git(['-C', source, 'sparse-checkout', 'set', 'src', 'public', 'scripts', 'skills'])
    git(['-C', source, 'fetch', '--depth=1', 'origin', ref])
    git(['-C', source, 'checkout', '--quiet', '--detach', 'FETCH_HEAD'])
    const revision = gitOutput(['-C', source, 'rev-parse', 'HEAD'])
    if (/^[0-9a-f]{40}$/i.test(ref) && revision.toLowerCase() !== ref.toLowerCase()) {
      throw new Error(`Expected Clipper ${ref}, received ${revision}`)
    }
  } catch (error) {
    const authHint = token ? '' : ' Set SHADOW_CLIPPER_GITHUB_TOKEN for the private repository.'
    throw new Error(`Could not fetch Clipper ${ref} from GitHub.${authHint}`, { cause: error })
  }
}

function buildExtension() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const env = { ...process.env }
  delete env.SHADOW_CLIPPER_GITHUB_TOKEN
  delete env.GITHUB_TOKEN
  delete env.GH_TOKEN
  execFileSync(npm, ['ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: source,
    env,
    stdio: 'inherit',
  })
  execFileSync(npm, ['run', 'build'], {
    cwd: source,
    env,
    stdio: 'inherit',
  })
}

function stageExtension() {
  const extension = join(source, 'dist')
  const manifestPath = join(extension, 'manifest.json')
  if (!existsSync(manifestPath)) throw new Error('The Clipper build did not produce manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.manifest_version !== 3 || typeof manifest.name !== 'string') {
    throw new Error('The Clipper build is not a valid Manifest V3 extension')
  }
  if (manifest.version !== expectedVersion) {
    throw new Error(`Expected Clipper version ${expectedVersion}, received ${manifest.version}`)
  }

  const sha256 = hashDirectory(extension)
  writeFileSync(
    join(extension, 'shadow-clipper-build.json'),
    `${JSON.stringify(
      {
        extensionVersion: expectedVersion,
        protocolVersion,
        ref,
        repository,
        sha256,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  )

  rmSync(target, { force: true, recursive: true })
  cpSync(extension, target, { recursive: true })
}

function hashDirectory(directory) {
  const digest = createHash('sha256')
  const visit = (current, prefix = '') => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry)
      const relativePath = prefix ? `${prefix}/${entry}` : entry
      const info = statSync(path)
      if (info.isDirectory()) visit(path, relativePath)
      else if (info.isFile()) {
        digest.update(relativePath)
        digest.update('\0')
        digest.update(readFileSync(path))
        digest.update('\0')
      }
    }
  }
  visit(directory)
  return digest.digest('hex')
}

try {
  console.log(`[build] Fetching ${repository}@${ref} from GitHub...`)
  cloneSource()
  buildExtension()
  stageExtension()
  console.log(`[build] Staged Clipper ${expectedVersion} (${ref}) from GitHub`)
} finally {
  rmSync(workspace, { force: true, recursive: true })
}
