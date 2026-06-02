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
export type Tile = 'x' | 'm' | 'o' | 'w' | '.'
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
  teamId?: string | null
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

export type BattleTankProfile = Pick<TankProfile, 'id' | 'name' | 'skillType' | 'code' | 'codeHash'>

export interface RunBattleInput {
  challenger: BattleTankProfile
  defender: BattleTankProfile
  mapId?: string
  seed?: number
  fps?: number
  durationSeconds?: number
  rules?: import('./rules.js').WarbuddyRules
  /** @deprecated Use durationSeconds and fps so replays match real-time pacing. */
  maxFrames?: number
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
  shotgunLevel: number
  armor: number
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
    powered?: boolean
  }
  death?: UnitDeathState | null
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
  maxBombs: number
  status: {
    cloaked: boolean
    fireLocked: boolean
    swimming: boolean
    powered?: boolean
  }
  death?: UnitDeathState | null
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

export type UnitKind = 'tank' | 'engineer'
export type UnitDeathCause = 'bullet' | 'bomb' | 'crush' | 'runtime'

export interface UnitDeathState {
  cause: UnitDeathCause
  by?: number | null
  frame?: number
  detail?: string
}

export interface BattleSpeechState {
  id: string
  owner: number
  unitKind: UnitKind
  unitName: string
  text: string
  position: [number, number]
  remainingFrames: number
}

export interface BattleScoreboardState {
  sides: Array<{
    owner: number
    flags: number
    tankAlive: boolean
    engineerAlive: boolean
    kills: number
    losses: number
  }>
}

export interface BattleFrameState {
  tanks: RuntimeTankState[]
  engineers: RuntimeEngineerState[]
  bullets: BattleBulletState[]
  bombs: BattleBombState[]
  explosions: BattleExplosionState[]
  star: [number, number] | null
  flag: [number, number] | null
  flagScores: [number, number]
  bulletClashes: number
  speeches?: BattleSpeechState[]
  scoreboard?: BattleScoreboardState
  map: Tile[][]
}

export interface BattleEvent {
  type: 'star' | 'flag' | 'tank' | 'bullet' | 'skill' | 'speech' | 'runtime' | 'game'
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
    fps: number
    durationSeconds: number
    maxFrames: number
    coordinateSpace?: 'grid' | 'world'
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

export type BattleResultReason = 'hit' | 'crashed' | 'stars' | 'flags' | 'runtime' | 'draw'

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
      deaths?: Record<string, UnitDeathState | null>
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

export interface ReplayComment {
  id: string
  matchId: string
  frame: number
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  body: string
  author: WarbuddyActorRef
  createdAt: string
}

export interface MatchReadState {
  matchId: string
  actorId: string
  readAt: string
}

export interface MatchParticipant {
  tankId: string
  tankName: string
  ownerKind: OwnerKind
  ownerDisplayName: string
  codeHash: string
  skillType: SkillType
}

export type WarbuddyPlayMode = 'auto' | 'manual' | 'coop'
export type WarbuddyRoomStatus = 'waiting' | 'live' | 'settled'

export interface WarbuddyTeam {
  id: string
  name: string
  description: string
  color: string
  owner: WarbuddyActorRef
  tankId: string
  strategyBuddyAgentIds?: string[]
  createdAt: string
  updatedAt: string
}

export interface WarbuddyRoom {
  id: string
  code: string
  name: string
  mode: WarbuddyPlayMode
  status: WarbuddyRoomStatus
  mapId: string
  hostTeamId: string
  guestTeamId?: string | null
  participants: Array<{
    actorId: string
    displayName: string
    teamId?: string | null
    mode: WarbuddyPlayMode
    joinedAt: string
  }>
  createdAt: string
  updatedAt: string
}

export interface WarbuddyState {
  teams: WarbuddyTeam[]
  tanks: TankProfile[]
  matches: MatchRecord[]
  rooms: WarbuddyRoom[]
  replayComments: ReplayComment[]
  readStates: MatchReadState[]
  updatedAt: string
}
