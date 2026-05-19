import { resolve } from 'node:path'
import type { ShadowServerAppActorRef } from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import type {
  WheelLeaderboardEntry,
  WheelPerson,
  WheelPrize,
  WheelRun,
  WheelSpin,
  WheelState,
} from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

export const wheelPrizes: WheelPrize[] = [
  { id: 'fox', animal: 'Fox', label: 'Forest Sprint', score: 80, weight: 13, color: '#f97316' },
  { id: 'panda', animal: 'Panda', label: 'Bamboo Calm', score: 60, weight: 16, color: '#facc15' },
  { id: 'cat', animal: 'Cat', label: 'Lucky Paw', score: 45, weight: 20, color: '#84cc16' },
  { id: 'rabbit', animal: 'Rabbit', label: 'Moon Hop', score: 35, weight: 22, color: '#14b8a6' },
  { id: 'bear', animal: 'Bear', label: 'Honey Guard', score: 50, weight: 14, color: '#0ea5e9' },
  { id: 'penguin', animal: 'Penguin', label: 'Ice Slide', score: 70, weight: 9, color: '#8b5cf6' },
  { id: 'lion', animal: 'Lion', label: 'Crown Roar', score: 120, weight: 3, color: '#fb7185' },
  { id: 'owl', animal: 'Owl', label: 'Night Wisdom', score: 95, weight: 5, color: '#2563eb' },
]

function defaultState(): WheelState {
  return { updatedAt: now(), runs: [] }
}

function dataFilePath() {
  return resolve(process.env.WHEEL_DATA_FILE ?? './data/wheel.json')
}

function isState(value: unknown): value is WheelState {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { runs?: unknown }).runs)
  )
}

const stateStore = createShadowServerAppJsonStore<WheelState>({
  filePath: dataFilePath(),
  defaultValue: defaultState,
  validate: isState,
})

let state = stateStore.read()

function persist() {
  state.updatedAt = now()
  state = stateStore.write(state)
}

function participantFromActor(
  actor: ShadowServerAppActorRef,
  participantName?: string,
): WheelPerson {
  const displayName = participantName?.trim() || actor.displayName
  return { ...actor, displayName }
}

function weightedPrize() {
  const totalWeight = wheelPrizes.reduce((sum, prize) => sum + prize.weight, 0)
  let roll = Math.random() * totalWeight
  for (const prize of wheelPrizes) {
    roll -= prize.weight
    if (roll <= 0) return prize
  }
  const fallback = wheelPrizes[0]
  if (!fallback) throw new Error('wheel_prizes_empty')
  return fallback
}

export function listPrizes() {
  return structuredClone(wheelPrizes)
}

export function startSpin(input: {
  participantName?: string
  participant: ShadowServerAppActorRef
}) {
  const participant = participantFromActor(input.participant, input.participantName)
  const spins: WheelSpin[] = Array.from({ length: 3 }, (_, index) => {
    const prize = weightedPrize()
    return {
      id: id('spin'),
      prizeId: prize.id,
      animal: prize.animal,
      label: prize.label,
      score: prize.score,
      index: index + 1,
    }
  })
  const run: WheelRun = {
    id: id('run'),
    participant,
    spins,
    totalScore: spins.reduce((sum, spin) => sum + spin.score, 0),
    createdAt: now(),
  }
  state.runs.push(run)
  persist()
  return {
    run: structuredClone(run),
    leaderboard: listLeaderboard({ limit: 20 }),
  }
}

export function listRuns(input: { limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100)
  return structuredClone(
    [...state.runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit),
  )
}

export function listLeaderboard(input: { limit?: number }) {
  const entries = new Map<string, WheelLeaderboardEntry>()
  for (const run of state.runs) {
    const key = run.participant.id || run.participant.displayName
    const existing = entries.get(key)
    if (!existing) {
      entries.set(key, {
        participantId: key,
        displayName: run.participant.displayName,
        avatarUrl: run.participant.avatarUrl,
        totalScore: run.totalScore,
        bestRunScore: run.totalScore,
        rounds: 1,
        lastPlayedAt: run.createdAt,
      })
      continue
    }
    existing.totalScore += run.totalScore
    existing.bestRunScore = Math.max(existing.bestRunScore, run.totalScore)
    existing.rounds += 1
    if (run.createdAt > existing.lastPlayedAt) existing.lastPlayedAt = run.createdAt
  }
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100)
  return structuredClone(
    Array.from(entries.values())
      .sort((a, b) => b.totalScore - a.totalScore || b.bestRunScore - a.bestRunScore)
      .slice(0, limit),
  )
}
