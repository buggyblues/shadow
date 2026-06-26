#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const ALLOWLIST_PATH = path.join(ROOT, 'docs/decisions/server-to-space-allowlist.json')
const DEFAULT_BASELINE_PATH = path.join(ROOT, 'docs/decisions/server-to-space-baseline.json')

const INCLUDE_ROOTS = [
  'apps/web',
  'apps/mobile',
  'apps/server',
  'apps/cloud',
  'packages/cli',
  'packages/sdk',
  'packages/sdk-python',
  'packages/shared',
  'docs',
  'website/docs',
  'skills',
  'integrations',
]

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.mdx',
  '.mjs',
  '.py',
  '.sh',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
])

const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.tmp',
  'build',
  'coverage',
  'dist',
  'drizzle',
  'node_modules',
  'playwright-report',
  'test-results',
])

const SKIP_FILES = new Set(['pnpm-lock.yaml'])

const SKIP_PATH_PARTS = [
  'apps/server/src/db/migrations/',
  'docs/e2e/screenshots/',
  'website/docs/public/',
]

const MIGRATION_DOC_RE = /^docs\/decisions\/server-to-space-.*\.(md|json)$/u
const CONTRACT_CODE_SURFACES = new Set([
  'api',
  'cli',
  'cloud',
  'integration',
  'mobile',
  'sdk',
  'template',
  'test',
  'ui',
])
const DEFAULT_WRITE_SURFACES = new Set(['docs', 'i18n'])
const SURFACE_ORDER = [
  'i18n',
  'ui',
  'mobile',
  'docs',
  'template',
  'sdk',
  'cli',
  'api',
  'cloud',
  'integration',
  'test',
]

const INFRA_CONTEXT_RE =
  /\b(api|backend|database|db|dev|development|docker|express|frontend|hono|http|https|k8s|kubernetes|local|mcp|node|production|proxy|runtime|socket\.io|web)\s+servers?\b|\bservers?\s+(address|config|configuration|container|host|listen|logs|middleware|port|process|proxy|runtime|side|url)\b|\b(server-side|serverless|client-server|server-url|server url|server\.ts|server\.mjs|SHADOWOB_SERVER_URL|--server-url|@shadowob\/server)\b/iu

const RULES = [
  exactRule('api-oauth-servers', /\/api\/oauth\/servers\b/gu, '/api/oauth/spaces', 110),
  exactRule('api-servers', /\/api\/servers\b/gu, '/api/spaces', 105),
  exactRule('app-route-servers', /\/app\/servers\b/gu, '/app/spaces', 104),
  exactRule('route-servers', /\/servers\b/gu, '/spaces', 90),
  exactRule('server-id-or-slug', /\bserverIdOrSlug\b/gu, 'spaceIdOrSlug', 96),
  exactRule('server-slug', /\bserverSlug\b/gu, 'spaceSlug', 95),
  exactRule('server-name', /\bserverName\b/gu, 'spaceName', 95),
  exactRule('server-id', /\bserverId\b/gu, 'spaceId', 94),
  exactRule('server-id-snake', /\bserver_id\b/gu, 'space_id', 92),
  exactRule('server-slug-snake', /\bserver_slug\b/gu, 'space_slug', 92),
  exactRule('server-name-snake', /\bserver_name\b/gu, 'space_name', 92),
  exactRule('server-private', /\bserver-private\b/gu, 'space-private', 98),
  exactRule('servers-read-scope', /\bservers:read\b/gu, 'spaces:read', 98),
  exactRule('servers-write-scope', /\bservers:write\b/gu, 'spaces:write', 98),
  exactRule('read-servers-scope', /\bread:servers\b/gu, 'read:spaces', 98),
  exactRule('write-servers-scope', /\bwrite:servers\b/gu, 'write:spaces', 98),
  exactRule('shadow-server-id-header', /\bX-Shadow-Server-Id\b/gu, 'X-Shadow-Space-Id', 98),
  manualRule('shadow-server-url-env', /\bSHADOW_SERVER_URL\b/gu, 99),
  manualRule('server-url-flag', /--server-url\b/gu, 99),
  manualRule('shadow-server-app-env', /\bSHADOW_SERVER_APP_[A-Z0-9_]+\b/gu, 97),
  exactRule('shadow-server-app', /\bshadow-server-app\b/gu, 'shadow-space-app', 96),
  manualRule('server-app-protocol-kind', /\bserver_app\b/gu, 94),
  manualRule('cli-server-flag', /--server(?=(\s|=|$))/gu, 93),
  exactRule('server-id-type', /\bServerId\b/gu, 'SpaceId', 90),
  exactRule('server-slug-type', /\bServerSlug\b/gu, 'SpaceSlug', 90),
  exactRule('server-name-type', /\bServerName\b/gu, 'SpaceName', 90),
  wordRule('word-servers-title', /\bServers\b/gu, 'Spaces', 30),
  wordRule('word-server-title', /\bServer\b/gu, 'Space', 29),
  wordRule('word-servers-lower', /\bservers\b/gu, 'spaces', 28),
  wordRule('word-server-lower', /\bserver\b/gu, 'space', 27),
  wordRule('zh-cn-server', /服务器/gu, '空间', 26),
  wordRule('zh-tw-server', /伺服器/gu, '空間', 26),
  wordRule('ko-server', /서버/gu, '스페이스', 26),
  wordRule('ja-server-long', /サーバー/gu, 'スペース', 26),
  wordRule('ja-server-short', /サーバ/gu, 'スペース', 25),
]

