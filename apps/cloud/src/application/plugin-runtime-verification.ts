import { loadAllPlugins } from '../plugins/loader.js'
import { getPluginRegistry } from '../plugins/registry.js'
import type { PluginVerificationCheck } from '../plugins/types.js'

let registryLoadPromise: Promise<void> | null = null

async function ensurePluginRegistryLoaded() {
  const registry = getPluginRegistry()
  if (registryLoadPromise) {
    await registryLoadPromise
    return registry
  }
  if (registry.size > 0) return registry
  registryLoadPromise = loadAllPlugins(registry)
  await registryLoadPromise
  return registry
}

export async function getPluginRuntimeVerificationChecks(
  pluginId: string,
): Promise<PluginVerificationCheck[]> {
  const registry = await ensurePluginRegistryLoaded()
  return [...(registry.get(pluginId)?.runtime?.verificationChecks ?? [])]
}
