import { parse as parseToml, stringify as stringifyToml, type TomlTable } from 'smol-toml'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { CloudExecutionUnit } from '../application/runtime-topology.js'
import {
  collectPluginBuildEnvVars,
  collectPluginBuildPrompts,
  collectPluginRuntimeEnvOmitKeys,
  collectPluginRuntimeExtensions,
} from '../config/openclaw-builder.js'
import type { AgentDeployment, CloudConfig, OpenClawConfig } from '../config/schema.js'
import type { PluginRuntimeExtension } from '../plugins/types.js'
import '../runtimes/loader.js'
import { RUNNER_CONFIG_MOUNT_PATH, SHADOWOB_CONFIG_MOUNT_PATH } from '../runtimes/container.js'
import { getRuntime, type RuntimeKind } from '../runtimes/index.js'
import {
  hasRuntimeExtensions,
  SHADOWOB_EXPOSURE_CONFIG_PATH,
  SHADOWOB_EXPOSURE_STATUS_PATH,
  SHADOWOB_SLASH_COMMANDS_PATH,
} from '../runtimes/package-common.js'
import { toProviderSecretEnvKey } from '../utils/env-names.js'
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

type RuntimeFiles = Record<string, string>

const WORKSPACE_DIR = '/workspace'
const RUNNER_HOME_DIR = '/home/shadow'
const HERMES_PROFILES_DIR = `${RUNNER_HOME_DIR}/.hermes/profiles`
const HERMES_GATEWAYS_MANIFEST_PATH = `${SHADOWOB_CONFIG_MOUNT_PATH}/hermes-gateways.json`
const SHADOWOB_CLI_CONFIG_PATH = `${RUNNER_HOME_DIR}/.shadowob/shadowob.config.json`
const WORKSPACE_BOOTSTRAP_FILES = new Set([
  'SOUL.md',
  'IDENTITY.md',
  'TOOLS.md',
  'AGENTS.md',
  'USER.md',
  'HEARTBEAT.md',
  'BOOTSTRAP.md',
])

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
        secretEnv[key] = String(source.apiKey)
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
    secretEnv[key] = String(provider.apiKey)
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

function omitEnvKeys(env: Record<string, string>, keys: Set<string>): void {
  for (const key of keys) delete env[key]
}

function runtimePackageEnvDefaults(options: {
  runtimeKind: RuntimeKind
  hasExtensions: boolean
  currentEnv: Record<string, string>
}): Record<string, string> {
  const env: Record<string, string> = {}

  if (!options.currentEnv.SHADOWOB_SLASH_COMMANDS_PATH) {
    env.SHADOWOB_SLASH_COMMANDS_PATH = SHADOWOB_SLASH_COMMANDS_PATH
  }
  if (!options.currentEnv.SHADOWOB_EXPOSURE_CONFIG) {
    env.SHADOWOB_EXPOSURE_CONFIG = SHADOWOB_EXPOSURE_CONFIG_PATH
  }
  if (!options.currentEnv.SHADOWOB_EXPOSURE_STATUS) {
    env.SHADOWOB_EXPOSURE_STATUS = SHADOWOB_EXPOSURE_STATUS_PATH
  }
  if (options.hasExtensions && !options.currentEnv.SHADOWOB_RUNTIME_EXTENSIONS_PATH) {
    env.SHADOWOB_RUNTIME_EXTENSIONS_PATH =
      options.runtimeKind === 'openclaw'
        ? `${RUNNER_CONFIG_MOUNT_PATH}/runtime-extensions.json`
        : `${SHADOWOB_CONFIG_MOUNT_PATH}/runtime-extensions.json`
  }

  return env
}

function agentWithAdditionalSystemPrompt(
  agent: AgentDeployment,
  additionalPrompt: string,
): AgentDeployment {
  const trimmed = additionalPrompt.trim()
  if (!trimmed) return agent

  const identity = agent.identity ?? {}
  const existingPrompt = identity.systemPrompt?.trim()
  return {
    ...agent,
    identity: {
      ...identity,
      systemPrompt: existingPrompt ? `${existingPrompt}\n\n---\n\n${trimmed}` : trimmed,
    },
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry) => entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  )
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value ?? null))
}

