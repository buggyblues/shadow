import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  type ShadowServerAppCommandContext,
  type ShadowServerAppCommandHandlerContext,
  type ShadowServerAppCommandName,
  ShadowServerAppOutbox,
} from '@shadowob/sdk'
import { Hono } from 'hono'
import {
  accessFromActor,
  analyzeSubmission,
  createSubmission,
  getChallenge,
  getSubmission,
  listChallenges,
  listSubmissions,
  pendingSubmissions,
  type TrainerAccess,
  upsertChallenge,
} from './data.js'
import { manifest, shadowApp } from './manifest.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import {
  importExternalChallenge,
  refreshImportedCodeforcesChallenge,
  searchExternalChallenges,
} from './sources.js'
import type {
  Challenge,
  CodeSubmission,
  SubmissionCoachingFocus,
  SubmissionReviewFocus,
} from './types.js'
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

type TaskLocale = 'en' | 'zh'

const defaultCoachingFocuses: SubmissionCoachingFocus[] = [
  'reasoning',
  'edge_cases',
  'complexity',
  'communication',
]

const coachingFocusCopy: Record<
  SubmissionCoachingFocus,
  { en: string; zh: string; instructionEn: string; instructionZh: string }
> = {
  reasoning: {
    en: 'reasoning clarity',
    zh: '思路清晰度',
    instructionEn: 'Check whether the learner can explain the invariant and proof path.',
    instructionZh: '检查学习者能否讲清不变量、证明路径和关键判断。',
  },
  edge_cases: {
    en: 'edge cases',
    zh: '边界用例',
    instructionEn: 'Probe boundary inputs and ask which case would break the solution first.',
    instructionZh: '追问边界输入，并指出哪个用例最先击穿当前解法。',
  },
  complexity: {
    en: 'complexity',
    zh: '复杂度',
    instructionEn: 'Make the learner state time and space cost, plus the reason for each term.',
    instructionZh: '要求学习者说明时间和空间复杂度，并解释每一项成本来源。',
  },
  communication: {
    en: 'communication',
    zh: '表达结构',
    instructionEn:
      'Coach a concise spoken answer with problem restatement, idea, proof, and tests.',
    instructionZh: '辅导一段清晰口述回答，包含题意复述、核心思路、正确性和测试。',
  },
  follow_ups: {
    en: 'follow-up questions',
    zh: '追问扩展',
    instructionEn: 'Ask one realistic follow-up and describe what a strong answer should cover.',
    instructionZh: '提出一个真实面试追问，并说明优秀回答应覆盖什么。',
  },
  debugging: {
    en: 'debugging process',
    zh: '调试过程',
    instructionEn: 'Have the learner trace the first wrong state before discussing the fix.',
    instructionZh: '先让学习者追踪第一个错误状态，再讨论修复方式。',
  },
}

function taskLocale(submission: CodeSubmission): TaskLocale {
  const locale = submission.reviewRequest?.locale?.toLowerCase() ?? ''
  return locale.startsWith('zh') ? 'zh' : 'en'
}

function selectedCoachingFocuses(submission: CodeSubmission) {
  const focuses = submission.reviewRequest?.coachingFocuses ?? []
  return focuses.length ? focuses : defaultCoachingFocuses
}

function reviewFocusLabel(value?: SubmissionReviewFocus, locale: TaskLocale = 'en') {
  if (locale === 'zh') {
    if (value === 'interview') return '面试辅导'
    if (value === 'debug') return '调试提示'
    if (value === 'complexity') return '复杂度与取舍评审'
    return '沙箱正确性评审'
  }
  if (value === 'interview') return 'interview coaching'
  if (value === 'debug') return 'debugging hints'
  if (value === 'complexity') return 'complexity and tradeoff review'
  return 'sandbox correctness review'
}

