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

function run(cmd) {
  console.log(`\n[release] ${cmd}`)
  execSync(cmd, { stdio: 'inherit', env: process.env })
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
const base = `pnpm --dir ./apps/desktop ${makeOrPackage}`

if (platform === 'all') {
  const targets = [
    ['darwin', 'x64'],
    ['darwin', 'arm64'],
    ['win32', 'x64'],
    ['linux', 'x64'],
  ]
  for (const [p, a] of targets) {
    run(`${base} --platform=${p} --arch=${a}`)
  }
} else {
  run(`${base} --platform=${platform} --arch=${arch}`)
}

console.log('\n[release] done')
