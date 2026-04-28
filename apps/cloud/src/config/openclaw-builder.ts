/**
 * OpenClaw Config Builder — transforms AgentDeployment + CloudConfig into OpenClawConfig.
 *
 * Extracted from parser.ts to:
 * 1. Keep the main parser focused on file I/O and validation
 * 2. Break the implicit circular dependency between runtimes/ and config/parser.ts
 * 3. Make each builder section independently testable
 *
 * Each build* function handles one concern and returns a partial OpenClawConfig
 * that gets merged by the top-level buildOpenClawConfig.
 */

import {
  mergePluginFragments,
  resolveAgentPluginConfig,
  resolvePluginSecrets,
} from '../plugins/config-merger.js'
import { getPluginRegistry } from '../plugins/registry.js'
import type {
  PluginBuildContext,
  PluginDefinition,
  PluginRuntimeExtension,
} from '../plugins/types.js'
import { getRuntime } from '../runtimes/index.js'

import type {
  AgentDeployment,
  CloudConfig,
  OpenClawAgentConfig,
  OpenClawAgentDefaults,
  OpenClawConfig,
  OpenClawGatewayConfig,
  OpenClawModelConfig,
  OpenClawSkillsConfig,
} from './schema.js'

type RuntimeEnv = Record<string, string | undefined>

const CLOUD_REMOVED_BUNDLED_PLUGINS = ['bonjour'] as const

// ─── Sub-builders ────────────────────────────────────────────────────────────

/**
 * Build the agents section: agent entry + defaults from openclaw config.
 */
function buildAgentsSection(
  agent: AgentDeployment,
  oc: OpenClawConfig | undefined,
): { agentEntry: OpenClawAgentConfig; agents: OpenClawConfig['agents'] } {
  const agentEntry: OpenClawAgentConfig = {
    id: agent.id,
    default: true,
    name: agent.identity?.name ?? agent.id,
  }

  if (agent.identity?.name) {
    agentEntry.identity = { name: agent.identity.name }
  }

  let agents: OpenClawConfig['agents']

  if (oc) {
    if (oc.agents?.defaults) {
      const { systemPrompt: _sp, ...defaults } = oc.agents.defaults as OpenClawAgentDefaults & {
        systemPrompt?: string
      }
      agents = { defaults }
    }

    const agentListEntry = oc.agents?.list?.find((a) => a.id === agent.id)
    if (agentListEntry) {
      Object.assign(agentEntry, agentListEntry)
    } else if (oc.agents?.defaults?.workspace) {
      agentEntry.workspace = oc.agents.defaults.workspace
    }

    const defaultsSystemPrompt = (oc.agents?.defaults as Record<string, unknown>)?.systemPrompt as
      | string
      | undefined
    if (defaultsSystemPrompt && !agentEntry.systemPrompt) {
      agentEntry.systemPrompt = defaultsSystemPrompt
    }
  }

  return { agentEntry, agents }
}

/**
 * Copy direct openclaw config sections (tools, session, acp, plugins, skills).
 */
function copyOpenClawSections(oc: OpenClawConfig | undefined): Partial<OpenClawConfig> {
  if (!oc) return {}
  const result: Partial<OpenClawConfig> = {}
  if (oc.tools) result.tools = oc.tools
  if (oc.session) result.session = oc.session
  if (oc.acp) result.acp = oc.acp
  if (oc.plugins) result.plugins = oc.plugins
  if (oc.skills) result.skills = oc.skills
  return result
}

function stripCloudRemovedBundledPlugins(openclawConfig: OpenClawConfig): void {
  const entries = openclawConfig.plugins?.entries
  if (!entries) return

  for (const pluginId of CLOUD_REMOVED_BUNDLED_PLUGINS) {
    delete entries[pluginId]
  }
}

/**
 * Merge identity/soul into the agent entry's system prompt.
 */
