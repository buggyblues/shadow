/**
 * OpenCode runtime adapter.
 *
 * Architecture: cc-connect fork -> opencode agent -> opencode CLI process.
 */

import type { AgentDeployment } from '../config/schema.js'
import type { PluginRuntimeExtension } from '../plugins/types.js'
import { buildCcConnectPackage } from './cc-connect-package.js'
import { ccConnectContainerSpec } from './container.js'
import { defaultRunnerImage } from './images.js'
import { type RuntimeAdapter, registerRuntime } from './index.js'
import { openCodeMcpServers } from './mcp.js'
import {
  envPlaceholder,
  json,
  modelName,
  nativePermissionMode,
  officialModelProviderBinding,
  runtimeExtensionsForKind,
  WORKSPACE_DIR,
} from './package-common.js'
import { openCodeSlashCommands } from './slash-commands/opencode.js'
import { withShadowSpaceAppSlashCommands } from './slash-commands/space-app.js'

function opencodeModelParts(
  providerId: string,
  model: string,
): { modelId: string; modelRef: string } {
  const prefix = `${providerId}/`
  if (model.startsWith(prefix)) {
    return { modelId: model.slice(prefix.length), modelRef: model }
  }
  return { modelId: model, modelRef: `${providerId}/${model}` }
}

function buildOpenCodeConfig(
  agent: AgentDeployment,
  runtimeExtensions: PluginRuntimeExtension,
  runtimeEnv: Record<string, string | undefined>,
): string {
  const mode = nativePermissionMode(agent)
  const mcp = openCodeMcpServers(runtimeExtensions)
  const officialProvider = officialModelProviderBinding(runtimeEnv, 'openai')
  const officialModel = officialProvider ? (modelName(agent) ?? officialProvider.model) : undefined
  const officialOpencodeModel = officialProvider
    ? opencodeModelParts(officialProvider.providerId, officialModel ?? 'default')
    : null
  const configuredModel = officialOpencodeModel?.modelRef ?? modelName(agent)

  return json({
    $schema: 'https://opencode.ai/config.json',
    ...(configuredModel ? { model: configuredModel } : {}),
    ...(officialProvider && officialOpencodeModel
      ? {
          provider: {
            [officialProvider.providerId]: {
              npm: '@ai-sdk/openai-compatible',
              name: 'Shadow official LLM proxy',
              options: {
                baseURL: envPlaceholder(officialProvider.baseUrlEnvKey),
                apiKey: `{env:${officialProvider.apiKeyEnvKey}}`,
              },
              models: {
                [officialOpencodeModel.modelId]: {
                  name: officialOpencodeModel.modelId,
                },
              },
            },
          },
        }
      : {}),
    ...(Object.keys(mcp).length > 0 ? { mcp } : {}),
    permission: {
      read: mode === 'deny' ? 'deny' : 'allow',
      edit: mode === 'allow' ? 'allow' : 'ask',
      bash: mode === 'allow' ? 'ask' : mode,
      webfetch: 'ask',
      websearch: 'ask',
      external_directory: 'deny',
      doom_loop: 'deny',
    },
    disabled_providers: [],
  })
}

const opencodeAdapter: RuntimeAdapter = {
  id: 'opencode',
  name: 'OpenCode (SST)',
  runtimeKind: 'cc-connect',
  defaultImage: defaultRunnerImage({
    runner: 'opencode-runner',
    env: 'SHADOWOB_OPENCODE_RUNNER_IMAGE',
  }),
  container: ccConnectContainerSpec(),

  buildPackage(context) {
    return buildCcConnectPackage(context, {
      agentType: 'opencode',
      shadowSlashCommands: withShadowSpaceAppSlashCommands(openCodeSlashCommands),
      nativeFiles: (context) => {
        const runtimeExtensions = runtimeExtensionsForKind(context.runtimeExtensions, 'cc-connect')
        return {
          [`${WORKSPACE_DIR}/opencode.json`]: buildOpenCodeConfig(
            context.agent,
            runtimeExtensions,
            context.runtimeEnv,
          ),
        }
      },
    })
  },
}

registerRuntime(opencodeAdapter)

export default opencodeAdapter
