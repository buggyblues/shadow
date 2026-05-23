import { resolve } from 'node:path'
import type { ShadowServerAppActorRef } from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import {
  ACTION_BALANCE,
  ADVENTURE_MAPS,
  BASE_STATS,
  DAILY_ACTION_LIMITS,
  DAILY_TASKS,
  EXP_TO_NEXT,
  FURNITURE_BONUS_CAP,
  FURNITURE_UPGRADES,
  HEALTH_FLOOR,
  MINIGAME_RANKS,
  ROUTES,
  routeLabel,
  SCORE_CAPS,
  STARTING_COINS,
  STAT_KEYS,
} from './game-balance.js'
import type {
  AdventureMap,
  CatAction,
  CatActionLog,
  CatAsset,
  CatCareAction,
  CatLeaderboardEntry,
  CatPerson,
  CatReward,
  CatRoute,
  CatState,
  CatStatKey,
  CatStats,
  DailyLimitedAction,
  DailyTaskReward,
  PetCat,
} from './types.js'

const now = () => new Date().toISOString()
const todayKey = () => new Date().toISOString().slice(0, 10)
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

export const catAssets: CatAsset[] = [
  {
    id: 'cat_01',
    name: 'Marmalade',
    personality: '星尾猫 · 活泼',
    imageUrl: '/cats/cat-01.png',
  },
  { id: 'cat_02', name: 'Nimbus', personality: '星尾猫 · 聪明', imageUrl: '/cats/cat-02.png' },
  { id: 'cat_03', name: 'Mochi', personality: '星尾猫 · 温柔', imageUrl: '/cats/cat-03.png' },
  { id: 'cat_04', name: 'Tux', personality: '星尾猫 · 夜巡', imageUrl: '/cats/cat-04.png' },
  {
    id: 'cat_05',
    name: 'Calico',
    personality: '星尾猫 · 好奇',
    imageUrl: '/cats/cat-05.png',
  },
  { id: 'cat_06', name: 'Pebble', personality: '星尾猫 · 冷静', imageUrl: '/cats/cat-06.png' },
  {
    id: 'cat_07',
    name: 'Snowbell',
    personality: '星尾猫 · 戏剧派',
    imageUrl: '/cats/cat-07.png',
  },
  {
    id: 'cat_08',
    name: 'Tigerbean',
    personality: '星尾猫 · 冒险派',
    imageUrl: '/cats/cat-08.png',
  },
  {
    id: 'cat_09',
    name: 'Badge',
    personality: '星尾猫 · 观察员',
    imageUrl: '/cats/cat-09.png',
  },
  {
    id: 'cat_10',
    name: 'Pumpkin',
    personality: '星尾猫 · 贪吃',
    imageUrl: '/cats/cat-10.png',
  },
]

function systemPerson(displayName: string): CatPerson {
  return { kind: 'system', id: `system:${displayName.toLowerCase()}`, displayName }
}

function makeCat(input: {
  catId: string
  name: string
  assetId: string
  owner: CatPerson
  timestamp: string
}): PetCat {
  return {
    id: input.catId,
    name: input.name,
    assetId: input.assetId,
    owner: input.owner,
    hunger: 28,
    happiness: 78,
    energy: 82,
    cleanliness: 86,
    health: 94,
    mood: 'content',
    level: 1,
    exp: 0,
    coins: STARTING_COINS,
    bond: 0,
    materials: 0,
    cores: 0,
    route: 'balanced',
    stats: { ...BASE_STATS },
    stage: 'kitten',
    furnitureLevel: 0,
    dailyDate: todayKey(),
    dailyActions: 0,
    dailyActionCounts: {},
    dailyClaimedTaskIds: [],
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  }
}

function defaultState(): CatState {
  const timestamp = now()
  return {
    updatedAt: timestamp,
    cats: [
      {
        ...makeCat({
          catId: 'cat_demo',
          name: 'Marmalade',
          assetId: 'cat_01',
          owner: systemPerson('Cat Buddy'),
          timestamp,
        }),
        hunger: 24,
        happiness: 82,
        energy: 74,
        cleanliness: 88,
        health: 92,
        bond: 35,
        stats: { str: 15, agi: 14, int: 13, cha: 16, luk: 12 },
        lastFedAt: timestamp,
        lastPlayedAt: timestamp,
      },
    ],
    logs: [],
  }
}

function dataFilePath() {
  return resolve(process.env.PETCAT_DATA_FILE ?? './data/petcat.json')
}

