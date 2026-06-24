import { execFileSync, spawnSync } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ShadowClient } from '@shadowob/sdk'
import { Command } from 'commander'
import { DEFAULT_SERVER_URL, getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

type JsonPayloadOptions = {
  jsonInput?: string
  file?: string
}

const DEFAULT_EXPOSURE_CONFIG_PATH = '/run/shadow/exposure/desired.json'
const DEFAULT_EXPOSURE_STATUS_PATH = '/run/shadow/exposure/status.json'
const MAX_EXPOSURE_CONFIG_BYTES = 256 * 1024

type RuntimeExposureRequest = Parameters<
  ShadowClient['reconcileCloudRuntimeExposures']
>[0]['exposures'][number]

export function createCloudCommand(): Command {
  const cloud = new Command('cloud')
    .description('Shadow Cloud — deploy AI agent clusters to Kubernetes (via shadowob-cloud)')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async (_, cmd) => {
      const args = cmd.args ?? []
      ensureCloudCliInstalled()
      spawnCloudCli(args)
    })

  const templates = new Command('templates').description('Manage Shadow Cloud templates')

  templates
    .command('create')
    .description('Create a Shadow Cloud template from JSON')
    .option('--profile <name>', 'Profile to use')
    .option('--json-input <json>', 'Template JSON payload')
    .option('--file <path>', 'Read template JSON payload from file')
    .option('--json', 'Output as JSON')
    .action(async (options: JsonPayloadOptions & { profile?: string; json?: boolean }) => {
      const outputOpts: OutputOptions = { json: options.json }
      try {
        const payload = await parseJsonPayload(options, 'template')
        const client = await getClient(options.profile)
        const result = await client.createCloudTemplate(payload as never)
        output(result, outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), outputOpts)
        process.exit(1)
      }
    })

  const deployments = new Command('deployments').description('Manage Shadow Cloud deployments')

  deployments
    .command('list')
    .description('List Shadow Cloud deployments')
    .option('--profile <name>', 'Profile to use')
    .option('--include-history', 'Include historical deployments')
    .option('--limit <count>', 'Maximum number of deployments to return')
    .option('--offset <count>', 'Number of deployments to skip')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        profile?: string
        includeHistory?: boolean
        limit?: string
        offset?: string
        json?: boolean
      }) => {
        const outputOpts: OutputOptions = { json: options.json }
        try {
          const client = await getClient(options.profile)
          const result = await client.listCloudDeployments({
            includeHistory: options.includeHistory,
            limit: parseOptionalInteger(options.limit, 'limit'),
            offset: parseOptionalInteger(options.offset, 'offset'),
          })
          output(result, outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), outputOpts)
          process.exit(1)
        }
      },
    )

  deployments
    .command('get')
    .description('Get a Shadow Cloud deployment')
    .argument('<deployment-id>', 'Cloud deployment ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (deploymentId: string, options: { profile?: string; json?: boolean }) => {
      const outputOpts: OutputOptions = { json: options.json }
      try {
        const client = await getClient(options.profile)
        const result = await client.getCloudDeployment(deploymentId)
        output(result, outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), outputOpts)
        process.exit(1)
      }
    })

  deployments
    .command('create')
    .description('Create a Shadow Cloud deployment from JSON')
    .option('--profile <name>', 'Profile to use')
    .option('--json-input <json>', 'Deployment JSON payload')
    .option('--file <path>', 'Read deployment JSON payload from file')
    .option('--json', 'Output as JSON')
    .action(async (options: JsonPayloadOptions & { profile?: string; json?: boolean }) => {
      const outputOpts: OutputOptions = { json: options.json }
      try {
        const payload = await parseJsonPayload(options, 'deployment')
        const client = await getClient(options.profile)
        const result = await client.createCloudDeployment(payload as never)
        output(result, outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), outputOpts)
        process.exit(1)
      }
    })

  deployments
    .command('destroy')
    .description('Queue destruction of a Shadow Cloud deployment')
    .argument('<deployment-id>', 'Cloud deployment ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (deploymentId: string, options: { profile?: string; json?: boolean }) => {
      const outputOpts: OutputOptions = { json: options.json }
      try {
        const client = await getClient(options.profile)
        const result = await client.destroyCloudDeployment(deploymentId)
        if (options.json) {
          output(result, outputOpts)
          return
        }
        outputSuccess(
          `Destroy queued for deployment ${deploymentId} (${result.status})`,
          outputOpts,
        )
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), outputOpts)
        process.exit(1)
      }
    })

  const app = new Command('app').description('Expose and publish Apps from Shadow Cloud runtimes')

  app
    .command('watch-exposures')
    .description('Watch runtime exposure desired state and reconcile it with Shadow Cloud')
    .option('--deployment <id>', 'Cloud deployment ID')
    .option('--agent <id>', 'Runtime agent ID')
    .option('--config <path>', 'Desired exposure JSON path')
    .option('--status <path>', 'Status JSON output path')
    .option('--poll-interval <seconds>', 'Poll interval in seconds')
    .option('--once', 'Reconcile once and exit')
    .option('--profile <name>', 'Profile to use when no sidecar token is present')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        deployment?: string
        agent?: string
        config?: string
        status?: string
        pollInterval?: string
        once?: boolean
        profile?: string
        json?: boolean
      }) => {
        const outputOpts: OutputOptions = { json: options.json }
        try {
          const deploymentId = resolveDeploymentId(options.deployment)
          const agentId = resolveAgentId(options.agent)
          const configPath =
            options.config ?? envValue('SHADOW_EXPOSURE_CONFIG') ?? DEFAULT_EXPOSURE_CONFIG_PATH
          const statusPath =
            options.status ?? envValue('SHADOW_EXPOSURE_STATUS') ?? DEFAULT_EXPOSURE_STATUS_PATH
          const pollIntervalSeconds = parsePositiveInteger(
            options.pollInterval ?? envValue('SHADOW_EXPOSURE_POLL_INTERVAL_SECONDS') ?? String(2),
            'poll interval',
          )
          const client = await getExposureClient(options.profile)

          if (options.once) {
            const result = await reconcileExposureFile({
              client,
              deploymentId,
              agentId,
              configPath,
              statusPath,
            })
            output(result, outputOpts)
            return
          }

          await watchExposureFile({
            client,
            deploymentId,
            agentId,
            configPath,
            statusPath,
            pollIntervalSeconds,
            json: Boolean(options.json),
          })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), outputOpts)
          process.exit(1)
        }
      },
    )

  app
    .command('expose')
    .description('Create or update a Cloud exposure for a runtime service')
    .option('--deployment <id>', 'Cloud deployment ID')
    .option('--agent <id>', 'Runtime agent ID')
    .requiredOption('--id <local-id>', 'Local exposure ID')
    .requiredOption('--port <port>', 'Container port to expose')
    .option('--kind <kind>', 'Exposure kind: http_service or server_app', 'http_service')
    .option(
      '--visibility <visibility>',
      'Exposure visibility: private, signed, or public',
      'private',
    )
    .option('--auth <mode>', 'Auth mode: shadow_session, signed_link, server_app, or none')
    .option('--ttl <seconds>', 'Exposure TTL in seconds')
    .option('--display-name <name>', 'Display name for status output')
    .option('--health-path <path>', 'Health check path')
    .option('--app-key <key>', 'App key when exposing an App')
    .option('--manifest-path <path>', 'Manifest path exposed by the runtime service')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        deployment: string
        agent: string
        id: string
        port: string
        kind: 'http_service' | 'server_app'
        visibility: 'private' | 'signed' | 'public'
        auth?: 'shadow_session' | 'signed_link' | 'server_app' | 'none'
        ttl?: string
        displayName?: string
        healthPath?: string
        appKey?: string
        manifestPath?: string
        profile?: string
        json?: boolean
      }) => {
        const outputOpts: OutputOptions = { json: options.json }
        try {
          const deploymentId = resolveDeploymentId(options.deployment)
          const agentId = resolveAgentId(options.agent)
          const client = await getClient(options.profile)
          const result = await client.reconcileCloudRuntimeExposures({
            deploymentId,
            agentId,
            exposures: [
              {
                id: options.id,
                port: parsePositiveInteger(options.port, 'port'),
                kind: options.kind,
                visibility: options.visibility,
                auth: options.auth,
                ttlSeconds: parseOptionalInteger(options.ttl, 'ttl'),
                displayName: options.displayName,
                healthPath: options.healthPath,
                appKey: options.appKey,
                manifestPath: options.manifestPath,
              },
            ],
          })
          output(result, outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), outputOpts)
          process.exit(1)
        }
      },
    )

  app
    .command('publish')
    .description('Publish a runtime App with a stable Cloud host and optional server installation')
    .option('--deployment <id>', 'Cloud deployment ID')
    .option('--agent <id>', 'Runtime agent ID')
    .option('--server <id-or-slug>', 'Server ID or slug to install into')
    .requiredOption('--port <port>', 'Container port serving the App')
    .option('--manifest-file <path>', 'Read App manifest JSON from file')
    .option('--manifest-url <url>', 'Fetch App manifest from an HTTPS URL')
    .option('--app-key <key>', 'Expected App key')
    .option('--source-path <path>', 'Runtime source path to record')
    .option('--state-paths <paths>', 'Comma-separated runtime state paths to back up')
    .option(
      '--visibility <visibility>',
      'Exposure visibility: private, signed, or public',
      'private',
    )
    .option('--release-mode <mode>', 'Release mode: preview, promoted, or installed', 'installed')
    .option('--permissions <permissions>', 'Comma-separated default permissions')
    .option('--approval-mode <mode>', 'Default approval mode', 'none')
    .option('--buddy <buddy-id>', 'Buddy ID to grant after install')
    .option('--grant-permissions <permissions>', 'Comma-separated Buddy grant permissions, or *')
    .option('--backup-driver <driver>', 'Backup driver metadata, volumeSnapshot, restic, or git')
    .option('--no-backup-on-publish', 'Skip creating a publish BackupSet')
    .option(
      '--no-install',
      'Create the stable Cloud App release without installing into the server',
    )
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        deployment: string
        agent: string
        server: string
        port: string
        manifestFile?: string
        manifestUrl?: string
        appKey?: string
        sourcePath?: string
        statePaths?: string
        visibility: 'private' | 'signed' | 'public'
        releaseMode: 'preview' | 'promoted' | 'installed'
        permissions?: string
        approvalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
        buddy?: string
        grantPermissions?: string
        backupDriver?: 'metadata' | 'volumeSnapshot' | 'restic' | 'git'
        backupOnPublish?: boolean
        install?: boolean
        profile?: string
        json?: boolean
      }) => {
        const outputOpts: OutputOptions = { json: options.json }
        try {
          if (!options.manifestFile && !options.manifestUrl) {
            throw new Error('Pass --manifest-file or --manifest-url')
          }
          if (options.manifestFile && options.manifestUrl) {
            throw new Error('Use either --manifest-file or --manifest-url, not both')
          }
          const manifest = options.manifestFile
            ? await readJsonFile(options.manifestFile, 'manifest')
            : undefined
          const statePaths = parseCsv(options.statePaths)
          const deploymentId = resolveDeploymentId(options.deployment)
          const agentId = resolveAgentId(options.agent)
          const client = await getClient(options.profile)
          const serverId = await resolveServerId(client, options.server)
          const result = await client.publishCloudApp({
            deploymentId,
            agentId,
            serverId,
            port: parsePositiveInteger(options.port, 'port'),
            manifest,
            manifestUrl: options.manifestUrl,
            appKey: options.appKey,
            sourcePath: options.sourcePath,
            statePaths,
            visibility: options.visibility,
            releaseMode: options.releaseMode,
            install: options.install,
            defaultPermissions: parseCsv(options.permissions),
            defaultApprovalMode: options.approvalMode,
            buddyGrants:
              options.buddy && options.grantPermissions
                ? [
                    {
                      buddyAgentId: options.buddy,
                      permissions: parseCsv(options.grantPermissions),
                      approvalMode: options.approvalMode,
                    },
                  ]
                : undefined,
            backupOnPublish: options.backupOnPublish,
            backupPolicy: {
              statePaths,
              backupOnPublish: options.backupOnPublish,
              driver: options.backupDriver ?? 'metadata',
            },
          })
          output(result, outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), outputOpts)
          process.exit(1)
        }
      },
    )

  app
    .command('status')
    .description('Show Cloud App exposure, release, and backup status')
    .argument('[app-key]', 'App key')
    .option('--app-key <key>', 'App key')
    .option('--deployment <id>', 'Cloud deployment ID')
    .option('--server <id>', 'Server ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appKeyArg: string | undefined,
        options: {
          appKey?: string
          deployment?: string
          server?: string
          profile?: string
          json?: boolean
        },
      ) => {
        const outputOpts: OutputOptions = { json: options.json }
        try {
          const appKey = requireAppKey(appKeyArg, options.appKey)
          const client = await getClient(options.profile)
          output(
            await client.getCloudAppStatus(appKey, {
              deploymentId: defaultDeploymentId(options.deployment),
              serverId: defaultOptionalServerId(options.server),
            }),
            outputOpts,
          )
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), outputOpts)
          process.exit(1)
        }
      },
    )

  app
    .command('backup')
    .description('Create a BackupSet for a Cloud App')
    .argument('[app-key]', 'App key')
    .option('--app-key <key>', 'App key')
    .option('--deployment <id>', 'Cloud deployment ID')
    .option('--server <id>', 'Server ID')
    .option('--deployment-backup <id>', 'Existing deployment backup ID to link as state')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appKeyArg: string | undefined,
        options: {
          appKey?: string
          deployment?: string
          server?: string
          deploymentBackup?: string
          profile?: string
          json?: boolean
        },
      ) => {
        const outputOpts: OutputOptions = { json: options.json }
        try {
          const appKey = requireAppKey(appKeyArg, options.appKey)
          const client = await getClient(options.profile)
          output(
            await client.backupCloudApp(appKey, {
              deploymentId: defaultDeploymentId(options.deployment),
              serverId: defaultOptionalServerId(options.server),
              deploymentBackupId: options.deploymentBackup,
            }),
            outputOpts,
          )
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), outputOpts)
          process.exit(1)
        }
      },
    )

  app
    .command('restore')
    .description('Restore a Cloud App from a BackupSet')
    .argument('[app-key]', 'App key')
    .requiredOption('--backup <id>', 'BackupSet ID')
    .option('--app-key <key>', 'App key')
    .option('--deployment <id>', 'Cloud deployment ID')
    .option('--server <id>', 'Server ID')
    .option('--strategy <strategy>', 'Restore strategy: in_place or new_release', 'in_place')
    .option('--no-safety-backup', 'Skip pre-restore safety BackupSet')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appKeyArg: string | undefined,
        options: {
          backup: string
          appKey?: string
          deployment?: string
          server?: string
          strategy?: 'in_place' | 'new_release'
          safetyBackup?: boolean
          profile?: string
          json?: boolean
        },
      ) => {
        const outputOpts: OutputOptions = { json: options.json }
        try {
          const appKey = requireAppKey(appKeyArg, options.appKey)
          const client = await getClient(options.profile)
          output(
            await client.restoreCloudApp(appKey, {
              backupSetId: options.backup,
              deploymentId: defaultDeploymentId(options.deployment),
              serverId: defaultOptionalServerId(options.server),
              strategy: options.strategy,
              createSafetyBackup: options.safetyBackup,
            }),
            outputOpts,
          )
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), outputOpts)
          process.exit(1)
        }
      },
    )

  app
    .command('unpublish')
    .description('Close a Cloud App exposure and optionally uninstall it')
    .argument('[app-key]', 'App key')
    .option('--app-key <key>', 'App key')
    .option('--deployment <id>', 'Cloud deployment ID')
    .option('--server <id>', 'Server ID')
    .option('--uninstall', 'Also uninstall the App from the server')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appKeyArg: string | undefined,
        options: {
          appKey?: string
          deployment?: string
          server?: string
          uninstall?: boolean
          profile?: string
          json?: boolean
        },
      ) => {
        const outputOpts: OutputOptions = { json: options.json }
        try {
          const appKey = requireAppKey(appKeyArg, options.appKey)
          const client = await getClient(options.profile)
          output(
            await client.unpublishCloudApp(appKey, {
              deploymentId: defaultDeploymentId(options.deployment),
              serverId: defaultOptionalServerId(options.server),
              uninstall: options.uninstall,
            }),
            outputOpts,
          )
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), outputOpts)
          process.exit(1)
        }
      },
    )

  cloud.addCommand(templates)
  cloud.addCommand(deployments)
  cloud.addCommand(app)

  return cloud
}

