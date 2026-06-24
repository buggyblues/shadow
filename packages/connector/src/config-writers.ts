import { parse as parseDotenv } from 'dotenv'
import type { TomlTable, TomlValue } from 'smol-toml'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { BUDDY_COLLABORATION_SYSTEM_PROMPT } from './buddy-collaboration-guidance.js'
import {
  type ConnectorModelProviderInput,
  type ConnectorModelProvider as ConnectorModelProviderValues,
  ccConnectModelRef,
  connectorModelProviderEndpoint,
  normalizeConnectorModelProvider,
} from './model-provider.js'

export interface ShadowConfigValues {
  token: string
  serverUrl: string
  projectName?: string
  buddyId?: string
  buddyName?: string
  buddyDescription?: string
  agentId?: string
  modelProvider?: ConnectorModelProviderValues
}

export interface CcConnectConfigValues extends ShadowConfigValues {
  projectName: string
  workDir: string
  agentType: string
}

export type ConnectorModelProviderInputValues = ConnectorModelProviderInput

const SHADOWOB_ENV_VALUES = {
  SHADOWOB_ALLOW_ALL_USERS: 'true',
  SHADOWOB_HEARTBEAT_INTERVAL_SECONDS: '30',
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {}
}

function uniqueStrings(values: unknown[], required: string): string[] {
  return [
    ...new Set([...values.filter((value): value is string => typeof value === 'string'), required]),
  ]
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`
}

function quoteEnv(value: string): string {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : JSON.stringify(value)
}

function normalizedOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeJsonRoot(existing: string, label: string): Record<string, unknown> {
  if (!existing.trim()) return {}
  const parsed = JSON.parse(existing) as unknown
  if (!isRecord(parsed)) {
    throw new Error(`${label} config must be a JSON object`)
  }
  return { ...parsed }
}

function parseYamlRoot(existing: string, label: string): Record<string, unknown> {
  if (!existing.trim()) return {}
  const parsed = parseYaml(existing) as unknown
  if (parsed == null) return {}
  if (!isRecord(parsed)) {
    throw new Error(`${label} config must be a YAML object`)
  }
  return { ...parsed }
}

function parseTomlRoot(existing: string, label: string): TomlTable {
  if (!existing.trim()) return {}
  const parsed = parseToml(existing) as unknown
  if (!isRecord(parsed)) {
    throw new Error(`${label} config must be a TOML table`)
  }
  return parsed as TomlTable
}

export function mergeEnvContent(existing: string, values: ShadowConfigValues): string {
  parseDotenv(existing)

  const modelProvider = normalizeConnectorModelProvider(values.modelProvider)
  const updates: Record<string, string> = {
    SHADOWOB_SERVER_URL: values.serverUrl,
    SHADOWOB_TOKEN: values.token,
    ...SHADOWOB_ENV_VALUES,
  }
  if (modelProvider) {
    const openAI = connectorModelProviderEndpoint(modelProvider, 'openai')
    const anthropic = connectorModelProviderEndpoint(modelProvider, 'anthropic')
    if (openAI) {
      updates.OPENAI_COMPATIBLE_BASE_URL = openAI.baseUrl
      updates.OPENAI_COMPATIBLE_API_KEY = openAI.apiKey
      updates.OPENAI_COMPATIBLE_MODEL_ID = modelProvider.model
    }
    if (anthropic) {
      updates.ANTHROPIC_COMPATIBLE_BASE_URL = anthropic.baseUrl
      updates.ANTHROPIC_COMPATIBLE_API_KEY = anthropic.apiKey
      updates.ANTHROPIC_COMPATIBLE_MODEL_ID = modelProvider.model
    }
    updates.SHADOWOB_MODEL_PROVIDER_ID = modelProvider.id ?? 'shadow-official'
  }
  const agentId = normalizedOptionalString(values.agentId)
  if (agentId) updates.SHADOWOB_AGENT_ID = agentId
  const seen = new Set<string>()
  const lines = existing.length > 0 ? existing.split(/\r?\n/) : []
  const next: string[] = []

  for (const line of lines) {
    const match = line.match(/^(\s*(?:export\s+)?)((?:[A-Za-z_][A-Za-z0-9_]*))\s*=/)
    const key = match?.[2]
    if (!key || !(key in updates)) {
      next.push(line)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    next.push(`${match[1] ?? ''}${key}=${quoteEnv(updates[key] ?? '')}`)
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${quoteEnv(value)}`)
  }

  while (next.length > 0 && next[next.length - 1] === '') next.pop()
  return ensureTrailingNewline(next.join('\n'))
}