function applyIdentity(agentEntry: OpenClawAgentConfig, agent: AgentDeployment): void {
  if (agent.identity) {
    const { personality, systemPrompt } = agent.identity
    let finalPrompt = agentEntry.systemPrompt ?? ''

    if (personality && systemPrompt) {
      finalPrompt = `${personality}\n\n${systemPrompt}`
    } else if (personality) {
      finalPrompt = personality + (finalPrompt ? `\n\n${finalPrompt}` : '')
    } else if (systemPrompt) {
      finalPrompt = systemPrompt
    }

    if (finalPrompt) {
      agentEntry.instructions = finalPrompt
    }
  }

  if (agentEntry.systemPrompt && !agentEntry.instructions) {
    agentEntry.instructions = agentEntry.systemPrompt
  }
  delete agentEntry.systemPrompt
}

/**
 * Build model config from agent.model > team.defaultModel.
 */
function buildModelConfig(
  agent: AgentDeployment,
  config: CloudConfig,
  agentsDefaults: NonNullable<OpenClawConfig['agents']>,
): void {
  const effectiveModel = agent.model ?? agent.configuration.model ?? config.team?.defaultModel
  if (!effectiveModel) return

  if (!agentsDefaults.defaults) agentsDefaults.defaults = {}

  const ocModel: OpenClawModelConfig = { primary: effectiveModel.preferred }
  if (effectiveModel.fallbacks?.length) {
    ocModel.fallbacks = effectiveModel.fallbacks
  }
  agentsDefaults.defaults.model = ocModel

  if (effectiveModel.constraints) {
    const { temperature, maxTokens, thinkingLevel } = effectiveModel.constraints
    if (temperature != null || maxTokens != null) {
      if (!agentsDefaults.defaults.models) agentsDefaults.defaults.models = {}
      const modelId = effectiveModel.preferred
      const catalogEntry = agentsDefaults.defaults.models[modelId] ?? {}
      if (!catalogEntry.params) catalogEntry.params = {}
      if (temperature != null) catalogEntry.params.temperature = temperature
      if (maxTokens != null) catalogEntry.params.maxTokens = maxTokens
      agentsDefaults.defaults.models[modelId] = catalogEntry
    }
    if (thinkingLevel) {
      agentsDefaults.defaults.thinkingDefault = thinkingLevel
    }
  }
}

/**
 * Apply permission policy → tools config.
 */
function applyPermissions(agent: AgentDeployment, openclawConfig: OpenClawConfig): void {
  if (!agent.permissions) return

  const PERM_MAP: Record<string, NonNullable<NonNullable<OpenClawConfig['tools']>['profile']>> = {
    'always-allow': 'dangerously-skip-permissions',
    'approve-reads': 'approve-reads',
    'always-ask': 'approve-all',
    'deny-all': 'deny-all',
  }

  if (!openclawConfig.tools) openclawConfig.tools = {}
  const mappedDefault = PERM_MAP[agent.permissions.default]
  if (mappedDefault) {
    openclawConfig.tools.profile = mappedDefault
  }

  // nonInteractive: what happens when approval is needed but no human is present
  if (agent.permissions.nonInteractive) {
    openclawConfig.tools.nonInteractive = agent.permissions.nonInteractive
  }

  if (agent.permissions.tools) {
    const allow: string[] = []
    const deny: string[] = []
    const readOnly: string[] = []
    for (const [tool, level] of Object.entries(agent.permissions.tools)) {
      if (level === 'always-allow') allow.push(tool)
      else if (level === 'deny-all') deny.push(tool)
      else if (level === 'approve-reads') readOnly.push(tool)
      // 'always-ask' at per-tool level → included in neither allow nor deny
    }
    if (allow.length) openclawConfig.tools.allow = [...(openclawConfig.tools.allow ?? []), ...allow]
    if (deny.length) openclawConfig.tools.deny = [...(openclawConfig.tools.deny ?? []), ...deny]
    if (readOnly.length)
      openclawConfig.tools.readOnly = [...(openclawConfig.tools.readOnly ?? []), ...readOnly]
  }
}

/**
 * Build models/providers config from registry.
 */