function uniqueByStableJson<T>(items: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    const key = stableJson(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function parseJsonObject(raw: string | undefined, fallback: Record<string, unknown> = {}) {
  if (!raw) return fallback
  const parsed = JSON.parse(raw)
  return isPlainObject(parsed) ? parsed : fallback
}

function runtimeFilesFrom(pkg: AgentRuntimePackage): RuntimeFiles {
  return parseJsonObject(pkg.configData['runtime-files.json']) as RuntimeFiles
}

function mergeStringMaps(label: string, maps: Record<string, string>[]): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const map of maps) {
    for (const [key, value] of Object.entries(map)) {
      const existing = merged[key]
      if (existing !== undefined && existing !== value) {
        throw new Error(`Cannot merge shared runtime ${label}: key "${key}" has conflicting values`)
      }
      merged[key] = value
    }
  }
  return merged
}

function mergePluginResources(resources: Record<string, unknown>[][]): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>()
  for (const resource of resources.flat()) {
    const metadata = isPlainObject(resource.metadata) ? resource.metadata : {}
    const key = [
      resource.apiVersion,
      resource.kind,
      metadata.namespace,
      metadata.name,
      stableJson(resource),
    ].join('|')
    byKey.set(key, resource)
  }
  return [...byKey.values()]
}

function mergeRuntimeExtensionObjects(
  left: unknown,
  right: unknown,
  path = 'runtimeExtensions',
): unknown {
  if (right === undefined) return left
  if (left === undefined) return right

  if (Array.isArray(left) && Array.isArray(right)) {
    return uniqueByStableJson([...left, ...right])
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const result: Record<string, unknown> = { ...left }
    for (const [key, value] of Object.entries(right)) {
      result[key] = mergeRuntimeExtensionObjects(result[key], value, `${path}.${key}`)
    }
    return result
  }

  if (path === 'runtimeExtensions.shadowob.defaultAccountEnvKey') return left

  if (stableJson(left) === stableJson(right)) return left
  throw new Error(`Cannot merge shared runtime ${path}: conflicting values`)
}

function mergeRuntimeExtensions(extensions: PluginRuntimeExtension[]): PluginRuntimeExtension {
  let merged: PluginRuntimeExtension = {}
  for (const extension of extensions) {
    merged = mergeRuntimeExtensionObjects(merged, extension) as PluginRuntimeExtension
  }
  return merged
}

function extensionFromPackage(pkg: AgentRuntimePackage): PluginRuntimeExtension {
  return parseJsonObject(pkg.configData['runtime-extensions.json']) as PluginRuntimeExtension
}

function agentWorkspaceDir(agentId: string): string {
  return `${WORKSPACE_DIR}/.agents/${agentId}`
}

function hermesProfileHome(agentId: string): string {
  return `${HERMES_PROFILES_DIR}/${agentId}`
}

function scopedWorkspacePath(agentId: string, filename: string): string {
  return `${agentWorkspaceDir(agentId)}/${filename}`
}

function addMergedRuntimeFile(files: RuntimeFiles, path: string, content: string): void {
  const existing = files[path]
  if (existing !== undefined && existing !== content) {
    throw new Error(`Cannot merge shared runtime file "${path}": conflicting contents`)
  }
  files[path] = content
}

function mergeShadowobCliAuth(files: RuntimeFiles[], output: RuntimeFiles): void {
  const profiles: Record<string, { serverUrl?: string; token?: string }> = {}
  let currentProfile: string | undefined

  for (const fileset of files) {
    const raw = fileset[SHADOWOB_CLI_CONFIG_PATH]
    if (!raw) continue
    const parsed = parseJsonObject(raw) as {
      profiles?: Record<string, { serverUrl?: string; token?: string }>
      currentProfile?: string
    }
    if (!currentProfile && parsed.currentProfile) currentProfile = parsed.currentProfile
    for (const [profile, auth] of Object.entries(parsed.profiles ?? {})) {
      const existing = profiles[profile]
      if (existing && stableJson(existing) !== stableJson(auth)) {
        throw new Error(`Cannot merge Shadow CLI auth profile "${profile}": conflicting contents`)
      }
      profiles[profile] = auth
    }
  }

  if (Object.keys(profiles).length === 0) return
  output[SHADOWOB_CLI_CONFIG_PATH] = `${JSON.stringify(
    { profiles, currentProfile: currentProfile ?? Object.keys(profiles)[0] },
    null,
    2,
  )}\n`
}

