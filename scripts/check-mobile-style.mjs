#!/usr/bin/env node

/**
 * Mobile style gate — validates apps/mobile stays token-driven and aligned with
 * docs/design-system/shadow-ui/DESIGN.mobile.md.
 *
 * This is intentionally stricter than a visual lint: page code should compose
 * shared primitives and tokens instead of reintroducing one-off geometry,
 * transparency, custom navigation, or literal colors.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const MOBILE_ROOT = path.join(ROOT, 'apps/mobile')
const SCAN_ROOTS = [path.join(MOBILE_ROOT, 'app'), path.join(MOBILE_ROOT, 'src')]

const MAX_EXAMPLES_PER_RULE = 12

const errors = []

const allowedFiles = new Set([
  'apps/mobile/src/theme/tokens.ts',
  'apps/mobile/src/components/common/cat-svg.tsx',
  'apps/mobile/src/components/common/splash-screen.tsx',
])

const intrinsicZeroPattern =
  /\b(minWidth|minHeight|padding|paddingHorizontal|paddingVertical|margin|marginHorizontal|marginVertical|gap):\s*0\s*[,}]/
const safeAreaAllowedPattern =
  /apps\/mobile\/src\/components\/ui\/index\.tsx$|apps\/mobile\/src\/components\/common\/splash-screen\.tsx$/

const rules = [
  {
    id: 'raw-typography-number',
    message: 'Use fontSize/lineHeight/letterSpacing tokens instead of raw numbers.',
    pattern: /\b(fontSize|lineHeight|letterSpacing):\s*-?\d/g,
    allowed: ({ file }) => file.endsWith('apps/mobile/src/theme/tokens.ts'),
  },
  {
    id: 'raw-layout-number',
    message: 'Use spacing/radius/border/size/iconSize tokens instead of raw layout numbers.',
    pattern:
      /\b(borderRadius|borderWidth|padding(?:Top|Bottom|Left|Right|Horizontal|Vertical)?|margin(?:Top|Bottom|Left|Right|Horizontal|Vertical)?|gap|width|height|minHeight|minWidth|maxHeight|maxWidth|top|right|bottom|left):\s*-?\d/g,
    allowed: ({ file, line }) =>
      file.endsWith('apps/mobile/src/theme/tokens.ts') || intrinsicZeroPattern.test(line),
  },
  {
    id: 'literal-color',
    message: 'Use palette/useColors semantic tokens instead of literal hex colors.',
    pattern: /#[0-9A-Fa-f]{3,8}\b/g,
    allowed: ({ relativeFile }) => allowedFiles.has(relativeFile),
  },
  {
    id: 'alpha-transparency',
    message: 'Mobile UI is flat: avoid rgba, opacity, and alpha-suffixed template colors.',
    pattern: /rgba\(|\$\{[^}]+\}[0-9A-Fa-f]{2}\b|\bopacity:\s*0\.\d+/g,
    allowed: ({ file }) => file.endsWith('apps/mobile/src/theme/tokens.ts'),
  },
  {
    id: 'custom-safe-area-navigation',
    message: 'Use MobileNavigationBar instead of page-local safe-area navigation math.',
    pattern: /paddingTop:\s*insets\.top/g,
    allowed: ({ file }) => safeAreaAllowedPattern.test(file),
  },
  {
    id: 'local-nav-style',
    message: 'Do not introduce local navBar/header geometry; use MobileNavigationBar primitives.',
    pattern: /\bnavBar\s*:|styles\.navBar\b|paddingTop:\s*insets\.top\s*\+/g,
    allowed: ({ file }) =>
      file.endsWith('apps/mobile/src/components/ui/index.tsx') ||
      file.endsWith('apps/mobile/src/theme/tokens.ts'),
  },
]

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      files.push(...walk(full))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, '/')
}

function addError(rule, relativeFile, lineNumber, line) {
  errors.push({
    rule: rule.id,
    message: rule.message,
    file: relativeFile,
    lineNumber,
    line: line.trim(),
  })
}

for (const file of SCAN_ROOTS.flatMap(walk)) {
  const relativeFile = relative(file)
  const content = fs.readFileSync(file, 'utf8')
  const lines = content.split('\n')

  for (const [index, line] of lines.entries()) {
    for (const rule of rules) {
      rule.pattern.lastIndex = 0
      if (!rule.pattern.test(line)) continue
      if (rule.allowed?.({ file, relativeFile, line })) continue
      addError(rule, relativeFile, index + 1, line)
    }
  }
}

const grouped = new Map()
for (const error of errors) {
  if (!grouped.has(error.rule)) grouped.set(error.rule, [])
  grouped.get(error.rule).push(error)
}

for (const [ruleId, ruleErrors] of grouped) {
  const rule = rules.find((item) => item.id === ruleId)
  console.error(`\n✖ ${ruleId}: ${rule?.message}`)
  for (const error of ruleErrors.slice(0, MAX_EXAMPLES_PER_RULE)) {
    console.error(`  ${error.file}:${error.lineNumber}  ${error.line}`)
  }
  if (ruleErrors.length > MAX_EXAMPLES_PER_RULE) {
    console.error(`  … and ${ruleErrors.length - MAX_EXAMPLES_PER_RULE} more`)
  }
}

if (errors.length > 0) {
  console.error(`\n✖ Mobile style check failed: ${errors.length} violation(s)`)
  console.error('  See docs/design-system/shadow-ui/DESIGN.mobile.md for the mobile contract.')
  process.exit(1)
}

console.log('✅ Mobile style check passed')
