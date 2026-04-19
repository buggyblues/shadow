/**
 * GitAgent plugin — deploys agents from gitagent-standard git repositories.
 *
 * Implements two plugin providers:
 *
 * 1. **configResolver** — During resolveConfig(), converts `use: [{ plugin: "gitagent" }]`
 *    options into `agent.source` and enriches the agent from the local gitagent directory
 *    (SOUL.md, agent.yaml, skills/, etc.).
 *
 * 2. **configBuilder** — During OpenClaw build, reads `agent.source` to configure
 *    repoRoot, agentDir, skills, and scheduler for the OpenClaw runtime.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildOpenClawFromGitAgent,
  enrichAgentFromGitAgent,
  readGitAgentDir,
} from '../../adapters/gitagent.js'
import type { AgentDeployment, AgentSource } from '../../config/schema.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = {
  manifest: manifest as PluginManifest,

  // ── Config Resolver ──
  // Pre-build: convert gitagent use entry → agent.source + enrich from local path
  configResolver: {
    resolveAgent(agent, _config) {
      if (agent.source) return agent // already has source, nothing to do

      const gitagentEntry = agent.use?.find((u) => u.plugin === 'gitagent')
      if (!gitagentEntry?.options) return agent

      let a: AgentDeployment = { ...agent, source: gitagentEntry.options as AgentSource }

      // If local path is set, enrich agent from the gitagent directory
      if (a.source?.path) {
        const localPath = resolve(a.source.path)
        if (existsSync(localPath)) {
          const parsed = readGitAgentDir(localPath)
          a = enrichAgentFromGitAgent(a, parsed)
        }
      }

      return a
    },
  },

  // ── Config Builder ──
  // Build-time: generate OpenClaw config fragment from agent.source
  configBuilder: {
    build(agentConfig: Record<string, unknown>, context: PluginBuildContext): PluginConfigFragment {
      const { agent } = context
      if (!agent.source) return {}

      const mountPath = agent.source.mountPath ?? '/agent'
      const useGitagent = agent.source.gitagent !== false

      if (!useGitagent) return {}

      const fragment: PluginConfigFragment = {
        agents: {
          defaults: {
            repoRoot: mountPath,
          },
        },
      }

      // If local path exists, read the gitagent directory and merge skills/scheduler
      if (agent.source.path) {
        const localPath = resolve(agent.source.path)
        if (existsSync(localPath)) {
          const parsed = readGitAgentDir(localPath)
          const additions = buildOpenClawFromGitAgent(parsed, mountPath)

          if (additions.skills) {
            fragment.skills = additions.skills as Record<string, unknown>
          }
          if (additions.agents?.defaults?.heartbeat) {
            ;(fragment.agents as Record<string, unknown>).defaults = {
              ...((fragment.agents as Record<string, unknown>).defaults as Record<string, unknown>),
              heartbeat: additions.agents.defaults.heartbeat,
            }
          }
        }
      }

      return fragment
    },
  },
}

export default plugin