function scopedCcConnectRuntimeFiles(agent: AgentDeployment, files: RuntimeFiles): RuntimeFiles {
  const scoped: RuntimeFiles = {}
  const workspaceDir = agentWorkspaceDir(agent.id)
  const codexHome = `${RUNNER_HOME_DIR}/.codex/profiles/${agent.id}`

  for (const [path, content] of Object.entries(files)) {
    if (path === SHADOWOB_CLI_CONFIG_PATH) continue
    if (path === `${RUNNER_HOME_DIR}/.cc-connect/config.toml`) continue
    if (path.startsWith(`${WORKSPACE_DIR}/.agents/skills/`)) {
      scoped[path] = content
      continue
    }
    if (path.startsWith(`${WORKSPACE_DIR}/.agents/agents/`)) {
      scoped[path] = content
      continue
    }
    if (path.startsWith(`${WORKSPACE_DIR}/.claude/`)) {
      scoped[`${workspaceDir}/.claude/${path.slice(`${WORKSPACE_DIR}/.claude/`.length)}`] = content
      continue
    }
    if (path === `${WORKSPACE_DIR}/.mcp.json`) {
      scoped[`${workspaceDir}/.mcp.json`] = content
      continue
    }
    if (path.startsWith(`${WORKSPACE_DIR}/.opencode/`)) {
      scoped[`${workspaceDir}/.opencode/${path.slice(`${WORKSPACE_DIR}/.opencode/`.length)}`] =
        content
      continue
    }
    if (path === `${WORKSPACE_DIR}/opencode.json`) {
      scoped[`${workspaceDir}/opencode.json`] = content
      continue
    }
    if (path.startsWith(`${WORKSPACE_DIR}/.codex/`)) {
      scoped[`${workspaceDir}/.codex/${path.slice(`${WORKSPACE_DIR}/.codex/`.length)}`] = content
      continue
    }
    if (path.startsWith(`${RUNNER_HOME_DIR}/.codex/`)) {
      scoped[`${codexHome}/${path.slice(`${RUNNER_HOME_DIR}/.codex/`.length)}`] = content
      continue
    }
    if (path.startsWith(`${WORKSPACE_DIR}/`)) {
      const filename = path.slice(`${WORKSPACE_DIR}/`.length)
      if (WORKSPACE_BOOTSTRAP_FILES.has(filename)) {
        scoped[scopedWorkspacePath(agent.id, filename)] = content
        continue
      }
    }
    scoped[path] = content
  }

  return scoped
}

function scopedHermesRuntimeFiles(agent: AgentDeployment, files: RuntimeFiles): RuntimeFiles {
  const scoped: RuntimeFiles = {}
  const profileHome = hermesProfileHome(agent.id)
  const workspaceDir = agentWorkspaceDir(agent.id)
  const hermesRoot = `${RUNNER_HOME_DIR}/.hermes`

  for (const [path, content] of Object.entries(files)) {
    if (path === SHADOWOB_CLI_CONFIG_PATH) continue
    if (path === `${hermesRoot}/config.yaml`) {
      const parsed = parseYaml(content) as Record<string, unknown>
      const config = isPlainObject(parsed) ? parsed : {}
      config.terminal = {
        ...(isPlainObject(config.terminal) ? config.terminal : {}),
        cwd: workspaceDir,
      }
      scoped[`${profileHome}/config.yaml`] = stringifyYaml(config)
      continue
    }
    if (path === `${hermesRoot}/.env`) {
      scoped[`${profileHome}/.env`] = content
      continue
    }
    if (path.startsWith(`${hermesRoot}/skills/`)) {
      scoped[`${profileHome}/skills/${path.slice(`${hermesRoot}/skills/`.length)}`] = content
      continue
    }
    if (path.startsWith(`${hermesRoot}/agents/`)) {
      scoped[`${profileHome}/agents/${path.slice(`${hermesRoot}/agents/`.length)}`] = content
      continue
    }
    if (path.startsWith(`${WORKSPACE_DIR}/.agents/skills/`)) {
      scoped[path] = content
      continue
    }
    if (path.startsWith(`${WORKSPACE_DIR}/`)) {
      const filename = path.slice(`${WORKSPACE_DIR}/`.length)
      if (WORKSPACE_BOOTSTRAP_FILES.has(filename)) {
        scoped[`${profileHome}/${filename}`] = content
        scoped[scopedWorkspacePath(agent.id, filename)] = content
        continue
      }
    }
    scoped[path] = content
  }

  return scoped
}

