/**
 * OpenClaw API Client — Renderer Side
 *
 * Type-safe wrapper around the desktopAPI.openClaw preload bridge.
 * Types aligned with the real OpenClaw config schema.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type GatewayState =
  | 'offline'
  | 'installing'
  | 'starting'
  | 'bootstrapping'
  | 'running'
  | 'stopping'
  | 'error'

export interface GatewayStatus {
  state: GatewayState
  port: number | null
  pid: number | null
  uptime: number | null
  version: string | null
  error: string | null
  lastStartedAt: number | null
}

export interface GatewayLogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source: 'gateway' | 'openclaw' | 'system'
}

/** OpenClaw agent entry — matching the real AgentEntrySchema */
export interface AgentConfig {
  id: string
  name?: string
  default?: boolean
  workspace?: string
  agentDir?: string
  model?:
    | string
    | { primary?: string; fallbacks?: string[]; thinking?: string | Record<string, unknown> }
  skills?: string[]
  identity?: { name?: string; theme?: string; emoji?: string; avatar?: string }
  groupChat?: Record<string, unknown>
  subagents?: Record<string, unknown>
  sandbox?: Record<string, unknown>
  params?: Record<string, unknown>
  tools?: Record<string, unknown>
  runtime?: Record<string, unknown>
  memorySearch?: Record<string, unknown>
  humanDelay?: Record<string, unknown>
  heartbeat?: Record<string, unknown>
}

/** Valid API format identifiers from OpenClaw ModelApiSchema */
export type ModelApi =
  | 'openai-completions'
  | 'openai-responses'
  | 'openai-codex-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'github-copilot'
  | 'bedrock-converse-stream'
  | 'ollama'

/** Model provider entry nested under models.providers.<id> */
export interface ModelProviderEntry {
  baseUrl: string
  apiKey?: string
  auth?: 'api-key' | 'aws-sdk' | 'oauth' | 'token'
  api?: ModelApi
  models: ModelDefinition[]
  headers?: Record<string, string>
}

export interface ModelDefinition {
  id: string
  name?: string
  api?: string
  reasoning?: boolean
  input?: Array<'text' | 'image'>
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
  contextWindow?: number
  maxTokens?: number
  headers?: Record<string, string>
  compat?: Record<string, unknown>
}

export interface ChannelMeta {
  id: string
  label: string
  icon: string
  description: string
  configFields: ChannelConfigField[]
  category: 'messaging' | 'social' | 'enterprise' | 'custom'
}

export interface ChannelConfigField {
  key: string
  label: string
  type: 'text' | 'password' | 'url' | 'number' | 'boolean' | 'select' | 'textarea'
  placeholder?: string
  required?: boolean
  description?: string
  defaultValue?: string | number | boolean
  options?: { label: string; value: string }[]
}

export interface SkillManifest {
  name: string
  displayName: string
  description: string
  version: string
  author: string
  icon?: string
  tags?: string[]
  source: 'local' | 'hub' | 'preinstalled'
  enabled: boolean
  configSchema?: Record<string, unknown>
  env?: Record<string, string>
  apiKey?: string
  path?: string
}

export interface SkillHubEntry {
  slug: string
  name: string
  displayName: string
  description: string
  author: string
  version: string
  icon?: string
  tags?: string[]
  downloads?: number
  rating?: number
  repository?: string
  readme?: string
  installed?: boolean
}

export interface SkillHubSearchResult {
  skills: SkillHubEntry[]
  total: number
  page: number
  pageSize: number
}

export interface SkillHubRegistry {
  id: string
  name: string
  url: string
  enabled: boolean
}

export type BootstrapFileName =
  | 'AGENTS.md'
  | 'SOUL.md'
  | 'IDENTITY.md'
  | 'TOOLS.md'
  | 'USER.md'
  | 'HEARTBEAT.md'
  | 'BOOT.md'

export interface BootstrapFileInfo {
  fileName: BootstrapFileName
  exists: boolean
}

export interface BuddyConnection {
  id: string
  label: string
  serverUrl: string
  apiToken?: string
  remoteAgentId?: string
  agentId: string
  autoConnect?: boolean
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
  lastHeartbeat?: number | null
  connectedAt?: number | null
  error?: string | null
}

export interface CronConfig {
  enabled?: boolean
  store?: string
  maxConcurrentRuns?: number
  retry?: Record<string, unknown>
  webhook?: string
  sessionRetention?: string | false
}

