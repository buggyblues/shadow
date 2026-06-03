import vm from 'node:vm'
import { BATTLE_MAPS } from './battle-maps.js'
import { clampInt, clampNumber, createRng, normalizeSeed } from './battle-utils.js'
import {
  createComputerDuel,
  type DuelAction,
  fallbackDuelActions,
  type HumanDuelState,
  resolveDuelScriptActions,
  sanitizeDuelActions,
  stepHumanDuel,
  withHumanDuelRandom,
} from './client/human-duel.js'
import { DEFAULT_TANK_STRATEGY_CODE, DEFAULT_WARBUDDY_RULES, type WarbuddyRules } from './rules.js'
import type {
  BattleEvent,
  BattleFrame,
  BattleReplay,
  BattleResultReason,
  BattleSummary,
  BattleTankProfile,
  RunBattleInput,
  RuntimeEngineerState,
  RuntimeTankState,
  Tile,
  UnitDeathState,
} from './types.js'

type RealtimeProfile = BattleTankProfile

interface DecisionResult {
  actions: DuelAction[]
  events: BattleEvent[]
  runtimeMs: number
}

export function runRealtimeBattle(input: RunBattleInput): BattleReplay {
  const rules = input.rules ?? DEFAULT_WARBUDDY_RULES
  const seed = normalizeSeed(input.seed)
  const rng = createRng(seed)
  const fps = clampInt(input.fps ?? rules.timing.fps, rules.timing.minFps, rules.timing.maxFps)
  const durationSeconds = clampNumber(
    input.durationSeconds ?? rules.timing.durationSeconds,
    rules.timing.minDurationSeconds,
    rules.timing.maxDurationSeconds,
  )
  const maxFrames =
    input.maxFrames === undefined
      ? Math.max(1, Math.round(durationSeconds * fps))
      : clampInt(input.maxFrames, 1, Math.round(rules.timing.maxDurationSeconds * fps))
  const map = chooseMap(input.mapId, rng)
  const challenger = input.challenger
  const defender = input.defender
  const brains = [
    new DuelScriptBrain(challenger, rules, 0, rng),
    new DuelScriptBrain(defender, rules, 1, rng),
  ] as const
  const runtimeMs: [number, number] = [0, 0]
  const compileEvents = brains.flatMap((brain) => brain.compileEvent())
  const frames: BattleFrame[] = []
  const events: Array<BattleEvent & { frame: number }> = []

  let duel = createComputerDuel({
    mapId: map.id,
    mapName: map.name,
    mapRaw: map.raw,
    challenger,
    defender,
    maxFrames,
  })
  frames.push({ frame: duel.frame, events: compileEvents, state: duel.state })
  events.push(...compileEvents.map((event) => ({ ...event, frame: duel.frame })))

  withHumanDuelRandom(rng, () => {
    while (duel.status === 'running' && duel.frame < maxFrames) {
      const before = duel
      const decisions = [0, 1].map((index) =>
        decideActionsForSide(duel, index as 0 | 1, brains[index as 0 | 1]),
      ) as [DecisionResult, DecisionResult]
      runtimeMs[0] += decisions[0].runtimeMs
      runtimeMs[1] += decisions[1].runtimeMs
      duel = stepHumanDuel(duel, decisions[0].actions, decisions[1].actions)
      const frameEvents = [
        ...decisions[0].events,
        ...decisions[1].events,
        ...deriveFrameEvents(before, duel),
      ]
      if (duel.status === 'settled') frameEvents.push(endEvent(duel))
      frames.push({ frame: duel.frame, events: frameEvents, state: duel.state })
      events.push(...frameEvents.map((event) => ({ ...event, frame: duel.frame })))
    }
  })

  const result = replayResult(duel)
  const summary = summarizeRealtimeReplay({
    frames,
    events,
    result,
    players: [challenger, defender],
    runtimeMs,
  })
  const excitementScore = calculateRealtimeExcitement(frames, events, summary)

  return {
    meta: {
      mapId: map.id,
      mapName: map.name,
      matchSeed: seed,
      fps,
      durationSeconds: maxFrames / fps,
      maxFrames,
      coordinateSpace: 'world',
      players: [challenger, defender].map((tank, index) => ({
        tankId: tank.id,
        name: tank.name,
        skillType: tank.skillType,
        codeHash: tank.codeHash,
        runTime: Math.round(runtimeMs[index as 0 | 1]),
      })),
      result,
      excitementScore,
    },
    frames,
    events,
    summary,
  }
}

