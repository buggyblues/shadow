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
} from '../diy-cloud-template-maintenance.service'
import { BASE_PLUGIN_IDS } from './config'
import type {
  AgentFinalAnswer,
  DiyCloudDraft,
  DiyCloudGenerateInput,
  DiyCloudMatchedPlugin,
  DiyCloudTemplateReference,
  DiyCloudToolExecution,
  DiyCloudToolTrace,
  DiyTemplateDsl,
} from './types'
import {
  clampScore,
  compactText,
  invalidFinalPlan,
  parseStringArray,
  requiredText,
  slugify,
  uniqueStrings,
} from './utils'

export function pluginAuthFields(plugin: PluginLibraryEntry) {
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

function keySetupSteps(plugin: PluginLibraryEntry, key: string) {
  const setupLines = plugin.readme.excerpt
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\./.test(line))
    .map((line) => line.replace(/^\d+\.\s*/, ''))
  if (setupLines.length > 0) return setupLines.slice(0, 5)
  return [`Provide ${key} for ${plugin.name} before enabling this integration.`]
}

function keySkipImpact(plugin: PluginLibraryEntry) {
  if (plugin.id === 'model-provider') {
    return 'The official model provider remains available until a private provider is configured.'
  }
  return `${plugin.name} automation stays disabled until its credential is added.`
}

export function requiredKeysForPlugins(pluginIds: string[]): DiyCloudDraft['requiredKeys'] {
  const byId = new Map(listPluginLibrary().map((plugin) => [plugin.id, plugin]))
  const keys: DiyCloudDraft['requiredKeys'] = []
  for (const id of pluginIds) {
    const plugin = byId.get(id)
    if (!plugin) continue
    for (const field of pluginAuthFields(plugin)) {
      if (
        [
          'OPENAI_COMPATIBLE_API_KEY',
          'OPENAI_COMPATIBLE_BASE_URL',
          'OPENAI_COMPATIBLE_MODEL_ID',
        ].includes(field.key)
      ) {
        continue
      }
      keys.push({
        key: field.key,
        label: field.label,
        description: field.description ?? plugin.description,
        source: plugin.name,
        sourcePluginId: plugin.id,
        sensitive: field.sensitive,
        setupSteps: keySetupSteps(plugin, field.key),
        skipImpact: keySkipImpact(plugin),
      })
    }
  }
  return keys
}

export function compactPlugin(plugin: PluginLibraryEntry | PluginLibrarySearchResult) {
  return {
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    category: plugin.category,
    capabilities: plugin.capabilities.slice(0, 8),
    requiredKeys: pluginAuthFields(plugin).map((field) => field.key),
    docsExcerpt: plugin.readme.excerpt.slice(0, 1000),
    matchedTerms: Array.isArray((plugin as Partial<PluginLibrarySearchResult>).matchedTerms)
      ? ((plugin as Partial<PluginLibrarySearchResult>).matchedTerms ?? [])
      : [],
    score: 'score' in plugin ? plugin.score : undefined,
  }
}

export function compactTemplate(template: TemplateLibraryEntry | TemplateLibrarySearchResult) {
  return {
    slug: template.slug,
    title: template.title,
    description: template.description,
    category: template.category,
    plugins: template.plugins,
    channels: template.channels,
    buddyNames: template.buddyNames,
    systemPromptExcerpt: template.systemPromptExcerpt,
    valid: template.valid,
    score: 'score' in template ? template.score : undefined,
  }
}

export function readDslChannels(dsl: DiyTemplateDsl) {
  const server = dsl.space?.servers?.[0]
  const channels = (server?.channels ?? [])
    .map((channel) => compactText(channel.name, 40))
    .filter(Boolean)
    .slice(0, 5)
  if (channels.length === 0) invalidFinalPlan('DIY Cloud model final plan is missing channels')
  return channels
}

