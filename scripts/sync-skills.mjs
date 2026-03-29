#!/usr/bin/env node

/**
 * Sync skills from project root (skills/) to the openclaw plugin package.
 * Runs automatically on every commit via Husky pre-commit hook.
 *
 * Source:  skills/shadowob-cli/SKILL.md
 * Target:  packages/openclaw-shadowob/skills/shadowob/SKILL.md
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

const mappings = [
  {
    src: path.join(ROOT, 'skills', 'shadowob-cli', 'SKILL.md'),
    dest: path.join(ROOT, 'packages', 'openclaw-shadowob', 'skills', 'shadowob', 'SKILL.md'),
  },
]

let synced = 0

for (const { src, dest } of mappings) {
  if (!fs.existsSync(src)) continue

  const srcContent = fs.readFileSync(src, 'utf8')
  let destContent = ''
  if (fs.existsSync(dest)) {
    destContent = fs.readFileSync(dest, 'utf8')
  }

  if (srcContent !== destContent) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, srcContent, 'utf8')
    try {
      execSync(`git add "${path.relative(ROOT, dest)}"`, { cwd: ROOT, stdio: 'pipe' })
    } catch {
      // Not critical — the file will just appear as unstaged
    }
    synced++
    console.log(`  ✔ Synced ${path.relative(ROOT, src)} → ${path.relative(ROOT, dest)}`)
  }
}

if (synced > 0) {
  console.log(`Skills sync: ${synced} file(s) updated`)
}