function exactRule(id, regex, replacement, priority) {
  return {
    id,
    regex,
    replacement,
    priority,
    kind: 'exact',
    automated: true,
  }
}

function wordRule(id, regex, replacement, priority) {
  return {
    id,
    regex,
    replacement,
    priority,
    kind: 'word',
    automated: true,
  }
}

function manualRule(id, regex, priority) {
  return {
    id,
    regex,
    replacement: null,
    priority,
    kind: 'manual',
    automated: false,
  }
}

function parseArgs(argv) {
  const args = {
    ci: false,
    allowContractCode: false,
    baselineFile: DEFAULT_BASELINE_PATH,
    dryRun: true,
    format: 'text',
    includeTests: false,
    limit: 40,
    mode: 'scan',
    surfaces: null,
    strict: false,
    updateBaseline: false,
    write: false,
  }

  const rest = [...argv]
  if (rest[0] && !rest[0].startsWith('-')) {
    args.mode = rest.shift()
  }

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--') continue
    else if (arg === '--allow-contract-code') args.allowContractCode = true
    else if (arg === '--ci') args.ci = true
    else if (arg === '--strict') args.strict = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--write') {
      args.write = true
      args.dryRun = false
    } else if (arg === '--include-tests') args.includeTests = true
    else if (arg === '--baseline') args.format = 'json'
    else if (arg === '--update-baseline') args.updateBaseline = true
    else if (arg === '--baseline-file') args.baselineFile = path.resolve(ROOT, rest[++i] ?? '')
    else if (arg.startsWith('--baseline-file=')) {
      args.baselineFile = path.resolve(ROOT, arg.slice('--baseline-file='.length))
    } else if (arg === '--format') args.format = rest[++i] ?? 'text'
    else if (arg.startsWith('--format=')) args.format = arg.slice('--format='.length)
    else if (arg === '--limit') args.limit = Number(rest[++i] ?? args.limit)
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length))
    else if (arg === '--surface') args.surfaces = parseCsv(rest[++i])
    else if (arg.startsWith('--surface=')) args.surfaces = parseCsv(arg.slice('--surface='.length))
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) args.limit = 40
  return args
}

