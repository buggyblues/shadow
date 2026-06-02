export type PetAttribute = 'tide' | 'spark' | 'snack' | 'focus'
export type PetDayPhase = 'morning' | 'day' | 'evening' | 'night'
export type PetEmotionState =
  | 'excited'
  | 'content'
  | 'calm'
  | 'lonely'
  | 'hungry'
  | 'sleepy'
  | 'sick'

export type PetStats = {
  mood: number
  hunger: number
  charm: number
  energy: number
  health: number
  loyalty: number
  xp: number
  level: number
  attribute: PetAttribute
  personality: 'INFP' | 'ENFP' | 'ISFJ' | 'ENTP'
}

export type InventoryItem = {
  id: 'shrimpSnack' | 'moonShell' | 'coralTea' | 'starMap'
  count: number
}

export type PetAction = 'feed' | 'pet' | 'play' | 'rest' | 'explore' | 'tea'
export type PetLastAction = PetAction | 'idle' | 'level-up'
export type PetAnimationKey =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review'

export type PetQuestId = 'firstPat' | 'snackRoutine' | 'harborScout' | 'steadyCare'
export type PetRandomEventId =
  | 'morningStretch'
  | 'windowSunbeam'
  | 'curiousPing'
  | 'rainyNap'
  | 'midnightHungry'
  | 'looseShell'
export type PetAchievementId =
  | 'firstFriend'
  | 'snackKeeper'
  | 'harborScout'
  | 'steadyCaptain'
  | 'levelTwo'

export type PetQuest = {
  id: PetQuestId
  action: PetAction
  progress: number
  goal: number
  completed: boolean
}

export type PetRandomEvent = {
  id: PetRandomEventId
  date: string
  phase: PetDayPhase
  action: PetAction
  resolved: boolean
  createdAt: number
}

export type PetEmotion = {
  state: PetEmotionState
  valence: number
  arousal: number
  needScore: number
  phase: PetDayPhase
}

export type PetGameState = {
  shells: number
  streakDays: number
  lastCareDate: string
  lastEventDate: string
  todayEvent: PetRandomEvent | null
  eventHistory: PetRandomEventId[]
  dailyActions: Partial<Record<PetAction, { date: string; count: number }>>
  quests: PetQuest[]
  achievements: PetAchievementId[]
}

export type PetState = {
  stats: PetStats
  inventory: InventoryItem[]
  game: PetGameState
  lastTickAt: number
  lastActionAt: number
  lastAction: PetLastAction
}

const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS
const MAX_TICK_HOURS = 72

const clamp = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
const whole = (value: number) => Math.round(clamp(value))

export const PET_ANIMATION_FRAMES: Record<PetAnimationKey, number> = {
  idle: 6,
  'running-right': 8,
  'running-left': 8,
  waving: 4,
  jumping: 5,
  failed: 8,
  waiting: 6,
  running: 6,
  review: 6,
}

const ACTIONS: PetAction[] = ['feed', 'pet', 'play', 'rest', 'explore', 'tea']
const LAST_ACTIONS: PetLastAction[] = [...ACTIONS, 'idle', 'level-up']

const QUESTS: PetQuest[] = [
  { id: 'firstPat', action: 'pet', progress: 0, goal: 1, completed: false },
  { id: 'snackRoutine', action: 'feed', progress: 0, goal: 3, completed: false },
  { id: 'harborScout', action: 'explore', progress: 0, goal: 2, completed: false },
  { id: 'steadyCare', action: 'rest', progress: 0, goal: 2, completed: false },
]

const RANDOM_EVENTS: Record<
  PetRandomEventId,
  { phase: PetDayPhase; action: PetAction; weight: number }
> = {
  morningStretch: { phase: 'morning', action: 'play', weight: 3 },
  windowSunbeam: { phase: 'day', action: 'pet', weight: 3 },
  curiousPing: { phase: 'day', action: 'explore', weight: 2 },
  rainyNap: { phase: 'evening', action: 'rest', weight: 2 },
  midnightHungry: { phase: 'night', action: 'feed', weight: 2 },
  looseShell: { phase: 'evening', action: 'explore', weight: 1 },
}

const QUEST_REWARDS: Record<PetQuestId, { xp: number }> = {
  firstPat: { xp: 14 },
  snackRoutine: { xp: 24 },
  harborScout: { xp: 28 },
  steadyCare: { xp: 18 },
}

