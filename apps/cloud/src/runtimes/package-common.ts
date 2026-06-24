import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TomlTable } from 'smol-toml'
import type { AgentDeployment } from '../config/schema.js'
import type { PluginRuntimeExtension } from '../plugins/types.js'
import { RUNNER_HOME_DIR, SHADOWOB_CONFIG_MOUNT_PATH } from './container.js'
import type { RuntimeFiles, RuntimeKind } from './index.js'

export const HOME_DIR = RUNNER_HOME_DIR
export const WORKSPACE_DIR = '/workspace'
export const OPENCLAW_SKILLS_DIR = `${HOME_DIR}/.openclaw/skills`
export const CC_CONNECT_CONFIG_PATH = `${HOME_DIR}/.cc-connect/config.toml`
export const SHADOWOB_CLI_CONFIG_PATH = `${HOME_DIR}/.shadowob/shadowob.config.json`
export const SHADOW_SLASH_COMMANDS_PATH = `${SHADOWOB_CONFIG_MOUNT_PATH}/slash-commands.json`
export const SHADOW_EXPOSURE_DIR = '/run/shadow/exposure'
export const SHADOW_EXPOSURE_CONFIG_PATH = `${SHADOW_EXPOSURE_DIR}/desired.json`
export const SHADOW_EXPOSURE_STATUS_PATH = `${SHADOW_EXPOSURE_DIR}/status.json`

export interface ShadowRuntimeBinding {
  tokenEnvKey: string
  serverUrlEnvKey: string
  buddyId?: string
  buddyName?: string
}

export type OfficialModelProviderStyle = 'openai' | 'anthropic'

export interface OfficialModelProviderBinding {
  providerId: string
  style: OfficialModelProviderStyle
  model: string
  baseUrlEnvKey: string
  apiKeyEnvKey: string
  modelEnvKey?: string
}

const OFFICIAL_MODEL_PROVIDER_ENV: Record<
  OfficialModelProviderStyle,
  { baseUrl: string; apiKey: string; model: string }
> = {
  openai: {
    baseUrl: 'OPENAI_COMPATIBLE_BASE_URL',
    apiKey: 'OPENAI_COMPATIBLE_API_KEY',
    model: 'OPENAI_COMPATIBLE_MODEL_ID',
  },
  anthropic: {
    baseUrl: 'ANTHROPIC_COMPATIBLE_BASE_URL',
    apiKey: 'ANTHROPIC_COMPATIBLE_API_KEY',
    model: 'ANTHROPIC_COMPATIBLE_MODEL_ID',
  },
}

export function hasRuntimeExtensions(extension: PluginRuntimeExtension): boolean {
  return Boolean(
    extension.shadowob ||
      extension.openclaw?.manifestPatches?.length ||
      extension.routineDeliveries?.length ||
      extension.artifacts?.length ||
      extension.runtimeDependencies?.length ||
      extension.skillSources?.length ||
      extension.subagentSources?.length ||
      extension.mcpServers?.length ||
      extension.credentialFiles?.length ||
      extension.verificationChecks?.length,
  )
}

export function runtimeExtensionsForKind(
  extension: PluginRuntimeExtension,
  runtimeKind: RuntimeKind,
): PluginRuntimeExtension {
  if (runtimeKind === 'openclaw') return extension
  const { openclaw: _openclaw, ...nativeExtension } = extension
  return nativeExtension
}

export function envPlaceholder(key: string): string {
  return '${' + key + '}'
}

export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function modelName(agent: AgentDeployment): string | undefined {
  return agent.model?.preferred ?? agent.configuration.model?.preferred
}

export function reasoningEffort(agent: AgentDeployment): string | undefined {
  const thinking =
    agent.model?.constraints?.thinkingLevel ?? agent.configuration.model?.constraints?.thinkingLevel
  return thinking && ['low', 'medium', 'high', 'xhigh'].includes(thinking) ? thinking : undefined
}

