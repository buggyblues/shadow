/**
 * Hermes Agent runtime adapter.
 *
 * Architecture: Hermes gateway -> ShadowOB Hermes platform plugin.
 */

import { stringify as stringifyYaml } from 'yaml'
import type { AgentDeployment, CloudConfig } from '../config/schema.js'
import type { PluginRuntimeExtension } from '../plugins/types.js'
import { hermesContainerSpec } from './container.js'
import { defaultRunnerImage } from './images.js'
import { type RuntimeAdapter, type RuntimeFiles, registerRuntime } from './index.js'
import { hermesMcpServers } from './mcp.js'
import type { ShadowRuntimeBinding } from './package-common.js'
import {
  addShadowobCliAuth,
  addShadowobSkill,
  addShadowServerAppSkill,
  buildIdentityWorkspaceFiles,
  envPlaceholder,
  HOME_DIR,
  hasRuntimeExtensions,
  json,
  nativePermissionMode,
  officialModelProviderBinding,
  runtimeExtensionsForKind,
  SHADOW_SLASH_COMMANDS_PATH,
  shadowBinding,
} from './package-common.js'
import { appendTemplateRoutineFiles, firstRoutineDeliveryTargetValue } from './routines.js'
import { hermesSlashCommands } from './slash-commands/hermes.js'

type HermesOfficialModelProxy = {
  config?: {
    model: {
      default: string
      provider: string
    }
    customProviders: Array<{
      name: string
      base_url: string
      key_env: string
      model: string
    }>
  }
  envLines: string[]
}

function officialModelProxy(
  runtimeEnv: Record<string, string | undefined>,
): HermesOfficialModelProxy {
  const binding = officialModelProviderBinding(runtimeEnv, 'openai')
  if (!binding) {
    return { envLines: [] }
  }

  return {
    config: {
      model: {
        default: binding.model,
        provider: binding.providerId,
      },
      customProviders: [
        {
          name: binding.providerId,
          base_url: envPlaceholder(binding.baseUrlEnvKey),
          key_env: binding.apiKeyEnvKey,
          model: binding.model,
        },
      ],
    },
    envLines: [
      `OPENAI_COMPATIBLE_BASE_URL=${envPlaceholder(binding.baseUrlEnvKey)}`,
      `OPENAI_COMPATIBLE_API_KEY=${envPlaceholder(binding.apiKeyEnvKey)}`,
      ...(binding.modelEnvKey
        ? [`OPENAI_COMPATIBLE_MODEL_ID=${envPlaceholder(binding.modelEnvKey)}`]
        : []),
    ],
  }
}

function buildHermesConfig(options: {
  agent: AgentDeployment
  config: CloudConfig
  shadow: ShadowRuntimeBinding
  runtimeExtensions: PluginRuntimeExtension
  officialModelProxy: HermesOfficialModelProxy
}): string {
  const { agent, shadow } = options
  const permissionMode = nativePermissionMode(agent)
  const mcpServers = hermesMcpServers(options.runtimeExtensions)
  const homeChannelEnvKey = firstRoutineDeliveryTargetValue(
    options.config,
    agent,
    options.runtimeExtensions,
    'shadowob',
    'channelEnvKey',
  )
  return stringifyYaml({
    approvals: {
      mode: permissionMode === 'deny' ? 'manual' : 'off',
    },
    ...(Object.keys(mcpServers).length > 0 ? { mcp_servers: mcpServers } : {}),
    plugins: {
      enabled: ['shadowob'],
    },
    ...(options.officialModelProxy.config
      ? {
          model: options.officialModelProxy.config.model,
          custom_providers: options.officialModelProxy.config.customProviders,
        }
      : {}),
    platforms: {
      shadowob: {
        enabled: true,
        token: envPlaceholder(shadow.tokenEnvKey),
        extra: {
          base_url: envPlaceholder(shadow.serverUrlEnvKey),
          mention_only: false,
          rest_only: false,
          catchup_minutes: 0,
          download_media: true,
          ...(typeof homeChannelEnvKey === 'string'
            ? { home_channel: envPlaceholder(homeChannelEnvKey) }
            : {}),
          slash_commands: hermesSlashCommands,
        },
      },
    },
  })
}

const hermesAdapter: RuntimeAdapter = {
  id: 'hermes',
  name: 'Hermes Agent',
  runtimeKind: 'hermes',
  defaultImage: defaultRunnerImage({
    runner: 'hermes-runner',
    env: 'SHADOWOB_HERMES_RUNNER_IMAGE',
  }),
  container: hermesContainerSpec(),

  buildPackage(context) {
    const nativeRuntimeExtensions = runtimeExtensionsForKind(context.runtimeExtensions, 'hermes')
    const shadow = shadowBinding(context.runtimeExtensions)
    const modelProxy = officialModelProxy(context.runtimeEnv)
    const files: RuntimeFiles = {
      ...buildIdentityWorkspaceFiles(context.agent),
      [`${HOME_DIR}/.hermes/config.yaml`]: buildHermesConfig({
        agent: context.agent,
        config: context.config,
        shadow,
        runtimeExtensions: nativeRuntimeExtensions,
        officialModelProxy: modelProxy,
      }),
      [`${HOME_DIR}/.hermes/.env`]: [
        `SHADOW_BASE_URL=${envPlaceholder(shadow.serverUrlEnvKey)}`,
        `SHADOW_SERVER_URL=${envPlaceholder(shadow.serverUrlEnvKey)}`,
        `SHADOWOB_SERVER_URL=${envPlaceholder(shadow.serverUrlEnvKey)}`,
        `SHADOW_TOKEN=${envPlaceholder(shadow.tokenEnvKey)}`,
        `SHADOWOB_TOKEN=${envPlaceholder(shadow.tokenEnvKey)}`,
        'SHADOW_ALLOW_ALL_USERS=true',
        'GATEWAY_ALLOW_ALL_USERS=true',
        'HERMES_YOLO_MODE=true',
        'SHADOW_HEARTBEAT_INTERVAL_SECONDS=30',
        ...modelProxy.envLines,
        '',
      ].join('\n'),
      [SHADOW_SLASH_COMMANDS_PATH]: json(hermesSlashCommands),
    }
    addShadowobSkill(files, 'hermes', 'hermes')
    addShadowServerAppSkill(files, 'hermes', 'hermes')
    addShadowobCliAuth(files, context.runtimeExtensions)
    appendTemplateRoutineFiles(
      files,
      context.config,
      context.agent,
      'hermes',
      nativeRuntimeExtensions,
    )

    return {
      configData: {
        'runtime-files.json': json(files),
        'workspace-files.json': json(buildIdentityWorkspaceFiles(context.agent)),
        'shadowob-runtime.json': json({
          cli: 'shadowob',
          connector: 'shadowob-connector',
          transport: 'hermes',
          shadow,
        }),
        ...(hasRuntimeExtensions(nativeRuntimeExtensions)
          ? { 'runtime-extensions.json': json(nativeRuntimeExtensions) }
          : {}),
      },
      pluginResources: [],
    }
  },
}

registerRuntime(hermesAdapter)

export default hermesAdapter
