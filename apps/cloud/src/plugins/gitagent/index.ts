/**
 * GitAgent plugin — deploys agents from gitagent-standard git repositories.
 *
 * Three providers, each in their own module:
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
import type { AgentDeployment, AgentSource } from '../../config/schema.js'
import { definePlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginK8sProvider,
  PluginK8sResult,
  PluginManifest,
} from '../types.js'
import { buildGitCloneCommand, buildGitSyncSidecar, parsePollInterval } from './k8s.js'
import manifest from './manifest.json' with { type: 'json' }
import { buildOpenClawFromGitAgent, enrichAgentFromGitAgent, readGitAgentDir } from './reader.js'

// ── K8s provider ──
// Emits an init container (initial clone) plus an optional sidecar for
// periodic git pull when `agent.source.poll` is set. This enables live
// refresh of SOUL.md / AGENTS.md / skills/ without restarting the agent pod.
const gitagentK8sProvider: PluginK8sProvider = {
  buildK8s(agent, _ctx): PluginK8sResult | undefined {
    const src = agent.source as AgentSource | undefined
    if (!src) return undefined
    const useGitagent = src.gitagent !== false
    if (!useGitagent) return undefined
    const git = (src as { git?: { url?: string; ref?: string; depth?: number; dir?: string } }).git
    if (!git?.url) return undefined

    const mountPath = src.mountPath ?? '/agent'
    const ref = git.ref ?? 'main'
    const depth = git.depth ?? 1
    const include = (src as { include?: string[] }).include
    const poll = (src as { poll?: string | number }).poll
    const intervalSec = parsePollInterval(poll)

    const result: PluginK8sResult = {
      initContainers: [
        {
          name: 'gitagent-clone',
          image: 'alpine/git:latest',
          imagePullPolicy: 'IfNotPresent',
          command: buildGitCloneCommand({
            url: git.url,
            ref,
            depth,
            agentDir: git.dir,
            mountPath,
            include,
          }),
          volumeMounts: [{ name: 'gitagent-src', mountPath }],
        },
      ],
      volumes: [{ name: 'gitagent-src', spec: { emptyDir: {} } }],
      volumeMounts: [{ name: 'gitagent-src', mountPath }],
      envVars: [{ name: 'OPENCLAW_AGENT_DIR', value: mountPath }],
      labels: { 'gitagent.url': git.url.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 63) },
    }

    const sidecar = buildGitSyncSidecar({
      name: 'gitagent-sync',
      url: git.url,
      ref,
      depth,
      agentDir: git.dir,
      mountPath,
      include,
      intervalSec,
    })
    if (sidecar) result.sidecars = [sidecar]

    return result
  },
}

const plugin = definePlugin(manifest as PluginManifest, (api) => {
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

// Attach the K8s provider to the plugin definition so plugin-k8s.ts picks it up.
plugin.k8s = gitagentK8sProvider

export default plugin
