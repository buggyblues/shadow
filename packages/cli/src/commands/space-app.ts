import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import {
  BUDDY_INBOX_DELIVERY_PERMISSION,
  ShadowClient,
  type ShadowSpaceAppCommand,
  type ShadowSpaceAppManifest,
} from '@shadowob/sdk'
import { Command } from 'commander'
import { DEFAULT_SERVER_URL, getClient, resolveServerFlag } from '../utils/client.js'
import { output, outputError, outputSuccess } from '../utils/output.js'
import { generateSpaceAppScaffold } from '../utils/space-app-scaffold.js'

const DEFAULT_EXPOSURE_CONFIG_PATH = '/run/shadow/exposure/desired.json'
const DEFAULT_EXPOSURE_STATUS_PATH = '/run/shadow/exposure/status.json'
const MAX_EXPOSURE_CONFIG_BYTES = 256 * 1024

type RuntimeExposureRequest = Parameters<
  ShadowClient['reconcileCloudRuntimeExposures']
>[0]['exposures'][number]

function parseJsonInput(value?: string) {
  if (!value) return {}
  const parsed = JSON.parse(value)
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'input' in parsed &&
    Object.keys(parsed).every((key) => key === 'input' || key === 'channelId')
  ) {
    return (parsed as { input?: unknown }).input ?? {}
  }
  return parsed
}