function reviewFocusInstruction(submission: CodeSubmission, locale: TaskLocale) {
  const focus = submission.reviewRequest?.reviewFocus
  if (focus === 'interview') {
    const details = selectedCoachingFocuses(submission)
      .map((item) =>
        locale === 'zh'
          ? `- ${coachingFocusCopy[item].zh}: ${coachingFocusCopy[item].instructionZh}`
          : `- ${coachingFocusCopy[item].en}: ${coachingFocusCopy[item].instructionEn}`,
      )
      .join('\n')
    return locale === 'zh'
      ? `重点做面试辅导：指出思路缺口，给一个追问，并提供一段可白板讲解的表达路径。\n${details}`
      : `Focus on interview readiness: point out the reasoning gap, ask one follow-up question, and include a short whiteboard explanation path.\n${details}`
  }
  if (focus === 'debug') {
    return locale === 'zh'
      ? '重点做调试辅导：找出最小失败用例，解释第一个错误状态，并先给提示再给直接修复建议。'
      : 'Focus on debugging: identify the smallest failing case, explain the first wrong state, and give hints before any direct fix.'
  }
  if (focus === 'complexity') {
    return locale === 'zh'
      ? '重点做复杂度评审：验证渐进成本，解释取舍，并说明何时值得换数据结构或算法。'
      : 'Focus on complexity: verify asymptotic cost, explain tradeoffs, and mention when an alternative data structure would be justified.'
  }
  return locale === 'zh'
    ? '重点做沙箱正确性评审：运行用例，定位正确性缺口，并解释核心不变量。'
    : 'Focus on sandbox correctness: run cases, identify correctness gaps, and explain the core invariant.'
}