function buildProvidersConfig(config: CloudConfig): OpenClawConfig['models'] {
  if (!config.registry?.providers?.length) return undefined

  const API_TYPE_MAP: Record<string, string> = {
    anthropic: 'anthropic-messages',
    openai: 'openai-completions',
    'openai-chat': 'openai-completions',
    google: 'google-generative-ai',
    gemini: 'google-generative-ai',
    bedrock: 'bedrock-converse-stream',
    azure: 'azure-openai-responses',
    'azure-openai': 'azure-openai-responses',
  }
  const DEFAULT_BASE_URLS: Record<string, string> = {
    anthropic: 'https://api.anthropic.com',
    openai: 'https://api.openai.com/v1',
  }

  const providers: Record<string, Record<string, unknown>> = {}
  for (const p of config.registry.providers) {
    const providerId = p.id ?? p.baseUrl ?? 'custom'
    const providerEntry: Record<string, unknown> = {}
    // Support both `api` and legacy `apiType` field names
    const apiField = p.api ?? ((p as Record<string, unknown>).apiType as string | undefined)
    if (apiField) providerEntry.api = API_TYPE_MAP[apiField] ?? apiField
    if (p.apiKey) providerEntry.apiKey = p.apiKey
    if (p.auth) providerEntry.auth = p.auth
    providerEntry.baseUrl = p.baseUrl ?? DEFAULT_BASE_URLS[providerId]
    if (p.headers) providerEntry.headers = p.headers
    // Allow LLM API calls to resolve to private/special-use IPs
    // (common in container envs behind proxy/VPN where DNS returns e.g. 198.18.x.x)
    providerEntry.request = { allowPrivateNetwork: true }
    if (p.models?.length) {
      providerEntry.models = p.models.map((m) => {
        const entry: Record<string, unknown> = { id: m.id, name: m.name ?? m.id }
        if (m.contextWindow != null) entry.contextWindow = m.contextWindow
        if (m.maxTokens != null) entry.maxTokens = m.maxTokens
        return entry
      })
    } else {
      // OpenClaw requires models to be an array (even if empty) — omitting it causes config validation failure
      providerEntry.models = []
    }
    providers[providerId] = providerEntry
  }

  return { mode: 'merge', providers }
}

/**
 * Build cloud-level skills config.
 */
function buildCloudSkillsConfig(
  config: CloudConfig,
  existingSkills: OpenClawSkillsConfig | undefined,
): OpenClawSkillsConfig | undefined {
  if (!config.skills?.entries?.length) return existingSkills

  const cloudSkills = config.skills
  const skillsConfig: OpenClawSkillsConfig = existingSkills ?? {}
  const installDir = cloudSkills.installDir ?? '/app/skills'

  if (!skillsConfig.load) skillsConfig.load = {}
  const extraDirs = new Set(skillsConfig.load.extraDirs ?? [])
  extraDirs.add(installDir)
  skillsConfig.load.extraDirs = [...extraDirs]

  if (!skillsConfig.entries) skillsConfig.entries = {}
  for (const skill of cloudSkills.entries ?? []) {
    const skillEntry = skillsConfig.entries[skill.name] ?? {}
    skillsConfig.entries[skill.name] = skillEntry
    if (skill.enabled != null) skillEntry.enabled = skill.enabled
    if (skill.apiKey) skillEntry.apiKey = skill.apiKey
    if (skill.env) skillEntry.env = { ...skillEntry.env, ...skill.env }
  }

  return skillsConfig
}

/**
 * Apply shared workspace config.
 */
function applySharedWorkspace(
  agent: AgentDeployment,
  config: CloudConfig,
  agentsDefaults: NonNullable<OpenClawConfig['agents']>,
): void {
  if (!config.workspace?.enabled) return
  const baseMountPath = config.workspace?.mountPath ?? '/workspace/shared'
  const agentWorkspace = `${baseMountPath}/${agent.id}`
  if (!agentsDefaults.defaults) agentsDefaults.defaults = {}
  if (!agentsDefaults.defaults.workspace) {
    agentsDefaults.defaults.workspace = agentWorkspace
  }
}

/**
 * Apply compliance → audit logging plugin.
 */