export function createDefaultPetState(now = Date.now()): PetState {
  return {
    stats: {
      mood: 72,
      hunger: 66,
      charm: 42,
      energy: 78,
      health: 86,
      loyalty: 58,
      xp: 0,
      level: 1,
      attribute: 'tide',
      personality: 'INFP',
    },
    inventory: [],
    game: createDefaultGameState(),
    lastTickAt: now,
    lastActionAt: 0,
    lastAction: 'idle',
  }
}

export function tickPet(state: PetState, now = Date.now()): PetState {
  const normalized = normalizeState(state)
  const elapsedHours = Math.min(MAX_TICK_HOURS, Math.max(0, now - normalized.lastTickAt) / HOUR_MS)
  const next = structuredClone(normalized) as PetState

  if (elapsedHours > 0) {
    let remaining = elapsedHours
    let cursor = normalized.lastTickAt
    while (remaining > 0) {
      const hours = Math.min(1, remaining)
      applyTimeStep(next.stats, hours, getPetDayPhase(cursor))
      cursor += hours * HOUR_MS
      remaining -= hours
    }
    next.lastTickAt = now
  }

  ensureDailyEvent(next, now)
  return normalizeState(next)
}

export function applyPetAction(state: PetState, action: PetAction, now = Date.now()): PetState {
  const current = tickPet(state, now)
  const next = structuredClone(current) as PetState
  const startingLevel = next.stats.level
  next.lastAction = action
  next.lastActionAt = now
  next.lastTickAt = now
  recordCare(next, now)
  const rewardScale = dailyActionRewardScale(recordDailyAction(next, action, now))

  switch (action) {
    case 'feed': {
      boost(next.stats, {
        hunger: 28,
        mood: 5,
        health: 4,
        loyalty: 1,
        xp: scaledXp(8, rewardScale),
      })
      break
    }
    case 'pet':
      boost(next.stats, { mood: 9, loyalty: 5, charm: 1, xp: scaledXp(4, rewardScale) })
      break
    case 'play':
      boost(next.stats, {
        mood: next.stats.energy > 30 ? 15 : 5,
        charm: 3,
        loyalty: 2,
        xp: scaledXp(next.stats.energy > 30 ? 12 : 4, rewardScale),
        energy: -12,
        hunger: -5,
        health: next.stats.energy > 30 ? 0 : -2,
      })
      break
    case 'rest':
      boost(next.stats, {
        energy: 34,
        health: 7,
        mood: 4,
        hunger: -2,
        xp: scaledXp(4, rewardScale),
      })
      break
    case 'explore':
      if (next.stats.energy < 45 || next.stats.hunger < 38 || getPetDayPhase(now) === 'night') {
        boost(next.stats, { mood: -3, health: -3, energy: -6, hunger: -4, xp: 2 })
      } else {
        boost(next.stats, {
          xp: scaledXp(18, rewardScale),
          charm: 2,
          mood: 6,
          energy: -18,
          hunger: -7,
        })
      }
      break
    case 'tea': {
      boost(next.stats, {
        health: 6,
        energy: 10,
        mood: 3,
        xp: scaledXp(3, rewardScale),
      })
      break
    }
  }

  resolveDailyEvent(next, action, now)
  progressQuests(next, action)
  const normalized = normalizeState(next)
  if (normalized.stats.level > startingLevel) {
    normalized.lastAction = 'level-up'
  }
  return normalized
}

export function settlePetAction(state: PetState): PetState {
  if (state.lastAction === 'idle') return state
  return normalizeState({ ...state, lastAction: 'idle' })
}

export function selectAnimation(state: PetState): PetAnimationKey {
  if (state.lastAction === 'level-up' || state.lastAction === 'play') return 'jumping'
  if (state.lastAction === 'explore') return 'running'
  if (state.lastAction === 'feed' || state.lastAction === 'pet' || state.lastAction === 'tea') {
    return 'waving'
  }
  if (state.lastAction === 'rest') return 'waiting'
  const emotion = selectPetEmotion(state)
  if (emotion.state === 'sick') return 'failed'
  if (emotion.state === 'hungry' || emotion.state === 'sleepy' || emotion.phase === 'night') {
    return 'waiting'
  }
  return 'idle'
}