function isState(value: unknown): value is CatState {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { cats?: unknown }).cats) &&
    Array.isArray((value as { logs?: unknown }).logs)
  )
}

const stateStore = createShadowServerAppJsonStore<CatState>({
  filePath: dataFilePath(),
  defaultValue: defaultState,
  validate: isState,
})

let state = stateStore.read()

function persist() {
  state.updatedAt = now()
  state = stateStore.write(state)
}

function person(actor: ShadowServerAppActorRef): CatPerson {
  return {
    kind: actor.kind,
    id: actor.id,
    userId: actor.userId ?? null,
    buddyAgentId: actor.buddyAgentId ?? null,
    ownerId: actor.ownerId ?? null,
    displayName: actor.displayName || 'Cat Keeper',
    avatarUrl: actor.avatarUrl ?? null,
  }
}

function clampNeed(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function clampStat(value: number) {
  return Math.max(0, Math.round(value))
}

function routeExists(route: string): route is CatRoute {
  return ROUTES.some((item) => item.id === route)
}

function moodFor(cat: Pick<PetCat, 'hunger' | 'happiness' | 'energy' | 'cleanliness' | 'health'>) {
  if (cat.health < 35) return 'sick'
  if (cat.hunger > 75) return 'hungry'
  if (cat.cleanliness < 35) return 'messy'
  if (cat.energy < 25) return 'sleepy'
  if (cat.happiness > 84) return 'playful'
  return 'content'
}

function resetDailyProgress(cat: PetCat) {
  const today = todayKey()
  if (cat.dailyDate === today) return false
  cat.dailyDate = today
  cat.dailyActions = 0
  cat.dailyActionCounts = {}
  cat.dailyClaimedTaskIds = []
  return true
}

function normalizeStats(stats: Partial<CatStats> | undefined): CatStats {
  return {
    str: clampStat(stats?.str ?? BASE_STATS.str),
    agi: clampStat(stats?.agi ?? BASE_STATS.agi),
    int: clampStat(stats?.int ?? BASE_STATS.int),
    cha: clampStat(stats?.cha ?? BASE_STATS.cha),
    luk: clampStat(stats?.luk ?? BASE_STATS.luk),
  }
}

function normalizedCat(cat: PetCat): boolean {
  const mutable = cat as PetCat & Partial<Record<keyof PetCat, unknown>>
  let changed = false
  const ensure = <Key extends keyof PetCat>(key: Key, value: PetCat[Key]) => {
    if (mutable[key] !== undefined) return
    mutable[key] = value
    changed = true
  }

  ensure('level', 1)
  ensure('exp', 0)
  ensure('coins', STARTING_COINS)
  ensure('bond', 0)
  ensure('materials', 0)
  ensure('cores', 0)
  ensure('route', 'balanced')
  ensure('stats', { ...BASE_STATS })
  ensure('stage', 'kitten')
  ensure('furnitureLevel', 0)
  ensure('dailyDate', todayKey())
  ensure('dailyActions', 0)
  ensure('dailyActionCounts', {})
  ensure('dailyClaimedTaskIds', [])

  const route = String(cat.route ?? 'balanced')
  if (!routeExists(route)) {
    cat.route = 'balanced'
    changed = true
  }

  const stats = normalizeStats(cat.stats)
  if (JSON.stringify(stats) !== JSON.stringify(cat.stats)) {
    cat.stats = stats
    changed = true
  }

  changed = resetDailyProgress(cat) || changed
  recomputeHealth(cat)
  updateEvolution(cat)
  return changed
}

function normalizeAll() {
  let changed = false
  for (const cat of state.cats) {
    changed = normalizedCat(cat) || changed
  }
  if (changed) persist()
}

function recomputeHealth(cat: PetCat) {
  const needsPenalty =
    Math.max(0, cat.hunger - 45) * 0.28 +
    Math.max(0, 45 - cat.cleanliness) * 0.25 +
    Math.max(0, 35 - cat.energy) * 0.18
  cat.health = Math.max(
    HEALTH_FLOOR,
    clampNeed(96 - needsPenalty + cat.happiness * 0.04 + furnitureBonus(cat) * 24),
  )
  cat.mood = moodFor(cat)
}

function updateEvolution(cat: PetCat) {
  if (cat.level < 5) {
    cat.stage = 'kitten'
    cat.evolutionName = undefined
    return
  }
  const routeRequirement = cat.route === 'balanced' ? 72 : cat.route === 'luk' ? 100 : 120
  const routeValue =
    cat.route === 'balanced'
      ? Math.min(...STAT_KEYS.map((key) => cat.stats[key]))
      : cat.stats[cat.route]
  const balancedSpread = Math.max(...STAT_KEYS.map((key) => cat.stats[key])) - routeValue
  const balancedOk = cat.route !== 'balanced' || balancedSpread <= 28
  if (
    cat.level >= 25 &&
    cat.bond >= 800 &&
    routeValue >= routeRequirement &&
    cat.cores >= 1 &&
    balancedOk
  ) {
    cat.stage = 'mature'
    cat.evolutionName = `${routeLabel(cat.route)}成熟形态`
    return
  }
  cat.stage = 'growth'
  cat.evolutionName = undefined
}

function decayCat(cat: PetCat, timestamp = new Date()) {
  const last = new Date(cat.updatedAt).getTime()
  const elapsedHours = Math.max(0, (timestamp.getTime() - last) / 3_600_000)
  if (elapsedHours < 0.05) return false
  const offlineCap = elapsedHours >= 24 ? 50 : 38
  cat.hunger = clampNeed(Math.min(cat.hunger + elapsedHours * 5.4, offlineCap))
  cat.happiness = clampNeed(cat.happiness - elapsedHours * 3.2)
  cat.energy = clampNeed(cat.energy - elapsedHours * 1.8)
  cat.cleanliness = clampNeed(cat.cleanliness - elapsedHours * 4.1)
  cat.updatedAt = timestamp.toISOString()
  recomputeHealth(cat)
  return true
}

function decayAll() {
  normalizeAll()
  const timestamp = new Date()
  let changed = false
  for (const cat of state.cats) {
    changed = decayCat(cat, timestamp) || changed
  }
  if (changed) persist()
}

function assetFor(assetId: string) {
  const fallback = catAssets[0]
  if (!fallback) throw new Error('cat_assets_empty')
  return catAssets.find((asset) => asset.id === assetId) ?? fallback
}

function logAction(
  cat: PetCat,
  actor: ShadowServerAppActorRef,
  action: CatAction,
  note?: string,
  reward?: CatReward,
) {
  const entry: CatActionLog = {
    id: id('log'),
    catId: cat.id,
    catName: cat.name,
    actor: person(actor),
    action,
    note,
    reward,
    createdAt: now(),
  }
  state.logs.unshift(entry)
  state.logs = state.logs.slice(0, 160)
  return entry
}

function spend(cat: PetCat, input: { coins?: number; energy?: number }) {
  if ((input.coins ?? 0) > cat.coins) throw new Error('not_enough_coins')
  if ((input.energy ?? 0) > cat.energy) throw new Error('not_enough_energy')
  cat.coins -= input.coins ?? 0
  cat.energy = clampNeed(cat.energy - (input.energy ?? 0))
}

function dailyActionCount(cat: PetCat, action: DailyLimitedAction) {
  resetDailyProgress(cat)
  return cat.dailyActionCounts[action] ?? 0
}

function assertDailyLimit(cat: PetCat, action: DailyLimitedAction) {
  const limit = DAILY_ACTION_LIMITS[action]
  if (dailyActionCount(cat, action) >= limit) throw new Error('daily_limit_reached')
}

function countsForDailyTask(action: CatAction) {
  return (
    action === 'feed' ||
    action === 'pet' ||
    action === 'play' ||
    action === 'clean' ||
    action === 'train' ||
    action === 'minigame' ||
    action === 'adventure'
  )
}

function recordDailyAction(cat: PetCat, action: CatAction) {
  if (action === 'adopt') return
  const limitedAction = action as DailyLimitedAction
  cat.dailyActionCounts[limitedAction] = dailyActionCount(cat, limitedAction) + 1
  if (countsForDailyTask(action)) cat.dailyActions += 1
}

function nextExp(level: number) {
  return EXP_TO_NEXT[level] ?? EXP_TO_NEXT.at(-1) ?? 2510
}

function addExp(cat: PetCat, amount: number) {
  let levelUps = 0
  cat.exp += Math.max(0, Math.round(amount))
  while (cat.exp >= nextExp(cat.level) && cat.level < 99) {
    cat.exp -= nextExp(cat.level)
    cat.level += 1
    levelUps += 1
    cat.energy = clampNeed(cat.energy + 12)
    cat.happiness = clampNeed(cat.happiness + 6)
  }
  return levelUps
}

function applyStats(cat: PetCat, stats: Partial<CatStats> | undefined) {
  if (!stats) return
  for (const key of STAT_KEYS) {
    cat.stats[key] = clampStat(cat.stats[key] + (stats[key] ?? 0))
  }
}

function applyReward(cat: PetCat, reward: CatReward) {
  cat.coins += reward.coins ?? 0
  cat.bond += reward.bond ?? 0
  cat.materials += reward.materials ?? 0
  cat.cores += reward.cores ?? 0
  applyStats(cat, reward.stats)
  const levelUps = addExp(cat, reward.exp ?? 0)
  reward.levelUps = (reward.levelUps ?? 0) + levelUps
}

function awardDailyMilestones(cat: PetCat): DailyTaskReward[] {
  const rewards: DailyTaskReward[] = []
  for (const task of DAILY_TASKS) {
    if (cat.dailyActions < task.requiredActions) continue
    if (cat.dailyClaimedTaskIds.includes(task.id)) continue
    cat.dailyClaimedTaskIds.push(task.id)
    const reward = {
      taskId: task.id,
      label: task.label,
      coins: task.rewardCoin,
      exp: task.rewardExp,
      bond: task.rewardBond,
    }
    cat.coins += reward.coins
    cat.bond += reward.bond
    addExp(cat, reward.exp)
    rewards.push(reward)
  }
  return rewards
}

function finishAction(input: {
  cat: PetCat
  actor: ShadowServerAppActorRef
  action: CatAction
  reward: CatReward
  note: string
}) {
  resetDailyProgress(input.cat)
  recordDailyAction(input.cat, input.action)
  applyReward(input.cat, input.reward)
  const taskRewards = awardDailyMilestones(input.cat)
  if (taskRewards.length) input.reward.taskRewards = taskRewards
  input.cat.updatedAt = now()
  recomputeHealth(input.cat)
  updateEvolution(input.cat)
  const log = logAction(input.cat, input.actor, input.action, input.note, input.reward)
  persist()
  return structuredClone({ cat: input.cat, log })
}

function trainingStats(route: CatRoute): Partial<CatStats> {
  if (route === 'balanced') return { str: 4, agi: 4, int: 4, cha: 4, luk: 4 }
  const stats: Partial<CatStats> = { [route]: route === 'luk' ? 13 : 12 }
  for (const key of STAT_KEYS) {
    if (key !== route) stats[key] = 1
  }
  return stats
}

function minigameRank(cat: PetCat): keyof typeof MINIGAME_RANKS {
  const roll = Math.random() * 34
  const performance = 42 + cat.happiness * 0.24 + cat.energy * 0.16 + cat.bond * 0.015 + roll
  if (performance >= 88) return 'S'
  if (performance >= 72) return 'A'
  return 'B'
}

function furnitureBonus(cat: PetCat) {
  const upgrade = FURNITURE_UPGRADES.find((item) => item.level === cat.furnitureLevel)
  return Math.min(upgrade?.bonus ?? 0, FURNITURE_BONUS_CAP)
}

function recommendedStatAverage(cat: PetCat, map: AdventureMap) {
  const attrs = map.recommendAttrs.length ? map.recommendAttrs : STAT_KEYS
  return attrs.reduce((sum, key) => sum + cat.stats[key], 0) / attrs.length
}

function adventureChance(cat: PetCat, map: AdventureMap) {
  const routeBonus =
    cat.route === 'balanced'
      ? 0.03
      : map.recommendAttrs.includes(cat.route as CatStatKey)
        ? 0.04
        : 0
  const value = 0.52 + (recommendedStatAverage(cat, map) - map.difficulty) / 115
  return Math.max(0.18, Math.min(0.92, value + routeBonus + furnitureBonus(cat)))
}

function rewardNote(reward: CatReward, fallback: string) {
  const parts = [fallback]
  if (reward.success === false) parts.push('未完全成功')
  if (reward.rank) parts.push(`${reward.rank} 评价`)
  if (reward.coins) parts.push(`+${reward.coins} 金币`)
  if (reward.exp) parts.push(`+${reward.exp} 经验`)
  if (reward.bond) parts.push(`+${reward.bond} 亲密`)
  if (reward.materials) parts.push(`+${reward.materials} 星材`)
  if (reward.cores) parts.push('获得路线核心')
  if (reward.levelUps) parts.push(`升 ${reward.levelUps} 级`)
  return parts.join(' · ')
}

export function listAssets() {
  return structuredClone(catAssets)
}

export function adoptCat(input: {
  name?: string
  assetId?: string
  owner: ShadowServerAppActorRef
}) {
  const randomAsset = catAssets[Math.floor(Math.random() * catAssets.length)] ?? assetFor('cat_01')
  const asset = assetFor(input.assetId ?? randomAsset.id)
  const timestamp = now()
  const cat = makeCat({
    catId: id('cat'),
    name: input.name?.trim() || asset.name,
    assetId: asset.id,
    owner: person(input.owner),
    timestamp,
  })
  state.cats.push(cat)
  logAction(cat, input.owner, 'adopt', '星宠入住旅社')
  persist()
  return structuredClone(cat)
}

export function listCats() {
  decayAll()
  return structuredClone(
    state.cats
      .map((cat) => ({ ...cat, asset: assetFor(cat.assetId) }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  )
}

export function getCat(catId: string) {
  decayAll()
  const cat = state.cats.find((item) => item.id === catId)
  return cat
    ? structuredClone({ cat, asset: assetFor(cat.assetId), logs: logsForCat(cat.id) })
    : null
}

export function careForCat(input: {
  catId: string
  action: CatCareAction
  actor: ShadowServerAppActorRef
}) {
  decayAll()
  const cat = state.cats.find((item) => item.id === input.catId)
  if (!cat) return null
  assertDailyLimit(cat, input.action)
  const reward: CatReward = {}
  if (input.action === 'feed') {
    spend(cat, { coins: ACTION_BALANCE.feed.costCoin })
    cat.hunger = clampNeed(cat.hunger + ACTION_BALANCE.feed.hungerDelta)
    cat.happiness = clampNeed(cat.happiness + ACTION_BALANCE.feed.happinessDelta)
    cat.lastFedAt = now()
  }
  if (input.action === 'pet') {
    cat.happiness = clampNeed(cat.happiness + ACTION_BALANCE.pet.happinessDelta)
    reward.bond = ACTION_BALANCE.pet.bond
  }
  if (input.action === 'play') {
    spend(cat, { energy: ACTION_BALANCE.play.costEnergy })
    cat.happiness = clampNeed(cat.happiness + ACTION_BALANCE.play.happinessDelta)
    cat.hunger = clampNeed(cat.hunger + 6)
    reward.bond = ACTION_BALANCE.play.bond
    reward.exp = ACTION_BALANCE.play.exp
    cat.lastPlayedAt = now()
  }
  if (input.action === 'clean') {
    spend(cat, { coins: ACTION_BALANCE.clean.costCoin })
    cat.cleanliness = clampNeed(cat.cleanliness + ACTION_BALANCE.clean.cleanlinessDelta)
    cat.happiness = clampNeed(cat.happiness + ACTION_BALANCE.clean.happinessDelta)
  }
  if (input.action === 'rest') {
    cat.energy = clampNeed(cat.energy + ACTION_BALANCE.rest.energyDelta)
    cat.hunger = clampNeed(cat.hunger + ACTION_BALANCE.rest.hungerDelta)
    cat.cleanliness = clampNeed(cat.cleanliness + ACTION_BALANCE.rest.cleanlinessDelta)
  }
  return finishAction({
    cat,
    actor: input.actor,
    action: input.action,
    reward,
    note: rewardNote(reward, input.action),
  })
}

export function trainCat(input: {
  catId: string
  route: CatRoute
  actor: ShadowServerAppActorRef
}) {
  decayAll()
  const cat = state.cats.find((item) => item.id === input.catId)
  if (!cat) return null
  assertDailyLimit(cat, 'train')
  if (!routeExists(input.route)) throw new Error('invalid_route')
  spend(cat, { coins: ACTION_BALANCE.train.costCoin, energy: ACTION_BALANCE.train.costEnergy })
  cat.route = input.route
  cat.hunger = clampNeed(cat.hunger + 5)
  cat.happiness = clampNeed(cat.happiness + 4)
  const stats = trainingStats(input.route)
  const reward: CatReward = {
    exp: input.route === 'luk' ? ACTION_BALANCE.train.luckExp : ACTION_BALANCE.train.exp,
    bond: ACTION_BALANCE.train.bond,
    stats,
  }
  return finishAction({
    cat,
    actor: input.actor,
    action: 'train',
    reward,
    note: rewardNote(reward, `${routeLabel(input.route)}训练`),
  })
}

export function playMinigame(input: { catId: string; actor: ShadowServerAppActorRef }) {
  decayAll()
  const cat = state.cats.find((item) => item.id === input.catId)
  if (!cat) return null
  assertDailyLimit(cat, 'minigame')
  spend(cat, { energy: ACTION_BALANCE.minigame.costEnergy })
  const rank = minigameRank(cat)
  const balance = MINIGAME_RANKS[rank]
  cat.happiness = clampNeed(cat.happiness + balance.happinessDelta)
  cat.hunger = clampNeed(cat.hunger + 4)
  const reward: CatReward = {
    rank,
    coins: balance.coins,
    exp: balance.exp,
    bond: balance.bond,
  }
  return finishAction({
    cat,
    actor: input.actor,
    action: 'minigame',
    reward,
    note: rewardNote(reward, '星铃小游戏'),
  })
}

export function runAdventure(input: {
  catId: string
  mapId: number
  actor: ShadowServerAppActorRef
}) {
  decayAll()
  const cat = state.cats.find((item) => item.id === input.catId)
  if (!cat) return null
  assertDailyLimit(cat, 'adventure')
  const map = ADVENTURE_MAPS.find((item) => item.id === input.mapId)
  if (!map) throw new Error('map_not_found')
  if (cat.level < map.unlockLevel) throw new Error('map_locked')
  spend(cat, { energy: map.costEnergy })
  cat.hunger = clampNeed(cat.hunger + 8)
  cat.cleanliness = clampNeed(cat.cleanliness - 6)
  const chance = adventureChance(cat, map)
  const success = Math.random() < chance
  const rare = success && Math.random() < map.rareRate
  const reward: CatReward = success
    ? {
        success,
        chance,
        coins: map.baseCoin,
        exp: map.baseExp,
        materials: map.materialValue + (rare ? map.rareValue : 0),
        cores: rare ? 1 : 0,
      }
    : {
        success,
        chance,
        coins: Math.round(map.baseCoin * 0.25),
        exp: Math.round(map.baseExp * 0.45),
        materials: Math.round(map.materialValue * 0.15),
      }
  return finishAction({
    cat,
    actor: input.actor,
    action: 'adventure',
    reward,
    note: rewardNote(reward, map.name),
  })
}

export function upgradeFurniture(input: { catId: string; actor: ShadowServerAppActorRef }) {
  decayAll()
  const cat = state.cats.find((item) => item.id === input.catId)
  if (!cat) return null
  assertDailyLimit(cat, 'upgrade_furniture')
  const next = FURNITURE_UPGRADES.find((item) => item.level === cat.furnitureLevel + 1)
  if (!next) throw new Error('furniture_maxed')
  spend(cat, { coins: next.cost })
  cat.furnitureLevel = next.level
  cat.happiness = clampNeed(cat.happiness + 10)
  const reward: CatReward = { bond: 8 }
  return finishAction({
    cat,
    actor: input.actor,
    action: 'upgrade_furniture',
    reward,
    note: rewardNote(reward, `升级 ${next.name}`),
  })
}

export function logsForCat(catId: string) {
  return structuredClone(state.logs.filter((log) => log.catId === catId).slice(0, 36))
}

export function leaderboard(input: { limit?: number }) {
  decayAll()
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100)
  const entries: CatLeaderboardEntry[] = state.cats.map((cat) => {
    const asset = assetFor(cat.assetId)
    const statScore =
      STAT_KEYS.reduce((sum, key) => sum + Math.min(cat.stats[key], SCORE_CAPS.stat), 0) * 5
    const growthScore = cat.level * 120 + Math.min(cat.bond, SCORE_CAPS.bond)
    const economyScore =
      Math.min(cat.coins, SCORE_CAPS.coins) * 0.04 +
      Math.min(cat.materials, SCORE_CAPS.materials) * 0.12
    return {
      catId: cat.id,
      name: cat.name,
      imageUrl: asset.imageUrl,
      score: Math.max(
        0,
        Math.round(
          growthScore +
            statScore +
            100 -
            cat.hunger +
            cat.happiness +
            cat.energy +
            cat.cleanliness +
            cat.health +
            economyScore +
            cat.furnitureLevel * 80 +
            (cat.stage === 'mature' ? 500 : 0),
        ),
      ),
      mood: cat.mood,
      ownerName: cat.owner.displayName,
      level: cat.level,
      stage: cat.stage,
      route: cat.route,
    }
  })
  return structuredClone(entries.sort((a, b) => b.score - a.score).slice(0, limit))
}
