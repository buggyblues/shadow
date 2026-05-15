export type PetAttribute = 'tide' | 'spark' | 'snack' | 'focus'

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
  | 'pet'
  | 'feed'
  | 'play'
  | 'rest'
  | 'explore'
  | 'tea'
  | 'sick'
  | 'level-up'

export type PetQuestId = 'firstPat' | 'snackRoutine' | 'harborScout' | 'steadyCare'
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

export type PetGameState = {
  shells: number
  streakDays: number
  lastCareDate: string
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

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export const PET_ANIMATION_FRAMES: Record<PetAnimationKey, number> = {
  idle: 6,
  pet: 6,
  feed: 6,
  play: 6,
  rest: 6,
  explore: 6,
  tea: 6,
  sick: 6,
  'level-up': 6,
}

const ACTIONS: PetAction[] = ['feed', 'pet', 'play', 'rest', 'explore', 'tea']
const LAST_ACTIONS: PetLastAction[] = [...ACTIONS, 'idle', 'level-up']

const QUESTS: PetQuest[] = [
  { id: 'firstPat', action: 'pet', progress: 0, goal: 1, completed: false },
  { id: 'snackRoutine', action: 'feed', progress: 0, goal: 3, completed: false },
  { id: 'harborScout', action: 'explore', progress: 0, goal: 2, completed: false },
  { id: 'steadyCare', action: 'rest', progress: 0, goal: 2, completed: false },
]

const QUEST_REWARDS: Record<
  PetQuestId,
  { shells: number; xp: number; item?: InventoryItem['id']; achievement: PetAchievementId }
> = {
  firstPat: { shells: 6, xp: 14, achievement: 'firstFriend' },
  snackRoutine: { shells: 8, xp: 24, item: 'coralTea', achievement: 'snackKeeper' },
  harborScout: { shells: 10, xp: 28, item: 'moonShell', achievement: 'harborScout' },
  steadyCare: { shells: 6, xp: 18, item: 'shrimpSnack', achievement: 'steadyCaptain' },
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
    inventory: [
      { id: 'shrimpSnack', count: 3 },
      { id: 'moonShell', count: 1 },
      { id: 'coralTea', count: 2 },
      { id: 'starMap', count: 0 },
    ],
    game: createDefaultGameState(),
    lastTickAt: now,
    lastActionAt: 0,
    lastAction: 'idle',
  }
}

export function tickPet(state: PetState, now = Date.now()): PetState {
  const elapsedMinutes = Math.floor((now - state.lastTickAt) / 60_000)
  if (elapsedMinutes <= 0) return normalizeState(state)
  const decay = Math.min(18, elapsedMinutes)
  return normalizeState({
    ...state,
    lastTickAt: now,
    stats: {
      ...state.stats,
      hunger: clamp(state.stats.hunger - decay * 2),
      energy: clamp(state.stats.energy - decay),
      mood: clamp(state.stats.mood - Math.ceil(decay / 2)),
      health: clamp(
        state.stats.health -
          (state.stats.hunger < 20 ? decay : 0) -
          (state.stats.energy < 12 ? Math.ceil(decay / 2) : 0),
      ),
    },
  })
}

export function applyPetAction(state: PetState, action: PetAction, now = Date.now()): PetState {
  const current = tickPet(state, now)
  const next = structuredClone(current) as PetState
  const startingLevel = next.stats.level
  next.lastAction = action
  next.lastActionAt = now
  next.lastTickAt = now
  recordCare(next, now)

  switch (action) {
    case 'feed': {
      const premiumSnack = consumeItem(next, 'shrimpSnack')
      if (!premiumSnack && next.game.shells >= 4) next.game.shells -= 4
      boost(next.stats, {
        hunger: premiumSnack ? 28 : 16,
        mood: premiumSnack ? 7 : 4,
        health: premiumSnack ? 3 : 1,
        loyalty: 2,
        xp: premiumSnack ? 12 : 8,
      })
      break
    }
    case 'pet':
      boost(next.stats, { mood: 14, loyalty: 6, charm: 1, xp: 8 })
      break
    case 'play':
      boost(next.stats, {
        mood: next.stats.energy > 12 ? 16 : 6,
        charm: 4,
        loyalty: 3,
        xp: next.stats.energy > 12 ? 16 : 6,
        energy: -14,
        hunger: -8,
        health: next.stats.energy > 12 ? 0 : -4,
      })
      break
    case 'rest':
      boost(next.stats, { energy: 30, health: 5, mood: 3, hunger: -5, xp: 5 })
      break
    case 'explore':
      if (next.stats.energy < 18 || next.stats.hunger < 18) {
        boost(next.stats, { mood: -4, health: -8, energy: -8, hunger: -6, xp: 4 })
      } else {
        rewardExploration(next, now)
        boost(next.stats, { xp: 22, charm: 3, mood: 6, energy: -18, hunger: -10 })
      }
      break
    case 'tea': {
      const hasTea = consumeItem(next, 'coralTea')
      boost(next.stats, {
        health: hasTea ? 12 : 4,
        energy: hasTea ? 18 : 8,
        mood: 4,
        xp: hasTea ? 8 : 4,
      })
      break
    }
  }

  progressQuests(next, action)
  const normalized = normalizeState(next)
  if (normalized.stats.level > startingLevel) {
    normalized.lastAction = 'level-up'
    unlockAchievement(normalized, 'levelTwo')
  }
  return normalized
}

