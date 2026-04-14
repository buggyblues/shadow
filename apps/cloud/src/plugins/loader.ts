/**
 * Plugin Loader — discovers and registers all built-in plugins.
 *
 * Uses static imports (not dynamic discovery) since the CLI is bundled by tsup.
 * Each plugin is explicitly imported and registered.
 */

import type { PluginDefinition, PluginManifest, PluginRegistry } from './types.js'

const REQUIRED_MANIFEST_FIELDS: (keyof PluginManifest)[] = [
  'id',
  'name',
  'description',
  'version',
  'category',
  'icon',
  'auth',
  'capabilities',
  'tags',
]

/**
 * Validate that a manifest object has all required fields.
 */
export function validateManifest(manifest: unknown): manifest is PluginManifest {
  if (!manifest || typeof manifest !== 'object') return false
  const m = manifest as Record<string, unknown>
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (m[field] === undefined || m[field] === null) return false
  }
  if (typeof m.id !== 'string' || typeof m.name !== 'string') return false
  if (!Array.isArray(m.capabilities) || !Array.isArray(m.tags)) return false
  if (!m.auth || typeof m.auth !== 'object') return false
  return true
}

/**
 * Register a single plugin, validating its manifest first.
 */
export function registerPlugin(registry: PluginRegistry, plugin: PluginDefinition): void {
  if (!validateManifest(plugin.manifest)) {
    console.warn(
      `Invalid plugin manifest for "${(plugin.manifest as Record<string, unknown>)?.id ?? 'unknown'}", skipping`,
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
  // Import all built-in plugins statically
  // Each plugin directory exports a default PluginDefinition
  const pluginModules = await Promise.all([
    import('./shadowob/index.js'),
    import('./slack/index.js'),
    import('./discord/index.js'),
    import('./telegram/index.js'),
    import('./line/index.js'),
    import('./gmail/index.js'),
    import('./outlook-mail/index.js'),
    import('./google-chat/index.js'),
    import('./openai/index.js'),
    import('./anthropic/index.js'),
    import('./google-gemini/index.js'),
    import('./cohere/index.js'),
    import('./perplexity/index.js'),
    import('./grok/index.js'),
    import('./openrouter/index.js'),
    import('./hugging-face/index.js'),
    import('./github/index.js'),
    import('./vercel/index.js'),
    import('./cloudflare/index.js'),
    import('./sentry/index.js'),
    import('./posthog/index.js'),
    import('./playwright/index.js'),
    import('./neon/index.js'),
    import('./supabase/index.js'),
    import('./prisma-postgres/index.js'),
    import('./notion/index.js'),
    import('./google-drive/index.js'),
    import('./google-calendar/index.js'),
    import('./outlook-calendar/index.js'),
    import('./dropbox/index.js'),
    import('./airtable/index.js'),
    import('./todoist/index.js'),
    import('./webflow/index.js'),
    import('./wix/index.js'),
    import('./stripe/index.js'),
    import('./paypal/index.js'),
    import('./xero/index.js'),
    import('./revenucat/index.js'),
    import('./hubspot/index.js'),
    import('./intercom/index.js'),
    import('./close/index.js'),
    import('./apollo/index.js'),
    import('./mailchimp/index.js'),
    import('./zapier/index.js'),
    import('./make/index.js'),
    import('./n8n/index.js'),
    import('./dify/index.js'),
    import('./asana/index.js'),
    import('./linear/index.js'),
    import('./clickup/index.js'),
    import('./monday/index.js'),
    import('./atlassian/index.js'),
    import('./jotform/index.js'),
    import('./elevenlabs/index.js'),
    import('./heygen/index.js'),
    import('./metabase/index.js'),
    import('./ahrefs/index.js'),
    import('./polygon-io/index.js'),
    import('./zoominfo/index.js'),
    import('./firecrawl/index.js'),
    import('./explorium/index.js'),
    import('./granola/index.js'),
    import('./fireflies/index.js'),
    import('./tldv/index.js'),
    import('./hume/index.js'),
    import('./serena/index.js'),
    import('./postman-api/index.js'),
    import('./gitagent/index.js'),
  ])

  for (const mod of pluginModules) {
    const plugin = mod.default as PluginDefinition
    if (plugin?.manifest) {
      registerPlugin(registry, plugin)
    }
  }
}