export function readDslBuddy(dsl: DiyTemplateDsl) {
  const buddy = dsl.buddies?.[0]
  if (!buddy) invalidFinalPlan('DIY Cloud model final plan is missing a Buddy')
  const skills = parseStringArray(buddy.skills, 8)
  if (skills.length === 0) invalidFinalPlan('DIY Cloud model final plan is missing Buddy skills')
  return {
    name: requiredText(buddy.name, 'Buddy name', 48),
    role: requiredText(buddy.role, 'Buddy role', 240),
    systemPrompt: requiredText(buddy.systemPrompt, 'Buddy systemPrompt', 1800),
    skills,
  }
}

export function readDslGuidebook(dsl: DiyTemplateDsl): DiyCloudDraft['guidebook'] {
  const beforeDeploy = parseStringArray(dsl.guidebook?.beforeDeploy, 8)
  const howToUse = parseStringArray(dsl.guidebook?.howToUse, 8)
  const reviewNotes = parseStringArray(dsl.guidebook?.reviewNotes, 8)
  if (beforeDeploy.length === 0) {
    invalidFinalPlan('DIY Cloud model final plan is missing guidebook.beforeDeploy')
  }
  if (howToUse.length === 0) {
    invalidFinalPlan('DIY Cloud model final plan is missing guidebook.howToUse')
  }
  return {
    summary: requiredText(dsl.guidebook?.summary, 'guidebook.summary', 400),
    beforeDeploy,
    howToUse,
    reviewNotes,
  }
}

export function pickKnownPluginIds(pluginIds: unknown[], selectedPluginIds: unknown[]) {
  const allowed = new Set(listPluginLibrary().map((plugin) => plugin.id))
  return uniqueStrings([...BASE_PLUGIN_IDS, ...pluginIds, ...selectedPluginIds], 10).filter((id) =>
    allowed.has(id),
  )
}

