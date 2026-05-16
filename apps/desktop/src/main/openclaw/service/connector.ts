/**
 * Connector Center Service
 *
 * CLI-backed integration surface for ShadowOB account, Cloud, official skills,
 * multi-agent Buddy bindings, and scheduled task summaries.
 */

import { spawn } from 'node:child_process'
import type {
  AgentBuddyBindingSummary,
  ConnectorCommandResult,
  ConnectorOverview,
  ConnectorToolId,
  ConnectorToolStatus,
} from '../types'
import type { BuddyService } from './buddy'
import type { ConfigService } from './config'
import type { CronService } from './cron'
import type { GatewayService } from './gateway'
import type { OpenClawPaths } from './paths'
import type { SkillHubService } from './skillhub'

type InstallToolId = 'shadowob-cli' | 'shadowob-cloud' | 'official-skills'

const TOOL_DEFS: Array<{
  id: ConnectorToolId
  label: string
  binary: string
  versionArgs: string[]
  installCommand: string | null
}> = [
  {
    id: 'shadowob-cli',
    label: 'shadowob CLI',
    binary: 'shadowob',
    versionArgs: ['--version'],
    installCommand: 'npm install -g @shadowob/cli',
  },
  {
    id: 'shadowob-cloud',
    label: 'shadowob cloud CLI',
    binary: 'shadowob-cloud',
    versionArgs: ['--version'],
    installCommand: 'npm install -g @shadowob/cloud',
  },
  {
    id: 'skillhub',
    label: 'SkillHub CLI',
    binary: 'skillhub',
    versionArgs: ['--version'],
    installCommand: null,
  },
  {
    id: 'openclaw',
    label: 'Bundled OpenClaw',
    binary: 'openclaw',
    versionArgs: ['--version'],
    installCommand: null,
  },
]

export class ConnectorService {
  constructor(
    private paths: OpenClawPaths,
    private config: ConfigService,
    private cron: CronService,
    private buddy: BuddyService,
    private skillHub: SkillHubService,
    private gateway: GatewayService,
  ) {}

  async getOverview(): Promise<ConnectorOverview> {
    const [tools, bindings] = await Promise.all([this.getToolStatuses(), this.getBindings()])
    const tasks = this.cron.list()
    return {
      tools,
      bindings,
      cronTaskCount: tasks.length,
      enabledCronTaskCount: tasks.filter((task) => task.enabled).length,
      installedSkillCount: this.config.listInstalledSkills().length,
    }
  }

  async getToolStatuses(): Promise<ConnectorToolStatus[]> {
    return Promise.all(TOOL_DEFS.map((tool) => this.getToolStatus(tool)))
  }

  async installTools(
    tools: InstallToolId[],
  ): Promise<Record<InstallToolId, ConnectorCommandResult>> {
    const results = {} as Record<InstallToolId, ConnectorCommandResult>
    for (const tool of tools) {
      if (tool === 'official-skills') {
        const result = this.skillHub.installOfficialSkills()
        results[tool] = {
          ok: result.errors.length === 0,
          code: result.errors.length === 0 ? 0 : 1,
          stdout: JSON.stringify(result, null, 2),
          stderr: result.errors.map((err) => `${err.slug}: ${err.error}`).join('\n'),
        }
        continue
      }

      const pkg = tool === 'shadowob-cli' ? '@shadowob/cli' : '@shadowob/cloud'
      results[tool] = await this.runCommand('npm', ['install', '-g', pkg], 120_000)
    }
    return results
  }

  async loginShadow(input: {
    serverUrl?: string
    token: string
    profile?: string
  }): Promise<ConnectorCommandResult> {
    const args = [
      'auth',
      'login',
      '--server-url',
      input.serverUrl?.trim() || 'https://shadowob.com',
      '--token',
      input.token,
    ]
    if (input.profile?.trim()) args.push('--profile', input.profile.trim())
    return this.runShadow(args)
  }

  async getShadowStatus(profile?: string): Promise<ConnectorCommandResult> {
    return this.runShadow([...this.profileArgs(profile), 'status', '--json'])
  }