function mergeOpenClawGlobalConfig(
  left: unknown,
  right: unknown,
  path = 'openclawConfig',
): unknown {
  if (right === undefined) return left
  if (left === undefined) return right

  if (Array.isArray(left) && Array.isArray(right)) {
    return uniqueByStableJson([...left, ...right])
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const result: Record<string, unknown> = { ...left }
    for (const [key, value] of Object.entries(right)) {
      result[key] = mergeOpenClawGlobalConfig(result[key], value, `${path}.${key}`)
    }
    return result
  }

  if (stableJson(left) === stableJson(right)) return left
  throw new Error(`Cannot merge shared OpenClaw config ${path}: conflicting values`)
}

function extractOpenClawAgentEntry(
  agent: AgentDeployment,
  config: OpenClawConfig,
  first: boolean,
): Record<string, unknown> {
  const agentEntry = {
    ...((config.agents?.list?.[0] ?? {}) as Record<string, unknown>),
  }
  const defaults = (config.agents?.defaults ?? {}) as Record<string, unknown>
  const workspace = defaults.workspace
  const model = defaults.model
  const thinkingDefault = defaults.thinkingDefault

  if (workspace !== undefined && agentEntry.workspace === undefined) {
    agentEntry.workspace = workspace
  }
  if (model !== undefined && agentEntry.model === undefined) {
    agentEntry.model = model
  }
  if (thinkingDefault !== undefined && agentEntry.thinkingDefault === undefined) {
    agentEntry.thinkingDefault = thinkingDefault
  }
  if (isPlainObject(config.tools) && agentEntry.tools === undefined) {
    agentEntry.tools = config.tools
  }

  agentEntry.default = first
  agentEntry.agentDir = agentWorkspaceDir(agent.id)
  return agentEntry
}

function stripOpenClawAgentScopedDefaults(config: OpenClawConfig): OpenClawConfig {
  const copy = JSON.parse(JSON.stringify(config)) as OpenClawConfig
  if (copy.agents) {
    copy.agents.list = []
    if (copy.agents.defaults) {
      delete (copy.agents.defaults as Record<string, unknown>).workspace
      delete (copy.agents.defaults as Record<string, unknown>).model
      delete (copy.agents.defaults as Record<string, unknown>).thinkingDefault
      if (Object.keys(copy.agents.defaults as Record<string, unknown>).length === 0) {
        delete copy.agents.defaults
      }
    }
  }
  delete copy.tools
  return copy
}

