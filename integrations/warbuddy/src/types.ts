export const SKILL_TYPES = [
  'shield',
  'freeze',
  'stun',
  'overload',
  'cloak',
  'poison',
  'teleport',
  'boost',
] as const

export type SkillType = (typeof SKILL_TYPES)[number]
export type Direction = 'up' | 'right' | 'down' | 'left'
export type Tile = 'x' | 'm' | 'o' | '.'
export type OwnerKind = 'local' | 'user' | 'buddy' | 'demo'

export interface WarbuddyActorRef {
  kind: string
  id: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  displayName: string
  avatarUrl?: string | null
}

export interface TankProfile {
  id: string
  name: string
  appearance: string
  skillType: SkillType
  code: string
  codeVersion: number
  codeHash: string
  notes?: string
  submittedBy?: string
  ownerKind: OwnerKind
  owner: WarbuddyActorRef
  wins: number
  losses: number
  draws: number
  starsCollected: number
  shotsFired: number
  shotsHit: number
  rankScore: number
  excitementScore: number
  createdAt: string
  updatedAt: string
}

export interface BattleMap {
  id: string
  name: string
  raw: string
  map: Tile[][]
  players: Array<{
    position: [number, number]
    direction: Direction
  }>
}

export interface RuntimeTankState {
  id: string
  name: string
  position: [number, number]
  direction: Direction
  headingDegrees?: number
  crashed: boolean
  stars: number
  skillType: SkillType
  status: {
    shielded: boolean
    cloaked: boolean
    boosted: boolean
    overloaded: boolean
    frozen: boolean
    stunned: boolean
    poisoned: boolean
    fireLocked: boolean
    actionSpeed: number
    canActThisFrame: boolean
  }
}

export interface BattleBulletState {
  id: string
  owner: number
  position: [number, number]
  direction: Direction
  headingDegrees?: number
  alive: boolean
}

export interface RuntimeEngineerState {
  id: string
  owner: number
  name: string
  position: [number, number]
  direction: Direction
  headingDegrees?: number
  alive: boolean
  bombRange: number
  status: {
    cloaked: boolean
    fireLocked: boolean
  }
}

export interface BattleBombState {
  id: string
  owner: number
  position: [number, number]
  range: number
  remainingFrames: number
}

export interface BattleExplosionState {
  id: string
  owner: number
  positions: Array<[number, number]>
  remainingFrames: number
}

export interface BattleFrameState {
  tanks: RuntimeTankState[]
  engineers: RuntimeEngineerState[]
  bullets: BattleBulletState[]
  bombs: BattleBombState[]
  explosions: BattleExplosionState[]
  star: [number, number] | null
  map: Tile[][]
}

export interface BattleEvent {
  type: 'star' | 'tank' | 'bullet' | 'skill' | 'speech' | 'runtime' | 'game'
  action: string
  by?: number
  tank?: string
  objectId?: string
  position?: [number, number]
  direction?: Direction
  text?: string
  skill?: SkillType
  reason?: string
  winner?: number | null
  details?: Record<string, unknown>
}

export interface BattleFrame {
  frame: number
  events: BattleEvent[]
  state: BattleFrameState
}

export interface BattleReplay {
  meta: {
    mapId: string
    mapName: string
    matchSeed: number
    players: Array<{
      tankId: string
      name: string
      skillType: SkillType
      codeHash: string
      runTime: number
    }>
    result: {
      type: 'game'
      action: 'end'
      reason: BattleResultReason
      winner: number | null
    }
    excitementScore: number
  }
  frames: BattleFrame[]
  events: Array<BattleEvent & { frame: number }>
  summary: BattleSummary
}

export type BattleResultReason = 'hit' | 'crashed' | 'stars' | 'runtime' | 'draw'

export interface BattleSummary {
  framesTotal: number
  result: {
    winner: string | null
    reason: BattleResultReason
  }
  tanks: Record<
    string,
    {
      shotsFired: number
      shotsHit: number
      shotsWall: number
      moves: number
      turns: number
      stars: number
      skillUsed: number
      crashes: number
      runtimeMs: number
      diagnosis: string
    }
  >
}

export interface MatchRecord {
  id: string
  urlId: string
  createdAt: string
  mapId: string
  mapName: string
  resultReason: BattleResultReason
  status: 'settled'
  winnerTankId: string | null
  winnerTankName: string | null
  winnerRole: 'challenger' | 'defender' | 'draw'
  excitementScore: number
  participants: {
    challenger: MatchParticipant
    defender: MatchParticipant
  }
  replay: BattleReplay
}

export interface MatchParticipant {
  tankId: string
  tankName: string
  ownerKind: OwnerKind
  ownerDisplayName: string
  codeHash: string
  skillType: SkillType
}

export interface WarbuddyState {
  tanks: TankProfile[]
  matches: MatchRecord[]
  updatedAt: string
}
