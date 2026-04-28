/**
 * OpenClaw baseline runtime adapter.
 *
 * The simplest runtime — runs OpenClaw gateway directly with no ACP harness.
 * Used for pure messaging agents (chatbots, scheduled reporters, etc.)
 */

import type { AgentDeployment, OpenClawAgentConfig, OpenClawConfig } from '../config/schema.js'
import { DEFAULT_OPENCLAW_RUNNER_IMAGE } from '../infra/constants.js'
import { type RuntimeAdapter, registerRuntime } from './index.js'

const openclawAdapter: RuntimeAdapter = {
  id: 'openclaw',
  name: 'OpenClaw Gateway',
  defaultImage: DEFAULT_OPENCLAW_RUNNER_IMAGE,
  packages: [],
  requiresGit: false,

  acpRuntime() {
    return null // No ACP — direct gateway mode
  },

  applyConfig(_agent: AgentDeployment, _agentEntry: OpenClawAgentConfig, config: OpenClawConfig) {
    // No ACP harness for this runtime — explicitly disable ACPX so the stock plugin
    // does not auto-load and attempt to probe backends (e.g. npx @zed-industries/codex-acp)
    // which fails in containers where $HOME is read-only.
    if (!config.plugins) config.plugins = {}
    if (!config.plugins.entries) config.plugins.entries = {}
    if (!config.plugins.entries.acpx) {
      config.plugins.entries.acpx = { enabled: false }
    }
  },

  extraEnv() {
    return {}
  },
}

registerRuntime(openclawAdapter)

export default openclawAdapter
