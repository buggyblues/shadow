/**
 * Plugin system barrel — public API for the plugin framework.
 */

export {
  createChannelPlugin,
  createProviderPlugin,
  createSkillPlugin,
  loadManifest,
} from './helpers.js'
export type { ProvisionResults } from './lifecycle.js'
export { checkPluginHealth, executePluginProvisions } from './lifecycle.js'
export { loadAllPlugins, registerPlugin, validateManifest } from './loader.js'
export { createPluginRegistry, getPluginRegistry, resetPluginRegistry } from './registry.js'
export type {
  PluginAuth,
  PluginAuthField,
  PluginAuthType,
  PluginBaseContext,
  PluginBuildContext,
  PluginCapability,
  PluginCategory,
  PluginCLIProvider,
  PluginCLITool,
  PluginConfigFragment,
  PluginDefinition,
  PluginInstallConfig,
  PluginManifest,
  PluginMCPProvider,
  PluginMCPServer,
  PluginOAuthConfig,
  PluginProvisionContext,
  PluginProvisionResult,
  PluginRegistry,
  PluginSkillEntry,
  PluginSkillsConfig,
  PluginSkillsProvider,
  PluginValidationError,
  PluginValidationResult,
} from './types.js'