function buildSharedOpenClawPackage(
  agents: AgentDeployment[],
  packages: AgentRuntimePackage[],
): AgentRuntimePackage {
  const configs = packages.map(
    (pkg) => parseJsonObject(pkg.configData['config.json']) as OpenClawConfig,
  )
  const agentEntries = configs.map((config, index) =>
    extractOpenClawAgentEntry(agents[index]!, config, index === 0),
  )
  const baseConfig = stripOpenClawAgentScopedDefaults(configs[0]!)
  let mergedConfig = baseConfig as unknown
  for (const config of configs.slice(1)) {
    mergedConfig = mergeOpenClawGlobalConfig(mergedConfig, stripOpenClawAgentScopedDefaults(config))
  }
  const openclawConfig = mergedConfig as OpenClawConfig
  openclawConfig.agents ??= {}
  openclawConfig.agents.list = agentEntries as unknown as NonNullable<
    OpenClawConfig['agents']
  >['list']

  const runtimeFiles: RuntimeFiles = {}
  mergeShadowobCliAuth(packages.map(runtimeFilesFrom), runtimeFiles)
  for (const [index, pkg] of packages.entries()) {
    const agent = agents[index]!
    const files = runtimeFilesFrom(pkg)
    for (const [path, content] of Object.entries(files)) {
      if (path === SHADOWOB_CLI_CONFIG_PATH) continue
      addMergedRuntimeFile(runtimeFiles, path, content)
    }
    for (const [path, content] of Object.entries(pkg.configData)) {
      if (
        path === 'config.json' ||
        path === 'runtime-files.json' ||
        path === 'runtime-extensions.json'
      ) {
        continue
      }
      if (WORKSPACE_BOOTSTRAP_FILES.has(path)) {
        addMergedRuntimeFile(runtimeFiles, scopedWorkspacePath(agent.id, path), content)
      }
    }
  }

  runtimeFiles[`${WORKSPACE_DIR}/AGENTS.md`] = [
    '# Agents',
    '',
    ...agents.map((agent) => {
      const name = agent.identity?.name ?? agent.id
      const description = agent.identity?.description ?? agent.description
      return `- **${name}**${description ? ` - ${description}` : ''}`
    }),
    '',
  ].join('\n')

  const runtimeExtensions = mergeRuntimeExtensions(packages.map(extensionFromPackage))
  const configData: Record<string, string> = {
    'config.json': JSON.stringify(openclawConfig, null, 2),
    'runtime-files.json': `${JSON.stringify(runtimeFiles, null, 2)}\n`,
  }
  if (hasRuntimeExtensions(runtimeExtensions)) {
    configData['runtime-extensions.json'] = `${JSON.stringify(runtimeExtensions, null, 2)}\n`
  }

  return {
    runtimeKind: 'openclaw',
    openclawConfig,
    configData,
    plainEnv: mergeStringMaps(
      'plain env',
      packages.map((pkg) => pkg.plainEnv),
    ),
    secretData: mergeStringMaps(
      'secret data',
      packages.map((pkg) => pkg.secretData),
    ),
    pluginResources: mergePluginResources(packages.map((pkg) => pkg.pluginResources)),
  }
}

