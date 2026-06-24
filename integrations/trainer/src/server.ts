import 'dotenv/config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  deliverShadowServerAppLaunchOutbox,
  fetchShadowServerAppLaunchInboxes,
  hasShadowServerAppPendingOutbox,
  resolveShadowServerAppLaunchCommandContext,
  type ShadowServerAppCommandHandlerContext,
  type ShadowServerAppCommandName,
  ShadowServerAppOutbox,
} from '@shadowob/sdk'
import { type Context, Hono } from 'hono'
import {
  accessFromActor,
  analyzeSubmission,
  createCheck,
  createRecommendation,
  createReport,
  createSubmission,
  createTip,
  getChallenge,
  getSubmission,
  latestRecommendation,
  learningOverview,
  listChallenges,
  listSubmissions,
  pendingSubmissions,
  scheduleWrongProblem,
  type TrainerAccess,
  updateSkillState,
  upsertChallenge,
  upsertTrainerSettings,
  upsertTrainingList,
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
  Recommendation,
  SubmissionCoachingFocus,
  SubmissionOutcome,
  SubmissionReviewFocus,
} from './types.js'
import { shellPage } from './ui.js'

type TrainerCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fromAppRoot = (...segments: string[]) => resolve(appRoot, ...segments)
const iconCacheControl = 'public, max-age=3600'

function shadowApiBaseUrl() {
  return (process.env.SHADOW_SERVER_URL ?? 'http://localhost:3002').replace(/\/$/, '')
}

