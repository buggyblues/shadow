/**
 * OpenCode runtime adapter.
 *
 * Architecture: cc-connect fork -> opencode agent -> opencode CLI process.
 */

import type { AgentDeployment } from '../config/schema.js'
import type { PluginRuntimeExtension } from '../plugins/types.js'
import { buildCcConnectPackage } from './cc-connect-package.js'
import { ccConnectContainerSpec } from './container.js'
import { type RuntimeAdapter, registerRuntime } from './index.js'
import { openCodeMcpServers } from './mcp.js'
import {
  json,
  modelName,
  nativePermissionMode,
  runtimeExtensionsForKind,
  WORKSPACE_DIR,
} from './package-common.js'
import { openCodeSlashCommands } from './slash-commands/opencode.js'

function buildOpenCodeConfig(
  agent: AgentDeployment,
  runtimeExtensions: PluginRuntimeExtension,
): string {
  const mode = nativePermissionMode(agent)
  const mcp = openCodeMcpServers(runtimeExtensions)
  return json({
    $schema: 'https://opencode.ai/config.json',
    ...(modelName(agent) ? { model: modelName(agent) } : {}),
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
  defaultImage: 'ghcr.io/buggyblues/opencode-runner:latest',
  container: ccConnectContainerSpec(),

  buildPackage(context) {
    return buildCcConnectPackage(context, {
      agentType: 'opencode',
      shadowSlashCommands: openCodeSlashCommands,
      nativeFiles: (context) => {
        const runtimeExtensions = runtimeExtensionsForKind(context.runtimeExtensions, 'cc-connect')
        return {
          [`${WORKSPACE_DIR}/opencode.json`]: buildOpenCodeConfig(context.agent, runtimeExtensions),
        }
      },
    })
  },
}

registerRuntime(opencodeAdapter)

export default opencodeAdapter
