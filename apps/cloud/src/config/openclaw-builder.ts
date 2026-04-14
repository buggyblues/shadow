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

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildOpenClawFromGitAgent, readGitAgentDir } from '../adapters/gitagent.js'
import {
  mergePluginFragments,
  resolveAgentPluginConfig,
  resolvePluginSecrets,
} from '../plugins/config-merger.js'
import { getPluginRegistry } from '../plugins/registry.js'
import type { PluginBuildContext, PluginConfigFragment } from '../plugins/types.js'
import { getRuntime } from '../runtimes/index.js'
import { registerAllRuntimes } from '../runtimes/loader.js'

registerAllRuntimes()

import type {
  AgentDeployment,
  CloudConfig,
  OpenClawAgentConfig,
  OpenClawAgentDefaults,
  OpenClawBinding,
  OpenClawConfig,
  OpenClawGatewayConfig,
  OpenClawModelConfig,
  OpenClawSkillsConfig,
} from './schema.js'

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
  const effectiveModel = agent.model ?? config.team?.defaultModel
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

  const PERM_MAP: Record<string, string> = {
    'always-allow': 'dangerously-skip-permissions',
    'approve-reads': 'approve-reads',
    'always-ask': 'approve-all',
    'deny-all': 'deny-all',
  }

  if (!openclawConfig.tools) openclawConfig.tools = {}
  const mappedDefault = PERM_MAP[agent.permissions.default]
  if (mappedDefault) {
    openclawConfig.tools.profile = mappedDefault as 'minimal' | 'coding' | 'messaging' | 'full'
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
    }
    providers[providerId] = providerEntry
  }

  return { mode: 'merge', providers }
}

/**
 * Build Shadowob channel config from plugins + bindings.
 */
