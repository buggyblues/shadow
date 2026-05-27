import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  type ShadowServerAppCommandContext,
  type ShadowServerAppCommandName,
  ShadowServerAppOutbox,
} from '@shadowob/sdk'
import { Hono } from 'hono'
import {
  analyzeSubmission,
  createSubmission,
  getChallenge,
  getSubmission,
  listChallenges,
  listSubmissions,
  pendingSubmissions,
  upsertChallenge,
} from './data.js'
import { manifest, shadowApp } from './manifest.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import {
  importExternalChallenge,
  refreshImportedCodeforcesChallenge,
  searchExternalChallenges,
} from './sources.js'
import type { Challenge, CodeSubmission, SubmissionReviewFocus } from './types.js'
import { shellPage } from './ui.js'

type TrainerCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const app = new Hono()
const port = Number(process.env.PORT ?? 4213)
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)

function clipForTask(value: string, limit: number) {
  const trimmed = value.trim()
  if (trimmed.length <= limit) return trimmed
  return `${trimmed.slice(0, Math.max(0, limit - 3)).trim()}...`
}

function reviewFocusLabel(value?: SubmissionReviewFocus) {
  if (value === 'interview') return 'interview coaching'
  if (value === 'debug') return 'debugging hints'
  if (value === 'complexity') return 'complexity and tradeoff review'
  return 'sandbox correctness review'
}

function reviewFocusInstruction(submission: CodeSubmission) {
  const focus = submission.reviewRequest?.reviewFocus
  if (focus === 'interview') {
    return 'Focus on interview readiness: point out the reasoning gap, ask one follow-up question, and include a short whiteboard explanation path.'
  }
  if (focus === 'debug') {
    return 'Focus on debugging: identify the smallest failing case, explain the first wrong state, and give hints before any direct fix.'
  }
  if (focus === 'complexity') {
    return 'Focus on complexity: verify asymptotic cost, explain tradeoffs, and mention when an alternative data structure would be justified.'
  }
  return 'Focus on sandbox correctness: run cases, identify correctness gaps, and explain the core invariant.'
}

