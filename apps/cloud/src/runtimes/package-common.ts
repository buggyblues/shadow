import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
export const SHADOW_SLASH_COMMANDS_PATH = `${SHADOWOB_CONFIG_MOUNT_PATH}/slash-commands.json`

export interface ShadowRuntimeBinding {
  tokenEnvKey: string
  serverUrlEnvKey: string
  buddyId?: string
  buddyName?: string
}

export function hasRuntimeExtensions(extension: PluginRuntimeExtension): boolean {
  return Boolean(
    extension.shadowob ||
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

export function shadowPlatformOptions(shadow: ShadowRuntimeBinding): TomlTable {
  return {
    token: envPlaceholder(shadow.tokenEnvKey),
    server_url: envPlaceholder(shadow.serverUrlEnvKey),
    allow_from: '*',
    listen_dms: true,
    share_session_in_channel: false,
    progress_style: 'compact',
    slash_commands_path: envPlaceholder('SHADOW_SLASH_COMMANDS_PATH'),
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

function shadowobSkillMarkdown(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(process.cwd(), 'skills/shadowob-cli/SKILL.md'),
    resolve(process.cwd(), '../skills/shadowob-cli/SKILL.md'),
    resolve(here, '../../../../skills/shadowob-cli/SKILL.md'),
    resolve(here, '../../../../../skills/shadowob-cli/SKILL.md'),
  ]
  const path = candidates.find((candidate) => existsSync(candidate))
  if (!path) {
    throw new Error('Cannot find skills/shadowob-cli/SKILL.md for runner package generation')
  }
  return readFileSync(path, 'utf8')
}

export function addShadowobSkill(
  files: RuntimeFiles,
  runtimeKind: RuntimeKind,
  runtimeId: string,
): void {
  const skill = shadowobSkillMarkdown()
  files[`${WORKSPACE_DIR}/.agents/skills/shadowob/SKILL.md`] = skill

  if (runtimeId === 'claude-code') {
    files[`${WORKSPACE_DIR}/.claude/skills/shadowob/SKILL.md`] = skill
  }
  if (runtimeId === 'opencode') {
    files[`${WORKSPACE_DIR}/.opencode/skills/shadowob/SKILL.md`] = skill
  }
  if (runtimeId === 'codex') {
    files[`${HOME_DIR}/.codex/skills/shadowob/SKILL.md`] = skill
  }
  if (runtimeId === 'gemini') {
    files[`${HOME_DIR}/.gemini/skills/shadowob/SKILL.md`] = skill
  }
  if (runtimeKind === 'openclaw') {
    files[`${OPENCLAW_SKILLS_DIR}/shadowob/SKILL.md`] = skill
  }
  if (runtimeKind === 'hermes') {
    files[`${HOME_DIR}/.hermes/skills/shadowob/SKILL.md`] = skill
  }
}
