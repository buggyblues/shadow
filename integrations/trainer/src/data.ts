import { resolve } from 'node:path'
import type { ShadowServerAppActorRef } from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import type {
  Challenge,
  CodeSubmission,
  SubmissionStatus,
  SubmissionVerdict,
  TrainerPerson,
  TrainerState,
} from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

export const challenges: Challenge[] = [
  {
    id: 'two_sum',
    title: 'Two Sum',
    difficulty: 'easy',
    tags: ['array', 'hash-map'],
    prompt:
      'Return indices of the two numbers such that they add up to the target. Each input has exactly one solution.',
    starterCode:
      'function twoSum(nums, target) {\n  const seen = new Map()\n  for (let i = 0; i < nums.length; i += 1) {\n    const need = target - nums[i]\n    if (seen.has(need)) return [seen.get(need), i]\n    seen.set(nums[i], i)\n  }\n  return []\n}',
    examples: [
      { input: 'nums = [2,7,11,15], target = 9', output: '[0,1]' },
      { input: 'nums = [3,2,4], target = 6', output: '[1,2]' },
    ],
    judgeInstructions:
      'Execute twoSum(nums, target) against visible and hidden array cases. Award full score only when returned indices are valid and distinct.',
  },
  {
    id: 'valid_parentheses',
    title: 'Valid Parentheses',
    difficulty: 'easy',
    tags: ['stack', 'string'],
    prompt:
      'Given a string containing brackets, determine if every opening bracket is closed in the correct order.',
    starterCode:
      "function isValid(s) {\n  const stack = []\n  const pairs = { ')': '(', ']': '[', '}': '{' }\n  for (const char of s) {\n    if (char in pairs) {\n      if (stack.pop() !== pairs[char]) return false\n    } else {\n      stack.push(char)\n    }\n  }\n  return stack.length === 0\n}",
    examples: [
      { input: 's = "()"', output: 'true' },
      { input: 's = "([)]"', output: 'false' },
    ],
    judgeInstructions:
      'Execute isValid(s) with simple, nested, mismatched, and empty inputs. Check boolean output exactly.',
  },
  {
    id: 'merge_intervals',
    title: 'Merge Intervals',
    difficulty: 'medium',
    tags: ['array', 'sorting'],
    prompt:
      'Merge all overlapping intervals and return a list of non-overlapping intervals sorted by start time.',
    starterCode:
      'function merge(intervals) {\n  intervals.sort((a, b) => a[0] - b[0])\n  const result = []\n  for (const interval of intervals) {\n    const last = result[result.length - 1]\n    if (!last || last[1] < interval[0]) result.push([...interval])\n    else last[1] = Math.max(last[1], interval[1])\n  }\n  return result\n}',
    examples: [
      { input: 'intervals = [[1,3],[2,6],[8,10],[15,18]]', output: '[[1,6],[8,10],[15,18]]' },
      { input: 'intervals = [[1,4],[4,5]]', output: '[[1,5]]' },
    ],
    judgeInstructions:
      'Execute merge(intervals) with sorted, unsorted, touching, nested, and disjoint intervals. Compare normalized interval arrays.',
  },
]

function defaultState(): TrainerState {
  return { updatedAt: now(), submissions: [] }
}

function dataFilePath() {
  return resolve(process.env.TRAINER_DATA_FILE ?? './data/trainer.json')
}

function isState(value: unknown): value is TrainerState {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { submissions?: unknown }).submissions)
  )
}

const stateStore = createShadowServerAppJsonStore<TrainerState>({
  filePath: dataFilePath(),
  defaultValue: defaultState,
  validate: isState,
})

let state = stateStore.read()

function persist() {
  state.updatedAt = now()
  state = stateStore.write(state)
}

function person(actor: ShadowServerAppActorRef): TrainerPerson {
  return actor
}

export function listChallenges(input: { query?: string; difficulty?: Challenge['difficulty'] }) {
  const query = input.query?.trim().toLowerCase()
  return structuredClone(
    challenges.filter((challenge) => {
      const difficultyMatches = !input.difficulty || challenge.difficulty === input.difficulty
      const haystack = [challenge.title, challenge.prompt, challenge.tags.join(' ')]
        .join(' ')
        .toLowerCase()
      return difficultyMatches && (!query || haystack.includes(query))
    }),
  )
}

export function getChallenge(challengeId: string) {
  const challenge = challenges.find((item) => item.id === challengeId)
  if (!challenge) return null
  return structuredClone({
    challenge,
    submissions: state.submissions
      .filter((submission) => submission.challengeId === challengeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  })
}

export function createSubmission(input: {
  challengeId: string
  language: string
  code: string
  author: ShadowServerAppActorRef
}) {
  const challenge = challenges.find((item) => item.id === input.challengeId)
  if (!challenge) return null
  const submission: CodeSubmission = {
    id: id('sub'),
    challengeId: challenge.id,
    author: person(input.author),
    language: input.language.trim() || 'javascript',
    code: input.code.trim(),
    status: 'submitted',
    createdAt: now(),
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
  const challenge = challenges.find((item) => item.id === submission.challengeId)
  return structuredClone({ submission, challenge })
}

export function pendingSubmissions(input: { limit?: number }) {
  return listSubmissions({ status: 'submitted', limit: input.limit })
    .map((submission) => ({
      submission,
      challenge: challenges.find((challenge) => challenge.id === submission.challengeId),
    }))
    .filter(
      (item): item is { submission: CodeSubmission; challenge: Challenge } => !!item.challenge,
    )
}

export function judgeSubmission(input: {
  submissionId: string
  verdict: SubmissionVerdict
  score: number
  feedback: string
  suggestions?: string[]
  grader: ShadowServerAppActorRef
}) {
  const submission = state.submissions.find((item) => item.id === input.submissionId)
  if (!submission) return null
  submission.status = 'judged'
  submission.verdict = input.verdict
  submission.score = Math.max(0, Math.min(100, Math.round(input.score)))
  submission.feedback = input.feedback.trim()
  submission.suggestions = (input.suggestions ?? []).map((item) => item.trim()).filter(Boolean)
  submission.grader = person(input.grader)
  submission.judgedAt = now()
  persist()
  return structuredClone(submission)
}
