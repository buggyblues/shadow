import { stringify as stringifyToml, type TomlTable } from 'smol-toml'
import type { AgentDeployment } from '../config/schema.js'
import type {
  RuntimeFiles,
  RuntimePackageBuildContext,
  RuntimePackageBuildResult,
} from './index.js'
import {
  addShadowobCliAuth,
  addShadowobSkill,
  buildIdentityWorkspaceFiles,
  CC_CONNECT_CONFIG_PATH,
  HOME_DIR,
  hasRuntimeExtensions,
  json,
  modelName,
  reasoningEffort,
  runtimeExtensionsForKind,
  SHADOW_SLASH_COMMANDS_PATH,
  type ShadowRuntimeBinding,
  shadowBinding,
  shadowBindings,
  shadowPlatformOptions,
  WORKSPACE_DIR,
} from './package-common.js'
import { appendTemplateRoutineFiles } from './routines.js'

export type CcConnectAgentType = 'claudecode' | 'codex' | 'opencode' | 'gemini'

export interface CcConnectPackageOptions {
  agentType: CcConnectAgentType
  agentOptions?: (agent: AgentDeployment) => TomlTable
  nativeFiles?: (context: RuntimePackageBuildContext) => RuntimeFiles
  shadowSlashCommands?: unknown[]
}

function buildCcConnectConfig(options: {
  agent: AgentDeployment
  agentType: CcConnectAgentType
  shadows: ShadowRuntimeBinding[]
  routineDeliveries?: RuntimePackageBuildContext['runtimeExtensions']['routineDeliveries']
  agentOptions?: TomlTable
}): string {
  const { agent, agentType } = options
  const baseAgentOptions: TomlTable = {
    work_dir: WORKSPACE_DIR,
  }
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
    display: { mode: 'compact' },
    projects: [
      {
        name: agent.id,
        agent: {
          type: agentType,
          options: {
            ...baseAgentOptions,
            ...(options.agentOptions ?? {}),
          },
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
    [SHADOW_SLASH_COMMANDS_PATH]: json(options.shadowSlashCommands ?? []),
    ...(options.nativeFiles ?? {}),
  }
  addShadowobSkill(files, 'cc-connect', agent.runtime)
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
