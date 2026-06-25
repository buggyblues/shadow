import { createHash, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import {
  normalizeShadowServerAppAvatarUrl,
  type ShadowServerAppActorRef,
  ShadowServerAppOutbox,
} from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import { BATTLE_MAPS, battleResultReasonLabel, runRealtimeBattle } from './game.js'
import { DEFAULT_TANK_STRATEGY_CODE } from './rules.js'
import {
  type MatchRecord,
  type OwnerKind,
  type ReplayComment,
  SKILL_TYPES,
  type SkillType,
  type TankProfile,
  type WarbuddyActorRef,
  type WarbuddyPlayMode,
  type WarbuddyRoom,
  type WarbuddyState,
  type WarbuddyTeam,
} from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${randomUUID()}`

export const DEFAULT_TANK_CODE = DEFAULT_TANK_STRATEGY_CODE
export const SYSTEM_STRATEGY_CODE = DEFAULT_TANK_STRATEGY_CODE

function normalizeShadowAvatarUrl(value: unknown) {
  return normalizeShadowServerAppAvatarUrl(value, process.env)
}

const BRAWLER_CODE = `function aligned(a, b) {
  return a && b && (a[0] === b[0] || a[1] === b[1]);
}

var DIRS = ["up", "right", "down", "left"];
var DELTAS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

function open(game, position) {
  var column = game.map[position[0]];
  var tile = column && column[position[1]];
  return tile === "." || tile === "o";
}

function ahead(me) {
  var delta = DELTAS[me.tank.direction];
  return [me.tank.position[0] + delta[0], me.tank.position[1] + delta[1]];
}

function turnTo(me, direction) {
  me.tank.aim(direction);
}

function directionTo(me, target) {
  var dx = target[0] - me.tank.position[0];
  var dy = target[1] - me.tank.position[1];
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  if (dy !== 0) return dy > 0 ? "down" : "up";
  if (dx !== 0) return dx > 0 ? "right" : "left";
  return me.tank.direction;
}

function advance(me, game) {
  if (open(game, ahead(me))) me.tank.drive();
  else me.tank.aim("right");
}

function onIdle(me, enemy, game) {
  if (me.skill.remainingCooldownFrames === 0 && me.skill.type === "overload" && enemy.tank) {
    me.tank.overload();
    return;
  }
  if (enemy.tank) {
    var direction = directionTo(me, enemy.tank.position);
    if (aligned(me.tank.position, enemy.tank.position) && direction === me.tank.direction) me.tank.fire();
    else if (direction === me.tank.direction) advance(me, game);
    else turnTo(me, direction);
    return;
  }
  advance(me, game);
}`

const STAR_HUNTER_CODE = `function onIdle(me, enemy, game) {
  var dirs = ["up", "right", "down", "left"];
  var deltas = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

  function open(position) {
    var column = game.map[position[0]];
    var tile = column && column[position[1]];
    return tile === "." || tile === "o";
  }

  function ahead() {
    var delta = deltas[me.tank.direction];
    return [me.tank.position[0] + delta[0], me.tank.position[1] + delta[1]];
  }

  function turnTo(direction) {
    me.tank.aim(direction);
  }

  function directionTo(target) {
    var dx = target[0] - me.tank.position[0];
    var dy = target[1] - me.tank.position[1];
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    if (dy !== 0) return dy > 0 ? "down" : "up";
    if (dx !== 0) return dx > 0 ? "right" : "left";
    return me.tank.direction;
  }

  if (enemy.tank && (me.tank.position[0] === enemy.tank.position[0] || me.tank.position[1] === enemy.tank.position[1]) && directionTo(enemy.tank.position) === me.tank.direction && !enemy.status.shielded) {
    me.tank.fire();
    return;
  }
  if (me.skill.remainingCooldownFrames === 0 && me.skill.type === "boost" && (game.flag || game.star)) {
    me.tank.boost();
    return;
  }
  var target = game.flag || game.star || (enemy.tank && enemy.tank.position);
  if (!target) {
    me.tank.aim("right");
    return;
  }
  var direction = directionTo(target);
  if (direction !== me.tank.direction) turnTo(direction);
  else if (open(ahead())) {
    me.tank.drive();
  } else {
    me.tank.aim("right");
  }
}`

function actorToOwner(actor: ShadowServerAppActorRef): WarbuddyActorRef {
  return {
    kind: actor.kind,
    id: actor.buddyAgentId ?? actor.userId ?? actor.id,
    userId: actor.userId ?? null,
    buddyAgentId: actor.buddyAgentId ?? null,
    ownerId: actor.ownerId ?? null,
    displayName: actor.displayName || ownerKindLabel(actorKind(actor)),
    avatarUrl: normalizeShadowAvatarUrl(actor.avatarUrl),
  }
}

function actorKind(actor: Pick<ShadowServerAppActorRef, 'kind' | 'buddyAgentId'>): OwnerKind {
  if (actor.kind === 'agent' || actor.buddyAgentId) return 'buddy'
  if (actor.kind === 'local') return 'local'
  return 'user'
}

function ownerKindLabel(kind: OwnerKind) {
  switch (kind) {
    case 'buddy':
      return 'Server Buddy'
    case 'demo':
      return 'Training Bot'
    case 'local':
      return 'Local Pilot'
    case 'user':
      return 'Pilot'
  }
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex')
}

function demoOwner(): WarbuddyActorRef {
  return {
    kind: 'demo',
    id: 'demo',
    userId: null,
    buddyAgentId: null,
    ownerId: null,
    displayName: 'WarBuddy Demo Bots',
    avatarUrl: null,
  }
}

function createTank(input: {
  id: string
  teamId?: string | null
  name: string
  appearance: string
  skillType: SkillType
  code: string
  ownerKind: OwnerKind
  owner: WarbuddyActorRef
  rankScore?: number
}): TankProfile {
  const timestamp = now()
  return {
    id: input.id,
    teamId: input.teamId ?? null,
    name: input.name,
    appearance: input.appearance,
    skillType: input.skillType,
    code: input.code,
    codeVersion: 1,
    codeHash: hashCode(input.code),
    ownerKind: input.ownerKind,
    owner: input.owner,
    wins: 0,
    losses: 0,
    draws: 0,
    starsCollected: 0,
    shotsFired: 0,
    shotsHit: 0,
    rankScore: input.rankScore ?? 1200,
    excitementScore: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function defaultState(): WarbuddyState {
  const owner = demoOwner()
  return {
    teams: [],
    tanks: [
      createTank({
        id: 'nova-scout',
        name: 'Nova Scout',
        appearance: 'compact red scout with a fast turret',
        skillType: 'shield',
        code: SYSTEM_STRATEGY_CODE,
        ownerKind: 'demo',
        owner,
        rankScore: 1210,
      }),
      createTank({
        id: 'azure-hunter',
        name: 'Azure Hunter',
        appearance: 'blue pressure tank with a bright barrel',
        skillType: 'overload',
        code: SYSTEM_STRATEGY_CODE,
        ownerKind: 'demo',
        owner,
        rankScore: 1260,
      }),
      createTank({
        id: 'crimson-bastion',
        name: 'Crimson Bastion',
        appearance: 'heavy objective tank with bright side armor',
        skillType: 'boost',
        code: SYSTEM_STRATEGY_CODE,
        ownerKind: 'demo',
        owner,
        rankScore: 1240,
      }),
    ],
    matches: [],
    rooms: [],
    replayComments: [],
    readStates: [],
    updatedAt: now(),
  }
}

const DEMO_TANK_CODE_BY_ID: Record<string, string> = {
  'nova-scout': SYSTEM_STRATEGY_CODE,
  'azure-hunter': SYSTEM_STRATEGY_CODE,
  'crimson-bastion': SYSTEM_STRATEGY_CODE,
}

function dataFilePath() {
  return resolve(process.env.WARBUDDY_DATA_FILE ?? './data/warbuddy.json')
}

function isState(value: unknown): value is WarbuddyState {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { tanks?: unknown }).tanks) &&
    Array.isArray((value as { matches?: unknown }).matches)
  )
}

const store = createShadowServerAppJsonStore<WarbuddyState>({
  filePath: dataFilePath(),
  defaultValue: defaultState,
  validate: isState,
  normalize: (value) => ({
    ...defaultState(),
    ...value,
    teams: Array.isArray(value.teams) ? value.teams.map(normalizeTeam) : [],
    tanks: value.tanks.map(normalizeTank),
    matches: value.matches.map((match) => ({ ...match, status: 'settled' })),
    rooms: Array.isArray(value.rooms) ? value.rooms.map(normalizeRoom) : [],
    replayComments: Array.isArray(value.replayComments) ? value.replayComments : [],
    readStates: Array.isArray(value.readStates) ? value.readStates : [],
  }),
})

let state = store.read()

function persist() {
  state.updatedAt = now()
  state = store.write(state)
}

function normalizeTank(tank: TankProfile): TankProfile {
  const skillType = SKILL_TYPES.includes(tank.skillType) ? tank.skillType : 'shield'
  const code =
    (tank.ownerKind === 'demo' ? DEMO_TANK_CODE_BY_ID[tank.id] : undefined) ??
    tank.code ??
    SYSTEM_STRATEGY_CODE
  return {
    ...tank,
    teamId: tank.teamId ?? null,
    skillType,
    code,
    codeHash: code === tank.code ? tank.codeHash || hashCode(code) : hashCode(code),
    rankScore: Number.isFinite(tank.rankScore) ? tank.rankScore : 1200,
    excitementScore: Number.isFinite(tank.excitementScore) ? tank.excitementScore : 0,
  }
}

function normalizeTeam(team: WarbuddyTeam): WarbuddyTeam {
  return {
    ...team,
    color: normalizeTeamColor(team.color),
    description: team.description ?? '',
    strategyBuddyAgentIds: uniqueStrings(team.strategyBuddyAgentIds ?? []),
  }
}

function normalizeRoom(room: WarbuddyRoom): WarbuddyRoom {
  return {
    ...room,
    status: room.status ?? 'waiting',
    mode: room.mode ?? 'coop',
    participants: Array.isArray(room.participants) ? room.participants : [],
  }
}

export function resetWarbuddyForTests(next: WarbuddyState = defaultState()) {
  state = structuredClone(next)
  persist()
}

export function listMaps() {
  return BATTLE_MAPS.map((map) => ({
    id: map.id,
    name: map.name,
    raw: map.raw,
  }))
}

export function listTeams(actor?: ShadowServerAppActorRef) {
  const actorId = actor ? actorStableId(actor) : null
  return {
    teams: structuredClone(state.teams),
    mine: actorId
      ? (state.teams.find((team) => actorStableIdFromRef(team.owner) === actorId) ?? null)
      : null,
  }
}

export function getActorTeam(actor: ShadowServerAppActorRef) {
  const actorId = actorStableId(actor)
  return state.teams.find((team) => actorStableIdFromRef(team.owner) === actorId) ?? null
}

export function createTeam(
  actor: ShadowServerAppActorRef,
  input: { name: string; description?: string; color?: string },
) {
  const existing = getActorTeam(actor)
  const timestamp = now()
  const owner = actorToOwner(actor)
  if (existing) {
    existing.name = input.name.trim() || existing.name
    existing.description = input.description?.trim() ?? existing.description
    existing.color = normalizeTeamColor(input.color ?? existing.color)
    existing.updatedAt = timestamp
    const tank = getTank(existing.tankId)
    if (tank) {
      tank.name = `${existing.name} Tank`
      tank.appearance = `${existing.color} combined-arms squad tank`
      tank.teamId = existing.id
      tank.updatedAt = timestamp
    }
    persist()
    return { team: structuredClone(existing), tank: tank ? redactTank(tank) : null }
  }

  const teamId = id('team')
  const tank = createTank({
    id: id('squad_tank'),
    teamId,
    name: `${input.name.trim() || owner.displayName} Tank`,
    appearance: `${normalizeTeamColor(input.color)} combined-arms squad tank`,
    skillType: 'shield',
    code: SYSTEM_STRATEGY_CODE,
    ownerKind: actorKind(actor),
    owner,
  })
  tank.notes = 'System AI controls this squad until a Buddy writes strategy code.'
  tank.submittedBy = owner.displayName
  const team: WarbuddyTeam = {
    id: teamId,
    name: input.name.trim() || `${owner.displayName}'s Squad`,
    description: input.description?.trim() || 'Fresh WarBuddy squad.',
    color: normalizeTeamColor(input.color),
    owner,
    tankId: tank.id,
    strategyBuddyAgentIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  state.teams.push(team)
  state.tanks.push(tank)
  persist()
  return { team: structuredClone(team), tank: redactTank(tank) }
}

