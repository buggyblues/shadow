#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const errors = []

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function walk(dir, pattern) {
  const absDir = path.join(ROOT, dir)
  if (!fs.existsSync(absDir)) return []
  const out = []
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const full = path.join(absDir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'build', '.turbo'].includes(entry.name)) continue
      out.push(...walk(path.relative(ROOT, full), pattern))
      continue
    }
    if (pattern.test(entry.name)) out.push(path.relative(ROOT, full))
  }
  return out
}

function fail(message) {
  errors.push(message)
}

function assertNoRegex(relPath, pattern, message) {
  const content = read(relPath)
  const matches = [...content.matchAll(pattern)]
  if (matches.length > 0) {
    fail(`${relPath}: ${message} (${matches.length} match${matches.length === 1 ? '' : 'es'})`)
  }
}

function checkTypedJwtVerification() {
  for (const relPath of walk('apps/server/src', /\.(ts|tsx)$/)) {
    if (relPath === 'apps/server/src/lib/jwt.ts') continue
    const content = read(relPath)
    const lines = content.split('\n')
    lines.forEach((line, index) => {
      const callIndex = line.indexOf('verifyToken(')
      if (callIndex === -1) return
      const args = line.slice(callIndex + 'verifyToken('.length)
      if (!args.includes(',')) {
        fail(`${relPath}:${index + 1}: verifyToken must pass an expected token type/audience`)
      }
    })
  }
}

function checkWalletCreditBoundary() {
  for (const relPath of walk('apps/server/src/handlers', /\.(ts|tsx)$/)) {
    if (relPath === 'apps/server/src/handlers/admin.handler.ts') continue
    assertNoRegex(
      relPath,
      /walletService\.topUp\(/g,
      'handlers must not credit wallets directly; use verified payment/admin/refund/settlement flows',
    )
  }
  for (const relPath of walk('apps/server/src', /\.(ts|tsx)$/)) {
    if (relPath === 'apps/server/src/services/ledger.service.ts') {
      continue
    }
    assertNoRegex(
      relPath,
      /walletDao\.(?:credit|debit|updateBalance)\(/g,
      'wallet balance mutations must go through LedgerService',
    )
    assertNoRegex(
      relPath,
      /db\s*\.\s*update\(\s*wallets\s*\)|tx\s*\.\s*update\(\s*wallets\s*\)/g,
      'direct wallets table updates must go through LedgerService',
    )
    assertNoRegex(
      relPath,
      /\$\{\s*wallets\.balance\s*\}\s*[+-]/g,
      'wallet balance arithmetic must be isolated to LedgerService',
    )
  }
}

function checkCommunityAssetGrantBoundary() {
  for (const relPath of walk('apps/server/src', /\.(ts|tsx)$/)) {
    if (
      relPath === 'apps/server/src/services/community-asset.service.ts' ||
      relPath.startsWith('apps/server/src/db/schema/')
    ) {
      continue
    }
    assertNoRegex(
      relPath,
      /(?:db|tx)\s*\.\s*(?:insert|update|delete)\(\s*communityAssetGrants\s*\)/g,
      'community asset grant mutations must go through CommunityAssetService',
    )
    assertNoRegex(
      relPath,
      /\$\{\s*communityAssetGrants\.(?:ownerUserId|status|remainingQuantity)\s*\}\s*[+-]/g,
      'community asset owner/status/quantity arithmetic must stay inside CommunityAssetService',
    )
  }
}

function checkMediaBoundary() {
  for (const relPath of walk('apps/server/src', /\.(ts|tsx)$/)) {
    assertNoRegex(relPath, /setBucketPolicy\(/g, 'MinIO buckets must not be made public')
  }
  const nginxPath = 'apps/web/nginx.conf'
  if (fs.existsSync(path.join(ROOT, nginxPath))) {
    assertNoRegex(
      nginxPath,
      /location\s+\/shadow\//g,
      'nginx must not proxy /shadow/ directly to MinIO',
    )
  }
}

function checkCloudRuntimeSecrets() {
  for (const relPath of walk('apps/server/src', /\.(ts|tsx)$/)) {
    assertNoRegex(
      relPath,
      /SHADOWOB_USER_TOKEN\s*:/g,
      'server-created Cloud/Play workloads must not inject full user tokens',
    )
  }
}

function checkSecurityGuardsStillWired() {
  const cloudSaas = read('apps/server/src/handlers/cloud-saas.handler.ts')
  if (!cloudSaas.includes('assertSafeHttpUrl')) {
    fail('apps/server/src/handlers/cloud-saas.handler.ts: provider profile SSRF guard is not wired')
  }
  if (!cloudSaas.includes('validateJsonLimits')) {
    fail('apps/server/src/handlers/cloud-saas.handler.ts: DIY JSON size/depth guard is not wired')
  }
  if (!cloudSaas.includes('assertCloudTemplatePolicy')) {
    fail('apps/server/src/handlers/cloud-saas.handler.ts: CloudTemplatePolicy is not enforced')
  }
  if (!cloudSaas.includes('estimateDiyCloudInputBudget')) {
    fail('apps/server/src/handlers/cloud-saas.handler.ts: DIY generation token budget is not wired')
  }

  const auth = read('apps/server/src/middleware/auth.middleware.ts')
  if (!auth.includes("c.set('actor'") && !auth.includes('c.set("actor"')) {
    fail(
      'apps/server/src/middleware/auth.middleware.ts: auth middleware must populate Context actor',
    )
  }

  const oauthAuth = read('apps/server/src/middleware/oauth-auth.middleware.ts')
  if (!oauthAuth.includes("kind: 'oauth'") || !oauthAuth.includes("c.set('actor'")) {
    fail(
      'apps/server/src/middleware/oauth-auth.middleware.ts: OAuth middleware must populate oauth Actor context',
    )
  }

  const nginx = read('apps/web/nginx.conf')
  if (!nginx.includes('Content-Security-Policy')) {
    fail('apps/web/nginx.conf: web CSP header is not configured')
  }

  const serverDockerfile = read('apps/server/Dockerfile')
  if (!serverDockerfile.includes('\nUSER node')) {
    fail('apps/server/Dockerfile: server container must run as a non-root user')
  }
}

function main() {
  checkTypedJwtVerification()
  checkWalletCreditBoundary()
  checkCommunityAssetGrantBoundary()
  checkMediaBoundary()
  checkCloudRuntimeSecrets()
  checkSecurityGuardsStillWired()

  if (errors.length > 0) {
    console.error('Security PR checks failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exit(1)
  }
  console.log('Security PR checks passed')
}

main()