function buildSharedCcConnectPackage(
  agents: AgentDeployment[],
  packages: AgentRuntimePackage[],
): AgentRuntimePackage {
  const runtimeFiles: RuntimeFiles = {}
  const sourceRuntimeFiles = packages.map(runtimeFilesFrom)
  mergeShadowobCliAuth(sourceRuntimeFiles, runtimeFiles)

  const projects: TomlTable[] = []
  let root: TomlTable | undefined
  const runtimeAgents: Array<Record<string, unknown>> = []

  for (const [index, pkg] of packages.entries()) {
    const agent = agents[index]!
    const parsed = parseToml(pkg.configData['cc-connect-config.toml'] ?? '') as TomlTable
    const parsedProjects = Array.isArray(parsed.projects) ? (parsed.projects as TomlTable[]) : []
    if (!root) {
      root = { ...parsed, projects: [] }
    }
    for (const project of parsedProjects) {
      const scopedProject = JSON.parse(JSON.stringify(project)) as TomlTable
      const agentConfig = (scopedProject.agent ?? {}) as TomlTable
      const options = (agentConfig.options ?? {}) as TomlTable
      options.work_dir = agentWorkspaceDir(agent.id)
      if (agent.runtime === 'codex') {
        options.codex_home = `${RUNNER_HOME_DIR}/.codex/profiles/${agent.id}`
      }
      agentConfig.options = options
      scopedProject.agent = agentConfig
      projects.push(scopedProject)
      runtimeAgents.push({
        agentId: agent.id,
        projectName: scopedProject.name,
        runtime: agent.runtime,
        shadows: (scopedProject.platforms as Array<Record<string, unknown>> | undefined) ?? [],
      })
    }

    for (const [path, content] of Object.entries(
      scopedCcConnectRuntimeFiles(agent, sourceRuntimeFiles[index]!),
    )) {
      addMergedRuntimeFile(runtimeFiles, path, content)
    }
  }

  const ccConnectConfig = stringifyToml({ ...(root ?? {}), projects })
  runtimeFiles[`${RUNNER_HOME_DIR}/.cc-connect/config.toml`] = ccConnectConfig
  runtimeFiles[`${WORKSPACE_DIR}/AGENTS.md`] = [
    '# Agents',
    '',
    ...agents.map((agent) => {
      const name = agent.identity?.name ?? agent.id
      const description = agent.identity?.description ?? agent.description
      return `- **${name}**${description ? ` - ${description}` : ''}`
    }),
    '',
  ].join('\n')

  const runtimeExtensions = mergeRuntimeExtensions(packages.map(extensionFromPackage))
  const configData: Record<string, string> = {
    'cc-connect-config.toml': ccConnectConfig,
    'runtime-files.json': `${JSON.stringify(runtimeFiles, null, 2)}\n`,
    'workspace-files.json': `${JSON.stringify(
      Object.fromEntries(
        Object.entries(runtimeFiles).filter(([path]) =>
          path.startsWith(`${WORKSPACE_DIR}/.agents/`),
        ),
      ),
      null,
      2,
    )}\n`,
    'shadowob-runtime.json': `${JSON.stringify(
      {
        cli: 'shadowob',
        connector: 'shadowob-connector',
        transport: 'cc-connect',
        agents: runtimeAgents,
      },
      null,
      2,
    )}\n`,
  }
  if (hasRuntimeExtensions(runtimeExtensions)) {
    configData['runtime-extensions.json'] = `${JSON.stringify(runtimeExtensions, null, 2)}\n`
  }

  return {
    runtimeKind: 'cc-connect',
    configData,
    plainEnv: mergeStringMaps(
      'plain env',
      packages.map((pkg) => pkg.plainEnv),
    ),
    secretData: mergeStringMaps(
      'secret data',
      packages.map((pkg) => pkg.secretData),
    ),
    pluginResources: mergePluginResources(packages.map((pkg) => pkg.pluginResources)),
  }
}

