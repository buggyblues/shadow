import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

const MOBILE_APP_CONFIG_PATH = 'apps/mobile/app.config.ts'
const DESKTOP_PACKAGE_PATH = 'apps/desktop/package.json'
const MOBILE_VERSION_TAG_PREFIX = 'mobile-version-v'
const DESKTOP_VERSION_TAG_PREFIX = 'desktop-version-v'
const DESKTOP_BETA_TAG_PREFIX = 'desktop-beta-v'
const DESKTOP_RELEASE_TAG_PREFIX = 'desktop-v'

function arg(name) {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? ''
}

function releaseTarget() {
  const target = arg('target') || 'all'
  if (target === 'mobile' || target === 'desktop' || target === 'all') return target
  throw new Error(`Unsupported release target: ${target}`)
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) {
    throw new Error(`Unsupported app version: ${version}`)
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  }
}

function compareSemver(left, right) {
  const a = parseSemver(left)
  const b = parseSemver(right)
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

function bumpPatch(version) {
  const parsed = parseSemver(version)
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function tagVersions(prefix) {
  return git(['tag', '--list', `${prefix}*`])
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.slice(prefix.length))
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
}

function readMobileVersion(content) {
  const match = content.match(/(^\s*version:\s*['"])(\d+\.\d+\.\d+)(['"]\s*,)/m)
  if (!match) {
    throw new Error(`Cannot find a static semver version in ${MOBILE_APP_CONFIG_PATH}`)
  }
  return { match, version: match[2] }
}

function writeMobileVersion(content, match, version) {
  return content.replace(match[0], `${match[1]}${version}${match[3]}`)
}

function readDesktopPackage() {
  return JSON.parse(readFileSync(DESKTOP_PACKAGE_PATH, 'utf8'))
}

function writeDesktopPackage(pkg) {
  writeFileSync(DESKTOP_PACKAGE_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
}

function latestCommitBody() {
  try {
    return git(['log', '-1', '--format=%B'])
  } catch {
    return ''
  }
}

function output(values) {
  for (const [key, value] of Object.entries(values)) {
    console.log(`${key}=${value}`)
  }
  if (!process.env.GITHUB_OUTPUT) return
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
  )
}

const sourceSha = arg('source-sha')
const force = arg('force') === 'true'
const target = releaseTarget()
const mobileContent = readFileSync(MOBILE_APP_CONFIG_PATH, 'utf8')
const mobileVersion = readMobileVersion(mobileContent)
const desktopPackage = readDesktopPackage()
const desktopVersion = desktopPackage.version

parseSemver(mobileVersion.version)
parseSemver(desktopVersion)

const releaseCommitBody = latestCommitBody()
const existingReleaseCommit =
  !force &&
  sourceSha &&
  releaseCommitBody.includes(`Release-Source-SHA: ${sourceSha}`) &&
  (target === 'all' || releaseCommitBody.includes(`Release-Target: ${target}`)) &&
  (target === 'all' ? mobileVersion.version === desktopVersion : true)

const candidateVersions =
  target === 'mobile'
    ? [mobileVersion.version, ...tagVersions(MOBILE_VERSION_TAG_PREFIX)]
    : target === 'desktop'
      ? [
          desktopVersion,
          ...tagVersions(DESKTOP_VERSION_TAG_PREFIX),
          ...tagVersions(DESKTOP_BETA_TAG_PREFIX),
          ...tagVersions(DESKTOP_RELEASE_TAG_PREFIX),
        ]
      : [
          mobileVersion.version,
          desktopVersion,
          ...tagVersions(MOBILE_VERSION_TAG_PREFIX),
          ...tagVersions(DESKTOP_VERSION_TAG_PREFIX),
          ...tagVersions(DESKTOP_BETA_TAG_PREFIX),
          ...tagVersions(DESKTOP_RELEASE_TAG_PREFIX),
        ]

const releaseVersion = existingReleaseCommit
  ? target === 'desktop'
    ? desktopVersion
    : mobileVersion.version
  : bumpPatch(candidateVersions.sort(compareSemver).at(-1))

let changed = false

if ((target === 'mobile' || target === 'all') && mobileVersion.version !== releaseVersion) {
  writeFileSync(
    MOBILE_APP_CONFIG_PATH,
    writeMobileVersion(mobileContent, mobileVersion.match, releaseVersion),
  )
  changed = true
}

if ((target === 'desktop' || target === 'all') && desktopPackage.version !== releaseVersion) {
  desktopPackage.version = releaseVersion
  writeDesktopPackage(desktopPackage)
  changed = true
}

console.log(
  existingReleaseCommit
    ? `${target} version already prepared for ${sourceSha}: ${releaseVersion}`
    : `${target} version: ${mobileVersion.version}/${desktopVersion} -> ${releaseVersion}`,
)

output({
  base_version: [mobileVersion.version, desktopVersion].sort(compareSemver).at(-1),
  version: releaseVersion,
  mobile_version_tag: `${MOBILE_VERSION_TAG_PREFIX}${releaseVersion}`,
  desktop_version_tag: `${DESKTOP_VERSION_TAG_PREFIX}${releaseVersion}`,
  desktop_beta_tag: `${DESKTOP_BETA_TAG_PREFIX}${releaseVersion}`,
  desktop_release_tag: `${DESKTOP_RELEASE_TAG_PREFIX}${releaseVersion}`,
  changed: changed ? 'true' : 'false',
})
