import { stringify as stringifyToml, type TomlTable } from 'smol-toml'
import type { AgentDeployment } from '../config/schema.js'
import type {
  RuntimeFiles,
  RuntimePackageBuildContext,
  RuntimePackageBuildResult,
} from './index.js'
import {
  addOfficialShadowSkills,
  addShadowobCliAuth,
  buildIdentityWorkspaceFiles,
  CC_CONNECT_CONFIG_PATH,
  envPlaceholder,
  HOME_DIR,
  hasRuntimeExtensions,
  json,
  modelName,
  officialModelProviderBinding,
  reasoningEffort,
  runtimeExtensionsForKind,
  SHADOWOB_SLASH_COMMANDS_PATH,
  type ShadowRuntimeBinding,
  shadowBinding,
  shadowBindings,
  shadowPlatformOptions,
  WORKSPACE_DIR,
} from './package-common.js'
import { appendTemplateRoutineFiles } from './routines.js'

export type CcConnectAgentType = 'claudecode' | 'codex' | 'opencode'

export interface CcConnectPackageOptions {
  agentType: CcConnectAgentType
  agentOptions?: (agent: AgentDeployment) => TomlTable
  nativeFiles?: (context: RuntimePackageBuildContext) => RuntimeFiles
  shadowSlashCommands?: unknown[]
}

const BUDDY_COLLABORATION_SYSTEM_PROMPT = [
  'Shadow Buddy collaboration rules:',
  '- Treat a Buddy collaboration as a bounded IM conversation, not an open-ended work session.',
  '- Speak only when you add a distinct useful point. If another Buddy already covered it, stay brief or stay silent.',
  '- If you only agree, use a structured Shadow reaction action when available; otherwise stay silent instead of posting acknowledgement text.',
  '- Later collaboration turns may be routed into a Shadow thread by the platform. Do not announce thread routing yourself.',
  '- Match the density of the triggering message. Short chat gets a short reply; long analysis requires an explicit user pull.',
  '- Do not run tools, create memories, create skills, write files, promote tasks, or run demos unless a human explicitly asks for current action.',
  '- Keep runtime logs, tool progress, memory updates, skill views, and self-improvement reviews private. Do not post them as chat messages.',
  '- If the user says to stop, stay quiet, not implement, or just discuss, stop the action chain immediately.',
].join('\n')

function opencodeModelRef(providerId: string, model: string): string {
  return model.startsWith(`${providerId}/`) ? model : `${providerId}/${model}`
}