export type CronSchedule =
  | { kind: 'at'; at: string }
  | { kind: 'every'; everyMs: number }
  | { kind: 'cron'; expr: string; tz?: string }

export interface CronTask {
  id: string
  name: string
  description?: string
  enabled: boolean
  agentId?: string
  schedule: CronSchedule
  payload: {
    kind: 'agentTurn' | 'systemEvent'
    message?: string
    text?: string
  }
  delivery?: {
    mode: 'none' | 'announce' | 'webhook'
    channel?: string
  }
  deleteAfterRun?: boolean
  state?: {
    lastRunAtMs?: number
    nextRunAtMs?: number
    lastRunStatus?: 'success' | 'failed' | 'running'
    consecutiveErrors?: number
    lastError?: string
  }
  createdAtMs?: number
  updatedAtMs?: number
}

export interface SkillsConfig {
  allowBundled?: string[]
  entries?: Record<
    string,
    {
      enabled?: boolean
      apiKey?: string
      env?: Record<string, string>
      config?: Record<string, unknown>
    }
  >
  load?: Record<string, unknown>
  install?: Record<string, unknown>
  limits?: Record<string, unknown>
}

export interface OpenClawConfig {
  agents: {
    list: AgentConfig[]
    defaults: Record<string, unknown>
  }
  channels: Record<string, unknown>
  plugins: Record<string, unknown>
  skills: SkillsConfig
  models: {
    mode?: 'merge' | 'replace'
    providers?: Record<string, ModelProviderEntry>
  }
  cron: CronConfig
  [key: string]: unknown
}

// ─── API Client ─────────────────────────────────────────────────────────────

interface OpenClawBridge {
  getGatewayStatus: () => Promise<GatewayStatus>
  startGateway: () => Promise<boolean>
  stopGateway: () => Promise<void>
  restartGateway: () => Promise<boolean>
  installOpenClaw: () => Promise<boolean>
  openConsole: () => Promise<boolean>
  pickDirectory: (defaultPath?: string) => Promise<string | null>
  onGatewayStatusChanged: (callback: (status: GatewayStatus) => void) => () => void
  onGatewayLog: (callback: (entry: GatewayLogEntry) => void) => () => void
  getRecentLogs: (limit?: number) => Promise<GatewayLogEntry[]>
  getConfig: () => Promise<OpenClawConfig>
  saveConfig: (config: OpenClawConfig) => Promise<void>
  getDesktopSettings: () => Promise<{ autoStart: boolean; autoRestart: boolean }>
  saveDesktopSettings: (settings: {
    autoStart?: boolean
    autoRestart?: boolean
  }) => Promise<{ success: boolean }>
  listAgents: () => Promise<AgentConfig[]>
  getAgent: (id: string) => Promise<AgentConfig | null>
  createAgent: (agent: AgentConfig) => Promise<{ success: boolean }>
  updateAgent: (id: string, updates: Partial<AgentConfig>) => Promise<{ success: boolean }>
  deleteAgent: (id: string) => Promise<{ success: boolean }>
  listBootstrapFiles: (agentId: string) => Promise<BootstrapFileInfo[]>
  readBootstrapFile: (agentId: string, fileName: BootstrapFileName) => Promise<string | null>
  writeBootstrapFile: (
    agentId: string,
    fileName: BootstrapFileName,
    content: string,
  ) => Promise<{ success: boolean }>
  getChannelRegistry: () => Promise<ChannelMeta[]>
  getChannelMeta: (channelId: string) => Promise<ChannelMeta | null>
  getChannelConfigs: () => Promise<Record<string, unknown>>
  getChannelConfig: (channelType: string) => Promise<unknown>
  saveChannelConfig: (channelType: string, config: unknown) => Promise<{ success: boolean }>
  deleteChannelConfig: (channelType: string) => Promise<{ success: boolean }>
  listModels: () => Promise<Record<string, ModelProviderEntry>>
  saveModel: (id: string, provider: ModelProviderEntry) => Promise<{ success: boolean }>
  deleteModel: (id: string) => Promise<{ success: boolean }>
  getDefaultModel: () => Promise<string | null>
  setDefaultModel: (modelKey: string) => Promise<{ success: boolean }>
  getCronConfig: () => Promise<CronConfig>
  updateCronConfig: (updates: Partial<CronConfig>) => Promise<{ success: boolean }>
  listCronTasks: () => Promise<CronTask[]>
  saveCronTask: (task: Partial<CronTask>) => Promise<CronTask>
  deleteCronTask: (id: string) => Promise<{ success: boolean }>
  listSkills: () => Promise<SkillManifest[]>
  getSkillsConfig: () => Promise<SkillsConfig>
  updateSkillConfig: (
    skillName: string,
    updates: { enabled?: boolean; apiKey?: string; env?: Record<string, string> },
  ) => Promise<{ success: boolean }>
  deleteSkillEntry: (name: string) => Promise<{ success: boolean }>
  getSkillReadme: (slug: string) => Promise<string | null>
  searchSkills: (
    query: string,
    options?: { registryId?: string; page?: number; pageSize?: number; tags?: string[] },
  ) => Promise<SkillHubSearchResult>
  installSkill: (slug: string, registryId?: string) => Promise<{ success: boolean; error?: string }>
  uninstallSkill: (slug: string) => Promise<{ success: boolean; error?: string }>
  getRegistries: () => Promise<SkillHubRegistry[]>
  updateRegistries: (registries: SkillHubRegistry[]) => Promise<{ success: boolean }>
  getSkillLeaderboard: (limit?: number) => Promise<SkillHubEntry[]>
  listBuddyConnections: () => Promise<BuddyConnection[]>
  addBuddyConnection: (connection: Omit<BuddyConnection, 'status'>) => Promise<BuddyConnection>
  removeBuddyConnection: (id: string) => Promise<{ success: boolean }>
  updateBuddyConnection: (id: string, updates: Partial<BuddyConnection>) => Promise<void>
  connectBuddy: (id: string) => Promise<boolean>
  disconnectBuddy: (id: string) => Promise<{ success: boolean }>
  connectAllBuddies: () => Promise<{ success: boolean }>
  probeBuddyConnections: () => Promise<
    Array<{
      id: string
      label: string
      status: BuddyConnection['status']
      agentId: string
      serverUrl: string
      error?: string | null
      connectedAt?: number | null
    }>
  >
  onBuddyStatusChanged: (callback: (connections: BuddyConnection[]) => void) => () => void
  execCli: (args: string[]) => Promise<{ code: number | null; stdout: string; stderr: string }>
}