export function mergeOpenClawConfigContent(existing: string, values: ShadowConfigValues): string {
  const root = normalizeJsonRoot(existing, 'OpenClaw')
  const modelProvider = normalizeConnectorModelProvider(values.modelProvider)
  const accountId = normalizedOptionalString(values.projectName)
  const channels = asRecord(root.channels)
  const shadow = asRecord(channels.shadowob)

  if (accountId) {
    const accounts = asRecord(shadow.accounts)
    const account = asRecord(accounts[accountId])
    const nextAccount: Record<string, unknown> = {
      ...account,
      enabled: true,
      token: values.token,
      serverUrl: values.serverUrl,
    }
    const buddyId = normalizedOptionalString(values.buddyId)
    const buddyName = normalizedOptionalString(values.buddyName)
    const buddyDescription = normalizedOptionalString(values.buddyDescription)
    const agentId = normalizedOptionalString(values.agentId)
    if (buddyId) nextAccount.buddyId = buddyId
    if (buddyName) nextAccount.buddyName = buddyName
    if (buddyDescription) nextAccount.buddyDescription = buddyDescription
    if (agentId) nextAccount.agentId = agentId
    accounts[accountId] = nextAccount

    channels.shadowob = {
      ...shadow,
      enabled: shadow.enabled ?? true,
      accounts,
    }
  } else {
    channels.shadowob = {
      ...shadow,
      token: values.token,
      serverUrl: values.serverUrl,
    }
  }
  delete channels['openclaw-shadowob']
  root.channels = channels

  const plugins = asRecord(root.plugins)
  plugins.enabled = plugins.enabled ?? true
  plugins.allow = uniqueStrings(
    Array.isArray(plugins.allow) ? plugins.allow : [],
    'openclaw-shadowob',
  )
  const entries = asRecord(plugins.entries)
  entries['openclaw-shadowob'] = {
    ...asRecord(entries['openclaw-shadowob']),
    enabled: true,
  }
  plugins.entries = entries
  root.plugins = plugins

  if (modelProvider) {
    const endpoint = connectorModelProviderEndpoint(modelProvider, 'openai')
    if (!endpoint) return ensureTrailingNewline(JSON.stringify(root, null, 2))
    const models = asRecord(root.models)
    const providers = asRecord(models.providers)
    const providerId = modelProvider.id ?? 'shadow-official'
    providers[providerId] = {
      ...asRecord(providers[providerId]),
      api: 'openai-completions',
      apiKey: '${env:OPENAI_COMPATIBLE_API_KEY}',
      baseUrl: endpoint.baseUrl,
      request: { allowPrivateNetwork: true },
      models: [{ id: modelProvider.model, name: modelProvider.model }],
    }
    models.mode = models.mode ?? 'merge'
    models.pricing = { ...asRecord(models.pricing), enabled: false }
    models.providers = providers
    root.models = models
  }

  return ensureTrailingNewline(JSON.stringify(root, null, 2))
}

export function removeOpenClawAccountConfigContent(existing: string, projectName: string): string {
  const accountId = normalizedOptionalString(projectName)
  if (!accountId) return ensureTrailingNewline(existing)
  const root = normalizeJsonRoot(existing, 'OpenClaw')
  const channels = asRecord(root.channels)
  const shadow = asRecord(channels.shadowob)
  const accounts = asRecord(shadow.accounts)
  delete accounts[accountId]
  shadow.accounts = accounts
  delete channels['openclaw-shadowob']
  channels.shadowob = shadow
  root.channels = channels
  return ensureTrailingNewline(JSON.stringify(root, null, 2))
}

export function mergeHermesConfigContent(existing: string, values: ShadowConfigValues): string {
  const root = parseYamlRoot(existing, 'Hermes')
  const modelProvider = normalizeConnectorModelProvider(values.modelProvider)
  const agentId = normalizedOptionalString(values.agentId)

  const plugins = asRecord(root.plugins)
  plugins.enabled = uniqueStrings(Array.isArray(plugins.enabled) ? plugins.enabled : [], 'shadowob')
  root.plugins = plugins

  const platforms = asRecord(root.platforms)
  const shadowob = asRecord(platforms.shadowob)
  const extra = asRecord(shadowob.extra)
  platforms.shadowob = {
    ...shadowob,
    enabled: true,
    token: values.token,
    extra: {
      mention_only: false,
      rest_only: false,
      catchup_minutes: 0,
      download_media: true,
      slash_commands: [],
      ...extra,
      base_url: values.serverUrl,
      ...(agentId ? { agent_id: agentId } : {}),
    },
  }
  root.platforms = platforms

  if (modelProvider) {
    const endpoint = connectorModelProviderEndpoint(modelProvider, 'openai')
    if (!endpoint) return ensureTrailingNewline(stringifyYaml(root))
    const providerId = modelProvider.id ?? 'shadow-official'
    const model = asRecord(root.model)
    root.model = {
      ...model,
      default: model.model ?? model.default ?? modelProvider.model,
      provider: model.provider ?? providerId,
    }

    const customProviders = Array.isArray(root.custom_providers)
      ? root.custom_providers.filter(isRecord).map((item) => ({ ...item }))
      : []
    let customProvider = customProviders.find((entry) => entry.name === providerId)
    if (!customProvider) {
      customProvider = {}
      customProviders.push(customProvider)
    }
    customProvider.name = providerId
    customProvider.base_url = endpoint.baseUrl
    customProvider.key_env = 'OPENAI_COMPATIBLE_API_KEY'
    customProvider.model = modelProvider.model
    delete customProvider.api_key
    root.custom_providers = customProviders
  }

  return ensureTrailingNewline(stringifyYaml(root))
}