export function selectRuntimeAnimation(
  states: Array<
    | 'idle'
    | 'running'
    | 'streaming'
    | 'waiting_for_approval'
    | 'blocked'
    | 'completed'
    | 'failed'
    | 'stopped'
    | 'unknown'
  >,
): PetAnimationKey | null {
  if (states.some((state) => state === 'waiting_for_approval' || state === 'blocked')) {
    return 'waiting'
  }
  if (states.some((state) => state === 'failed')) return 'failed'
  if (states.some((state) => state === 'running' || state === 'streaming')) return 'running'
  if (states.some((state) => state === 'completed')) return 'review'
  return null
}

export function recommendedPetActions(state: PetState, now = Date.now()): PetAction[] {
  const normalized = tickPet(state, now)
  const event = normalized.game.todayEvent
  const recommendations = new Set<PetAction>()
  if (event && !event.resolved && event.date === dateKey(now)) {
    recommendations.add(event.action)
  }
  if (normalized.stats.health < 35) {
    recommendations.add('tea')
    recommendations.add('rest')
  }
  if (normalized.stats.hunger < 34) recommendations.add('feed')
  if (normalized.stats.energy < 30) recommendations.add('rest')
  if (normalized.stats.mood < 45) recommendations.add('pet')
  if (normalized.stats.energy > 52 && normalized.stats.hunger > 42 && normalized.stats.mood < 68) {
    recommendations.add('play')
  }
  return ACTIONS.filter((action) => recommendations.has(action)).slice(0, 3)
}

export function levelXpRequirement(level: number) {
  return 120 + (Math.max(1, level) - 1) * 60
}