function buildSharedHermesPackage(
  agents: AgentDeployment[],
  packages: AgentRuntimePackage[],
): AgentRuntimePackage {
  const runtimeFiles: RuntimeFiles = {}
  const sourceRuntimeFiles = packages.map(runtimeFilesFrom)
  mergeShadowobCliAuth(sourceRuntimeFiles, runtimeFiles)

  const profiles: Array<Record<string, string>> = []
  const runtimeAgents: Array<Record<string, unknown>> = []

  for (const [index, pkg] of packages.entries()) {
    const agent = agents[index]!
    const profileHome = hermesProfileHome(agent.id)
    profiles.push({
      agentId: agent.id,
      profile: agent.id,
      home: profileHome,
      readyFile: `/tmp/shadowob-ready-${agent.id}.json`,
    })
    for (const [path, content] of Object.entries(
      scopedHermesRuntimeFiles(agent, sourceRuntimeFiles[index]!),
    )) {
      addMergedRuntimeFile(runtimeFiles, path, content)
    }
    const descriptor = parseJsonObject(pkg.configData['shadowob-runtime.json']) as Record<
      string,
      unknown
    >
    runtimeAgents.push({
      agentId: agent.id,
      profile: agent.id,
      home: profileHome,
      shadow: descriptor.shadow,
    })
  }

  runtimeFiles[HERMES_GATEWAYS_MANIFEST_PATH] = `${JSON.stringify({ profiles }, null, 2)}\n`
  runtimeFiles[`${WORKSPACE_DIR}/AGENTS.md`] = [
    '# Agents',
    '',
    ...agents.map((agent) => {
      const name = agent.identity?.name ?? agent.id
      const description = agent.identity?.description ?? agent.description
      return `- **${name}**${description ? ` - ${description}` : ''}`
    }),
    '',
  ].join('\n')

  const runtimeExtensions = mergeRuntimeExtensions(packages.map(extensionFromPackage))
  const configData: Record<string, string> = {
    'runtime-files.json': `${JSON.stringify(runtimeFiles, null, 2)}\n`,
    'workspace-files.json': `${JSON.stringify(
      Object.fromEntries(
        Object.entries(runtimeFiles).filter(
          ([path]) =>
            path.startsWith(`${WORKSPACE_DIR}/.agents/`) || path.startsWith(HERMES_PROFILES_DIR),
        ),
      ),
      null,
      2,
    )}\n`,
    'shadowob-runtime.json': `${JSON.stringify(
      {
        cli: 'shadowob',
        connector: 'shadowob-connector',
        transport: 'hermes',
        profiles,
        agents: runtimeAgents,
      },
      null,
      2,
    )}\n`,
  }
  if (hasRuntimeExtensions(runtimeExtensions)) {
    configData['runtime-extensions.json'] = `${JSON.stringify(runtimeExtensions, null, 2)}\n`
  }

  return {
    runtimeKind: 'hermes',
    configData,
    plainEnv: mergeStringMaps(
      'plain env',
      packages.map((pkg) => pkg.plainEnv),
    ),
    secretData: mergeStringMaps(
      'secret data',
      packages.map((pkg) => pkg.secretData),
    ),
    pluginResources: mergePluginResources(packages.map((pkg) => pkg.pluginResources)),
  }
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
  const runtimeEnvOmitKeys = collectPluginRuntimeEnvOmitKeys(agent, config, cwd, runtimeEnv)
  const runtimeExtensions = collectPluginRuntimeExtensions(agent, config, cwd, runtimeEnv)
  const runtimeAgent =
    runtime.runtimeKind === 'openclaw'
      ? agent
      : agentWithAdditionalSystemPrompt(
          agent,
          collectPluginBuildPrompts(agent, config, cwd, runtimeEnv),
        )

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
    agent: runtimeAgent,
    config,
    cwd,
    runtimeEnv,
    runtimeExtensions,
    runtimeContext,
  })

  if (runtimeArtifacts.provisionSecrets) {
    Object.assign(mergedEnv, runtimeArtifacts.provisionSecrets)
  }
  omitEnvKeys(mergedEnv, runtimeEnvOmitKeys)

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

export function buildExecutionUnitRuntimePackage(options: {
  unit: CloudExecutionUnit
  config: CloudConfig
  extraEnvByAgentId?: Record<string, Record<string, string>>
  cwd?: string
  runtimeContext?: DeploymentRuntimeContext
}): AgentRuntimePackage {
  const agentsById = new Map(
    (options.config.deployments?.agents ?? []).map((agent) => [agent.id, agent]),
  )
  const agents = options.unit.agentIds.map((agentId) => {
    const agent = agentsById.get(agentId)
    if (!agent)
      throw new Error(`Execution unit "${options.unit.id}" references unknown agent "${agentId}"`)
    return agent
  })

  if (agents.length === 0) {
    throw new Error(`Execution unit "${options.unit.id}" has no agents`)
  }
  if (agents.length === 1 || options.unit.packageMode === 'single-agent') {
    const agent = agents[0]!
    return buildAgentRuntimePackage({
      agent,
      config: options.config,
      extraEnv: options.extraEnvByAgentId?.[agent.id],
      cwd: options.cwd,
      runtimeContext: options.runtimeContext,
    })
  }

  const packages = agents.map((agent) =>
    buildAgentRuntimePackage({
      agent,
      config: options.config,
      extraEnv: options.extraEnvByAgentId?.[agent.id],
      cwd: options.cwd,
      runtimeContext: options.runtimeContext,
    }),
  )
  const runtimeKinds = new Set(packages.map((pkg) => pkg.runtimeKind))
  if (runtimeKinds.size !== 1) {
    throw new Error(`Execution unit "${options.unit.id}" mixes runtime package kinds`)
  }

  switch (options.unit.runtimeKind) {
    case 'openclaw':
      return buildSharedOpenClawPackage(agents, packages)
    case 'cc-connect':
      return buildSharedCcConnectPackage(agents, packages)
    case 'hermes':
      return buildSharedHermesPackage(agents, packages)
  }
}
