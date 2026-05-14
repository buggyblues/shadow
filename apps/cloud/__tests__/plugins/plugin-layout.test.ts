import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PLUGIN_SKILLS_ROOT, PLUGIN_SUBAGENTS_ROOT } from '../../src/plugins/runtime-assets.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pluginsRoot = resolve(__dirname, '../../src/plugins')

function sourceFiles(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const path = join(root, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) out.push(...sourceFiles(path))
    else if (/\.(ts|md|json)$/u.test(path)) out.push(path)
  }
  return out
}

describe('plugin runtime layout', () => {
  it('keeps plugin assets out of legacy OpenClaw-only app paths', () => {
    const legacySkillPath = ['/app', 'plugin-skills'].join('/')
    const legacySubagentPath = ['/app', 'plugin-subagents'].join('/')
    const offenders = sourceFiles(pluginsRoot).filter((path) => {
      const content = readFileSync(path, 'utf-8')
      return content.includes(legacySkillPath) || content.includes(legacySubagentPath)
    })

    expect(offenders).toEqual([])
  })

  it('uses runner-neutral workspace plugin roots for declared skill and subagent targets', () => {
    const offenders: string[] = []
    for (const path of sourceFiles(pluginsRoot)) {
      const content = readFileSync(path, 'utf-8')
      for (const match of content.matchAll(/targetPath:\s*['"`]([^'"`]+)['"`]/gu)) {
        const target = match[1] ?? ''
        if (target.includes('plugin-skills') && !target.startsWith(PLUGIN_SKILLS_ROOT)) {
          offenders.push(`${path}: ${target}`)
        }
        if (target.includes('plugin-subagents') && !target.startsWith(PLUGIN_SUBAGENTS_ROOT)) {
          offenders.push(`${path}: ${target}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
