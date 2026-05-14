/**
 * Claude Code runtime adapter.
 *
 * Architecture: cc-connect fork -> claudecode agent -> claude CLI process.
 */

import type { AgentDeployment } from '../config/schema.js'
import { buildCcConnectPackage } from './cc-connect-package.js'
import { ccConnectContainerSpec } from './container.js'
import { type RuntimeAdapter, registerRuntime } from './index.js'
import { claudeMcpJson } from './mcp.js'
import {
  json,
  modelName,
  nativePermissionMode,
  runtimeExtensionsForKind,
  WORKSPACE_DIR,
} from './package-common.js'

function buildClaudeSettings(agent: AgentDeployment): string {
  return json({
    $schema: 'https://json.schemastore.org/claude-code-settings.json',
    ...(modelName(agent) ? { model: modelName(agent) } : {}),
    permissions: {
      defaultMode: nativePermissionMode(agent) === 'allow' ? 'acceptEdits' : 'default',
      allow: [],
      ask: nativePermissionMode(agent) === 'ask' ? ['Bash', 'Edit', 'WebFetch'] : [],
      deny: nativePermissionMode(agent) === 'deny' ? ['Bash', 'Edit', 'WebFetch'] : [],
    },
    disableBypassPermissionsMode: 'disable',
    sandbox: {
      enabled: true,
      failIfUnavailable: false,
    },
    cleanupPeriodDays: 30,
  })
}

const claudeCodeAdapter: RuntimeAdapter = {
  id: 'claude-code',
  name: 'Claude Code (Anthropic)',
  runtimeKind: 'cc-connect',
  defaultImage: 'ghcr.io/buggyblues/claude-runner:latest',
  container: ccConnectContainerSpec(),

  buildPackage(context) {
    return buildCcConnectPackage(context, {
      agentType: 'claudecode',
      nativeFiles: (context) => {
        const runtimeExtensions = runtimeExtensionsForKind(context.runtimeExtensions, 'cc-connect')
        return {
          [`${WORKSPACE_DIR}/.claude/settings.json`]: buildClaudeSettings(context.agent),
          [`${WORKSPACE_DIR}/.mcp.json`]: claudeMcpJson(runtimeExtensions),
        }
      },
    })
  },
}

registerRuntime(claudeCodeAdapter)

export default claudeCodeAdapter