function getOpenClawAPI(): OpenClawBridge | null {
  if ('desktopAPI' in window) {
    const api = (window as Record<string, unknown>).desktopAPI as { openClaw?: OpenClawBridge }
    return api.openClaw ?? null
  }
  return null
}

// Export as singleton with lazy initialization
export const openClawApi = {
  get isAvailable(): boolean {
    return getOpenClawAPI() !== null
  },

  // Gateway
  getGatewayStatus: () => getOpenClawAPI()!.getGatewayStatus(),
  startGateway: () => getOpenClawAPI()!.startGateway(),
  stopGateway: () => getOpenClawAPI()!.stopGateway(),
  restartGateway: () => getOpenClawAPI()!.restartGateway(),
  installOpenClaw: () => getOpenClawAPI()!.installOpenClaw(),
  openConsole: () => getOpenClawAPI()!.openConsole(),
  pickDirectory: (defaultPath?: string) => getOpenClawAPI()!.pickDirectory(defaultPath),
  onGatewayStatusChanged: (cb: (status: GatewayStatus) => void) =>
    getOpenClawAPI()!.onGatewayStatusChanged(cb),
  onGatewayLog: (cb: (entry: GatewayLogEntry) => void) => getOpenClawAPI()!.onGatewayLog(cb),
  getRecentLogs: (limit?: number) => getOpenClawAPI()!.getRecentLogs(limit),

  // Config
  getConfig: () => getOpenClawAPI()!.getConfig(),
  saveConfig: (config: OpenClawConfig) => getOpenClawAPI()!.saveConfig(config),

  // Desktop Settings
  getDesktopSettings: () => getOpenClawAPI()!.getDesktopSettings(),
  saveDesktopSettings: (settings: { autoStart?: boolean; autoRestart?: boolean }) =>
    getOpenClawAPI()!.saveDesktopSettings(settings),

  // Agents
  listAgents: () => getOpenClawAPI()!.listAgents(),
  getAgent: (id: string) => getOpenClawAPI()!.getAgent(id),
  createAgent: (agent: AgentConfig) => getOpenClawAPI()!.createAgent(agent),
  updateAgent: (id: string, updates: Partial<AgentConfig>) =>
    getOpenClawAPI()!.updateAgent(id, updates),
  deleteAgent: (id: string) => getOpenClawAPI()!.deleteAgent(id),

  // Agent Bootstrap Files
  listBootstrapFiles: (agentId: string) => getOpenClawAPI()!.listBootstrapFiles(agentId),
  readBootstrapFile: (agentId: string, fileName: BootstrapFileName) =>
    getOpenClawAPI()!.readBootstrapFile(agentId, fileName),
  writeBootstrapFile: (agentId: string, fileName: BootstrapFileName, content: string) =>
    getOpenClawAPI()!.writeBootstrapFile(agentId, fileName, content),

  // Channels
  getChannelRegistry: () => getOpenClawAPI()!.getChannelRegistry(),
  getChannelMeta: (id: string) => getOpenClawAPI()!.getChannelMeta(id),
  getChannelConfigs: () => getOpenClawAPI()!.getChannelConfigs(),
  getChannelConfig: (type: string) => getOpenClawAPI()!.getChannelConfig(type),
  saveChannelConfig: (type: string, config: unknown) =>
    getOpenClawAPI()!.saveChannelConfig(type, config),
  deleteChannelConfig: (type: string) => getOpenClawAPI()!.deleteChannelConfig(type),

  // Models
  listModels: () => getOpenClawAPI()!.listModels(),
  saveModel: (id: string, provider: ModelProviderEntry) =>
    getOpenClawAPI()!.saveModel(id, provider),
  deleteModel: (id: string) => getOpenClawAPI()!.deleteModel(id),
  getDefaultModel: () => getOpenClawAPI()!.getDefaultModel(),
  setDefaultModel: (modelKey: string) => getOpenClawAPI()!.setDefaultModel(modelKey),

  // Cron
  getCronConfig: () => getOpenClawAPI()!.getCronConfig(),
  updateCronConfig: (updates: Partial<CronConfig>) => getOpenClawAPI()!.updateCronConfig(updates),
  listCronTasks: () => getOpenClawAPI()!.listCronTasks(),
  saveCronTask: (task: Partial<CronTask>) => getOpenClawAPI()!.saveCronTask(task),
  deleteCronTask: (id: string) => getOpenClawAPI()!.deleteCronTask(id),

  // Skills
  listSkills: () => getOpenClawAPI()!.listSkills(),
  getSkillsConfig: () => getOpenClawAPI()!.getSkillsConfig(),
  updateSkillConfig: (
    name: string,
    updates: { enabled?: boolean; apiKey?: string; env?: Record<string, string> },
  ) => getOpenClawAPI()!.updateSkillConfig(name, updates),
  deleteSkillEntry: (name: string) => getOpenClawAPI()!.deleteSkillEntry(name),
  getSkillReadme: (slug: string) => getOpenClawAPI()!.getSkillReadme(slug),

  // SkillHub
  searchSkills: (
    query: string,
    options?: { registryId?: string; page?: number; pageSize?: number; tags?: string[] },
  ) => getOpenClawAPI()!.searchSkills(query, options),
  installSkill: (slug: string, registryId?: string) =>
    getOpenClawAPI()!.installSkill(slug, registryId),
  uninstallSkill: (slug: string) => getOpenClawAPI()!.uninstallSkill(slug),
  getRegistries: () => getOpenClawAPI()!.getRegistries(),
  updateRegistries: (registries: SkillHubRegistry[]) =>
    getOpenClawAPI()!.updateRegistries(registries),
  getSkillLeaderboard: (limit?: number) => getOpenClawAPI()!.getSkillLeaderboard(limit),

  // Buddy Connections
  listBuddyConnections: () => getOpenClawAPI()!.listBuddyConnections(),
  addBuddyConnection: (conn: Omit<BuddyConnection, 'status'>) =>
    getOpenClawAPI()!.addBuddyConnection(conn),
  removeBuddyConnection: (id: string) => getOpenClawAPI()!.removeBuddyConnection(id),
  updateBuddyConnection: (id: string, updates: Partial<BuddyConnection>) =>
    getOpenClawAPI()!.updateBuddyConnection(id, updates),
  connectBuddy: (id: string) => getOpenClawAPI()!.connectBuddy(id),
  disconnectBuddy: (id: string) => getOpenClawAPI()!.disconnectBuddy(id),
  connectAllBuddies: () => getOpenClawAPI()!.connectAllBuddies(),
  probeBuddyConnections: () => getOpenClawAPI()!.probeBuddyConnections(),
  onBuddyStatusChanged: (cb: (connections: BuddyConnection[]) => void) =>
    getOpenClawAPI()!.onBuddyStatusChanged(cb),

  // Debug CLI
  execCli: (args: string[]) => getOpenClawAPI()!.execCli(args),
}
