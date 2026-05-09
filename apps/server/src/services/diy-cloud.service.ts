import {
  CLOUD_SAAS_RUNTIME_KEY,
  listPluginLibrary,
  listTemplateLibrary,
  type PluginLibraryEntry,
  type PluginLibrarySearchResult,
  searchPluginLibrary,
  searchTemplateLibrary,
  summarizeCloudConfigValidation,
  type TemplateLibraryEntry,
  type TemplateLibrarySearchResult,
} from '@shadowob/cloud'
import {
  repairDiyCloudTemplateShape,
  validateDiyCloudTemplateCandidate,
} from './diy-cloud-template-maintenance.service'

export type DiyCloudStepId = 'think' | 'search' | 'generate' | 'validate' | 'review'

export type DiyCloudGenerateInput = {
  prompt: string
  feedback?: string
  previousConfig?: Record<string, unknown>
  locale?: string
  timezone?: string
}

export type DiyCloudMatchedPlugin = {
  id: string
  name: string
  description: string
  reason: string
  capabilities: string[]
  requiredKeys: string[]
  docsExcerpt: string
  matchedTerms: string[]
}

export type DiyCloudToolTrace = {
  tool: 'search_plugins' | 'search_templates'
  query: string
  resultIds: string[]
}

export type DiyCloudTemplateReference = {
  slug: string
  title: string
  description: string
  category: string
  plugins: string[]
  channels: string[]
  buddyNames: string[]
  reason: string
}

export type DiyCloudAgentStepOutput = {
  type: 'agent_step_output'
  schemaVersion: 1
  step: DiyCloudStepId
  status: DiyCloudProgressStatus
  title: string
  locale: string
  timezone: string
  generatedAt: string
  result: Record<string, unknown>
  reasons: string[]
  confidence?: number
  raw: unknown
}

export type DiyCloudDraft = {
  slug: string
  title: string
  description: string
  score: number
  steps: Array<{
    id: DiyCloudStepId
    title: string
    detail: string
  }>
  matchedPlugins: DiyCloudMatchedPlugin[]
  referenceTemplates: DiyCloudTemplateReference[]
  suggestedSkills: string[]
  requiredKeys: Array<{
    key: string
    label: string
    description: string
    source: string
    sourcePluginId: string
    sensitive: boolean
    setupSteps: string[]
    skipImpact: string
  }>
  toolTrace: DiyCloudToolTrace[]
  agentOutputs: DiyCloudAgentStepOutput[]
  agentReport: {
    objective: string
    assumptions: string[]
    reasoning: Array<{
      step: DiyCloudStepId
      title: string
      detail: string
      evidence: string[]
    }>
    pluginDecisions: Array<{
      id: string
      name: string
      reason: string
      capabilities: string[]
      matchedTerms: string[]
      requiredKeys: string[]
    }>
    templateDecisions: Array<{
      slug: string
      title: string
      reason: string
      plugins: string[]
      channels: string[]
    }>
    validationChecks: Array<{
      name: string
      status: 'passed' | 'warning' | 'failed'
      detail: string
    }>
    repairNotes: string[]
  }
  guidebook: {
    summary: string
    beforeDeploy: string[]
    howToUse: string[]
    reviewNotes: string[]
  }
  template: Record<string, unknown>
  validation: ReturnType<typeof summarizeCloudConfigValidation>
}

export type DiyCloudProgressStatus = 'running' | 'completed' | 'warning' | 'error'

export type DiyCloudProgressEvent =
  | {
      type: 'progress'
      id: string
      step: DiyCloudStepId
      status: DiyCloudProgressStatus
      title: string
      detail: string
      timestamp: string
      meta?: Record<string, unknown>
      output?: DiyCloudAgentStepOutput
    }
  | {
      type: 'draft'
      id: string
      timestamp: string
      draft: DiyCloudDraft
    }

export type DiyCloudGenerationOptions = {
  signal?: AbortSignal
  onProgress?: (event: DiyCloudProgressEvent) => void | Promise<void>
}

type LlmDraft = {
  title?: string
  description?: string
  channels?: string[]
  buddyName?: string
  systemPrompt?: string
  pluginIds?: string[]
  suggestedSkills?: string[]
  requiredKeys?: string[]
  guidebook?: {
    summary?: string
    beforeDeploy?: string[]
    howToUse?: string[]
    reviewNotes?: string[]
  }
  score?: number
}

type LlmPlan = {
  intent?: string
  pluginQueries?: string[]
  templateQueries?: string[]
  pluginIds?: string[]
  excludePluginIds?: string[]
}

type LlmPlanningResult = {
  plan: LlmPlan
  messages: Array<Record<string, unknown>>
  raw: Record<string, unknown>
}

type LlmGenerationResult = {
  draft: LlmDraft
  raw: Record<string, unknown>
}

type NormalizedLlmDraft = {
  title: string
  description: string
  channels: string[]
  buddyName: string
  systemPrompt: string
  pluginIds: string[]
  suggestedSkills: string[]
  requiredKeys: string[]
  guidebook: {
    summary: string
    beforeDeploy: string[]
    howToUse: string[]
    reviewNotes: string[]
  }
  score: number
}

const DEFAULT_GENERATOR_MODEL = 'deepseek-v4-flash'
const ALWAYS_ON_PLUGINS = ['model-provider', 'shadowob']
const TOOL_SEARCH_LIMIT = 8
export const DIY_CLOUD_MAX_ESTIMATED_TOKENS = 16_000

function firstNonEmptyEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return null
}

function generatorBaseUrl() {
  return firstNonEmptyEnv(
    'SHADOW_DIY_CLOUD_GENERATOR_BASE_URL',
    'SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL',
  )?.replace(/\/+$/, '')
}

function generatorApiKey() {
  return firstNonEmptyEnv(
    'SHADOW_DIY_CLOUD_GENERATOR_API_KEY',
    'SHADOW_MODEL_PROXY_UPSTREAM_API_KEY',
  )
}

function generatorModel() {
  return (
    firstNonEmptyEnv(
      'SHADOW_DIY_CLOUD_GENERATOR_MODEL',
      'SHADOW_MODEL_PROXY_MODEL',
      'SHADOW_MODEL_PROXY_DEFAULT_MODEL',
    ) ?? DEFAULT_GENERATOR_MODEL
  )
}

function chatCompletionsUrl(baseUrl: string) {
  return baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`
}

function isZh(locale?: string) {
  return locale?.toLowerCase().startsWith('zh')
}

function outputLocale(input: DiyCloudGenerateInput) {
  return input.locale?.trim() || 'zh-CN'
}

function outputTimezone(input: DiyCloudGenerateInput) {
  return input.timezone?.trim() || 'UTC'
}

export function estimateDiyCloudInputBudget(input: DiyCloudGenerateInput) {
  const serializedPreviousConfig = input.previousConfig ? JSON.stringify(input.previousConfig) : ''
  const characters =
    input.prompt.length + (input.feedback?.length ?? 0) + serializedPreviousConfig.length
  return {
    characters,
    estimatedTokens: Math.ceil(characters / 4),
  }
}

function compactText(input: string, maxLength: number) {
  return input.trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function slugify(input: string) {
  const ascii = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-+/g, '-')
  if (ascii) return ascii.slice(0, 40).replace(/-$/g, '')
  let hash = 0
  for (const char of input) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return `diy-${hash.toString(36)}`
}

function normalizeChannelName(input: string, fallback: string) {
  const value = compactText(input, 36)
  return value || fallback
}

function clampScore(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 78
  return Math.min(96, Math.max(45, Math.round(parsed)))
}

function parseStringArray(value: unknown, maxItems = 8) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? compactText(item, 80) : ''))
    .filter(Boolean)
    .slice(0, maxItems)
}

function safeJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = fenced ?? text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function parseToolArgs(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'string') return safeJsonObject(value) ?? {}
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function isSensitiveKey(key: string) {
  return /(?:token|secret|password|api[_-]?key|authorization|credential|private[_-]?key|refresh[_-]?token)/i.test(
    key,
  )
}

function redactRawJson(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[Max depth reached]'
  if (Array.isArray(value)) return value.map((item) => redactRawJson(item, depth + 1))
  if (!value || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [
      key,
      isSensitiveKey(key) && typeof entry === 'string'
        ? '[REDACTED]'
        : redactRawJson(entry, depth + 1),
    ]),
  )
}

function uniqueStrings(values: string[], maxItems: number) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = compactText(value, 120)
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
    if (result.length >= maxItems) break
  }
  return result
}

function buildStepOutput({
  input,
  step,
  status,
  title,
  result,
  reasons,
  raw,
  confidence,
}: {
  input: DiyCloudGenerateInput
  step: DiyCloudStepId
  status: DiyCloudProgressStatus
  title: string
  result: Record<string, unknown>
  reasons: string[]
  raw: unknown
  confidence?: number
}): DiyCloudAgentStepOutput {
  return {
    type: 'agent_step_output',
    schemaVersion: 1,
    step,
    status,
    title,
    locale: outputLocale(input),
    timezone: outputTimezone(input),
    generatedAt: new Date().toISOString(),
    result,
    reasons: uniqueStrings(reasons, 12),
    confidence,
    raw: redactRawJson(raw),
  }
}

function assertNotAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  throw Object.assign(new Error('DIY Cloud generation aborted'), {
    status: 499,
    code: 'DIY_CLOUD_GENERATION_ABORTED',
  })
}

async function emitProgress(
  options: DiyCloudGenerationOptions,
  event: Omit<Extract<DiyCloudProgressEvent, { type: 'progress' }>, 'type' | 'id' | 'timestamp'>,
) {
  assertNotAborted(options.signal)
  await options.onProgress?.({
    ...event,
    type: 'progress',
    id: `${event.step}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  })
  assertNotAborted(options.signal)
}

