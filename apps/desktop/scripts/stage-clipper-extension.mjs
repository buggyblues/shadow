import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLIPPER_REPOSITORY = 'buggyblues/clipper'
const DEFAULT_CLIPPER_REF = 'be59ee5499fbdf1869c723c56c13f82b78f36ebc'

const scriptsDir = fileURLToPath(new URL('.', import.meta.url))
const desktopRoot = resolve(scriptsDir, '..')
const target = resolve(desktopRoot, 'dist/clipper-extension')
const ref = process.env.SHADOW_CLIPPER_GITHUB_REF?.trim() || DEFAULT_CLIPPER_REF
const workspace = mkdtempSync(join(tmpdir(), 'shadow-clipper-github-'))
const source = join(workspace, 'source')

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
    git(['-C', source, 'remote', 'add', 'origin', `https://github.com/${CLIPPER_REPOSITORY}.git`])
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
  execFileSync(npm, ['ci', '--include=dev', '--no-audit', '--no-fund'], {
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

  rmSync(target, { force: true, recursive: true })
  cpSync(extension, target, { recursive: true })
}

try {
  console.log(`[build] Fetching ${CLIPPER_REPOSITORY}@${ref} from GitHub...`)
  cloneSource()
  buildExtension()
  stageExtension()
  console.log(`[build] Staged Clipper ${ref} from GitHub`)
} finally {
  rmSync(workspace, { force: true, recursive: true })
}