function decideActionsForSide(
  state: HumanDuelState,
  index: 0 | 1,
  brain: DuelScriptBrain,
): DecisionResult {
  if (!brain.hasRunnableCode) {
    return { actions: fallbackDuelActions(state, index), events: [], runtimeMs: 0 }
  }
  const result = brain.run(state)
  if (!result.ok) {
    return {
      actions: fallbackDuelActions(state, index),
      events: [
        {
          type: 'runtime',
          action: 'script_error',
          by: index,
          tank: state.tanks[index].name,
          reason: result.error,
        },
      ],
      runtimeMs: result.runtimeMs,
    }
  }
  return {
    actions: resolveDuelScriptActions(state, result.actions, index),
    events: [],
    runtimeMs: result.runtimeMs,
  }
}

function createScriptMath(rng: () => number) {
  const scriptMath = Object.create(Math) as Math
  Object.defineProperty(scriptMath, 'random', {
    value: rng,
    writable: false,
    enumerable: false,
    configurable: false,
  })
  return scriptMath
}

class DuelScriptBrain {
  private readonly timeoutMs: number
  private readonly context: vm.Context
  private readonly callScript = new vm.Script(
    `(() => {
      const hasUnitHandlers =
        typeof onTankIdle === "function" || typeof onEngineerIdle === "function";
      if (hasUnitHandlers) {
        if (typeof onTankIdle === "function") onTankIdle(__me.tank, __enemy, __game, __me);
        if (typeof onEngineerIdle === "function" && __me.engineer) {
          onEngineerIdle(__me.engineer, __enemy, __game, __me);
        }
      } else if (typeof onIdle === "function") {
        onIdle(__me, __enemy, __game);
      }
    })();`,
  )
  readonly compileError: string | null
  readonly hasHandlers: boolean

  constructor(
    private readonly profile: RealtimeProfile,
    rules: WarbuddyRules,
    private readonly index: 0 | 1,
    private readonly rng: () => number,
  ) {
    this.timeoutMs = rules.script.timeoutMs
    this.context = vm.createContext({
      Math: createScriptMath(this.rng),
      Number,
      String,
      Boolean,
      Array,
      Object,
      JSON,
      Date: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      clearTimeout: undefined,
      clearInterval: undefined,
    })

    const submittedCode =
      Buffer.byteLength(profile.code, 'utf8') > rules.script.maxBytes ? '' : profile.code.trim()
    const raw = submittedCode || DEFAULT_TANK_STRATEGY_CODE
    if (!raw) {
      this.compileError = null
      this.hasHandlers = false
      return
    }
    if (rules.script.blockedTokens.test(raw)) {
      this.compileError = 'script_uses_blocked_global'
      this.hasHandlers = false
      return
    }

    try {
      new vm.Script(
        `"use strict";\n${raw}\n;(() => {
          if (typeof onIdle !== "undefined" && typeof onIdle !== "function") {
            throw new Error("invalid_onIdle");
          }
          if (typeof onTankIdle !== "undefined" && typeof onTankIdle !== "function") {
            throw new Error("invalid_onTankIdle");
          }
          if (typeof onEngineerIdle !== "undefined" && typeof onEngineerIdle !== "function") {
            throw new Error("invalid_onEngineerIdle");
          }
        })();`,
      ).runInContext(this.context, { timeout: this.timeoutMs })
      this.hasHandlers = Boolean(
        new vm.Script(
          `typeof onIdle === "function" ||
            typeof onTankIdle === "function" ||
            typeof onEngineerIdle === "function"`,
        ).runInContext(this.context, { timeout: this.timeoutMs }),
      )
      this.compileError = null
    } catch (error) {
      this.compileError = error instanceof Error ? error.message : String(error)
      this.hasHandlers = false
    }
  }

  get hasRunnableCode() {
    return this.compileError === null && this.hasHandlers
  }

  compileEvent(): BattleEvent[] {
    if (!this.compileError) return []
    return [
      {
        type: 'runtime',
        action: 'compile_error',
        by: this.index,
        tank: this.profile.name,
        reason: this.compileError,
      },
    ]
  }

