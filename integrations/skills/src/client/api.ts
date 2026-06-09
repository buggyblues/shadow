import { ShadowBridge, type ShadowServerAppResultShadow } from '@shadowob/sdk/bridge'
import type { SkillRecord, SkillSummary } from '../types.js'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T

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

function shadowLaunchHeaders(headers: Record<string, string> = {}) {
  const token = new URLSearchParams(location.search).get('shadow_launch')
  return token ? { ...headers, 'X-Shadow-Launch-Token': token } : headers
}

async function command<T>(commandName: string, input: unknown = {}): Promise<T> {
  return localCommand<T>(commandName, input)
}

async function inboxes(): Promise<{ inboxes: BuddyInbox[] }> {
  const res = await fetch('/api/local/inboxes', { headers: shadowLaunchHeaders() })
  if (!res.ok) return { inboxes: [] }
  return (await res.json()) as { inboxes: BuddyInbox[] }
}

async function localCommand<T>(commandName: string, input: unknown): Promise<T> {
  const res = await fetch(`/api/local/commands/${encodeURIComponent(commandName)}`, {
    method: 'POST',
    headers: shadowLaunchHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ input }),
  })
  const payload = (await res.json()) as CommandPayload<T>
  if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Command failed')
  return ShadowBridge.unwrapCommandPayload<T>(payload)
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

export function installSkill(input: {
  skillId: string
  targetBuddyAgentId: string
  targetBuddyUserId?: string
  targetBuddyLabel?: string
}) {
  return command<{
    skill: SkillSummary
    install: { id: string; installedAt: string }
    shadow?: ShadowServerAppResultShadow
  }>('skills.install', input)
}

export function listInboxes() {
  return inboxes()
}
