import agentRuntimesPlugin from '../plugins/agent-runtimes/index.js'
import { loadAllPlugins } from '../plugins/loader.js'
import { getPluginRegistry } from '../plugins/registry.js'
import type { PluginAgentRuntime } from '../plugins/types.js'

export interface AgentRuntimePluginEntry extends PluginAgentRuntime {
  pluginId: string
  pluginVersion: string
}

let loading: Promise<void> | null = null

async function ensureRuntimePluginLoaded() {
  const registry = getPluginRegistry()
  if (registry.size === 0) {
    loading ??= loadAllPlugins(registry)
    await loading
  } else if (!registry.get(agentRuntimesPlugin.manifest.id)) {
    registry.register(agentRuntimesPlugin)
  }
  return registry
}

export async function listAgentRuntimePlugins(): Promise<AgentRuntimePluginEntry[]> {
  const registry = await ensureRuntimePluginLoaded()
  return registry.getByCapability('agent-runtime').flatMap((plugin) =>
    (plugin.agentRuntimes ?? []).map((runtime) => ({
      ...runtime,
      pluginId: plugin.manifest.id,
      pluginVersion: plugin.manifest.version,
    })),
  )
}

export async function getAgentRuntimePlugin(
  runtimeId: string,
): Promise<AgentRuntimePluginEntry | null> {
  return (await listAgentRuntimePlugins()).find((runtime) => runtime.id === runtimeId) ?? null
}
