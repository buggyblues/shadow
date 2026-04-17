/**
 * GitAgent plugin — deploys agents from gitagent-standard git repositories.
 *
 * Three providers, each in their own module:
 *
 * - `config-resolver.ts` — converts `use: [{ plugin: "gitagent" }]` into
 *   `agent.source` and enriches the agent from the local gitagent directory.
 * - `config-builder.ts` — generates the OpenClaw config fragment (repoRoot,
 *   skills, scheduler) from `agent.source` at build time.
 * - `k8s-provider.ts` — generates K8s pod artifacts (init containers, volumes,
 *   env vars) for git source overlays so the infra layer stays plugin-agnostic.
 */

import type { PluginDefinition } from '../types.js'
import { configBuilder } from './config-builder.js'
import { configResolver } from './config-resolver.js'
import { k8sProvider } from './k8s-provider.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = {
  manifest: manifest as unknown as PluginDefinition['manifest'],
  configResolver,
  configBuilder,
  k8s: k8sProvider,
}

export default plugin