function applyCompliance(
  agent: AgentDeployment,
  config: CloudConfig,
  openclawConfig: OpenClawConfig,
): void {
  const effectiveCompliance = agent.compliance ?? config.team?.defaultCompliance
  if (!effectiveCompliance?.auditLogging) return

  if (!openclawConfig.plugins) openclawConfig.plugins = {}
  if (!openclawConfig.plugins.entries) openclawConfig.plugins.entries = {}
  openclawConfig.plugins.entries['audit-log'] = {
    enabled: true,
    config: {
      riskTier: effectiveCompliance.riskTier ?? 'standard',
      retentionPeriod: effectiveCompliance.retentionPeriod ?? '90d',
      frameworks: effectiveCompliance.frameworks ?? [],
    },
    ...openclawConfig.plugins.entries['audit-log'],
  }
}

/**
 * Build gateway config.
 */
function buildGatewayConfig(
  oc: OpenClawConfig | undefined,
  existing: OpenClawConfig['gateway'],
): OpenClawConfig['gateway'] {
  const userGateway = oc?.gateway ?? {}
  const { host: gwHost, ...restGateway } = userGateway as OpenClawGatewayConfig & { host?: string }
  const gateway = {
    mode: 'local' as const,
    port: 3101,
    bind: 'lan',
    auth: { mode: 'token' as const },
    ...existing,
    ...restGateway,
  }
  if (gwHost && !restGateway.bind) {
    gateway.bind = gwHost
  }
  return gateway
}

/**
 * Normalize legacy tool config fragments that are no longer accepted by the
 * current OpenClaw schema.
 *
 * Older templates used nested `tools.code` / `tools.memory` flags. Current
 * OpenClaw expects capability selection to flow through `tools.profile` and no
 * longer accepts those keys. We strip the stale keys and preserve the closest
 * valid behavior.
 */
function normalizeLegacyToolsConfig(tools: OpenClawConfig['tools']): void {
  if (!tools) return

  const mutableTools = tools as OpenClawConfig['tools'] & Record<string, unknown>
  const legacyCode = mutableTools.code

  const legacyCodeEnabled =
    legacyCode === true ||
    (legacyCode &&
      typeof legacyCode === 'object' &&
      (!('enabled' in legacyCode) ||
        (legacyCode as { enabled?: unknown }).enabled === undefined ||
        Boolean((legacyCode as { enabled?: unknown }).enabled)))

  if (
    (mutableTools.profile === undefined || mutableTools.profile === 'minimal') &&
    legacyCodeEnabled
  ) {
    mutableTools.profile = 'coding'
  }

  delete mutableTools.code
  delete mutableTools.memory
}

/**
 * Strip agent-entry fields not in OpenClaw's strict schema.
 * Returns workspace files to write (e.g., SOUL.md from instructions).
 */
function stripAndCollectWorkspaceFiles(openclawConfig: OpenClawConfig): Record<string, string> {
  const workspaceFiles: Record<string, string> = {}
  const agentList = openclawConfig.agents?.list as Array<Record<string, unknown>> | undefined
  if (agentList) {
    for (const entry of agentList) {
      if (entry.instructions) {
        workspaceFiles['SOUL.md'] = String(entry.instructions)
        delete entry.instructions
      }
      delete entry.params
    }

    // Generate AGENTS.md from the agents list so heartbeat checks pass
    if (agentList.length > 0 && !workspaceFiles['AGENTS.md']) {
      const lines: string[] = ['# Agents', '']
      for (const entry of agentList) {
        const name = String(entry.name ?? entry.id ?? 'agent')
        const desc = entry.description ? ` — ${entry.description}` : ''
        lines.push(`- **${name}**${desc}`)
      }
      workspaceFiles['AGENTS.md'] = lines.join('\n') + '\n'
    }
  }
  return workspaceFiles
}