export function settlePetAction(state: PetState): PetState {
  if (state.lastAction === 'idle') return state
  return normalizeState({ ...state, lastAction: 'idle' })
}

export function selectAnimation(state: PetState): PetAnimationKey {
  if (state.lastAction === 'level-up') return 'level-up'
  if (ACTIONS.includes(state.lastAction as PetAction)) return state.lastAction as PetAction
  if (state.stats.health <= 24) return 'sick'
  if (state.stats.hunger <= 18 || state.stats.energy <= 14) return 'rest'
  return 'idle'
}

export function levelXpRequirement(level: number) {
  return Math.max(1, level) * 100
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
    shells: 12,
    streakDays: 0,
    lastCareDate: '',
    quests: QUESTS.map((quest) => ({ ...quest })),
    achievements: [],
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

function consumeItem(state: PetState, itemId: InventoryItem['id']) {
  const item = state.inventory.find((candidate) => candidate.id === itemId)
  if (!item || item.count <= 0) return false
  item.count -= 1
  return true
}

function addItem(state: PetState, itemId: InventoryItem['id'], count: number) {
  const item = state.inventory.find((candidate) => candidate.id === itemId)
  if (item) {
    item.count += count
  } else {
    state.inventory.push({ id: itemId, count })
  }
}

function rewardExploration(state: PetState, now: number) {
  state.game.shells += 2 + Math.floor(state.stats.level / 2)
  addItem(state, 'moonShell', 1)
  const discovery = (now + state.stats.level + state.stats.loyalty) % 4
  if (discovery === 0) addItem(state, 'shrimpSnack', 1)
  if (discovery === 1) addItem(state, 'coralTea', 1)
}

function progressQuests(state: PetState, action: PetAction) {
  for (const quest of state.game.quests) {
    if (quest.completed || quest.action !== action) continue
    quest.progress = Math.min(quest.goal, quest.progress + 1)
    if (quest.progress < quest.goal) continue
    quest.completed = true
    const reward = QUEST_REWARDS[quest.id]
    state.game.shells += reward.shells
    boost(state.stats, { xp: reward.xp })
    if (reward.item) addItem(state, reward.item, 1)
    unlockAchievement(state, reward.achievement)
  }
}

function recordCare(state: PetState, now: number) {
  const today = dateKey(now)
  if (state.game.lastCareDate === today) return
  state.game.streakDays = isYesterday(state.game.lastCareDate, today)
    ? state.game.streakDays + 1
    : 1
  state.game.lastCareDate = today
  if (state.game.streakDays > 1) {
    state.game.shells += Math.min(10, state.game.streakDays)
  }
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
    game.shells += 10 + level * 2
    addItem({ ...state, game }, 'starMap', 1)
  }
  const normalized: PetState = {
    ...state,
    inventory: normalizeInventory(state.inventory),
    game,
    lastAction: isLastAction(state.lastAction) ? state.lastAction : 'idle',
    lastActionAt: Number(state.lastActionAt) || 0,
    stats: {
      ...state.stats,
      mood: clamp(state.stats.mood),
      hunger: clamp(state.stats.hunger),
      charm: clamp(state.stats.charm),
      energy: clamp(state.stats.energy),
      health: clamp(state.stats.health),
      loyalty: clamp(state.stats.loyalty),
      xp,
      level,
    },
  }
  if (didLevel) unlockAchievement(normalized, 'levelTwo')
  return normalized
}

function normalizeInventory(items: InventoryItem[]): InventoryItem[] {
  const defaults = createDefaultPetState(0).inventory
  return defaults.map((item) => {
    const existing = items.find((candidate) => candidate.id === item.id)
    return {
      id: item.id,
      count: Math.max(0, Math.floor(Number(existing?.count ?? item.count) || 0)),
    }
  })
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
  const achievements = new Set(
    (game?.achievements ?? []).filter((item): item is PetAchievementId =>
      ['firstFriend', 'snackKeeper', 'harborScout', 'steadyCaptain', 'levelTwo'].includes(item),
    ),
  )
  return {
    shells: Math.max(0, Math.floor(Number(game?.shells ?? defaults.shells) || 0)),
    streakDays: Math.max(0, Math.floor(Number(game?.streakDays ?? defaults.streakDays) || 0)),
    lastCareDate: typeof game?.lastCareDate === 'string' ? game.lastCareDate : '',
    quests,
    achievements: [...achievements],
  }
}

function unlockAchievement(state: PetState, achievement: PetAchievementId) {
  if (state.game.achievements.includes(achievement)) return
  state.game.achievements.push(achievement)
}

function dateKey(now: number) {
  return new Date(now).toISOString().slice(0, 10)
}

function isYesterday(previous: string, today: string) {
  if (!previous) return false
  const previousTime = Date.parse(`${previous}T00:00:00.000Z`)
  const todayTime = Date.parse(`${today}T00:00:00.000Z`)
  return todayTime - previousTime === 86_400_000
}

function isLastAction(value: unknown): value is PetLastAction {
  return typeof value === 'string' && LAST_ACTIONS.includes(value as PetLastAction)
}
