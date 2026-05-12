#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const args = new Set(process.argv.slice(2))
const failOnError = args.has('--fail-on-error')
const json = args.has('--json')
const reportPathArg = process.argv.find((arg) => arg.startsWith('--report='))
const reportPath = reportPathArg ? reportPathArg.slice('--report='.length) : null

const SOURCE_ROOTS = ['apps/server/src']
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next'])
const ALLOW = {
  directFetch: [
    'apps/server/src/gateways/safe-http-client.ts',
    'apps/server/src/lib/ssrf.ts',
  ],
  k8sRuntime: [
    'apps/server/src/gateways/kubernetes-ops.gateway.ts',
    'apps/server/src/lib/cloud-deployment-processor.ts',
    'apps/server/src/lib/cloud-deployment-backup-runtime.ts',
  ],
  objectStream: [
    'apps/server/src/gateways/media-access.gateway.ts',
    'apps/server/src/services/media.service.ts',
    'apps/server/src/handlers/media.handler.ts',
  ],
  walletDirect: [
    'apps/server/src/services/wallet.service.ts',
    'apps/server/src/services/ledger.service.ts',
  ],
}

function walk(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) out.push(full)
  }
  return out
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/')
}

function linesOf(text) {
  const lines = text.split(/\r?\n/)
  return lines.map((line, index) => ({ line, number: index + 1 }))
}

function isAllowed(ruleAllow, file) {
  const relative = rel(file)
  return ruleAllow.some((allowed) => relative === allowed || relative.startsWith(`${allowed}/`))
}

function finding(rule, severity, file, line, message, snippet) {
  return { rule, severity, file: rel(file), line, message, snippet: snippet?.trim() ?? '' }
}

function scanFile(file) {
  const text = fs.readFileSync(file, 'utf8')
  const findings = []
  const relative = rel(file)
  const isHandler = relative.includes('/handlers/')
  const isService = relative.includes('/services/')
  const isDao = relative.includes('/dao/')

  for (const { line, number } of linesOf(text)) {
    if (/(^|[^\w$.])fetch\s*\(/.test(line) && !isAllowed(ALLOW.directFetch, file)) {
      findings.push(
        finding(
          'no-direct-fetch-outside-safe-http-client',
          'error',
          file,
          number,
          'Use SafeHttpClient for all server-side HTTP requests to user/database-controlled URLs.',
          line,
        ),
      )
    }

    if (isHandler && /from ['"]\.\.\/dao\//.test(line)) {
      findings.push(
        finding(
          'handler-must-not-import-dao',
          'error',
          file,
          number,
          'Handlers must call UseCase/AccessService, not DAO directly.',
          line,
        ),
      )
    }

    if (isHandler && /container\.resolve\(['"][a-zA-Z0-9]+Dao['"]\)/.test(line)) {
      findings.push(
        finding(
          'handler-must-not-resolve-dao',
          'warn',
          file,
          number,
          'Handler resolves DAO directly; migrate this route to a UseCase or AccessService.',
          line,
        ),
      )
    }

    if (
      /\b(deleteNamespace|spawnPodLogStream|readPodLogsAsync|listPodsAsync|restorePvcFromVolumeSnapshot)\b/.test(line) &&
      !isAllowed(ALLOW.k8sRuntime, file)
    ) {
      findings.push(
        finding(
          'k8s-dangerous-runtime-outside-gateway',
          'error',
          file,
          number,
          'Kubernetes namespace/log/restore operations must go through KubernetesOpsGateway.',
          line,
        ),
      )
    }

    if (/\.getObjectStream\s*\(/.test(line) && !isAllowed(ALLOW.objectStream, file)) {
      findings.push(
        finding(
          'private-object-read-outside-media-gateway',
          'error',
          file,
          number,
          'Private object reads must go through MediaAccessGateway or signed media tokens.',
          line,
        ),
      )
    }

    if (
      isService &&
      /walletService\.(settle|refund|debit|credit|topUp)\s*\(/.test(line) &&
      !isAllowed(ALLOW.walletDirect, file)
    ) {
      findings.push(
        finding(
          'wallet-side-effect-outside-ledger-boundary',
          'warn',
          file,
          number,
          'Financial side effects should use LedgerService with an idempotency reference.',
          line,
        ),
      )
    }

    if ((isService || isDao) && /async\s+(updateById|deleteById|update|delete)\s*\(\s*id\s*:/.test(line)) {
      findings.push(
        finding(
          'global-id-write-method-review',
          'warn',
          file,
          number,
          'Global-ID write method requires review; prefer scoped write methods such as updateByServerIdAndId.',
          line,
        ),
      )
    }
  }

  findings.push(...scanRouteScopeHeuristics(file, text))
  return findings
}

function scanRouteScopeHeuristics(file, text) {
  const relative = rel(file)
  if (!relative.includes('/handlers/')) return []
  const findings = []
  const routeRegex = /h\.(?:get|post|put|patch|delete|all)\(\s*['"]([^'"]+)['"][\s\S]*?\n\s*\}\s*,?\n\s*\)/g
  let match
  while ((match = routeRegex.exec(text))) {
    const route = match[1]
    const block = match[0]
    const hasParent = /:(serverId|shopId|workspaceId|deploymentId)/.test(route)
    const childMatch = route.match(/:(appId|productId|orderId|categoryId|agentId|contractId)/)
    if (!hasParent || !childMatch) continue

    const child = childMatch[1]
    const directChildOnlyCall = new RegExp(`\\.(update|delete|updateOrderStatus|deleteProduct|updateProduct|deleteCategory|updateCategory)\\s*\\(\\s*c\\.req\\.param\\(['"]${child}['"]\\)`).test(block)
    if (!directChildOnlyCall) continue

    const line = text.slice(0, match.index).split(/\r?\n/).length
    findings.push(
      finding(
        'parent-route-child-global-write-heuristic',
        'error',
        file,
        line,
        `Route ${route} has parent scope and child id but appears to call a child-only write method.`,
        route,
      ),
    )
  }
  return findings
}

const files = SOURCE_ROOTS.flatMap((sourceRoot) => walk(path.join(root, sourceRoot)))
const findings = files.flatMap(scanFile)

if (json) {
  console.log(JSON.stringify({ findings }, null, 2))
} else {
  const errors = findings.filter((item) => item.severity === 'error')
  const warns = findings.filter((item) => item.severity === 'warn')
  console.log(`security-scan: ${errors.length} error(s), ${warns.length} warning(s)`)
  for (const item of findings) {
    console.log(`${item.severity.toUpperCase()} ${item.rule} ${item.file}:${item.line}`)
    console.log(`  ${item.message}`)
    if (item.snippet) console.log(`  ${item.snippet}`)
  }
}

if (reportPath) {
  const report = [
    '# Security Architecture Scan Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Findings: ${findings.length}`,
    '',
    ...findings.map(
      (item) =>
        `- **${item.severity.toUpperCase()} ${item.rule}** ${item.file}:${item.line}\n  - ${item.message}\n  - \`${item.snippet.replace(/`/g, '\\`')}\``,
    ),
    '',
  ].join('\n')
  fs.mkdirSync(path.dirname(path.resolve(root, reportPath)), { recursive: true })
  fs.writeFileSync(path.resolve(root, reportPath), report)
}

if (failOnError && findings.some((item) => item.severity === 'error')) {
  process.exit(1)
}
