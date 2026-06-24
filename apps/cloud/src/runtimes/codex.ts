/**
 * OpenAI Codex runtime adapter.
 *
 * Architecture: cc-connect fork -> codex agent -> codex CLI process.
 */

import { stringify as stringifyToml, type TomlTable } from 'smol-toml'
import type { AgentDeployment } from '../config/schema.js'
import type { PluginRuntimeExtension } from '../plugins/types.js'
import { buildCcConnectPackage } from './cc-connect-package.js'
import { ccConnectContainerSpec } from './container.js'
import { defaultRunnerImage } from './images.js'
import { type RuntimeAdapter, registerRuntime } from './index.js'
import { codexMcpTable } from './mcp.js'
import {
  HOME_DIR,
  modelName,
  nativePermissionMode,
  reasoningEffort,
  runtimeExtensionsForKind,
  WORKSPACE_DIR,
} from './package-common.js'
import { codexSlashCommands } from './slash-commands/codex.js'
import { withShadowAppSlashCommands } from './slash-commands/shadow-app.js'

function buildCodexConfig(
  agent: AgentDeployment,
  runtimeExtensions: PluginRuntimeExtension,
): string {
  const root: TomlTable = {
    ...(modelName(agent) ? { model: modelName(agent) } : {}),
    ...(reasoningEffort(agent) ? { model_reasoning_effort: reasoningEffort(agent) } : {}),
    approval_policy: nativePermissionMode(agent) === 'allow' ? 'on-request' : 'untrusted',
    sandbox_mode: nativePermissionMode(agent) === 'deny' ? 'read-only' : 'workspace-write',
    shell_environment_policy: {
      inherit: 'core',
      ignore_default_excludes: false,
    },
    sandbox_workspace_write: {
      network_access: false,
    },
    features: {
      shell_tool: true,
    },
    otel: {
      enabled: false,
      log_user_prompt: false,
    },
    ...(codexMcpTable(runtimeExtensions) ?? {}),
  }

  return stringifyToml(root)
}

const codexAdapter: RuntimeAdapter = {
  id: 'codex',
  name: 'Codex (OpenAI)',
  runtimeKind: 'cc-connect',
  defaultImage: defaultRunnerImage({
    runner: 'codex-runner',
    env: 'SHADOWOB_CODEX_RUNNER_IMAGE',
  }),
  container: ccConnectContainerSpec(),

  buildPackage(context) {
    return buildCcConnectPackage(context, {
      agentType: 'codex',
      agentOptions: () => ({
        codex_home: `${HOME_DIR}/.codex`,
        backend: 'exec',
      }),
      shadowSlashCommands: withShadowAppSlashCommands(codexSlashCommands),
      nativeFiles: (context) => {
        const runtimeExtensions = runtimeExtensionsForKind(context.runtimeExtensions, 'cc-connect')
        const codexConfig = buildCodexConfig(context.agent, runtimeExtensions)
        return {
          [`${HOME_DIR}/.codex/config.toml`]: codexConfig,
          [`${WORKSPACE_DIR}/.codex/config.toml`]: codexConfig,
        }
      },
    })
  },
}

registerRuntime(codexAdapter)

export default codexAdapter
