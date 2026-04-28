/**
 * Plugin Loader — discovers and registers all built-in plugins.
 *
 * Uses static imports (not dynamic discovery) since the CLI is bundled by tsup.
 * Each plugin is explicitly imported and registered.
 */

import typia from 'typia'
import type { PluginDefinition, PluginManifest, PluginRegistry } from './types.js'

const validatePluginManifest: (input: unknown) => typia.IValidation<PluginManifest> =
  typia.createValidate<PluginManifest>()

/**
 * Validate that a manifest object has all required fields.
 */
export function validateManifest(manifest: unknown): manifest is PluginManifest {
  return validatePluginManifest(manifest).success
}

/**
 * Register a single plugin, validating its manifest first.
 */
export function registerPlugin(registry: PluginRegistry, plugin: PluginDefinition): void {
  if (!validateManifest(plugin.manifest)) {
    console.warn(
      `Invalid plugin manifest for "${
        (plugin.manifest as Record<string, unknown>)?.id ?? 'unknown'
      }", skipping`,
    )
    return
  }
  registry.register(plugin)
}

/**
 * Load all built-in plugins into the registry.
 * Called once at startup. Uses static imports for bundle compatibility.
 */
export async function loadAllPlugins(registry: PluginRegistry): Promise<void> {
  // Keep the default runtime plugin surface small. Model providers are
  // cataloged by model-provider itself, so provider-specific plugins do not
  // need to be loaded as independent OpenClaw config contributors.
  const pluginModules = await Promise.all([
    import('./shadowob/index.js'),
    import('./model-provider/index.js'),
    import('./github/index.js'),
    import('./notion/index.js'),
    import('./stripe/index.js'),
    import('./gitagent/index.js'),
    import('./agent-pack/index.js'),
  ])

  for (const mod of pluginModules) {
    const plugin = mod.default as PluginDefinition
    if (plugin?.manifest) {
      registerPlugin(registry, plugin)
    }
  }
}