async function emitDraft(options: DiyCloudGenerationOptions, draft: DiyCloudDraft) {
  assertNotAborted(options.signal)
  await options.onProgress?.({
    type: 'draft',
    id: `draft-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    draft,
  })
  assertNotAborted(options.signal)
}

function promptMentionsAny(prompt: string, terms: string[]) {
  const normalized = prompt.toLowerCase()
  return terms.some((term) => normalized.includes(term.toLowerCase()))
}

function pluginAllowedByIntent(pluginId: string, prompt: string) {
  const checks: Record<string, string[]> = {
    'google-ads': ['google ads', 'adwords', 'pmax', 'roas', '广告', '投放', '竞价', '搜索词'],
    'google-analytics': ['google analytics', 'ga4', 'analytics', '流量分析', '埋点', '归因'],
    'meta-ads': ['meta ads', 'facebook ads', 'pixel', 'capi', '广告', '投放'],
    'baidu-appbuilder': ['appbuilder', '百度千帆', '千帆', '百度智能体', 'baidu'],
    'baidu-smartprogram': ['百度智能小程序', 'smartprogram'],
  }
  const requiredTerms = checks[pluginId]
  return !requiredTerms || promptMentionsAny(prompt, requiredTerms)
}

function filterPluginsByIntent<T extends { id: string }>(plugins: T[], prompt: string) {
  return plugins.filter(
    (plugin) => ALWAYS_ON_PLUGINS.includes(plugin.id) || pluginAllowedByIntent(plugin.id, prompt),
  )
}

function pickPlugins(
  input: DiyCloudGenerateInput,
  llmPluginIds: string[],
  pluginMatches: PluginLibrarySearchResult[],
) {
  const byId = new Map(listPluginLibrary().map((plugin) => [plugin.id, plugin]))
  const byMatchId = new Map(pluginMatches.map((plugin) => [plugin.id, plugin]))
  const picked = new Set<string>(ALWAYS_ON_PLUGINS)

  for (const id of llmPluginIds) {
    if (byId.has(id) && pluginAllowedByIntent(id, input.prompt)) picked.add(id)
  }

  if (picked.size === ALWAYS_ON_PLUGINS.length) {
    for (const match of filterPluginsByIntent(pluginMatches, input.prompt)
      .filter((plugin) => !ALWAYS_ON_PLUGINS.includes(plugin.id))
      .slice(0, 2)) {
      picked.add(match.id)
    }
  }

  return [...picked]
    .map((id) => byMatchId.get(id) ?? byId.get(id))
    .filter((plugin): plugin is PluginLibraryEntry => Boolean(plugin))
    .slice(0, 8)
}

function pluginReason(plugin: PluginLibraryEntry, locale?: string) {
  if (plugin.id === 'model-provider') {
    return isZh(locale)
      ? '为 Buddy 接入官方模型代理或用户自己的模型供应商。'
      : 'Connects the Buddy to the official model proxy or a saved user provider.'
  }
  if (plugin.id === 'shadowob') {
    return isZh(locale)
      ? '创建服务器、频道、Buddy 档案，并把 Buddy 绑定到默认频道。'
      : 'Creates the server, channels, Buddy profile, and channel binding.'
  }
  if (plugin.id === 'agent-pack') {
    return isZh(locale)
      ? '从 Git 挂载脚本、技能、CLI 命令、MCP 片段和说明文件。'
      : 'Mounts scripts, skills, CLI commands, MCP snippets, and instructions from Git.'
  }
  return plugin.description
}

function requiredKeysForPlugins(plugins: PluginLibraryEntry[], locale?: string) {
  const seen = new Set<string>()
  const keys: DiyCloudDraft['requiredKeys'] = []
  for (const plugin of plugins) {
    const authFields = pluginAuthFields(plugin)
    for (const field of authFields) {
      if (seen.has(field.key)) continue
      seen.add(field.key)
      keys.push({
        key: field.key,
        label: field.label,
        description: field.description ?? plugin.description,
        source: plugin.name,
        sourcePluginId: plugin.id,
        sensitive: field.sensitive,
        setupSteps: keySetupSteps(plugin, field.key, locale),
        skipImpact: keySkipImpact(plugin, locale),
      })
    }
  }
  return keys
}

function pluginAuthFields(plugin: PluginLibraryEntry) {
  return plugin.requiredFields.length > 0
    ? plugin.requiredFields
    : plugin.manifest.auth.fields
        .filter((field) => field.sensitive || field.required)
        .map((field) => ({
          key: field.key,
          label: field.label,
          description: field.description,
          sensitive: field.sensitive,
        }))
}

function keySetupSteps(plugin: PluginLibraryEntry, key: string, locale?: string) {
  const setupLines = plugin.readme.excerpt
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\./.test(line))
    .map((line) => line.replace(/^\d+\.\s*/, ''))
  const focused = setupLines.filter((line) =>
    line.toLowerCase().includes(key.toLowerCase().replace(/_/g, ' ')),
  )
  const lines = focused.length > 0 ? focused : setupLines
  if (lines.length > 0) return lines.slice(0, 5)
  return isZh(locale)
    ? [
        `打开 ${plugin.name} 的控制台或开发者设置。`,
        `创建只包含当前空间所需权限的访问凭据。`,
        `复制 ${key}，回到这里填写后再部署。`,
      ]
    : [
        `Open the ${plugin.name} console or developer settings.`,
        'Create a credential with only the permissions this space needs.',
        `Copy ${key}, paste it here, then deploy.`,
      ]
}

function keySkipImpact(plugin: PluginLibraryEntry, locale?: string) {
  if (plugin.id === 'model-provider') {
    return isZh(locale)
      ? '先使用官方模型供应商，之后可以再切换到自己的供应商。'
      : 'Use the official model provider instead of a private provider for now.'
  }
  return isZh(locale)
    ? `先跳过 ${plugin.name} 自动化能力。之后可以在 Cloud 里补充密钥并重新部署。`
    : `Deploy without ${plugin.name} automation. You can add this key later from Cloud provider settings and redeploy.`
}

function localPlan(input: DiyCloudGenerateInput): LlmPlan {
  const prompt = input.prompt
  const pluginQueries = ['model provider shadow chat']
  const pluginIds: string[] = []
  if (
    promptMentionsAny(prompt, [
      'google drive',
      'gmail',
      'google docs',
      'workspace',
      'google 日历',
      'google drive',
      '谷歌',
    ])
  ) {
    pluginQueries.push('google workspace drive docs gmail calendar')
    pluginIds.push('google-workspace')
  }
  if (promptMentionsAny(prompt, ['figma', 'design', 'ui', '设计'])) {
    pluginQueries.push('figma design review')
    pluginIds.push('figma')
  }
  if (promptMentionsAny(prompt, ['github', 'issue', 'pull request', 'repo', '代码'])) {
    pluginQueries.push('github issues repo code')
    pluginIds.push('github')
  }
  if (promptMentionsAny(prompt, ['飞书', 'lark', 'feishu', '日程', 'calendar'])) {
    pluginQueries.push('lark feishu docs calendar weekly report')
    pluginIds.push('lark')
  }
  if (promptMentionsAny(prompt, ['shopify', 'commerce', '店铺', '商品'])) {
    pluginQueries.push('shopify commerce')
    pluginIds.push('shopify')
  }
  if (promptMentionsAny(prompt, ['客服', '知识库', 'faq', 'support']))
    pluginQueries.push('knowledge base docs support')

  return {
    intent: compactText(prompt, 160),
    pluginQueries,
    templateQueries: [compactText(prompt, 160)],
    pluginIds,
    excludePluginIds: ['google-ads', 'google-analytics', 'baidu-appbuilder'],
  }
}

function searchPluginsForPlan(
  plan: LlmPlan,
  prompt: string,
): {
  matches: PluginLibrarySearchResult[]
  trace: DiyCloudToolTrace[]
} {
  const queries = uniqueStrings([...(plan.pluginQueries ?? []), prompt], 6)
  const byId = new Map<string, PluginLibrarySearchResult>()
  const trace: DiyCloudToolTrace[] = []
  for (const query of queries) {
    const results = filterPluginsByIntent(
      searchPluginLibrary(query, { limit: TOOL_SEARCH_LIMIT, includeIds: ALWAYS_ON_PLUGINS }),
      prompt,
    )
    trace.push({
      tool: 'search_plugins',
      query,
      resultIds: results.map((plugin) => plugin.id),
    })
    for (const plugin of results) byId.set(plugin.id, plugin)
  }
  for (const id of ALWAYS_ON_PLUGINS) {
    const plugin = listPluginLibrary().find((entry) => entry.id === id)
    if (plugin && !byId.has(id)) {
      byId.set(id, { ...plugin, score: 1, matchedTerms: [] })
    }
  }
  return { matches: [...byId.values()].slice(0, 12), trace }
}

function searchTemplatesForPlan(
  plan: LlmPlan,
  prompt: string,
): {
  matches: TemplateLibrarySearchResult[]
  trace: DiyCloudToolTrace[]
} {
  const queries = uniqueStrings([...(plan.templateQueries ?? []), prompt], 5)
  const bySlug = new Map<string, TemplateLibrarySearchResult>()
  const trace: DiyCloudToolTrace[] = []
  for (const query of queries) {
    const results = searchTemplateLibrary(query, { limit: 4 })
    trace.push({
      tool: 'search_templates',
      query,
      resultIds: results.map((template) => template.slug),
    })
    for (const template of results) {
      if (template.valid) bySlug.set(template.slug, template)
    }
  }
  return { matches: [...bySlug.values()].slice(0, 5), trace }
}

async function callPlanningModel(input: DiyCloudGenerateInput): Promise<LlmPlanningResult | null> {
  const baseUrl = generatorBaseUrl()
  const apiKey = generatorApiKey()
  if (!baseUrl || !apiKey) return null

  const system = [
    'You are the planner for Shadow DIY Cloud generation.',
    'First decide what capabilities the user truly asked for.',
    'Use tool calls to search plugins and templates. Do not ask for broad analytics, ads, or Baidu tools unless the user explicitly asked for them.',
    'After tool use, return JSON only with intent, pluginQueries, templateQueries, pluginIds, and excludePluginIds.',
    'Choose the smallest useful plugin set. model-provider and shadowob are included by default.',
    'All planning labels and user-facing reasoning must follow the requested locale, and any date or schedule interpretation must use the requested timezone.',
  ].join('\n')
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        locale: input.locale ?? 'zh-CN',
        timezone: outputTimezone(input),
        request: input.prompt,
        feedback: input.feedback ?? '',
      }),
    },
  ]
  const rawTurns: Array<Record<string, unknown>> = []

  const thinkResponse = await fetch(chatCompletionsUrl(baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: generatorModel(),
      temperature: 0.12,
      response_format: { type: 'json_object' },
      messages: [
        ...messages,
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Think deeply about the user request before searching. Return JSON only.',
            outputSchema: {
              intent: 'string',
              pluginQueries: ['string'],
              templateQueries: ['string'],
              pluginIds: ['string'],
              excludePluginIds: ['string'],
            },
          }),
        },
      ],
    }),
  })
  if (!thinkResponse.ok) return null
  const thinkData = (await thinkResponse.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>
  } | null
  const thinkContent = thinkData?.choices?.[0]?.message?.content
  const thinkPlan = thinkContent ? (safeJsonObject(thinkContent) as LlmPlan | null) : null
  rawTurns.push({
    phase: 'initial_planning',
    model: generatorModel(),
    content: thinkContent ?? null,
    parsed: thinkPlan,
  })
  if (thinkContent) messages.push({ role: 'assistant', content: thinkContent })
  messages.push({
    role: 'user',
    content: JSON.stringify({
      task: 'Now search only for capabilities that are directly needed by the intent. Use tools before returning final JSON.',
      priorPlan: thinkPlan,
    }),
  })

  const tools = [
    {
      type: 'function',
      function: {
        name: 'search_plugins',
        description: 'Search official Shadow Cloud plugins by capability keywords.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_templates',
        description: 'Search official deployable templates by use case.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
      },
    },
  ]

  for (let turn = 0; turn < 3; turn += 1) {
    const response = await fetch(chatCompletionsUrl(baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: generatorModel(),
        temperature: 0.1,
        response_format: { type: 'json_object' },
        tools,
        tool_choice: turn === 0 ? 'auto' : undefined,
        messages,
      }),
    })
    if (!response.ok) return null
    const data = (await response.json().catch(() => null)) as {
      choices?: Array<{
        message?: {
          content?: string
          tool_calls?: Array<{
            id?: string
            function?: { name?: string; arguments?: string }
          }>
        }
      }>
    } | null
    const message = data?.choices?.[0]?.message
    if (!message) return null
    const toolCalls = message.tool_calls ?? []
    if (toolCalls.length === 0) {
      const finalPlan = (safeJsonObject(message.content ?? '') as LlmPlan | null) ?? thinkPlan
      if (!finalPlan) return null
      if (message.content) messages.push({ role: 'assistant', content: message.content })
      rawTurns.push({
        phase: 'final_planning',
        model: generatorModel(),
        content: message.content ?? null,
        parsed: finalPlan,
      })
      return {
        plan: finalPlan,
        messages,
        raw: {
          model: generatorModel(),
          locale: outputLocale(input),
          timezone: outputTimezone(input),
          turns: rawTurns,
        },
      }
    }

    messages.push({ role: 'assistant', content: message.content ?? '', tool_calls: toolCalls })
    const rawToolCalls: Array<Record<string, unknown>> = []
    for (const call of toolCalls) {
      const name = call.function?.name
      const args = parseToolArgs(call.function?.arguments)
      const query = typeof args.query === 'string' ? args.query : input.prompt
      const result =
        name === 'search_templates'
          ? searchTemplateLibrary(query, { limit: 4 }).map((template) => ({
              slug: template.slug,
              title: template.title,
              category: template.category,
              plugins: template.plugins,
            }))
          : filterPluginsByIntent(
              searchPluginLibrary(query, {
                limit: TOOL_SEARCH_LIMIT,
                includeIds: ALWAYS_ON_PLUGINS,
              }),
              input.prompt,
            ).map((plugin) => ({
              id: plugin.id,
              name: plugin.name,
              category: plugin.category,
              capabilities: plugin.capabilities,
              requiredKeys: plugin.requiredFields.map((field) => field.key),
            }))
      messages.push({
        role: 'tool',
        tool_call_id: call.id ?? `${name}-${turn}`,
        content: JSON.stringify(result),
      })
      rawToolCalls.push({
        id: call.id,
        name,
        arguments: args,
        query,
        result,
      })
    }
    rawTurns.push({
      phase: 'tool_turn',
      turn,
      model: generatorModel(),
      assistantContent: message.content ?? null,
      toolCalls: rawToolCalls,
    })
  }

  return thinkPlan
    ? {
        plan: thinkPlan,
        messages,
        raw: {
          model: generatorModel(),
          locale: outputLocale(input),
          timezone: outputTimezone(input),
          fallback: 'initial_planning_after_tool_turn_limit',
          turns: rawTurns,
        },
      }
    : null
}

async function callGeneratorModel(
  input: DiyCloudGenerateInput,
  pluginMatches: PluginLibrarySearchResult[],
  templateReferences: TemplateLibrarySearchResult[],
  planningHistory: Array<Record<string, unknown>> = [],
): Promise<LlmGenerationResult | null> {
  const baseUrl = generatorBaseUrl()
  const apiKey = generatorApiKey()
  if (!baseUrl || !apiKey) return null

  const compactCatalog = pluginMatches.map((plugin) => ({
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    category: plugin.category,
    capabilities: plugin.capabilities,
    requiredKeys: plugin.requiredFields.map((field) => field.key),
    docsExcerpt: plugin.readme.excerpt,
    matchedTerms: plugin.matchedTerms,
  }))
  const compactTemplates = templateReferences.map((template) => ({
    slug: template.slug,
    title: template.title,
    description: template.description,
    category: template.category,
    plugins: template.plugins,
    channels: template.channels,
    buddyNames: template.buddyNames,
    systemPromptExcerpt: template.systemPromptExcerpt,
    valid: template.valid,
  }))

  const system = [
    'You generate deployable Shadow Cloud template plans.',
    'Return JSON only. Do not include Markdown.',
    'Use only plugin IDs that appear in the provided shortlisted plugin catalog.',
    'Select the smallest plugin set that directly serves the request. Do not select Google Ads, Google Analytics, Meta Ads, or Baidu tools unless the user explicitly asked for those products.',
    'Use official template references for shape, channel planning, Buddy roles, and plugin combinations, but do not copy their namespace or slug.',
    'Never include real secrets or API keys. Only list required environment variable names.',
    'All user-facing fields must follow the requested locale. If locale starts with zh, write title, description, guidebook, channel names, and review notes in Simplified Chinese even when the user request is English.',
    'If the user requests recurring work, reports, deadlines, calendar actions, or reminders, interpret all times using the requested timezone.',
    'Keep the result practical: 3 to 5 channels, 1 Buddy, concise guidebook.',
  ].join('\n')
  const user = JSON.stringify({
    locale: input.locale ?? 'zh-CN',
    timezone: outputTimezone(input),
    request: input.prompt,
    feedback: input.feedback ?? '',
    previousConfig: input.previousConfig ?? null,
    officialPlugins: compactCatalog,
    officialTemplateReferences: compactTemplates,
    outputSchema: {
      title: 'string',
      description: 'string',
      channels: ['string'],
      buddyName: 'string',
      systemPrompt: 'string',
      pluginIds: ['string'],
      suggestedSkills: ['string'],
      requiredKeys: ['string'],
      guidebook: {
        summary: 'string',
        beforeDeploy: ['string'],
        howToUse: ['string'],
        reviewNotes: ['string'],
      },
      score: 'number 0-100',
    },
  })

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: system },
    ...planningHistory.filter((message) => message.role !== 'system'),
    { role: 'user', content: user },
  ]

  const response = await fetch(chatCompletionsUrl(baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: generatorModel(),
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages,
    }),
  })

  if (!response.ok) return null
  const data = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>
  } | null
  const content = data?.choices?.[0]?.message?.content
  if (!content) return null
  const firstDraft = safeJsonObject(content) as LlmDraft | null
  if (!firstDraft) return null

  messages.push({ role: 'assistant', content })
  messages.push({
    role: 'user',
    content: JSON.stringify({
      task: 'Review your draft against the original request and the shortlisted catalog, then return a tightened final JSON draft.',
      constraints: [
        'Keep the same output schema.',
        'Remove plugins that are not directly useful.',
        'Improve channel names, Buddy role, guidebook, requiredKeys, and score.',
        'Do not add any plugin ID outside the shortlisted plugin catalog.',
      ],
    }),
  })

  const refinedResponse = await fetch(chatCompletionsUrl(baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: generatorModel(),
      temperature: 0.15,
      response_format: { type: 'json_object' },
      messages,
    }),
  })

  if (!refinedResponse.ok) {
    return {
      draft: firstDraft,
      raw: {
        model: generatorModel(),
        locale: outputLocale(input),
        timezone: outputTimezone(input),
        firstDraftContent: content,
        firstDraft,
        refinedDraftContent: null,
        refinedDraft: null,
        usedRefinedDraft: false,
        refinementError: `HTTP ${refinedResponse.status}`,
      },
    }
  }
  const refinedData = (await refinedResponse.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>
  } | null
  const refinedContent = refinedData?.choices?.[0]?.message?.content
  const refinedDraft = refinedContent ? (safeJsonObject(refinedContent) as LlmDraft | null) : null
  return {
    draft: refinedDraft ?? firstDraft,
    raw: {
      model: generatorModel(),
      locale: outputLocale(input),
      timezone: outputTimezone(input),
      firstDraftContent: content,
      firstDraft,
      refinedDraftContent: refinedContent ?? null,
      refinedDraft,
      usedRefinedDraft: Boolean(refinedDraft),
    },
  }
}

function fallbackDraft(input: DiyCloudGenerateInput): LlmDraft {
  const zh = isZh(input.locale)
  const prompt = compactText(input.prompt, 64)
  return {
    title: zh ? `${prompt}空间` : `${prompt} Space`,
    description: input.prompt,
    channels: zh ? ['简报', '资料', '行动', '复盘'] : ['Briefing', 'Sources', 'Actions', 'Review'],
    buddyName: zh ? 'DIY Buddy' : 'DIY Buddy',
    systemPrompt: zh
      ? `你是这个虾豆 Cloud 空间的专属 Buddy。用户目标是：${input.prompt}。先澄清目标和密钥准备情况，再把任务拆成可执行步骤。`
      : `You are the dedicated Buddy for this Shadow Cloud space. User goal: ${input.prompt}. Clarify goals and required keys, then break the work into concrete next steps.`,
    pluginIds: [],
    suggestedSkills: zh
      ? ['需求澄清', '资料检索', '周报生成']
      : ['Requirement shaping', 'Research', 'Brief writing'],
    guidebook: {
      summary: zh
        ? '这是根据你的需求生成的 Cloud 模版草案，部署后会进入默认频道和 Buddy 对话。'
        : 'This is a Cloud template draft generated from your request. After deployment, you enter the default channel and chat with the Buddy.',
      beforeDeploy: zh
        ? ['确认是否需要第三方账号或 API Key。', '使用官方模型供应商时会按虾币计费。']
        : [
            'Confirm whether third-party accounts or API keys are needed.',
            'Official model usage is billed in Shrimp Coins.',
          ],
      howToUse: zh
        ? ['进入频道后先告诉 Buddy 你的目标和约束。', '把资料、链接或账号授权补齐后再执行自动化。']
        : [
            'Tell the Buddy your goal and constraints in the channel.',
            'Add sources, links, or account authorization before running automation.',
          ],
      reviewNotes: zh
        ? ['当前草案已通过结构校验。部署前仍建议检查频道名和密钥清单。']
        : [
            'The draft passes structural validation. Review channel names and key requirements before deployment.',
          ],
    },
    score: 76,
  }
}

function normalizeLlmDraft(
  input: DiyCloudGenerateInput,
  llmDraft: LlmDraft | null,
): NormalizedLlmDraft {
  const fallback = fallbackDraft(input)
  const draft = llmDraft ?? fallback
  return {
    title: compactText(draft.title ?? fallback.title ?? '', 80),
    description: compactText(draft.description ?? fallback.description ?? '', 220),
    channels:
      parseStringArray(draft.channels, 5).length > 0
        ? parseStringArray(draft.channels, 5)
        : (fallback.channels ?? []),
    buddyName: compactText(draft.buddyName ?? fallback.buddyName ?? 'DIY Buddy', 48),
    systemPrompt: compactText(draft.systemPrompt ?? fallback.systemPrompt ?? '', 1800),
    pluginIds: parseStringArray(draft.pluginIds, 10),
    suggestedSkills:
      parseStringArray(draft.suggestedSkills, 8).length > 0
        ? parseStringArray(draft.suggestedSkills, 8)
        : (fallback.suggestedSkills ?? []),
    requiredKeys: parseStringArray(draft.requiredKeys, 12),
    guidebook: {
      summary: compactText(draft.guidebook?.summary ?? fallback.guidebook?.summary ?? '', 260),
      beforeDeploy:
        parseStringArray(draft.guidebook?.beforeDeploy, 8).length > 0
          ? parseStringArray(draft.guidebook?.beforeDeploy, 8)
          : (fallback.guidebook?.beforeDeploy ?? []),
      howToUse:
        parseStringArray(draft.guidebook?.howToUse, 8).length > 0
          ? parseStringArray(draft.guidebook?.howToUse, 8)
          : (fallback.guidebook?.howToUse ?? []),
      reviewNotes:
        parseStringArray(draft.guidebook?.reviewNotes, 8).length > 0
          ? parseStringArray(draft.guidebook?.reviewNotes, 8)
          : (fallback.guidebook?.reviewNotes ?? []),
    },
    score: clampScore(draft.score ?? fallback.score),
  }
}

function buildTemplate(input: {
  slug: string
  title: string
  description: string
  channels: string[]
  buddyName: string
  systemPrompt: string
  selectedPlugins: PluginLibraryEntry[]
  suggestedSkills: string[]
  locale?: string
}) {
  const channelRecords = input.channels.map((channel, index) => ({
    id: slugify(channel) || `channel-${index + 1}`,
    title: normalizeChannelName(channel, `Channel ${index + 1}`),
    type: 'text',
  }))
  const defaultChannels =
    channelRecords.length > 0
      ? channelRecords
      : [
          { id: 'briefing', title: 'Briefing', type: 'text' },
          { id: 'actions', title: 'Actions', type: 'text' },
          { id: 'review', title: 'Review', type: 'text' },
        ]
  const optionalUse = input.selectedPlugins
    .filter((plugin) => !ALWAYS_ON_PLUGINS.includes(plugin.id) && plugin.id !== 'agent-pack')
    .slice(0, 5)
    .map((plugin) => ({ plugin: plugin.id }))
  const usesAgentPack = input.selectedPlugins.some((plugin) => plugin.id === 'agent-pack')
  const playLaunch = {
    defaultChannelName: defaultChannels[0]?.id ?? defaultChannels[0]?.title,
    greeting: isZh(input.locale)
      ? `欢迎来到 ${input.title}。我已经准备好一起把这个空间跑起来了，你可以先告诉我目标、资料来源或需要接入的账号。`
      : `Welcome to ${input.title}. I am ready to help you get this space moving. Start by sharing your goal, sources, or connected accounts.`,
  }

  return {
    version: '1.0.0',
    name: input.slug,
    title: input.title,
    description: input.description,
    environment: 'production',
    use: [
      { plugin: 'model-provider' },
      {
        plugin: 'shadowob',
        options: {
          servers: [
            {
              id: 'diy-hq',
              name: input.title,
              slug: input.slug,
              channels: defaultChannels,
            },
          ],
          buddies: [{ id: 'diy-buddy', name: input.buddyName }],
          bindings: [
            {
              targetId: 'diy-buddy',
              targetType: 'buddy',
              servers: ['diy-hq'],
              channels: defaultChannels.map((channel) => channel.id),
              agentId: 'diy-buddy-agent',
            },
          ],
          playLaunch,
        },
      },
      ...optionalUse,
    ],
    deployments: {
      namespace: input.slug,
      agents: [
        {
          id: 'diy-buddy-agent',
          runtime: 'openclaw',
          description: input.description,
          identity: {
            name: input.buddyName,
            personality:
              'Warm, precise, and operational. Clarify the goal, ask for missing context, and keep work inside the channel.',
            systemPrompt: input.systemPrompt,
          },
          use: usesAgentPack
            ? [
                {
                  plugin: 'agent-pack',
                  options: {
                    packs: [],
                  },
                },
              ]
            : [],
          configuration: {
            openclaw: {
              instructions: input.suggestedSkills.map((skill) => `Use ${skill} when relevant.`),
            },
          },
          resources: {
            requests: { cpu: '100m', memory: '256Mi' },
            limits: { cpu: '1000m', memory: '1Gi' },
          },
        },
      ],
    },
    i18n: {
      en: {
        title: input.title,
        description: input.description,
      },
      'zh-CN': {
        title: input.title,
        description: input.description,
      },
    },
    [CLOUD_SAAS_RUNTIME_KEY]: {
      modelProviderMode: 'official',
      officialModelProxy: true,
    },
  }
}

function ensureReliableTemplate(
  candidate: Record<string, unknown>,
  buildInput: Parameters<typeof buildTemplate>[0],
) {
  const repairNotes: string[] = []
  try {
    validateDiyCloudTemplateCandidate(candidate)
    return {
      template: candidate,
      validation: summarizeCloudConfigValidation(candidate),
      repairNotes,
    }
  } catch (err) {
    repairNotes.push(err instanceof Error ? err.message : 'Initial template validation failed')
  }

  const repaired = repairDiyCloudTemplateShape(candidate, buildInput)
  try {
    validateDiyCloudTemplateCandidate(repaired)
    return {
      template: repaired,
      validation: summarizeCloudConfigValidation(repaired),
      repairNotes,
    }
  } catch (err) {
    repairNotes.push(err instanceof Error ? err.message : 'Template repair validation failed')
  }

  const minimal = buildTemplate({
    ...buildInput,
    selectedPlugins: buildInput.selectedPlugins.filter((plugin) =>
      ALWAYS_ON_PLUGINS.includes(plugin.id),
    ),
  })
  validateDiyCloudTemplateCandidate(minimal)
  return {
    template: minimal,
    validation: summarizeCloudConfigValidation(minimal),
    repairNotes,
  }
}

function templateReason(template: TemplateLibraryEntry, locale?: string) {
  if (isZh(locale)) {
    return `参考 ${template.title} 的频道结构、Buddy 角色和插件组合；生成时会使用新的命名空间和配置。`
  }
  return `References ${template.title} for channel shape, Buddy role, and plugin mix while generating a new namespace and config.`
}

function buildAgentReport({
  input,
  prompt,
  normalized,
  selectedPlugins,
  matchedPlugins,
  referenceTemplates,
  validation,
  reliable,
  requiredKeys,
}: {
  input: DiyCloudGenerateInput
  prompt: string
  normalized: NormalizedLlmDraft
  selectedPlugins: PluginLibraryEntry[]
  matchedPlugins: DiyCloudDraft['matchedPlugins']
  referenceTemplates: DiyCloudDraft['referenceTemplates']
  validation: DiyCloudDraft['validation']
  reliable: ReturnType<typeof ensureReliableTemplate>
  requiredKeys: DiyCloudDraft['requiredKeys']
}): DiyCloudDraft['agentReport'] {
  const zh = isZh(input.locale)
  const requiredKeyNames = new Set(requiredKeys.map((key) => key.key))
  return {
    objective: normalized.description || prompt,
    assumptions: uniqueStrings(
      [
        zh
          ? '默认使用官方模型代理，部署前不要求用户填写模型供应商密钥。'
          : 'Use the official model proxy by default, so model-provider credentials are not required before deployment.',
        requiredKeys.length > 0
          ? zh
            ? `需要用户在部署向导中逐项准备 ${requiredKeys.length} 个业务连接密钥。`
            : `The deployment guide will collect ${requiredKeys.length} business integration credential(s) step by step.`
          : zh
            ? '当前方案没有额外业务连接密钥。'
            : 'No extra business integration credentials are required for this draft.',
        input.previousConfig
          ? zh
            ? '已参考上一版配置，只保留能通过策略校验的结构。'
            : 'The previous config was used as context, but only policy-valid structure is kept.'
          : '',
      ],
      6,
    ),
    reasoning: [
      {
        step: 'think',
        title: zh ? '目标拆解' : 'Goal decomposition',
        detail: zh
          ? '把自然语言需求拆成空间目标、频道、Buddy 角色、工具能力和部署约束。'
          : 'Break the natural-language request into space goals, channels, Buddy role, tool capabilities, and deploy constraints.',
        evidence: uniqueStrings(
          [normalized.description, ...normalized.channels, normalized.buddyName],
          8,
        ),
      },
      {
        step: 'search',
        title: zh ? '能力匹配' : 'Capability matching',
        detail: zh
          ? '优先选择官方插件，只有与目标直接相关的连接器会进入配置。'
          : 'Prefer official plugins and include only connectors that directly support the target workflow.',
        evidence: matchedPlugins.map((plugin) => `${plugin.name}: ${plugin.reason}`),
      },
      {
        step: 'generate',
        title: zh ? '配置生成' : 'Config generation',
        detail: zh
          ? '生成 Shadow 服务器、频道、Buddy 绑定、运行时资源和插件引用。'
          : 'Generate Shadow server, channels, Buddy binding, runtime resources, and plugin references.',
        evidence: uniqueStrings(
          [
            zh ? `${normalized.channels.length} 个频道` : `${normalized.channels.length} channels`,
            zh ? `Buddy：${normalized.buddyName}` : `Buddy: ${normalized.buddyName}`,
            ...selectedPlugins.map((plugin) => plugin.id),
          ],
          12,
        ),
      },
      {
        step: 'validate',
        title: zh ? '可靠性校验' : 'Reliability checks',
        detail: zh
          ? '通过 Cloud schema、模板策略 allowlist、运行时边界和密钥引用检查。'
          : 'Run Cloud schema, template policy allowlist, runtime boundary, and credential reference checks.',
        evidence: [
          zh ? `Buddy 数：${validation.agents}` : `Buddy count: ${validation.agents}`,
          zh
            ? `配置项：${validation.configurations}`
            : `Config entries: ${validation.configurations}`,
          zh
            ? `结构修复：${reliable.repairNotes.length}`
            : `Structural repairs: ${reliable.repairNotes.length}`,
        ],
      },
      {
        step: 'review',
        title: zh ? '人工复核' : 'Human review',
        detail: zh
          ? '最终只保留两个决策：批注后重新调整，或进入逐步部署向导。'
          : 'End with two decisions only: annotate and regenerate, or continue into the step-by-step deployment guide.',
        evidence: requiredKeys.map((key) => `${key.source}: ${key.key}`),
      },
    ],
    pluginDecisions: matchedPlugins.map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      reason: plugin.reason,
      capabilities: plugin.capabilities.slice(0, 6),
      matchedTerms: plugin.matchedTerms,
      requiredKeys: plugin.requiredKeys.filter((key) => requiredKeyNames.has(key)),
    })),
    templateDecisions: referenceTemplates.map((template) => ({
      slug: template.slug,
      title: template.title,
      reason: template.reason,
      plugins: template.plugins,
      channels: template.channels,
    })),
    validationChecks: [
      {
        name: zh ? 'Cloud schema' : 'Cloud schema',
        status: validation.extendsErrors.length === 0 ? 'passed' : 'warning',
        detail:
          validation.extendsErrors.length === 0
            ? zh
              ? '结构字段满足 Cloud 配置规范。'
              : 'The generated structure satisfies the Cloud config schema.'
            : validation.extendsErrors.join('; '),
      },
      {
        name: zh ? '模板策略 allowlist' : 'Template policy allowlist',
        status: validation.violations.length === 0 ? 'passed' : 'warning',
        detail:
          validation.violations.length === 0
            ? zh
              ? '插件引用和部署字段都在服务端策略边界内。'
              : 'Plugin references and deployment fields stay inside server-side policy boundaries.'
            : validation.violations.map((violation) => violation.path).join(', '),
      },
      {
        name: zh ? '部署密钥准备' : 'Deployment credentials',
        status: requiredKeys.length === 0 ? 'passed' : 'warning',
        detail:
          requiredKeys.length === 0
            ? zh
              ? '不需要额外业务密钥。'
              : 'No additional business credentials are required.'
            : zh
              ? `部署前需要逐项填写：${requiredKeys.map((key) => key.label).join('、')}`
              : `Fill these before deployment: ${requiredKeys.map((key) => key.label).join(', ')}`,
      },
    ],
    repairNotes: reliable.repairNotes,
  }
}

export function listDiyCloudPlugins() {
  return listPluginLibrary()
}

export function searchDiyCloudPlugins(query: string) {
  return searchPluginLibrary(query, { limit: 16, includeIds: ALWAYS_ON_PLUGINS })
}

export function listDiyCloudTemplates() {
  return listTemplateLibrary().filter((template) => template.valid)
}

export async function generateDiyCloudDraft(
  input: DiyCloudGenerateInput,
  options: DiyCloudGenerationOptions = {},
): Promise<DiyCloudDraft> {
  const prompt = compactText(input.prompt, 2000)
  if (prompt.length < 4) {
    throw Object.assign(new Error('Prompt is too short'), {
      status: 400,
      code: 'DIY_PROMPT_TOO_SHORT',
    })
  }
  const agentOutputs: DiyCloudAgentStepOutput[] = []

  await emitProgress(options, {
    step: 'think',
    status: 'running',
    title: isZh(input.locale) ? '理解目标和约束' : 'Understanding the goal and constraints',
    detail: isZh(input.locale)
      ? '正在识别用户目标、反馈、可复用配置和需要避免的能力。'
      : 'Reading the request, feedback, reusable config, and capability exclusions.',
    meta: {
      characters: prompt.length,
      hasFeedback: Boolean(input.feedback?.trim()),
      hasPreviousConfig: Boolean(input.previousConfig),
    },
  })

  const query = `${prompt}\n${input.feedback ?? ''}`
  const planningResult = await callPlanningModel({ ...input, prompt })
  const plan = planningResult?.plan ?? localPlan({ ...input, prompt })
  const thinkOutput = buildStepOutput({
    input,
    step: 'think',
    status: 'completed',
    title: isZh(input.locale) ? '目标拆解 JSON Output' : 'Goal breakdown JSON output',
    confidence: planningResult ? 0.86 : 0.68,
    result: {
      intent: plan.intent ?? prompt,
      pluginQueries: plan.pluginQueries ?? [],
      templateQueries: plan.templateQueries ?? [],
      pluginIds: plan.pluginIds ?? [],
      excludePluginIds: plan.excludePluginIds ?? [],
      usedFallbackPlanner: !planningResult,
    },
    reasons: [
      isZh(input.locale)
        ? '先把自然语言需求转成可检索的插件能力和模板线索。'
        : 'Convert the natural-language request into searchable plugin capabilities and template signals.',
      isZh(input.locale)
        ? `按 ${outputLocale(input)} 和 ${outputTimezone(input)} 组织后续输出。`
        : `Shape later output for ${outputLocale(input)} and ${outputTimezone(input)}.`,
      planningResult
        ? isZh(input.locale)
          ? '规划模型返回了结构化 JSON。'
          : 'The planning model returned structured JSON.'
        : isZh(input.locale)
          ? '上游规划模型不可用，使用本地确定性规划兜底。'
          : 'The upstream planner was unavailable, so deterministic local planning was used.',
    ],
    raw: planningResult?.raw ?? { fallbackPlanner: true, plan },
  })
  agentOutputs.push(thinkOutput)
  await emitProgress(options, {
    step: 'think',
    status: 'completed',
    title: isZh(input.locale) ? '目标拆解完成' : 'Goal breakdown complete',
    detail: plan.intent || prompt,
    meta: {
      intent: plan.intent ?? prompt,
      pluginQueries: plan.pluginQueries ?? [],
      templateQueries: plan.templateQueries ?? [],
      fallbackPlanner: !planningResult,
    },
    output: thinkOutput,
  })

  await emitProgress(options, {
    step: 'search',
    status: 'running',
    title: isZh(input.locale) ? '检索官方能力库' : 'Searching official capability libraries',
    detail: isZh(input.locale)
      ? '正在匹配官方插件、官方模版和部署所需的密钥项。'
      : 'Matching official plugins, official templates, and required deployment keys.',
    meta: {
      pluginQueryCount: plan.pluginQueries?.length ?? 0,
      templateQueryCount: plan.templateQueries?.length ?? 0,
    },
  })

  const pluginSearch = searchPluginsForPlan(plan, query)
  const templateSearch = searchTemplatesForPlan(plan, query)
  const pluginMatches = pluginSearch.matches
  const templateReferences = templateSearch.matches
  const toolTrace = [...pluginSearch.trace, ...templateSearch.trace]
  const referenceTemplates =
    templateReferences.length > 0
      ? templateReferences
      : listTemplateLibrary()
          .filter((template) => template.valid)
          .slice(0, 5)
          .map((template) => ({ ...template, score: 1, matchedTerms: [] }))
  const searchOutput = buildStepOutput({
    input,
    step: 'search',
    status: 'completed',
    title: isZh(input.locale) ? '能力检索 JSON Output' : 'Capability search JSON output',
    confidence: 0.82,
    result: {
      pluginCandidates: pluginMatches.map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        score: plugin.score,
        matchedTerms: plugin.matchedTerms,
        requiredKeys: plugin.requiredFields.map((field) => field.key),
      })),
      templateCandidates: referenceTemplates.map((template) => ({
        slug: template.slug,
        title: template.title,
        score: 'score' in template ? template.score : undefined,
        plugins: template.plugins,
        channels: template.channels,
      })),
      toolTrace,
    },
    reasons: [
      isZh(input.locale)
        ? '优先检索官方插件和官方模板，减少不可部署配置。'
        : 'Search official plugins and official templates first to reduce undeployable config.',
      isZh(input.locale)
        ? '始终保留 model-provider 和 shadowob 作为基础能力。'
        : 'Always retain model-provider and shadowob as baseline capabilities.',
      isZh(input.locale)
        ? '只保留与用户目标直接相关的连接器。'
        : 'Keep only connectors directly related to the user goal.',
    ],
    raw: {
      pluginSearch,
      templateSearch,
      fallbackTemplateReferences: templateReferences.length === 0,
    },
  })
  agentOutputs.push(searchOutput)
  await emitProgress(options, {
    step: 'search',
    status: 'completed',
    title: isZh(input.locale) ? '能力匹配完成' : 'Capability matching complete',
    detail: isZh(input.locale)
      ? `已筛出 ${pluginMatches.length} 个候选插件和 ${referenceTemplates.length} 个参考模版。`
      : `Shortlisted ${pluginMatches.length} plugins and ${referenceTemplates.length} template references.`,
    meta: {
      plugins: pluginMatches.map((plugin) => plugin.id),
      templates: referenceTemplates.map((template) => template.slug),
      toolTrace,
    },
    output: searchOutput,
  })

  await emitProgress(options, {
    step: 'generate',
    status: 'running',
    title: isZh(input.locale) ? '生成并复核草案' : 'Generating and reviewing the draft',
    detail: isZh(input.locale)
      ? '正在用候选能力生成频道、Buddy、运行时配置和指南书，并进行二次自检。'
      : 'Generating channels, Buddy identity, runtime config, and guidebook with a second-pass review.',
    meta: {
      pluginCatalogSize: pluginMatches.length,
      templateReferenceSize: referenceTemplates.length,
    },
  })

  const generationResult = await callGeneratorModel(
    { ...input, prompt },
    pluginMatches,
    referenceTemplates,
    planningResult?.messages ?? [],
  )
  const llmDraft = generationResult?.draft ?? null
  const normalized = normalizeLlmDraft({ ...input, prompt }, llmDraft)
  const selectedPlugins = pickPlugins(
    { ...input, prompt },
    uniqueStrings([...(plan.pluginIds ?? []), ...normalized.pluginIds], 10).filter(
      (id) => !(plan.excludePluginIds ?? []).includes(id),
    ),
    pluginMatches,
  )
  const slug = `diy-${slugify(normalized.title || prompt)}`
  const title = normalized.title || (isZh(input.locale) ? 'DIY 空间' : 'DIY Space')
  const description = normalized.description || prompt
  const buildInput = {
    slug,
    title,
    description,
    channels: normalized.channels,
    buddyName: normalized.buddyName,
    systemPrompt: normalized.systemPrompt,
    selectedPlugins,
    suggestedSkills: normalized.suggestedSkills,
    locale: input.locale,
  }
  const templateCandidate = buildTemplate(buildInput)
  const generateOutput = buildStepOutput({
    input,
    step: 'generate',
    status: 'completed',
    title: isZh(input.locale) ? '配置生成 JSON Output' : 'Config generation JSON output',
    confidence: generationResult ? 0.84 : 0.7,
    result: {
      slug,
      title,
      description,
      channels: normalized.channels,
      buddyName: normalized.buddyName,
      selectedPluginIds: selectedPlugins.map((plugin) => plugin.id),
      suggestedSkills: normalized.suggestedSkills,
      modelRequiredKeys: normalized.requiredKeys,
      templateCandidateName: templateCandidate.name,
    },
    reasons: [
      generationResult
        ? isZh(input.locale)
          ? '生成模型先产出草案，再做一次自检收敛。'
          : 'The generation model produced an initial draft and then performed a second-pass refinement.'
        : isZh(input.locale)
          ? '生成模型不可用，使用本地确定性草案保证流程可完成。'
          : 'The generator model was unavailable, so deterministic local drafting kept the flow complete.',
      isZh(input.locale)
        ? '频道、Buddy 和指南书使用用户语言生成。'
        : 'Channels, Buddy identity, and guidebook are generated in the user language.',
      isZh(input.locale)
        ? '只把服务端 allowlist 允许的插件写入模板。'
        : 'Only server allowlist-compatible plugins are written into the template.',
    ],
    raw: generationResult?.raw ?? {
      fallbackGenerator: true,
      fallbackDraft: fallbackDraft({ ...input, prompt }),
      normalized,
    },
  })
  agentOutputs.push(generateOutput)

  await emitProgress(options, {
    step: 'generate',
    status: 'completed',
    title: isZh(input.locale) ? '配置草案已生成' : 'Config draft generated',
    detail: isZh(input.locale)
      ? `已生成 ${normalized.channels.length} 个频道、1 个 Buddy 和 ${selectedPlugins.length} 个插件引用。`
      : `Generated ${normalized.channels.length} channels, 1 Buddy, and ${selectedPlugins.length} plugin references.`,
    meta: {
      slug,
      title,
      channels: normalized.channels,
      selectedPlugins: selectedPlugins.map((plugin) => plugin.id),
    },
    output: generateOutput,
  })

  await emitProgress(options, {
    step: 'validate',
    status: 'running',
    title: isZh(input.locale)
      ? '执行结构、策略和部署边界校验'
      : 'Running structure, policy, and deployment checks',
    detail: isZh(input.locale)
      ? '正在校验 Cloud schema、模版策略 allowlist、运行时密钥引用和部署边界。'
      : 'Validating Cloud schema, template policy allowlist, runtime secret refs, and deployability.',
  })

  const reliable = ensureReliableTemplate(templateCandidate, buildInput)
  const template = reliable.template
  const validation = reliable.validation
  const requiredKeys = requiredKeysForPlugins(selectedPlugins, input.locale).filter(
    (key) =>
      ![
        'OPENAI_COMPATIBLE_API_KEY',
        'OPENAI_COMPATIBLE_BASE_URL',
        'OPENAI_COMPATIBLE_MODEL_ID',
      ].includes(key.key),
  )
  const validateOutput = buildStepOutput({
    input,
    step: 'validate',
    status: validation.valid ? 'completed' : 'warning',
    title: isZh(input.locale) ? '校验修复 JSON Output' : 'Validation and repair JSON output',
    confidence: validation.valid ? 0.9 : 0.72,
    result: {
      valid: validation.valid,
      agents: validation.agents,
      configurations: validation.configurations,
      secretRefs: validation.templateRefs.secret,
      violations: validation.violations,
      extendsErrors: validation.extendsErrors,
      repairNotes: reliable.repairNotes,
      requiredKeys: requiredKeys.map((key) => ({
        key: key.key,
        label: key.label,
        source: key.source,
        sourcePluginId: key.sourcePluginId,
      })),
    },
    reasons: [
      isZh(input.locale)
        ? 'AI 生成的模板必须再次通过服务端策略校验。'
        : 'AI-generated templates must pass server-side policy validation again.',
      reliable.repairNotes.length > 0
        ? isZh(input.locale)
          ? '发现结构问题后已自动修复，并保留通过校验的版本。'
          : 'Structural issues were repaired automatically and the validated version was kept.'
        : isZh(input.locale)
          ? '模板结构一次性通过校验。'
          : 'The template structure passed validation without repair.',
      isZh(input.locale)
        ? '部署密钥只列出变量名和填写指南，不生成真实密钥。'
        : 'Deployment credentials list variable names and setup guidance only; no real secrets are generated.',
    ],
    raw: {
      templateCandidate,
      finalTemplate: template,
      validation,
      repairNotes: reliable.repairNotes,
    },
  })
  agentOutputs.push(validateOutput)
  await emitProgress(options, {
    step: 'validate',
    status: validation.valid ? 'completed' : 'warning',
    title: validation.valid
      ? isZh(input.locale)
        ? '校验通过'
        : 'Validation passed'
      : isZh(input.locale)
        ? '校验完成，需要复核'
        : 'Validation complete, review needed',
    detail: validation.valid
      ? isZh(input.locale)
        ? '结构、策略和部署边界校验均已通过。'
        : 'Structure, policy, and deployability checks passed.'
      : isZh(input.locale)
        ? '草案已生成，但部署前需要查看校验提示。'
        : 'The draft is generated, but review the validation notes before deployment.',
    meta: {
      agents: validation.agents,
      configurations: validation.configurations,
      secretRefs: validation.templateRefs.secret,
      violations: validation.violations.length,
      extendsErrors: validation.extendsErrors.length,
      repairCount: reliable.repairNotes.length,
    },
    output: validateOutput,
  })

  const matchedPlugins = selectedPlugins.map((plugin) => ({
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    reason: pluginReason(plugin, input.locale),
    capabilities: plugin.capabilities,
    requiredKeys: pluginAuthFields(plugin).map((field) => field.key),
    docsExcerpt: plugin.readme.excerpt,
    matchedTerms: Array.isArray((plugin as Partial<PluginLibrarySearchResult>).matchedTerms)
      ? ((plugin as Partial<PluginLibrarySearchResult>).matchedTerms ?? [])
      : [],
  }))

  const scorePenalty = validation.valid ? 0 : 14
  const missingKeyPenalty = Math.min(requiredKeys.length * 3, 12)
  const score = Math.max(45, Math.min(98, normalized.score - scorePenalty - missingKeyPenalty))
  const guidebook =
    reliable.repairNotes.length > 0
      ? {
          ...normalized.guidebook,
          reviewNotes: uniqueStrings(
            [
              ...normalized.guidebook.reviewNotes,
              isZh(input.locale)
                ? '生成 Agent 已自动修复配置结构，并保留最终通过策略校验的版本。'
                : 'The generation agent repaired the config structure and kept the policy-validated version.',
            ],
            8,
          ),
        }
      : normalized.guidebook

  await emitProgress(options, {
    step: 'review',
    status: 'running',
    title: isZh(input.locale) ? '整理 Review 报告' : 'Preparing the review report',
    detail: isZh(input.locale)
      ? '正在整理最终方案、指南书、密钥准备清单和部署摘要。'
      : 'Preparing the final plan, guidebook, key checklist, and deployment summary.',
    meta: {
      score,
      requiredKeys: requiredKeys.length,
    },
  })

  const referenceTemplateSummaries = referenceTemplates.map((template) => ({
    slug: template.slug,
    title: template.title,
    description: template.description,
    category: template.category,
    plugins: template.plugins,
    channels: template.channels,
    buddyNames: template.buddyNames,
    reason: templateReason(template, input.locale),
  }))

  const agentReport = buildAgentReport({
    input,
    prompt,
    normalized,
    selectedPlugins,
    matchedPlugins,
    referenceTemplates: referenceTemplateSummaries,
    validation,
    reliable,
    requiredKeys,
  })
  const reviewOutput = buildStepOutput({
    input,
    step: 'review',
    status: 'completed',
    title: isZh(input.locale) ? '最终 Review JSON Output' : 'Final review JSON output',
    confidence: validation.valid ? 0.88 : 0.7,
    result: {
      score,
      title,
      description,
      guidebookSummary: guidebook.summary,
      beforeDeploy: guidebook.beforeDeploy,
      howToUse: guidebook.howToUse,
      reviewNotes: guidebook.reviewNotes,
      requiredKeys: requiredKeys.map((key) => key.key),
      nextActions: ['adjust', 'deploy'],
    },
    reasons: [
      isZh(input.locale)
        ? '最终报告只保留用户需要复核的方案、指南和部署准备项。'
        : 'The final report keeps the plan, guide, and deployment prep items needed for human review.',
      isZh(input.locale)
        ? '用户可以批注后重新生成，或进入逐项部署向导。'
        : 'The user can annotate and regenerate, or continue into the step-by-step deployment guide.',
      isZh(input.locale)
        ? `评分综合了结构校验、密钥准备成本和模板完整度。`
        : 'The score combines structure validation, credential prep cost, and template completeness.',
    ],
    raw: {
      agentReport,
      guidebook,
      score,
      matchedPlugins,
      referenceTemplates: referenceTemplateSummaries,
      template,
      validation,
    },
  })
  agentOutputs.push(reviewOutput)

  const draft: DiyCloudDraft = {
    slug,
    title,
    description,
    score,
    steps: [
      {
        id: 'think',
        title: isZh(input.locale) ? '思考目标' : 'Think through the goal',
        detail: isZh(input.locale)
          ? '已拆解使用场景、默认频道和 Buddy 角色。'
          : 'Use case, default channels, and Buddy role have been shaped.',
      },
      {
        id: 'search',
        title: isZh(input.locale) ? '检索插件与技能' : 'Match plugins and skills',
        detail: isZh(input.locale)
          ? `从 ${listPluginLibrary().length} 个官方插件和 ${listTemplateLibrary().length} 个官方模版中匹配能力。`
          : `Matched capabilities from ${listPluginLibrary().length} official plugins and ${listTemplateLibrary().length} official templates.`,
      },
      {
        id: 'generate',
        title: isZh(input.locale) ? '生成 Cloud 模版' : 'Generate Cloud template',
        detail: isZh(input.locale)
          ? '已生成服务器、频道、Buddy、运行时和插件配置。'
          : 'Server, channels, Buddy, runtime, and plugin config are generated.',
      },
      {
        id: 'validate',
        title: isZh(input.locale) ? '审查和校验' : 'Review and validate',
        detail: validation.valid
          ? isZh(input.locale)
            ? '结构校验通过，可以进入人工复核。'
            : 'Structural validation passed. Ready for human review.'
          : isZh(input.locale)
            ? '结构已生成，但需要根据提示调整后再部署。'
            : 'Draft generated, but review notes should be addressed before deployment.',
      },
      {
        id: 'review',
        title: isZh(input.locale) ? '人工 Review' : 'Human review',
        detail: isZh(input.locale)
          ? '确认配置和指南书后，可以保存到我的模版并一键部署。'
          : 'After reviewing the config and guidebook, save it to My Templates and deploy in one click.',
      },
    ],
    matchedPlugins,
    referenceTemplates: referenceTemplateSummaries,
    suggestedSkills: normalized.suggestedSkills,
    requiredKeys,
    toolTrace,
    agentOutputs,
    agentReport,
    guidebook,
    template,
    validation,
  }
  await emitProgress(options, {
    step: 'review',
    status: 'completed',
    title: isZh(input.locale) ? '方案可供 Review' : 'Plan ready for review',
    detail: isZh(input.locale)
      ? '你可以查看报告，选择重新调整，或进入部署配置向导。'
      : 'Review the report, adjust it, or continue into the deployment setup guide.',
    meta: {
      score,
      valid: validation.valid,
      requiredKeys: requiredKeys.map((key) => key.key),
    },
    output: reviewOutput,
  })
  await emitDraft(options, draft)
  return draft
}