function buildShadowobChannels(
  agent: AgentDeployment,
  config: CloudConfig,
): { channels?: OpenClawConfig['channels']; bindings?: OpenClawBinding[] } {
  type ShadowobBinding = {
    agentId: string
    targetId: string
    replyPolicy?: {
      mode: string
      custom?: Record<string, unknown>
    }
  }

  type ShadowobBuddy = {
    id: string
    name: string
    description?: string
  }

  type ShadowobPluginConfig = {
    bindings?: ShadowobBinding[]
    buddies?: ShadowobBuddy[]
  }

  // Support both modern `use` array and deprecated `plugins.shadowob` patterns
  let shadowobPlugin = config.plugins?.shadowob as ShadowobPluginConfig | undefined
  if (!shadowobPlugin) {
    const useEntry = config.use?.find((u) => u.plugin === 'shadowob')
    if (useEntry?.options) {
      shadowobPlugin = useEntry.options as ShadowobPluginConfig
    }
  }
  if (!shadowobPlugin) return {}

  const bindings =
    shadowobPlugin.bindings?.filter((b: ShadowobBinding) => b.agentId === agent.id) ?? []
  if (bindings.length === 0) return {}

  const accounts: Record<string, Record<string, unknown>> = {}
  const configBindings: OpenClawBinding[] = []

  for (const binding of bindings) {
    const buddy = shadowobPlugin.buddies?.find((b: ShadowobBuddy) => b.id === binding.targetId)
    if (!buddy) continue

    const account: Record<string, unknown> = {
      token: `\${env:SHADOW_TOKEN_${binding.targetId.toUpperCase().replace(/-/g, '_')}}`,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      serverUrl: '${env:SHADOW_SERVER_URL}',
      enabled: true,
      buddyName: buddy.name,
      ...(buddy.description ? { buddyDescription: buddy.description } : {}),
      ...(buddy.id ? { buddyId: buddy.id } : {}),
    }

    if (binding.replyPolicy) {
      const policy = binding.replyPolicy
      account.replyPolicy = {
        mode: policy.mode,
        ...(policy.custom ? { config: policy.custom } : {}),
      }
    }

    accounts[binding.targetId] = account
    configBindings.push({
      agentId: agent.id,
      type: 'route',
      match: { channel: 'shadowob', accountId: binding.targetId },
    })
  }

  return {
    channels: { shadowob: { enabled: true, accounts } },
    bindings: configBindings,
  }
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
 * Apply gitagent source overlay → repoRoot.
 */
function applyGitAgentSource(
  agent: AgentDeployment,
  agentEntry: OpenClawAgentConfig,
  openclawConfig: OpenClawConfig,
): void {
  if (!agent.source) return

  const mountPath = agent.source.mountPath ?? '/agent'
  const useGitagent = agent.source.gitagent !== false

  if (!useGitagent) return

  if (!openclawConfig.agents) openclawConfig.agents = {}
  if (!openclawConfig.agents.defaults) openclawConfig.agents.defaults = {}
  if (!openclawConfig.agents.defaults.repoRoot) {
    openclawConfig.agents.defaults.repoRoot = mountPath
  }
  if (!agentEntry.agentDir) {
    agentEntry.agentDir = mountPath
  }

  if (agent.source.path) {
    const localPath = resolve(agent.source.path)
    if (existsSync(localPath)) {
      const parsed = readGitAgentDir(localPath)
      const additions = buildOpenClawFromGitAgent(parsed, mountPath)

      if (additions.skills) {
        if (!openclawConfig.skills) openclawConfig.skills = {}
        const existingExtraDirs = openclawConfig.skills.load?.extraDirs ?? []
        const newExtraDirs = additions.skills.load?.extraDirs ?? []
        openclawConfig.skills = {
          ...additions.skills,
          ...openclawConfig.skills,
          load: { extraDirs: [...new Set([...existingExtraDirs, ...newExtraDirs])] },
          entries: {
            ...(additions.skills.entries ?? {}),
            ...(openclawConfig.skills.entries ?? {}),
          },
        }
      }

      if (additions.agents?.defaults?.heartbeat && !openclawConfig.agents.defaults.heartbeat) {
        openclawConfig.agents.defaults.heartbeat = additions.agents.defaults.heartbeat
      }
    }
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
    port: 3100,
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

/**
 * Run the plugin pipeline — iterate enabled plugins, call their hooks, and merge results.
 *
 * Resolution order (new OS-like providers take priority over legacy hooks):
 * 1. configBuilder.build / channel.buildChannel (new structured providers)
 * 2. buildOpenClawConfig (legacy hook, fallback)
 * 3. env.build / buildEnvVars for environment variables
 */
function applyPluginPipeline(
  agent: AgentDeployment,
  config: CloudConfig,
  openclawConfig: OpenClawConfig,
): Record<string, string> {
  const registry = getPluginRegistry()
  if (registry.size === 0) return {}

  const envVars: Record<string, string> = {}

  // Collect K8s resources from resource providers
  const pluginResources: Record<string, unknown>[] = []

  for (const pluginDef of registry.getAll()) {
    const pluginId = pluginDef.manifest.id
    // Skip shadowob — it's handled in step 9 via the legacy path
    if (pluginId === 'shadowob') continue

    const resolved = resolveAgentPluginConfig(pluginId, agent.id, config)
    if (!resolved) continue

    const secrets = resolvePluginSecrets(pluginId, config, process.env, agent.id)
    const context: PluginBuildContext = {
      agent,
      config,
      secrets,
      namespace: config.deployments?.namespace ?? 'default',
      pluginRegistry: registry,
    }

    const agentConfig = resolved as Record<string, unknown>

    // Build OpenClaw config fragment (new providers → legacy fallback)
    if (pluginDef.configBuilder) {
      const fragment = pluginDef.configBuilder.build(agentConfig, context)
      Object.assign(openclawConfig, mergePluginFragments(openclawConfig, fragment))
    } else if (pluginDef.channel) {
      const fragment = pluginDef.channel.buildChannel(agentConfig, context)
      Object.assign(openclawConfig, mergePluginFragments(openclawConfig, fragment))
    } else if (pluginDef.buildOpenClawConfig) {
      const fragment = pluginDef.buildOpenClawConfig(agentConfig, context)
      Object.assign(openclawConfig, mergePluginFragments(openclawConfig, fragment))
    }

    // Build env vars (new provider → legacy fallback)
    if (pluginDef.env) {
      Object.assign(envVars, pluginDef.env.build(agentConfig, context))
    } else if (pluginDef.buildEnvVars) {
      Object.assign(envVars, pluginDef.buildEnvVars(agentConfig, context))
    }

    // Collect K8s resources (new provider → legacy fallback)
    if (pluginDef.resources) {
      const resources = pluginDef.resources.build(agentConfig, context)
      pluginResources.push(...resources)
    } else if (pluginDef.buildK8sResources) {
      const resources = pluginDef.buildK8sResources(agentConfig, context)
      pluginResources.push(...resources)
    }

    // Collect lifecycle provisioning tasks (async — deferred for infra layer)
    if (pluginDef.lifecycle?.provision) {
      if (!openclawConfig._pluginProvisions) {
        openclawConfig._pluginProvisions = []
      }
      ;(openclawConfig._pluginProvisions as unknown[]).push({
        pluginId,
        provision: pluginDef.lifecycle.provision.bind(pluginDef.lifecycle),
        context: {
          agent,
          config,
          secrets,
          logger: { info: () => {}, dim: () => {} },
          dryRun: false,
          existingState: null,
        },
        agentConfig,
      })
    }
  }

  if (pluginResources.length > 0) {
    openclawConfig._pluginResources = pluginResources
  }

  return envVars
}

// ─── Main builder ────────────────────────────────────────────────────────────

/**
 * Build the official OpenClaw config.json for a specific agent deployment.
 * This is what gets written inside the container at ~/.openclaw/openclaw.json.
 */
export function buildOpenClawConfig(agent: AgentDeployment, config: CloudConfig): OpenClawConfig {
  const oc = agent.configuration.openclaw
  const openclawConfig: OpenClawConfig = {}

  // 1. Agents section + agent entry
  const { agentEntry, agents } = buildAgentsSection(agent, oc)
  if (agents) openclawConfig.agents = agents

  // 2. Copy direct openclaw sections
  Object.assign(openclawConfig, copyOpenClawSections(oc))

  // 3. Identity → system prompt
  applyIdentity(agentEntry, agent)

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

  // 9. Shadowob channels
  const { channels, bindings } = buildShadowobChannels(agent, config)
  if (channels) {
    if (!openclawConfig.channels) openclawConfig.channels = {}
    Object.assign(openclawConfig.channels, channels)
  }
  if (bindings) {
    openclawConfig.bindings = [...(openclawConfig.bindings ?? []), ...bindings]
  }

  // 10. Cloud skills
  openclawConfig.skills =
    buildCloudSkillsConfig(config, openclawConfig.skills) ?? openclawConfig.skills

  // 11. Shared workspace
  applySharedWorkspace(agent, config, openclawConfig.agents)

  // 12. GitAgent source overlay
  applyGitAgentSource(agent, agentEntry, openclawConfig)

  // 13. Compliance → audit logging
  applyCompliance(agent, config, openclawConfig)

  // 14. Logging + messages
  if (oc?.logging) openclawConfig.logging = oc.logging
  if (oc?.messages) openclawConfig.messages = oc.messages

  // 15. Gateway config
  openclawConfig.gateway = buildGatewayConfig(oc, openclawConfig.gateway)

  // 16. Strip strict-schema-violating fields
  const workspaceFiles = stripAndCollectWorkspaceFiles(openclawConfig)
  if (Object.keys(workspaceFiles).length > 0) {
    openclawConfig._workspaceFiles = workspaceFiles
  }

  // 17. Plugin pipeline — merge enabled plugin configs
  const pluginEnvVars = applyPluginPipeline(agent, config, openclawConfig)
  if (Object.keys(pluginEnvVars).length > 0) {
    openclawConfig._pluginEnvVars = pluginEnvVars
  }

  // 18. Ensure shadowob channel has a disabled fallback config so the
  //     always-installed openclaw-shadowob extension passes validation.
  const existingChannels = (openclawConfig as Record<string, unknown>).channels as
    | Record<string, unknown>
    | undefined
  if (!existingChannels?.shadowob && !existingChannels?.['openclaw-shadowob']) {
    if (!openclawConfig.channels) {
      ;(openclawConfig as Record<string, unknown>).channels = {}
    }
    ;((openclawConfig as Record<string, unknown>).channels as Record<string, unknown>).shadowob = {
      enabled: false,
    }
  }

  return openclawConfig
}