function forEachEnabledPlugin(
  agent: AgentDeployment,
  config: CloudConfig,
  cwd: string | undefined,
  env: RuntimeEnv | undefined,
  visit: (args: {
    pluginId: string
    pluginDef: PluginDefinition
    context: PluginBuildContext
  }) => void,
): void {
  const registry = getPluginRegistry()
  if (registry.size === 0) return

  for (const pluginDef of registry.getAll()) {
    const pluginId = pluginDef.manifest.id
    const resolved = resolveAgentPluginConfig(pluginId, agent.id, config)
    const allUseEntries = [...(config.use ?? []), ...(agent.use ?? [])]
    const isInUse = allUseEntries.some((entry) => entry.plugin === pluginId)

    // Skip plugins that have no config at all (neither plugins[id] nor use entry)
    if (!resolved && !isInUse) continue

    const effectiveEnv: RuntimeEnv = {
      ...process.env,
      ...(env ?? {}),
      ...(agent.env ?? {}),
    }
    const secrets = {
      ...Object.fromEntries(
        Object.entries(effectiveEnv).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      ),
      ...resolvePluginSecrets(pluginId, config, effectiveEnv),
    }
    const context: PluginBuildContext = {
      agent,
      config,
      agentConfig: resolved ?? {},
      secrets,
      namespace: config.deployments?.namespace ?? 'default',
      pluginRegistry: registry,
      cwd: cwd ?? process.cwd(),
    }

    visit({ pluginId, pluginDef, context })
  }
}

export function collectPluginBuildEnvVars(
  agent: AgentDeployment,
  config: CloudConfig,
  cwd?: string,
  env?: RuntimeEnv,
): Record<string, string> {
  const envVars: Record<string, string> = {}

  forEachEnabledPlugin(agent, config, cwd, env, ({ pluginDef, context }) => {
    for (const fn of pluginDef._hooks.buildEnv) {
      const vars = fn(context)
      if (vars) Object.assign(envVars, vars)
    }
  })

  return envVars
}

function mergeRuntimeExtensions(
  target: PluginRuntimeExtension,
  fragment: PluginRuntimeExtension,
): PluginRuntimeExtension {
  const manifestPatches = [
    ...(target.openclaw?.manifestPatches ?? []),
    ...(fragment.openclaw?.manifestPatches ?? []),
  ]
  const artifacts = new Map<string, NonNullable<PluginRuntimeExtension['artifacts']>[number]>()
  for (const artifact of target.artifacts ?? []) {
    artifacts.set(artifact.kind, artifact)
  }
  for (const artifact of fragment.artifacts ?? []) {
    artifacts.set(artifact.kind, artifact)
  }

  return {
    ...(manifestPatches.length > 0 ? { openclaw: { manifestPatches } } : {}),
    ...(artifacts.size > 0 ? { artifacts: [...artifacts.values()] } : {}),
  }
}

export function collectPluginRuntimeExtensions(
  agent: AgentDeployment,
  config: CloudConfig,
  cwd?: string,
  env?: RuntimeEnv,
): PluginRuntimeExtension {
  let runtimeExtensions: PluginRuntimeExtension = {}

  forEachEnabledPlugin(agent, config, cwd, env, ({ pluginDef, context }) => {
    for (const fn of pluginDef._hooks.buildRuntime) {
      const fragment = fn(context)
      if (fragment) runtimeExtensions = mergeRuntimeExtensions(runtimeExtensions, fragment)
    }
  })

  return runtimeExtensions
}

/**
 * Run the plugin pipeline — iterate enabled plugins, call their providers, and merge results.
 *
 * All plugins use structured providers: configBuilder, env, resources, lifecycle.
 */
function applyPluginPipeline(
  agent: AgentDeployment,
  config: CloudConfig,
  openclawConfig: OpenClawConfig,
  cwd?: string,
  env?: RuntimeEnv,
): void {
  // Collect K8s resources from resource providers
  const pluginResources: Record<string, unknown>[] = []

  forEachEnabledPlugin(agent, config, cwd, env, ({ pluginDef, context }) => {
    // Build OpenClaw config fragment
    for (const fn of pluginDef._hooks.buildConfig) {
      const fragment = fn(context)
      if (fragment) Object.assign(openclawConfig, mergePluginFragments(openclawConfig, fragment))
    }

    // Collect K8s resources
    for (const fn of pluginDef._hooks.buildResources) {
      pluginResources.push(...fn(context))
    }
  })

  if (pluginResources.length > 0) {
    openclawConfig._pluginResources = pluginResources
  }
}