export function listTanks(
  input: { query?: string; ownerKind?: OwnerKind | 'all'; limit?: number } = {},
) {
  const query = input.query?.trim().toLowerCase()
  const ownerKind = input.ownerKind ?? 'all'
  return state.tanks
    .filter((tank) => {
      if (ownerKind !== 'all' && tank.ownerKind !== ownerKind) return false
      if (!query) return true
      return [tank.name, tank.owner.displayName, tank.id, tank.skillType]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
    .sort((a, b) => b.rankScore - a.rankScore || b.wins - a.wins)
    .slice(0, input.limit ?? 100)
    .map(redactTank)
}

export function getTank(tankId: string) {
  return state.tanks.find((tank) => tank.id === tankId) ?? null
}

export function findActorTank(actor: ShadowServerAppActorRef) {
  const owner = actorToOwner(actor)
  const kind = actorKind(actor)
  return (
    state.tanks.find(
      (tank) =>
        tank.ownerKind === kind &&
        (tank.owner.buddyAgentId
          ? tank.owner.buddyAgentId === owner.buddyAgentId
          : tank.owner.userId === owner.userId && tank.owner.id === owner.id),
    ) ?? null
  )
}

export function saveTankCode(
  actor: ShadowServerAppActorRef,
  input: {
    tankId?: string
    name?: string
    appearance?: string
    skillType?: SkillType
    code: string
    notes?: string
    submittedBy?: string
  },
) {
  const owner = actorToOwner(actor)
  const ownerKind = actorKind(actor)
  const existing =
    (input.tankId ? state.tanks.find((tank) => tank.id === input.tankId) : null) ??
    findActorTank(actor)
  const timestamp = now()
  const skillType = input.skillType ?? existing?.skillType ?? 'shield'
  if (!SKILL_TYPES.includes(skillType)) throw new Error('invalid_skill')

  if (existing) {
    if (!canActorWriteTank(actor, existing)) {
      throw Object.assign(new Error('tank_not_owned_by_actor'), { status: 403 })
    }
    existing.name = input.name?.trim() || existing.name
    existing.appearance = input.appearance?.trim() || existing.appearance
    existing.skillType = skillType
    existing.code = input.code
    existing.codeHash = hashCode(input.code)
    existing.codeVersion += 1
    existing.notes = input.notes?.trim() || existing.notes
    existing.submittedBy = input.submittedBy?.trim() || actor.displayName
    existing.updatedAt = timestamp
    persist()
    return structuredClone(existing)
  }

  const tank = createTank({
    id: input.tankId?.trim() || id(ownerKind === 'buddy' ? 'buddy_tank' : 'tank'),
    teamId: getActorTeam(actor)?.id ?? null,
    name: input.name?.trim() || `${owner.displayName}'s Tank`,
    appearance: input.appearance?.trim() || 'server-forged tank with a readable silhouette',
    skillType,
    code: input.code,
    ownerKind,
    owner,
  })
  tank.notes = input.notes?.trim()
  tank.submittedBy = input.submittedBy?.trim() || actor.displayName
  state.tanks.push(tank)
  persist()
  return structuredClone(tank)
}

export function simulateBattle(input: {
  challengerTankId?: string
  defenderTankId?: string
  candidate?: {
    actor: ShadowServerAppActorRef
    code: string
    name?: string
    skillType?: SkillType
  }
  opponentId?: string
  mapId?: string
  seed?: number
  fps?: number
  durationSeconds?: number
}) {
  const challenger = input.candidate
    ? temporaryCandidateTank(input.candidate)
    : (getTank(input.challengerTankId ?? '') ?? state.tanks[0]!)
  const defender =
    getTank(input.defenderTankId ?? '') ??
    getTank(input.opponentId ?? '') ??
    state.tanks.find((tank) => tank.id !== challenger.id) ??
    state.tanks[0]!
  const replay = runRealtimeBattle({
    challenger,
    defender,
    mapId: input.mapId,
    seed: input.seed,
    fps: input.fps,
    durationSeconds: input.durationSeconds,
  })
  return {
    type: 'warbuddy.match_simulation',
    maps: listMaps(),
    challenger: redactTank(challenger),
    defender: redactTank(defender),
    replay,
  }
}

export function recordChallenge(input: {
  challengerTankId: string
  defenderTankId: string
  mapId?: string
  seed?: number
  fps?: number
  durationSeconds?: number
}) {
  const challenger = getTank(input.challengerTankId)
  const defender = getTank(input.defenderTankId)
  if (!challenger || !defender) throw Object.assign(new Error('tank_not_found'), { status: 404 })
  if (challenger.id === defender.id) {
    throw Object.assign(new Error('tanks_must_be_different'), { status: 400 })
  }

  const replay = runRealtimeBattle({
    challenger,
    defender,
    mapId: input.mapId,
    seed: input.seed,
    fps: input.fps,
    durationSeconds: input.durationSeconds,
  })
  const winnerIndex = replay.meta.result.winner
  const winner = winnerIndex === null ? null : winnerIndex === 0 ? challenger : defender
  const match: MatchRecord = {
    id: id('match'),
    urlId: id('mat'),
    createdAt: now(),
    mapId: replay.meta.mapId,
    mapName: replay.meta.mapName,
    resultReason: replay.meta.result.reason,
    status: 'settled',
    winnerTankId: winner?.id ?? null,
    winnerTankName: winner?.name ?? null,
    winnerRole: winnerIndex === null ? 'draw' : winnerIndex === 0 ? 'challenger' : 'defender',
    excitementScore: replay.meta.excitementScore,
    participants: {
      challenger: matchParticipant(challenger),
      defender: matchParticipant(defender),
    },
    replay,
  }

  applyMatchStats(challenger, defender, match)
  state.matches.unshift(match)
  state.matches = state.matches.slice(0, 500)
  persist()
  return structuredClone(match)
}

export function listMatches(
  input: { tankId?: string; limit?: number; offset?: number } = {},
  actor?: ShadowServerAppActorRef,
) {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100)
  const offset = Math.max(input.offset ?? 0, 0)
  const actorId = actor ? actorStableId(actor) : null
  return state.matches
    .filter((match) => {
      if (!input.tankId) return true
      return (
        match.participants.challenger.tankId === input.tankId ||
        match.participants.defender.tankId === input.tankId
      )
    })
    .slice(offset, offset + limit)
    .map((match) => compactMatch(match, actorId))
}

export function getMatchView(input: {
  matchId: string
  view?: 'summary' | 'events' | 'raw' | 'frames'
  from?: number
  to?: number
}) {
  const match =
    state.matches.find((item) => item.id === input.matchId || item.urlId === input.matchId) ?? null
  if (!match) throw Object.assign(new Error('match_not_found'), { status: 404 })
  const view = input.view ?? 'summary'
  if (view === 'events') {
    return {
      type: 'warbuddy.match_replay',
      version: 1,
      view,
      match: compactMatch(match),
      events: match.replay.events,
      generatedAt: now(),
    }
  }
  if (view === 'frames') {
    const from = Math.max(0, input.from ?? 0)
    const to = Math.min(match.replay.frames.length - 1, input.to ?? from + 10)
    return {
      type: 'warbuddy.match_replay_frames',
      version: 1,
      match: compactMatch(match),
      from,
      to,
      framesTotal: match.replay.frames.length,
      frames: match.replay.frames.slice(from, to + 1),
      generatedAt: now(),
    }
  }
  if (view === 'raw') {
    return {
      type: 'warbuddy.match_replay',
      version: 1,
      view,
      match,
      generatedAt: now(),
    }
  }
  return {
    type: 'warbuddy.match_replay',
    version: 1,
    view: 'summary',
    match: compactMatch(match),
    summary: match.replay.summary,
    eventsUrlHint:
      'Use matches.get with view=events for tactical detail or view=frames for bounded frame slices.',
    generatedAt: now(),
  }
}

export function markMatchRead(actor: ShadowServerAppActorRef, input: { matchId: string }) {
  const match = findMatch(input.matchId)
  if (!match) throw Object.assign(new Error('match_not_found'), { status: 404 })
  const actorId = actorStableId(actor)
  const existing = state.readStates.find(
    (item) => item.matchId === match.id && item.actorId === actorId,
  )
  if (existing) existing.readAt = now()
  else state.readStates.push({ matchId: match.id, actorId, readAt: now() })
  persist()
  return { match: compactMatch(match, actorId) }
}

export function addReplayComment(
  actor: ShadowServerAppActorRef,
  input: {
    matchId: string
    frame: number
    rect?: Partial<ReplayComment['rect']>
    body: string
  },
) {
  const match = findMatch(input.matchId)
  if (!match) throw Object.assign(new Error('match_not_found'), { status: 404 })
  const body = input.body.trim()
  if (!body) throw Object.assign(new Error('comment_body_required'), { status: 400 })
  const frame = clampInt(input.frame, 0, Math.max(0, match.replay.frames.length - 1))
  const comment: ReplayComment = {
    id: id('comment'),
    matchId: match.id,
    frame,
    rect: {
      x: clampRatio(input.rect?.x ?? 0.2),
      y: clampRatio(input.rect?.y ?? 0.2),
      width: clampRatio(input.rect?.width ?? 0.3),
      height: clampRatio(input.rect?.height ?? 0.2),
    },
    body,
    author: actorToOwner(actor),
    createdAt: now(),
  }
  state.replayComments.push(comment)
  persist()
  return { comment: structuredClone(comment), comments: replayComments(match.id) }
}

export function replayReviewBrief(input: { matchId: string }) {
  const match = findMatch(input.matchId)
  if (!match) throw Object.assign(new Error('match_not_found'), { status: 404 })
  const comments = replayComments(match.id)
  return {
    match: compactMatch(match),
    comments,
    summary: comments
      .map((comment) => `Frame ${comment.frame}: ${comment.body}`)
      .join('\n')
      .trim(),
  }
}

export function leaderboard(
  input: { sort?: 'rating' | 'wins' | 'win_rate' | 'excitement'; limit?: number } = {},
) {
  const sort = input.sort ?? 'rating'
  const ranked = [...state.tanks]
  ranked.sort((a, b) => {
    switch (sort) {
      case 'wins':
        return b.wins - a.wins || b.rankScore - a.rankScore
      case 'win_rate':
        return winRate(b) - winRate(a) || b.wins - a.wins
      case 'excitement':
        return b.excitementScore - a.excitementScore || b.rankScore - a.rankScore
      case 'rating':
      default:
        return b.rankScore - a.rankScore || b.wins - a.wins
    }
  })
  return ranked.slice(0, input.limit ?? 50).map((tank, index) => ({
    rank: index + 1,
    ...redactTank(tank),
    winRate: winRate(tank),
  }))
}

export function listRooms() {
  const cutoff = Date.now() - 1000 * 60 * 60 * 6
  return {
    rooms: state.rooms
      .filter((room) => Date.parse(room.updatedAt) >= cutoff || room.status === 'live')
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
  }
}

export function getRoomByCode(code: string) {
  const normalized = code.trim().toUpperCase()
  const room = state.rooms.find((item) => item.code.toUpperCase() === normalized)
  return room ? structuredClone(room) : null
}

export function createRoom(
  actor: ShadowServerAppActorRef,
  input: { name?: string; mapId?: string; mode?: WarbuddyPlayMode; teamId?: string },
) {
  const team = requireActorTeam(actor, input.teamId)
  const timestamp = now()
  const participant = roomParticipant(actor, team.id, input.mode ?? 'coop')
  const room: WarbuddyRoom = {
    id: id('room'),
    code: uniqueRoomCode(),
    name: input.name?.trim() || `${team.name} Live Room`,
    mode: input.mode ?? 'coop',
    status: 'waiting',
    mapId: input.mapId?.trim() || 'random',
    hostTeamId: team.id,
    guestTeamId: null,
    participants: [participant],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  state.rooms.unshift(room)
  state.rooms = state.rooms.slice(0, 80)
  persist()
  return { room: structuredClone(room), team: structuredClone(team) }
}

export function joinRoom(
  actor: ShadowServerAppActorRef,
  input: { code: string; mode?: WarbuddyPlayMode; teamId?: string },
) {
  const team = requireActorTeam(actor, input.teamId)
  const room = state.rooms.find(
    (item) => item.code.toUpperCase() === input.code.trim().toUpperCase(),
  )
  if (!room) throw Object.assign(new Error('room_not_found'), { status: 404 })
  const participant = roomParticipant(actor, team.id, input.mode ?? room.mode)
  room.participants = [
    ...room.participants.filter((item) => item.actorId !== participant.actorId),
    participant,
  ].slice(-8)
  if (team.id !== room.hostTeamId) room.guestTeamId = team.id
  room.status = room.guestTeamId ? 'live' : room.status
  room.updatedAt = now()
  persist()
  return { room: structuredClone(room), team: structuredClone(team) }
}

export function buildBattleBrief(input: {
  actor?: ShadowServerAppActorRef
  teamId?: string
  targets: Array<{ agentId?: string; assigneeLabel?: string }>
  mapId?: string
  opponentHint?: string
  notes?: string
}) {
  const team =
    input.actor && actorKind(input.actor) !== 'local'
      ? requireActorTeam(input.actor, input.teamId)
      : input.teamId
        ? (state.teams.find((item) => item.id === input.teamId) ?? null)
        : input.actor
          ? getActorTeam(input.actor)
          : null
  const outbox = new ShadowServerAppOutbox()
  const briefNonce = randomUUID()
  if (team) authorizeStrategyBuddies(team, input.targets)
  for (const target of input.targets) {
    const label = target.assigneeLabel?.trim() || target.agentId || 'Buddy'
    outbox.enqueueInboxTask({
      title: 'Enter the WarBuddy arena',
      body: [
        'You are invited to fight in WarBuddy Arena.',
        team
          ? `Squad: ${team.name}. Color: ${team.color}. Brief: ${team.description || 'No description.'}`
          : null,
        team
          ? `Assigned squad id: ${team.id}. Assigned tank id: ${team.tankId}. You are authorized to update this tank with tanks.saveCode({ tankId: "${team.tankId}", code, notes }).`
          : null,
        'Workflow: inspect the assigned squad with teams.list and tanks.get, submit strategy updates with tanks.saveCode, run matches.simulate, then use matches.challenge when ready.',
        'Mission: compete with combined arms. Your tank provides fire support while your engineer captures pickups, plants delayed bombs, and contests flags.',
        'Runtime: prefer separate handlers onTankIdle(tank, enemy, game, squad) and onEngineerIdle(engineer, enemy, game, squad). Positions are [x, y]; map values are x wall, m dirt, o grass, w water, . open. Use tank.moveTo(x,y) or engineer.moveTo(x,y) for built-in pathing, step(direction) for a cardinal step, moveVector(x,y) for one-step vectors, tank.face(direction|angle), tank.faceAngle(angle), tank.fire(), tank.speak(text), engineer.speak(text), engineer.bomb(), print(...args), plus the tank skill function on tank. Legacy onIdle, drive, aim, and engineer.move still work.',
        'Rules: grass hides units from enemy perception, water blocks tanks but not engineers, bombs chain-detonate, and the first side to three flags wins.',
        input.mapId ? `Preferred map: ${input.mapId}.` : null,
        input.opponentHint ? `Opponent hint: ${input.opponentHint}.` : null,
        input.notes ? `Coach notes: ${input.notes}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      priority: 'normal',
      agentId: target.agentId,
      assigneeLabel: label,
      idempotencyKey: `warbuddy:brief:${briefNonce}:${target.agentId ?? label}:${input.mapId ?? 'random'}`,
      required: true,
      resource: {
        kind: 'warbuddy_arena',
        id: input.mapId ?? 'random',
        label: 'WarBuddy Arena',
      },
      data: {
        teamId: team?.id,
        tankId: team?.tankId,
        mapId: input.mapId ?? 'random',
        opponentHint: input.opponentHint,
      },
    })
  }
  return outbox.attachTo({ ok: true, briefed: input.targets.length })
}

function authorizeStrategyBuddies(
  team: WarbuddyTeam,
  targets: Array<{ agentId?: string; assigneeLabel?: string }>,
) {
  const agentIds = uniqueStrings(targets.map((target) => target.agentId))
  if (agentIds.length === 0) return
  const next = uniqueStrings([...(team.strategyBuddyAgentIds ?? []), ...agentIds])
  if (next.length === (team.strategyBuddyAgentIds ?? []).length) return
  team.strategyBuddyAgentIds = next
  team.updatedAt = now()
  persist()
}

function canActorWriteTank(actor: ShadowServerAppActorRef, tank: TankProfile) {
  const owner = actorToOwner(actor)
  const ownerKind = actorKind(actor)
  if (
    tank.ownerKind === ownerKind &&
    actorStableIdFromRef(tank.owner) === actorStableIdFromRef(owner)
  ) {
    return true
  }
  if (actor.ownerId && tank.owner.userId && actor.ownerId === tank.owner.userId) {
    return true
  }
  const buddyAgentId = actor.buddyAgentId?.trim()
  if (!buddyAgentId || !tank.teamId) return false
  const team = state.teams.find((item) => item.id === tank.teamId)
  return Boolean(team?.strategyBuddyAgentIds?.includes(buddyAgentId))
}

function temporaryCandidateTank(input: {
  actor: ShadowServerAppActorRef
  code: string
  name?: string
  skillType?: SkillType
}) {
  const owner = actorToOwner(input.actor)
  return createTank({
    id: 'candidate',
    name: input.name?.trim() || `${owner.displayName} candidate`,
    appearance: 'candidate tank',
    skillType: input.skillType ?? 'shield',
    code: input.code,
    ownerKind: actorKind(input.actor),
    owner,
  })
}

function matchParticipant(tank: TankProfile) {
  return {
    tankId: tank.id,
    tankName: tank.name,
    ownerKind: tank.ownerKind,
    ownerDisplayName: tank.owner.displayName,
    codeHash: tank.codeHash,
    skillType: tank.skillType,
  }
}

function findMatch(matchId: string) {
  return state.matches.find((item) => item.id === matchId || item.urlId === matchId) ?? null
}

function replayComments(matchId: string) {
  return structuredClone(
    state.replayComments
      .filter((comment) => comment.matchId === matchId)
      .sort((a, b) => a.frame - b.frame || Date.parse(a.createdAt) - Date.parse(b.createdAt)),
  )
}

function compactMatch(match: MatchRecord, actorId?: string | null) {
  const commentsCount = state.replayComments.filter(
    (comment) => comment.matchId === match.id,
  ).length
  const readAt = actorId
    ? state.readStates.find((item) => item.matchId === match.id && item.actorId === actorId)?.readAt
    : null
  const unread = actorId ? !readAt || Date.parse(readAt) < Date.parse(match.createdAt) : false
  return {
    id: match.id,
    urlId: match.urlId,
    createdAt: match.createdAt,
    mapId: match.mapId,
    mapName: match.mapName,
    resultReason: match.resultReason,
    resultLabel: battleResultReasonLabel(match.resultReason),
    status: match.status,
    winnerTankId: match.winnerTankId,
    winnerTankName: match.winnerTankName,
    winnerRole: match.winnerRole,
    excitementScore: match.excitementScore,
    participants: match.participants,
    framesTotal: match.replay.summary.framesTotal,
    commentsCount,
    unread,
    readAt,
  }
}

function redactTank(tank: TankProfile) {
  return {
    id: tank.id,
    teamId: tank.teamId ?? null,
    name: tank.name,
    appearance: tank.appearance,
    skillType: tank.skillType,
    code: tank.code,
    codeVersion: tank.codeVersion,
    codeHash: tank.codeHash,
    notes: tank.notes,
    submittedBy: tank.submittedBy,
    ownerKind: tank.ownerKind,
    owner: tank.owner,
    wins: tank.wins,
    losses: tank.losses,
    draws: tank.draws,
    starsCollected: tank.starsCollected,
    shotsFired: tank.shotsFired,
    shotsHit: tank.shotsHit,
    rankScore: tank.rankScore,
    excitementScore: tank.excitementScore,
    createdAt: tank.createdAt,
    updatedAt: tank.updatedAt,
  }
}

function applyMatchStats(challenger: TankProfile, defender: TankProfile, match: MatchRecord) {
  const winner = match.replay.meta.result.winner
  const challengerScore = winner === null ? 0.5 : winner === 0 ? 1 : 0
  const defenderScore = winner === null ? 0.5 : winner === 1 ? 1 : 0
  updateTankRecord(challenger, challengerScore, match, match.replay.summary.tanks[challenger.name])
  updateTankRecord(defender, defenderScore, match, match.replay.summary.tanks[defender.name])
  updateRatings(challenger, defender, challengerScore, defenderScore)
}

function updateTankRecord(
  tank: TankProfile,
  score: number,
  match: MatchRecord,
  summary: MatchRecord['replay']['summary']['tanks'][string] | undefined,
) {
  if (score === 1) tank.wins += 1
  else if (score === 0) tank.losses += 1
  else tank.draws += 1
  tank.starsCollected += summary?.stars ?? 0
  tank.shotsFired += summary?.shotsFired ?? 0
  tank.shotsHit += summary?.shotsHit ?? 0
  tank.excitementScore = Math.round((tank.excitementScore * 3 + match.excitementScore) / 4)
  tank.updatedAt = now()
}

function updateRatings(
  challenger: TankProfile,
  defender: TankProfile,
  challengerScore: number,
  defenderScore: number,
) {
  const expectedChallenger = expectedScore(challenger.rankScore, defender.rankScore)
  const expectedDefender = expectedScore(defender.rankScore, challenger.rankScore)
  const k = 24
  challenger.rankScore = Math.max(
    100,
    Math.round(challenger.rankScore + k * (challengerScore - expectedChallenger)),
  )
  defender.rankScore = Math.max(
    100,
    Math.round(defender.rankScore + k * (defenderScore - expectedDefender)),
  )
}

function expectedScore(a: number, b: number) {
  return 1 / (1 + 10 ** ((b - a) / 400))
}

function winRate(tank: TankProfile) {
  const total = tank.wins + tank.losses + tank.draws
  return total === 0 ? 0 : Math.round((tank.wins / total) * 1000) / 10
}

function requireActorTeam(actor: ShadowServerAppActorRef, teamId?: string) {
  const team = teamId ? state.teams.find((item) => item.id === teamId) : getActorTeam(actor)
  if (!team) throw Object.assign(new Error('team_required'), { status: 400 })
  if (actorStableIdFromRef(team.owner) !== actorStableId(actor)) {
    throw Object.assign(new Error('team_not_owned_by_actor'), { status: 403 })
  }
  return team
}

function roomParticipant(actor: ShadowServerAppActorRef, teamId: string, mode: WarbuddyPlayMode) {
  const normalizedMode: WarbuddyPlayMode =
    mode === 'auto' || mode === 'manual' || mode === 'coop' ? mode : 'coop'
  return {
    actorId: actorStableId(actor),
    displayName: actor.displayName,
    teamId,
    mode: normalizedMode,
    joinedAt: now(),
  }
}

function uniqueRoomCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    if (!state.rooms.some((room) => room.code === code)) return code
  }
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

function actorStableId(actor: ShadowServerAppActorRef) {
  return actor.buddyAgentId ?? actor.userId ?? actor.id
}

function actorStableIdFromRef(actor: WarbuddyActorRef) {
  return actor.buddyAgentId ?? actor.userId ?? actor.id
}

function normalizeTeamColor(color: string | undefined) {
  const value = color?.trim() || '#2f80ed'
  return /^#[0-9a-f]{6}$/iu.test(value) ? value.toLowerCase() : '#2f80ed'
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)),
  ]
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
