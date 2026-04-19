// ═══════════════════════════════════════════════════════════════
// SkillService — Local-first skill loading
//
// All skills are pre-downloaded to OPENCLAW_SKILLS_DIR.
// No dynamic discovery — scan local directory at startup.
// ═══════════════════════════════════════════════════════════════

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { SkillRecord } from '@shadowob/flash-types'
import { OPENCLAW_SKILLS_DIR } from '../config.js'
import { skillDao } from '../dao/index.js'

/** Parse SKILL.md frontmatter YAML (simple key: value parser) */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const result: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*"?([^"]*)"?$/)
    if (kv) result[kv[1]] = kv[2].trim()
  }
  return result
}

/** Extract emoji from nested YAML (best effort) */
function extractEmoji(content: string): string {
  const match = content.match(/emoji:\s*"?([^"\n]+)"?/)
  return match?.[1]?.trim() || '🔧'
}

/** Extract category from nested YAML (best effort) */
function extractCategory(content: string): string {
  const match = content.match(/category:\s*"?([^"\n]+)"?/)
  return match?.[1]?.trim() || 'utility'
}

export const skillService = {
  /** List all loaded skills */
  async listAll(): Promise<SkillRecord[]> {
    return Array.from(skillDao.values())
  },

  getById(id: string) {
    return skillDao.getById(id)
  },

  /** Install = mark as installed (all skills are already local) */
  async install(skillId: string): Promise<{ skill?: SkillRecord; error?: string }> {
    const skill = skillDao.getById(skillId)
    if (!skill) return { error: 'Skill not found' }
    if (skill.status === 'installed') return { skill }

    skill.status = 'installed'
    skillDao.save(skillId, skill)
    console.log(`✅ Skill installed: ${skillId}`)
    return { skill }
  },

  /**
   * Load all skills from OPENCLAW_SKILLS_DIR at startup.
   * Each subdirectory with a SKILL.md file is a skill.
   * No dynamic discovery, no network — pure local scan.
   */
  loadAllFromDisk(): void {
    const skillsDir = OPENCLAW_SKILLS_DIR

    if (!existsSync(skillsDir)) {
      console.warn(`⚠️ Skills directory not found: ${skillsDir}`)
      return
    }

    let count = 0
    for (const dir of readdirSync(skillsDir)) {
      const dirPath = join(skillsDir, dir)
      if (!statSync(dirPath).isDirectory()) continue

      const skillMdPath = join(dirPath, 'SKILL.md')
      if (!existsSync(skillMdPath)) continue

      try {
        const content = readFileSync(skillMdPath, 'utf-8')

        const fm = parseFrontmatter(content)
        const nameMatch = content.match(/^#\s+(.+)/m)
        const descMatch = content.match(/(?:description):\s*(.+)/im)

        const skill: SkillRecord = {
          id: dir,
          name: fm.name || nameMatch?.[1]?.trim() || dir,
          emoji: extractEmoji(content),
          category: extractCategory(content),
          description: fm.description || descMatch?.[1]?.trim() || `Skill: ${dir}`,
          builtin: true,
          status: 'installed',
          version: fm.version || '1.0.0',
          skillPath: dirPath,
          source: 'local',
        }

        skillDao.save(dir, skill)
        count++
      } catch (err) {
        console.warn(`⚠️ Failed to load skill "${dir}":`, err instanceof Error ? err.message : err)
      }
    }

    console.log(`📦 Loaded ${count} skills from ${skillsDir}`)
  },
}
