import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(import.meta.dirname, '..')
const lockfilePath = path.join(repoRoot, 'pnpm-lock.yaml')

const advisoryOverrides = {
  'GHSA-rmmr-r34h-pfm5': {
    moduleName: '@tanstack/history',
    allowedVersions: new Set(['1.161.6']),
    blockedVersions: new Set(['1.161.9', '1.161.12']),
    iocs: ['@tanstack/setup', 'router_init.js', '79ac49eedf774dd4b0cfa308722bc463cfe5885c'],
    reason:
      'TanStack 2026-05-11 advisory is currently broader than the incident versions; lockfile remains pinned to a pre-incident version.',
  },
  'GHSA-3q49-cfcf-g5fm': {
    moduleName: '@mistralai/mistralai',
    allowedVersions: new Set(['2.2.1']),
    blockedVersions: new Set(['2.2.2', '2.2.3', '2.2.4']),
    iocs: [],
    reason:
      'Mistral 2026-05-11 advisory is currently broader than the incident versions; lockfile remains pinned to a pre-incident version.',
  },
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readAuditJson() {
  try {
    return execFileSync('pnpm', ['audit', '--prod', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    if (typeof error.stdout === 'string' && error.stdout.trim()) {
      return error.stdout
    }
    if (typeof error.stderr === 'string' && error.stderr.trim()) {
      console.error(error.stderr)
    }
    throw error
  }
}

function packageVersionExistsInLockfile(lockfile, packageName, version) {
  const pattern = new RegExp(
    `(^|\\n)\\s*['"]?${escapeRegExp(packageName)}@${escapeRegExp(version)}(?:\\(|['"]?:)`,
  )
  return pattern.test(lockfile)
}

function getAdvisoryId(advisory) {
  if (typeof advisory.github_advisory_id === 'string') return advisory.github_advisory_id
  const match = advisory.url?.match(/GHSA-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/i)
  return match?.[0] ?? String(advisory.id)
}

function findingVersions(advisory) {
  return [...new Set((advisory.findings ?? []).map((finding) => finding.version).filter(Boolean))]
}

function canOverrideAdvisory(advisory, lockfile) {
  const advisoryId = getAdvisoryId(advisory)
  const override = advisoryOverrides[advisoryId]
  if (!override) return { allowed: false }

  if (advisory.module_name !== override.moduleName) {
    return {
      allowed: false,
      reason: `${advisoryId}: expected module ${override.moduleName}, got ${advisory.module_name}`,
    }
  }

  for (const version of override.blockedVersions) {
    if (packageVersionExistsInLockfile(lockfile, override.moduleName, version)) {
      return {
        allowed: false,
        reason: `${advisoryId}: blocked ${override.moduleName}@${version} is present in pnpm-lock.yaml`,
      }
    }
  }

  for (const ioc of override.iocs) {
    if (lockfile.includes(ioc)) {
      return {
        allowed: false,
        reason: `${advisoryId}: known incident indicator ${ioc} is present in pnpm-lock.yaml`,
      }
    }
  }

  const versions = findingVersions(advisory)
  const unexpectedVersions = versions.filter((version) => !override.allowedVersions.has(version))
  if (unexpectedVersions.length > 0) {
    return {
      allowed: false,
      reason: `${advisoryId}: unexpected ${override.moduleName} version(s): ${unexpectedVersions.join(', ')}`,
    }
  }

  return {
    allowed: true,
    reason: `${advisoryId}: ${override.moduleName}@${versions.join(', ')} allowed. ${override.reason}`,
  }
}

function main() {
  const lockfile = fs.readFileSync(lockfilePath, 'utf8')
  const rawAudit = readAuditJson()
  let audit

  try {
    audit = JSON.parse(rawAudit)
  } catch (error) {
    console.error('❌ Failed to parse pnpm audit JSON output')
    console.error(error)
    process.exit(1)
  }

  const advisories = Object.values(audit.advisories ?? {})
  const blockingSeverities = new Set(['critical', 'high'])
  const failures = []
  const overrides = []

  for (const advisory of advisories) {
    if (!blockingSeverities.has(advisory.severity)) continue

    const override = canOverrideAdvisory(advisory, lockfile)
    if (override.allowed) {
      overrides.push(override.reason)
      continue
    }

    const advisoryId = getAdvisoryId(advisory)
    failures.push({
      advisoryId,
      moduleName: advisory.module_name,
      severity: advisory.severity,
      title: advisory.title,
      versions: findingVersions(advisory),
      reason: override.reason,
      url: advisory.url,
    })
  }

  for (const message of overrides) {
    console.warn(`⚠️  ${message}`)
  }

  if (failures.length > 0) {
    console.error('\n❌ Critical/high production dependency advisories found:')
    for (const failure of failures) {
      console.error(
        `  - ${failure.severity}: ${failure.moduleName} ${failure.versions.join(', ') || '(unknown version)'} (${failure.advisoryId})`,
      )
      console.error(`    ${failure.title}`)
      if (failure.reason) console.error(`    ${failure.reason}`)
      if (failure.url) console.error(`    ${failure.url}`)
    }
    process.exit(1)
  }

  console.log('✅ Production dependency audit passed')
}

main()
