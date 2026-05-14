import {
  collectPluginBuildEnvVars,
  collectPluginRuntimeExtensions,
} from '../config/openclaw-builder.js'
import type { AgentDeployment, CloudConfig, OpenClawConfig } from '../config/schema.js'
import '../runtimes/loader.js'
import { RUNNER_CONFIG_MOUNT_PATH, SHADOWOB_CONFIG_MOUNT_PATH } from '../runtimes/container.js'
import { getRuntime, type RuntimeKind } from '../runtimes/index.js'
import { hasRuntimeExtensions, SHADOW_SLASH_COMMANDS_PATH } from '../runtimes/package-common.js'
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

type RuntimeEnv = Record<string, string | undefined>

export interface AgentRuntimePackage {
  runtimeKind: RuntimeKind
  openclawConfig?: OpenClawConfig
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

function classifyEnv(
  registrySecretEnv: Record<string, string>,
  mergedEnv: Record<string, string>,
): { plainEnv: Record<string, string>; secretData: Record<string, string> } {
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

  return { plainEnv, secretData }
}

function runtimePackageEnvDefaults(options: {
  runtimeKind: RuntimeKind
  hasExtensions: boolean
  currentEnv: Record<string, string>
}): Record<string, string> {
  const env: Record<string, string> = {}

  if (!options.currentEnv.SHADOW_SLASH_COMMANDS_PATH) {
    env.SHADOW_SLASH_COMMANDS_PATH = SHADOW_SLASH_COMMANDS_PATH
  }
  if (options.runtimeKind === 'hermes' && !options.currentEnv.SHADOW_SLASH_COMMANDS_JSON) {
    env.SHADOW_SLASH_COMMANDS_JSON = '[]'
  }
  if (options.hasExtensions && !options.currentEnv.SHADOW_RUNTIME_EXTENSIONS_PATH) {
    env.SHADOW_RUNTIME_EXTENSIONS_PATH =
      options.runtimeKind === 'openclaw'
        ? `${RUNNER_CONFIG_MOUNT_PATH}/runtime-extensions.json`
        : `${SHADOWOB_CONFIG_MOUNT_PATH}/runtime-extensions.json`
  }

  return env
}

export function buildAgentRuntimePackage(options: {
  agent: AgentDeployment
  config: CloudConfig
  extraEnv?: Record<string, string>
  cwd?: string
  runtimeContext?: DeploymentRuntimeContext
}): AgentRuntimePackage {
  const { agent, config, extraEnv, cwd, runtimeContext } = options
  const runtime = getRuntime(agent.runtime)
  const registrySecretEnv = collectRegistrySecretEnv(agent, config)
  const runtimeEnv: RuntimeEnv = {
    ...registrySecretEnv,
    ...(agent.env ?? {}),
    ...(extraEnv ?? {}),
  }
  const runtimeExtensions = collectPluginRuntimeExtensions(agent, config, cwd, runtimeEnv)

  const mergedEnv: Record<string, string> = {
    ...collectPluginBuildEnvVars(agent, config, cwd, runtimeEnv),
    ...(agent.env ?? {}),
    ...(extraEnv ?? {}),
  }

  Object.assign(
    mergedEnv,
    runtimePackageEnvDefaults({
      runtimeKind: runtime.runtimeKind,
      hasExtensions: hasRuntimeExtensions(runtimeExtensions),
      currentEnv: mergedEnv,
    }),
  )

  const runtimeArtifacts = runtime.buildPackage({
    agent,
    config,
    cwd,
    runtimeEnv,
    runtimeExtensions,
    runtimeContext,
  })

  if (runtimeArtifacts.provisionSecrets) {
    Object.assign(mergedEnv, runtimeArtifacts.provisionSecrets)
  }

  const { plainEnv, secretData } = classifyEnv(registrySecretEnv, mergedEnv)

  return {
    runtimeKind: runtime.runtimeKind,
    openclawConfig: runtimeArtifacts.openclawConfig,
    configData: runtimeArtifacts.configData,
    plainEnv,
    secretData,
    pluginResources: runtimeArtifacts.pluginResources,
  }
}
