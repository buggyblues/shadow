import {
  ShadowBridge,
  type ShadowBridgeBuddyInbox,
  type ShadowServerAppResultShadow,
} from '@shadowob/sdk/bridge'
import type { BattleReplay, MatchRecord, SkillType, TankProfile } from '../types.js'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T
const bridge = new ShadowBridge({ appKey: 'shadow-warbuddy' })

export type TankSummary = TankProfile & { winRate?: number; rank?: number }
export type MatchSummary = Omit<MatchRecord, 'replay'>
export type BuddyInbox = ShadowBridgeBuddyInbox

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

export function saveTankCode(input: {
  tankId?: string
  name?: string
  appearance?: string
  skillType?: SkillType
  code: string
  notes?: string
  submittedBy?: string
}) {
  return command<{ tank: TankProfile }>('tanks.saveCode', input)
}

export function simulate(input: {
  challengerTankId?: string
  defenderTankId?: string
  candidateCode?: string
  candidateName?: string
  candidateSkillType?: SkillType
  opponentId?: string
  mapId?: string
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

export function leaderboard(input: { sort?: string; limit?: number } = {}) {
  return command<{ leaderboard: TankSummary[] }>('leaderboard.get', input)
}

export async function inboxes(): Promise<{ inboxes: BuddyInbox[] }> {
  if (bridge.isAvailable()) return bridge.inboxes() as Promise<{ inboxes: BuddyInbox[] }>
  const res = await fetch('/api/local/inboxes')
  if (!res.ok) return { inboxes: [] }
  return (await res.json()) as { inboxes: BuddyInbox[] }
}

export function briefBuddies(input: {
  targets: Array<{ agentId?: string; assigneeLabel?: string }>
  mapId?: string
  opponentHint?: string
  notes?: string
}) {
  return command<{ ok: boolean; briefed: number; shadow?: ShadowServerAppResultShadow }>(
    'battle.brief',
    input,
  )
}
