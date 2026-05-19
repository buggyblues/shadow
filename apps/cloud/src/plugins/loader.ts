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
    import('./google-workspace/index.js'),
    import('./notion/index.js'),
    import('./stripe/index.js'),
    import('./shopify/index.js'),
    import('./paypal/index.js'),
    import('./agent-browser/index.js'),
    import('./skill-discovery/index.js'),
    import('./opencli/index.js'),
    import('./inference-sh/index.js'),
    import('./inference-ai-image-generation/index.js'),
    import('./wonda/index.js'),
    import('./figma/index.js'),
    import('./canva/index.js'),
    import('./airtable/index.js'),
    import('./huggingface/index.js'),
    import('./linear/index.js'),
    import('./lovart/index.js'),
    import('./atlassian/index.js'),
    import('./sentry/index.js'),
    import('./posthog/index.js'),
    import('./sherlock/index.js'),
    import('./firebase/index.js'),
    import('./firecrawl/index.js'),
    import('./playwright/index.js'),
    import('./browserbase/index.js'),
    import('./lark/index.js'),
    import('./dingtalk/index.js'),
    import('./tencent-docs/index.js'),
    import('./wps/index.js'),
    import('./yuque/index.js'),
    import('./alipay/index.js'),
    import('./wechat-pay/index.js'),
    import('./amap/index.js'),
    import('./baidu-maps/index.js'),
    import('./tencent-maps/index.js'),
    import('./flyai/index.js'),
    import('./kuaidi100/index.js'),
    import('./oceanengine/index.js'),
    import('./tencent-ads/index.js'),
    import('./coze/index.js'),
    import('./taobao-aipaas/index.js'),
    import('./baidu-appbuilder/index.js'),
    import('./baidu-netdisk/index.js'),
    import('./wechat-miniprogram-skyline/index.js'),
    import('./douyin-miniprogram/index.js'),
    import('./baidu-smartprogram/index.js'),
    import('./miclaw/index.js'),
    import('./huawei-xiaoyi/index.js'),
    import('./gitee/index.js'),
    import('./tapd/index.js'),
    import('./cnb/index.js'),
    import('./google-ads/index.js'),
    import('./meta-ads/index.js'),
    import('./seo-suite/index.js'),
    import('./wordpress-woocommerce/index.js'),
    import('./cloudflare/index.js'),
    import('./claude-plugin/index.js'),
    import('./supabase/index.js'),
    import('./google-analytics/index.js'),
    import('./hubspot/index.js'),
    import('./klaviyo/index.js'),
    import('./webflow/index.js'),
    import('./salesforce/index.js'),
    import('./vercel/index.js'),
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