function parseCsv(value) {
  if (!value) return null
  return new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

function printHelp() {
  console.log(`Space migration scanner and refactor planner

Usage:
  node scripts/check-space-migration.mjs scan [--format text|json] [--ci]
  node scripts/check-space-migration.mjs scan --update-baseline
  node scripts/check-space-migration.mjs refactor [--dry-run] [--surface ui,docs]
  node scripts/check-space-migration.mjs refactor --write --surface docs
  node scripts/check-space-migration.mjs refactor --write --surface sdk --allow-contract-code

Notes:
  scan exits 0 by default so it can establish a baseline.
  --ci compares against docs/decisions/server-to-space-baseline.json when present.
  --strict fails on any current blocker.
  refactor is dry-run by default. --write requires --surface to avoid broad rewrites.
  --write only allows docs/i18n unless --allow-contract-code is passed.
`)
}

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return { entries: [] }
  const raw = fs.readFileSync(ALLOWLIST_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  const entries = Array.isArray(parsed.entries) ? parsed.entries : []
  return {
    entries: entries.map((entry) => ({
      ...entry,
      used: 0,
      pathRegex: entry.path ? globToRegex(entry.path) : null,
      termRegex: entry.termMode === 'regex' && entry.term ? new RegExp(entry.term, 'u') : null,
    })),
  }
}

function globToRegex(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    .replace(/\*\*/gu, '::DOUBLE_STAR::')
    .replace(/\*/gu, '[^/]*')
    .replace(/::DOUBLE_STAR::/gu, '.*')
  return new RegExp(`^${escaped}$`, 'u')
}

function collectFiles() {
  const files = []
  for (const root of INCLUDE_ROOTS) {
    const full = path.join(ROOT, root)
    if (!fs.existsSync(full)) continue
    collectFrom(full, files)
  }
  return files.sort((a, b) => a.localeCompare(b))
}

function collectFrom(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const rel = toRel(full)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      if (SKIP_PATH_PARTS.some((part) => `${rel}/`.includes(part))) continue
      collectFrom(full, files)
      continue
    }
    if (!entry.isFile()) continue
    if (shouldSkipFile(rel)) continue
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name))) continue
    files.push(full)
  }
}

function shouldSkipFile(rel) {
  if (SKIP_FILES.has(path.basename(rel))) return true
  if (rel === 'docs/decisions/server-to-space-baseline.json') return true
  return SKIP_PATH_PARTS.some((part) => rel.includes(part))
}

function toRel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

function classifySurface(rel) {
  if (MIGRATION_DOC_RE.test(rel)) return 'migration-doc'
  if (isTestPath(rel)) return 'test'
  if (rel.includes('/locales/') || rel.includes('/i18n/locales/')) return 'i18n'
  if (rel.startsWith('apps/web/src/')) return 'ui'
  if (rel.startsWith('apps/mobile/app/') || rel.startsWith('apps/mobile/src/')) return 'mobile'
  if (rel.startsWith('packages/cli/')) return 'cli'
  if (rel.startsWith('packages/sdk/') || rel.startsWith('packages/sdk-python/')) return 'sdk'
  if (rel.startsWith('packages/shared/src/types/')) return 'sdk'
  if (rel.startsWith('apps/server/src/db/')) return 'internal'
  if (
    rel.startsWith('apps/server/src/handlers/') ||
    rel.startsWith('apps/server/src/validators/') ||
    rel.startsWith('apps/server/src/ws/') ||
    rel.startsWith('apps/server/src/middleware/') ||
    rel === 'apps/server/src/app.ts'
  ) {
    return 'api'
  }
  if (rel.startsWith('apps/server/')) return 'internal'
  if (rel.startsWith('apps/cloud/images/')) return 'internal'
  if (rel.startsWith('apps/cloud/templates/') || rel.endsWith('/shadow-app.local.json')) {
    return 'template'
  }
  if (rel.startsWith('apps/cloud/')) return 'cloud'
  if (rel.startsWith('docs/') || rel.startsWith('website/docs/') || rel.startsWith('skills/')) {
    return 'docs'
  }
  if (rel.startsWith('integrations/')) return 'integration'
  return 'internal'
}

function isTestPath(rel) {
  return (
    rel.includes('/__tests__/') ||
    rel.includes('/e2e/') ||
    rel.includes('/test/') ||
    rel.includes('/tests/') ||
    /\.(test|spec)\.[cm]?[jt]sx?$/u.test(rel)
  )
}

