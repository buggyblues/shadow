#!/usr/bin/env node

/**
 * Dashboard i18n gate — validates locale key parity and quality for
 * apps/cloud dashboard i18n files. Runs as part of pre-push checks.
 *
 * Checks:
 *  1. Key parity — en.json must have all keys present in zh-CN.json
 *  2. No empty string values in either locale file
 *  3. No remaining hardcoded '智能体' in dashboard TSX source
 *     (should use 'Agent' per branding decision)
 *  4. All added TSX lines in pages/ don't contain raw Chinese UI text
 *     that should be behind an i18n key
 *
 * Usage:
 *   node scripts/check-dashboard-i18n.mjs
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const I18N_DIR = path.join(ROOT, 'apps/cloud/src/interfaces/dashboard/i18n')
const DASHBOARD_SRC = path.join(ROOT, 'apps/cloud/src/interfaces/dashboard')

const errors = []
const warnings = []

// ── Helpers ───────────────────────────────────────────────────────────────────

function flattenKeys(obj, prefix = '') {
  const keys = []
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, full))
    } else {
      keys.push(full)
    }
  }
  return keys
}

function flattenEntries(obj, prefix = '') {
  const entries = []
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      entries.push(...flattenEntries(v, full))
    } else {
      entries.push([full, v])
    }
  }
  return entries
}

// ── Rule 1: Key parity (en.json must have all zh-CN.json keys) ───────────────

function checkKeyParity() {
  const zhPath = path.join(I18N_DIR, 'zh-CN.json')
  const enPath = path.join(I18N_DIR, 'en.json')

  if (!fs.existsSync(zhPath) || !fs.existsSync(enPath)) {
    warnings.push('[i18n] Could not find zh-CN.json or en.json in dashboard i18n dir')
    return
  }

  const zhData = JSON.parse(fs.readFileSync(zhPath, 'utf8'))
  const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'))

  const zhKeys = new Set(flattenKeys(zhData))
  const enKeys = new Set(flattenKeys(enData))

  const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k))
  const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k))

  for (const k of missingInEn.slice(0, 10)) {
    errors.push(`[i18n] Key missing in en.json: ${k}`)
  }
  if (missingInEn.length > 10) {
    errors.push(`[i18n] … and ${missingInEn.length - 10} more keys missing in en.json`)
  }

  for (const k of missingInZh.slice(0, 5)) {
    warnings.push(`[i18n] Key missing in zh-CN.json (may be intentional): ${k}`)
  }
}

// ── Rule 2: No empty string values ───────────────────────────────────────────

function checkNoEmptyValues() {
  for (const file of ['zh-CN.json', 'en.json']) {
    const filePath = path.join(I18N_DIR, file)
    if (!fs.existsSync(filePath)) continue

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const entries = flattenEntries(data)

    for (const [key, value] of entries) {
      if (typeof value === 'string' && value.trim() === '') {
        errors.push(`[i18n] Empty value in ${file}: ${key}`)
      }
    }
  }
}

// ── Rule 3: No hardcoded '智能体' in TSX source ──────────────────────────────

function checkNoHardcodedZhinengti() {
  const pagesDir = path.join(DASHBOARD_SRC, 'pages')
  const componentsDir = path.join(DASHBOARD_SRC, 'components')

  const dirs = [pagesDir, componentsDir]
  let count = 0

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))

    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf8')
      const matches = content.match(/智能体/g)
      if (matches) {
        count += matches.length
        errors.push(`[i18n] Hardcoded '智能体' found in ${file} (${matches.length} occurrence(s)) — use 'Agent'`)
      }
    }
  }
}

// ── Rule 4: No raw Chinese UI text in JSX (diff-based) ───────────────────────

function checkNoChineeseHardcodedText() {
  let diff = ''
  try {
    diff = execSync('git diff origin/main...HEAD -- apps/cloud/src/interfaces/dashboard/pages', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch {
    try {
      diff = execSync('git diff HEAD~1..HEAD -- apps/cloud/src/interfaces/dashboard/pages', {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      return
    }
  }

  const addedLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  // Chinese chars in JSX text content or string literals (not in comments or i18n files)
  const chineseInJsx = />[^<{]*[\u4e00-\u9fff][^<]*</
  const chineseInString = /["']([^"']*[\u4e00-\u9fff][^"']*)["']/

  let count = 0
  for (const line of addedLines) {
    // Skip comment lines
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue
    // Skip t() call lines (these are already i18n)
    if (line.includes("t('") || line.includes('t("')) continue

    if (chineseInJsx.test(line) || chineseInString.test(line)) {
      count++
      if (count <= 5) {
        warnings.push(`[i18n] Possible hardcoded Chinese text in JSX: ${line.trim().substring(0, 120)}`)
      }
    }
  }
  if (count > 5) {
    warnings.push(`[i18n] … and ${count - 5} more possible hardcoded Chinese text lines`)
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

checkKeyParity()
checkNoEmptyValues()
checkNoHardcodedZhinengti()
checkNoChineeseHardcodedText()

// ── Report ────────────────────────────────────────────────────────────────────

for (const w of warnings) {
  console.warn('⚠ ', w)
}
for (const e of errors) {
  console.error('✖ ', e)
}

if (errors.length > 0) {
  console.error(`\n✖ Dashboard i18n check failed: ${errors.length} error(s), ${warnings.length} warning(s)`)
  process.exit(1)
}

if (warnings.length > 0) {
  console.warn(`\n⚠  Dashboard i18n check: ${warnings.length} warning(s) (non-blocking)`)
}

console.log('✅ Dashboard i18n check passed')
