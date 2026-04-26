import { loadAllPlugins } from '../plugins/loader.js'
import { getPluginRegistry } from '../plugins/registry.js'
import type { PluginDefinition, ProviderCatalog } from '../plugins/types.js'

function collectPluginIds(value: unknown, out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 32 || !value || typeof value !== 'object') return out

  if (Array.isArray(value)) {
    for (const item of value) collectPluginIds(item, out, depth + 1)
    return out
  }

  const record = value as Record<string, unknown>
  if (typeof record.plugin === 'string') out.add(record.plugin)
  for (const child of Object.values(record)) collectPluginIds(child, out, depth + 1)
  return out
}

async function ensurePluginsLoaded(): Promise<void> {
  const registry = getPluginRegistry()
  if (registry.size === 0) await loadAllPlugins(registry)
}

function addProviderCatalogKeys(keys: Set<string>, catalog: ProviderCatalog): void {
  if (catalog.allowEnvDetection === false) return

  keys.add(catalog.envKey)
  for (const alias of catalog.envKeyAliases ?? []) keys.add(alias)
  if (catalog.baseUrlEnvKey) keys.add(catalog.baseUrlEnvKey)
  if (catalog.modelEnvKey) keys.add(catalog.modelEnvKey)
}

function addPluginSecretKeys(keys: Set<string>, plugin: PluginDefinition): void {
  for (const field of plugin.secretFields ?? []) {
    if (field.runtime === false) continue
    keys.add(field.key)
    for (const alias of field.aliases ?? []) keys.add(alias)
  }
}

/**
 * Collect runtime env keys a SaaS deployment may need from the plugin graph.
 *
 * This intentionally returns key names only. Values still come from the user's
 * encrypted Cloud env store, explicit deploy input, or local process.env fallback.
 */
export async function collectRuntimeEnvRequirements(configSnapshot: unknown): Promise<string[]> {
  const pluginIds = collectPluginIds(configSnapshot)
  if (pluginIds.size === 0) return []

  await ensurePluginsLoaded()

  const registry = getPluginRegistry()
  const keys = new Set<string>()
  const allProviderCatalogs = registry.getAll().flatMap((plugin) => plugin.providerCatalogs ?? [])

  for (const pluginId of pluginIds) {
    const plugin = registry.get(pluginId)
    if (plugin) {
      addPluginSecretKeys(keys, plugin)
      for (const catalog of plugin.providerCatalogs ?? []) addProviderCatalogKeys(keys, catalog)
    }

    if (pluginId === 'model-provider') {
      for (const catalog of allProviderCatalogs) addProviderCatalogKeys(keys, catalog)
    }
  }

  return [...keys].sort()
}
