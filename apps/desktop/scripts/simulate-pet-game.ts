import {
  applyPetAction,
  createDefaultPetState,
  levelXpRequirement,
  type PetAction,
  type PetEmotionState,
  type PetState,
  selectPetEmotion,
  tickPet,
} from '../src/renderer/lib/game.ts'

type Scenario = {
  name: string
  days: number
  dailyActions: (
    day: number,
    state: PetState,
    dayStart: number,
  ) => Array<{
    atHour: number
    action: PetAction
  }>
}

type ScenarioResult = {
  name: string
  level: number
  xp: number
  xpToNext: number
  shells: number
  streakDays: number
  resolvedEvents: number
  completedQuests: number
  finalStats: PetState['stats']
  emotionSamples: Record<PetEmotionState, number>
}

const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS
const START = new Date('2026-01-05T00:00:00').getTime()

const scenarios: Scenario[] = [
  {
    name: 'neglect_30d',
    days: 30,
    dailyActions: () => [],
  },
  {
    name: 'light_daily_30d',
    days: 30,
    dailyActions: () => [
      { atHour: 8, action: 'feed' },
      { atHour: 21, action: 'pet' },
    ],
  },
  {
    name: 'balanced_30d',
    days: 30,
    dailyActions: (day, state, dayStart) => {
      const emotion = selectPetEmotion(
        tickPet(state, dayStart + 8 * HOUR_MS),
        dayStart + 8 * HOUR_MS,
      )
      const actions: Array<{ atHour: number; action: PetAction }> = [
        { atHour: 8, action: emotion.state === 'hungry' ? 'feed' : 'pet' },
        { atHour: 12, action: 'feed' },
        { atHour: 15, action: day % 3 === 0 ? 'explore' : 'play' },
        { atHour: 20, action: day % 4 === 0 ? 'tea' : 'rest' },
      ]
      const eventAction = state.game.todayEvent?.action
      if (eventAction && !actions.some((item) => item.action === eventAction)) {
        actions.splice(2, 0, { atHour: 18, action: eventAction })
      }
      return actions
    },
  },
  {
    name: 'pet_spam_30d',
    days: 30,
    dailyActions: () =>
      Array.from({ length: 8 }, (_, index) => ({ atHour: 9 + index, action: 'pet' })),
  },
  {
    name: 'weekend_catchup_30d',
    days: 30,
    dailyActions: (day) => {
      const dayOfWeek = day % 7
      if (dayOfWeek === 5 || dayOfWeek === 6) {
        return [
          { atHour: 9, action: 'feed' },
          { atHour: 11, action: 'play' },
          { atHour: 14, action: 'explore' },
          { atHour: 19, action: 'rest' },
        ]
      }
      return [{ atHour: 21, action: 'pet' }]
    },
  },
]

function runScenario(scenario: Scenario): ScenarioResult {
  let state = createDefaultPetState(START)
  let resolvedEvents = 0
  const emotionSamples = {
    excited: 0,
    content: 0,
    calm: 0,
    lonely: 0,
    hungry: 0,
    sleepy: 0,
    sick: 0,
  } satisfies Record<PetEmotionState, number>

  for (let day = 0; day < scenario.days; day += 1) {
    const dayStart = START + day * DAY_MS
    state = tickPet(state, dayStart + 7 * HOUR_MS)
    emotionSamples[selectPetEmotion(state, dayStart + 7 * HOUR_MS).state] += 1

    const actions = scenario
      .dailyActions(day, state, dayStart)
      .sort((left, right) => left.atHour - right.atHour)
    for (const item of actions) {
      const before = state.game.todayEvent
      state = applyPetAction(state, item.action, dayStart + item.atHour * HOUR_MS)
      const after = state.game.todayEvent
      if (before && after && before.id === after.id && !before.resolved && after.resolved) {
        resolvedEvents += 1
      }
      emotionSamples[selectPetEmotion(state, dayStart + item.atHour * HOUR_MS).state] += 1
    }

    state = tickPet(state, dayStart + 23 * HOUR_MS)
    emotionSamples[selectPetEmotion(state, dayStart + 23 * HOUR_MS).state] += 1
  }

  state = tickPet(state, START + scenario.days * DAY_MS)
  return {
    name: scenario.name,
    level: state.stats.level,
    xp: Math.round(state.stats.xp),
    xpToNext: levelXpRequirement(state.stats.level),
    shells: state.game.shells,
    streakDays: state.game.streakDays,
    resolvedEvents,
    completedQuests: state.game.quests.filter((quest) => quest.completed).length,
    finalStats: {
      ...state.stats,
      mood: Math.round(state.stats.mood),
      hunger: Math.round(state.stats.hunger),
      charm: Math.round(state.stats.charm),
      energy: Math.round(state.stats.energy),
      health: Math.round(state.stats.health),
      loyalty: Math.round(state.stats.loyalty),
      xp: Math.round(state.stats.xp),
    },
    emotionSamples,
  }
}

const results = scenarios.map(runScenario)
console.log(JSON.stringify(results, null, 2))