async function readJsonFile(path: string, label = 'JSON') {
  const source = await readFile(path, 'utf8')
  try {
    return JSON.parse(source) as Record<string, unknown>
  } catch (error) {
    throw new Error(`Invalid ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function parsePermissions(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return []
  return parsePermissions(value)
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

function envValue(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

function defaultDeploymentId(value?: string): string | undefined {
  return value ?? envValue('SHADOWOB_CLOUD_DEPLOYMENT_ID')
}

function defaultAgentId(value?: string): string | undefined {
  return value ?? envValue('SHADOWOB_AGENT_ID')
}

function defaultCurrentServerId(value?: string): string | undefined {
  return value ?? envValue('SHADOWOB_SERVER_ID', 'SHADOWOB_SERVER_SLUG')
}

function defaultOptionalServerId(value?: string): string | undefined {
  return defaultCurrentServerId(value)
}

function defaultContextChannelId(): string | undefined {
  return envValue(
    'SHADOWOB_TASK_CHANNEL_ID',
    'SHADOWOB_PARENT_TASK_CHANNEL_ID',
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
    'SHADOWOB_CLOUD_DEPLOYMENT_ID',
  ])
}

function resolveAgentId(value?: string): string {
  return requireRuntimeContext(defaultAgentId(value), 'runtime agent ID', '--agent', [
    'SHADOWOB_AGENT_ID',
  ])
}

async function resolveRuntimeServerId(client: ShadowClient, value?: string): Promise<string> {
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

  return requireRuntimeContext(undefined, 'server ID or slug', '--server', [
    'SHADOWOB_SERVER_ID',
    'SHADOWOB_SERVER_SLUG',
    'SHADOWOB_TASK_CHANNEL_ID',
    'SHADOWOB_PARENT_TASK_CHANNEL_ID',
    'SHADOWOB_CHANNEL_ID',
  ])
}

function commandHandlerError(error: unknown, json?: boolean) {
  outputError(error instanceof Error ? error.message : String(error), { json })
  process.exit(1)
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function normalizePublicBaseUrl(value: string) {
  const url = new URL(value)
  url.hash = ''
  url.search = ''
  return url.toString().replace(/\/$/u, '')
}

function isLocalOrPrivateUrl(value: string | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return (
      url.protocol === 'http:' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.local') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./u.test(hostname)
    )
  } catch {
    return false
  }
}

function rewriteUrlToBase(value: string | undefined, baseUrl: string) {
  if (!value) return value
  try {
    const original = new URL(value)
    return new URL(`${original.pathname}${original.search}${original.hash}`, baseUrl).toString()
  } catch {
    return value
  }
}

function rewriteManifestBaseUrl(
  manifest: ShadowSpaceAppManifest,
  baseUrl: string,
): ShadowSpaceAppManifest {
  const normalizedBaseUrl = normalizePublicBaseUrl(baseUrl)
  const origin = new URL(normalizedBaseUrl).origin
  return {
    ...manifest,
    iconUrl: rewriteUrlToBase(manifest.iconUrl, normalizedBaseUrl) ?? manifest.iconUrl,
    api: {
      ...manifest.api,
      baseUrl: normalizedBaseUrl,
    },
    iframe: manifest.iframe
      ? {
          ...manifest.iframe,
          entry: rewriteUrlToBase(manifest.iframe.entry, normalizedBaseUrl) ?? normalizedBaseUrl,
          allowedOrigins: [origin],
        }
      : manifest.iframe,
  }
}

function assertPublishableManifest(manifest: ShadowSpaceAppManifest) {
  const urls = [
    manifest.api.baseUrl,
    manifest.iframe?.entry,
    manifest.iconUrl,
    ...(manifest.iframe?.allowedOrigins ?? []),
  ].filter((value): value is string => Boolean(value))

  const unsafe = urls.find(isLocalOrPrivateUrl)
  if (unsafe) {
    throw new Error(
      [
        `Space App manifest contains a local or private URL: ${unsafe}`,
        'Pass --base-url with a stable HTTPS Space App URL, or use the Cloud exposure publish flow when it is available.',
      ].join('\n'),
    )
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function requireAppKey(argument: string | undefined, option: string | undefined): string {
  const appKey = option ?? argument
  if (!appKey) throw new Error('Missing app key. Pass an argument or --app-key.')
  return appKey
}

async function getExposureClient(profile?: string): Promise<ShadowClient> {
  const token = envValue('SHADOWOB_CLOUD_EXPOSURE_TOKEN')
  if (!token) return getClient(profile)

  const serverUrl = envValue('SHADOWOB_SERVER_URL') ?? DEFAULT_SERVER_URL
  return new ShadowClient(serverUrl, token)
}

function commandSummary(command: ShadowSpaceAppCommand) {
  return command.help?.summary ?? command.description ?? command.title ?? command.permission
}

function formatAppCommandHelp(input: {
  appKey: string
  serverId: string
  manifest: ShadowSpaceAppManifest
  commandName?: string
}) {
  const { appKey, serverId, manifest, commandName } = input
  const command = commandName
    ? manifest.commands.find((item) => item.name === commandName)
    : undefined
  if (commandName && !command) throw new Error(`Space App command not found: ${commandName}`)

  if (!command) {
    const lines = [
      `${manifest.name} (${appKey})`,
      manifest.description ?? '',
      manifest.help?.overview ?? '',
      '',
      'Usage:',
      `  shadowob space-app call ${appKey} <command> --server "${serverId}" --json-input '<input-json>' --json`,
      `  shadowob space-app call ${appKey} <command> --server "${serverId}" --help`,
      manifest.binary?.supported
        ? `  shadowob space-app call ${appKey} <command> --server "${serverId}" --file ./artifact.html --json-input '<input-json>' --json`
        : '',
      '',
      'Commands:',
      ...manifest.commands.map((item) => `  ${item.name.padEnd(24)} ${commandSummary(item)}`),
      manifest.realtime
        ? [
            '',
            'Realtime:',
            `  shadowob space-app events ${appKey} --server "${serverId}" --json`,
            manifest.realtime.subscribe?.help ?? '',
            manifest.realtime.publish?.help ?? '',
          ].join('\n')
        : '',
    ]
    return lines.filter(Boolean).join('\n')
  }

  const help = command.help
  const usage =
    help?.usage ??
    `shadowob space-app call ${appKey} ${command.name} --server "${serverId}" --json-input '<input-json>' --json`
  const lines = [
    `${manifest.name} ${command.name}`,
    commandSummary(command),
    '',
    'Usage:',
    `  ${usage}`,
    command.binary?.supported || command.input === 'multipart'
      ? `  shadowob space-app call ${appKey} ${command.name} --server "${serverId}" --file ./artifact.html --json-input '<input-json>' --json`
      : '',
    help?.details ? ['', help.details].join('\n') : '',
    help?.examples?.length
      ? [
          '',
          'Examples:',
          ...help.examples.flatMap((example) => {
            const rendered = example.command
              ? [`  ${example.command}`]
              : example.input !== undefined
                ? [`  ${prettyJson(example.input).replace(/\n/g, '\n  ')}`]
                : []
            return example.title ? [`  # ${example.title}`, ...rendered] : rendered
          }),
        ].join('\n')
      : '',
    command.inputSchema ? ['', 'Input schema:', prettyJson(command.inputSchema)].join('\n') : '',
  ]
  return lines.filter(Boolean).join('\n')
}

