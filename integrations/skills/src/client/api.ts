import {
  createShadowServerAppRuntimeClient,
  type ShadowServerAppInboxDelivery,
  type ShadowServerAppResultShadow,
} from '@shadowob/sdk/bridge'
import type { SkillRecord, SkillSummary } from '../types.js'
import { t } from './i18n.js'

const shadowApp = createShadowServerAppRuntimeClient()

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

type InstallSkillInput = {
  skillId: string
  targetBuddyAgentId: string
  targetBuddyUserId?: string
  targetBuddyLabel?: string
  targetInboxChannelId?: string
}

type InstallSkillResult = {
  skill: SkillSummary
  install: { id: string; installedAt: string }
  shadow?: ShadowServerAppResultShadow
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isUnknownTargetInboxChannelError(error: unknown) {
  const payload = isRecord(error) ? error.payload : null
  if (!isRecord(payload) || payload.error !== 'invalid_input') return false
  const issues = Array.isArray(payload.issues) ? payload.issues : []
  return issues.some((issue) => {
    if (!isRecord(issue)) return false
    return issue.path === 'targetInboxChannelId' && issue.message === 'Unknown property'
  })
}

async function command<T>(commandName: string, input: unknown = {}): Promise<T> {
  return shadowApp.command<T>(commandName, input)
}

async function inboxes(input: { refresh?: boolean } = {}): Promise<{ inboxes: BuddyInbox[] }> {
  return shadowApp.listBuddyInboxes<BuddyInbox>({ refresh: input.refresh, emptyOnError: true })
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

export async function installSkill(input: InstallSkillInput) {
  await ensureBuddyTaskGrant({
    agentId: input.targetBuddyAgentId,
    reason: 'Skills dispatches installation tasks to this Buddy Inbox.',
  })
  try {
    return await command<InstallSkillResult>('skills.install', input)
  } catch (error) {
    if (!input.targetInboxChannelId || !isUnknownTargetInboxChannelError(error)) throw error
    const { targetInboxChannelId: _targetInboxChannelId, ...legacyInput } = input
    return command<InstallSkillResult>('skills.install', legacyInput)
  }
}

export function listInboxes(input: { refresh?: boolean } = {}) {
  return inboxes(input)
}

export function bridgeAvailable() {
  return shadowApp.bridgeAvailable()
}

export function openBridgeBuddyCreator() {
  return shadowApp.openBuddyCreator({
    landing: {
      title: t('bridge.createBuddyTitle'),
      description: t('bridge.createBuddyDescription'),
      source: 'skills',
    },
  })
}

export function openInstallCopilot(delivery: ShadowServerAppInboxDelivery) {
  return shadowApp.openCopilot(delivery).catch(() => undefined)
}
