import { loadAllPlugins } from '../plugins/loader.js'
import { getPluginRegistry } from '../plugins/registry.js'
import type { PluginSecretField, ProviderCatalog } from '../plugins/types.js'

export interface ProviderCatalogEntry {
  pluginId: string
  pluginName: string
  provider: ProviderCatalog
  secretFields: PluginSecretField[]
}

async function ensurePluginsLoaded(): Promise<void> {
  const registry = getPluginRegistry()
  if (registry.size === 0) await loadAllPlugins(registry)
}

function providerSecretFields(provider: ProviderCatalog): PluginSecretField[] {
  const fields: PluginSecretField[] = [
    {
      key: provider.envKey,
      label: `${provider.id} API Key`,
      required: false,
      sensitive: true,
    },
  ]
  for (const alias of provider.envKeyAliases ?? []) {
    fields.push({
      key: alias,
      label: `${provider.id} API Key Alias`,
      required: false,
      sensitive: true,
    })
  }
  if (provider.baseUrlEnvKey) {
    fields.push({
      key: provider.baseUrlEnvKey,
      label: `${provider.id} Base URL`,
      required: false,
      sensitive: false,
    })
  }
  if (provider.modelEnvKey) {
    fields.push({
      key: provider.modelEnvKey,
      label: `${provider.id} Model`,
      required: false,
      sensitive: false,
    })
  }
  return fields
}

function dedupeFields(fields: PluginSecretField[]): PluginSecretField[] {
  const seen = new Set<string>()
  const out: PluginSecretField[] = []
  for (const field of fields) {
    if (seen.has(field.key)) continue
    seen.add(field.key)
    out.push(field)
  }
  return out
}

export async function listProviderCatalogs(): Promise<ProviderCatalogEntry[]> {
  await ensurePluginsLoaded()

  return getPluginRegistry()
    .getAll()
    .flatMap((plugin) =>
      (plugin.providerCatalogs ?? []).map((provider) => ({
        pluginId: plugin.manifest.id,
        pluginName: plugin.manifest.name,
        provider,
        secretFields: dedupeFields([
          ...(plugin.secretFields ?? []),
          ...providerSecretFields(provider),
        ]),
      })),
    )
    .sort(
      (a, b) =>
        (a.provider.priority ?? 1000) - (b.provider.priority ?? 1000) ||
        a.provider.id.localeCompare(b.provider.id),
    )
}
