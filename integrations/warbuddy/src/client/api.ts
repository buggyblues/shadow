import {
  ShadowBridge,
  type ShadowBridgeBuddyInbox,
  type ShadowBridgeOpenBuddyCreatorInput,
  type ShadowServerAppResultShadow,
} from '@shadowob/sdk/bridge'
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

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T
const bridge = new ShadowBridge({ appKey: 'warbuddy' })

export type TankSummary = TankProfile & { winRate?: number; rank?: number }
export type MatchSummary = Omit<MatchRecord, 'replay'> & {
  commentsCount?: number
  unread?: boolean
  readAt?: string | null
}
export type BuddyInbox = ShadowBridgeBuddyInbox
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
  return bridge.isAvailable()
}

export async function getOAuthSession(): Promise<OAuthSession> {
  const params = new URLSearchParams({
    return_to: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    popup: '1',
  })
  const res = await fetch(`/api/oauth/session?${params.toString()}`)
  if (!res.ok) throw new Error('OAuth session check failed')
  return (await res.json()) as OAuthSession
}

async function command<T>(commandName: string, input: unknown): Promise<T> {
  if (bridge.isAvailable()) return bridge.command(commandName, input) as Promise<T>

  const res = await fetch(`/api/local/commands/${encodeURIComponent(commandName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const payload = (await res.json()) as CommandPayload<T>
  if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Command failed')
  return bridge.unwrapCommandPayload<T>(payload)
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
  return command<{ match: MatchRecord; shadow?: ShadowServerAppResultShadow }>(
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
  if (bridge.isAvailable()) return bridge.inboxes() as Promise<{ inboxes: BuddyInbox[] }>
  const res = await fetch('/api/local/inboxes')
  if (!res.ok) return { inboxes: [] }
  return (await res.json()) as { inboxes: BuddyInbox[] }
}

export function openBuddyCreator(input: ShadowBridgeOpenBuddyCreatorInput = {}) {
  if (!bridge.isAvailable()) {
    return Promise.resolve({ opened: false, agent: null })
  }
  return bridge.openBuddyCreator(input)
}

export function inboxDeliveryResults(payload?: unknown) {
  return ShadowBridge.inboxDeliveries(payload)
}

export function inboxDeliveryErrors(payload?: unknown) {
  return ShadowBridge.inboxErrors(payload)
}

export function briefBuddies(input: {
  targets: Array<{ agentId?: string; assigneeLabel?: string }>
  teamId?: string
  mapId?: string
  opponentHint?: string
  notes?: string
}) {
  return command<{ ok: boolean; briefed: number; shadow?: ShadowServerAppResultShadow }>(
    'battle.brief',
    input,
  )
}
