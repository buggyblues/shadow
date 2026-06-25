import { resolve } from 'node:path'
import { normalizeShadowServerAppAvatarUrl, type ShadowServerAppActorRef } from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import type {
  Challenge,
  ChallengeDifficulty,
  CodeSubmission,
  Recommendation,
  RecommendationStrategy,
  Report,
  SkillLevel,
  SkillState,
  SubmissionAnalysis,
  SubmissionCoachingFocus,
  SubmissionOutcome,
  SubmissionReviewFocus,
  SubmissionReviewRequest,
  SubmissionStatus,
  Tip,
  TrainerDifficultyMode,
  TrainerLanguage,
  TrainerOverview,
  TrainerOwnerScope,
  TrainerPerson,
  TrainerSettings,
  TrainerState,
  TrainingList,
  TrainingTask,
  TrainingTaskStatus,
  TrainingTaskType,
  UnderstandingCheck,
  WrongProblem,
} from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`
const languages = new Set<TrainerLanguage>(['javascript', 'typescript', 'python'])

const seedTimestamp = '2026-01-01T00:00:00.000Z'

function normalizeShadowAvatarUrl(value: unknown) {
  return normalizeShadowServerAppAvatarUrl(value, process.env)
}

const skillCatalog: Record<string, { label: string; category: string; weakSignal: string }> = {
  array: {
    label: 'Array',
    category: 'Data structure',
    weakSignal: 'Index boundaries and traversal invariants need reinforcement.',
  },
  'hash-map': {
    label: 'Hash Map',
    category: 'Data structure',
    weakSignal: 'Lookup key design or complement tracking is not yet stable.',
  },
  stack: {
    label: 'Stack',
    category: 'Data structure',
    weakSignal: 'Push/pop invariants need more practice.',
  },
  string: {
    label: 'String',
    category: 'Data structure',
    weakSignal: 'Character scanning and normalization need more coverage.',
  },
  sorting: {
    label: 'Sorting',
    category: 'Technique',
    weakSignal: 'Ordering preconditions and post-sort scans need reinforcement.',
  },
}

const seedChallenges: Challenge[] = [
  {
    id: 'two_sum',
    title: 'Two Sum',
    difficulty: 'easy',
    tags: ['array', 'hash-map'],
    prompt:
      'Return indices of the two numbers such that they add up to the target. Each input has exactly one solution.',
    starterCode: 'function twoSum(nums, target) {\n  // Write your solution here.\n}',
    examples: [
      { input: 'nums = [2,7,11,15], target = 9', output: '[0,1]' },
      { input: 'nums = [3,2,4], target = 6', output: '[1,2]' },
    ],
    judgeInstructions:
      'Analyze twoSum(nums, target) against visible and hidden array cases. Award full credit only when returned indices are valid and distinct.',
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp,
  },
  {
    id: 'valid_parentheses',
    title: 'Valid Parentheses',
    difficulty: 'easy',
    tags: ['stack', 'string'],
    prompt:
      'Given a string containing brackets, determine if every opening bracket is closed in the correct order.',
    starterCode: 'function isValid(s) {\n  // Write your solution here.\n}',
    examples: [
      { input: 's = "()"', output: 'true' },
      { input: 's = "([)]"', output: 'false' },
    ],
    judgeInstructions:
      'Analyze isValid(s) with simple, nested, mismatched, and empty inputs. Check boolean output exactly and explain the stack invariant.',
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp,
  },
  {
    id: 'merge_intervals',
    title: 'Merge Intervals',
    difficulty: 'medium',
    tags: ['array', 'sorting'],
    prompt:
      'Merge all overlapping intervals and return a list of non-overlapping intervals sorted by start time.',
    starterCode: 'function merge(intervals) {\n  // Write your solution here.\n}',
    examples: [
      { input: 'intervals = [[1,3],[2,6],[8,10],[15,18]]', output: '[[1,6],[8,10],[15,18]]' },
      { input: 'intervals = [[1,4],[4,5]]', output: '[[1,5]]' },
    ],
    judgeInstructions:
      'Analyze merge(intervals) with sorted, unsorted, touching, nested, and disjoint intervals. Compare normalized interval arrays and comment on sort complexity.',
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp,
  },
]

const seedChallengeIds = new Set(seedChallenges.map((challenge) => challenge.id))
const legacyOwner: TrainerOwnerScope = {
  ownerKey: process.env.TRAINER_LEGACY_OWNER_KEY ?? 'local:local',
  serverId: process.env.TRAINER_LEGACY_SERVER_ID ?? 'local',
  userId: process.env.TRAINER_LEGACY_USER_ID ?? 'local',
}

export type TrainerAccess = {
  serverId: string
  ownerKey: string
  ownerUserId: string
  buddyAgentId: string | null
  isBuddy: boolean
  actor: TrainerPerson
}

type ChallengeInput = {
  id?: string
  title: string
  difficulty: ChallengeDifficulty
  tags?: string[]
  prompt: string
  starterCode: string
  examples?: Challenge['examples']
  testCases?: Challenge['testCases']
  judgeInstructions: string
  source?: Challenge['source']
}

type SubmissionReviewerInput = {
  agentId?: string
  assigneeLabel?: string
  displayName?: string
  reviewFocus?: SubmissionReviewFocus
  coachingFocuses?: SubmissionCoachingFocus[]
  locale?: string
}

type TrainingListInput = {
  id?: string
  title: string
  horizon?: TrainingList['horizon']
  goal?: string
  tasks?: Array<Partial<TrainingTask> & Pick<TrainingTask, 'title' | 'type' | 'reason'>>
}

type SkillStateInput = {
  id: string
  label?: string
  category?: string
  level?: SkillLevel
  mastery?: number
  attempts?: number
  accepted?: number
  weakSignals?: string[]
}

type RecommendationInput = {
  kind?: Recommendation['kind']
  challengeId: string
  reason: string
  priority?: number
  strategy?: RecommendationStrategy
  predictedAckRate?: number
  appPath?: string
}

type TipInput = {
  title: string
  body: string
  tags?: string[]
}

type CheckInput = {
  challengeId?: string
  question: string
  choices: string[]
  answerIndex: number
  explanation: string
  tags?: string[]
}

type ReportInput = {
  period?: Report['period']
  title: string
  summary: string
  signals?: string[]
}

type WrongProblemInput = {
  challengeId: string
  lastSubmissionId?: string
  reason: string
  nextReviewAt?: string
}

type TrainerSettingsInput = {
  difficultyMode?: TrainerDifficultyMode
  targetProblems?: number
  deadlineAt?: string
}

type StoredPerson = Partial<TrainerPerson> & {
  profile?: {
    id?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  }
}

type StoredSubmission = Omit<Partial<CodeSubmission>, 'status'> & {
  status?: SubmissionStatus | 'judged'
  verdict?: string
  score?: number
  feedback?: string
  suggestions?: string[]
  grader?: StoredPerson
  judgedAt?: string
}

function defaultState(): TrainerState {
  return {
    updatedAt: now(),
    challenges: structuredClone(seedChallenges),
    submissions: [],
    skills: [],
    trainingLists: [],
    recommendations: [],
    tips: [],
    checks: [],
    wrongProblems: [],
    reports: [],
    settings: [],
  }
}

function dataFilePath() {
  return resolve(process.env.TRAINER_DATA_FILE ?? './data/trainer.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isState(value: unknown): value is TrainerState {
  return isRecord(value) && Array.isArray(value.submissions)
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || id('challenge')
}

function normalizeDifficulty(value: unknown): ChallengeDifficulty {
  return value === 'medium' || value === 'hard' ? value : 'easy'
}

function normalizeLanguage(value: unknown): TrainerLanguage | string {
  const language = text(value, 'javascript').toLowerCase()
  return languages.has(language as TrainerLanguage) ? (language as TrainerLanguage) : language
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => text(item))
    .filter(Boolean)
    .slice(0, 12)
}

function normalizeTextList(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => text(item))
    .filter(Boolean)
    .slice(0, limit)
}

function skillIdFromTag(tag: string) {
  return slugify(tag).replace(/_/g, '-')
}

function displaySkillLabel(tag: string) {
  const id = skillIdFromTag(tag)
  return (
    skillCatalog[id]?.label ??
    tag
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(' ')
  )
}

function skillCategory(tag: string) {
  return skillCatalog[skillIdFromTag(tag)]?.category ?? 'Algorithm skill'
}

function weakSignalForTag(tag: string) {
  const id = skillIdFromTag(tag)
  return skillCatalog[id]?.weakSignal ?? `${displaySkillLabel(tag)} needs more targeted practice.`
}

function uniqueText(values: string[], limit = 8) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit)
}

function normalizeExamples(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!isRecord(item)) return null
      const input = text(item.input)
      const output = text(item.output)
      if (!input || !output) return null
      const explanation = text(item.explanation)
      return explanation ? { input, output, explanation } : { input, output }
    })
    .filter((item): item is Challenge['examples'][number] => !!item)
    .slice(0, 20)
}

function normalizeTestCases(value: unknown): Challenge['testCases'] {
  if (!Array.isArray(value)) return []
  return value
    .map((item, index) => {
      if (!isRecord(item)) return null
      const input = text(item.input)
      const expected = text(item.expected)
      if (!input || !expected) return null
      return {
        id: text(item.id, `case_${index + 1}`),
        ...(text(item.description) ? { description: text(item.description) } : {}),
        input,
        expected,
        visibility: item.visibility === 'hidden' ? 'hidden' : 'visible',
      } satisfies NonNullable<Challenge['testCases']>[number]
    })
    .filter((item): item is NonNullable<Challenge['testCases']>[number] => !!item)
    .slice(0, 80)
}

function normalizeSource(value: unknown): Challenge['source'] | undefined {
  if (!isRecord(value)) return undefined
  const provider =
    value.provider === 'exercism' ||
    value.provider === 'leetcode' ||
    value.provider === 'codeforces' ||
    value.provider === 'manual'
      ? value.provider
      : 'seed'
  const sourceId = text(value.id)
  if (!sourceId) return undefined
  return {
    provider,
    id: sourceId,
    ...(text(value.url) ? { url: text(value.url) } : {}),
    ...(text(value.importedAt) ? { importedAt: text(value.importedAt) } : {}),
  }
}

function starterWithoutSeedAnswer(challengeId: string, starterCode: string) {
  const seed = seedChallenges.find((challenge) => challenge.id === challengeId)
  if (!seed) return starterCode
  const oldSeedSolutionMarkers = ['seen = new Map', 'stack.pop()', 'intervals.sort']
  return oldSeedSolutionMarkers.some((marker) => starterCode.includes(marker))
    ? seed.starterCode
    : starterCode
}

function challengeIdTaken(candidate: string, ownerKey: string) {
  return state.challenges.some((challenge) => {
    if (challenge.id !== candidate) return false
    return isGlobalChallenge(challenge) || ownerKeyOf(challenge) === ownerKey
  })
}

function uniqueChallengeId(base: string, ownerKey: string) {
  let candidate = slugify(base)
  let index = 2
  while (challengeIdTaken(candidate, ownerKey)) {
    candidate = `${slugify(base)}_${index}`
    index += 1
  }
  return candidate
}

function normalizePerson(value: unknown, fallbackName = 'Unknown') {
  const source = isRecord(value) ? (value as StoredPerson) : {}
  const profile = isRecord(source.profile) ? source.profile : {}
  const personId = text(source.id ?? source.userId ?? profile.id, 'unknown')

  return {
    kind: text(source.kind, 'unknown'),
    id: personId,
    userId: text(source.userId) || null,
    buddyAgentId: text(source.buddyAgentId) || null,
    ownerId: text(source.ownerId) || null,
    displayName: text(source.displayName ?? profile.displayName, fallbackName),
    avatarUrl:
      normalizeShadowAvatarUrl(source.avatarUrl) ?? normalizeShadowAvatarUrl(profile.avatarUrl),
  } satisfies TrainerPerson
}

function person(actor: ShadowServerAppActorRef): TrainerPerson {
  return normalizePerson(actor, 'Local Coder')
}

export function accessFromActor(input: {
  serverId: string
  actor: ShadowServerAppActorRef
}): TrainerAccess {
  const actor = person(input.actor)
  const serverId = text(input.serverId, 'local') || 'local'
  const ownerUserId = actor.ownerId || actor.userId || actor.id || 'local'
  const buddyAgentId = actor.buddyAgentId || null
  const isBuddy = Boolean(buddyAgentId || actor.kind === 'agent')
  return {
    serverId,
    ownerKey: `${serverId}:${ownerUserId}`,
    ownerUserId,
    buddyAgentId,
    isBuddy,
    actor,
  }
}

function ownerFromAccess(access: TrainerAccess): TrainerOwnerScope {
  return {
    ownerKey: access.ownerKey,
    serverId: access.serverId,
    userId: access.ownerUserId,
  }
}

function normalizeOwnerScope(value: unknown): TrainerOwnerScope | undefined {
  if (!isRecord(value)) return undefined
  const ownerKey = text(value.ownerKey)
  const serverId = text(value.serverId)
  const userId = text(value.userId)
  if (!ownerKey || !serverId || !userId) return undefined
  return { ownerKey, serverId, userId }
}

function ownerKeyOf(challenge: Challenge) {
  return challenge.owner?.ownerKey ?? null
}

function isGlobalChallenge(challenge: Challenge) {
  return !challenge.owner && seedChallengeIds.has(challenge.id)
}

function canReadChallenge(challenge: Challenge, access: TrainerAccess) {
  return isGlobalChallenge(challenge) || ownerKeyOf(challenge) === access.ownerKey
}

function canReadSubmission(submission: CodeSubmission, access: TrainerAccess) {
  if (submission.owner.ownerKey !== access.ownerKey) return false
  if (!access.isBuddy) return true
  const assignedBuddyId = submission.reviewRequest?.agentId
  return Boolean(assignedBuddyId && assignedBuddyId === access.buddyAgentId)
}

function normalizeChallenge(value: unknown): Challenge | null {
  if (!isRecord(value)) return null
  const title = text(value.title)
  const prompt = text(value.prompt)
  const starterCode = text(value.starterCode)
  const judgeInstructions = text(value.judgeInstructions)
  if (!title || !prompt || !starterCode || !judgeInstructions) return null
  const timestamp = text(value.updatedAt, now())
  const source = normalizeSource(value.source)
  const challengeId = text(value.id, slugify(title))
  const owner =
    normalizeOwnerScope(value.owner) ??
    (seedChallengeIds.has(challengeId) ? undefined : legacyOwner)

  return {
    id: challengeId,
    title,
    difficulty: normalizeDifficulty(value.difficulty),
    tags: normalizeTags(value.tags),
    prompt,
    starterCode: starterWithoutSeedAnswer(challengeId, starterCode),
    examples: normalizeExamples(value.examples),
    testCases: normalizeTestCases(value.testCases),
    judgeInstructions,
    ...(source ? { source } : {}),
    ...(owner ? { owner } : {}),
    createdAt: text(value.createdAt, timestamp),
    updatedAt: timestamp,
  }
}

function normalizeAnalysis(
  value: unknown,
  legacy: StoredSubmission,
): SubmissionAnalysis | undefined {
  if (isRecord(value)) {
    const summary = text(value.summary)
    const explanation = text(value.explanation)
    if (summary || explanation) {
      return {
        outcome: normalizeOutcome(value.outcome),
        score: clampScore(value.score),
        summary: summary || explanation,
        explanation: explanation || summary,
        suggestions: normalizeSuggestions(value.suggestions),
        complexity: text(value.complexity) || undefined,
        analyzer: normalizePerson(value.analyzer, 'Buddy'),
        analyzedAt: text(value.analyzedAt, now()),
      }
    }
  }

  if (!legacy.verdict && !legacy.feedback) return undefined
  const feedback = text(legacy.feedback, 'Imported analysis from an earlier review.')
  return {
    outcome: legacyVerdictToOutcome(legacy.verdict),
    score: clampScore(legacy.score),
    summary: feedback,
    explanation: feedback,
    suggestions: normalizeSuggestions(legacy.suggestions),
    analyzer: normalizePerson(legacy.grader, 'Reviewer'),
    analyzedAt: text(legacy.judgedAt, now()),
  }
}

function normalizeReviewRequest(value: unknown): SubmissionReviewRequest | undefined {
  if (!isRecord(value)) return undefined
  const agentId = text(value.agentId)
  const assigneeLabel = text(value.assigneeLabel)
  if (!agentId && !assigneeLabel) return undefined

  return {
    ...(agentId ? { agentId } : {}),
    ...(assigneeLabel ? { assigneeLabel } : {}),
    ...(text(value.displayName) ? { displayName: text(value.displayName) } : {}),
    reviewFocus: normalizeReviewFocus(value.reviewFocus),
    coachingFocuses: normalizeCoachingFocuses(value.coachingFocuses),
    ...(normalizeLocale(value.locale) ? { locale: normalizeLocale(value.locale) } : {}),
    requestedAt: text(value.requestedAt, now()),
  }
}

function reviewRequestFromInput(
  reviewer: SubmissionReviewerInput | undefined,
  requestedAt: string,
): SubmissionReviewRequest | undefined {
  if (!reviewer) return undefined
  const agentId = text(reviewer.agentId)
  const assigneeLabel = text(reviewer.assigneeLabel)
  if (!agentId && !assigneeLabel) return undefined

  return {
    ...(agentId ? { agentId } : {}),
    ...(assigneeLabel ? { assigneeLabel } : {}),
    ...(text(reviewer.displayName) ? { displayName: text(reviewer.displayName) } : {}),
    reviewFocus: normalizeReviewFocus(reviewer.reviewFocus),
    coachingFocuses: normalizeCoachingFocuses(reviewer.coachingFocuses),
    ...(normalizeLocale(reviewer.locale) ? { locale: normalizeLocale(reviewer.locale) } : {}),
    requestedAt,
  }
}

function normalizeReviewFocus(value: unknown): SubmissionReviewFocus {
  if (value === 'interview' || value === 'debug' || value === 'complexity') return value
  return 'standard'
}

function normalizeCoachingFocuses(value: unknown): SubmissionCoachingFocus[] {
  if (!Array.isArray(value)) return []
  const allowed = new Set<SubmissionCoachingFocus>([
    'reasoning',
    'edge_cases',
    'complexity',
    'communication',
    'follow_ups',
    'debugging',
  ])
  return [
    ...new Set(value.filter((item): item is SubmissionCoachingFocus => allowed.has(item))),
  ].slice(0, 8)
}

function normalizeLocale(value: unknown) {
  return text(value).slice(0, 32)
}

function normalizeOutcome(value: unknown): SubmissionOutcome {
  if (
    value === 'accepted' ||
    value === 'needs_work' ||
    value === 'runtime_error' ||
    value === 'incomplete'
  ) {
    return value
  }
  return 'incomplete'
}

function legacyVerdictToOutcome(value: unknown): SubmissionOutcome {
  if (value === 'accepted') return 'accepted'
  if (value === 'wrong_answer' || value === 'needs_review') return 'needs_work'
  if (value === 'runtime_error') return 'runtime_error'
  return 'incomplete'
}

function normalizeSuggestions(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => text(item))
    .filter(Boolean)
    .slice(0, 12)
}

function clampScore(value: unknown) {
  const score = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return Math.max(0, Math.min(100, Math.round(score)))
}

function normalizeSubmission(value: unknown): CodeSubmission | null {
  if (!isRecord(value)) return null
  const stored = value as StoredSubmission
  const submissionId = text(stored.id)
  const challengeId = text(stored.challengeId)
  const code = text(stored.code)
  if (!submissionId || !challengeId || !code) return null

  const analysis = normalizeAnalysis(stored.analysis, stored)
  const reviewRequest = normalizeReviewRequest(stored.reviewRequest)
  const owner = normalizeOwnerScope(stored.owner) ?? legacyOwner
  const status: SubmissionStatus =
    stored.status === 'analyzed' || stored.status === 'judged' || analysis
      ? 'analyzed'
      : 'submitted'

  return {
    id: submissionId,
    challengeId,
    owner,
    author: normalizePerson(stored.author, 'Learner'),
    language: normalizeLanguage(stored.language),
    code,
    status,
    ...(reviewRequest ? { reviewRequest } : {}),
    analysis,
    createdAt: text(stored.createdAt, now()),
  }
}

function normalizeSkillLevel(value: unknown): SkillLevel {
  if (value === 'learning' || value === 'stable' || value === 'strong') return value
  return 'new'
}

function normalizeTaskType(value: unknown): TrainingTaskType {
  if (value === 'review' || value === 'check' || value === 'tip') return value
  return 'problem'
}

function normalizeTaskStatus(value: unknown): TrainingTaskStatus {
  if (value === 'doing' || value === 'done') return value
  return 'todo'
}

function normalizeHorizon(value: unknown): TrainingList['horizon'] {
  if (value === 'weekly' || value === 'stage') return value
  return 'daily'
}

function normalizeRecommendationKind(value: unknown): Recommendation['kind'] {
  if (value === 'wrong_variant' || value === 'review' || value === 'special_training') {
    return value
  }
  return 'next_problem'
}

function normalizeRecommendationStrategy(value: unknown): RecommendationStrategy {
  if (value === 'diversify' || value === 'review' || value === 'popular') return value
  return 'reinforce'
}

function normalizeDifficultyMode(value: unknown): TrainerDifficultyMode {
  if (value === 'easy' || value === 'hard' || value === 'hell') return value
  return 'medium'
}

function normalizeReportPeriod(value: unknown): Report['period'] {
  if (value === 'weekly' || value === 'stage') return value
  return 'daily'
}

function normalizeSkill(value: unknown): SkillState | null {
  if (!isRecord(value)) return null
  const owner = normalizeOwnerScope(value.owner)
  const skillId = text(value.id)
  if (!owner || !skillId) return null
  return {
    id: skillIdFromTag(skillId),
    owner,
    label: text(value.label, displaySkillLabel(skillId)),
    category: text(value.category, skillCategory(skillId)),
    level: normalizeSkillLevel(value.level),
    mastery: clampScore(value.mastery),
    attempts: Math.max(0, Math.round(typeof value.attempts === 'number' ? value.attempts : 0)),
    accepted: Math.max(0, Math.round(typeof value.accepted === 'number' ? value.accepted : 0)),
    weakSignals: normalizeTextList(value.weakSignals, 8),
    ...(text(value.lastPracticedAt) ? { lastPracticedAt: text(value.lastPracticedAt) } : {}),
    updatedAt: text(value.updatedAt, now()),
  }
}

function normalizeTrainingTask(value: unknown): TrainingTask | null {
  if (!isRecord(value)) return null
  const title = text(value.title)
  const reason = text(value.reason)
  if (!title || !reason) return null
  return {
    id: text(value.id, id('task')),
    type: normalizeTaskType(value.type),
    title,
    status: normalizeTaskStatus(value.status),
    ...(text(value.challengeId) ? { challengeId: text(value.challengeId) } : {}),
    ...(text(value.challengeTitle) ? { challengeTitle: text(value.challengeTitle) } : {}),
    reason,
    ...(text(value.dueAt) ? { dueAt: text(value.dueAt) } : {}),
  }
}

function normalizeTrainingList(value: unknown): TrainingList | null {
  if (!isRecord(value)) return null
  const owner = normalizeOwnerScope(value.owner)
  const title = text(value.title)
  if (!owner || !title) return null
  return {
    id: text(value.id, id('list')),
    owner,
    title,
    horizon: normalizeHorizon(value.horizon),
    goal: text(value.goal, 'Keep the current algorithm training loop moving.'),
    tasks: Array.isArray(value.tasks)
      ? value.tasks
          .map((task) => normalizeTrainingTask(task))
          .filter((task): task is TrainingTask => !!task)
          .slice(0, 24)
      : [],
    updatedAt: text(value.updatedAt, now()),
  }
}

function normalizeRecommendation(value: unknown): Recommendation | null {
  if (!isRecord(value)) return null
  const owner = normalizeOwnerScope(value.owner)
  const challengeId = text(value.challengeId)
  const challengeTitle = text(value.challengeTitle)
  const reason = text(value.reason)
  if (!owner || !challengeId || !challengeTitle || !reason) return null
  return {
    id: text(value.id, id('rec')),
    owner,
    kind: normalizeRecommendationKind(value.kind),
    strategy: normalizeRecommendationStrategy(value.strategy),
    challengeId,
    challengeTitle,
    difficulty: normalizeDifficulty(value.difficulty),
    tags: normalizeTags(value.tags),
    reason,
    priority: Math.max(0, Math.round(typeof value.priority === 'number' ? value.priority : 50)),
    predictedAckRate:
      typeof value.predictedAckRate === 'number'
        ? Math.max(0, Math.min(100, Math.round(value.predictedAckRate)))
        : undefined,
    ...(text(value.appPath) ? { appPath: text(value.appPath) } : {}),
    ...(isRecord(value.source)
      ? {
          source: {
            provider: value.source.provider === 'codeforces' ? 'codeforces' : 'leetcode',
            query: text(value.source.query),
            reason: text(value.source.reason, 'External source search'),
          },
        }
      : {}),
    createdAt: text(value.createdAt, now()),
  }
}

function normalizeTip(value: unknown): Tip | null {
  if (!isRecord(value)) return null
  const owner = normalizeOwnerScope(value.owner)
  const title = text(value.title)
  const body = text(value.body)
  if (!owner || !title || !body) return null
  return {
    id: text(value.id, id('tip')),
    owner,
    title,
    body,
    tags: normalizeTags(value.tags),
    createdAt: text(value.createdAt, now()),
  }
}

function normalizeCheck(value: unknown): UnderstandingCheck | null {
  if (!isRecord(value)) return null
  const owner = normalizeOwnerScope(value.owner)
  const question = text(value.question)
  const explanation = text(value.explanation)
  const choices = normalizeTextList(value.choices, 6)
  if (!owner || !question || !explanation || choices.length < 2) return null
  const answerIndex =
    typeof value.answerIndex === 'number' && Number.isInteger(value.answerIndex)
      ? value.answerIndex
      : 0
  return {
    id: text(value.id, id('check')),
    owner,
    ...(text(value.challengeId) ? { challengeId: text(value.challengeId) } : {}),
    question,
    choices,
    answerIndex: Math.max(0, Math.min(choices.length - 1, answerIndex)),
    explanation,
    tags: normalizeTags(value.tags),
    createdAt: text(value.createdAt, now()),
  }
}

function normalizeWrongProblem(value: unknown): WrongProblem | null {
  if (!isRecord(value)) return null
  const owner = normalizeOwnerScope(value.owner)
  const challengeId = text(value.challengeId)
  const challengeTitle = text(value.challengeTitle)
  const lastSubmissionId = text(value.lastSubmissionId)
  const reason = text(value.reason)
  if (!owner || !challengeId || !challengeTitle || !lastSubmissionId || !reason) return null
  return {
    owner,
    challengeId,
    challengeTitle,
    tags: normalizeTags(value.tags),
    lastSubmissionId,
    reason,
    reviewCount: Math.max(
      0,
      Math.round(typeof value.reviewCount === 'number' ? value.reviewCount : 0),
    ),
    nextReviewAt: text(value.nextReviewAt, now()),
    updatedAt: text(value.updatedAt, now()),
  }
}

function normalizeReport(value: unknown): Report | null {
  if (!isRecord(value)) return null
  const owner = normalizeOwnerScope(value.owner)
  const title = text(value.title)
  const summary = text(value.summary)
  if (!owner || !title || !summary) return null
  return {
    id: text(value.id, id('report')),
    owner,
    period: normalizeReportPeriod(value.period),
    title,
    summary,
    signals: normalizeTextList(value.signals, 12),
    createdAt: text(value.createdAt, now()),
  }
}

function normalizeSettings(value: unknown): TrainerSettings | null {
  if (!isRecord(value)) return null
  const owner = normalizeOwnerScope(value.owner)
  if (!owner) return null
  const targetProblems =
    typeof value.targetProblems === 'number' && Number.isFinite(value.targetProblems)
      ? Math.max(1, Math.min(999, Math.round(value.targetProblems)))
      : undefined
  return {
    owner,
    difficultyMode: normalizeDifficultyMode(value.difficultyMode),
    ...(targetProblems ? { targetProblems } : {}),
    ...(text(value.deadlineAt) ? { deadlineAt: text(value.deadlineAt) } : {}),
    updatedAt: text(value.updatedAt, now()),
  }
}

function normalizeState(value: unknown): TrainerState {
  const fallback = defaultState()
  if (!isRecord(value)) return fallback

  const challenges = Array.isArray(value.challenges)
    ? value.challenges
        .map((challenge) => normalizeChallenge(challenge))
        .filter((challenge): challenge is Challenge => !!challenge)
    : structuredClone(seedChallenges)

  const submissions = Array.isArray(value.submissions)
    ? value.submissions
        .map((submission) => normalizeSubmission(submission))
        .filter((submission): submission is CodeSubmission => !!submission)
    : []

  return {
    updatedAt: text(value.updatedAt, fallback.updatedAt),
    challenges: challenges.length ? challenges : structuredClone(seedChallenges),
    submissions,
    skills: Array.isArray(value.skills)
      ? value.skills.map(normalizeSkill).filter((item): item is SkillState => !!item)
      : [],
    trainingLists: Array.isArray(value.trainingLists)
      ? value.trainingLists
          .map(normalizeTrainingList)
          .filter((item): item is TrainingList => !!item)
      : [],
    recommendations: Array.isArray(value.recommendations)
      ? value.recommendations
          .map(normalizeRecommendation)
          .filter((item): item is Recommendation => !!item)
      : [],
    tips: Array.isArray(value.tips)
      ? value.tips.map(normalizeTip).filter((item): item is Tip => !!item)
      : [],
    checks: Array.isArray(value.checks)
      ? value.checks.map(normalizeCheck).filter((item): item is UnderstandingCheck => !!item)
      : [],
    wrongProblems: Array.isArray(value.wrongProblems)
      ? value.wrongProblems
          .map(normalizeWrongProblem)
          .filter((item): item is WrongProblem => !!item)
      : [],
    reports: Array.isArray(value.reports)
      ? value.reports.map(normalizeReport).filter((item): item is Report => !!item)
      : [],
    settings: Array.isArray(value.settings)
      ? value.settings.map(normalizeSettings).filter((item): item is TrainerSettings => !!item)
      : [],
  }
}

const stateStore = createShadowServerAppJsonStore<TrainerState>({
  filePath: dataFilePath(),
  defaultValue: defaultState,
  validate: isState,
})

let state = stateStore.write(normalizeState(stateStore.read()))

function persist() {
  state.updatedAt = now()
  state = stateStore.write(state)
}

function ownerMatches<T extends { owner: TrainerOwnerScope }>(item: T, access: TrainerAccess) {
  return item.owner.ownerKey === access.ownerKey
}

function challengeForSubmission(submission: CodeSubmission) {
  return (
    state.challenges.find(
      (item) =>
        item.id === submission.challengeId && ownerKeyOf(item) === submission.owner.ownerKey,
    ) ??
    state.challenges.find((item) => item.id === submission.challengeId && isGlobalChallenge(item))
  )
}

function acceptedSubmission(submission: CodeSubmission) {
  return submission.analysis?.outcome === 'accepted'
}

function skillLevel(mastery: number): SkillLevel {
  if (mastery >= 85) return 'strong'
  if (mastery >= 65) return 'stable'
  if (mastery >= 30) return 'learning'
  return 'new'
}

function addDays(value: string, days: number) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

function settingsForOwner(owner: TrainerOwnerScope): TrainerSettings {
  const existing = state.settings.find((item) => item.owner.ownerKey === owner.ownerKey)
  return (
    existing ?? {
      owner,
      difficultyMode: 'medium',
      updatedAt: now(),
    }
  )
}

function upsertSkillFromTag(
  owner: TrainerOwnerScope,
  tag: string,
  outcome: SubmissionOutcome,
  timestamp: string,
) {
  const skillId = skillIdFromTag(tag)
  const existing = state.skills.find(
    (item) => item.owner.ownerKey === owner.ownerKey && item.id === skillId,
  )
  const accepted = outcome === 'accepted'
  const attempts = (existing?.attempts ?? 0) + 1
  const acceptedCount = (existing?.accepted ?? 0) + (accepted ? 1 : 0)
  const delta = accepted ? 18 : outcome === 'runtime_error' ? -14 : -9
  const mastery = Math.max(0, Math.min(100, (existing?.mastery ?? 20) + delta))
  const weakSignals = accepted
    ? (existing?.weakSignals ?? []).filter((signal) => signal !== weakSignalForTag(tag))
    : uniqueText([weakSignalForTag(tag), ...(existing?.weakSignals ?? [])], 8)
  const next: SkillState = {
    id: skillId,
    owner,
    label: existing?.label ?? displaySkillLabel(tag),
    category: existing?.category ?? skillCategory(tag),
    level: skillLevel(mastery),
    mastery,
    attempts,
    accepted: acceptedCount,
    weakSignals,
    lastPracticedAt: timestamp,
    updatedAt: timestamp,
  }

  if (existing) {
    state.skills = state.skills.map((item) =>
      item.owner.ownerKey === owner.ownerKey && item.id === skillId ? next : item,
    )
  } else {
    state.skills.push(next)
  }
}

function recommendationReason(
  challenge: Challenge,
  weakTags: string[],
  strategy: RecommendationStrategy = 'reinforce',
  predictedAckRate?: number,
) {
  const ackText = typeof predictedAckRate === 'number' ? ` Estimated ACK ${predictedAckRate}%.` : ''
  if (strategy === 'diversify') {
    return `Switch topics to avoid overfitting one pattern: ${challenge.tags.join(', ') || challenge.difficulty}.${ackText}`
  }
  if (strategy === 'review') {
    return `Spaced review is due; retry this problem before the memory trace fades.${ackText}`
  }
  if (strategy === 'popular') {
    return `Topic coverage is high, so move to a popular external-style problem to avoid blind spots.${ackText}`
  }
  const overlap = challenge.tags.filter((tag) => weakTags.includes(skillIdFromTag(tag)))
  if (overlap.length) {
    return `Reinforces ${overlap.map(displaySkillLabel).join(', ')} after recent review signals.${ackText}`
  }
  return `Good next step at ${challenge.difficulty} difficulty with ${challenge.tags.join(', ') || 'general'} practice.${ackText}`
}

function ownerChallenges(owner: TrainerOwnerScope) {
  return state.challenges.filter(
    (challenge) => isGlobalChallenge(challenge) || ownerKeyOf(challenge) === owner.ownerKey,
  )
}

function submissionsForOwner(owner: TrainerOwnerScope) {
  return state.submissions.filter((submission) => submission.owner.ownerKey === owner.ownerKey)
}

function attemptedChallengeIds(owner: TrainerOwnerScope) {
  const attempted = new Set(submissionsForOwner(owner).map((submission) => submission.challengeId))
  return attempted
}

function recentAcceptedRate(owner: TrainerOwnerScope) {
  const analyzed = submissionsForOwner(owner)
    .filter((submission) => submission.status === 'analyzed')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12)
  if (analyzed.length === 0) return 50
  const accepted = analyzed.filter(acceptedSubmission).length
  return Math.round((accepted / analyzed.length) * 100)
}

function averageTagMastery(owner: TrainerOwnerScope, tags: string[]) {
  if (tags.length === 0) return 45
  const skills = tags.map((tag) =>
    state.skills.find(
      (skill) => skill.owner.ownerKey === owner.ownerKey && skill.id === skillIdFromTag(tag),
    ),
  )
  const values = skills.map((skill) => skill?.mastery ?? 35)
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function predictedAckRate(owner: TrainerOwnerScope, challenge: Challenge) {
  const base = challenge.difficulty === 'easy' ? 76 : challenge.difficulty === 'medium' ? 48 : 18
  const mastery = averageTagMastery(owner, challenge.tags)
  const recent = recentAcceptedRate(owner)
  const seenProviderPenalty = challenge.source?.provider === 'codeforces' ? -6 : 0
  return Math.max(
    1,
    Math.min(
      95,
      Math.round(base + (mastery - 45) * 0.55 + (recent - 50) * 0.2 + seenProviderPenalty),
    ),
  )
}

function targetAckRange(mode: TrainerDifficultyMode) {
  if (mode === 'easy') return { min: 75, max: 100 }
  if (mode === 'hard') return { min: 5, max: 20 }
  if (mode === 'hell') return { min: 0, max: 5 }
  return { min: 20, max: 75 }
}

function targetDistance(rate: number, mode: TrainerDifficultyMode) {
  const range = targetAckRange(mode)
  if (rate >= range.min && rate <= range.max) return 0
  return rate < range.min ? range.min - rate : rate - range.max
}

function recentDominantTag(owner: TrainerOwnerScope) {
  const challengeById = new Map(
    ownerChallenges(owner).map((challenge) => [challenge.id, challenge]),
  )
  const recentTags = submissionsForOwner(owner)
    .filter(acceptedSubmission)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)
    .map((submission) => challengeById.get(submission.challengeId)?.tags[0])
    .filter((tag): tag is string => Boolean(tag))
  if (recentTags.length < 2) return null
  return recentTags.every((tag) => tag === recentTags[0]) ? recentTags[0] : null
}

function topicCoverage(owner: TrainerOwnerScope, tags: string[]) {
  const candidates = ownerChallenges(owner).filter((challenge) =>
    challenge.tags.some((tag) => tags.includes(tag)),
  )
  if (candidates.length === 0) return 0
  const accepted = new Set(
    submissionsForOwner(owner)
      .filter(acceptedSubmission)
      .map((submission) => submission.challengeId),
  )
  return candidates.filter((challenge) => accepted.has(challenge.id)).length / candidates.length
}

function externalSourceHint(challenge: Challenge, strategy: RecommendationStrategy) {
  const primaryTag = challenge.tags.find(
    (tag) => !['leetcode', 'codeforces', 'imported'].includes(tag),
  )
  const query = strategy === 'popular' ? 'top interview' : primaryTag || challenge.title
  return {
    provider: 'leetcode' as const,
    query,
    reason:
      strategy === 'popular'
        ? 'Search LeetCode popular interview problems after local topic coverage is high.'
        : `Search imported variants around ${query}.`,
  }
}

function nextChallengeForOwner(owner: TrainerOwnerScope) {
  const attempted = attemptedChallengeIds(owner)
  const weakTags = state.skills
    .filter((skill) => skill.owner.ownerKey === owner.ownerKey && skill.level !== 'strong')
    .map((skill) => skill.id)
  const settings = settingsForOwner(owner)
  const candidates = ownerChallenges(owner).filter((challenge) => !attempted.has(challenge.id))
  const dominantTag = recentDominantTag(owner)
  const strategy: RecommendationStrategy = state.wrongProblems.some(
    (item) => item.owner.ownerKey === owner.ownerKey && new Date(item.nextReviewAt) <= new Date(),
  )
    ? 'review'
    : dominantTag
      ? 'diversify'
      : weakTags.length
        ? 'reinforce'
        : 'popular'
  const scored = candidates
    .filter((challenge) =>
      strategy === 'diversify'
        ? !dominantTag || !challenge.tags.includes(dominantTag)
        : strategy === 'reinforce'
          ? challenge.tags.some((tag) => weakTags.includes(skillIdFromTag(tag)))
          : true,
    )
    .map((challenge) => {
      const ack = predictedAckRate(owner, challenge)
      const overlap = challenge.tags.filter((tag) => weakTags.includes(skillIdFromTag(tag))).length
      return {
        challenge,
        ack,
        score:
          100 -
          targetDistance(ack, settings.difficultyMode) * 2 +
          overlap * 8 +
          (challenge.source?.provider === 'leetcode' ? 4 : 0),
      }
    })
    .sort((a, b) => b.score - a.score)

  const fallback = candidates
    .map((challenge) => ({ challenge, ack: predictedAckRate(owner, challenge), score: 0 }))
    .sort(
      (a, b) =>
        targetDistance(a.ack, settings.difficultyMode) -
        targetDistance(b.ack, settings.difficultyMode),
    )[0]
  const picked = scored[0] ?? fallback
  if (!picked) return null
  const coverage = topicCoverage(owner, picked.challenge.tags)
  const finalStrategy: RecommendationStrategy = coverage >= 0.75 ? 'popular' : strategy
  return {
    challenge: picked.challenge,
    strategy: finalStrategy,
    predictedAckRate: picked.ack,
    source: coverage >= 0.75 ? externalSourceHint(picked.challenge, finalStrategy) : undefined,
  }
}

function createRecommendationForChallenge(
  owner: TrainerOwnerScope,
  challenge: Challenge,
  kind: Recommendation['kind'],
  reason: string,
  priority = 70,
  options: {
    strategy?: RecommendationStrategy
    predictedAckRate?: number
    appPath?: string
    source?: Recommendation['source']
  } = {},
) {
  state.recommendations = state.recommendations.filter(
    (item) =>
      !(
        item.owner.ownerKey === owner.ownerKey &&
        item.challengeId === challenge.id &&
        item.kind === kind
      ),
  )
  state.recommendations.push({
    id: id('rec'),
    owner,
    kind,
    strategy: options.strategy ?? 'reinforce',
    challengeId: challenge.id,
    challengeTitle: challenge.title,
    difficulty: challenge.difficulty,
    tags: challenge.tags,
    reason,
    priority,
    ...(typeof options.predictedAckRate === 'number'
      ? { predictedAckRate: options.predictedAckRate }
      : {}),
    appPath: options.appPath ?? `/problems/${challenge.id}`,
    ...(options.source ? { source: options.source } : {}),
    createdAt: now(),
  })
  state.recommendations = state.recommendations
    .filter((item) => item.owner.ownerKey !== owner.ownerKey || item.kind !== kind)
    .concat(
      state.recommendations
        .filter((item) => item.owner.ownerKey === owner.ownerKey && item.kind === kind)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
    )
}

function ensureDefaultTipAndCheck(owner: TrainerOwnerScope, challenge: Challenge) {
  const primaryTag = challenge.tags[0] ?? 'algorithm'
  if (
    !state.tips.some(
      (tip) => tip.owner.ownerKey === owner.ownerKey && tip.tags.includes(primaryTag),
    )
  ) {
    state.tips.push({
      id: id('tip'),
      owner,
      title: `${displaySkillLabel(primaryTag)} pattern`,
      body: `Before coding ${challenge.title}, state the invariant and the boundary case that would break it first.`,
      tags: [primaryTag],
      createdAt: now(),
    })
  }
  if (
    !state.checks.some(
      (check) => check.owner.ownerKey === owner.ownerKey && check.challengeId === challenge.id,
    )
  ) {
    state.checks.push({
      id: id('check'),
      owner,
      challengeId: challenge.id,
      question: `What should you verify first before submitting ${challenge.title}?`,
      choices: ['Only sample output', 'Boundary cases and complexity', 'Variable names only'],
      answerIndex: 1,
      explanation:
        'A strong submission needs sample correctness, boundary coverage, and a clear complexity claim.',
      tags: challenge.tags,
      createdAt: now(),
    })
  }
}

function updateTrainingList(owner: TrainerOwnerScope, challenge: Challenge, timestamp: string) {
  const activeWrong = state.wrongProblems.find((item) => item.owner.ownerKey === owner.ownerKey)
  const tasks: TrainingTask[] = [
    {
      id: `problem:${challenge.id}`,
      type: 'problem',
      title: `Practice ${challenge.title}`,
      status: 'todo',
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      reason: recommendationReason(
        challenge,
        state.skills
          .filter((skill) => skill.owner.ownerKey === owner.ownerKey && skill.level !== 'strong')
          .map((skill) => skill.id),
      ),
    },
    {
      id: `check:${challenge.id}`,
      type: 'check',
      title: 'State invariant and complexity',
      status: 'todo',
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      reason: 'Short checks keep the practice loop honest before code review.',
    },
  ]
  if (activeWrong) {
    tasks.push({
      id: `review:${activeWrong.challengeId}`,
      type: 'review',
      title: `Retry ${activeWrong.challengeTitle}`,
      status: 'todo',
      challengeId: activeWrong.challengeId,
      challengeTitle: activeWrong.challengeTitle,
      reason: activeWrong.reason,
      dueAt: activeWrong.nextReviewAt,
    })
  }
  const list: TrainingList = {
    id: `daily:${owner.ownerKey}`,
    owner,
    title: 'Daily algorithm loop',
    horizon: 'daily',
    goal: 'Submit one focused attempt, review the feedback, and turn one weak signal into the next task.',
    tasks,
    updatedAt: timestamp,
  }
  state.trainingLists = state.trainingLists.filter(
    (item) => !(item.owner.ownerKey === owner.ownerKey && item.id === list.id),
  )
  state.trainingLists.push(list)
}

function refreshLearningLoopAfterAnalysis(submission: CodeSubmission, challenge: Challenge) {
  const timestamp = now()
  for (const tag of challenge.tags) {
    upsertSkillFromTag(
      submission.owner,
      tag,
      submission.analysis?.outcome ?? 'incomplete',
      timestamp,
    )
  }

  if (!acceptedSubmission(submission)) {
    const existing = state.wrongProblems.find(
      (item) =>
        item.owner.ownerKey === submission.owner.ownerKey && item.challengeId === challenge.id,
    )
    const wrongProblem: WrongProblem = {
      owner: submission.owner,
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      tags: challenge.tags,
      lastSubmissionId: submission.id,
      reason: submission.analysis?.summary ?? 'Submission needs another pass.',
      reviewCount: (existing?.reviewCount ?? 0) + 1,
      nextReviewAt: addDays(timestamp, existing ? 3 : 1),
      updatedAt: timestamp,
    }
    state.wrongProblems = state.wrongProblems.filter(
      (item) =>
        !(item.owner.ownerKey === submission.owner.ownerKey && item.challengeId === challenge.id),
    )
    state.wrongProblems.push(wrongProblem)
  }

  const next = nextChallengeForOwner(submission.owner)
  if (next) {
    const weakTags = state.skills
      .filter(
        (skill) => skill.owner.ownerKey === submission.owner.ownerKey && skill.level !== 'strong',
      )
      .map((skill) => skill.id)
    createRecommendationForChallenge(
      submission.owner,
      next.challenge,
      acceptedSubmission(submission) ? 'next_problem' : 'wrong_variant',
      recommendationReason(next.challenge, weakTags, next.strategy, next.predictedAckRate),
      acceptedSubmission(submission) ? 80 : 90,
      {
        strategy: next.strategy,
        predictedAckRate: next.predictedAckRate,
        appPath: next.source
          ? `/import?provider=${next.source.provider}&q=${encodeURIComponent(next.source.query)}`
          : `/problems/${next.challenge.id}`,
        source: next.source,
      },
    )
    ensureDefaultTipAndCheck(submission.owner, next.challenge)
    updateTrainingList(submission.owner, next.challenge, timestamp)
  }

  state.reports.push({
    id: id('report'),
    owner: submission.owner,
    period: 'daily',
    title: 'Latest training signal',
    summary: `${challenge.title}: ${submission.analysis?.summary ?? 'Review is pending.'}`,
    signals: uniqueText([
      ...(submission.analysis?.suggestions ?? []),
      ...(acceptedSubmission(submission) ? ['Accepted attempt'] : ['Needs another focused pass']),
    ]),
    createdAt: timestamp,
  })
}

export function listChallenges(
  input: {
    query?: string
    difficulty?: ChallengeDifficulty
    tag?: string
  },
  access: TrainerAccess,
) {
  const query = input.query?.trim().toLowerCase()
  const tag = input.tag?.trim().toLowerCase()
  return structuredClone(
    state.challenges
      .filter((challenge) => canReadChallenge(challenge, access))
      .filter((challenge) => {
        const difficultyMatches = !input.difficulty || challenge.difficulty === input.difficulty
        const tagMatches = !tag || challenge.tags.some((item) => item.toLowerCase() === tag)
        const haystack = [challenge.title, challenge.prompt, challenge.tags.join(' ')]
          .join(' ')
          .toLowerCase()
        return difficultyMatches && tagMatches && (!query || haystack.includes(query))
      }),
  )
}

export function getChallenge(challengeId: string, access: TrainerAccess) {
  const challenge =
    state.challenges.find(
      (item) => item.id === challengeId && ownerKeyOf(item) === access.ownerKey,
    ) ?? state.challenges.find((item) => item.id === challengeId && isGlobalChallenge(item))
  if (!challenge) return null
  return structuredClone({
    challenge,
    submissions: state.submissions
      .filter((submission) => submission.challengeId === challengeId)
      .filter((submission) => canReadSubmission(submission, access))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  })
}

export function upsertChallenge(input: ChallengeInput, access: TrainerAccess) {
  const existing = input.id
    ? state.challenges.find(
        (challenge) => challenge.id === input.id && ownerKeyOf(challenge) === access.ownerKey,
      )
    : undefined
  const timestamp = now()
  const source = normalizeSource(input.source)
  const challenge: Challenge = {
    id: existing?.id ?? uniqueChallengeId(input.id || input.title, access.ownerKey),
    title: input.title.trim(),
    difficulty: normalizeDifficulty(input.difficulty),
    tags: normalizeTags(input.tags),
    prompt: input.prompt.trim(),
    starterCode: input.starterCode.trim(),
    examples: normalizeExamples(input.examples),
    testCases: normalizeTestCases(input.testCases),
    judgeInstructions: input.judgeInstructions.trim(),
    ...(source ? { source } : {}),
    owner: existing?.owner ?? ownerFromAccess(access),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }

  if (existing) {
    state.challenges = state.challenges.map((item) =>
      item.id === existing.id && ownerKeyOf(item) === access.ownerKey ? challenge : item,
    )
  } else {
    state.challenges.push(challenge)
  }

  persist()
  return structuredClone(challenge)
}

export function createSubmission(input: {
  challengeId: string
  language: string
  code: string
  reviewer?: SubmissionReviewerInput
  author: ShadowServerAppActorRef
  access: TrainerAccess
}) {
  const challenge =
    state.challenges.find(
      (item) => item.id === input.challengeId && ownerKeyOf(item) === input.access.ownerKey,
    ) ?? state.challenges.find((item) => item.id === input.challengeId && isGlobalChallenge(item))
  if (!challenge) return null
  const createdAt = now()
  const reviewRequest = reviewRequestFromInput(input.reviewer, createdAt)
  const submission: CodeSubmission = {
    id: id('sub'),
    challengeId: challenge.id,
    owner: ownerFromAccess(input.access),
    author: person(input.author),
    language: normalizeLanguage(input.language),
    code: input.code.trim(),
    status: 'submitted',
    ...(reviewRequest ? { reviewRequest } : {}),
    createdAt,
  }
  state.submissions.push(submission)
  persist()
  return structuredClone(submission)
}

export function listSubmissions(
  input: {
    challengeId?: string
    status?: SubmissionStatus
    limit?: number
  },
  access: TrainerAccess,
) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  return structuredClone(
    state.submissions
      .filter((submission) => canReadSubmission(submission, access))
      .filter((submission) => !input.challengeId || submission.challengeId === input.challengeId)
      .filter((submission) => !input.status || submission.status === input.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit),
  )
}

export function getSubmission(submissionId: string, access: TrainerAccess) {
  const submission = state.submissions.find((item) => item.id === submissionId)
  if (!submission || !canReadSubmission(submission, access)) return null
  const challenge =
    state.challenges.find(
      (item) =>
        item.id === submission.challengeId && ownerKeyOf(item) === submission.owner.ownerKey,
    ) ??
    state.challenges.find((item) => item.id === submission.challengeId && isGlobalChallenge(item))
  return structuredClone({ submission, challenge })
}

export function pendingSubmissions(input: { limit?: number }, access: TrainerAccess) {
  return listSubmissions({ status: 'submitted', limit: input.limit }, access)
    .map((submission) => ({
      submission,
      challenge:
        state.challenges.find(
          (challenge) =>
            challenge.id === submission.challengeId &&
            ownerKeyOf(challenge) === submission.owner.ownerKey,
        ) ??
        state.challenges.find(
          (challenge) => challenge.id === submission.challengeId && isGlobalChallenge(challenge),
        ),
    }))
    .filter(
      (item): item is { submission: CodeSubmission; challenge: Challenge } => !!item.challenge,
    )
}

function readableChallenges(access: TrainerAccess) {
  return state.challenges.filter((challenge) => canReadChallenge(challenge, access))
}

function challengeForInput(challengeId: string, access: TrainerAccess) {
  return readableChallenges(access).find((challenge) => challenge.id === challengeId) ?? null
}

function daysRemaining(deadlineAt?: string) {
  if (!deadlineAt) return undefined
  const deadline = new Date(deadlineAt).getTime()
  if (!Number.isFinite(deadline)) return undefined
  return Math.max(0, Math.ceil((deadline - Date.now()) / (24 * 60 * 60 * 1000)))
}

export function learningOverview(access: TrainerAccess): TrainerOverview {
  const challenges = readableChallenges(access)
  const submissions = state.submissions.filter(
    (submission) => submission.owner.ownerKey === access.ownerKey,
  )
  const owner = ownerFromAccess(access)
  const settings = settingsForOwner(owner)
  const challengeById = new Map(challenges.map((challenge) => [challenge.id, challenge]))
  const acceptedProblemIds = new Set(
    submissions.filter(acceptedSubmission).map((submission) => submission.challengeId),
  )
  const attemptedProblemIds = new Set(submissions.map((submission) => submission.challengeId))
  const activeTasks = state.trainingLists
    .filter((item) => ownerMatches(item, access))
    .flatMap((item) => item.tasks)
    .filter((task) => task.status !== 'done').length

  return structuredClone({
    updatedAt: state.updatedAt,
    settings,
    skills: state.skills.filter((item) => ownerMatches(item, access)),
    trainingLists: state.trainingLists.filter((item) => ownerMatches(item, access)),
    recommendations: state.recommendations
      .filter((item) => ownerMatches(item, access))
      .sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20),
    tips: state.tips
      .filter((item) => ownerMatches(item, access))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20),
    checks: state.checks
      .filter((item) => ownerMatches(item, access))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20),
    wrongProblems: state.wrongProblems.filter((item) => ownerMatches(item, access)),
    reports: state.reports
      .filter((item) => ownerMatches(item, access))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20),
    recentSubmissions: submissions
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map((submission) => {
        const challenge = challengeById.get(submission.challengeId)
        return {
          id: submission.id,
          challengeId: submission.challengeId,
          challengeTitle: challenge?.title ?? submission.challengeId,
          language: submission.language,
          status: submission.status,
          ...(submission.analysis?.outcome ? { outcome: submission.analysis.outcome } : {}),
          ...(submission.analysis?.score !== undefined ? { score: submission.analysis.score } : {}),
          ...(submission.analysis?.summary ? { summary: submission.analysis.summary } : {}),
          tags: challenge?.tags ?? [],
          createdAt: submission.createdAt,
        }
      }),
    stats: {
      totalProblems: challenges.length,
      attemptedProblems: attemptedProblemIds.size,
      acceptedProblems: acceptedProblemIds.size,
      pendingReviews: submissions.filter((submission) => submission.status === 'submitted').length,
      weakSkills: state.skills.filter(
        (skill) =>
          ownerMatches(skill, access) && (skill.level === 'new' || skill.level === 'learning'),
      ).length,
      activeTasks,
      ...(settings.targetProblems ? { targetProblems: settings.targetProblems } : {}),
      ...(settings.targetProblems ? { targetCompleted: acceptedProblemIds.size } : {}),
      ...(settings.deadlineAt ? { deadlineAt: settings.deadlineAt } : {}),
      ...(daysRemaining(settings.deadlineAt) !== undefined
        ? { daysRemaining: daysRemaining(settings.deadlineAt) }
        : {}),
    },
  })
}

export function upsertTrainingList(input: TrainingListInput, access: TrainerAccess) {
  const timestamp = now()
  const owner = ownerFromAccess(access)
  const listId = text(input.id, `list:${normalizeHorizon(input.horizon)}:${owner.ownerKey}`)
  const tasks = (input.tasks ?? [])
    .map((task) =>
      normalizeTrainingTask({
        ...task,
        id: task.id ?? id('task'),
        status: task.status ?? 'todo',
      }),
    )
    .filter((task): task is TrainingTask => !!task)
    .slice(0, 24)
  const list: TrainingList = {
    id: listId,
    owner,
    title: input.title.trim(),
    horizon: normalizeHorizon(input.horizon),
    goal: text(input.goal, 'Keep the algorithm training loop moving.'),
    tasks,
    updatedAt: timestamp,
  }
  state.trainingLists = state.trainingLists.filter(
    (item) => !(item.owner.ownerKey === owner.ownerKey && item.id === list.id),
  )
  state.trainingLists.push(list)
  persist()
  return structuredClone(list)
}

export function upsertTrainerSettings(input: TrainerSettingsInput, access: TrainerAccess) {
  const owner = ownerFromAccess(access)
  const existing = settingsForOwner(owner)
  const targetProblems =
    typeof input.targetProblems === 'number' && Number.isFinite(input.targetProblems)
      ? Math.max(1, Math.min(999, Math.round(input.targetProblems)))
      : undefined
  const settings: TrainerSettings = {
    owner,
    difficultyMode: normalizeDifficultyMode(input.difficultyMode ?? existing.difficultyMode),
    ...((targetProblems ?? existing.targetProblems)
      ? { targetProblems: targetProblems ?? existing.targetProblems }
      : {}),
    ...(text(input.deadlineAt) || existing.deadlineAt
      ? { deadlineAt: text(input.deadlineAt, existing.deadlineAt) }
      : {}),
    updatedAt: now(),
  }
  state.settings = state.settings.filter((item) => item.owner.ownerKey !== owner.ownerKey)
  state.settings.push(settings)
  persist()
  return structuredClone(settings)
}

export function updateSkillState(input: SkillStateInput, access: TrainerAccess) {
  const owner = ownerFromAccess(access)
  const skillId = skillIdFromTag(input.id)
  const existing = state.skills.find(
    (skill) => skill.owner.ownerKey === owner.ownerKey && skill.id === skillId,
  )
  const mastery =
    input.mastery === undefined ? (existing?.mastery ?? 20) : clampScore(input.mastery)
  const skill: SkillState = {
    id: skillId,
    owner,
    label: text(input.label, existing?.label ?? displaySkillLabel(skillId)),
    category: text(input.category, existing?.category ?? skillCategory(skillId)),
    level: input.level ?? skillLevel(mastery),
    mastery,
    attempts: Math.max(0, Math.round(input.attempts ?? existing?.attempts ?? 0)),
    accepted: Math.max(0, Math.round(input.accepted ?? existing?.accepted ?? 0)),
    weakSignals: uniqueText(input.weakSignals ?? existing?.weakSignals ?? [], 8),
    lastPracticedAt: existing?.lastPracticedAt,
    updatedAt: now(),
  }
  state.skills = state.skills.filter(
    (item) => !(item.owner.ownerKey === owner.ownerKey && item.id === skill.id),
  )
  state.skills.push(skill)
  persist()
  return structuredClone(skill)
}

export function createRecommendation(input: RecommendationInput, access: TrainerAccess) {
  const challenge = challengeForInput(input.challengeId, access)
  if (!challenge) return null
  const owner = ownerFromAccess(access)
  const recommendation: Recommendation = {
    id: id('rec'),
    owner,
    kind: normalizeRecommendationKind(input.kind),
    strategy: input.strategy ?? 'reinforce',
    challengeId: challenge.id,
    challengeTitle: challenge.title,
    difficulty: challenge.difficulty,
    tags: challenge.tags,
    reason: input.reason.trim(),
    priority: Math.max(0, Math.min(100, Math.round(input.priority ?? 70))),
    ...(typeof input.predictedAckRate === 'number'
      ? { predictedAckRate: Math.max(0, Math.min(100, Math.round(input.predictedAckRate))) }
      : {}),
    appPath: text(input.appPath, `/problems/${challenge.id}`),
    createdAt: now(),
  }
  state.recommendations.push(recommendation)
  persist()
  return structuredClone(recommendation)
}

export function latestRecommendation(access: TrainerAccess) {
  return structuredClone(
    state.recommendations
      .filter((item) => ownerMatches(item, access))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
  )
}

export function createTip(input: TipInput, access: TrainerAccess) {
  const tip: Tip = {
    id: id('tip'),
    owner: ownerFromAccess(access),
    title: input.title.trim(),
    body: input.body.trim(),
    tags: normalizeTags(input.tags),
    createdAt: now(),
  }
  state.tips.push(tip)
  persist()
  return structuredClone(tip)
}

export function createCheck(input: CheckInput, access: TrainerAccess) {
  const choices = normalizeTextList(input.choices, 6)
  const check: UnderstandingCheck = {
    id: id('check'),
    owner: ownerFromAccess(access),
    ...(text(input.challengeId) ? { challengeId: text(input.challengeId) } : {}),
    question: input.question.trim(),
    choices,
    answerIndex: Math.max(0, Math.min(choices.length - 1, Math.round(input.answerIndex))),
    explanation: input.explanation.trim(),
    tags: normalizeTags(input.tags),
    createdAt: now(),
  }
  state.checks.push(check)
  persist()
  return structuredClone(check)
}

export function createReport(input: ReportInput, access: TrainerAccess) {
  const report: Report = {
    id: id('report'),
    owner: ownerFromAccess(access),
    period: normalizeReportPeriod(input.period),
    title: input.title.trim(),
    summary: input.summary.trim(),
    signals: normalizeTextList(input.signals, 12),
    createdAt: now(),
  }
  state.reports.push(report)
  persist()
  return structuredClone(report)
}

export function scheduleWrongProblem(input: WrongProblemInput, access: TrainerAccess) {
  const challenge = challengeForInput(input.challengeId, access)
  if (!challenge) return null
  const owner = ownerFromAccess(access)
  const existing = state.wrongProblems.find(
    (item) => item.owner.ownerKey === owner.ownerKey && item.challengeId === challenge.id,
  )
  const timestamp = now()
  const wrongProblem: WrongProblem = {
    owner,
    challengeId: challenge.id,
    challengeTitle: challenge.title,
    tags: challenge.tags,
    lastSubmissionId: text(input.lastSubmissionId, existing?.lastSubmissionId ?? 'manual'),
    reason: input.reason.trim(),
    reviewCount: (existing?.reviewCount ?? 0) + 1,
    nextReviewAt: text(input.nextReviewAt, addDays(timestamp, 1)),
    updatedAt: timestamp,
  }
  state.wrongProblems = state.wrongProblems.filter(
    (item) => !(item.owner.ownerKey === owner.ownerKey && item.challengeId === challenge.id),
  )
  state.wrongProblems.push(wrongProblem)
  persist()
  return structuredClone(wrongProblem)
}

export function analyzeSubmission(input: {
  submissionId: string
  outcome: SubmissionOutcome
  score: number
  summary: string
  explanation: string
  suggestions?: string[]
  complexity?: string
  analyzer: ShadowServerAppActorRef
  access: TrainerAccess
}) {
  const submission = state.submissions.find((item) => item.id === input.submissionId)
  if (!submission || !canReadSubmission(submission, input.access)) return null
  submission.status = 'analyzed'
  submission.analysis = {
    outcome: normalizeOutcome(input.outcome),
    score: clampScore(input.score),
    summary: input.summary.trim(),
    explanation: input.explanation.trim(),
    suggestions: normalizeSuggestions(input.suggestions),
    complexity: text(input.complexity) || undefined,
    analyzer: person(input.analyzer),
    analyzedAt: now(),
  }
  const challenge = challengeForSubmission(submission)
  if (challenge) refreshLearningLoopAfterAnalysis(submission, challenge)
  persist()
  return structuredClone(submission)
}