function parseSseEvents(chunk: string, carry: string) {
  const frames = `${carry}${chunk}`.split(/\r?\n\r?\n/u)
  return {
    complete: frames.slice(0, -1),
    carry: frames.at(-1) ?? '',
  }
}

function decodeSseFrame(frame: string) {
  let event = 'message'
  const data: string[] = []
  for (const line of frame.split(/\r?\n/u)) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  return { event, data: data.join('\n') }
}

async function streamSpaceAppEvents(input: {
  url: string
  launchToken: string
  event?: string
  limit?: number
  json?: boolean
}) {
  const response = await fetch(input.url, {
    headers: { Accept: 'text/event-stream', Authorization: `Bearer ${input.launchToken}` },
  })
  if (!response.ok || !response.body) {
    throw new Error(`Event stream failed (${response.status})`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let carry = ''
  let count = 0
  const stop = () => reader.cancel().catch(() => undefined)
  process.once('SIGINT', stop)
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      const parsed = parseSseEvents(decoder.decode(next.value, { stream: true }), carry)
      carry = parsed.carry
      for (const frame of parsed.complete) {
        const decoded = decodeSseFrame(frame)
        if (!decoded.data || (input.event && decoded.event !== input.event)) continue
        let payload: unknown = decoded.data
        try {
          payload = JSON.parse(decoded.data)
        } catch {
          // Keep plain text event payloads readable.
        }
        if (input.json) console.log(JSON.stringify({ event: decoded.event, data: payload }))
        else
          console.log(
            `[${decoded.event}] ${typeof payload === 'string' ? payload : prettyJson(payload)}`,
          )
        count += 1
        if (input.limit && count >= input.limit) return
      }
    }
  } finally {
    process.off('SIGINT', stop)
  }
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
    kind: value.kind === 'space_app' || value.kind === 'http_service' ? value.kind : undefined,
    visibility:
      value.visibility === 'private' ||
      value.visibility === 'signed' ||
      value.visibility === 'public'
        ? value.visibility
        : undefined,
    auth:
      value.auth === 'shadow_session' ||
      value.auth === 'signed_link' ||
      value.auth === 'space_app' ||
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

export function createSpaceAppCommand(): Command {
  const app = new Command('space-app').description('Space App commands')

  app
    .command('generate')
    .description('Generate a minimal Space App scaffold')
    .argument('<app-key>', 'Lowercase stable app key')
    .option('--dir <path>', 'Output directory; defaults to ./<app-key>')
    .option('--name <name>', 'Display name for the generated manifest')
    .option('--description <text>', 'Description for the generated manifest')
    .option('--port <port>', 'Local development port', '4201')
    .option('--force', 'Overwrite existing scaffold files')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appKey: string,
        options: {
          dir?: string
          name?: string
          description?: string
          port?: string
          force?: boolean
          json?: boolean
        },
      ) => {
        try {
          const port = Number.parseInt(options.port ?? '4201', 10)
          const result = await generateSpaceAppScaffold({
            appKey,
            directory: options.dir,
            name: options.name,
            description: options.description,
            port,
            force: options.force,
          })
          if (options.json) {
            output(result, { json: true })
            return
          }
          outputSuccess(`Generated Space App scaffold at ${result.directory}`, {
            json: options.json,
          })
          console.log(
            [
              '',
              'Next steps:',
              `  cd ${result.directory}`,
              '  pnpm install',
              '  cp .env.example .env',
              '  pnpm dev',
              '  shadowob space-app preview --server <server> --manifest-file space-app.local.json --json',
            ].join('\n'),
          )
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('list')
    .description('List apps installed in a server')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { server: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const apps = await client.listSpaceApps(resolveServerFlag(options.server))
        output(
          apps.map((entry) => ({
            id: entry.id,
            name: `${entry.appKey} (${entry.name})`,
          })),
          { json: options.json },
        )
      } catch (error) {
        commandHandlerError(error, options.json)
      }
    })

  app
    .command('publish')
    .alias('update')
    .description('Publish, install, or update a Space App from a local or hosted manifest')
    .option('--server <server>', 'Server ID or slug')
    .option('--deployment <id>', 'Cloud deployment ID when publishing from a runtime')
    .option('--agent <id>', 'Runtime agent ID when publishing from a runtime')
    .option('--port <port>', 'Runtime port serving the Space App')
    .option('--manifest-file <path>', 'Local manifest JSON file', 'space-app.local.json')
    .option('--manifest-url <url>', 'Hosted manifest URL')
    .option('--app-key <key>', 'Expected Space App key when publishing from a runtime')
    .option('--source-path <path>', 'Runtime source path to record')
    .option('--state-paths <paths>', 'Comma-separated runtime state paths to back up')
    .option(
      '--visibility <visibility>',
      'Runtime exposure visibility: private, signed, or public',
      'private',
    )
    .option('--release-mode <mode>', 'Release mode: preview, promoted, or installed', 'installed')
    .option(
      '--base-url <url>',
      'Stable public HTTPS Space App URL used to rewrite local manifest URLs before installing',
    )
    .option('--permissions <permissions>', 'Comma-separated default permissions after install')
    .option('--buddy <buddy-id>', 'Buddy ID to grant after install')
    .option('--grant-permissions <permissions>', 'Comma-separated Buddy grant permissions, or *')
    .option('--approval-mode <mode>', 'none, first_time, every_time, or policy', 'none')
    .option('--backup-driver <driver>', 'Backup driver metadata, volumeSnapshot, restic, or git')
    .option('--no-backup-on-publish', 'Skip creating a publish BackupSet')
    .option('--no-install', 'Create the runtime release without installing into the server')
    .option('--launch', 'Create a Space App launch context after publishing')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        server?: string
        deployment?: string
        agent?: string
        port?: string
        manifestFile?: string
        manifestUrl?: string
        appKey?: string
        sourcePath?: string
        statePaths?: string
        visibility: 'private' | 'signed' | 'public'
        releaseMode: 'preview' | 'promoted' | 'installed'
        baseUrl?: string
        permissions?: string
        buddy?: string
        grantPermissions?: string
        approvalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
        backupDriver?: 'metadata' | 'volumeSnapshot' | 'restic' | 'git'
        backupOnPublish?: boolean
        install?: boolean
        launch?: boolean
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)

          if (options.port) {
            const manifestFile = options.manifestUrl ? undefined : options.manifestFile
            if (!manifestFile && !options.manifestUrl) {
              throw new Error('Pass --manifest-file or --manifest-url')
            }
            const manifest = manifestFile
              ? await readJsonFile(manifestFile, 'manifest JSON')
              : undefined
            const statePaths = parseCsv(options.statePaths)
            const result = await client.publishCloudApp({
              deploymentId: resolveDeploymentId(options.deployment),
              agentId: resolveAgentId(options.agent),
              serverId: await resolveRuntimeServerId(client, options.server),
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
            output(result, { json: options.json })
            return
          }

          const server = resolveServerFlag(options.server)
          const baseUrl = options.baseUrl ?? process.env.SHADOWOB_APP_PUBLIC_BASE_URL
          const rawManifest = options.manifestUrl
            ? undefined
            : ((await readJsonFile(options.manifestFile ?? 'space-app.local.json')) as never)
          const manifest =
            rawManifest && baseUrl
              ? rewriteManifestBaseUrl(rawManifest as ShadowSpaceAppManifest, baseUrl)
              : rawManifest
                ? (rawManifest as ShadowSpaceAppManifest)
                : undefined
          if (manifest) assertPublishableManifest(manifest)

          const installation = await client.installSpaceApp(server, {
            manifestUrl: options.manifestUrl,
            manifest,
          })
          const defaults = options.permissions
            ? await client.updateSpaceAppAccessPolicy(server, installation.appKey, {
                defaultPermissions: parsePermissions(options.permissions),
                defaultApprovalMode: options.approvalMode,
              })
            : undefined
          const grant =
            options.buddy && options.grantPermissions
              ? await client.grantSpaceAppToBuddy(server, installation.appKey, {
                  buddyAgentId: options.buddy,
                  permissions: parsePermissions(options.grantPermissions),
                  approvalMode: options.approvalMode,
                })
              : undefined
          const launch = options.launch
            ? await client.createSpaceAppLaunch(server, installation.appKey)
            : undefined

          output(
            {
              ok: true,
              appKey: installation.appKey,
              installation,
              ...(defaults ? { defaults } : {}),
              ...(grant ? { grant } : {}),
              ...(launch
                ? {
                    launch: {
                      ...launch,
                      eventStreamUrl: client.spaceAppEventStreamUrl(launch.eventStreamPath),
                    },
                  }
                : {}),
            },
            { json: options.json },
          )
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('preview')
    .description('Discover and preview a Space App manifest before installing it')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--manifest-url <url>', 'Manifest URL')
    .option('--manifest-file <path>', 'Local manifest JSON file')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        server: string
        manifestUrl?: string
        manifestFile?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          if (!options.manifestUrl && !options.manifestFile) {
            throw new Error('Pass --manifest-url or --manifest-file')
          }
          const client = await getClient(options.profile)
          const manifest = options.manifestFile
            ? await readJsonFile(options.manifestFile)
            : undefined
          output(
            await client.discoverSpaceApp(resolveServerFlag(options.server), {
              manifestUrl: options.manifestUrl,
              manifest: manifest as never,
            }),
            { json: options.json },
          )
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('watch-exposures')
    .description('Watch runtime exposure desired state and reconcile it with Shadow')
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
        try {
          const deploymentId = resolveDeploymentId(options.deployment)
          const agentId = resolveAgentId(options.agent)
          const configPath =
            options.config ?? envValue('SHADOWOB_EXPOSURE_CONFIG') ?? DEFAULT_EXPOSURE_CONFIG_PATH
          const statusPath =
            options.status ?? envValue('SHADOWOB_EXPOSURE_STATUS') ?? DEFAULT_EXPOSURE_STATUS_PATH
          const pollIntervalSeconds = parsePositiveInteger(
            options.pollInterval ??
              envValue('SHADOWOB_EXPOSURE_POLL_INTERVAL_SECONDS') ??
              String(2),
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
            output(result, { json: options.json })
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
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('expose')
    .description('Create or update a runtime exposure for a Space App service')
    .option('--deployment <id>', 'Cloud deployment ID')
    .option('--agent <id>', 'Runtime agent ID')
    .requiredOption('--id <local-id>', 'Local exposure ID')
    .requiredOption('--port <port>', 'Container port to expose')
    .option('--kind <kind>', 'Exposure kind: http_service or space_app', 'http_service')
    .option(
      '--visibility <visibility>',
      'Exposure visibility: private, signed, or public',
      'private',
    )
    .option('--auth <mode>', 'Auth mode: shadow_session, signed_link, space_app, or none')
    .option('--ttl <seconds>', 'Exposure TTL in seconds')
    .option('--display-name <name>', 'Display name for status output')
    .option('--health-path <path>', 'Health check path')
    .option('--app-key <key>', 'Space App key when exposing a Space App')
    .option('--manifest-path <path>', 'Manifest path exposed by the runtime service')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        deployment?: string
        agent?: string
        id: string
        port: string
        kind: 'http_service' | 'space_app'
        visibility: 'private' | 'signed' | 'public'
        auth?: 'shadow_session' | 'signed_link' | 'space_app' | 'none'
        ttl?: string
        displayName?: string
        healthPath?: string
        appKey?: string
        manifestPath?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.reconcileCloudRuntimeExposures({
            deploymentId: resolveDeploymentId(options.deployment),
            agentId: resolveAgentId(options.agent),
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
          output(result, { json: options.json })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('status')
    .description('Show runtime Space App exposure, release, and backup status')
    .argument('[app-key]', 'Space App key')
    .option('--app-key <key>', 'Space App key')
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
        try {
          const appKey = requireAppKey(appKeyArg, options.appKey)
          const client = await getClient(options.profile)
          output(
            await client.getCloudAppStatus(appKey, {
              deploymentId: defaultDeploymentId(options.deployment),
              serverId: defaultOptionalServerId(options.server),
            }),
            { json: options.json },
          )
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('backup')
    .description('Create a BackupSet for a runtime Space App')
    .argument('[app-key]', 'Space App key')
    .option('--app-key <key>', 'Space App key')
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
        try {
          const appKey = requireAppKey(appKeyArg, options.appKey)
          const client = await getClient(options.profile)
          output(
            await client.backupCloudApp(appKey, {
              deploymentId: defaultDeploymentId(options.deployment),
              serverId: defaultOptionalServerId(options.server),
              deploymentBackupId: options.deploymentBackup,
            }),
            { json: options.json },
          )
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('restore')
    .description('Restore a runtime Space App from a BackupSet')
    .argument('[app-key]', 'Space App key')
    .requiredOption('--backup <id>', 'BackupSet ID')
    .option('--app-key <key>', 'Space App key')
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
            { json: options.json },
          )
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('unpublish')
    .description('Close a runtime Space App exposure and optionally uninstall it')
    .argument('[app-key]', 'Space App key')
    .option('--app-key <key>', 'Space App key')
    .option('--deployment <id>', 'Cloud deployment ID')
    .option('--server <id>', 'Server ID')
    .option('--uninstall', 'Also uninstall the Space App from the server')
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
        try {
          const appKey = requireAppKey(appKeyArg, options.appKey)
          const client = await getClient(options.profile)
          output(
            await client.unpublishCloudApp(appKey, {
              deploymentId: defaultDeploymentId(options.deployment),
              serverId: defaultOptionalServerId(options.server),
              uninstall: options.uninstall,
            }),
            { json: options.json },
          )
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('install')
    .description('Install or update a Space App from a manifest')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--manifest-url <url>', 'Manifest URL')
    .option('--manifest-file <path>', 'Local manifest JSON file')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        server: string
        manifestUrl?: string
        manifestFile?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          if (!options.manifestUrl && !options.manifestFile) {
            throw new Error('Pass --manifest-url or --manifest-file')
          }
          const client = await getClient(options.profile)
          const manifest = options.manifestFile
            ? await readJsonFile(options.manifestFile)
            : undefined
          const result = await client.installSpaceApp(resolveServerFlag(options.server), {
            manifestUrl: options.manifestUrl,
            manifest: manifest as never,
          })
          output(result, { json: options.json })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('inspect')
    .description('Inspect an installed Space App')
    .argument('<app-key>', 'Space App key')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (appKey: string, options: { server: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          output(await client.getSpaceApp(resolveServerFlag(options.server), appKey), {
            json: options.json,
          })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('grant')
    .description('Grant a Buddy access to an installed Space App')
    .argument('<app-key>', 'Space App key')
    .requiredOption('--server <server>', 'Server ID or slug')
    .requiredOption('--buddy <buddy-id>', 'Buddy ID')
    .requiredOption(
      '--permissions <permissions>',
      `Comma-separated app permissions, ${BUDDY_INBOX_DELIVERY_PERMISSION}, or *`,
    )
    .option('--approval-mode <mode>', 'none, first_time, every_time, or policy', 'none')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appKey: string,
        options: {
          server: string
          buddy: string
          permissions: string
          approvalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const permissions = parsePermissions(options.permissions)
          const result = await client.grantSpaceAppToBuddy(
            resolveServerFlag(options.server),
            appKey,
            {
              buddyAgentId: options.buddy,
              permissions,
              approvalMode: options.approvalMode,
            },
          )
          output(result, { json: options.json })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('defaults')
    .description('Set default app permissions that members and Buddies can use without prompting')
    .argument('<app-key>', 'Space App key')
    .requiredOption('--server <server>', 'Server ID or slug')
    .requiredOption('--permissions <permissions>', 'Comma-separated permissions, or *')
    .option('--approval-mode <mode>', 'none, first_time, every_time, or policy', 'none')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appKey: string,
        options: {
          server: string
          permissions: string
          approvalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.updateSpaceAppAccessPolicy(
            resolveServerFlag(options.server),
            appKey,
            {
              defaultPermissions: parsePermissions(options.permissions),
              defaultApprovalMode: options.approvalMode,
            },
          )
          output(result, { json: options.json })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('approve')
    .description('Approve one Space App command for yourself or a Buddy after a first-use prompt')
    .argument('<app-key>', 'Space App key')
    .argument('<command>', 'Command name')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--buddy <buddy-id>', 'Buddy ID to approve for')
    .option('--no-remember', 'Approve only the immediate retry window')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appKey: string,
        commandName: string,
        options: {
          server: string
          buddy?: string
          remember?: boolean
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.approveSpaceAppCommand(
            resolveServerFlag(options.server),
            appKey,
            {
              commandName,
              buddyAgentId: options.buddy,
              remember: options.remember,
            },
          )
          output(result, { json: options.json })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('discover')
    .description('Emit Skill-style command discovery for Space Apps')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { server: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const server = resolveServerFlag(options.server)
        const apps = await client.listSpaceApps(server)
        const docs = await Promise.all(
          apps.map((entry) => client.getSpaceAppSkills(server, entry.appKey)),
        )
        if (options.json) {
          output(docs, { json: true })
        } else {
          console.log(docs.map((doc) => doc.markdown).join('\n\n---\n\n'))
        }
      } catch (error) {
        commandHandlerError(error, options.json)
      }
    })

  app
    .command('skills')
    .description('Emit Skill text for one installed Space App')
    .argument('<app-key>', 'Space App key')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (appKey: string, options: { server: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.getSpaceAppSkills(resolveServerFlag(options.server), appKey)
          if (options.json) output(result, { json: true })
          else console.log(result.markdown)
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('events')
    .description('Subscribe to an installed Space App event stream')
    .argument('<app-key>', 'Space App key')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--event <event>', 'Only print one event type')
    .option('--limit <count>', 'Stop after this many matching events')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON lines')
    .action(
      async (
        appKey: string,
        options: {
          server: string
          event?: string
          limit?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const launch = await client.createSpaceAppLaunch(
            resolveServerFlag(options.server),
            appKey,
          )
          const limit = options.limit ? Number.parseInt(options.limit, 10) : undefined
          if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
            throw new Error('--limit must be a positive integer')
          }
          await streamSpaceAppEvents({
            url: client.spaceAppEventStreamUrl(launch.eventStreamPath),
            launchToken: launch.launchToken,
            event: options.event,
            limit,
            json: options.json,
          })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('call')
    .description('Call a Space App command')
    .helpOption(false)
    .argument('[app-key]', 'Space App key')
    .argument('[command]', 'Command name')
    .option('--server <server>', 'Server ID or slug')
    .option('--json-input <json>', 'JSON command input')
    .option('--input-file <path>', 'Read JSON command input from file')
    .option('--channel-id <id>', 'Current Shadow channel ID for approval prompts and app context')
    .option('--task-message-id <id>', 'Inbox task message ID to bind this Space App command to')
    .option('--task-card-id <id>', 'Inbox task card ID to bind this Space App command to')
    .option('--task-claim-id <id>', 'Inbox task claim ID to bind this Space App command to')
    .option('--file <path>', 'Attach a binary file')
    .option('--field <field>', 'Multipart file field name', 'file')
    .option('--output <path>', 'Write binary dataBase64 response to this path')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .option('-h, --help', 'Show app or command help from the installed manifest')
    .action(
      async (
        appKey: string | undefined,
        commandName: string | undefined,
        options: {
          server?: string
          jsonInput?: string
          inputFile?: string
          channelId?: string
          taskMessageId?: string
          taskCardId?: string
          taskClaimId?: string
          file?: string
          field?: string
          output?: string
          profile?: string
          json?: boolean
          help?: boolean
        },
      ) => {
        try {
          if (options.help) {
            if (!appKey) {
              console.log(
                [
                  'Usage:',
                  "  shadowob space-app call <app-key> <command> --server <server> --json-input '<input-json>' --json",
                  '  shadowob space-app call <app-key> <command> --server <server> --help',
                ].join('\n'),
              )
              return
            }
            const client = await getClient(options.profile)
            const server = resolveServerFlag(options.server)
            const app = await client.getSpaceApp(server, appKey)
            console.log(
              formatAppCommandHelp({
                appKey,
                serverId: app.serverId,
                manifest: app.manifest,
                commandName,
              }),
            )
            return
          }
          if (!appKey) throw new Error('Missing app key')
          if (!commandName) throw new Error('Missing command name')
          const client = await getClient(options.profile)
          const input = options.inputFile
            ? await readJsonFile(options.inputFile)
            : parseJsonInput(options.jsonInput)
          const server = resolveServerFlag(options.server)
          if (
            (options.taskMessageId || options.taskCardId || options.taskClaimId) &&
            !(options.taskMessageId && options.taskCardId)
          ) {
            throw new Error('--task-message-id and --task-card-id are required together')
          }
          const task =
            options.taskMessageId && options.taskCardId
              ? {
                  messageId: options.taskMessageId,
                  cardId: options.taskCardId,
                  ...(options.taskClaimId ? { claimId: options.taskClaimId } : {}),
                }
              : undefined
          const result = options.file
            ? await client.callSpaceAppCommandMultipart(server, appKey, commandName, {
                input,
                channelId: options.channelId,
                task,
                file: new Blob([await readFile(options.file)]),
                filename: basename(options.file),
                field: options.field,
              })
            : await client.callSpaceAppCommand(server, appKey, commandName, {
                input,
                channelId: options.channelId,
                task,
              })

          if (
            options.output &&
            result &&
            typeof result === 'object' &&
            'dataBase64' in result &&
            typeof (result as { dataBase64?: unknown }).dataBase64 === 'string'
          ) {
            await writeFile(
              options.output,
              Buffer.from((result as { dataBase64: string }).dataBase64, 'base64'),
            )
            outputSuccess(`Wrote ${options.output}`, { json: options.json })
            return
          }
          output(result, { json: options.json })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('uninstall')
    .description('Uninstall a Space App')
    .argument('<app-key>', 'Space App key')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (appKey: string, options: { server: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          await client.deleteSpaceApp(resolveServerFlag(options.server), appKey)
          const outputOpts = { json: options.json }
          if (options.json) output({ ok: true }, outputOpts)
          else outputSuccess(`Uninstalled ${appKey}`, outputOpts)
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  return app
}