export function getPetDayPhase(now = Date.now()): PetDayPhase {
  const hour = new Date(now).getHours()
  if (hour >= 5 && hour < 10) return 'morning'
  if (hour >= 10 && hour < 17) return 'day'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

export function selectPetEmotion(state: PetState, now = Date.now()): PetEmotion {
  const stats = normalizeState(state).stats
  const phase = getPetDayPhase(now)
  const needScore =
    stats.hunger * 0.36 + stats.energy * 0.28 + stats.health * 0.22 + stats.loyalty * 0.14
  const valence = clamp(stats.mood * 0.55 + needScore * 0.35)
  const arousal = clamp(stats.energy * 0.45 + stats.mood * 0.25)
  let emotion: PetEmotionState = 'calm'

  if (stats.health < 30) {
    emotion = 'sick'
  } else if (stats.hunger < 28) {
    emotion = 'hungry'
  } else if (stats.energy < 25 || phase === 'night') {
    emotion = 'sleepy'
  } else if (valence >= 66 && arousal >= 58) {
    emotion = 'excited'
  } else if (valence >= 60) {
    emotion = 'content'
  } else if (valence < 45) {
    emotion = arousal >= 50 ? 'excited' : 'lonely'
  }

  return {
    state: emotion,
    valence: whole(valence),
    arousal: whole(arousal),
    needScore: whole(needScore),
    phase,
  }
}

export function serializePetState(state: PetState) {
  return JSON.stringify(state)
}

export function parsePetState(raw: string | null, now = Date.now()): PetState {
  if (!raw) return createDefaultPetState(now)
  try {
    const parsed = JSON.parse(raw) as Partial<PetState>
    if (!parsed.stats || !Array.isArray(parsed.inventory)) return createDefaultPetState(now)
    return normalizeState({
      ...createDefaultPetState(now),
      ...parsed,
      stats: {
        ...createDefaultPetState(now).stats,
        ...parsed.stats,
      },
      inventory: normalizeInventory(parsed.inventory),
      game: normalizeGameState(parsed.game),
      lastTickAt: parsed.lastTickAt || now,
      lastActionAt: parsed.lastActionAt || 0,
      lastAction: isLastAction(parsed.lastAction) ? parsed.lastAction : 'idle',
    })
  } catch {
    return createDefaultPetState(now)
  }
}

function createDefaultGameState(): PetGameState {
  return {
    shells: 0,
    streakDays: 0,
    lastCareDate: '',
    lastEventDate: '',
    todayEvent: null,
    eventHistory: [],
    dailyActions: {},
    quests: QUESTS.map((quest) => ({ ...quest })),
    achievements: [],
  }
}

function applyTimeStep(stats: PetStats, hours: number, phase: PetDayPhase) {
  const sleeping = phase === 'night'
  stats.hunger = clamp(stats.hunger - (sleeping ? 0.32 : 0.42) * hours)
  stats.energy = clamp(stats.energy + (sleeping ? 2.6 : -0.5) * hours)
  const discomfort =
    (stats.hunger < 30 ? 0.7 : 0) +
    (stats.energy < 25 && !sleeping ? 0.7 : 0) +
    (stats.health < 45 ? 0.7 : 0)
  stats.mood = clamp(stats.mood - (sleeping ? 0.12 : 0.28) * hours - discomfort * hours)
  if (stats.hunger < 18 || (stats.energy < 15 && !sleeping)) {
    stats.health = clamp(stats.health - 0.32 * hours)
  } else if (stats.hunger > 55 && stats.energy > 45 && stats.mood > 55) {
    stats.health = clamp(stats.health + 0.25 * hours)
  }
}

function boost(stats: PetStats, delta: Partial<Record<keyof PetStats, number>>) {
  stats.mood = clamp(stats.mood + (delta.mood ?? 0))
  stats.hunger = clamp(stats.hunger + (delta.hunger ?? 0))
  stats.charm = clamp(stats.charm + (delta.charm ?? 0))
  stats.energy = clamp(stats.energy + (delta.energy ?? 0))
  stats.health = clamp(stats.health + (delta.health ?? 0))
  stats.loyalty = clamp(stats.loyalty + (delta.loyalty ?? 0))
  stats.xp += delta.xp ?? 0
}

function scaledXp(value: number, scale: number) {
  return Math.max(1, Math.round(value * scale))
}

function dailyActionRewardScale(count: number) {
  if (count > 4) return 0.35
  if (count > 2) return 0.65
  return 1
}

function recordDailyAction(state: PetState, action: PetAction, now: number) {
  const today = dateKey(now)
  const existing = state.game.dailyActions[action]
  const count = existing?.date === today ? existing.count + 1 : 1
  state.game.dailyActions[action] = { date: today, count }
  return count
}

function ensureDailyEvent(state: PetState, now: number) {
  const today = dateKey(now)
  if (state.game.lastEventDate === today) return
  const event = createDailyEvent(state, now)
  state.game.lastEventDate = today
  state.game.todayEvent = event
  state.game.eventHistory = [
    event.id,
    ...state.game.eventHistory.filter((id) => id !== event.id),
  ].slice(0, 14)
}

function createDailyEvent(state: PetState, now: number): PetRandomEvent {
  const today = dateKey(now)
  const seed = seededNumber(`${today}:${state.stats.level}:${whole(state.stats.loyalty)}`)
  const pool = Object.entries(RANDOM_EVENTS).flatMap(([id, config]) =>
    Array.from({ length: config.weight }, () => id as PetRandomEventId),
  )
  const id = pool[seed % pool.length] ?? 'windowSunbeam'
  const config = RANDOM_EVENTS[id]
  return {
    id,
    date: today,
    phase: config.phase,
    action: config.action,
    resolved: false,
    createdAt: now,
  }
}

function resolveDailyEvent(state: PetState, action: PetAction, now: number) {
  const event = state.game.todayEvent
  if (!event || event.resolved || event.date !== dateKey(now) || event.action !== action) return
  event.resolved = true
  switch (event.id) {
    case 'morningStretch':
      boost(state.stats, { mood: 6, energy: 4, xp: 6 })
      break
    case 'windowSunbeam':
      boost(state.stats, { mood: 5, health: 2, loyalty: 1, xp: 5 })
      break
    case 'curiousPing':
      boost(state.stats, { mood: 3, charm: 1, xp: 8 })
      break
    case 'rainyNap':
      boost(state.stats, { energy: 8, health: 4, mood: 3, xp: 5 })
      break
    case 'midnightHungry':
      boost(state.stats, { hunger: 8, loyalty: 2, xp: 5 })
      break
    case 'looseShell':
      boost(state.stats, { mood: 2, xp: 6 })
      break
  }
}

function progressQuests(state: PetState, action: PetAction) {
  for (const quest of state.game.quests) {
    if (quest.completed || quest.action !== action) continue
    quest.progress = Math.min(quest.goal, quest.progress + 1)
    if (quest.progress < quest.goal) continue
    quest.completed = true
    const reward = QUEST_REWARDS[quest.id]
    boost(state.stats, { xp: reward.xp })
  }
}

function recordCare(state: PetState, now: number) {
  const today = dateKey(now)
  if (state.game.lastCareDate === today) return
  state.game.streakDays = isYesterday(state.game.lastCareDate, today)
    ? state.game.streakDays + 1
    : 1
  state.game.lastCareDate = today
}

function normalizeState(state: PetState): PetState {
  const game = normalizeGameState(state.game)
  let xp = Math.max(0, Number(state.stats.xp) || 0)
  let level = Math.max(1, Number(state.stats.level) || 1)
  let didLevel = false
  while (xp >= levelXpRequirement(level)) {
    xp -= levelXpRequirement(level)
    level += 1
    didLevel = true
  }
  const normalized: PetState = {
    ...state,
    inventory: normalizeInventory(state.inventory),
    game,
    lastAction: isLastAction(state.lastAction) ? state.lastAction : 'idle',
    lastActionAt: Number(state.lastActionAt) || 0,
    stats: {
      ...state.stats,
      mood: clamp(Number(state.stats.mood) || 0),
      hunger: clamp(Number(state.stats.hunger) || 0),
      charm: clamp(Number(state.stats.charm) || 0),
      energy: clamp(Number(state.stats.energy) || 0),
      health: clamp(Number(state.stats.health) || 0),
      loyalty: clamp(Number(state.stats.loyalty) || 0),
      xp,
      level,
    },
  }
  if (didLevel) normalized.lastAction = 'level-up'
  return normalized
}

function normalizeInventory(_items: InventoryItem[]): InventoryItem[] {
  return []
}

function normalizeGameState(game?: Partial<PetGameState>): PetGameState {
  const defaults = createDefaultGameState()
  const quests = defaults.quests.map((quest) => {
    const existing = game?.quests?.find((candidate) => candidate.id === quest.id)
    return {
      ...quest,
      progress: Math.max(0, Math.min(quest.goal, Math.floor(Number(existing?.progress) || 0))),
      completed: Boolean(existing?.completed),
    }
  })
  return {
    shells: 0,
    streakDays: Math.max(0, Math.floor(Number(game?.streakDays ?? defaults.streakDays) || 0)),
    lastCareDate: typeof game?.lastCareDate === 'string' ? game.lastCareDate : '',
    lastEventDate: typeof game?.lastEventDate === 'string' ? game.lastEventDate : '',
    todayEvent: normalizeRandomEvent(game?.todayEvent),
    eventHistory: (game?.eventHistory ?? []).filter(isRandomEventId).slice(0, 14),
    dailyActions: normalizeDailyActions(game?.dailyActions),
    quests,
    achievements: [],
  }
}

function normalizeRandomEvent(event?: PetRandomEvent | null): PetRandomEvent | null {
  if (!event || !isRandomEventId(event.id)) return null
  const config = RANDOM_EVENTS[event.id]
  return {
    id: event.id,
    date: typeof event.date === 'string' ? event.date : '',
    phase: config.phase,
    action: config.action,
    resolved: Boolean(event.resolved),
    createdAt: Number(event.createdAt) || 0,
  }
}

function normalizeDailyActions(
  value?: Partial<Record<PetAction, { date: string; count: number }>>,
): Partial<Record<PetAction, { date: string; count: number }>> {
  const actions: Partial<Record<PetAction, { date: string; count: number }>> = {}
  if (!value || typeof value !== 'object') return actions
  for (const action of ACTIONS) {
    const entry = value[action]
    if (!entry || typeof entry.date !== 'string') continue
    actions[action] = {
      date: entry.date,
      count: Math.max(0, Math.floor(Number(entry.count) || 0)),
    }
  }
  return actions
}

function dateKey(now: number) {
  const date = new Date(now)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isYesterday(previous: string, today: string) {
  if (!previous) return false
  const previousTime = new Date(`${previous}T00:00:00`).getTime()
  const todayTime = new Date(`${today}T00:00:00`).getTime()
  return todayTime - previousTime === DAY_MS
}

function isLastAction(value: unknown): value is PetLastAction {
  return typeof value === 'string' && LAST_ACTIONS.includes(value as PetLastAction)
}

function isRandomEventId(value: unknown): value is PetRandomEventId {
  return typeof value === 'string' && value in RANDOM_EVENTS
}

function seededNumber(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
