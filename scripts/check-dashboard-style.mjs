#!/usr/bin/env node

/**
 * Dashboard style gate — blocks anti-patterns from being introduced into
 * apps/cloud dashboard source code. Runs as part of pre-push checks.
 *
 * Rules enforced (new code only, via git diff against origin/main..HEAD):
 *  1. No new `gray-*` atomic Tailwind classes (use semantic tokens instead)
 *  2. No new `!` (important) Tailwind overrides
 *  3. No new inline `--nf-*` CSS variable definitions  (use --color-* tokens)
 *  4. All page components must use PageShell (not raw <div className="p-6...")
 *
 * Usage:
 *   node scripts/check-dashboard-style.mjs
 */

import { execSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DASHBOARD_SRC = 'apps/cloud/src/interfaces/dashboard'

const errors = []
const warnings = []

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDiffLines() {
  try {
    // Only check lines added in this branch vs origin/main
    const diff = execSync('git diff origin/main...HEAD -- ' + DASHBOARD_SRC, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return diff
  } catch {
    // If origin/main isn't available, check staged changes
    try {
      return execSync('git diff HEAD~1..HEAD -- ' + DASHBOARD_SRC, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      return ''
    }
  }
}

// ── Rule 1: No new gray-* atomic classes ─────────────────────────────────────

function checkNoNewGrayClasses(diff) {
  const addedLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  const grayPattern = /\b(gray|slate|zinc|neutral|stone)-\d{2,3}\b/

  let count = 0
  for (const line of addedLines) {
    if (grayPattern.test(line)) {
      count++
      if (count <= 5) {
        warnings.push(
          `[style] New gray-* class found (use semantic token instead): ${line.trim().substring(0, 120)}`,
        )
      }
    }
  }
  if (count > 5) {
    warnings.push(`[style] … and ${count - 5} more gray-* class occurrences`)
  }
}

// ── Rule 2: No new !important Tailwind overrides ─────────────────────────────

function checkNoNewImportantOverrides(diff) {
  const addedLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  // Match className="...!something..." pattern
  const importantPattern = /className[^"']*["'][^"']*\![a-z]/

  let count = 0
  for (const line of addedLines) {
    if (importantPattern.test(line)) {
      count++
      if (count <= 3) {
        warnings.push(`[style] New Tailwind ! override found: ${line.trim().substring(0, 120)}`)
      }
    }
  }
}

// ── Rule 3: No new --nf-* variable definitions in TSX/TS files ───────────────
// (CSS compat-layer aliases in globals.css are allowed)

function checkNoNewNfVariables(diff) {
  // Split diff into per-file blocks and only check TSX/TS files
  const fileBlocks = diff.split(/^diff --git /m).slice(1)

  for (const block of fileBlocks) {
    const fileMatch = block.match(/^a\/(.+\.(tsx|ts))\s/)
    if (!fileMatch) continue // skip CSS files

    const addedLines = block.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    // Only flag definitions (--nf-foo: …), not usage (var(--nf-foo))
    const nfDefPattern = /(?<![a-z(])--nf-[a-z][\w-]*\s*:/

    for (const line of addedLines) {
      if (nfDefPattern.test(line)) {
        errors.push(
          `[style] --nf-* token used in ${fileMatch[1]} (use --color-* tokens): ${line.trim().substring(0, 120)}`,
        )
      }
    }
  }
}

// ── Rule 4: Page components should use PageShell ─────────────────────────────

function checkPageShellUsage(diff) {
  // Only check files that look like new Page components being added
  const fileBlocks = diff.split(/^diff --git /m).slice(1)

  for (const block of fileBlocks) {
    const fileMatch = block.match(
      /^a\/(apps\/cloud\/src\/interfaces\/dashboard\/pages\/\w+Page\.tsx)/,
    )
    if (!fileMatch) continue

    // Check if PageShell is used somewhere in the added lines of this file
    const addedLines = block.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    const hasPageShell = addedLines.some((l) => l.includes('PageShell'))
    const hasRawP6Div = addedLines.some(
      (l) => /className=["'][^"']*\bp-6\b/.test(l) && l.includes('<div'),
    )

    if (hasRawP6Div && !hasPageShell) {
      warnings.push(
        `[style] ${fileMatch[1]}: page uses raw <div p-6> — consider migrating to PageShell`,
      )
    }
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

const diff = getDiffLines()

if (diff) {
  checkNoNewGrayClasses(diff)
  checkNoNewImportantOverrides(diff)
  checkNoNewNfVariables(diff)
  checkPageShellUsage(diff)
}

// ── Report ────────────────────────────────────────────────────────────────────

for (const w of warnings) {
  console.warn('⚠ ', w)
}
for (const e of errors) {
  console.error('✖ ', e)
}

if (errors.length > 0) {
  console.error(
    `\n✖ Dashboard style check failed: ${errors.length} error(s), ${warnings.length} warning(s)`,
  )
  process.exit(1)
}

if (warnings.length > 0) {
  console.warn(`\n⚠  Dashboard style check: ${warnings.length} warning(s) (non-blocking)`)
}

console.log('✅ Dashboard style check passed')
