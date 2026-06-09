import { createShadowServerAppClient, type ShadowServerAppResultShadow } from '@shadowob/sdk/bridge'
import type { SkillRecord, SkillSummary } from '../types.js'

const shadowApp = createShadowServerAppClient()

export interface SkillListResponse {
  skills: SkillSummary[]
  tags: string[]
  directory?: {
    snapshotAt?: string
    sourceUrl?: string
    guideUrl?: string
    guideUpdatedAt?: string
    indexedCount?: number
    lastOkAt?: string
    lastError?: string | null
  }
  guide?: {
    url: string
    command: string
    warning?: string
  }
}

export interface BuddyInbox {
  agent: {
    id: string
    ownerId: string
    status?: string | null
    user?: {
      id: string
      username?: string | null
      displayName?: string | null
      avatarUrl?: string | null
      isBot?: boolean | null
    } | null
  }
  channel?: {
    id: string
    name: string
  } | null
  canManage?: boolean
}

async function command<T>(commandName: string, input: unknown = {}): Promise<T> {
  return shadowApp.command<T>(commandName, input)
}

async function inboxes(): Promise<{ inboxes: BuddyInbox[] }> {
  return shadowApp.listBuddyInboxes<BuddyInbox>({ emptyOnError: true })
}

async function ensureBuddyTaskGrant(input: { agentId?: string | null; reason: string }) {
  await shadowApp.ensureBuddyTaskGrant(input)
}

export function listSkills(input: { q?: string; tag?: string; limit?: number } = {}) {
  return command<SkillListResponse>('skills.search', input)
}

export async function getSkill(skillId: string) {
  const payload = await command<{ skill: SkillRecord }>('skills.get', { skillId })
  return payload.skill
}

export function uploadSkill(input: {
  filename: string
  contentType?: string
  contentBase64: string
}) {
  return command<{ skill: SkillRecord }>('skills.upload', input)
}

export async function installSkill(input: {
  skillId: string
  targetBuddyAgentId: string
  targetBuddyUserId?: string
  targetBuddyLabel?: string
}) {
  await ensureBuddyTaskGrant({
    agentId: input.targetBuddyAgentId,
    reason: 'Skills dispatches installation tasks to this Buddy Inbox.',
  })
  return command<{
    skill: SkillSummary
    install: { id: string; installedAt: string }
    shadow?: ShadowServerAppResultShadow
  }>('skills.install', input)
}

export function listInboxes() {
  return inboxes()
}