export function officialModelProviderBinding(
  runtimeEnv: Record<string, string | undefined>,
  style: OfficialModelProviderStyle,
): OfficialModelProviderBinding | null {
  const env = OFFICIAL_MODEL_PROVIDER_ENV[style]
  if (!runtimeEnv[env.baseUrl] || !runtimeEnv[env.apiKey]) return null

  const modelEnvKey = runtimeEnv[env.model]
    ? env.model
    : style === 'anthropic' && runtimeEnv.OPENAI_COMPATIBLE_MODEL_ID
      ? 'OPENAI_COMPATIBLE_MODEL_ID'
      : undefined

  return {
    providerId: runtimeEnv.SHADOW_MODEL_PROVIDER_ID?.trim() || 'shadow-official',
    style,
    model: modelEnvKey ? envPlaceholder(modelEnvKey) : 'default',
    baseUrlEnvKey: env.baseUrl,
    apiKeyEnvKey: env.apiKey,
    modelEnvKey,
  }
}

function permissionDefault(agent: AgentDeployment): string | undefined {
  return agent.permissions?.default
}

export function nativePermissionMode(agent: AgentDeployment): 'ask' | 'allow' | 'deny' {
  switch (permissionDefault(agent)) {
    case 'always-allow':
      return 'allow'
    case 'deny-all':
      return 'deny'
    default:
      return 'ask'
  }
}

export function shadowBinding(runtimeExtensions: PluginRuntimeExtension): ShadowRuntimeBinding {
  return shadowBindings(runtimeExtensions)[0]!
}

export function shadowBindings(runtimeExtensions: PluginRuntimeExtension): ShadowRuntimeBinding[] {
  const shadowob = runtimeExtensions.shadowob
  const accounts = shadowob?.accounts ?? []
  if (accounts.length === 0) {
    return [{ tokenEnvKey: 'SHADOW_AGENT_TOKEN', serverUrlEnvKey: 'SHADOW_SERVER_URL' }]
  }

  return accounts.map((account) => ({
    tokenEnvKey: account.tokenEnvKey,
    serverUrlEnvKey: shadowob?.serverUrlEnvKey ?? 'SHADOW_SERVER_URL',
    buddyId: account.buddyId,
    buddyName: account.buddyName,
  }))
}

export function shadowPlatformOptions(
  shadow: ShadowRuntimeBinding,
  options?: { channelEnvKeys?: string[] },
): TomlTable {
  const channelEnvKeys = [...new Set(options?.channelEnvKeys ?? [])].filter(Boolean)
  return {
    token: envPlaceholder(shadow.tokenEnvKey),
    server_url: envPlaceholder(shadow.serverUrlEnvKey),
    allow_from: '*',
    listen_dms: true,
    share_session_in_channel: false,
    progress_style: 'compact',
    slash_commands_path: envPlaceholder('SHADOW_SLASH_COMMANDS_PATH'),
    ...(channelEnvKeys.length > 0
      ? { channel_ids: channelEnvKeys.map((key) => envPlaceholder(key)) }
      : {}),
  }
}

export function buildIdentityWorkspaceFiles(agent: AgentDeployment): RuntimeFiles {
  const files: RuntimeFiles = {}
  const name = agent.identity?.name ?? agent.id
  const description = agent.identity?.description ?? agent.description
  const prompt = [agent.identity?.personality, agent.identity?.systemPrompt]
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n\n')

  files[`${WORKSPACE_DIR}/IDENTITY.md`] = [
    '# Agent Identity',
    '',
    `- Name: ${name}`,
    ...(description ? [`- Description: ${description}`] : []),
    '',
  ].join('\n')
  if (prompt) files[`${WORKSPACE_DIR}/SOUL.md`] = `${prompt}\n`
  files[`${WORKSPACE_DIR}/AGENTS.md`] =
    `# Agents\n\n- **${name}**${description ? ` - ${description}` : ''}\n`

  return files
}

function packagedPath(relativePath: string, label: string): string {
  const here = dirname(fileURLToPath(import.meta.url))
  let currentDir = here
  let path: string | undefined

  while (true) {
    const candidate = resolve(currentDir, relativePath)
    if (existsSync(candidate)) {
      path = candidate
      break
    }

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }

  if (!path) {
    throw new Error(`Cannot find ${relativePath} for ${label} runner package generation`)
  }
  return path
}

type OfficialShadowSkillId = 'shadowob' | 'shadow-server-app'

