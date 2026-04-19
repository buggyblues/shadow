import type { ApiResponse, SkillDef } from './base'
import { BASE } from './base'

export async function listSkills(): Promise<ApiResponse<SkillDef[]>> {
  const res = await fetch(`${BASE}/skills`)
  return res.json()
}

export async function installSkill(skillId: string): Promise<ApiResponse<SkillDef>> {
  const res = await fetch(`${BASE}/skills/${skillId}/install`, { method: 'POST' })
  return res.json()
}
