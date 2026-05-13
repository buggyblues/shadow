import {
  collectPluginBuildEnvVars,
  collectPluginRuntimeExtensions,
} from '../config/openclaw-builder.js'
import { buildOpenClawConfig } from '../config/parser.js'
import type { AgentDeployment, CloudConfig, OpenClawConfig } from '../config/schema.js'
import type { PluginRuntimeExtension } from '../plugins/types.js'
import { toProviderSecretEnvKey, withLegacyEnvAliases } from '../utils/env-names.js'
import type { DeploymentRuntimeContext } from '../utils/runtime-context.js'

const SECRET_ENV_MARKERS = [
  'TOKEN',
  'SECRET',
  'PASSWORD',
  'PASS',
  'PRIVATE',
  'COOKIE',
  'CERT',
  'CREDENTIAL',
  'ADC',
  'KEY',
  'AUTH',
]

export interface AgentRuntimePackage {
  openclawConfig: OpenClawConfig
  configData: Record<string, string>
  plainEnv: Record<string, string>
  secretData: Record<string, string>
  pluginResources: Record<string, unknown>[]
}

function isSensitiveEnvKey(key: string): boolean {
  const upper = key.toUpperCase()
  return SECRET_ENV_MARKERS.some((marker) => upper.includes(marker))
}

function collectRegistrySecretEnv(
  agent: AgentDeployment,
  config: CloudConfig,
): Record<string, string> {
  const secretEnv: Record<string, string> = {}
  const vaultName = agent.vault ?? 'default'
  const vault = config.registry?.vaults?.[vaultName]

  if (vault) {
    if (vault.providers) {
      for (const [providerId, source] of Object.entries(vault.providers)) {
        if (!source.apiKey) continue
        const key = toProviderSecretEnvKey(providerId, 'apiKey')
        Object.assign(secretEnv, withLegacyEnvAliases(key, String(source.apiKey)))
      }
    }

    if (vault.secrets) {
      for (const [key, value] of Object.entries(vault.secrets)) {
        secretEnv[key] = String(value)
      }
    }

    return secretEnv
  }

  for (const provider of config.registry?.providers ?? []) {
    if (!provider.apiKey) continue
    const key = toProviderSecretEnvKey(provider.id ?? 'custom', 'apiKey')
    Object.assign(secretEnv, withLegacyEnvAliases(key, String(provider.apiKey)))
  }

  return secretEnv
}

function hasRuntimeExtensions(extension: PluginRuntimeExtension): boolean {
  return Boolean(
    extension.openclaw?.manifestPatches?.length ||
      extension.artifacts?.length ||
      extension.runtimeDependencies?.length ||
      extension.skillSources?.length ||
      extension.subagentSources?.length ||
      extension.mcpServers?.length ||
      extension.credentialFiles?.length ||
      extension.verificationChecks?.length,
  )
}

export function buildAgentRuntimePackage(options: {
  agent: AgentDeployment
  config: CloudConfig
  extraEnv?: Record<string, string>
  cwd?: string
  runtimeContext?: DeploymentRuntimeContext
}): AgentRuntimePackage {
  const { agent, config, extraEnv, cwd, runtimeContext } = options
  const registrySecretEnv = collectRegistrySecretEnv(agent, config)
  const runtimeEnv = {
    ...registrySecretEnv,
    ...(agent.env ?? {}),
    ...(extraEnv ?? {}),
  }
  const openclawConfig = buildOpenClawConfig(agent, config, cwd, runtimeEnv, runtimeContext)
  const runtimeExtensions = collectPluginRuntimeExtensions(agent, config, cwd, runtimeEnv)

  const workspaceFiles = (openclawConfig._workspaceFiles ?? {}) as Record<string, string>
  delete openclawConfig._workspaceFiles

  const pluginResources = (openclawConfig._pluginResources ?? []) as Record<string, unknown>[]
  delete openclawConfig._pluginResources

  const pluginProvisions = (openclawConfig._pluginProvisions ?? []) as Array<{
    pluginId: string
    secrets?: Record<string, string>
  }>
  delete openclawConfig._pluginProvisions

  const mergedEnv: Record<string, string> = {
    ...collectPluginBuildEnvVars(agent, config, cwd, runtimeEnv),
    ...(agent.env ?? {}),
    ...(extraEnv ?? {}),
  }

  const slashCommandArtifact = runtimeExtensions.artifacts?.find(
    (artifact) => artifact.kind === 'shadow.slashCommands',
  )
  if (slashCommandArtifact?.path && !mergedEnv.SHADOW_SLASH_COMMANDS_PATH) {
    mergedEnv.SHADOW_SLASH_COMMANDS_PATH = slashCommandArtifact.path
  }
  if (hasRuntimeExtensions(runtimeExtensions) && !mergedEnv.SHADOW_RUNTIME_EXTENSIONS_PATH) {
    mergedEnv.SHADOW_RUNTIME_EXTENSIONS_PATH = '/etc/openclaw/runtime-extensions.json'
  }

  for (const provision of pluginProvisions) {
    if (provision.secrets) {
      Object.assign(mergedEnv, provision.secrets)
    }
  }

  const configData: Record<string, string> = {
    'config.json': JSON.stringify(openclawConfig, null, 2),
    ...workspaceFiles,
  }
  if (hasRuntimeExtensions(runtimeExtensions)) {
    configData['runtime-extensions.json'] = JSON.stringify(runtimeExtensions, null, 2)
  }
  const plainEnv: Record<string, string> = {}
  const secretData: Record<string, string> = { ...registrySecretEnv }

  for (const [key, value] of Object.entries(mergedEnv)) {
    if (value == null) continue

    if (isSensitiveEnvKey(key)) {
      secretData[key] = value
    } else {
      plainEnv[key] = value
    }
  }

  return {
    openclawConfig,
    configData,
    plainEnv,
    secretData,
    pluginResources,
  }
}