async function parseJsonPayload(options: JsonPayloadOptions, label: string): Promise<unknown> {
  if (options.jsonInput && options.file) {
    throw new Error(`Use either --json-input or --file for ${label}, not both`)
  }
  if (!options.jsonInput && !options.file) {
    throw new Error(`Missing ${label} payload. Pass --json-input or --file.`)
  }

  const source = options.file ? await readFile(options.file, 'utf8') : options.jsonInput
  try {
    return JSON.parse(source ?? '')
  } catch (error) {
    throw new Error(
      `Invalid ${label} JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function parseOptionalInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return parsed
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return parsed
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function requireAppKey(argument: string | undefined, option: string | undefined): string {
  const appKey = option ?? argument
  if (!appKey) throw new Error('Missing app key. Pass an argument or --app-key.')
  return appKey
}

function envValue(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

function defaultDeploymentId(value?: string): string | undefined {
  return value ?? envValue('SHADOW_CLOUD_DEPLOYMENT_ID', 'CLOUD_DEPLOYMENT_ID')
}

function defaultAgentId(value?: string): string | undefined {
  return value ?? envValue('AGENT_ID', 'SHADOW_AGENT_ID', 'SHADOW_CLOUD_AGENT_ID')
}

function defaultCurrentServerId(value?: string): string | undefined {
  return (
    value ??
    envValue('SHADOW_CURRENT_SERVER_ID', 'SHADOW_CURRENT_SERVER_SLUG') ??
    envValue('SHADOWOB_CURRENT_SERVER_ID', 'SHADOWOB_CURRENT_SERVER_SLUG')
  )
}

function defaultLegacyServerId(): string | undefined {
  return (
    envValue('SHADOWOB_SERVER_ID', 'SHADOW_SERVER_ID') ??
    envValue('SHADOWOB_SERVER_SLUG', 'SHADOW_SERVER_SLUG')
  )
}

function defaultOptionalServerId(value?: string): string | undefined {
  return defaultCurrentServerId(value) ?? defaultLegacyServerId()
}

function defaultContextChannelId(): string | undefined {
  return envValue(
    'SHADOWOB_TASK_CHANNEL_ID',
    'SHADOWOB_PARENT_TASK_CHANNEL_ID',
    'SHADOW_CURRENT_CHANNEL_ID',
    'SHADOW_CURRENT_CHANNEL',
    'SHADOWOB_CHANNEL_ID',
  )
}

function readServerIdFromChannel(channel: unknown): string | undefined {
  if (!isRecord(channel)) return undefined
  const value = channel.serverId ?? channel.server_id
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireRuntimeContext(
  value: string | undefined,
  label: string,
  option: string,
  envKeys: string[],
): string {
  if (value) return value
  throw new Error(`Missing ${label}. Pass ${option} or set one of: ${envKeys.join(', ')}.`)
}

function resolveDeploymentId(value?: string): string {
  return requireRuntimeContext(defaultDeploymentId(value), 'Cloud deployment ID', '--deployment', [
    'SHADOW_CLOUD_DEPLOYMENT_ID',
    'CLOUD_DEPLOYMENT_ID',
  ])
}

function resolveAgentId(value?: string): string {
  return requireRuntimeContext(defaultAgentId(value), 'runtime agent ID', '--agent', [
    'AGENT_ID',
    'SHADOW_AGENT_ID',
    'SHADOW_CLOUD_AGENT_ID',
  ])
}

async function resolveServerId(client: ShadowClient, value?: string): Promise<string> {
  const currentServerId = defaultCurrentServerId(value)
  if (currentServerId) return currentServerId

  const channelId = defaultContextChannelId()
  if (channelId) {
    const channel = await client.getChannel(channelId).catch((error: unknown) => {
      throw new Error(
        `Could not infer server from current channel ${channelId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })
    const serverId = readServerIdFromChannel(channel)
    if (serverId) return serverId
    throw new Error('Current channel is not a server channel. Pass --server explicitly.')
  }

  const legacyServerId = defaultLegacyServerId()
  if (legacyServerId) return legacyServerId

  return requireRuntimeContext(undefined, 'server ID or slug', '--server', [
    'SHADOW_CURRENT_SERVER_ID',
    'SHADOW_CURRENT_SERVER_SLUG',
    'SHADOWOB_TASK_CHANNEL_ID',
    'SHADOWOB_PARENT_TASK_CHANNEL_ID',
    'SHADOW_CURRENT_CHANNEL_ID',
    'SHADOWOB_CHANNEL_ID',
    'SHADOWOB_SERVER_ID (legacy)',
    'SHADOW_SERVER_ID (legacy)',
  ])
}