  run(state: HumanDuelState) {
    const started = performance.now()
    const actions: DuelAction[] = []
    const snapshot = createScriptSnapshot(state, this.index)
    ;(this.context as Record<string, unknown>).__me = createMeApi(snapshot, actions)
    ;(this.context as Record<string, unknown>).__enemy = snapshot.enemy
    ;(this.context as Record<string, unknown>).__game = snapshot.game
    try {
      this.callScript.runInContext(this.context, { timeout: this.timeoutMs })
      return {
        ok: true as const,
        actions: sanitizeDuelActions(actions),
        runtimeMs: performance.now() - started,
      }
    } catch (error) {
      return {
        ok: false as const,
        actions: [],
        runtimeMs: performance.now() - started,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

function createScriptSnapshot(state: HumanDuelState, index: 0 | 1) {
  const enemyIndex = index === 0 ? 1 : 0
  const tank = state.tanks[index]
  const enemyTank = state.tanks[enemyIndex]
  const engineer = state.engineers[index]
  const enemyEngineer = state.engineers[enemyIndex]
  const publicTank = state.state.tanks[index]!
  const publicEnemyTank = state.state.tanks[enemyIndex]!
  const publicEngineer = state.state.engineers[index]!
  const publicEnemyEngineer = state.state.engineers[enemyIndex]!
  return {
    me: {
      tank: publicTank,
      engineer: publicEngineer,
      stars: tank.stars,
      bullet: state.state.bullets.find((bullet) => bullet.owner === index) ?? null,
      skill: {
        type: tank.skillType,
        cooldownFrames: DEFAULT_WARBUDDY_RULES.skills[tank.skillType].cooldownFrames,
        remainingCooldownFrames: tank.cooldown,
        activeRemainingFrames: Math.max(
          tank.shieldRemaining,
          tank.freezeRemaining,
          tank.stunRemaining,
          tank.overloadRemaining,
          tank.cloakRemaining,
          tank.poisonRemaining,
          tank.boostRemaining,
        ),
      },
      effects: {
        self: activeSelfEffect(tank),
        debuff: activeDebuff(tank),
      },
      status: publicTank.status,
    },
    enemy: {
      tank: enemyTank.crashed ? null : publicEnemyTank,
      engineer: enemyEngineer.alive ? publicEnemyEngineer : null,
      bullet: state.state.bullets.find((bullet) => bullet.owner === enemyIndex) ?? null,
      skill: {
        type: enemyTank.skillType,
        cooldownFrames: DEFAULT_WARBUDDY_RULES.skills[enemyTank.skillType].cooldownFrames,
        remainingCooldownFrames: enemyTank.cooldown,
        activeRemainingFrames: Math.max(
          enemyTank.shieldRemaining,
          enemyTank.freezeRemaining,
          enemyTank.stunRemaining,
          enemyTank.overloadRemaining,
          enemyTank.cloakRemaining,
          enemyTank.poisonRemaining,
          enemyTank.boostRemaining,
        ),
      },
      effects: {
        self: activeSelfEffect(enemyTank),
        debuff: activeDebuff(enemyTank),
      },
      status: publicEnemyTank.status,
    },
    game: {
      map: state.map.map((column) => [...column] as Tile[]),
      star: state.star ? ([...state.star] as [number, number]) : null,
      flag: state.flag ? ([...state.flag] as [number, number]) : null,
      flagScores: [...state.flagScores] as [number, number],
      frames: state.frame,
    },
  }
}

function createMeApi(snapshot: ReturnType<typeof createScriptSnapshot>, actions: DuelAction[]) {
  const queue = (action: DuelAction) => {
    if (actions.length < 4) actions.push(action)
  }
  const tank = {
    ...snapshot.me.tank,
    drive(x?: unknown, y?: unknown) {
      if (arguments.length === 0) {
        tank.step(tank.direction)
      } else if (isDirection(x)) {
        tank.step(x)
      } else if (finiteVector(x, y)) {
        queue({
          type: 'unit.drive',
          unit: { kind: 'tank' },
          x: Number(x),
          y: Number(y),
          target: coordinateTarget(x, y),
        })
      }
    },
    moveTo(x: unknown, y: unknown) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false
      queue({
        type: 'unit.drive',
        unit: { kind: 'tank' },
        x: Number(x),
        y: Number(y),
        target: true,
      })
      return true
    },
    step(direction?: unknown) {
      const requested = direction || tank.direction
      if (!isDirection(requested)) return false
      queue({ type: 'unit.move', unit: { kind: 'tank' }, direction: requested })
      return true
    },
    moveVector(x: unknown, y: unknown) {
      if (!finiteVector(x, y)) return false
      queue({ type: 'unit.drive', unit: { kind: 'tank' }, x: Number(x), y: Number(y) })
      return true
    },
    face(angle: unknown) {
      if (isDirection(angle))
        queue({ type: 'unit.aim', unit: { kind: 'tank' }, angle: angleToDegrees(angle) })
      else if (Number.isFinite(angle))
        queue({ type: 'unit.aim', unit: { kind: 'tank' }, angle: Number(angle) })
    },
    faceAngle(angle: unknown) {
      if (Number.isFinite(angle))
        queue({ type: 'unit.aim', unit: { kind: 'tank' }, angle: Number(angle) })
    },
    aim(angle: unknown) {
      tank.face(angle)
    },
    fire() {
      if (snapshot.me.bullet || snapshot.me.status.fireLocked) return
      queue({ type: 'unit.fire', unit: { kind: 'tank' } })
    },
    speak(text: unknown) {
      if (typeof text === 'string' && text.trim())
        queue({ type: 'unit.speak', unit: { kind: 'tank' }, text })
    },
  }
  let engineer: (typeof snapshot.me.engineer & Record<string, any>) | null = null
  if (snapshot.me.engineer) {
    engineer = {
      ...snapshot.me.engineer,
      move(x?: unknown, y?: unknown) {
        if (!engineer) return
        if (arguments.length === 0) engineer.step(engineer.direction)
        else if (isDirection(x)) engineer.step(x)
        else if (finiteVector(x, y)) {
          queue({
            type: 'unit.drive',
            unit: { kind: 'engineer' },
            x: Number(x),
            y: Number(y),
            target: coordinateTarget(x, y),
          })
        }
      },
      moveTo(x: unknown, y: unknown) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false
        queue({
          type: 'unit.drive',
          unit: { kind: 'engineer' },
          x: Number(x),
          y: Number(y),
          target: true,
        })
        return true
      },
      step(direction?: unknown) {
        if (!engineer) return false
        const requested = direction || engineer.direction
        if (!isDirection(requested)) return false
        queue({ type: 'unit.move', unit: { kind: 'engineer' }, direction: requested })
        return true
      },
      moveVector(x: unknown, y: unknown) {
        if (!finiteVector(x, y)) return false
        queue({
          type: 'unit.drive',
          unit: { kind: 'engineer' },
          x: Number(x),
          y: Number(y),
        })
        return true
      },
      bomb() {
        queue({ type: 'unit.ability', unit: { kind: 'engineer' }, ability: 'bomb' })
      },
      speak(text: unknown) {
        if (typeof text === 'string' && text.trim())
          queue({ type: 'unit.speak', unit: { kind: 'engineer' }, text })
      },
    }
  }
  const castSkill = (x?: unknown, y?: unknown) => {
    if (snapshot.me.skill.type === 'teleport') {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        queue({
          type: 'unit.ability',
          unit: { kind: 'tank' },
          ability: 'teleport',
          x: Number(x),
          y: Number(y),
        })
      }
      return
    }
    queue({ type: 'unit.ability', unit: { kind: 'tank' }, ability: 'primary' })
  }
  return {
    tank: Object.assign(tank, {
      [snapshot.me.skill.type]: castSkill,
      skill: castSkill,
    }),
    engineer,
    stars: snapshot.me.stars,
    bullet: snapshot.me.bullet,
    skill: snapshot.me.skill,
    effects: snapshot.me.effects,
    status: snapshot.me.status,
  }
}

function deriveFrameEvents(before: HumanDuelState, after: HumanDuelState): BattleEvent[] {
  const events: BattleEvent[] = []
  for (const [index, tank] of after.state.tanks.entries()) {
    const previous = before.state.tanks[index]
    if (previous && distance(previous.position, tank.position) > 0.001) {
      events.push({
        type: 'tank',
        action: 'go',
        by: index,
        tank: tank.name,
        objectId: tank.id,
        position: [...tank.position],
        direction: tank.direction,
      })
    }
  }
  for (const [index, engineer] of after.state.engineers.entries()) {
    const previous = before.state.engineers[index]
    if (previous && distance(previous.position, engineer.position) > 0.001) {
      events.push({
        type: 'tank',
        action: 'engineer_go',
        by: index,
        tank: engineer.name,
        objectId: engineer.id,
        position: [...engineer.position],
        direction: engineer.direction,
      })
    }
  }
  for (const bullet of after.state.bullets) {
    if (!before.state.bullets.some((item) => item.id === bullet.id)) {
      events.push({
        type: 'bullet',
        action: 'fire',
        by: bullet.owner,
        tank: after.tanks[bullet.owner]?.name,
        objectId: bullet.id,
        position: [...bullet.position],
        direction: bullet.direction,
      })
    }
  }
  for (const [index, tank] of after.state.tanks.entries()) {
    const previous = before.state.tanks[index]
    if (!previous?.crashed && tank.crashed) {
      if (tank.death?.cause === 'bullet') {
        events.push({
          type: 'bullet',
          action: 'hit',
          by: tank.death.by ?? undefined,
          tank: tank.name,
          objectId: tank.death.detail,
          position: [...tank.position],
        })
      }
      events.push({
        type: 'tank',
        action: 'crashed',
        by: index,
        tank: tank.name,
        objectId: tank.id,
        position: [...tank.position],
        reason: tank.death?.cause,
      })
    }
  }
  for (const [index, engineer] of after.state.engineers.entries()) {
    const previous = before.state.engineers[index]
    if (previous?.alive && !engineer.alive) {
      if (engineer.death?.cause === 'bullet') {
        events.push({
          type: 'bullet',
          action: 'hit',
          by: engineer.death.by ?? undefined,
          tank: engineer.name,
          objectId: engineer.death.detail,
          position: [...engineer.position],
        })
      }
      events.push({
        type: 'tank',
        action: 'engineer_down',
        by: engineer.death?.by ?? undefined,
        tank: engineer.name,
        objectId: engineer.id,
        position: [...engineer.position],
        reason: engineer.death?.cause,
      })
    }
  }
  if (after.state.bulletClashes > before.state.bulletClashes) {
    events.push({
      type: 'bullet',
      action: 'clash',
      details: { count: after.state.bulletClashes - before.state.bulletClashes },
    })
  }
  if (!before.state.star && after.state.star) {
    events.push({ type: 'star', action: 'created', position: [...after.state.star] })
  }
  if (!before.state.flag && after.state.flag) {
    events.push({ type: 'flag', action: 'created', position: [...after.state.flag] })
  }
  after.state.flagScores.forEach((score, index) => {
    if (score !== before.state.flagScores[index]) {
      events.push({
        type: 'flag',
        action: 'captured',
        by: index,
        position: after.state.tanks[index]?.position
          ? [...after.state.tanks[index]!.position]
          : undefined,
      })
    }
  })
  return events
}

function summarizeRealtimeReplay(input: {
  frames: BattleFrame[]
  events: Array<BattleEvent & { frame: number }>
  result: BattleReplay['meta']['result']
  players: [RealtimeProfile, RealtimeProfile]
  runtimeMs: [number, number]
}): BattleSummary {
  const final = input.frames.at(-1)!.state
  const tanks: BattleSummary['tanks'] = {}
  input.players.forEach((player, index) => {
    const tank = final.tanks[index]!
    const engineer = final.engineers[index]!
    const moves = countMotionFrames(input.frames, index)
    const turns = countHeadingFrames(input.frames, index)
    const shotsFired = input.events.filter(
      (event) => event.type === 'bullet' && event.action === 'fire' && event.by === index,
    ).length
    const deaths: Record<string, UnitDeathState | null> = {
      tank: tank.death ?? null,
      engineer: engineer.death ?? null,
    }
    tanks[player.name] = {
      shotsFired,
      shotsHit: countHits(final, index),
      shotsWall: 0,
      moves,
      turns,
      stars: tank.stars,
      skillUsed: countSkillUses(input.frames, index),
      crashes: tank.crashed ? 1 : 0,
      deaths,
      runtimeMs: Math.round(input.runtimeMs[index as 0 | 1]),
      diagnosis: diagnosisFor(tank, moves, shotsFired),
    }
  })
  return {
    framesTotal: input.frames.length,
    result: {
      winner:
        input.result.winner === null ? null : (input.players[input.result.winner]?.name ?? null),
      reason: input.result.reason,
    },
    tanks,
  }
}

function replayResult(state: HumanDuelState): BattleReplay['meta']['result'] {
  return {
    type: 'game',
    action: 'end',
    reason: state.result.reason as BattleResultReason,
    winner: state.result.winner === 'human' ? 0 : state.result.winner === 'agent' ? 1 : null,
  }
}

function endEvent(state: HumanDuelState): BattleEvent {
  const result = replayResult(state)
  return {
    type: 'game',
    action: 'end',
    reason: result.reason,
    winner: result.winner,
  }
}

function chooseMap(mapId: string | undefined, rng: () => number) {
  if (mapId) {
    const map = BATTLE_MAPS.find((item) => item.id === mapId)
    if (map) return map
  }
  return BATTLE_MAPS[Math.floor(rng() * BATTLE_MAPS.length)] ?? BATTLE_MAPS[0]!
}

function countMotionFrames(frames: BattleFrame[], index: number) {
  let moves = 0
  for (let frame = 1; frame < frames.length; frame += 1) {
    const previous = frames[frame - 1]!.state.tanks[index]?.position
    const current = frames[frame]!.state.tanks[index]?.position
    if (previous && current && distance(previous, current) > 0.001) moves += 1
  }
  return moves
}

function countHeadingFrames(frames: BattleFrame[], index: number) {
  let turns = 0
  for (let frame = 1; frame < frames.length; frame += 1) {
    const previous = frames[frame - 1]!.state.tanks[index]?.headingDegrees
    const current = frames[frame]!.state.tanks[index]?.headingDegrees
    if (
      previous !== undefined &&
      current !== undefined &&
      Math.abs(normalizeAngle(previous) - normalizeAngle(current)) > 0.5
    )
      turns += 1
  }
  return turns
}

function countHits(
  final: {
    tanks: RuntimeTankState[]
    engineers: RuntimeEngineerState[]
  },
  index: number,
) {
  return [...final.tanks, ...final.engineers].filter((unit) => unit.death?.by === index).length
}

function countSkillUses(frames: BattleFrame[], index: number) {
  let count = 0
  for (let frame = 1; frame < frames.length; frame += 1) {
    const previous = frames[frame - 1]!.state.tanks[index]?.status
    const current = frames[frame]!.state.tanks[index]?.status
    if (!previous || !current) continue
    if (
      (!previous.shielded && current.shielded) ||
      (!previous.boosted && current.boosted) ||
      (!previous.overloaded && current.overloaded) ||
      (!previous.cloaked && current.cloaked)
    )
      count += 1
  }
  return count
}

function calculateRealtimeExcitement(
  frames: BattleFrame[],
  events: Array<BattleEvent & { frame: number }>,
  summary: BattleSummary,
) {
  const totalMoves = Object.values(summary.tanks).reduce((sum, tank) => sum + tank.moves, 0)
  const shots = events.filter((event) => event.type === 'bullet' && event.action === 'fire').length
  const flags = events.filter(
    (event) => event.type === 'flag' && event.action === 'captured',
  ).length
  const defeats = events.filter(
    (event) => event.action === 'crashed' || event.action === 'engineer_down',
  ).length
  const clashes = frames.at(-1)?.state.bulletClashes ?? 0
  return Math.round(totalMoves / 16 + shots * 4 + flags * 12 + defeats * 10 + clashes * 3)
}

function diagnosisFor(tank: RuntimeTankState, moves: number, shotsFired: number) {
  if (tank.crashed) return `Destroyed by ${tank.death?.cause ?? 'combat'}.`
  if (moves === 0 && shotsFired === 0) return 'Held position without firing.'
  if (shotsFired === 0) return 'Advanced without firing.'
  return 'Completed realtime battle plan.'
}

function activeSelfEffect(tank: HumanDuelState['tanks'][number]) {
  if (tank.shieldRemaining > 0) return 'shield'
  if (tank.boostRemaining > 0) return 'boost'
  if (tank.overloadRemaining > 0) return 'overload'
  if (tank.cloakRemaining > 0) return 'cloak'
  return null
}

function activeDebuff(tank: HumanDuelState['tanks'][number]) {
  if (tank.freezeRemaining > 0) return 'freeze'
  if (tank.stunRemaining > 0) return 'stun'
  if (tank.poisonRemaining > 0) return 'poison'
  return null
}

function finiteVector(x: unknown, y: unknown) {
  return Number.isFinite(x) && Number.isFinite(y) && (x !== 0 || y !== 0)
}

function coordinateTarget(x: unknown, y: unknown) {
  return (
    Number.isFinite(x) && Number.isFinite(y) && (Math.abs(Number(x)) > 1 || Math.abs(Number(y)) > 1)
  )
}

function isDirection(value: unknown): value is 'up' | 'right' | 'down' | 'left' {
  return value === 'up' || value === 'right' || value === 'down' || value === 'left'
}

function angleToDegrees(direction: 'up' | 'right' | 'down' | 'left') {
  switch (direction) {
    case 'up':
      return -90
    case 'down':
      return 90
    case 'left':
      return 180
    case 'right':
      return 0
  }
}

function normalizeAngle(angle: number) {
  let value = angle % 360
  if (value < -180) value += 360
  if (value > 180) value -= 360
  return value
}

function distance(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}
