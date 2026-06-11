import type { AgentDeployment, CloudConfig } from '../config/schema.js'
import {
  buildRuntimeAssetK8sProvider,
  PLUGIN_RUNTIME_DEPS_ROOT,
  PLUGIN_SKILLS_ROOT,
  PLUGIN_SUBAGENTS_ROOT,
} from './runtime-assets.js'
import type {
  PluginAuthField,
  PluginCategory,
  PluginDefinition,
  PluginManifest,
  PluginRuntimeDependency,
  PluginRuntimeSource,
  PluginVerificationCheck,
} from './types.js'

export interface ConnectorManifestOptions {
  id: string
  name: string
  description: string
  category: PluginCategory
  icon: string
  website: string
  docs: string
  fields: PluginAuthField[]
  authType?: PluginManifest['auth']['type']
  capabilities?: PluginManifest['capabilities']
  tags: string[]
  popularity: number
}

export function connectorManifest(options: ConnectorManifestOptions): PluginManifest {
  const capabilities = options.capabilities ?? ['tool', 'data-source', 'action']
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    version: '1.0.0',
    category: options.category,
    icon: options.icon,
    website: options.website,
    docs: options.docs,
    auth: {
      type: options.authType ?? 'api-key',
      fields: options.fields,
    },
    capabilities: capabilities.includes('skill') ? capabilities : [...capabilities, 'skill'],
    tags: options.tags,
    popularity: options.popularity,
  }
}

export function connectorField(
  key: string,
  label: string,
  options: {
    description?: string
    required?: boolean
    sensitive?: boolean
    placeholder?: string
    helpUrl?: string
  } = {},
): PluginAuthField {
  return {
    key,
    label,
    description: options.description,
    required: options.required ?? true,
    sensitive: options.sensitive ?? true,
    placeholder: options.placeholder,
    helpUrl: options.helpUrl,
  }
}

export function npmGlobalDependency(
  id: string,
  packages: string[],
  description: string,
): PluginRuntimeDependency {
  return {
    id,
    kind: 'npm-global',
    packages,
    targetPath: '/runtime-deps',
    binPath: `/runtime-deps/bin/${id}`,
    description,
  }
}

export function pluginRuntimeMountPath(pluginId: string): string {
  return `${PLUGIN_RUNTIME_DEPS_ROOT}/${pluginId}`
}

export function pluginSkillsMountPath(pluginId: string): string {
  return `${PLUGIN_SKILLS_ROOT}/${pluginId}`
}

export function pluginSubagentsMountPath(pluginId: string): string {
  return `${PLUGIN_SUBAGENTS_ROOT}/${pluginId}`
}

export function installedCheck(
  id: string,
  label: string,
  command: string[],
): PluginVerificationCheck {
  return {
    id,
    label,
    kind: 'command',
    command,
    timeoutMs: 10_000,
    risk: 'safe',
  }
}

export function commandCheck(
  id: string,
  label: string,
  command: string[],
  requiredEnvAny: string[],
): PluginVerificationCheck {
  return {
    id,
    label,
    kind: 'command',
    command,
    timeoutMs: 20_000,
    risk: 'safe',
    requiredEnvAny,
  }
}

export function attachConnectorRuntimeAssets(
  plugin: PluginDefinition,
  options: {
    runtimeDependencies?:
      | PluginRuntimeDependency[]
      | ((agent: AgentDeployment, config: CloudConfig) => PluginRuntimeDependency[])
    skillSources?:
      | PluginRuntimeSource[]
      | ((agent: AgentDeployment, config: CloudConfig) => PluginRuntimeSource[])
    subagentSources?:
      | PluginRuntimeSource[]
      | ((agent: AgentDeployment, config: CloudConfig) => PluginRuntimeSource[])
    runtimeImage?: string
    sanityCommands?: string[]
    runtimeMountPath?: string
    initRuntimeMountPath?: string
    skillsMountPath?: string
    subagentsMountPath?: string
    executionUnitScope?: PluginDefinition['executionUnitScope']
    isEnabled?: (agent: AgentDeployment, config: CloudConfig) => boolean
  },
): PluginDefinition {
  plugin.k8s = buildRuntimeAssetK8sProvider({
    pluginId: plugin.manifest.id,
    isEnabled:
      options.isEnabled ??
      ((agent, config) => {
        const agentEnabled = agent.use?.some((entry) => entry.plugin === plugin.manifest.id)
        const globalEnabled =
          Array.isArray(config.use) &&
          config.use.some(
            (entry) => entry && typeof entry === 'object' && entry.plugin === plugin.manifest.id,
          )
        return Boolean(agentEnabled || globalEnabled)
      }),
    runtimeMountPath: options.runtimeMountPath,
    initRuntimeMountPath: options.initRuntimeMountPath,
    runtimeImage: options.runtimeImage,
    skillsMountPath: options.skillsMountPath,
    subagentsMountPath: options.subagentsMountPath,
    runtimeDependencies: options.runtimeDependencies,
    skillSources: options.skillSources,
    subagentSources: options.subagentSources,
    sanityCommands: options.sanityCommands,
  })
  if (options.executionUnitScope) {
    plugin.executionUnitScope = options.executionUnitScope
  }
  return plugin
}
