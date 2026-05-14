/**
 * Gemini CLI runtime adapter.
 *
 * Architecture: cc-connect fork -> gemini agent -> gemini CLI process.
 */

import type { AgentDeployment } from '../config/schema.js'
import type { PluginRuntimeExtension } from '../plugins/types.js'
import { buildCcConnectPackage } from './cc-connect-package.js'
import { ccConnectContainerSpec } from './container.js'
import { type RuntimeAdapter, registerRuntime } from './index.js'
import { geminiMcpServers } from './mcp.js'
import {
  json,
  modelName,
  nativePermissionMode,
  runtimeExtensionsForKind,
  WORKSPACE_DIR,
} from './package-common.js'

function buildGeminiSettings(
  agent: AgentDeployment,
  runtimeExtensions: PluginRuntimeExtension,
): string {
  const mode = nativePermissionMode(agent)
  const mcpServers = geminiMcpServers(runtimeExtensions)
  return json({
    $schema:
      'https://raw.githubusercontent.com/google-gemini/gemini-cli/main/schemas/settings.schema.json',
    ...(modelName(agent) ? { model: { name: modelName(agent) } } : {}),
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
    general: {
      defaultApprovalMode: mode === 'allow' ? 'auto_edit' : mode === 'deny' ? 'plan' : 'default',
    },
    tools: {
      exclude: mode === 'deny' ? ['run_shell_command', 'web_fetch', 'web_search'] : [],
    },
    security: {
      folderTrust: { enabled: false },
      environmentVariableRedaction: { enabled: true },
    },
    telemetry: {
      enabled: false,
      logPrompts: false,
    },
  })
}

const geminiAdapter: RuntimeAdapter = {
  id: 'gemini',
  name: 'Gemini CLI (Google)',
  runtimeKind: 'cc-connect',
  defaultImage: 'ghcr.io/buggyblues/gemini-runner:latest',
  container: ccConnectContainerSpec(),

  buildPackage(context) {
    return buildCcConnectPackage(context, {
      agentType: 'gemini',
      agentOptions: () => ({
        timeout_mins: 30,
      }),
      nativeFiles: (context) => {
        const runtimeExtensions = runtimeExtensionsForKind(context.runtimeExtensions, 'cc-connect')
        return {
          [`${WORKSPACE_DIR}/.gemini/settings.json`]: buildGeminiSettings(
            context.agent,
            runtimeExtensions,
          ),
          [`${WORKSPACE_DIR}/GEMINI.md`]:
            'This project is connected to Shadow through the generated cc-connect ShadowOB platform.\n',
        }
      },
    })
  },
}

registerRuntime(geminiAdapter)

export default geminiAdapter