function scanWorkspace() {
  const allowlist = loadAllowlist()
  const files = collectFiles()
  const findings = []

  for (const file of files) {
    const rel = toRel(file)
    const surface = classifySurface(rel)
    const content = fs.readFileSync(file, 'utf8')
    let offset = 0
    const lines = content.split(/\n/u)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineMatches = findRuleMatches(line)
      for (const match of lineMatches) {
        const finding = classifyFinding({
          allowlist,
          line,
          lineNumber: i + 1,
          match,
          rel,
          surface,
        })
        finding.offsetStart = offset + match.start
        finding.offsetEnd = offset + match.end
        findings.push(finding)
      }
      offset += line.length + 1
    }
  }

  const unusedAllowlist = allowlist.entries.filter((entry) => entry.used === 0)
  return { files, findings, unusedAllowlist }
}

function findRuleMatches(line) {
  const raw = []
  for (const rule of RULES) {
    rule.regex.lastIndex = 0
    let match
    while ((match = rule.regex.exec(line))) {
      raw.push({
        end: match.index + match[0].length,
        rule,
        start: match.index,
        term: match[0],
      })
      if (match[0].length === 0) rule.regex.lastIndex++
    }
  }

  raw.sort((a, b) => b.rule.priority - a.rule.priority || b.term.length - a.term.length)
  const selected = []
  for (const candidate of raw) {
    if (selected.some((existing) => overlaps(existing, candidate))) continue
    selected.push(candidate)
  }
  return selected.sort((a, b) => a.start - b.start)
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end
}

function classifyFinding({ allowlist, line, lineNumber, match, rel, surface }) {
  const allowEntry = findAllowlistEntry(allowlist.entries, rel, match.term, match.rule.id)
  const isMigrationDoc = surface === 'migration-doc'
  const isInternal = surface === 'internal'
  const isInfra = isInfrastructureContext(line, match)
  const inJsonKey = isJsonKeyMatch(line, match)
  const rule = match.rule
  let severity = 'warning'
  let reason = 'Legacy Server product term remains on an external surface'
  let action = rule.automated ? 'replace' : 'manual'

  if (allowEntry) {
    allowEntry.used++
    severity = 'allowed'
    reason = allowEntry.reason
    action = 'allowlisted'
  } else if (isMigrationDoc) {
    severity = 'allowed'
    reason = 'Migration planning document intentionally mentions legacy Server terms'
    action = 'allowed-context'
  } else if (rule.id === 'server-url-flag') {
    severity = 'allowed'
    reason = 'Backend/base URL concept, not the user-facing Space container'
    action = 'allowed-context'
  } else if (isInfra && rule.kind === 'word') {
    severity = 'allowed'
    reason = 'Infrastructure server context, not the product container'
    action = 'allowed-context'
  } else if (isInternal) {
    severity = 'allowed'
    reason = 'Internal implementation surface kept as Server during phase one'
    action = 'allowed-internal'
  } else if (surface === 'test') {
    severity = 'warning'
    reason = 'Test or fixture term; keep only for compatibility coverage'
  } else if (['i18n', 'mobile', 'ui', 'docs', 'template'].includes(surface)) {
    severity = 'blocking'
    reason = 'User-facing or published surface should use Space'
  } else if (['api', 'sdk', 'cli', 'cloud', 'integration'].includes(surface)) {
    severity = 'warning'
    reason = 'External contract surface needs Space alias or migration'
  }

  if (!rule.replacement && severity !== 'allowed') {
    action = 'manual'
    reason =
      rule.id === 'server-app-protocol-kind' || rule.id === 'shadow-server-app-env'
        ? 'Protocol/env naming needs a compatibility alias, not a blind replacement'
        : reason
  }

  if (surface === 'i18n' && inJsonKey && severity !== 'allowed') {
    action = 'manual'
    reason = 'i18n key rename must be coordinated with all code references'
  }

  return {
    action,
    allowlistId: allowEntry?.id ?? null,
    file: rel,
    line,
    lineNumber,
    reason,
    replacement: rule.replacement,
    ruleId: rule.id,
    ruleKind: rule.kind,
    severity,
    surface,
    term: match.term,
    inJsonKey,
  }
}

function findAllowlistEntry(entries, rel, term, ruleId) {
  for (const entry of entries) {
    if (entry.pathRegex && !entry.pathRegex.test(rel)) continue
    if (entry.ruleId && entry.ruleId !== ruleId) continue
    if (entry.term === '*') return entry
    if (entry.termRegex && entry.termRegex.test(term)) return entry
    if (entry.term && entry.term === term) return entry
  }
  return null
}

