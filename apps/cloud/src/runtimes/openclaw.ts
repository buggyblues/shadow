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

  applyConfig(_agent: AgentDeployment, _agentEntry: OpenClawAgentConfig, _config: OpenClawConfig) {
    // No ACP harness for this runtime.
  },

  extraEnv() {
    return {}
  },
}

registerRuntime(openclawAdapter)

export default openclawAdapter
