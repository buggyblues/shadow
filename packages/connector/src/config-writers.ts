import { parse as parseDotenv } from 'dotenv'
import type { TomlTable, TomlValue } from 'smol-toml'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export interface ShadowConfigValues {
  token: string
  serverUrl: string
}

export interface CcConnectConfigValues extends ShadowConfigValues {
  projectName: string
  workDir: string
  agentType: string
}

const SHADOW_ENV_VALUES = {
  SHADOW_ALLOW_ALL_USERS: 'true',
  SHADOW_HEARTBEAT_INTERVAL_SECONDS: '30',
  SHADOW_SLASH_COMMANDS_JSON: '[]',
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

  const updates: Record<string, string> = {
    SHADOW_BASE_URL: values.serverUrl,
    SHADOW_TOKEN: values.token,
    ...SHADOW_ENV_VALUES,
  }
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
  const channels = asRecord(root.channels)
  const legacyShadow = asRecord(channels['openclaw-shadowob'])
  const shadow = asRecord(channels.shadowob)

  channels.shadowob = {
    ...legacyShadow,
    ...shadow,
    token: values.token,
    serverUrl: values.serverUrl,
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

  return ensureTrailingNewline(JSON.stringify(root, null, 2))
}

export function mergeHermesConfigContent(existing: string, values: ShadowConfigValues): string {
  const root = parseYamlRoot(existing, 'Hermes')

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
    },
  }
  root.platforms = platforms

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

function ccConnectProjectWorkDir(project: TomlTable): string | undefined {
  const agent = asTomlTable(project.agent)
  const options = asTomlTable(agent.options)
  return typeof options.work_dir === 'string'
    ? options.work_dir
    : typeof project.work_dir === 'string'
      ? project.work_dir
      : undefined
}

export function mergeCcConnectConfigContent(
  existing: string,
  values: CcConnectConfigValues,
): string {
  const root = parseTomlRoot(existing, 'cc-connect')
  const projects = tomlArray(root.projects)
  let project =
    projects.find((item) => item.name === values.projectName) ??
    projects.find((item) => ccConnectProjectWorkDir(item) === values.workDir)

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
    work_dir: values.workDir,
  }
  project.agent = agent

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