async function readJsonFile(path: string, label: string): Promise<Record<string, unknown>> {
  const source = await readFile(path, 'utf8')
  try {
    return JSON.parse(source) as Record<string, unknown>
  } catch (error) {
    throw new Error(
      `Invalid ${label} JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

async function getExposureClient(profile?: string): Promise<ShadowClient> {
  const token = envValue('SHADOW_CLOUD_EXPOSURE_TOKEN')
  if (!token) return getClient(profile)

  const serverUrl =
    envValue('SHADOW_SERVER_URL', 'SHADOW_AGENT_SERVER_URL', 'SHADOWOB_SERVER_URL') ??
    DEFAULT_SERVER_URL
  return new ShadowClient(serverUrl, token)
}

async function readExposureDesiredFile(path: string): Promise<{
  desiredRevision?: string
  exposures: RuntimeExposureRequest[]
} | null> {
  let info
  try {
    info = await stat(path)
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return null
    throw error
  }
  if (info.size > MAX_EXPOSURE_CONFIG_BYTES) {
    throw new Error(
      `Exposure desired-state file is too large (${info.size} bytes; max ${MAX_EXPOSURE_CONFIG_BYTES})`,
    )
  }

  const source = await readFile(path, 'utf8')
  const parsed = JSON.parse(source) as unknown
  if (!isRecord(parsed)) {
    throw new Error('Exposure desired-state JSON must be an object')
  }
  const exposures = parsed.exposures
  if (!Array.isArray(exposures)) {
    throw new Error('Exposure desired-state JSON must contain an exposures array')
  }
  if (exposures.length > 32) {
    throw new Error('Exposure desired-state JSON may contain at most 32 exposures')
  }

  return {
    desiredRevision:
      typeof parsed.desiredRevision === 'string' ? parsed.desiredRevision.slice(0, 128) : undefined,
    exposures: exposures.map(normalizeDesiredExposure),
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`)
  return parsed
}

function normalizeDesiredExposure(value: unknown): RuntimeExposureRequest {
  if (!isRecord(value)) throw new Error('Each exposure must be an object')
  const id = optionalString(value.id)
  if (!id) throw new Error('Each exposure must include an id')
  const port = optionalInteger(value.port, `Exposure ${id} port`)
  if (!port || port < 1 || port > 65535) {
    throw new Error(`Exposure ${id} port must be between 1 and 65535`)
  }

  return {
    id,
    port,
    kind: value.kind === 'server_app' || value.kind === 'http_service' ? value.kind : undefined,
    visibility:
      value.visibility === 'private' ||
      value.visibility === 'signed' ||
      value.visibility === 'public'
        ? value.visibility
        : undefined,
    auth:
      value.auth === 'shadow_session' ||
      value.auth === 'signed_link' ||
      value.auth === 'server_app' ||
      value.auth === 'none'
        ? value.auth
        : undefined,
    ttlSeconds: optionalInteger(value.ttlSeconds, `Exposure ${id} ttlSeconds`),
    displayName: optionalString(value.displayName),
    healthPath: optionalString(value.healthPath),
    appKey: optionalString(value.appKey),
    manifestPath: optionalString(value.manifestPath),
    policy: isRecord(value.policy) ? value.policy : undefined,
  }
}

async function writeExposureStatus(path: string, payload: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    `${JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }, null, 2)}\n`,
  )
}

