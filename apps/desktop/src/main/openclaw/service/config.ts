/**
 * OpenClaw Config Service
 *
 * Unified configuration management for the built-in OpenClaw instance.
 * All reads/writes go through ~/.shadowob/openclaw.json exclusively.
 *
 * Responsibilities:
 * - Read/write openclaw.json with in-memory caching
 * - File watcher for external CLI edits (SIGHUP, manual edits)
 * - Preserve unknown fields (OpenClaw uses zod strict schemas)
 * - Agent, Model, Channel, Cron, Skill sub-config CRUD
 * - Bootstrap file management per agent
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentConfig, ModelProviderEntry, OpenClawConfig, SkillManifest } from '../types'
import type { OpenClawPaths } from './paths'

export type BootstrapFileName =
  | 'AGENTS.md'
  | 'SOUL.md'
  | 'IDENTITY.md'
  | 'TOOLS.md'
  | 'USER.md'
  | 'HEARTBEAT.md'
  | 'BOOT.md'
const VALID_BOOTSTRAP_FILES = new Set<string>([
  'AGENTS.md',
  'SOUL.md',
  'IDENTITY.md',
  'TOOLS.md',
  'USER.md',
  'HEARTBEAT.md',
  'BOOT.md',
])

export class ConfigService {
  private cachedConfig: OpenClawConfig | null = null
  private configWatcher: ReturnType<typeof watch> | null = null
  private changeCallbacks = new Set<(config: OpenClawConfig) => void>()

  constructor(private paths: OpenClawPaths) {}

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  startWatcher(): void {
    if (this.configWatcher) return
    this.paths.ensureDirs()
    try {
      this.configWatcher = watch(this.paths.configFile, { persistent: false }, () => {
        this.cachedConfig = null
        const config = this.read()
        for (const cb of this.changeCallbacks) cb(config)
      })
    } catch {
      // File may not exist yet
    }
  }

  stopWatcher(): void {
    this.configWatcher?.close()
    this.configWatcher = null
  }

  onChange(callback: (config: OpenClawConfig) => void): () => void {
    this.changeCallbacks.add(callback)
    return () => this.changeCallbacks.delete(callback)
  }

  // ─── Config Read/Write ────────────────────────────────────────────────────

  read(): OpenClawConfig {
    if (this.cachedConfig) return this.cachedConfig

    this.paths.ensureDirs()

    if (!existsSync(this.paths.configFile)) {
      const cfg = this.defaultConfig()
      this.write(cfg)
      return cfg
    }

    try {
      const raw = readFileSync(this.paths.configFile, 'utf-8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const defaults = this.defaultConfig()

      const cfg: OpenClawConfig = {
        ...parsed,
        agents: {
          ...defaults.agents,
          ...(parsed.agents && typeof parsed.agents === 'object'
            ? (parsed.agents as Record<string, unknown>)
            : {}),
          list: Array.isArray((parsed.agents as Record<string, unknown>)?.list)
            ? ((parsed.agents as Record<string, unknown>).list as AgentConfig[])
            : defaults.agents.list,
        },
        plugins: {
          ...defaults.plugins,
          ...(parsed.plugins && typeof parsed.plugins === 'object'
            ? (parsed.plugins as Record<string, unknown>)
            : {}),
        },
        skills: {
          ...defaults.skills,
          ...(parsed.skills && typeof parsed.skills === 'object'
            ? (parsed.skills as Record<string, unknown>)
            : {}),
        },
        models:
          parsed.models && typeof parsed.models === 'object' && !Array.isArray(parsed.models)
            ? (parsed.models as OpenClawConfig['models'])
            : defaults.models,
        channels:
          parsed.channels && typeof parsed.channels === 'object' && !Array.isArray(parsed.channels)
            ? (parsed.channels as OpenClawConfig['channels'])
            : defaults.channels,
        cron:
          parsed.cron && typeof parsed.cron === 'object' && !Array.isArray(parsed.cron)
            ? (parsed.cron as OpenClawConfig['cron'])
            : defaults.cron,
      }

      // ── Config migration: fix keys that OpenClaw's strict schema rejects ──
      const migrated = this.migrateConfig(cfg, defaults)

      this.cachedConfig = migrated
      return migrated
    } catch {
      const cfg = this.defaultConfig()
      this.cachedConfig = cfg
      return cfg
    }
  }

  write(config: OpenClawConfig): void {
    this.paths.ensureDirs()
    writeFileSync(this.paths.configFile, JSON.stringify(config, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    })
    try {
      chmodSync(this.paths.configFile, 0o600)
    } catch {
      /* best effort */
    }
    this.cachedConfig = config
    for (const cb of this.changeCallbacks) cb(config)
  }

  // ─── Agents ───────────────────────────────────────────────────────────────

  getAgents(): AgentConfig[] {
    return this.read().agents.list
  }

  getAgent(id: string): AgentConfig | null {
    return this.read().agents.list.find((a) => a.id === id) ?? null
  }

  createAgent(agent: AgentConfig): void {
    const cfg = this.read()
    if (cfg.agents.list.some((a) => a.id === agent.id)) {
      throw new Error(`Agent '${agent.id}' already exists`)
    }
    // Auto-set workspace for non-main agents so each agent has isolated files
    if (agent.id !== 'main' && !agent.workspace) {
      agent.workspace = join(this.paths.workspaceDir, agent.id)
    }
    cfg.agents.list.push(agent)
    this.write(cfg)
  }

  updateAgent(id: string, updates: Partial<AgentConfig>): void {
    const cfg = this.read()
    const idx = cfg.agents.list.findIndex((a) => a.id === id)
    if (idx === -1) throw new Error(`Agent '${id}' not found`)
    cfg.agents.list[idx] = { ...cfg.agents.list[idx], ...updates, id }
    this.write(cfg)
  }

  deleteAgent(id: string): void {
    const cfg = this.read()
    cfg.agents.list = cfg.agents.list.filter((a) => a.id !== id)
    this.write(cfg)
  }

  // ─── Model Providers ─────────────────────────────────────────────────────

  getModelProviders(): Record<string, ModelProviderEntry> {
    return this.read().models.providers ?? {}
  }

  saveModelProvider(id: string, provider: ModelProviderEntry): void {
    const cfg = this.read()
    if (!cfg.models.providers) cfg.models.providers = {}
    cfg.models.providers[id] = provider
    this.write(cfg)
  }

  deleteModelProvider(id: string): void {
    const cfg = this.read()
    if (cfg.models.providers) {
      delete cfg.models.providers[id]
    }
    this.write(cfg)
  }

  /** Get the default model as "providerId/modelId" */
  getDefaultModel(): string | null {
    const cfg = this.read()
    const model = (cfg.agents as Record<string, unknown>)?.defaults as
      | Record<string, unknown>
      | undefined
    const modelEntry = model?.model
    if (typeof modelEntry === 'string') return modelEntry
    if (modelEntry && typeof modelEntry === 'object') {
      return (modelEntry as Record<string, unknown>).primary as string | null
    }
    return null
  }

  /** Set the default model as "providerId/modelId" */
  setDefaultModel(modelKey: string): void {
    const cfg = this.read()
    if (!cfg.agents) (cfg as Record<string, unknown>).agents = { list: [], defaults: {} }
    const agents = cfg.agents as Record<string, unknown>
    if (!agents.defaults) agents.defaults = {}
    const defaults = agents.defaults as Record<string, unknown>
    const existing = defaults.model
    if (existing && typeof existing === 'object') {
      ;(existing as Record<string, unknown>).primary = modelKey
    } else {
      defaults.model = { primary: modelKey }
    }
    this.write(cfg)
  }

  // ─── Channels ─────────────────────────────────────────────────────────────

  getChannelConfigs(): Record<string, unknown> {
    return this.read().channels
  }

  getChannelConfig(channelType: string): unknown {
    return this.read().channels[channelType] ?? null
  }

  saveChannelConfig(channelType: string, config: unknown): void {
    const cfg = this.read()
    cfg.channels[channelType] = config
    this.write(cfg)
  }

  deleteChannelConfig(channelType: string): void {
    const cfg = this.read()
    delete cfg.channels[channelType]
    this.write(cfg)
  }

  // ─── Cron Config (system-level settings) ──────────────────────────────────

  getCronConfig(): OpenClawConfig['cron'] {
    return this.read().cron
  }

  updateCronConfig(updates: Partial<OpenClawConfig['cron']>): void {
    const cfg = this.read()
    cfg.cron = { ...cfg.cron, ...updates }
    this.write(cfg)
  }

  // ─── Skills Config ────────────────────────────────────────────────────────

  getSkillsConfig(): OpenClawConfig['skills'] {
    return this.read().skills
  }

  updateSkillEntry(
    name: string,
    entry: {
      enabled?: boolean
      apiKey?: string
      env?: Record<string, string>
      config?: Record<string, unknown>
    },
  ): void {
    const cfg = this.read()
    if (!cfg.skills.entries) cfg.skills.entries = {}
    cfg.skills.entries[name] = { ...cfg.skills.entries[name], ...entry }
    this.write(cfg)
  }

  deleteSkillEntry(name: string): void {
    const cfg = this.read()
    if (cfg.skills.entries) {
      delete cfg.skills.entries[name]
    }
    this.write(cfg)
  }

  // ─── Bootstrap Files ─────────────────────────────────────────────────────

  listBootstrapFiles(agentId: string): { fileName: BootstrapFileName; exists: boolean }[] {
    const agentDir = this.paths.agentDir(agentId)
    return Array.from(VALID_BOOTSTRAP_FILES).map((fileName) => ({
      fileName: fileName as BootstrapFileName,
      exists: existsSync(join(agentDir, fileName)),
    }))
  }

  readBootstrapFile(agentId: string, fileName: BootstrapFileName): string | null {
    if (!VALID_BOOTSTRAP_FILES.has(fileName)) return null
    const filePath = this.paths.bootstrapFile(agentId, fileName)
    if (!existsSync(filePath)) return null
    return readFileSync(filePath, 'utf-8')
  }

  writeBootstrapFile(agentId: string, fileName: BootstrapFileName, content: string): void {
    if (!VALID_BOOTSTRAP_FILES.has(fileName)) {
      throw new Error(`Invalid bootstrap file: ${fileName}`)
    }
    const agentDir = this.paths.agentDir(agentId)
    if (!existsSync(agentDir)) {
      mkdirSync(agentDir, { recursive: true })
    }
    writeFileSync(this.paths.bootstrapFile(agentId, fileName), content, 'utf-8')
  }

  // ─── Installed Skills (reads from disk) ───────────────────────────────────

  listInstalledSkills(): SkillManifest[] {
    const skills: SkillManifest[] = []
    const dir = this.paths.skillsDir

    if (!existsSync(dir)) return skills

    const { readdirSync, statSync } = require('node:fs')
    const entries = readdirSync(dir) as string[]

    for (const entry of entries) {
      const skillDir = join(dir, entry)
      if (!statSync(skillDir).isDirectory()) continue

      const manifestPath = join(skillDir, 'SKILL.md')
      if (!existsSync(manifestPath)) continue

      try {
        const raw = readFileSync(manifestPath, 'utf-8')
        const manifest = this.parseSkillManifest(raw, entry, skillDir)
        if (manifest) skills.push(manifest)
      } catch {
        // Skip malformed skills
      }
    }

    return skills
  }

  updateSkillConfig(
    skillName: string,
    updates: { enabled?: boolean; apiKey?: string; env?: Record<string, string> },
  ): void {
    const manifestPath = this.paths.skillManifest(skillName)
    if (!existsSync(manifestPath)) {
      throw new Error(`Skill '${skillName}' not found`)
    }

    let raw = readFileSync(manifestPath, 'utf-8')
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/)

    if (frontmatterMatch) {
      let fm = frontmatterMatch[1] ?? ''
      if (updates.enabled !== undefined) {
        if (fm.includes('enabled:')) {
          fm = fm.replace(/enabled:\s*\S+/, `enabled: ${updates.enabled}`)
        } else {
          fm += `\nenabled: ${updates.enabled}`
        }
      }
      if (updates.apiKey !== undefined) {
        if (fm.includes('apiKey:')) {
          fm = fm.replace(/apiKey:\s*.*/, `apiKey: ${updates.apiKey}`)
        } else {
          fm += `\napiKey: ${updates.apiKey}`
        }
      }
      raw = raw.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`)
    }

    writeFileSync(manifestPath, raw, 'utf-8')
  }

  // ─── Shadow Channel Helpers (for Buddy) ───────────────────────────────────

  getShadowChannelBlock(): Record<string, unknown> {
    const config = this.read()
    const current = config.channels?.shadowob
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      return current as Record<string, unknown>
    }
    return {}
  }

  setShadowChannelAccount(accountId: string, accountData: Record<string, unknown>): void {
    const config = this.read()
    const shadowBlock = this.getShadowChannelBlock()
    const currentAccounts = shadowBlock.accounts
    const accounts =
      currentAccounts && typeof currentAccounts === 'object' && !Array.isArray(currentAccounts)
        ? { ...(currentAccounts as Record<string, unknown>) }
        : {}

    const previous = accounts[accountId]
    const previousObject =
      previous && typeof previous === 'object' && !Array.isArray(previous)
        ? (previous as Record<string, unknown>)
        : {}

    accounts[accountId] = { ...previousObject, ...accountData }

    config.channels = {
      ...(config.channels ?? {}),
      shadowob: { ...shadowBlock, accounts },
    }
    this.write(config)
  }

  removeShadowChannelAccount(accountId: string): void {
    const config = this.read()
    const shadowBlock = this.getShadowChannelBlock()
    const currentAccounts = shadowBlock.accounts
    if (!currentAccounts || typeof currentAccounts !== 'object' || Array.isArray(currentAccounts))
      return

    const accounts = { ...(currentAccounts as Record<string, unknown>) }
    delete accounts[accountId]

    config.channels = {
      ...(config.channels ?? {}),
      shadowob: { ...shadowBlock, accounts },
    }
    this.write(config)
  }

  // ─── Bindings (multi-agent routing) ─────────────────────────────────────

  /**
   * Add a binding that routes inbound messages from a (channel, accountId) pair
   * to a specific local agent. Uses OpenClaw's native `bindings` array so that
   * resolveAgentRoute() returns the correct agentId AND sessionKey.
   */
  addAgentBinding(agentId: string, channel: string, accountId: string): void {
    const config = this.read()
    if (!config.bindings) config.bindings = []

    // Avoid duplicates: remove any existing binding for the same (channel, accountId)
    config.bindings = config.bindings.filter(
      (b) => !(b.match.channel === channel && b.match.accountId === accountId),
    )

    config.bindings.push({
      agentId,
      match: { channel, accountId },
    })
    this.write(config)
  }

  /**
   * Remove all bindings matching the given channel and/or accountId.
   * If only channel is specified, removes all bindings for that channel+agent.
   */
  removeAgentBindings(params: { agentId?: string; channel?: string; accountId?: string }): void {
    const config = this.read()
    if (!config.bindings?.length) return

    config.bindings = config.bindings.filter((b) => {
      if (params.channel && b.match.channel !== params.channel) return true
      if (params.accountId && b.match.accountId !== params.accountId) return true
      if (params.agentId && b.agentId !== params.agentId) return true
      return false
    })
    this.write(config)
  }

  // ─── Desktop Settings (NOT in openclaw.json) ─────────────────────────────

  /**
   * Desktop-specific settings stored separately from openclaw.json to avoid
   * OpenClaw's strict schema validation. Controls autoStart, autoRestart, etc.
   */
  readDesktopSettings(): { autoStart: boolean; autoRestart: boolean } {
    try {
      if (existsSync(this.paths.desktopSettingsFile)) {
        const raw = readFileSync(this.paths.desktopSettingsFile, 'utf-8')
        const parsed = JSON.parse(raw) as Record<string, unknown>
        return {
          autoStart: parsed.autoStart === true,
          autoRestart: parsed.autoRestart !== false,
        }
      }
    } catch {
      // Fall through to defaults
    }
    return { autoStart: false, autoRestart: true }
  }

  writeDesktopSettings(settings: { autoStart?: boolean; autoRestart?: boolean }): void {
    const current = this.readDesktopSettings()
    const merged = { ...current, ...settings }
    writeFileSync(this.paths.desktopSettingsFile, JSON.stringify(merged, null, 2), 'utf-8')
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Migrate config to fix keys that OpenClaw's strict zod schema rejects.
   * Writes to disk on migration so the file stays clean.
   */
  private migrateConfig(cfg: OpenClawConfig, _defaults: OpenClawConfig): OpenClawConfig {
    let dirty = false

    // 1. Remove invalid gateway keys (desktop-internal, not part of OpenClaw schema)
    const gw = cfg.gateway as Record<string, unknown> | undefined
    if (gw) {
      for (const badKey of ['autoStart', 'autoRestart', 'maxRestartAttempts']) {
        if (badKey in gw) {
          delete gw[badKey]
          dirty = true
        }
      }
    }

    // 2. Ensure gateway.mode=local
    if (!cfg.gateway?.mode) {
      cfg.gateway = { ...cfg.gateway, mode: 'local' }
      dirty = true
    }

    // 5. Ensure plugins.load.paths always points to the current build/bundled plugin
    const resolvedPluginDir = this.paths.resolveShadowPlugin()
    const currentLoadPaths = cfg.plugins.load?.paths ?? []
    if (resolvedPluginDir) {
      if (currentLoadPaths.length !== 1 || currentLoadPaths[0] !== resolvedPluginDir) {
        cfg.plugins = { ...cfg.plugins, load: { ...cfg.plugins.load, paths: [resolvedPluginDir] } }
        dirty = true
      }
    }

    // 6. Strip localAgentId from channel accounts (desktop-only, not part of OpenClaw schema)
    const shadowBlock = cfg.channels?.shadowob as Record<string, unknown> | undefined
    if (shadowBlock?.accounts && typeof shadowBlock.accounts === 'object') {
      const accounts = shadowBlock.accounts as Record<string, Record<string, unknown>>
      for (const acct of Object.values(accounts)) {
        if ('localAgentId' in acct) {
          delete acct.localAgentId
          dirty = true
        }
      }
    }

    const allow = cfg.plugins.allow as string[] | undefined
    if (!allow || !allow.includes('shadowob')) {
      cfg.plugins.allow = ['shadowob']
      dirty = true
    }

    // 8.5 Migrate accountAgentMap → bindings (OpenClaw native multi-agent routing)
    // Step A: collect all accountAgentMap entries from both old locations
    const oldPluginMap = cfg.plugins.entries?.shadowob?.config?.accountAgentMap as
      | Record<string, string>
      | undefined
    const sb = (cfg.channels?.shadowob ?? {}) as Record<string, unknown>
    const channelMap = sb.accountAgentMap as Record<string, string> | undefined

    const allMappings: Record<string, string> = { ...oldPluginMap, ...channelMap }

    if (Object.keys(allMappings).length > 0) {
      if (!cfg.bindings) cfg.bindings = []
      for (const [accId, agId] of Object.entries(allMappings)) {
        // Only add if no binding already exists for this (channel, accountId)
        const exists = cfg.bindings.some(
          (b) => b.match.channel === 'shadowob' && b.match.accountId === accId,
        )
        if (!exists) {
          cfg.bindings.push({ agentId: agId, match: { channel: 'shadowob', accountId: accId } })
        }
      }

      // Clean up old accountAgentMap from both locations
      if (oldPluginMap) {
        delete cfg.plugins.entries!.shadowob!.config!.accountAgentMap
      }
      if (channelMap) {
        delete (sb as Record<string, unknown>).accountAgentMap
        cfg.channels = { ...(cfg.channels ?? {}), shadowob: sb }
      }
      dirty = true
    }

    // 8.6 Ensure non-main agents have workspace set (multi-agent isolation)
    for (const agent of cfg.agents.list) {
      if (agent.id !== 'main' && !agent.workspace) {
        agent.workspace = join(this.paths.workspaceDir, agent.id)
        dirty = true
      }
    }

    // 8. Ensure gateway.auth.token is set (persistent across restarts)
    const gw2 = cfg.gateway as Record<string, unknown> | undefined
    const auth = gw2?.auth as Record<string, unknown> | undefined
    if (!auth?.token) {
      const { randomBytes } = require('node:crypto')
      const persistentToken = `shadow-${randomBytes(24).toString('hex')}`
      cfg.gateway = {
        ...cfg.gateway,
        auth: { ...auth, token: persistentToken },
      } as OpenClawConfig['gateway']
      dirty = true
    }

    if (dirty) {
      this.write(cfg)
    }

    return cfg
  }

  private defaultConfig(): OpenClawConfig {
    const pluginDir = this.paths.resolveShadowPlugin()
    const pluginLoadPaths = pluginDir ? [pluginDir] : []

    const { randomBytes } = require('node:crypto')
    const authToken = `shadow-${randomBytes(24).toString('hex')}`

    return {
      gateway: {
        mode: 'local',
        auth: { token: authToken },
      },
      agents: {
        list: [{ id: 'main', name: 'Main Agent' }],
        defaults: {
          model: { primary: 'gpt-4o' },
          workspace: this.paths.workspaceDir,
        },
      },
      channels: {},
      plugins: {
        enabled: true,
        allow: ['shadowob'],
        load: {
          paths: pluginLoadPaths,
        },
        entries: {
          shadowob: { enabled: true },
        },
      },
      skills: {
        allowBundled: ['*'],
      },
      models: {
        providers: {},
      },
      cron: {
        enabled: false,
      },
    }
  }

  private parseSkillManifest(raw: string, slug: string, path: string): SkillManifest | null {
    const match = raw.match(/^---\n([\s\S]*?)\n---/)
    if (!match) {
      return {
        name: slug,
        displayName: slug,
        description: '',
        version: '0.0.0',
        author: 'unknown',
        source: 'local',
        enabled: true,
        path,
      }
    }

    const frontmatter = match[1] ?? ''
    const fields: Record<string, string> = {}
    for (const line of frontmatter.split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim()
        const value = line
          .slice(colonIdx + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '')
        fields[key] = value
      }
    }

    return {
      name: fields.name ?? slug,
      displayName: fields.displayName ?? fields.name ?? slug,
      description: fields.description ?? '',
      version: fields.version ?? '0.0.0',
      author: fields.author ?? 'unknown',
      icon: fields.icon,
      tags: fields.tags?.split(',').map((t) => t.trim()),
      source: (fields.source as SkillManifest['source']) ?? 'local',
      enabled: fields.enabled !== 'false',
      path,
      apiKey: fields.apiKey,
      env: this.parseEnvBlock(frontmatter),
    }
  }

  private parseEnvBlock(frontmatter: string): Record<string, string> | undefined {
    const envMatch = frontmatter.match(/env:\n((?:\s+\S+:.*\n?)*)/)
    if (!envMatch) return undefined

    const env: Record<string, string> = {}
    for (const line of (envMatch[1] ?? '').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const colonIdx = trimmed.indexOf(':')
      if (colonIdx > 0) {
        env[trimmed.slice(0, colonIdx).trim()] = trimmed.slice(colonIdx + 1).trim()
      }
    }
    return Object.keys(env).length > 0 ? env : undefined
  }
}