function asTomlTable(value: TomlValue | undefined): TomlTable {
  return isRecord(value) && !Array.isArray(value) ? ({ ...value } as TomlTable) : {}
}

function tomlArray(value: TomlValue | undefined): TomlTable[] {
  if (!Array.isArray(value)) return []
  const tables: TomlTable[] = []
  for (const item of value) {
    if (isRecord(item)) tables.push({ ...item } as TomlTable)
  }
  return tables
}

export function mergeCcConnectConfigContent(
  existing: string,
  values: CcConnectConfigValues,
): string {
  const root = parseTomlRoot(existing, 'cc-connect')
  const projects = tomlArray(root.projects)
  let project = projects.find((item) => item.name === values.projectName)

  if (!project) {
    project = {}
    projects.push(project)
  }

  project.name = values.projectName
  delete project.work_dir
  delete project.agent_type

  const agent = asTomlTable(project.agent)
  const agentOptions = asTomlTable(agent.options)
  agent.type = values.agentType
  agent.options = {
    ...agentOptions,
    system_prompt:
      typeof agentOptions.system_prompt === 'string' && agentOptions.system_prompt.trim()
        ? agentOptions.system_prompt
        : BUDDY_COLLABORATION_SYSTEM_PROMPT,
    work_dir: values.workDir,
  }
  const modelProvider = normalizeConnectorModelProvider(values.modelProvider)
  const providerEndpoint = connectorModelProviderEndpoint(
    modelProvider,
    values.agentType === 'claudecode' ? 'anthropic' : 'openai',
  )
  if (modelProvider && providerEndpoint) {
    const providerId = modelProvider.id ?? 'shadow-official'
    const providerModel = ccConnectModelRef(values.agentType, providerId, modelProvider.model)
    agent.options = {
      ...asTomlTable(agent.options),
      provider: providerId,
      model: providerModel,
    }
    const providers = tomlArray(agent.providers)
    let provider = providers.find((item) => item.name === providerId)
    if (!provider) {
      provider = {}
      providers.push(provider)
    }
    provider.name = providerId
    provider.api_key = providerEndpoint.apiKey
    provider.base_url = providerEndpoint.baseUrl
    provider.model = providerModel
    provider.models = [{ model: providerModel }]
    agent.providers = providers
  } else {
    const nextOptions = asTomlTable(agent.options)
    if (nextOptions.provider === 'shadow-official') {
      delete nextOptions.provider
      delete nextOptions.model
    }
    agent.options = nextOptions
    const providers = tomlArray(agent.providers).filter((item) => item.name !== 'shadow-official')
    if (providers.length > 0) {
      agent.providers = providers
    } else {
      delete agent.providers
    }
  }
  project.agent = agent
  const display = asTomlTable(project.display)
  project.display = {
    ...display,
    mode: 'quiet',
    thinking_messages: false,
    tool_messages: false,
  }

  const platforms = tomlArray(project.platforms)
  let shadowPlatform = platforms.find((item) => item.type === 'shadowob')
  if (!shadowPlatform) {
    shadowPlatform = {}
    platforms.push(shadowPlatform)
  }

  const options = asTomlTable(shadowPlatform.options)
  shadowPlatform.type = 'shadowob'
  shadowPlatform.options = {
    allow_from: '*',
    listen_dms: true,
    share_session_in_channel: false,
    progress_style: 'compact',
    ...options,
    token: values.token,
    server_url: values.serverUrl,
  }
  project.platforms = platforms
  root.projects = projects

  return ensureTrailingNewline(stringifyToml(root))
}

export function removeCcConnectProjectConfigContent(existing: string, projectName: string): string {
  const normalizedProjectName = normalizedOptionalString(projectName)
  if (!normalizedProjectName) return ensureTrailingNewline(existing)
  const root = parseTomlRoot(existing, 'cc-connect')
  root.projects = tomlArray(root.projects).filter(
    (project) => project.name !== normalizedProjectName,
  )
  return ensureTrailingNewline(stringifyToml(root))
}

export function removeShadowOfficialCcConnectProviders(existing: string): string {
  const root = parseTomlRoot(existing, 'cc-connect')
  let changed = false
  const projects = tomlArray(root.projects).map((project) => {
    const agent = asTomlTable(project.agent)
    const options = asTomlTable(agent.options)
    if (options.provider === 'shadow-official') {
      delete options.provider
      delete options.model
      changed = true
    }
    agent.options = options
    const providers = tomlArray(agent.providers).filter((provider) => {
      const keep = provider.name !== 'shadow-official'
      if (!keep) changed = true
      return keep
    })
    if (providers.length > 0) {
      agent.providers = providers
    } else if (agent.providers !== undefined) {
      delete agent.providers
      changed = true
    }
    project.agent = agent
    return project
  })
  if (!changed) return ensureTrailingNewline(existing)
  root.projects = projects
  return ensureTrailingNewline(stringifyToml(root))
}