function isInfrastructureContext(line, match) {
  const windowStart = Math.max(0, match.start - 80)
  const windowEnd = Math.min(line.length, match.end + 80)
  const snippet = line.slice(windowStart, windowEnd)
  return INFRA_CONTEXT_RE.test(snippet)
}

function isJsonKeyMatch(line, match) {
  const before = line.slice(0, match.start)
  const quoteStart = before.lastIndexOf('"')
  if (quoteStart === -1) return false
  const after = line.slice(match.end)
  const quoteEnd = after.indexOf('"')
  if (quoteEnd === -1) return false
  return /^\s*:/.test(after.slice(quoteEnd + 1))
}

function summarize(scan) {
  const summary = {
    allowed: 0,
    blocking: 0,
    filesScanned: scan.files.length,
    findings: scan.findings.length,
    replaceable: 0,
    unusedAllowlist: scan.unusedAllowlist.length,
    warning: 0,
    bySurface: {},
    byRule: {},
  }

  for (const finding of scan.findings) {
    summary[finding.severity]++
    summary.bySurface[finding.surface] ??= { allowed: 0, blocking: 0, warning: 0, replaceable: 0 }
    summary.bySurface[finding.surface][finding.severity]++
    summary.byRule[finding.ruleId] ??= { allowed: 0, blocking: 0, warning: 0, replaceable: 0 }
    summary.byRule[finding.ruleId][finding.severity]++
    if (isReplaceCandidate(finding, { includeTests: false, surfaces: null })) {
      summary.replaceable++
      summary.bySurface[finding.surface].replaceable++
      summary.byRule[finding.ruleId].replaceable++
    }
  }

  return summary
}

function isReplaceCandidate(finding, options) {
  if (finding.severity === 'allowed') return false
  if (!finding.replacement) return false
  if (finding.action !== 'replace') return false
  if (
    finding.ruleKind === 'word' &&
    !['docs', 'i18n', 'mobile', 'template', 'ui'].includes(finding.surface)
  ) {
    return false
  }
  if (!options.includeTests && finding.surface === 'test') return false
  if (options.surfaces && !options.surfaces.has(finding.surface)) return false
  return true
}

function printTextReport(scan, args) {
  const summary = summarize(scan)
  console.log('Space migration scan')
  console.log(`files scanned: ${summary.filesScanned}`)
  console.log(
    `findings: ${summary.findings} (${summary.blocking} blocking, ${summary.warning} warning, ${summary.allowed} allowed)`,
  )
  console.log(`auto-refactor candidates: ${summary.replaceable}`)
  if (summary.unusedAllowlist > 0) {
    console.log(`unused allowlist entries: ${summary.unusedAllowlist}`)
  }
  console.log('')

  console.log('By surface:')
  for (const [surface, counts] of sortEntries(summary.bySurface)) {
    console.log(
      `  ${surface.padEnd(13)} blocking=${counts.blocking} warning=${counts.warning} allowed=${counts.allowed} replaceable=${counts.replaceable}`,
    )
  }

  const notable = scan.findings
    .filter((finding) => finding.severity !== 'allowed')
    .sort(compareFindings)
    .slice(0, args.limit)
  if (notable.length > 0) {
    console.log('')
    console.log(`Top findings (limited to ${args.limit}):`)
    for (const finding of notable) {
      console.log(
        `  [${finding.severity}] ${finding.file}:${finding.lineNumber} ${finding.term} -> ${finding.replacement ?? 'manual'} (${finding.surface}, ${finding.ruleId})`,
      )
    }
  }

  if (scan.unusedAllowlist.length > 0) {
    console.log('')
    console.log('Unused allowlist entries:')
    for (const entry of scan.unusedAllowlist.slice(0, args.limit)) {
      console.log(`  ${entry.id}: ${entry.path} ${entry.term}`)
    }
  }
}

function sortEntries(obj) {
  return Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
}