function agentSystemPrompt(agent: AgentDeployment): string | undefined {
  const prompt = [
    agent.identity?.personality,
    agent.identity?.systemPrompt,
    BUDDY_COLLABORATION_SYSTEM_PROMPT,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n\n')
    .trim()
  return prompt || undefined
}

function buildCcConnectConfig(options: {
  agent: AgentDeployment
  agentType: CcConnectAgentType
  runtimeEnv: RuntimePackageBuildContext['runtimeEnv']
  shadows: ShadowRuntimeBinding[]
  routineDeliveries?: RuntimePackageBuildContext['runtimeExtensions']['routineDeliveries']
  agentOptions?: TomlTable
}): string {
  const { agent, agentType } = options
  const officialProvider = officialCcConnectProvider(agent, agentType, options.runtimeEnv)
  const baseAgentOptions: TomlTable = {
    work_dir: WORKSPACE_DIR,
  }
  const systemPrompt = agentSystemPrompt(agent)
  if (systemPrompt) baseAgentOptions.system_prompt = systemPrompt
  const model = modelName(agent)
  const effort = reasoningEffort(agent)
  if (model) baseAgentOptions.model = model
  if (effort) baseAgentOptions.reasoning_effort = effort

  const routineChannelEnvKeys = [
    ...new Set(
      (options.routineDeliveries ?? [])
        .filter((delivery) => delivery.pluginId === 'shadowob' && delivery.kind === 'channel')
        .map((delivery) => delivery.target.channelEnvKey)
        .filter((key): key is string => typeof key === 'string' && key.trim().length > 0),
    ),
  ]

  const root: TomlTable = {
    data_dir: `${HOME_DIR}/.cc-connect`,
    language: 'zh',
    log: { level: 'info' },
    display: { mode: 'quiet', thinking_messages: false, tool_messages: false },
    projects: [
      {
        name: agent.id,
        agent: {
          type: agentType,
          options: {
            ...baseAgentOptions,
            ...(options.agentOptions ?? {}),
            ...(officialProvider?.options ?? {}),
          },
          ...(officialProvider?.providers ? { providers: officialProvider.providers } : {}),
        },
        platforms: options.shadows.map((shadow) => ({
          type: 'shadowob',
          options: shadowPlatformOptions(shadow, { channelEnvKeys: routineChannelEnvKeys }),
        })),
      },
    ],
  }

  return stringifyToml(root)
}

function officialCcConnectProvider(
  agent: AgentDeployment,
  agentType: CcConnectAgentType,
  runtimeEnv: RuntimePackageBuildContext['runtimeEnv'],
): { options: TomlTable; providers: TomlTable[] } | null {
  const style = agentType === 'claudecode' ? 'anthropic' : 'openai'
  const binding = officialModelProviderBinding(runtimeEnv, style)
  if (!binding) return null

  const model = modelName(agent) ?? binding.model
  const providerModel =
    agentType === 'opencode' ? opencodeModelRef(binding.providerId, model) : model
  const provider: TomlTable = {
    name: binding.providerId,
    api_key: envPlaceholder(binding.apiKeyEnvKey),
    base_url: envPlaceholder(binding.baseUrlEnvKey),
    model: providerModel,
    models: [{ model: providerModel }],
  }
  if (agentType === 'claudecode') {
    provider.env = {
      ANTHROPIC_MODEL: model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
      CLAUDE_CODE_SUBAGENT_MODEL: model,
      CLAUDE_CODE_EFFORT_LEVEL: 'max',
    }
  }

  return {
    options: {
      provider: binding.providerId,
      model: providerModel,
    },
    providers: [provider],
  }
}

function buildCcConnectRuntimeFiles(options: {
  agent: AgentDeployment
  config: RuntimePackageBuildContext['config']
  ccConnectConfig: string
  runtimeExtensions: RuntimePackageBuildContext['runtimeExtensions']
  nativeFiles?: RuntimeFiles
  shadowSlashCommands?: unknown[]
}): RuntimeFiles {
  const { agent, ccConnectConfig } = options
  const files: RuntimeFiles = {
    ...buildIdentityWorkspaceFiles(agent),
    [CC_CONNECT_CONFIG_PATH]: ccConnectConfig,
    [SHADOWOB_SLASH_COMMANDS_PATH]: json(options.shadowSlashCommands ?? []),
    ...(options.nativeFiles ?? {}),
  }
  addOfficialShadowSkills(
    files,
    'cc-connect',
    agent.runtime,
    options.runtimeExtensions.shadowob?.officialSkills,
  )
  addShadowobCliAuth(files, options.runtimeExtensions)
  appendTemplateRoutineFiles(files, options.config, agent, 'cc-connect', options.runtimeExtensions)
  return files
}

export function buildCcConnectPackage(
  context: RuntimePackageBuildContext,
  options: CcConnectPackageOptions,
): RuntimePackageBuildResult {
  const nativeRuntimeExtensions = runtimeExtensionsForKind(context.runtimeExtensions, 'cc-connect')
  const shadows = shadowBindings(context.runtimeExtensions)
  const ccConnectConfig = buildCcConnectConfig({
    agent: context.agent,
    agentType: options.agentType,
    runtimeEnv: context.runtimeEnv,
    shadows,
    routineDeliveries: nativeRuntimeExtensions.routineDeliveries,
    agentOptions: options.agentOptions?.(context.agent),
  })
  const files = buildCcConnectRuntimeFiles({
    agent: context.agent,
    config: context.config,
    ccConnectConfig,
    runtimeExtensions: context.runtimeExtensions,
    nativeFiles: options.nativeFiles?.(context),
    shadowSlashCommands: options.shadowSlashCommands,
  })

  return {
    configData: {
      'cc-connect-config.toml': ccConnectConfig,
      'runtime-files.json': json(files),
      'workspace-files.json': json(buildIdentityWorkspaceFiles(context.agent)),
      'shadowob-runtime.json': json({
        cli: 'shadowob',
        connector: 'shadowob-connector',
        transport: 'cc-connect',
        shadow: shadowBinding(context.runtimeExtensions),
        shadows,
      }),
      ...(hasRuntimeExtensions(nativeRuntimeExtensions)
        ? { 'runtime-extensions.json': json(nativeRuntimeExtensions) }
        : {}),
    },
    pluginResources: [],
  }
}
