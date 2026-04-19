/**
 * GitAgent plugin — deploys agents from gitagent-standard git repositories.
 *
 * Implements two plugin providers:
 *
 * 1. **onResolveAgent** — During resolveConfig(), converts `use: [{ plugin: "gitagent" }]`
 *    options into `agent.source` and enriches the agent from the local gitagent directory
 *    (SOUL.md, agent.yaml, skills/, etc.).
 *
 * 2. **onBuildConfig** — During OpenClaw build, reads `agent.source` to configure
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
import { definePlugin } from '../helpers.js'
import type { PluginBuildContext, PluginConfigFragment, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default definePlugin(manifest as PluginManifest, (api) => {
  // ── Resolve hook ──
  // Pre-build: convert gitagent use entry → agent.source + enrich from local path
  api.onResolveAgent((agent, _config) => {
    const gitagentEntry = agent.use?.find((u) => u.plugin === 'gitagent')
    if (!gitagentEntry?.options) return agent

    let a: AgentDeployment = agent.source
      ? agent
      : { ...agent, source: gitagentEntry.options as AgentSource }

    const localPath = a.source?.path ? resolve(a.source.path) : undefined
    if (localPath && existsSync(localPath)) {
      const parsed = readGitAgentDir(localPath)
      a = enrichAgentFromGitAgent(a, parsed)
    }

    return a
  })

  // ── Build hook ──
  // Build-time: generate OpenClaw config fragment from agent.source
  api.onBuildConfig((context: PluginBuildContext): PluginConfigFragment => {
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
  })
})
