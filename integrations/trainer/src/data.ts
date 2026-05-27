import { resolve } from 'node:path'
import type { ShadowServerAppActorRef } from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import type {
  Challenge,
  ChallengeDifficulty,
  CodeSubmission,
  SubmissionAnalysis,
  SubmissionOutcome,
  SubmissionReviewFocus,
  SubmissionReviewRequest,
  SubmissionStatus,
  TrainerLanguage,
  TrainerPerson,
  TrainerState,
} from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`
const languages = new Set<TrainerLanguage>(['javascript', 'typescript', 'python'])

const seedTimestamp = '2026-01-01T00:00:00.000Z'

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
  return { updatedAt: now(), challenges: structuredClone(seedChallenges), submissions: [] }
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

function uniqueChallengeId(base: string) {
  let candidate = slugify(base)
  let index = 2
  while (state.challenges.some((challenge) => challenge.id === candidate)) {
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
    avatarUrl: text(source.avatarUrl ?? profile.avatarUrl) || null,
  } satisfies TrainerPerson
}

function person(actor: ShadowServerAppActorRef): TrainerPerson {
  return normalizePerson(actor, 'Local Coder')
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

  return {
    id: text(value.id, slugify(title)),
    title,
    difficulty: normalizeDifficulty(value.difficulty),
    tags: normalizeTags(value.tags),
    prompt,
    starterCode: starterWithoutSeedAnswer(text(value.id, slugify(title)), starterCode),
    examples: normalizeExamples(value.examples),
    testCases: normalizeTestCases(value.testCases),
    judgeInstructions,
    ...(source ? { source } : {}),
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
    requestedAt,
  }
}

function normalizeReviewFocus(value: unknown): SubmissionReviewFocus {
  if (value === 'interview' || value === 'debug' || value === 'complexity') return value
  return 'standard'
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
  const status: SubmissionStatus =
    stored.status === 'analyzed' || stored.status === 'judged' || analysis
      ? 'analyzed'
      : 'submitted'

  return {
    id: submissionId,
    challengeId,
    author: normalizePerson(stored.author, 'Learner'),
    language: normalizeLanguage(stored.language),
    code,
    status,
    ...(reviewRequest ? { reviewRequest } : {}),
    analysis,
    createdAt: text(stored.createdAt, now()),
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

export function listChallenges(input: { query?: string; difficulty?: ChallengeDifficulty }) {
  const query = input.query?.trim().toLowerCase()
  return structuredClone(
    state.challenges.filter((challenge) => {
      const difficultyMatches = !input.difficulty || challenge.difficulty === input.difficulty
      const haystack = [challenge.title, challenge.prompt, challenge.tags.join(' ')]
        .join(' ')
        .toLowerCase()
      return difficultyMatches && (!query || haystack.includes(query))
    }),
  )
}

export function getChallenge(challengeId: string) {
  const challenge = state.challenges.find((item) => item.id === challengeId)
  if (!challenge) return null
  return structuredClone({
    challenge,
    submissions: state.submissions
      .filter((submission) => submission.challengeId === challengeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  })
}

export function upsertChallenge(input: ChallengeInput) {
  const existing = input.id
    ? state.challenges.find((challenge) => challenge.id === input.id)
    : undefined
  const timestamp = now()
  const source = normalizeSource(input.source)
  const challenge: Challenge = {
    id: existing?.id ?? uniqueChallengeId(input.id || input.title),
    title: input.title.trim(),
    difficulty: normalizeDifficulty(input.difficulty),
    tags: normalizeTags(input.tags),
    prompt: input.prompt.trim(),
    starterCode: input.starterCode.trim(),
    examples: normalizeExamples(input.examples),
    testCases: normalizeTestCases(input.testCases),
    judgeInstructions: input.judgeInstructions.trim(),
    ...(source ? { source } : {}),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }

  if (existing) {
    state.challenges = state.challenges.map((item) => (item.id === existing.id ? challenge : item))
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
}) {
  const challenge = state.challenges.find((item) => item.id === input.challengeId)
  if (!challenge) return null
  const createdAt = now()
  const reviewRequest = reviewRequestFromInput(input.reviewer, createdAt)
  const submission: CodeSubmission = {
    id: id('sub'),
    challengeId: challenge.id,
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

export function listSubmissions(input: {
  challengeId?: string
  status?: SubmissionStatus
  limit?: number
}) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  return structuredClone(
    state.submissions
      .filter((submission) => !input.challengeId || submission.challengeId === input.challengeId)
      .filter((submission) => !input.status || submission.status === input.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit),
  )
}

export function getSubmission(submissionId: string) {
  const submission = state.submissions.find((item) => item.id === submissionId)
  if (!submission) return null
  const challenge = state.challenges.find((item) => item.id === submission.challengeId)
  return structuredClone({ submission, challenge })
}

export function pendingSubmissions(input: { limit?: number }) {
  return listSubmissions({ status: 'submitted', limit: input.limit })
    .map((submission) => ({
      submission,
      challenge: state.challenges.find((challenge) => challenge.id === submission.challengeId),
    }))
    .filter(
      (item): item is { submission: CodeSubmission; challenge: Challenge } => !!item.challenge,
    )
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
}) {
  const submission = state.submissions.find((item) => item.id === input.submissionId)
  if (!submission) return null
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
  persist()
  return structuredClone(submission)
}
