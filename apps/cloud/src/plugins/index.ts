/**
 * Plugin system barrel — public API for the plugin framework.
 */

export {
  defineChannelPlugin,
  defineConnectorPlugin,
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
  PluginAgentRuntime,
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
  PluginMCPTransport,
  PluginOAuthConfig,
  PluginProvisionContext,
  PluginProvisionResult,
  PluginRegistry,
  PluginRuntimeArtifact,
  PluginRuntimeDependency,
  PluginRuntimeExtension,
  PluginRuntimeSource,
  PluginSkillEntry,
  PluginSkillsConfig,
  PluginSkillsProvider,
  PluginValidationError,
  PluginValidationResult,
  PluginVerificationCheck,
} from './types.js'