function jsonReport(scan) {
  const summary = summarize(scan)
  return {
    summary,
    findings: scan.findings.map((finding) => ({
      action: finding.action,
      allowlistId: finding.allowlistId,
      file: finding.file,
      line: finding.lineNumber,
      reason: finding.reason,
      replacement: finding.replacement,
      ruleId: finding.ruleId,
      ruleKind: finding.ruleKind,
      severity: finding.severity,
      surface: finding.surface,
      term: finding.term,
      inJsonKey: finding.inJsonKey,
    })),
    unusedAllowlist: scan.unusedAllowlist.map((entry) => ({
      id: entry.id,
      path: entry.path,
      term: entry.term,
    })),
  }
}

function baselineReport(scan) {
  const summary = summarize(scan)
  return {
    version: 1,
    description:
      'Server to Space migration baseline. CI should fail when blocking/warning counts increase.',
    summary: {
      blocking: summary.blocking,
      warning: summary.warning,
      allowed: summary.allowed,
      replaceable: summary.replaceable,
      findings: summary.findings,
      filesScanned: summary.filesScanned,
      bySurface: summary.bySurface,
      byRule: summary.byRule,
    },
  }
}

function writeBaseline(scan, baselineFile) {
  const report = baselineReport(scan)
  fs.mkdirSync(path.dirname(baselineFile), { recursive: true })
  fs.writeFileSync(baselineFile, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Updated Space migration baseline: ${toRel(baselineFile)}`)
}

function compareWithBaseline(scan, baselineFile) {
  if (!fs.existsSync(baselineFile)) {
    return {
      ok: false,
      messages: [`Baseline file not found: ${toRel(baselineFile)}. Run with --update-baseline.`],
    }
  }

  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
  const current = baselineReport(scan).summary
  const previous = baseline.summary ?? {}
  const messages = []

  compareCount(messages, 'blocking', current.blocking, previous.blocking)
  compareCount(messages, 'warning', current.warning, previous.warning)
  compareCount(messages, 'findings', current.findings, previous.findings)

  const surfaces = new Set([
    ...Object.keys(current.bySurface ?? {}),
    ...Object.keys(previous.bySurface ?? {}),
  ])
  for (const surface of Array.from(surfaces).sort()) {
    compareCount(
      messages,
      `bySurface.${surface}.blocking`,
      current.bySurface?.[surface]?.blocking ?? 0,
      previous.bySurface?.[surface]?.blocking ?? 0,
    )
    compareCount(
      messages,
      `bySurface.${surface}.warning`,
      current.bySurface?.[surface]?.warning ?? 0,
      previous.bySurface?.[surface]?.warning ?? 0,
    )
  }

  return { ok: messages.length === 0, messages }
}

function compareCount(messages, label, current, previous) {
  if (typeof previous !== 'number') {
    messages.push(`Baseline missing ${label}; current=${current}`)
    return
  }
  if (current > previous) {
    messages.push(`${label} increased: baseline=${previous}, current=${current}`)
  }
}

function runRefactor(scan, args) {
  const options = { includeTests: args.includeTests, surfaces: args.surfaces }
  const candidates = scan.findings
    .filter((finding) => isReplaceCandidate(finding, options))
    .sort(compareFindings)
  const manual = scan.findings.filter(
    (finding) => finding.severity !== 'allowed' && !isReplaceCandidate(finding, options),
  )

  if (args.write && !args.surfaces) {
    throw new Error('Refusing broad write. Pass --surface with an explicit comma-separated scope.')
  }
  if (args.write) {
    validateWriteScope(args)
  }

  if (!args.write) {
    printRefactorDryRun(candidates, manual, args)
    return
  }

  const changed = applyReplacements(candidates)
  console.log(`Applied ${changed.replacements} replacements across ${changed.files} files.`)
}

function printRefactorDryRun(candidates, manual, args) {
  console.log('Space migration refactor dry-run')
  console.log(`candidate replacements: ${candidates.length}`)
  console.log(`manual/conflict findings: ${manual.length}`)
  console.log(`write mode: disabled`)
  if (args.surfaces) console.log(`surface filter: ${Array.from(args.surfaces).join(', ')}`)
  console.log('')

  const bySurface = {}
  const byFile = {}
  for (const finding of candidates) {
    bySurface[finding.surface] = (bySurface[finding.surface] ?? 0) + 1
    byFile[finding.file] = (byFile[finding.file] ?? 0) + 1
  }

  console.log('Candidate replacements by surface:')
  for (const [surface, count] of sortEntries(bySurface)) {
    console.log(`  ${surface.padEnd(13)} ${count}`)
  }

  console.log('')
  console.log(`Top candidate files (limited to ${args.limit}):`)
  for (const [file, count] of Object.entries(byFile)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, args.limit)) {
    console.log(`  ${file}: ${count}`)
  }

  const preview = candidates.slice(0, args.limit)
  if (preview.length > 0) {
    console.log('')
    console.log(`Replacement preview (limited to ${args.limit}):`)
    for (const finding of preview) {
      console.log(
        `  ${finding.file}:${finding.lineNumber} ${JSON.stringify(finding.term)} -> ${JSON.stringify(finding.replacement)}`,
      )
    }
  }

  const manualPreview = manual.slice(0, args.limit)
  if (manualPreview.length > 0) {
    console.log('')
    console.log(`Manual/conflict preview (limited to ${args.limit}):`)
    for (const finding of manualPreview) {
      console.log(
        `  ${finding.file}:${finding.lineNumber} ${JSON.stringify(finding.term)} (${finding.reason})`,
      )
    }
  }
}

function applyReplacements(candidates) {
  const byFile = new Map()
  for (const finding of candidates) {
    const list = byFile.get(finding.file) ?? []
    list.push(finding)
    byFile.set(finding.file, list)
  }

  let replacements = 0
  for (const [rel, findings] of byFile.entries()) {
    const file = path.join(ROOT, rel)
    let content = fs.readFileSync(file, 'utf8')
    const sorted = findings.sort((a, b) => b.offsetStart - a.offsetStart)
    for (const finding of sorted) {
      const current = content.slice(finding.offsetStart, finding.offsetEnd)
      if (current !== finding.term) {
        throw new Error(
          `Refusing stale replacement at ${finding.file}:${finding.lineNumber}; expected ${finding.term}, found ${current}`,
        )
      }
      content =
        content.slice(0, finding.offsetStart) +
        finding.replacement +
        content.slice(finding.offsetEnd)
      replacements++
    }
    fs.writeFileSync(file, content)
  }
  return { files: byFile.size, replacements }
}

function validateWriteScope(args) {
  const requested = Array.from(args.surfaces ?? [])
  const unsafe = requested.filter(
    (surface) => CONTRACT_CODE_SURFACES.has(surface) && !DEFAULT_WRITE_SURFACES.has(surface),
  )
  if (unsafe.length > 0 && !args.allowContractCode) {
    throw new Error(
      `Refusing to write contract/code surfaces without --allow-contract-code: ${unsafe.join(', ')}`,
    )
  }
}

function compareFindings(a, b) {
  return (
    surfaceRank(a.surface) - surfaceRank(b.surface) ||
    severityRank(a.severity) - severityRank(b.severity) ||
    a.file.localeCompare(b.file) ||
    a.lineNumber - b.lineNumber
  )
}

function surfaceRank(surface) {
  const index = SURFACE_ORDER.indexOf(surface)
  return index === -1 ? 999 : index
}

function severityRank(severity) {
  if (severity === 'blocking') return 0
  if (severity === 'warning') return 1
  return 2
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!['scan', 'refactor'].includes(args.mode)) {
    throw new Error(`Unknown mode: ${args.mode}`)
  }

  const scan = scanWorkspace()
  if (args.mode === 'refactor') {
    runRefactor(scan, args)
    return
  }

  if (args.updateBaseline) {
    writeBaseline(scan, args.baselineFile)
    return
  }

  if (args.format === 'json') {
    console.log(JSON.stringify(jsonReport(scan), null, 2))
  } else {
    printTextReport(scan, args)
  }

  const summary = summarize(scan)
  if (args.ci) {
    const baseline = compareWithBaseline(scan, args.baselineFile)
    if (!baseline.ok) {
      for (const message of baseline.messages) console.error(message)
      process.exit(1)
    }
  }

  if ((args.strict && summary.blocking > 0) || scan.unusedAllowlist.length > 0) {
    process.exit(1)
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
