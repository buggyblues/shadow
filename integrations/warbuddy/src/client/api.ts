import {
  createShadowSpaceAppClient,
  type ShadowBridgeOpenBuddyCreatorInput,
  type ShadowSpaceAppResultShadow,
} from '@shadowob/sdk/bridge'
import { shadowSpaceAppManifest } from '../space-app.generated.js'
import type {
  BattleReplay,
  MatchRecord,
  ReplayComment,
  SkillType,
  TankProfile,
  WarbuddyPlayMode,
  WarbuddyRoom,
  WarbuddyTeam,
} from '../types.js'

const shadowSpaceApp = createShadowSpaceAppClient({ appKey: shadowSpaceAppManifest.appKey })

export type TankSummary = TankProfile & { winRate?: number; rank?: number }
export type MatchSummary = Omit<MatchRecord, 'replay'> & {
  commentsCount?: number
  unread?: boolean
  readAt?: string | null
}
export interface BuddyInbox {
  agent: {
    id: string
    ownerId?: string | null
    status?: string | null
    user?: {
      id?: string | null
      username?: string | null
      displayName?: string | null
      avatarUrl?: string | null
    } | null
  }
  channel?: { id?: string | null; name?: string | null } | null
  canManage?: boolean
}
export interface OAuthSession {
  configured: boolean
  authenticated: boolean
  profile: {
    id: string
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  authorizeUrl: string | null
}

export function bridgeAvailable() {
  return shadowSpaceApp.bridgeAvailable()
}

export async function getOAuthSession(
  options: { refreshLaunch?: boolean } = {},
): Promise<OAuthSession> {
  const params = new URLSearchParams({
    return_to: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    popup: '1',
  })
  const res = await shadowSpaceApp.fetchWithSession(
    `/api/oauth/session?${params.toString()}`,
    {},
    options.refreshLaunch ? { refresh: { reason: 'oauth_session' } } : {},
  )
  if (!res.ok) throw new Error('OAuth session check failed')
  return (await res.json()) as OAuthSession
}

async function command<T>(commandName: string, input: unknown): Promise<T> {
  return shadowSpaceApp.command<T>(commandName, input)
}

async function ensureBuddyTaskGrants(targets: Array<{ agentId?: string | null }>) {
  const agentIds = Array.from(
    new Set(
      targets
        .map((target) => target.agentId?.trim())
        .filter((agentId): agentId is string => !!agentId),
    ),
  )
  for (const buddyAgentId of agentIds) {
    await shadowSpaceApp.ensureBuddyTaskGrant({
      agentId: buddyAgentId,
      reason: 'WarBuddy sends tactical brief tasks to this Buddy Inbox.',
    })
  }
}

export function listTanks(input: { query?: string; ownerKind?: string; limit?: number } = {}) {
  return command<{
    maps: Array<{ id: string; name: string; raw: string }>
    tanks: TankSummary[]
  }>('tanks.list', input)
}

export function listTeams() {
  return command<{ teams: WarbuddyTeam[]; mine: WarbuddyTeam | null }>('teams.list', {})
}

export function createTeam(input: { name: string; description?: string; color?: string }) {
  return command<{ team: WarbuddyTeam; tank: TankSummary | null }>('teams.create', input)
}

export function simulate(input: {
  challengerTankId?: string
  defenderTankId?: string
  candidateCode?: string
  candidateName?: string
  candidateSkillType?: SkillType
  opponentId?: string
  mapId?: string
  fps?: number
  durationSeconds?: number
}) {
  return command<{
    replay: BattleReplay
    challenger: TankSummary
    defender: TankSummary
  }>('matches.simulate', input)
}

export function challenge(input: {
  challengerTankId: string
  defenderTankId: string
  mapId?: string
  fps?: number
  durationSeconds?: number
  announceChannelName?: string
}) {
  return command<{ match: MatchRecord; shadow?: ShadowSpaceAppResultShadow }>(
    'matches.challenge',
    input,
  )
}

export function listMatches(input: { tankId?: string; limit?: number; offset?: number } = {}) {
  return command<{ matches: MatchSummary[] }>('matches.list', input)
}

export function getMatch(input: {
  matchId: string
  view?: 'summary' | 'events' | 'raw' | 'frames'
}) {
  return command<{ match: MatchRecord } & Record<string, unknown>>('matches.get', input)
}

export function markMatchRead(input: { matchId: string }) {
  return command<{ match: MatchSummary }>('matches.markRead', input)
}

export function addReplayComment(input: {
  matchId: string
  frame: number
  body: string
  rect?: { x: number; y: number; width: number; height: number }
}) {
  return command<{ comment: ReplayComment; comments: ReplayComment[] }>('replay.comment', input)
}

export function replayReviewBrief(input: { matchId: string }) {
  return command<{ match: MatchSummary; comments: ReplayComment[]; summary: string }>(
    'replay.reviewBrief',
    input,
  )
}

export function leaderboard(input: { sort?: string; limit?: number } = {}) {
  return command<{ leaderboard: TankSummary[] }>('leaderboard.get', input)
}

export function listRooms() {
  return command<{ rooms: WarbuddyRoom[] }>('rooms.list', {})
}

export function createRoom(input: {
  name?: string
  mapId?: string
  mode?: WarbuddyPlayMode
  teamId?: string
}) {
  return command<{ room: WarbuddyRoom; team: WarbuddyTeam }>('rooms.create', input)
}

export function joinRoom(input: { code: string; mode?: WarbuddyPlayMode; teamId?: string }) {
  return command<{ room: WarbuddyRoom; team: WarbuddyTeam }>('rooms.join', input)
}

export async function inboxes(): Promise<{ inboxes: BuddyInbox[] }> {
  return shadowSpaceApp.listBuddyInboxes<BuddyInbox>({ emptyOnError: true })
}

export function openBuddyCreator(input: ShadowBridgeOpenBuddyCreatorInput = {}) {
  return shadowSpaceApp.openBuddyCreator(input)
}

export function inboxDeliveryResults(payload?: unknown) {
  return shadowSpaceApp.inboxDeliveries(payload)
}

export function inboxDeliveryErrors(payload?: unknown) {
  return shadowSpaceApp.inboxErrors(payload)
}

export async function briefBuddies(input: {
  targets: Array<{ agentId?: string; assigneeLabel?: string }>
  teamId?: string
  mapId?: string
  opponentHint?: string
  notes?: string
}) {
  await ensureBuddyTaskGrants(input.targets)
  return command<{ ok: boolean; briefed: number; shadow?: ShadowSpaceAppResultShadow }>(
    'battle.brief',
    input,
  )
}
