import { resolve } from 'node:path'
import type { ShadowServerAppActorRef } from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import type {
  CatAction,
  CatActionLog,
  CatAsset,
  CatLeaderboardEntry,
  CatPerson,
  CatState,
  PetCat,
} from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

export const catAssets: CatAsset[] = [
  {
    id: 'cat_01',
    name: 'Marmalade',
    personality: 'Sunny and hungry',
    imageUrl: '/cats/cat-01.png',
  },
  { id: 'cat_02', name: 'Nimbus', personality: 'Careful observer', imageUrl: '/cats/cat-02.png' },
  { id: 'cat_03', name: 'Mochi', personality: 'Gentle lap cat', imageUrl: '/cats/cat-03.png' },
  { id: 'cat_04', name: 'Tux', personality: 'Night patrol expert', imageUrl: '/cats/cat-04.png' },
  {
    id: 'cat_05',
    name: 'Calico',
    personality: 'Laughs at everything',
    imageUrl: '/cats/cat-05.png',
  },
  { id: 'cat_06', name: 'Pebble', personality: 'Quiet climber', imageUrl: '/cats/cat-06.png' },
  {
    id: 'cat_07',
    name: 'Snowbell',
    personality: 'Polite and dramatic',
    imageUrl: '/cats/cat-07.png',
  },
  {
    id: 'cat_08',
    name: 'Tigerbean',
    personality: 'Paw first, questions later',
    imageUrl: '/cats/cat-08.png',
  },
  {
    id: 'cat_09',
    name: 'Badge',
    personality: 'Watches the dashboard',
    imageUrl: '/cats/cat-09.png',
  },
  {
    id: 'cat_10',
    name: 'Pumpkin',
    personality: 'Zooms after snacks',
    imageUrl: '/cats/cat-10.png',
  },
]

function systemPerson(displayName: string): CatPerson {
  return { kind: 'system', id: `system:${displayName.toLowerCase()}`, displayName }
}

function defaultState(): CatState {
  const timestamp = now()
  return {
    updatedAt: timestamp,
    cats: [
      {
        id: 'cat_demo',
        name: 'Marmalade',
        assetId: 'cat_01',
        owner: systemPerson('Cat Buddy'),
        hunger: 24,
        happiness: 82,
        energy: 74,
        cleanliness: 88,
        health: 92,
        mood: 'content',
        createdAt: timestamp,
        updatedAt: timestamp,
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
  return actor
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function moodFor(cat: Pick<PetCat, 'hunger' | 'happiness' | 'energy' | 'cleanliness' | 'health'>) {
  if (cat.health < 35) return 'sick'
  if (cat.hunger > 75) return 'hungry'
  if (cat.cleanliness < 35) return 'messy'
  if (cat.energy < 25) return 'sleepy'
  if (cat.happiness > 82) return 'playful'
  return 'content'
}

function recomputeHealth(cat: PetCat) {
  const needsPenalty =
    Math.max(0, cat.hunger - 45) * 0.28 +
    Math.max(0, 45 - cat.cleanliness) * 0.25 +
    Math.max(0, 35 - cat.energy) * 0.18
  cat.health = clamp(96 - needsPenalty + cat.happiness * 0.04)
  cat.mood = moodFor(cat)
}

function decayCat(cat: PetCat, timestamp = new Date()) {
  const last = new Date(cat.updatedAt).getTime()
  const elapsedHours = Math.max(0, (timestamp.getTime() - last) / 3_600_000)
  if (elapsedHours < 0.05) return false
  cat.hunger = clamp(cat.hunger + elapsedHours * 5.4)
  cat.happiness = clamp(cat.happiness - elapsedHours * 3.2)
  cat.energy = clamp(cat.energy - elapsedHours * 1.8)
  cat.cleanliness = clamp(cat.cleanliness - elapsedHours * 4.1)
  cat.updatedAt = timestamp.toISOString()
  recomputeHealth(cat)
  return true
}

function decayAll() {
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

function logAction(cat: PetCat, actor: ShadowServerAppActorRef, action: CatAction, note?: string) {
  const entry: CatActionLog = {
    id: id('log'),
    catId: cat.id,
    catName: cat.name,
    actor: person(actor),
    action,
    note,
    createdAt: now(),
  }
  state.logs.unshift(entry)
  state.logs = state.logs.slice(0, 120)
  return entry
}

function applyCare(cat: PetCat, action: Exclude<CatAction, 'adopt'>) {
  if (action === 'feed' || action === 'auto_feed') {
    cat.hunger = clamp(cat.hunger - 38)
    cat.happiness = clamp(cat.happiness + 5)
    cat.lastFedAt = now()
  }
  if (action === 'play') {
    cat.happiness = clamp(cat.happiness + 24)
    cat.energy = clamp(cat.energy - 14)
    cat.hunger = clamp(cat.hunger + 8)
    cat.lastPlayedAt = now()
  }
  if (action === 'clean') {
    cat.cleanliness = clamp(cat.cleanliness + 42)
    cat.happiness = clamp(cat.happiness + 4)
  }
  if (action === 'rest') {
    cat.energy = clamp(cat.energy + 34)
    cat.hunger = clamp(cat.hunger + 4)
  }
  cat.updatedAt = now()
  recomputeHealth(cat)
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
  const cat: PetCat = {
    id: id('cat'),
    name: input.name?.trim() || asset.name,
    assetId: asset.id,
    owner: person(input.owner),
    hunger: 30,
    happiness: 76,
    energy: 78,
    cleanliness: 86,
    health: 94,
    mood: 'content',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  state.cats.push(cat)
  logAction(cat, input.owner, 'adopt', 'adopted')
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
  action: Exclude<CatAction, 'adopt' | 'auto_feed'>
  actor: ShadowServerAppActorRef
}) {
  decayAll()
  const cat = state.cats.find((item) => item.id === input.catId)
  if (!cat) return null
  applyCare(cat, input.action)
  const log = logAction(cat, input.actor, input.action)
  persist()
  return structuredClone({ cat, log })
}

export function autoFeed(input: { catId?: string; actor: ShadowServerAppActorRef }) {
  decayAll()
  const candidates = input.catId
    ? state.cats.filter((cat) => cat.id === input.catId)
    : state.cats.filter((cat) => cat.hunger >= 45 || cat.health < 72)
  const logs: CatActionLog[] = []
  for (const cat of candidates) {
    applyCare(cat, 'auto_feed')
    logs.push(logAction(cat, input.actor, 'auto_feed', 'automated feeding'))
  }
  persist()
  return structuredClone({ cats: candidates, logs })
}

export function logsForCat(catId: string) {
  return structuredClone(state.logs.filter((log) => log.catId === catId).slice(0, 30))
}

export function leaderboard(input: { limit?: number }) {
  decayAll()
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100)
  const entries: CatLeaderboardEntry[] = state.cats.map((cat) => {
    const asset = assetFor(cat.assetId)
    return {
      catId: cat.id,
      name: cat.name,
      imageUrl: asset.imageUrl,
      score: Math.max(
        0,
        Math.round(100 - cat.hunger + cat.happiness + cat.energy + cat.cleanliness + cat.health),
      ),
      mood: cat.mood,
      ownerName: cat.owner.displayName,
    }
  })
  return structuredClone(entries.sort((a, b) => b.score - a.score).slice(0, limit))
}