function appendPromptSection(existing: string | undefined, addition: string): string {
  const trimmedAddition = addition.trim()
  if (!trimmedAddition) return existing ?? ''

  const trimmedExisting = existing?.trim()
  if (!trimmedExisting) return trimmedAddition

  return `${trimmedExisting}\n\n---\n\n${trimmedAddition}`
}

function applyPluginPromptPipeline(
  agent: AgentDeployment,
  config: CloudConfig,
  agentEntry: OpenClawAgentConfig,
  cwd?: string,
  env?: RuntimeEnv,
): void {
  forEachEnabledPlugin(agent, config, cwd, env, ({ pluginDef, context }) => {
    for (const fn of pluginDef._hooks.buildPrompt) {
      const addition = fn(context)
      if (addition) {
        agentEntry.instructions = appendPromptSection(agentEntry.instructions, addition)
      }
    }
  })
}

// ─── Main builder ────────────────────────────────────────────────────────────

/**
 * Build the official OpenClaw config.json for a specific agent deployment.
 * This is what gets written inside the container at ~/.openclaw/openclaw.json.
 */
export function buildOpenClawConfig(
  agent: AgentDeployment,
  config: CloudConfig,
  cwd?: string,
  env?: RuntimeEnv,
): OpenClawConfig {
  const oc = agent.configuration.openclaw
  const openclawConfig: OpenClawConfig = {}

  // 1. Agents section + agent entry
  const { agentEntry, agents } = buildAgentsSection(agent, oc)
  if (agents) openclawConfig.agents = agents

  // 2. Copy direct openclaw sections
  Object.assign(openclawConfig, copyOpenClawSections(oc))

  // 3. Identity → system prompt
  applyIdentity(agentEntry, agent)

  // 3.5. Plugin prompt additions (mounted packs, runtime guidance, etc.)
  applyPluginPromptPipeline(agent, config, agentEntry, cwd, env)

  // 4. Set up agents list
  if (!openclawConfig.agents) openclawConfig.agents = {}
  openclawConfig.agents.list = [agentEntry]

  // 5. Model config
  buildModelConfig(agent, config, openclawConfig.agents)

  // 6. Runtime adapter (ACP config)
  const runtimeAdapter = getRuntime(agent.runtime)
  runtimeAdapter.applyConfig(agent, agentEntry, openclawConfig)

  // 7. Permissions → tools
  applyPermissions(agent, openclawConfig)

  // 8. Model providers from registry
  const models = buildProvidersConfig(config)
  if (models) openclawConfig.models = models

  // 9. Cloud skills
  openclawConfig.skills =
    buildCloudSkillsConfig(config, openclawConfig.skills) ?? openclawConfig.skills

  // 10. Shared workspace
  applySharedWorkspace(agent, config, openclawConfig.agents)

  // 11. Compliance → audit logging
  applyCompliance(agent, config, openclawConfig)

  // 13. Logging + messages
  if (oc?.logging) openclawConfig.logging = oc.logging
  if (oc?.messages) openclawConfig.messages = oc.messages

  // 14. Gateway config
  openclawConfig.gateway = buildGatewayConfig(oc, openclawConfig.gateway)

  // 15. Plugin pipeline — merge enabled plugin configs (channels, bindings, resources)
  applyPluginPipeline(agent, config, openclawConfig, cwd, env)

  // 16. Remove bundled plugin config entries not installed in the cloud runner.
  stripCloudRemovedBundledPlugins(openclawConfig)

  // 17. Normalize legacy tool config fragments so historical templates and
  //     stored snapshots still produce a valid OpenClaw config.
  normalizeLegacyToolsConfig(openclawConfig.tools)

  // 18. Strip strict-schema-violating fields after plugins have contributed
  //     their prompt/context additions.
  const workspaceFiles = stripAndCollectWorkspaceFiles(openclawConfig)
  if (Object.keys(workspaceFiles).length > 0) {
    openclawConfig._workspaceFiles = workspaceFiles
  }

  return openclawConfig
}