function reviewTaskBody(submission: CodeSubmission, challenge: Challenge) {
  const locale = taskLocale(submission)
  const examples = challenge.examples
    .slice(0, 5)
    .map((example, index) => {
      const lines =
        locale === 'zh'
          ? [`示例 ${index + 1}`, `输入：${example.input}`, `输出：${example.output}`]
          : [`Case ${index + 1}`, `Input: ${example.input}`, `Output: ${example.output}`]
      if (example.explanation) {
        lines.push(
          locale === 'zh' ? `解释：${example.explanation}` : `Explanation: ${example.explanation}`,
        )
      }
      return lines.join('\n')
    })
    .join('\n\n')
  const testCases = (challenge.testCases ?? [])
    .slice(0, 40)
    .map((testCase, index) => {
      const label =
        locale === 'zh'
          ? testCase.visibility === 'hidden'
            ? '隐藏'
            : '可见'
          : testCase.visibility === 'hidden'
            ? 'Hidden'
            : 'Visible'
      const suffix = testCase.description ? `: ${testCase.description}` : ''
      return locale === 'zh'
        ? [
            `${label}用例 ${index + 1}${suffix}`,
            `输入：${testCase.input}`,
            `期望：${testCase.expected}`,
          ].join('\n')
        : [
            `${label} case ${index + 1}${suffix}`,
            `Input: ${testCase.input}`,
            `Expected: ${testCase.expected}`,
          ].join('\n')
    })
    .join('\n\n')

  if (locale === 'zh') {
    return [
      `请评审提交 ${submission.id}，题目是「${challenge.title}」。`,
      '',
      '工作流：',
      `1. 使用 shadow-trainer submissions.get 和 {"submissionId":"${submission.id}"} 获取提交。`,
      '2. 在你的沙箱里运行可见示例、隐藏用例和必要边界用例。不要把判题委托给在线评测平台。',
      '3. 使用 shadow-trainer submissions.analyze 写回评审结果。',
      '',
      '反馈要求：',
      '- 给出结论、分数和简洁的问题诊断。',
      '- 解释核心算法思路以及为什么它成立。',
      '- 说明时间复杂度和空间复杂度。',
      '- 给出有针对性的修复建议和面试准备提醒。',
      '- 不要直接粘贴完整最终答案。保留练习价值，只给诊断、提示和下一步。',
      '',
      `评审模式：${reviewFocusLabel(submission.reviewRequest?.reviewFocus, locale)}。`,
      reviewFocusInstruction(submission, locale),
      '',
      `提交语言：${submission.language}`,
      challenge.source?.url ? `来源链接：${challenge.source.url}` : '',
      `题目描述：${clipForTask(challenge.prompt, 1400)}`,
      examples ? `可见示例：\n${clipForTask(examples, 1800)}` : '',
      testCases ? `沙箱用例：\n${clipForTask(testCases, 5000)}` : '',
      `判题备注：${clipForTask(challenge.judgeInstructions, 1400)}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

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
    `Review focus: ${reviewFocusLabel(submission.reviewRequest?.reviewFocus, locale)}.`,
    reviewFocusInstruction(submission, locale),
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
  const locale = taskLocale(submission)

  return {
    title:
      locale === 'zh' ? `评审「${challenge.title}」提交` : `Review ${challenge.title} submission`,
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
        ...(locale === 'zh'
          ? ['沙箱用例执行', '算法正确性反馈', '复杂度解释', '面试准备指导']
          : [
              'sandbox test execution',
              'algorithm correctness feedback',
              'complexity explanation',
              'interview preparation guidance',
            ]),
        reviewFocusLabel(reviewRequest.reviewFocus, locale),
      ],
    },
    required: false,
  }
}

function commandAccess(handlerContext: ShadowServerAppCommandHandlerContext): TrainerAccess {
  return accessFromActor({
    serverId: handlerContext.context.serverId,
    actor: handlerContext.actor,
  })
}

function requireOwnerAccess(access: TrainerAccess) {
  if (access.isBuddy) throw shadowApp.error(403, 'owner_actor_required')
}

const commands = shadowApp.defineCommands({
  'challenges.list': (input, context) => ({
    challenges: listChallenges(input, commandAccess(context)),
  }),
  'challenges.get': async (input, context) => {
    const access = commandAccess(context)
    const result = getChallenge(input.challengeId, access)
    if (!result) throw shadowApp.error(404, 'challenge_not_found')
    const refreshed = await refreshImportedCodeforcesChallenge(result.challenge, access)
    return refreshed ? (getChallenge(refreshed.id, access) ?? result) : result
  },
  'challenges.upsert': (input, context) => {
    const access = commandAccess(context)
    requireOwnerAccess(access)
    return { challenge: upsertChallenge(input, access) }
  },
  'sources.search': (input) => searchExternalChallenges(input),
  'sources.import': (input, context) => {
    const access = commandAccess(context)
    requireOwnerAccess(access)
    return importExternalChallenge(input, access)
  },
  'submissions.create': (input, context) => {
    if (!input.reviewer?.agentId && !input.reviewer?.assigneeLabel) {
      throw shadowApp.error(422, 'reviewer_required')
    }
    const access = commandAccess(context)
    const submission = createSubmission({
      ...input,
      access,
      author: context.actor,
    })
    if (!submission) throw shadowApp.error(404, 'challenge_not_found')
    const challenge = getSubmission(submission.id, access)?.challenge
    const task = challenge ? reviewInboxTask(submission, challenge) : null
    return task
      ? new ShadowServerAppOutbox().enqueueInboxTask(task).attachTo({ submission })
      : { submission }
  },
  'submissions.list': (input, context) => ({
    submissions: listSubmissions(input, commandAccess(context)),
  }),
  'submissions.get': (input, context) => {
    const result = getSubmission(input.submissionId, commandAccess(context))
    if (!result) throw shadowApp.error(404, 'submission_not_found')
    return result
  },
  'submissions.pending': (input, context) => ({
    submissions: pendingSubmissions(input, commandAccess(context)),
  }),
  'submissions.analyze': (input, context) => {
    const submission = analyzeSubmission({
      ...input,
      access: commandAccess(context),
      analyzer: context.actor,
    })
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