async function reconcileExposureFile(options: {
  client: ShadowClient
  deploymentId: string
  agentId: string
  configPath: string
  statusPath: string
}): Promise<Record<string, unknown>> {
  try {
    const desired = await readExposureDesiredFile(options.configPath)
    if (!desired) {
      const skipped = {
        ok: true,
        skipped: true,
        reason: 'desired_state_missing',
        configPath: options.configPath,
      }
      await writeExposureStatus(options.statusPath, skipped)
      return skipped
    }

    const result = await options.client.reconcileCloudRuntimeExposures({
      deploymentId: options.deploymentId,
      agentId: options.agentId,
      desiredRevision: desired.desiredRevision,
      exposures: desired.exposures,
    })
    await writeExposureStatus(options.statusPath, { ok: true, result })
    return result as unknown as Record<string, unknown>
  } catch (error) {
    const failure = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      configPath: options.configPath,
    }
    await writeExposureStatus(options.statusPath, failure).catch(() => {})
    throw error
  }
}

function exposureFingerprint(value: { desiredRevision?: string; exposures: unknown[] } | null) {
  return value ? JSON.stringify(value) : 'missing'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function watchExposureFile(options: {
  client: ShadowClient
  deploymentId: string
  agentId: string
  configPath: string
  statusPath: string
  pollIntervalSeconds: number
  json: boolean
}): Promise<never> {
  let lastFingerprint: string | undefined
  for (;;) {
    try {
      const desired = await readExposureDesiredFile(options.configPath)
      const nextFingerprint = exposureFingerprint(desired)
      if (nextFingerprint !== lastFingerprint) {
        const result = await reconcileExposureFile(options)
        if (options.json) {
          console.log(JSON.stringify(result))
        } else if (desired) {
          console.log(
            `[shadow-exposure-agent] reconciled ${desired.exposures.length} exposure(s) for ${options.agentId}`,
          )
        } else {
          console.log(`[shadow-exposure-agent] waiting for ${options.configPath}`)
        }
        lastFingerprint = nextFingerprint
      }
    } catch (error) {
      console.error(
        `[shadow-exposure-agent] reconcile failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
    await sleep(options.pollIntervalSeconds * 1000)
  }
}

function ensureCloudCliInstalled(): void {
  try {
    execFileSync('shadowob-cloud', ['--version'], { stdio: 'ignore' })
  } catch {
    console.error('shadowob-cloud is not installed.')
    console.error('Install it with: npm install -g @shadowob/cloud')
    process.exit(1)
  }
}

function spawnCloudCli(args: string[]): void {
  const result = spawnSync('shadowob-cloud', args, { stdio: 'inherit' })
  if (result.status !== null) {
    process.exit(result.status)
  }
}