const OFFICIAL_SHADOW_SKILLS: Record<
  OfficialShadowSkillId,
  { sourceDir: string; targetName: string }
> = {
  shadowob: {
    sourceDir: 'skills/shadowob-cli',
    targetName: 'shadowob',
  },
  'shadow-server-app': {
    sourceDir: 'skills/shadow-server-app',
    targetName: 'shadow-server-app',
  },
}

const SKILL_PACKAGE_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '__pycache__',
])

function isOfficialShadowSkillId(id: string): id is OfficialShadowSkillId {
  return Object.hasOwn(OFFICIAL_SHADOW_SKILLS, id)
}

function shouldIncludeSkillPackageEntry(name: string, isDirectory: boolean): boolean {
  if (isDirectory && SKILL_PACKAGE_SKIP_DIRS.has(name)) return false
  if (name.startsWith('.') && name !== '.env.example') return false
  return true
}

function readSkillPackageFiles(skillId: OfficialShadowSkillId): Record<string, string> {
  const skill = OFFICIAL_SHADOW_SKILLS[skillId]
  const root = packagedPath(skill.sourceDir, skillId)
  const files: Record<string, string> = {}

  function visit(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    for (const entry of entries) {
      if (!shouldIncludeSkillPackageEntry(entry.name, entry.isDirectory())) continue
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        visit(path)
        continue
      }
      if (!entry.isFile()) continue
      const relativePath = relative(root, path).replace(/\\/g, '/')
      files[relativePath] = readFileSync(path, 'utf8')
    }
  }

  visit(root)
  if (!files['SKILL.md']) {
    throw new Error(`Official Shadow skill package ${skillId} is missing SKILL.md`)
  }
  return files
}

function officialSkillTargetDirs(
  runtimeKind: RuntimeKind,
  runtimeId: string,
  targetName: string,
): string[] {
  const dirs = new Set([`${WORKSPACE_DIR}/.agents/skills/${targetName}`])

  if (runtimeId === 'claude-code') {
    dirs.add(`${WORKSPACE_DIR}/.claude/skills/${targetName}`)
  }
  if (runtimeId === 'opencode') {
    dirs.add(`${WORKSPACE_DIR}/.opencode/skills/${targetName}`)
  }
  if (runtimeId === 'codex') {
    dirs.add(`${HOME_DIR}/.codex/skills/${targetName}`)
  }
  if (runtimeKind === 'openclaw') {
    dirs.add(`${OPENCLAW_SKILLS_DIR}/${targetName}`)
  }
  if (runtimeKind === 'hermes') {
    dirs.add(`${HOME_DIR}/.hermes/skills/${targetName}`)
  }
  return [...dirs]
}

export function addOfficialShadowSkills(
  files: RuntimeFiles,
  runtimeKind: RuntimeKind,
  runtimeId: string,
  skillIds: string[] = [],
): void {
  for (const skillId of [...new Set(skillIds)]) {
    if (!isOfficialShadowSkillId(skillId)) {
      throw new Error(`Unknown official Shadow skill package: ${skillId}`)
    }
    const skill = OFFICIAL_SHADOW_SKILLS[skillId]
    const packageFiles = readSkillPackageFiles(skillId)
    for (const targetDir of officialSkillTargetDirs(runtimeKind, runtimeId, skill.targetName)) {
      for (const [relativePath, content] of Object.entries(packageFiles)) {
        files[`${targetDir}/${relativePath}`] = content
      }
    }
  }
}

export function addShadowobCliAuth(files: RuntimeFiles, runtimeExtensions: PluginRuntimeExtension) {
  const bindings = shadowBindings(runtimeExtensions)
  const profiles: Record<string, { serverUrl: string; token: string }> = {}

  for (const [index, binding] of bindings.entries()) {
    const profileName = binding.buddyId?.trim() || (index === 0 ? 'default' : `shadow-${index + 1}`)
    profiles[profileName] = {
      serverUrl: envPlaceholder(binding.serverUrlEnvKey),
      token: envPlaceholder(binding.tokenEnvKey),
    }
  }

  const currentProfile = Object.keys(profiles)[0] ?? 'default'
  files[SHADOWOB_CLI_CONFIG_PATH] = json({
    profiles,
    currentProfile,
  })
}
