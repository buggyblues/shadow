/**
 * GitAgent configResolver — converts `use: [{ plugin: "gitagent" }]` entries
 * into `agent.source` and enriches the agent from the local gitagent directory
 * (SOUL.md, agent.yaml, skills/, etc.) when a local path is available.
 *
 * Runs during resolveConfig(), before any build phase.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AgentDeployment, AgentSource } from '../../config/schema.js'
import type { PluginConfigResolver } from '../types.js'
import { enrichAgentFromGitAgent, readGitAgentDir } from './reader.js'

export const configResolver: PluginConfigResolver = {
  resolveAgent(agent: AgentDeployment, _config, cwd?: string): AgentDeployment {
    if (agent.source) return agent // already has source, nothing to do

    const gitagentEntry = agent.use?.find((u: { plugin: string }) => u.plugin === 'gitagent')
    if (!gitagentEntry?.options) return agent

    let a: AgentDeployment = { ...agent, source: gitagentEntry.options as AgentSource }

    // If local path is set, enrich agent from the gitagent directory.
    // Resolve relative to cwd (config file directory) to avoid process.chdir.
    if (a.source?.path) {
      const localPath = cwd ? resolve(cwd, a.source.path) : resolve(a.source.path)
      if (existsSync(localPath)) {
        const parsed = readGitAgentDir(localPath)
        a = enrichAgentFromGitAgent(a, parsed)
        // Normalise to absolute so downstream code doesn't need cwd
        a = { ...a, source: { ...a.source, path: localPath } }
      }
    }

    return a
  },
}
