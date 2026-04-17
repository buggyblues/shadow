/**
 * Plugin system barrel — public API for the plugin framework.
 */

export {
  mergePluginFragments,
  resolveAgentPluginConfig,
  resolvePluginSecrets,
} from './config-merger.js'
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
  PluginBuildContext,
  PluginCapability,
  PluginCategory,
  PluginChannelProvider,
  PluginCLIProvider,
  PluginCLITool,
  PluginConfigBuilder,
  PluginConfigFragment,
  PluginDefinition,
  PluginEnvProvider,
  PluginInstallConfig,
  PluginInstanceConfig,
  PluginK8sContext,
  PluginK8sEnvVar,
  PluginK8sInitContainer,
  PluginK8sProvider,
  PluginK8sResult,
  PluginK8sVolume,
  PluginK8sVolumeMount,
  PluginLifecycleProvider,
  PluginManifest,
  PluginMCPProvider,
  PluginMCPServer,
  PluginOAuthConfig,
  PluginProvisionContext,
  PluginProvisionResult,
  PluginRegistry,
  PluginResourceProvider,
  PluginSkillEntry,
  PluginSkillsProvider,
  PluginValidationError,
  PluginValidationProvider,
  PluginValidationResult,
} from './types.js'
