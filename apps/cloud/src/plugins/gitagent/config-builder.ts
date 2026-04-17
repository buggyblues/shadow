/**
 * GitAgent configBuilder — generates the OpenClaw config fragment for an agent
 * that uses gitagent source overlays.
 *
 * Two modes:
 *
 * **Git source** (`source.git`, init-container or build-image strategy):
 *   The agent files are cloned into `mountPath` at pod startup (or baked in).
 *   We set `agents.defaults.repoRoot = mountPath` so OpenClaw reads SOUL.md,
 *   RULES.md, skills/, etc. from there at runtime.
 *   We also configure `skills.load.extraDirs` and enumerate `skills.entries`.
 *   If a local `source.path` is also provided, we read its skills at CLI time
 *   to pre-populate `skills.entries` ahead of runtime discovery.
 *
 * **Local path only** (`source.path`, no git — dev/CI mode):
 *   Files exist on the developer's machine but are NOT mounted in the container.
 *   Identity (SOUL.md) is already inlined by the configResolver at this point.
 *   We enumerate `skills.entries` from the local path so OpenClaw knows about
 *   available skills, but we do NOT set `repoRoot` or `extraDirs` (the paths
 *   won't exist inside the container).
 *
 * Runs during the OpenClaw build phase (plugin pipeline, step 15), after
 * config resolution and identity application.
 */

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { PluginBuildContext, PluginConfigBuilder, PluginConfigFragment } from '../types.js'
import { buildOpenClawFromGitAgent, readGitAgentDir } from './reader.js'

export const configBuilder: PluginConfigBuilder = {
  build(_agentConfig: Record<string, unknown>, context: PluginBuildContext): PluginConfigFragment {
    const { agent } = context
    if (!agent.source) return {}

    const useGitagent = agent.source.gitagent !== false
    if (!useGitagent) return {}

    const mountPath = agent.source.mountPath ?? '/agent'
    const hasGitSource = !!agent.source.git
    const fragment: PluginConfigFragment = {}

    if (hasGitSource) {
      // Files will be present in the container at mountPath (via init-container clone
      // or baked in with build-image). Tell OpenClaw to read the gitagent layout from there.
      fragment.agents = {
        defaults: {
          repoRoot: mountPath,
        },
      }
      fragment.skills = {
        load: { extraDirs: [join(mountPath, 'skills')] },
        entries: {},
      }
    }

    // Read skills + scheduler from local path (available at CLI time).
    // source.path is already absolute when set by the resolver; fall back to
    // resolving against context.cwd to avoid relying on process.cwd().
    if (agent.source.path) {
      const localPath = agent.source.path.startsWith('/')
        ? agent.source.path
        : context.cwd
          ? resolve(context.cwd, agent.source.path)
          : resolve(agent.source.path)
      if (existsSync(localPath)) {
        const parsed = readGitAgentDir(localPath)
        const additions = buildOpenClawFromGitAgent(parsed, mountPath)

        // Merge skills.entries (always useful — tells OpenClaw which skills exist)
        if (additions.skills?.entries) {
          if (!fragment.skills) fragment.skills = {}
          const existingEntries = (fragment.skills as Record<string, unknown>).entries as
            | Record<string, unknown>
            | undefined
          ;(fragment.skills as Record<string, unknown>).entries = {
            ...(existingEntries ?? {}),
            ...(additions.skills.entries as Record<string, unknown>),
          }
          // extraDirs only meaningful for git (files will be at mountPath in container)
          if (hasGitSource && additions.skills.load) {
            ;(fragment.skills as Record<string, unknown>).load = additions.skills.load
          }
        }

        // Scheduler → heartbeat
        if (additions.agents?.defaults?.heartbeat) {
          if (!fragment.agents) fragment.agents = { defaults: {} }
          ;(fragment.agents.defaults as Record<string, unknown>).heartbeat =
            additions.agents.defaults.heartbeat
        }
      }
    }

    return fragment
  },
}
