import { execSync } from 'node:child_process'

const args = process.argv.slice(2)

const arg = (name, fallback) => {
  const key = `--${name}=`
  const found = args.find((a) => a.startsWith(key))
  return found ? found.slice(key.length) : fallback
}

const hasFlag = (name) => args.includes(`--${name}`)

const platform = arg('platform', process.platform)
const arch = arg('arch', process.arch)
const mode = arg('mode', 'make') // make|package
const notarize = hasFlag('notarize')

function getRunEnv(targetPlatform) {
  const env = { ...process.env }

  if (!(notarize && targetPlatform === 'darwin')) {
    return env
  }

  const hasApiKey = !!env.APPLE_API_KEY && !!env.APPLE_API_KEY_ID && !!env.APPLE_API_ISSUER
  const hasAppleIdPassword = !!env.APPLE_ID && !!env.APPLE_APP_SPECIFIC_PASSWORD

  if (hasApiKey) {
    // Keep API key mode only
    delete env.APPLE_ID
    delete env.APPLE_APP_SPECIFIC_PASSWORD
    delete env.APPLE_KEYCHAIN
    delete env.APPLE_KEYCHAIN_PROFILE
    delete env.APPLE_KEYCHAIN_PASSWORD
    console.log('[release] notarization auth mode: App Store Connect API key')
    return env
  }

  if (hasAppleIdPassword) {
    // Keep Apple ID mode only
    delete env.APPLE_API_KEY
    delete env.APPLE_API_KEY_ID
    delete env.APPLE_API_ISSUER
    delete env.APPLE_KEYCHAIN
    delete env.APPLE_KEYCHAIN_PROFILE
    delete env.APPLE_KEYCHAIN_PASSWORD
    console.log('[release] notarization auth mode: Apple ID + app-specific password')
    return env
  }

  return env
}

function runForTarget(targetPlatform, targetArch) {
  const runEnv = getRunEnv(targetPlatform)
  const cmd = `${base} --platform=${targetPlatform} --arch=${targetArch}`
  console.log(`\n[release] ${cmd}`)
  execSync(cmd, { stdio: 'inherit', env: runEnv })
}

function validateNotarizationEnv() {
  const required = ['APPLE_TEAM_ID']
  const hasApiKey =
    !!process.env.APPLE_API_KEY && !!process.env.APPLE_API_KEY_ID && !!process.env.APPLE_API_ISSUER
  const hasAppleIdPassword = !!process.env.APPLE_ID && !!process.env.APPLE_APP_SPECIFIC_PASSWORD

  if (!hasApiKey && !hasAppleIdPassword) {
    throw new Error(
      '[release] notarization requires either API key trio (APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER) or Apple ID credentials (APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD)',
    )
  }

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`[release] missing required env: ${key}`)
    }
  }
}

if (notarize && platform === 'darwin') {
  validateNotarizationEnv()
}

const makeOrPackage = mode === 'package' ? 'package' : 'make'
const base = `pnpm run ${makeOrPackage} --`

if (platform === 'all') {
  const targets = [
    ['darwin', 'x64'],
    ['darwin', 'arm64'],
    ['win32', 'x64'],
    ['linux', 'x64'],
  ]
  for (const [p, a] of targets) {
    runForTarget(p, a)
  }
} else {
  runForTarget(platform, arch)
}

console.log('\n[release] done')
