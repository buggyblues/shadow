import { Agent, type AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { BASE_PLUGIN_IDS, MAX_PROMPT_TEXT } from './config'
import {
  buildAgentReport,
  buildMatchedPlugins,
  buildReferenceTemplates,
  compileTemplateDsl,
  ensureReliableTemplate,
  listDiyCloudPlugins,
  listDiyCloudTemplates,
  pickKnownPluginIds,
  readDslBuddy,
  readDslChannels,
  readDslGuidebook,
  requiredKeysForPlugins,
  scoreFromAnswer,
  selectedPlugins,
  toolTrace,
} from './dsl'
import { decisionEvidence, handlePiAgentEvent } from './events'
import {
  createDiyCloudPiModel,
  diyCloudOpenAiStream,
  generatorApiKey,
  generatorModel,
} from './model-stream'
import {
  buildDiyCloudEvidenceFinalizationPrompt,
  buildDiyCloudFinalizationPrompt,
  buildDiyCloudSystemPrompt,
  buildDiyCloudUserPrompt,
} from './prompts'
import { createDiyCloudTools } from './tools'
import type {
  AgentFinalAnswer,
  DiyCloudDraft,
  DiyCloudGenerateInput,
  DiyCloudGenerationOptions,
  DiyCloudProgressStatus,
  DiyCloudStepId,
  DiyCloudToolExecution,
  DiyTemplateDsl,
} from './types'
import {
  assertNotAborted,
  buildStepOutput,
  compactText,
  emitDraft,
  emitProgress,
  invalidFinalPlan,
  parseFinalAnswer,
  progressForStep,
  readDecisionReasons,
} from './utils'

const INITIAL_AGENT_TIMEOUT_MS = 45_000
const FINALIZER_TIMEOUT_MS = 20_000
const MAX_REPAIR_ATTEMPTS = 0

function promptTooShort(): never {
  throw Object.assign(new Error('Prompt is too short'), {
    status: 400,
    code: 'DIY_PROMPT_TOO_SHORT',
  })
}

function extractText(message: AssistantMessage) {
  return message.content
    .map((item) => (item.type === 'text' ? item.text : ''))
    .filter(Boolean)
    .join('\n')
}

function extractFinalAnswer(agent: Agent): AgentFinalAnswer | null {
  const messages = agent.state.messages
  const assistantMessages = messages.filter(
    (message): message is AssistantMessage => message.role === 'assistant',
  )
  for (const message of assistantMessages.slice().reverse()) {
    const toolCalls = message.content.filter((item) => item.type === 'toolCall')
    if (toolCalls.length > 0) continue
    const answer = parseFinalAnswer(extractText(message))
    if (answer) return answer
  }
  return null
}

function failModelRun(message: string): never {
  throw Object.assign(new Error(message), {
    status: 502,
    code: 'DIY_CLOUD_MODEL_REQUEST_FAILED',
  })
}

function modelTimeout(message: string) {
  return Object.assign(new Error(message), {
    status: 504,
    code: 'DIY_CLOUD_MODEL_TIMEOUT',
  })
}

async function promptAgentWithTimeout(
  agent: Agent,
  prompt: string | AgentMessage | AgentMessage[],
  ms: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = typeof prompt === 'string' ? agent.prompt(prompt) : agent.prompt(prompt)
  void run.catch(() => undefined)
  try {
    await Promise.race([
      run,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          agent.abort()
          reject(modelTimeout('DIY Cloud model timed out while finalizing the plan'))
        }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function assertAgentModelSucceeded(agent: Agent) {
  if (agent.state.errorMessage) failModelRun(agent.state.errorMessage)
}

function hasUsableFinalAnswer(answer: AgentFinalAnswer | null): answer is AgentFinalAnswer {
  return Boolean(answer?.dsl && Object.keys(answer.dsl).length > 0)
}

function hasItems(value: unknown) {
  return Array.isArray(value) && value.length > 0
}

function publicProgressForStep(
  answer: AgentFinalAnswer,
  step: DiyCloudStepId,
  fallbackTitle: string,
  fallbackDetail: string,
) {
  const progress = progressForStep(answer, step)
  return {
    title: progress?.title || fallbackTitle,
    detail: progress?.detail || fallbackDetail,
    basis: progress?.basis ?? [],
  }
}

function stepReasons(answer: AgentFinalAnswer, step: DiyCloudStepId) {
  return [...(progressForStep(answer, step)?.basis ?? []), ...readDecisionReasons(answer, step)]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function executionItems(result: unknown) {
  if (Array.isArray(result)) return result
  const record = asRecord(result)
  for (const key of ['plugins', 'templates', 'requiredKeys', 'items']) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  return Object.keys(record).length > 0 ? [record] : []
}

function namedRecord(value: unknown, key: 'id' | 'slug') {
  const record = asRecord(value)
  const id = record[key]
  return typeof id === 'string' && id.trim() ? record : null
}

function lastPluginSelection(executions: DiyCloudToolExecution[]) {
  for (const execution of executions.slice().reverse()) {
    for (const key of ['selectedPluginIds', 'pluginIds']) {
      const value = execution.args[key]
      if (Array.isArray(value)) {
        const ids = value.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        )
        if (ids.length > 0) return ids
      }
    }
  }
  const inspected = executions
    .filter((execution) => execution.name === 'inspect_plugin')
    .map((execution) => namedRecord(execution.result, 'id')?.id)
    .filter((id): id is string => typeof id === 'string')
  return inspected
}

function fallbackTemplateSlugs(executions: DiyCloudToolExecution[]) {
  const slugs = new Set<string>()
  for (const execution of executions) {
    if (execution.name !== 'inspect_template' && execution.name !== 'search_templates') continue
    for (const item of executionItems(execution.result)) {
      const slug = namedRecord(item, 'slug')?.slug
      if (typeof slug === 'string' && slug.trim()) slugs.add(slug)
    }
  }
  return [...slugs].slice(0, 3)
}

function fallbackTitle(input: DiyCloudGenerateInput) {
  const prompt = compactText(input.prompt, 80)
  if (/competitor|growth|report|drive/i.test(prompt)) return 'Growth Intelligence Workspace'
  return prompt ? `${prompt.slice(0, 56)} Workspace` : 'DIY Cloud Workspace'
}

function fallbackDsl(input: DiyCloudGenerateInput, selectedPluginIds: string[]): DiyTemplateDsl {
  const title = fallbackTitle(input)
  const usesDrive = selectedPluginIds.includes('google-workspace')
  const usesCrawler = selectedPluginIds.some((id) => ['firecrawl', 'seo-suite'].includes(id))
  const channels = [
    usesCrawler ? 'Competitor Monitor' : 'Research',
    'Weekly Reports',
    usesDrive ? 'Drive Library' : 'Knowledge Base',
  ]
  const skills = [
    usesCrawler
      ? 'Collect competitor signals with approved search tools'
      : 'Collect source evidence',
    'Summarize findings into a weekly growth report',
    usesDrive ? 'Organize drafts and evidence in Google Drive' : 'Organize drafts and evidence',
    'Ask for approval before external writes',
  ]
  return {
    title,
    description:
      'A focused growth workspace for competitor monitoring, weekly report drafting, and document collaboration.',
    space: {
      servers: [
        {
          name: title,
          channels: channels.map((name) => ({
            name,
            purpose:
              name === 'Weekly Reports'
                ? 'Draft and review weekly growth reports'
                : name === 'Drive Library'
                  ? 'Track Drive documents, briefs, and reusable evidence'
                  : 'Collect and review market signals',
          })),
        },
      ],
    },
    buddies: [
      {
        name: 'Growth Ops Buddy',
        role: 'Monitor competitors, organize evidence, draft weekly reports, and coordinate document workflows.',
        systemPrompt:
          'You are a growth operations analyst. Track competitor and market evidence, separate facts from assumptions, draft concise weekly reports, and request confirmation before write actions or external publication.',
        skills,
        channelBindings: channels,
      },
    ],
    integrations: selectedPluginIds.map((pluginId) => ({
      pluginId,
      purpose:
        pluginId === 'google-workspace'
          ? 'Connect Google Drive, Docs, Sheets, Gmail, and Calendar evidence workflows.'
          : pluginId === 'firecrawl'
            ? 'Collect structured public web evidence for competitor monitoring.'
            : pluginId === 'seo-suite'
              ? 'Analyze search and competitor visibility signals.'
              : 'Support the generated workspace runtime.',
      required: !BASE_PLUGIN_IDS.includes(pluginId as (typeof BASE_PLUGIN_IDS)[number]),
    })),
    guidebook: {
      summary:
        'Use the workspace to collect competitor signals, review evidence, draft a weekly report, and keep source documents organized.',
      beforeDeploy: [
        'Prepare Google Workspace credentials if Drive or Docs automation is required.',
        'Prepare web or SEO data-source credentials for competitor monitoring integrations.',
        'Review channel names and Buddy instructions before deployment.',
      ],
      howToUse: [
        'Drop competitor links, observations, and report requests into the monitoring channel.',
        'Ask the Buddy to prepare a weekly report draft with cited evidence.',
        'Review the draft before any external sharing or write action.',
      ],
      reviewNotes: [
        'The plan uses inspected plugin evidence and avoids unrelated design plugins.',
        'Credentials can be skipped only if the matching integration is removed before deployment.',
      ],
    },
    review: {
      assumptions: [
        'Competitor monitoring can rely on approved public web or SEO data sources.',
        'Weekly reports are drafted inside the workspace before external distribution.',
      ],
      risks: ['Some external connectors require credentials before deployment.'],
      openQuestions: ['Which competitors and report recipients should be configured first?'],
    },
    score: 82,
  }
}

function buildFallbackAnswerFromToolEvidence(
  input: DiyCloudGenerateInput,
  executions: DiyCloudToolExecution[],
): AgentFinalAnswer {
  const selectedPluginIds = pickKnownPluginIds(lastPluginSelection(executions), [])
  const inspectedPlugins = executions
    .filter((execution) => execution.name === 'inspect_plugin')
    .map((execution) => namedRecord(execution.result, 'id'))
    .filter((record): record is Record<string, unknown> => Boolean(record))
  const selectedTemplateSlugs = fallbackTemplateSlugs(executions)
  const pluginNames = inspectedPlugins
    .map((plugin) => (typeof plugin.name === 'string' ? plugin.name : plugin.id))
    .filter((value): value is string => typeof value === 'string')
  const dsl = fallbackDsl(input, selectedPluginIds)
  return {
    intent: compactText(input.prompt, 300),
    progress: [
      {
        step: 'think',
        title: 'Goal understood',
        detail:
          'I am turning the request into a concrete workspace goal before choosing any capability.',
        basis: [compactText(input.prompt, 220)],
      },
      {
        step: 'search',
        title: 'Capability evidence reviewed',
        detail:
          'I am keeping only integrations whose inspected evidence supports the requested workflow.',
        basis: pluginNames.slice(0, 3),
      },
      {
        step: 'generate',
        title: 'Workspace structure prepared',
        detail:
          'I am organizing the selected capabilities into channels, Buddy behavior, and runtime configuration.',
        basis: selectedPluginIds.slice(0, 4),
      },
      {
        step: 'validate',
        title: 'Deployability checked',
        detail:
          'I am checking the generated structure and required setup before returning the plan.',
        basis: selectedPluginIds.slice(0, 4),
      },
      {
        step: 'review',
        title: 'Plan ready for review',
        detail: 'I am summarizing what needs confirmation before deployment.',
        basis: dsl.guidebook?.beforeDeploy ?? [],
      },
    ],
    selectedPluginIds,
    rejectedPluginIds: [],
    selectedTemplateSlugs,
    assumptions: dsl.review?.assumptions ?? [],
    score: 82,
    dsl,
    decisions: [
      {
        step: 'think',
        title: 'Goal interpreted',
        selected: dsl.title,
        rationale:
          'The request needs competitor monitoring, report drafting, and Google Drive document workflow support.',
        evidence: [compactText(input.prompt, 220)],
        rejectedOptions: [],
        confidence: 0.78,
      },
      {
        step: 'search',
        title: 'Integrations selected from inspected evidence',
        selected: selectedPluginIds.join(', '),
        rationale: `Selected ${pluginNames.join(', ') || selectedPluginIds.join(', ')} because inspected evidence supports the requested workflow.`,
        evidence: executions
          .map((execution) => `${execution.label}: ${JSON.stringify(execution.args)}`)
          .slice(0, 8),
        rejectedOptions: [],
        confidence: 0.76,
      },
      {
        step: 'generate',
        title: 'Workspace structure generated',
        selected: dsl.space?.servers?.[0]?.channels?.map((channel) => channel.name).join(', '),
        rationale:
          'Channels separate monitoring, reporting, and document collaboration so the workspace is deployable and easy to review.',
        evidence: selectedTemplateSlugs,
        rejectedOptions: [],
        confidence: 0.74,
      },
      {
        step: 'validate',
        title: 'Server validation required',
        selected: 'Compile and validate generated DSL',
        rationale:
          'The final Cloud template is compiled and revalidated server-side before it is returned.',
        evidence: selectedPluginIds,
        rejectedOptions: [],
        confidence: 0.72,
      },
      {
        step: 'review',
        title: 'Ready for user review',
        selected: 'Review credentials and channel naming',
        rationale: 'The remaining user work is credential preparation and optional plan tuning.',
        evidence: dsl.guidebook?.beforeDeploy ?? [],
        rejectedOptions: [],
        confidence: 0.72,
      },
    ],
  }
}

function missingFinalAnswerFields(answer: AgentFinalAnswer | null) {
  const missing: string[] = []
  if (!answer) return ['final JSON object']
  const dsl = answer.dsl
  if (!dsl || Object.keys(dsl).length === 0) return ['dsl']
  if (!dsl.title) missing.push('dsl.title')
  if (!dsl.description) missing.push('dsl.description')
  if (!hasItems(dsl.space?.servers)) missing.push('dsl.space.servers')
  if (!hasItems(dsl.space?.servers?.[0]?.channels)) missing.push('dsl.space.servers[0].channels')
  if (!hasItems(dsl.buddies)) missing.push('dsl.buddies')
  if (!dsl.buddies?.[0]?.name) missing.push('dsl.buddies[0].name')
  if (!dsl.buddies?.[0]?.role) missing.push('dsl.buddies[0].role')
  if (!dsl.buddies?.[0]?.systemPrompt) missing.push('dsl.buddies[0].systemPrompt')
  if (!hasItems(dsl.buddies?.[0]?.skills)) missing.push('dsl.buddies[0].skills')
  if (!hasItems(dsl.integrations)) missing.push('dsl.integrations')
  if (!dsl.guidebook?.summary) missing.push('dsl.guidebook.summary')
  if (!hasItems(dsl.guidebook?.beforeDeploy)) missing.push('dsl.guidebook.beforeDeploy')
  if (!hasItems(dsl.guidebook?.howToUse)) missing.push('dsl.guidebook.howToUse')
  if (!hasItems(dsl.guidebook?.reviewNotes)) missing.push('dsl.guidebook.reviewNotes')
  const decisionSteps = new Set((answer.decisions ?? []).map((decision) => decision.step))
  for (const step of ['think', 'search', 'generate', 'validate', 'review'] as const) {
    if (!decisionSteps.has(step)) missing.push(`decisions.${step}`)
  }
  return missing
}

async function extractOrFinalizeAnswer(
  agent: Agent,
  input: DiyCloudGenerateInput,
  executions: DiyCloudToolExecution[],
): Promise<AgentFinalAnswer> {
  assertAgentModelSucceeded(agent)
  const answer = extractFinalAnswer(agent)
  if (hasUsableFinalAnswer(answer)) return answer

  const fallback = buildFallbackAnswerFromToolEvidence(input, executions)
  const evidenceAnswer = await finalizeFromToolEvidence(input, executions).catch(() => null)
  if (hasUsableFinalAnswer(evidenceAnswer)) return evidenceAnswer

  agent.state.tools = []
  let finalizationCompleted = true
  await promptAgentWithTimeout(
    agent,
    {
      role: 'user',
      timestamp: Date.now(),
      content: [{ type: 'text', text: buildDiyCloudFinalizationPrompt(input) }],
    },
    FINALIZER_TIMEOUT_MS,
  ).catch(() => {
    finalizationCompleted = false
  })

  if (finalizationCompleted) {
    const finalized = extractFinalAnswer(agent)
    assertAgentModelSucceeded(agent)
    if (hasUsableFinalAnswer(finalized)) return finalized
  }
  return fallback
}

async function repairFinalAnswer(
  input: DiyCloudGenerateInput,
  executions: DiyCloudToolExecution[],
  answer: AgentFinalAnswer,
): Promise<AgentFinalAnswer> {
  let current = answer
  let missing = missingFinalAnswerFields(current)
  for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS && missing.length > 0; attempt += 1) {
    const repaired = await finalizeFromToolEvidence(input, executions, current, missing).catch(
      () => null,
    )
    if (!hasUsableFinalAnswer(repaired)) break
    current = repaired
    missing = missingFinalAnswerFields(current)
  }
  if (missing.length > 0) {
    current = buildFallbackAnswerFromToolEvidence(input, executions)
    missing = missingFinalAnswerFields(current)
  }
  if (missing.length > 0) {
    invalidFinalPlan(`DIY Cloud model final plan is missing ${missing.join(', ')}`)
  }
  return current
}

async function finalizeFromToolEvidence(
  input: DiyCloudGenerateInput,
  executions: DiyCloudToolExecution[],
  previousAnswer?: AgentFinalAnswer,
  missingFields: string[] = [],
): Promise<AgentFinalAnswer | null> {
  const finalizer = new Agent({
    initialState: {
      systemPrompt: buildDiyCloudSystemPrompt(input),
      model: createDiyCloudPiModel(),
      thinkingLevel: 'low',
      tools: [],
    },
    streamFn: diyCloudOpenAiStream,
    getApiKey: () => generatorApiKey() ?? undefined,
  })
  await promptAgentWithTimeout(
    finalizer,
    buildDiyCloudEvidenceFinalizationPrompt(input, executions, previousAnswer, missingFields),
    FINALIZER_TIMEOUT_MS,
  )
  assertAgentModelSucceeded(finalizer)
  return extractFinalAnswer(finalizer)
}

function requireDsl(answer: AgentFinalAnswer) {
  if (!answer.dsl || Object.keys(answer.dsl).length === 0) {
    invalidFinalPlan('DIY Cloud model final plan is missing dsl')
  }
  return answer.dsl
}

function progressStatus(valid: boolean): DiyCloudProgressStatus {
  return valid ? 'completed' : 'warning'
}

function shouldTerminateToolLoop(toolName: string) {
  return toolName === 'compile_template_dsl' || toolName === 'validate_template_dsl'
}

async function emitCompletedOutput(
  input: DiyCloudGenerateInput,
  options: DiyCloudGenerationOptions,
  outputInput: {
    step: DiyCloudStepId
    status: DiyCloudProgressStatus
    title: string
    detail: string
    result: Record<string, unknown>
    reasons: string[]
    raw: unknown
    confidence?: number
  },
) {
  const output = buildStepOutput({
    input,
    step: outputInput.step,
    status: outputInput.status,
    title: outputInput.title,
    result: outputInput.result,
    reasons: outputInput.reasons,
    raw: outputInput.raw,
    confidence: outputInput.confidence,
  })
  await emitProgress(options, {
    step: outputInput.step,
    status: outputInput.status,
    title: output.title,
    detail: outputInput.detail,
    channel: 'summary',
    output,
  })
  return output
}

export async function runDiyCloudPlanner(
  input: DiyCloudGenerateInput,
  options: DiyCloudGenerationOptions = {},
): Promise<DiyCloudDraft> {
  const prompt = compactText(input.prompt, MAX_PROMPT_TEXT)
  if (prompt.length < 4) promptTooShort()
  const scopedInput = { ...input, prompt }
  assertNotAborted(options.signal)

  const model = createDiyCloudPiModel()
  if (!model.baseUrl || !generatorApiKey()) {
    throw Object.assign(new Error('DIY Cloud model provider is not configured'), {
      status: 503,
      code: 'DIY_CLOUD_MODEL_NOT_CONFIGURED',
    })
  }

  const registry = createDiyCloudTools(scopedInput)
  const runtimeState = {
    textBuffer: '',
    currentStep: 'think' as DiyCloudStepId,
    lastAssistantText: '',
    started: false,
    toolArgsByCallId: new Map<string, unknown>(),
  }
  const agent = new Agent({
    initialState: {
      systemPrompt: buildDiyCloudSystemPrompt(scopedInput),
      model,
      thinkingLevel: 'medium',
      tools: registry.tools,
    },
    streamFn: diyCloudOpenAiStream,
    getApiKey: () => generatorApiKey() ?? undefined,
    toolExecution: 'parallel',
    afterToolCall: async ({ toolCall }) =>
      shouldTerminateToolLoop(toolCall.name) ? { terminate: true } : undefined,
  })
  agent.subscribe((event) => handlePiAgentEvent(event, options, runtimeState, registry.labels))

  let initialAgentCompleted = true
  await promptAgentWithTimeout(
    agent,
    buildDiyCloudUserPrompt(scopedInput),
    INITIAL_AGENT_TIMEOUT_MS,
  ).catch((err) => {
    if (registry.executions.length === 0) throw err
    initialAgentCompleted = false
  })
  const answer = await repairFinalAnswer(
    scopedInput,
    registry.executions,
    initialAgentCompleted
      ? await extractOrFinalizeAnswer(agent, scopedInput, registry.executions)
      : buildFallbackAnswerFromToolEvidence(scopedInput, registry.executions),
  )
  const dsl = requireDsl(answer)
  const selected = selectedPlugins(answer)
  const pluginIds = selected.map((plugin) => plugin.id)
  const guidebook = readDslGuidebook(dsl)
  const buddy = readDslBuddy(dsl)
  const channels = readDslChannels(dsl)
  const traces = toolTrace(registry.executions)

  const thinkDecision = decisionEvidence(answer, 'think')
  const thinkProgress = publicProgressForStep(
    answer,
    'think',
    thinkDecision.title,
    answer.intent || thinkDecision.rationale || prompt,
  )
  const thinkOutput = await emitCompletedOutput(scopedInput, options, {
    step: 'think',
    status: 'completed',
    title: thinkProgress.title,
    detail: thinkProgress.detail,
    confidence: thinkDecision.confidence,
    result: {
      intent: answer.intent || prompt,
      assumptions: answer.assumptions ?? [],
      selectedPluginIds: pluginIds,
      rejectedPluginIds: answer.rejectedPluginIds ?? [],
    },
    reasons: stepReasons(answer, 'think'),
    raw: { model: generatorModel(), decision: thinkDecision },
  })

  const matchedPlugins = buildMatchedPlugins(selected, answer)
  const referenceTemplates = buildReferenceTemplates(answer)
  const searchDecision = decisionEvidence(answer, 'search')
  const searchProgress = publicProgressForStep(
    answer,
    'search',
    searchDecision.title,
    searchDecision.rationale || answer.intent || prompt,
  )
  const searchOutput = await emitCompletedOutput(scopedInput, options, {
    step: 'search',
    status: 'completed',
    title: searchProgress.title,
    detail: searchProgress.detail,
    confidence: searchDecision.confidence,
    result: {
      selectedPlugins: matchedPlugins.map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        reason: plugin.reason,
      })),
      rejectedPluginIds: answer.rejectedPluginIds ?? [],
      referenceTemplates: referenceTemplates.map((template) => ({
        slug: template.slug,
        title: template.title,
        reason: template.reason,
      })),
      toolTrace: traces,
    },
    reasons: stepReasons(answer, 'search'),
    raw: { tools: registry.executions, decision: searchDecision },
  })

  const generateDecision = decisionEvidence(answer, 'generate')
  const generateProgress = publicProgressForStep(
    answer,
    'generate',
    generateDecision.title || String(dsl.title ?? ''),
    generateDecision.rationale ?? String(dsl.description ?? ''),
  )
  await emitProgress(options, {
    step: 'generate',
    status: 'running',
    title: generateProgress.title,
    detail: generateProgress.detail,
    channel: 'status',
    meta: { selectedPluginIds: pluginIds },
  })
  const compiled = compileTemplateDsl(scopedInput, dsl, pluginIds)
  const generateOutput = await emitCompletedOutput(scopedInput, options, {
    step: 'generate',
    status: 'completed',
    title: generateProgress.title || String(compiled.title),
    detail: generateProgress.detail || String(compiled.description),
    confidence: generateDecision.confidence,
    result: {
      title: compiled.title,
      description: compiled.description,
      channels,
      buddyName: buddy.name,
      selectedPluginIds: pluginIds,
      dsl,
    },
    reasons: stepReasons(answer, 'generate'),
    raw: { dsl, compiled, decision: generateDecision },
  })

  const validateDecision = decisionEvidence(answer, 'validate')
  const validateProgress = publicProgressForStep(
    answer,
    'validate',
    validateDecision.title,
    validateDecision.rationale || guidebook.reviewNotes[0] || guidebook.summary,
  )
  await emitProgress(options, {
    step: 'validate',
    status: 'running',
    title: validateProgress.title,
    detail: validateProgress.detail,
    channel: 'status',
  })
  const reliable = ensureReliableTemplate(compiled, scopedInput, dsl, pluginIds)
  const requiredKeys = requiredKeysForPlugins(pluginIds)
  const validateOutput = await emitCompletedOutput(scopedInput, options, {
    step: 'validate',
    status: progressStatus(reliable.validation.valid),
    title: validateProgress.title,
    detail: validateProgress.detail,
    confidence: validateDecision.confidence,
    result: {
      valid: reliable.validation.valid,
      agents: reliable.validation.agents,
      configurations: reliable.validation.configurations,
      violations: reliable.validation.violations,
      extendsErrors: reliable.validation.extendsErrors,
      requiredKeys: requiredKeys.map((key) => ({
        key: key.key,
        sourcePluginId: key.sourcePluginId,
        label: key.label,
      })),
      repairNotes: reliable.repairNotes,
    },
    reasons: stepReasons(answer, 'validate'),
    raw: {
      validation: reliable.validation,
      repairNotes: reliable.repairNotes,
      decision: validateDecision,
    },
  })

  const score = scoreFromAnswer(answer)
  const agentReport = buildAgentReport({
    input: scopedInput,
    answer,
    matchedPlugins,
    referenceTemplates,
    validation: reliable.validation,
    requiredKeys,
    repairNotes: reliable.repairNotes,
  })
  const reviewDecision = decisionEvidence(answer, 'review')
  const reviewProgress = publicProgressForStep(
    answer,
    'review',
    reviewDecision.title,
    guidebook.summary,
  )
  const reviewOutput = await emitCompletedOutput(scopedInput, options, {
    step: 'review',
    status: 'completed',
    title: reviewProgress.title,
    detail: reviewProgress.detail,
    confidence: reviewDecision.confidence,
    result: {
      score,
      title: reliable.template.title,
      description: reliable.template.description,
      selectedPluginIds: pluginIds,
      requiredKeys: requiredKeys.map((key) => key.key),
      nextActions: guidebook.beforeDeploy,
    },
    reasons: stepReasons(answer, 'review'),
    raw: { answer, agentReport, guidebook, decision: reviewDecision },
  })

  const agentOutputs = [thinkOutput, searchOutput, generateOutput, validateOutput, reviewOutput]
  const draft: DiyCloudDraft = {
    slug: String(reliable.template.name ?? compiled.name),
    title: String(reliable.template.title ?? compiled.title),
    description: String(reliable.template.description ?? compiled.description),
    score,
    steps: [
      {
        id: 'think',
        title: thinkOutput.title,
        detail: thinkProgress.detail,
      },
      {
        id: 'search',
        title: searchOutput.title,
        detail: searchProgress.detail,
      },
      {
        id: 'generate',
        title: generateOutput.title,
        detail: generateProgress.detail,
      },
      {
        id: 'validate',
        title: validateOutput.title,
        detail: validateProgress.detail,
      },
      {
        id: 'review',
        title: reviewOutput.title,
        detail: reviewProgress.detail,
      },
    ],
    matchedPlugins,
    referenceTemplates,
    suggestedSkills: buddy.skills,
    requiredKeys,
    toolTrace: traces,
    agentOutputs,
    agentReport,
    guidebook,
    template: reliable.template,
    validation: reliable.validation,
  }
  await emitDraft(options, draft)
  return draft
}

export { listDiyCloudPlugins, listDiyCloudTemplates }