function shadowLaunchToken(c: Context) {
  return c.req.header('X-Shadow-Launch-Token') ?? ''
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function errorPayload(error: unknown) {
  const record = recordValue(error)
  const payload = recordValue(record?.payload)
  const source = payload ?? record
  const message =
    (typeof source?.error === 'string' && source.error) ||
    (typeof source?.message === 'string' && source.message) ||
    (error instanceof Error ? error.message : 'Command failed')
  return {
    ok: false,
    error: message,
    ...(typeof source?.code === 'string' ? { code: source.code } : {}),
    ...(source?.params ? { params: source.params } : {}),
  }
}

function errorStatus(error: unknown) {
  const status = recordValue(error)?.status
  return typeof status === 'number' && status >= 400 && status < 600 ? status : 500
}

async function runtimeInboxes(c: Context) {
  const token = shadowLaunchToken(c)
  if (!token) return c.json({ ok: false, error: 'launch_required' }, 401)
  try {
    return c.json(
      await fetchShadowServerAppLaunchInboxes({
        launchToken: token,
        shadowApiBaseUrl: shadowApiBaseUrl(),
      }),
    )
  } catch (error) {
    return c.json(errorPayload(error), errorStatus(error) as 500)
  }
}

async function deliverLaunchOutbox(c: Context, commandName: string, result: { body: unknown }) {
  const token = shadowLaunchToken(c)
  if (!token || !hasShadowServerAppPendingOutbox(result.body)) return result.body
  return deliverShadowServerAppLaunchOutbox({
    launchToken: token,
    commandName,
    result: result.body,
    shadowApiBaseUrl: shadowApiBaseUrl(),
  })
}

export const app = new Hono()
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

function reviewTaskPriority(submission: CodeSubmission): 'medium' | 'high' {
  const focus = submission.reviewRequest?.reviewFocus
  return focus === 'debug' || focus === 'interview' ? 'high' : 'medium'
}

function reviewTaskAssigneeLabel(reviewRequest: NonNullable<CodeSubmission['reviewRequest']>) {
  return (
    reviewRequest.displayName?.trim() ||
    reviewRequest.assigneeLabel?.trim() ||
    reviewRequest.agentId?.trim() ||
    'Buddy'
  )
}

function immediateFeedbackProtocol(submission: CodeSubmission, locale: TaskLocale) {
  const label = submission.reviewRequest
    ? reviewTaskAssigneeLabel(submission.reviewRequest)
    : 'Buddy'
  if (locale === 'zh') {
    return [
      '即时反馈协议：',
      `- 先 claim 这个 Inbox 任务，并在 60 秒内用 ${label} 身份回复一句收到，例如“我已收到，会先跑示例和边界用例，结果写回 Code Trainer”。`,
      '- 如果评审超过 3 分钟，补一条简短进度说明，让学习者知道你还在运行用例或定位问题。',
      '- 写回 submissions.analyze 后，标记任务完成，并在代码复盘频道给出结论、分数和下一步，不要让用户只看见静默等待。',
    ].join('\n')
  }
  return [
    'Immediate feedback protocol:',
    `- Claim this Inbox task first, then reply as ${label} within 60 seconds with a short acknowledgement, e.g. "Got it. I am running examples and edge cases, then I will write the result back to Code Trainer."`,
    '- If the review takes more than 3 minutes, post a brief progress note so the learner knows the sandbox or diagnosis is still running.',
    '- After writing submissions.analyze, mark the task complete and post the verdict, score, and next action to the code review channel. Do not leave the learner in silent waiting.',
  ].join('\n')
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
      immediateFeedbackProtocol(submission, locale),
      '',
      '工作流：',
      `1. 使用 trainer submissions.get 和 {"submissionId":"${submission.id}"} 获取提交。`,
      '2. 在你的沙箱里运行可见示例、隐藏用例和必要边界用例。不要把判题委托给在线评测平台。',
      '3. 使用 trainer submissions.analyze 写回评审结果。',
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
    immediateFeedbackProtocol(submission, locale),
    '',
    'Workflow:',
    `1. Fetch the submission with trainer submissions.get using {"submissionId":"${submission.id}"}.`,
    '2. Run the visible examples plus hidden and edge cases in your sandbox. Do not delegate judging to an online judge.',
    '3. Write the result back with trainer submissions.analyze.',
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
  const assigneeLabel = reviewTaskAssigneeLabel(reviewRequest)

  return {
    title:
      locale === 'zh' ? `评审「${challenge.title}」提交` : `Review ${challenge.title} submission`,
    body: reviewTaskBody(submission, challenge),
    priority: reviewTaskPriority(submission),
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
      immediateFeedback: {
        expectedAck: 'claim_and_acknowledge',
        ackWithinSeconds: 60,
        ackMessage:
          locale === 'zh'
            ? `${assigneeLabel}已收到「${challenge.title}」提交，会先跑示例和边界用例，结果写回 Code Trainer。`
            : `${assigneeLabel} has picked up the ${challenge.title} submission and is running examples and edge cases before writing the result back to Code Trainer.`,
        progressAfterSeconds: 180,
        finalChannel: 'code-review',
        finalChannelName: locale === 'zh' ? '代码复盘' : 'code review',
        finalCommand: 'submissions.analyze',
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

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function optionalTextList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => optionalText(item))
      .filter((item): item is string => Boolean(item))
      .slice(0, 12)
  }
  const single = optionalText(value)
  return single ? [single] : undefined
}

function outcomeFromAlias(input: Record<string, unknown>): SubmissionOutcome {
  const explicit = optionalText(input.outcome)
  if (
    explicit === 'accepted' ||
    explicit === 'needs_work' ||
    explicit === 'runtime_error' ||
    explicit === 'incomplete'
  ) {
    return explicit
  }
  const verdict = optionalText(input.verdict)?.toLowerCase()
  if (verdict) {
    if (['accepted', 'accept', 'pass', 'passed', 'success', 'correct'].includes(verdict)) {
      return 'accepted'
    }
    if (['runtime_error', 'runtime error', 'error', 'exception'].includes(verdict)) {
      return 'runtime_error'
    }
    if (['incomplete', 'partial', 'missing'].includes(verdict)) return 'incomplete'
    if (['needs_work', 'needs work', 'wrong', 'failed', 'fail', 'incorrect'].includes(verdict)) {
      return 'needs_work'
    }
  }
  const score = typeof input.score === 'number' ? input.score : Number.NaN
  if (Number.isFinite(score) && score >= 90) return 'accepted'
  if (Number.isFinite(score) && score < 40) return 'incomplete'
  return 'needs_work'
}

function normalizeAnalyzeInput(input: Record<string, unknown>) {
  const hints = optionalTextList(input.hints)
  const suggestions = optionalTextList(input.suggestions) ?? hints
  const diagnosis = optionalText(input.diagnosis)
  const fallbackExplanation = [diagnosis, hints?.length ? `Hints: ${hints.join(' ')}` : undefined]
    .filter(Boolean)
    .join('\n\n')
  const explanation =
    optionalText(input.explanation) ??
    optionalText(fallbackExplanation) ??
    optionalText(input.summary) ??
    'Buddy analysis was submitted without a detailed explanation.'
  const summary =
    optionalText(input.summary) ??
    diagnosis ??
    optionalText(input.verdict) ??
    explanation.slice(0, 240)
  const outcome = outcomeFromAlias(input)
  return {
    ...input,
    submissionId: optionalText(input.submissionId) ?? '',
    outcome,
    score:
      typeof input.score === 'number' && Number.isFinite(input.score)
        ? input.score
        : outcome === 'accepted'
          ? 100
          : 70,
    summary,
    explanation,
    ...(suggestions ? { suggestions } : {}),
    ...(optionalText(input.complexity) ? { complexity: optionalText(input.complexity) } : {}),
  }
}

function recommendationCard(recommendation: Recommendation, locale: TaskLocale) {
  const ack =
    typeof recommendation.predictedAckRate === 'number'
      ? locale === 'zh'
        ? `预估通过率 ${recommendation.predictedAckRate}%`
        : `Estimated ACK ${recommendation.predictedAckRate}%`
      : null
  const strategyLabel =
    locale === 'zh'
      ? {
          reinforce: '巩固',
          diversify: '多样性',
          review: '复习',
          popular: '热门补齐',
        }[recommendation.strategy ?? 'reinforce']
      : {
          reinforce: 'Reinforce',
          diversify: 'Diversify',
          review: 'Review',
          popular: 'Popular coverage',
        }[recommendation.strategy ?? 'reinforce']
  return {
    kind: 'server_app',
    version: 1,
    appKey: 'trainer',
    title:
      locale === 'zh'
        ? `下一题：${recommendation.challengeTitle}`
        : `Next problem: ${recommendation.challengeTitle}`,
    description: [strategyLabel, recommendation.reason, ack].filter(Boolean).join(' · '),
    label: locale === 'zh' ? '打开并开始' : 'Open and start',
    action: {
      mode: 'open_app',
      path: recommendation.appPath ?? `/problems/${recommendation.challengeId}`,
    },
    data: {
      recommendationId: recommendation.id,
      challengeId: recommendation.challengeId,
      strategy: recommendation.strategy ?? 'reinforce',
      predictedAckRate: recommendation.predictedAckRate,
      source: recommendation.source,
    },
  }
}

function recommendationMessage(recommendation: Recommendation, locale: TaskLocale) {
  const ack =
    typeof recommendation.predictedAckRate === 'number'
      ? locale === 'zh'
        ? `预估通过率 ${recommendation.predictedAckRate}%`
        : `estimated ACK ${recommendation.predictedAckRate}%`
      : null
  if (locale === 'zh') {
    return [
      `下一题推荐：**${recommendation.challengeTitle}**`,
      recommendation.reason,
      ack ? `难度控制：${ack}。` : '',
      recommendation.source
        ? `如果本地题库没有合适变式，先打开 Import 搜索 ${recommendation.source.provider}。`
        : '',
    ]
      .filter(Boolean)
      .join('\n')
  }
  return [
    `Next recommendation: **${recommendation.challengeTitle}**`,
    recommendation.reason,
    ack ? `Difficulty control: ${ack}.` : '',
    recommendation.source
      ? `If the local library lacks a good variant, open Import and search ${recommendation.source.provider}.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
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
    const access = commandAccess(context)
    const submission = analyzeSubmission({
      ...normalizeAnalyzeInput(input),
      access,
      analyzer: context.actor,
    })
    if (!submission) throw shadowApp.error(404, 'submission_not_found')
    const recommendation = latestRecommendation(access)
    if (submission.analysis?.outcome !== 'accepted' || !recommendation) {
      return { submission }
    }
    const locale = taskLocale(submission)
    return new ShadowServerAppOutbox()
      .sendChannelMessage({
        channelName: locale === 'zh' ? '代码复盘' : 'code review',
        content: recommendationMessage(recommendation, locale),
        idempotencyKey: `trainer:next-recommendation:${submission.id}`,
        metadata: {
          cards: [recommendationCard(recommendation, locale)],
          custom: {
            trainerRecommendation: {
              submissionId: submission.id,
              recommendationId: recommendation.id,
            },
          },
        },
      })
      .attachTo({ submission, recommendation })
  },
  'learning.overview': (_input, context) => ({
    overview: learningOverview(commandAccess(context)),
  }),
  'settings.upsert': (input, context) => {
    const access = commandAccess(context)
    requireOwnerAccess(access)
    return { settings: upsertTrainerSettings(input, access) }
  },
  'learning.plan.upsert': (input, context) => ({
    list: upsertTrainingList(input, commandAccess(context)),
  }),
  'skills.update': (input, context) => ({
    skill: updateSkillState(input, commandAccess(context)),
  }),
  'recommendations.create': (input, context) => {
    const recommendation = createRecommendation(input, commandAccess(context))
    if (!recommendation) throw shadowApp.error(404, 'challenge_not_found')
    return { recommendation }
  },
  'tips.create': (input, context) => ({
    tip: createTip(input, commandAccess(context)),
  }),
  'checks.create': (input, context) => ({
    check: createCheck(input, commandAccess(context)),
  }),
  'reports.create': (input, context) => ({
    report: createReport(input, commandAccess(context)),
  }),
  'wrongProblems.schedule': (input, context) => {
    const wrongProblem = scheduleWrongProblem(input, commandAccess(context))
    if (!wrongProblem) throw shadowApp.error(404, 'challenge_not_found')
    return { wrongProblem }
  },
})

function commandName(value: string): TrainerCommandName | null {
  return commandNames.has(value) ? (value as TrainerCommandName) : null
}

async function runtimeContext(command: TrainerCommandName, c: Context) {
  const launchToken = shadowLaunchToken(c)
  if (!launchToken) {
    throw Object.assign(new Error('launch_required'), {
      status: 401,
      payload: { error: 'launch_required' },
    })
  }
  const context = await resolveShadowServerAppLaunchCommandContext({
    launchToken,
    commandName: command,
    manifest: shadowServerAppManifest,
    shadowApiBaseUrl: shadowApiBaseUrl(),
  })
  if (!context) {
    throw Object.assign(new Error('invalid_launch_token'), {
      status: 401,
      payload: { error: 'invalid_launch_token' },
    })
  }
  return context
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
app.get('/assets/icon.svg', (c) =>
  c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': iconCacheControl }),
)
app.get('/@fs/*', async (c) => (await proxyViteDevAsset(c.req.url)) ?? c.notFound())
app.get('/assets/cover.png', serveStatic({ root: fromAppRoot('public') }))
app.get('/assets/*', serveStatic({ root: fromAppRoot('dist/client') }))
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))
app.get('/api/runtime/inboxes', runtimeInboxes)

app.post('/api/runtime/commands/:commandName', async (c) => {
  try {
    const name = commandName(c.req.param('commandName'))
    if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
    const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
    const context = await runtimeContext(name, c)
    const result = await shadowApp.executeLocal(name, body.input ?? {}, context, commands)
    const bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
    return c.json(bodyWithDeliveries, result.status as 200)
  } catch (error) {
    return c.json(errorPayload(error), errorStatus(error) as 500)
  }
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

export function startStandalone() {
  serve({ fetch: app.fetch, port })
  console.log(`Code Trainer listening on http://localhost:${port}`)
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  startStandalone()
}
