/**
 * Plugin system barrel — public API for the plugin framework.
 */

export {
  defineChannelPlugin,
  definePlugin,
  defineProviderPlugin,
  defineSkillPlugin,
  loadManifest,
} from './helpers.js'
export type { ProvisionResults } from './lifecycle.js'
export { checkPluginHealth, executePluginProvisions } from './lifecycle.js'
export { loadAllPlugins, registerPlugin, validateManifest } from './loader.js'
export { createPluginRegistry, getPluginRegistry, resetPluginRegistry } from './registry.js'
export type {
  PluginAPI,
  PluginAuth,
  PluginAuthField,
  PluginAuthType,
  PluginBaseContext,
  PluginBuildContext,
  PluginCapability,
  PluginCategory,
  PluginCLITool,
  PluginConfigFragment,
  PluginInstallConfig,
  PluginManifest,
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