  async listNotifications(input?: {
    unreadOnly?: boolean
    limit?: number
    profile?: string
  }): Promise<ConnectorCommandResult> {
    const args = [
      ...this.profileArgs(input?.profile),
      'notifications',
      'list',
      '--limit',
      String(input?.limit ?? 20),
      '--json',
    ]
    if (input?.unreadOnly) args.push('--unread-only')
    return this.runShadow(args)
  }

  async markAllNotificationsRead(profile?: string): Promise<ConnectorCommandResult> {
    return this.runShadow([
      ...this.profileArgs(profile),
      'notifications',
      'mark-all-read',
      '--json',
    ])
  }

  async getCloudStatus(args: string[] = []): Promise<ConnectorCommandResult> {
    return this.runCloud(['status', ...args])
  }

  async collectCloudCosts(input?: {
    namespace?: string
    allNamespaces?: boolean
  }): Promise<ConnectorCommandResult> {
    const args = ['costs', '--json']
    if (input?.namespace?.trim()) args.push('--namespace', input.namespace.trim())
    if (input?.allNamespaces) args.push('--all-namespaces')
    return this.runCloud(args)
  }

  async runShadow(args: string[]): Promise<ConnectorCommandResult> {
    return this.runCommand('shadowob', args)
  }

  async runCloud(args: string[]): Promise<ConnectorCommandResult> {
    return this.runCommand('shadowob-cloud', args, 60_000)
  }

  getBindings(): AgentBuddyBindingSummary[] {
    const agents = this.config.getAgents()
    const agentNames = new Map(agents.map((agent) => [agent.id, agent.name ?? agent.id]))
    const bindings = this.config.read().bindings ?? []
    const activeKeys = new Set(
      bindings
        .filter((binding) => binding.match.channel === 'shadowob' && binding.match.accountId)
        .map((binding) => `${binding.agentId}:${binding.match.accountId}`),
    )

    return this.buddy.list().map((connection) => ({
      connectionId: connection.id,
      connectionLabel: connection.label,
      remoteAgentId: connection.remoteAgentId,
      localAgentId: connection.agentId,
      localAgentName: agentNames.get(connection.agentId) ?? null,
      serverUrl: connection.serverUrl,
      status: connection.status,
      autoConnect: connection.autoConnect === true,
      bindingActive: activeKeys.has(`${connection.agentId}:${connection.id}`),
    }))
  }

  private async getToolStatus(tool: (typeof TOOL_DEFS)[number]): Promise<ConnectorToolStatus> {
    if (tool.id === 'openclaw') {
      const entry = this.paths.resolveGatewayEntry()
      const status = this.gateway.getStatus()
      return {
        id: tool.id,
        label: tool.label,
        binary: tool.binary,
        installed: Boolean(entry),
        version: status.version,
        installCommand: tool.installCommand,
        error: entry ? null : 'Bundled OpenClaw entry point not found',
      }
    }
    if (tool.id === 'skillhub') {
      const cli = this.skillHub.getCliAvailability()
      return {
        id: tool.id,
        label: tool.label,
        binary: tool.binary,
        installed: Boolean(cli),
        version: cli ? cli.kind : null,
        installCommand: tool.installCommand,
        error: cli ? null : 'SkillHub or ClawHub CLI not found',
      }
    }

    const result = await this.runCommand(tool.binary, tool.versionArgs, 10_000)
    return {
      id: tool.id,
      label: tool.label,
      binary: tool.binary,
      installed: result.ok,
      version: result.ok ? (result.stdout || result.stderr).trim().split('\n')[0] || null : null,
      installCommand: tool.installCommand,
      error: result.ok ? null : result.stderr || result.stdout || 'CLI not found',
    }
  }

  private profileArgs(profile?: string): string[] {
    return profile?.trim() ? ['--profile', profile.trim()] : []
  }

  private runCommand(
    command: string,
    args: string[],
    timeoutMs = 30_000,
  ): Promise<ConnectorCommandResult> {
    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      const finish = (result: ConnectorCommandResult) => {
        if (settled) return
        settled = true
        resolve(result)
      }
      const child = spawn(command, args, {
        cwd: this.paths.root,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        timeout: timeoutMs,
        windowsHide: true,
      })

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.on('error', (err) => {
        finish({ ok: false, code: 1, stdout, stderr: stderr || err.message })
      })
      child.on('close', (code) => {
        finish({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() })
      })
    })
  }
}
