import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

const APP_CONFIG_PATH = 'app.config.ts'
const VERSION_TAG_PREFIX = 'mobile-version-v'

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) {
    throw new Error(`Unsupported mobile app version: ${version}`)
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

function currentConfigVersion(content) {
  const match = content.match(/(^\s*version:\s*['"])(\d+\.\d+\.\d+)(['"]\s*,)/m)
  if (!match) {
    throw new Error(`Cannot find a static semver version in ${APP_CONFIG_PATH}`)
  }
  return {
    match,
    version: match[2],
  }
}

function mobileVersionTags() {
  const output = execFileSync('git', ['tag', '--list', `${VERSION_TAG_PREFIX}*`], {
    encoding: 'utf8',
  })

  return output
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.slice(VERSION_TAG_PREFIX.length))
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
}

const content = readFileSync(APP_CONFIG_PATH, 'utf8')
const configVersion = currentConfigVersion(content)
const versions = [configVersion.version, ...mobileVersionTags()].sort(compareSemver)
const baseVersion = versions.at(-1)
const releaseVersion = bumpPatch(baseVersion)
const patched = content.replace(
  configVersion.match[0],
  `${configVersion.match[1]}${releaseVersion}${configVersion.match[3]}`,
)

writeFileSync(APP_CONFIG_PATH, patched)

console.log(`Mobile app version: ${baseVersion} -> ${releaseVersion}`)

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `base_version=${baseVersion}\n`)
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${releaseVersion}\n`)
  appendFileSync(process.env.GITHUB_OUTPUT, `version_tag=${VERSION_TAG_PREFIX}${releaseVersion}\n`)
}