function reviewTaskBody(submission: CodeSubmission, challenge: Challenge) {
  const examples = challenge.examples
    .slice(0, 5)
    .map((example, index) => {
      const lines = [`Case ${index + 1}`, `Input: ${example.input}`, `Output: ${example.output}`]
      if (example.explanation) lines.push(`Explanation: ${example.explanation}`)
      return lines.join('\n')
    })
    .join('\n\n')
  const testCases = (challenge.testCases ?? [])
    .slice(0, 40)
    .map((testCase, index) => {
      const label = testCase.visibility === 'hidden' ? 'Hidden' : 'Visible'
      return [
        `${label} case ${index + 1}${testCase.description ? `: ${testCase.description}` : ''}`,
        `Input: ${testCase.input}`,
        `Expected: ${testCase.expected}`,
      ].join('\n')
    })
    .join('\n\n')

  return [
    `Review submission ${submission.id} for "${challenge.title}".`,
    '',
    'Workflow:',
    `1. Fetch the submission with shadow-trainer submissions.get using {"submissionId":"${submission.id}"}.`,
    '2. Run the visible examples plus hidden and edge cases in your sandbox. Do not delegate judging to an online judge.',
    '3. Write the result back with shadow-trainer submissions.analyze.',
    '',
    'Feedback requirements:',
    '- Give a verdict, score, and concise bug diagnosis.',
    '- Explain the core algorithmic idea and why it works.',
    '- Call out time and space complexity.',
    '- Include targeted fixes and interview preparation notes for the learner.',
    '- Do not paste a complete final solution. Preserve the exercise by giving diagnosis, hints, and focused next steps.',
    '',
    `Review focus: ${reviewFocusLabel(submission.reviewRequest?.reviewFocus)}.`,
    reviewFocusInstruction(submission),
    '',
    `Language: ${submission.language}`,
    challenge.source?.url ? `Source URL: ${challenge.source.url}` : '',
    `Problem prompt: ${clipForTask(challenge.prompt, 1400)}`,
    examples ? `Visible examples:\n${clipForTask(examples, 1800)}` : '',
    testCases ? `Canonical sandbox cases:\n${clipForTask(testCases, 5000)}` : '',
    `Judge notes: ${clipForTask(challenge.judgeInstructions, 1400)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function reviewInboxTask(submission: CodeSubmission, challenge: Challenge) {
  const reviewRequest = submission.reviewRequest
  if (!reviewRequest) return null
  const assignee = reviewRequest.agentId || reviewRequest.assigneeLabel
  if (!assignee) return null

  return {
    title: `Review ${challenge.title} submission`,
    body: reviewTaskBody(submission, challenge),
    priority: 'normal' as const,
    agentId: reviewRequest.agentId,
    assigneeLabel: reviewRequest.assigneeLabel,
    idempotencyKey: `trainer:submission-review:${submission.id}:${assignee}`,
    resource: {
      kind: 'trainer_submission',
      id: submission.id,
      label: challenge.title,
      challengeId: challenge.id,
    },
    data: {
      kind: 'trainer_submission_review',
      submissionId: submission.id,
      challengeId: challenge.id,
      language: submission.language,
      commands: {
        fetchSubmission: 'submissions.get',
        writeAnalysis: 'submissions.analyze',
      },
      learningGoals: [
        'sandbox test execution',
        'algorithm correctness feedback',
        'complexity explanation',
        'interview preparation guidance',
        reviewFocusLabel(reviewRequest.reviewFocus),
      ],
    },
    required: false,
  }
}

const commands = shadowApp.defineCommands({
  'challenges.list': (input) => ({ challenges: listChallenges(input) }),
  'challenges.get': async (input) => {
    const result = getChallenge(input.challengeId)
    if (!result) throw shadowApp.error(404, 'challenge_not_found')
    const refreshed = await refreshImportedCodeforcesChallenge(result.challenge)
    return refreshed ? (getChallenge(refreshed.id) ?? result) : result
  },
  'challenges.upsert': (input) => ({ challenge: upsertChallenge(input) }),
  'sources.search': (input) => searchExternalChallenges(input),
  'sources.import': (input) => importExternalChallenge(input),
  'submissions.create': (input, context) => {
    if (!input.reviewer?.agentId && !input.reviewer?.assigneeLabel) {
      throw shadowApp.error(422, 'reviewer_required')
    }
    const submission = createSubmission({ ...input, author: context.actor })
    if (!submission) throw shadowApp.error(404, 'challenge_not_found')
    const challenge = getSubmission(submission.id)?.challenge
    const task = challenge ? reviewInboxTask(submission, challenge) : null
    return task
      ? new ShadowServerAppOutbox().enqueueInboxTask(task).attachTo({ submission })
      : { submission }
  },
  'submissions.list': (input) => ({ submissions: listSubmissions(input) }),
  'submissions.get': (input) => {
    const result = getSubmission(input.submissionId)
    if (!result) throw shadowApp.error(404, 'submission_not_found')
    return result
  },
  'submissions.pending': (input) => ({ submissions: pendingSubmissions(input) }),
  'submissions.analyze': (input, context) => {
    const submission = analyzeSubmission({ ...input, analyzer: context.actor })
    if (!submission) throw shadowApp.error(404, 'submission_not_found')
    return { submission }
  },
})

function commandName(value: string): TrainerCommandName | null {
  return commandNames.has(value) ? (value as TrainerCommandName) : null
}

function localContext(command: TrainerCommandName): ShadowServerAppCommandContext {
  const manifestCommand = shadowServerAppManifest.commands.find((item) => item.name === command)
  return {
    protocol: 'shadow.app/1',
    serverId: 'local',
    serverAppId: 'local',
    appKey: shadowServerAppManifest.appKey,
    command,
    actor: {
      kind: 'local',
      userId: 'local',
      profile: {
        id: 'local',
        displayName: 'Local Coder',
        avatarUrl: null,
      },
    },
    permission: manifestCommand?.permission ?? 'local',
    action: manifestCommand?.action ?? 'read',
    dataClass: manifestCommand?.dataClass ?? 'server-private',
  }
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="#2563eb"/>
  <path d="m34 32-14 16 14 16M62 32l14 16-14 16" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="m53 24-10 48" stroke="#bfdbfe" stroke-width="7" stroke-linecap="round"/>
</svg>`
}

async function proxyViteDevAsset(requestUrl: string) {
  const viteDevServerUrl = process.env.TRAINER_VITE_DEV_SERVER_URL?.replace(/\/+$/, '')
  if (!viteDevServerUrl) return null

  const url = new URL(requestUrl)
  const upstream = await fetch(`${viteDevServerUrl}${url.pathname}${url.search}`)
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  })
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))
app.get('/@fs/*', async (c) => (await proxyViteDevAsset(c.req.url)) ?? c.notFound())
app.get('/assets/*', serveStatic({ root: './dist/client' }))
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))

app.post('/api/local/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
  const result = await shadowApp.executeLocal(name, body.input ?? {}, localContext(name), commands)
  return c.json(result.body, result.status as 200)
})

app.post('/api/shadow/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const result = await shadowApp.executeCommand(
    name,
    {
      authorizationHeader: c.req.header('authorization'),
      serverIdHeader: c.req.header('X-Shadow-Server-Id'),
      appKeyHeader: c.req.header('X-Shadow-App-Key'),
      requestBody: await c.req.text(),
    },
    commands,
  )
  return c.json(result.body, result.status as 200)
})

serve({ fetch: app.fetch, port })

console.log(`Code Trainer listening on http://localhost:${port}`)