export function compileTemplateDsl(
  input: DiyCloudGenerateInput,
  dsl: DiyTemplateDsl,
  pluginIds: string[],
) {
  const title = requiredText(dsl.title, 'title', 80)
  const description = requiredText(dsl.description, 'description', 240)
  const channels = readDslChannels(dsl)
  const buddy = readDslBuddy(dsl)
  const slug = `diy-${slugify(title)}`
  const channelRecords = channels.map((channel, index) => ({
    id: slugify(channel) || `channel-${index + 1}`,
    title: channel,
    type: 'text',
  }))
  const pluginUse = pluginIds
    .filter(
      (id) =>
        !BASE_PLUGIN_IDS.includes(id as (typeof BASE_PLUGIN_IDS)[number]) && id !== 'agent-pack',
    )
    .slice(0, 6)
    .map((plugin) => ({ plugin }))
  const usesAgentPack = pluginIds.includes('agent-pack')

  return {
    version: '1.0.0',
    name: slug,
    title,
    description,
    environment: 'production',
    use: [
      { plugin: 'model-provider' },
      {
        plugin: 'shadowob',
        options: {
          servers: [
            {
              id: 'diy-hq',
              name: title,
              slug,
              channels: channelRecords,
            },
          ],
          buddies: [{ id: 'diy-buddy', name: buddy.name }],
          bindings: [
            {
              targetId: 'diy-buddy',
              targetType: 'buddy',
              servers: ['diy-hq'],
              channels: channelRecords.map((channel) => channel.id),
              agentId: 'diy-buddy-agent',
            },
          ],
          playLaunch: {
            defaultChannelName: channelRecords[0]?.id ?? 'general',
            greeting: compactText(dsl.guidebook?.summary, 500) || description,
          },
        },
      },
      ...pluginUse,
    ],
    deployments: {
      namespace: slug,
      agents: [
        {
          id: 'diy-buddy-agent',
          runtime: 'openclaw',
          description,
          identity: {
            name: buddy.name,
            personality:
              'Precise, operational, and evidence-oriented. Ask for missing context, cite available sources, and keep work inside the channel.',
            systemPrompt: buddy.systemPrompt,
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
              instructions: buddy.skills.map((skill) => `Use ${skill} when relevant.`),
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
      en: { title, description },
      'zh-CN': { title, description },
    },
    [CLOUD_SAAS_RUNTIME_KEY]: {
      modelProviderMode: 'official',
      officialModelProxy: true,
    },
  }
}

export function ensureReliableTemplate(
  candidate: Record<string, unknown>,
  input: DiyCloudGenerateInput,
  dsl: DiyTemplateDsl,
  pluginIds: string[],
): {
  template: Record<string, unknown>
  validation: DiyCloudDraft['validation']
  repairNotes: string[]
} {
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
  const repaired = repairDiyCloudTemplateShape(candidate, {
    slug: compactText(candidate.name, 64) || `diy-${slugify(dsl.title ?? input.prompt)}`,
    title: requiredText(dsl.title, 'title', 80),
    description: requiredText(dsl.description, 'description', 220),
    buddyName: readDslBuddy(dsl).name,
  })
  validateDiyCloudTemplateCandidate(repaired)
  return {
    template: repaired,
    validation: summarizeCloudConfigValidation(repaired),
    repairNotes,
  }
}

export function toolTrace(tools: DiyCloudToolExecution[]): DiyCloudToolTrace[] {
  const resultItems = (result: unknown) => {
    if (Array.isArray(result)) return result
    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>
      for (const key of ['plugins', 'templates', 'requiredKeys', 'items']) {
        const value = record[key]
        if (Array.isArray(value)) return value
      }
    }
    return []
  }
  return tools.map((tool) => ({
    tool: tool.name,
    query:
      typeof tool.args.query === 'string'
        ? tool.args.query
        : typeof tool.args.pluginId === 'string'
          ? tool.args.pluginId
          : typeof tool.args.slug === 'string'
            ? tool.args.slug
            : undefined,
    resultIds: resultItems(tool.result)
      .map((item) => {
        if (!item || typeof item !== 'object') return ''
        const record = item as Record<string, unknown>
        return typeof record.id === 'string'
          ? record.id
          : typeof record.slug === 'string'
            ? record.slug
            : ''
      })
      .filter(Boolean),
  }))
}

export function selectedPlugins(answer: AgentFinalAnswer) {
  const byId = new Map(listPluginLibrary().map((plugin) => [plugin.id, plugin]))
  return pickKnownPluginIds(answer.selectedPluginIds ?? [], [])
    .map((id) => byId.get(id))
    .filter((plugin): plugin is PluginLibraryEntry => Boolean(plugin))
}

export function selectedTemplates(answer: AgentFinalAnswer) {
  return [...new Set(answer.selectedTemplateSlugs ?? [])]
    .map((slug) => listTemplateLibrary().find((template) => template.slug === slug))
    .filter((template): template is TemplateLibraryEntry => Boolean(template))
    .slice(0, 5)
}

export function pluginReason(plugin: PluginLibraryEntry, answer: AgentFinalAnswer) {
  const decision = answer.decisions?.find((item) => item.selected?.includes(plugin.id))
  if (decision?.rationale) return decision.rationale
  return plugin.description
}

export function buildMatchedPlugins(
  selected: PluginLibraryEntry[],
  answer: AgentFinalAnswer,
): DiyCloudMatchedPlugin[] {
  return selected.map((plugin) => ({
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    reason: pluginReason(plugin, answer),
    capabilities: plugin.capabilities,
    requiredKeys: pluginAuthFields(plugin).map((field) => field.key),
    matchedTerms: [],
  }))
}

export function buildReferenceTemplates(answer: AgentFinalAnswer): DiyCloudTemplateReference[] {
  return selectedTemplates(answer).map((template) => {
    const decision = answer.decisions?.find((item) => item.selected?.includes(template.slug))
    return {
      slug: template.slug,
      title: template.title,
      description: template.description,
      category: template.category,
      plugins: template.plugins,
      channels: template.channels,
      buddyNames: template.buddyNames,
      reason: decision?.rationale ?? template.description,
    }
  })
}

export function buildAgentReport({
  input,
  answer,
  matchedPlugins,
  referenceTemplates,
  validation,
  requiredKeys,
  repairNotes,
}: {
  input: DiyCloudGenerateInput
  answer: AgentFinalAnswer
  matchedPlugins: DiyCloudMatchedPlugin[]
  referenceTemplates: DiyCloudTemplateReference[]
  validation: DiyCloudDraft['validation']
  requiredKeys: DiyCloudDraft['requiredKeys']
  repairNotes: string[]
}): DiyCloudDraft['agentReport'] {
  const decision = (step: DiyCloudDraft['agentReport']['reasoning'][number]['step']) =>
    answer.decisions?.find((item) => item.step === step)
  const reasoning = (['think', 'search', 'generate', 'validate', 'review'] as const).map((step) => {
    const item = decision(step)
    const evidence = uniqueStrings(
      [
        ...(Array.isArray(item?.evidence) ? item.evidence : []),
        ...(step === 'search'
          ? [
              ...matchedPlugins.map((plugin) => `${plugin.id}: ${plugin.reason}`),
              ...referenceTemplates.map((template) => `${template.slug}: ${template.reason}`),
            ]
          : []),
        ...(step === 'validate'
          ? [
              `Buddy count: ${validation.agents}`,
              `Config entries: ${validation.configurations}`,
              `Structural repairs: ${repairNotes.length}`,
            ]
          : []),
        ...(step === 'review' ? requiredKeys.map((key) => `${key.source}: ${key.key}`) : []),
      ],
      10,
    )
    return {
      step,
      title: item?.title ?? step,
      detail: item?.rationale ?? answer.intent ?? compactText(input.prompt, 260),
      evidence,
    }
  })

  return {
    objective: answer.intent || compactText(input.prompt, 260),
    assumptions: parseStringArray(answer.assumptions, 8),
    reasoning,
    pluginDecisions: matchedPlugins.map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      reason: plugin.reason,
      capabilities: plugin.capabilities.slice(0, 6),
      matchedTerms: plugin.matchedTerms,
      requiredKeys: plugin.requiredKeys,
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
        key: 'structure',
        status: validation.extendsErrors.length === 0 ? 'passed' : 'warning',
        detail:
          validation.extendsErrors.length === 0
            ? 'The generated structure satisfies the Cloud config schema.'
            : validation.extendsErrors.join('; '),
      },
      {
        key: 'policy',
        status: validation.violations.length === 0 ? 'passed' : 'warning',
        detail:
          validation.violations.length === 0
            ? 'Plugin references and deployment fields stay inside server-side policy boundaries.'
            : validation.violations.map((violation) => violation.path).join(', '),
      },
      {
        key: 'credentials',
        status: requiredKeys.length === 0 ? 'passed' : 'warning',
        detail:
          requiredKeys.length === 0
            ? 'No additional business credentials are required.'
            : requiredKeys.map((key) => key.label).join(', '),
      },
    ],
    repairNotes,
  }
}

export function listDiyCloudPlugins() {
  return listPluginLibrary()
}

export function searchDiyCloudPlugins(query: string) {
  return searchPluginLibrary(query, { limit: 16, includeIds: [...BASE_PLUGIN_IDS] })
}

export function listDiyCloudTemplates() {
  return listTemplateLibrary().filter((template) => template.valid)
}

export function searchDiyCloudTemplates(query: string, limit: number) {
  return searchTemplateLibrary(query, { limit }).filter((template) => template.valid)
}

export function estimateDiyCloudInputBudget(input: DiyCloudGenerateInput) {
  const inputText = [
    input.prompt,
    input.feedback ?? '',
    input.previousConfig ? JSON.stringify(input.previousConfig).slice(0, 12_000) : '',
  ].join('\n')
  return {
    characters: inputText.length,
    estimatedTokens: Math.ceil(inputText.length / 3.5),
  }
}

export function scoreFromAnswer(answer: AgentFinalAnswer) {
  return clampScore(answer.score)
}
