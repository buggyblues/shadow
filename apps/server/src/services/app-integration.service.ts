import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  buildShadowServerAppInboxTaskRequest,
  getShadowServerAppTaskCardId,
  SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT,
  SHADOW_SERVER_APP_PROTOCOL,
  type ShadowServerAppChannelMessageDelivery,
  type ShadowServerAppChannelMessageDeliveryError,
  type ShadowServerAppChannelMessageOutbox,
  type ShadowServerAppInboxDelivery,
  type ShadowServerAppInboxDeliveryError,
  type ShadowServerAppInboxTaskOutbox,
  type ShadowServerAppResultShadow,
} from '@shadowob/sdk/server-app'
import { BUDDY_INBOX_DELIVERY_PERMISSION, isBuddyInboxPlatformPermission } from '@shadowob/shared'
import type { Logger } from 'pino'
import type { Server as SocketIOServer } from 'socket.io'
import { ZodError } from 'zod'
import type { AgentDao } from '../dao/agent.dao'
import type { AppIntegrationDao } from '../dao/app-integration.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { MessageDao } from '../dao/message.dao'
import type { ServerDao } from '../dao/server.dao'
import type { UserDao } from '../dao/user.dao'
import type {
  ServerAppManifest,
  ServerAppMarketplaceI18nMetadata,
  ServerAppMarketplaceMetadata,
} from '../db/schema/app-integrations'
import type { SafeHttpClient } from '../gateways/safe-http-client'
import { validateJsonLimits } from '../lib/json-limits'
import type { Actor } from '../security/actor'
import {
  type ApproveServerAppCommandInput,
  type CallServerAppCommandInput,
  type CreateServerAppCatalogEntryInput,
  type DiscoverServerAppInput,
  type GrantServerAppBuddyInput,
  type InstallServerAppFromCatalogInput,
  type InstallServerAppInput,
  type ServerAppManifestInput,
  serverAppManifestSchema,
  type UpdateServerAppAccessPolicyInput,
} from '../validators/app-integration.schema'
import type { AppIntegrationEventBus } from './app-integration-event-bus'
import type { BuddyInboxService } from './buddy-inbox.service'
import type { MediaService } from './media.service'
import type { MessageService } from './message.service'
import type { PolicyService } from './policy.service'

const MANIFEST_LIMITS = {
  maxBytes: 128 * 1024,
  maxDepth: 12,
  maxObjectKeys: 1200,
  maxArrayItems: 300,
}

const COMMAND_INPUT_LIMITS = {
  maxBytes: 512 * 1024,
  maxDepth: 10,
  maxObjectKeys: 1000,
  maxArrayItems: 300,
}

const DEFAULT_COMMAND_AUTHORIZATION_WAIT_MS = process.env.NODE_ENV === 'test' ? 0 : 60_000
const DEFAULT_COMMAND_AUTHORIZATION_POLL_MS = 5_000

interface CommandAuthorizationWaitOptions {
  waitMs?: number
  pollMs?: number
  onCommandApprovalRequired?: (error: unknown) => void | Promise<void>
}

interface CommandAccessRequest {
  actor: Actor
  app: {
    id: string
    serverId: string
    appKey: string
    name: string
    defaultPermissions: string[]
    defaultApprovalMode: string
  }
  command: {
    name: string
    title?: string
    description?: string
    permission: string
    action: string
    dataClass: string
    approvalMode?: ApprovalMode
  }
  channelId?: string | null
}

function normalizeOrigin(value: string) {
  const url = new URL(value)
  return url.origin
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '')
}

function isLoopbackHost(hostname: string) {
  const host = normalizeHostname(hostname)
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function shouldAllowDevLoopback(url: URL) {
  return process.env.NODE_ENV !== 'production' && isLoopbackHost(url.hostname)
}

function shouldAllowDevServerAppHost(url: URL) {
  const host = normalizeHostname(url.hostname)
  return (
    process.env.NODE_ENV !== 'production' &&
    (isLoopbackHost(host) || host === 'host.docker.internal' || host === 'host.lima.internal')
  )
}

function shouldAllowDevDirectFetch() {
  return process.env.NODE_ENV !== 'production'
}

function isAllowlistedServerAppHost(url: URL) {
  const allowedHosts = (process.env.SHADOW_SERVER_APP_ALLOW_PRIVATE_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .map((host) => {
      if (host.startsWith('http://') || host.startsWith('https://')) {
        return normalizeHostname(new URL(host).hostname)
      }
      return normalizeHostname(host.split(':')[0] ?? host)
    })
  return allowedHosts.includes(normalizeHostname(url.hostname))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function errorCode(value: unknown) {
  return isRecord(value) && typeof value.code === 'string' ? value.code : null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeJson(value: unknown) {
  if (value === undefined) return null
  return value
}

function formatZodError(error: ZodError) {
  const first = error.issues[0]
  if (!first) return 'Invalid app manifest'
  const path = first.path.length ? first.path.join('.') : 'manifest'
  return `Invalid app manifest: ${path}: ${first.message}`
}

function requireUserBoundActor(actor: Actor) {
  if (actor.kind === 'system') {
    throw Object.assign(new Error('System actor cannot manage server apps'), { status: 403 })
  }
  return actor.userId
}

function localeCandidates(locale?: string | null) {
  const normalized = locale?.trim()
  if (!normalized) return []
  const language = normalized.split('-')[0]
  return [
    normalized,
    normalized.replace('_', '-'),
    normalized.toLowerCase(),
    language,
    language?.toLowerCase(),
    'en',
  ].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
  )
}

function mergeMarketplaceI18n(
  base: ServerAppMarketplaceMetadata | undefined,
  override: ServerAppMarketplaceI18nMetadata | undefined,
): ServerAppMarketplaceMetadata | undefined {
  if (!base && !override) return undefined
  const gallery = base?.gallery?.map((item, index) => ({
    ...item,
    ...(override?.gallery?.[index]?.alt ? { alt: override.gallery[index]!.alt } : {}),
  }))
  const links = base?.links?.map((link, index) => ({
    ...link,
    ...(override?.links?.[index]?.label ? { label: override.links[index]!.label } : {}),
  }))
  return {
    ...(base ?? {}),
    ...(override?.tagline ? { tagline: override.tagline } : {}),
    ...(override?.summary ? { summary: override.summary } : {}),
    ...(override?.categories ? { categories: override.categories } : {}),
    ...(override?.supportedLanguages ? { supportedLanguages: override.supportedLanguages } : {}),
    ...(gallery ? { gallery } : {}),
    ...(links ? { links } : {}),
    ...(base?.publisher || override?.publisher
      ? {
          publisher: {
            ...(base?.publisher ?? {}),
            ...(override?.publisher?.name ? { name: override.publisher.name } : {}),
          },
        }
      : {}),
  }
}

function localizeServerAppManifest<TManifest extends ServerAppManifestInput | ServerAppManifest>(
  manifest: TManifest,
  locale?: string | null,
): TManifest {
  const i18n = manifest.i18n ?? {}
  const localized = localeCandidates(locale)
    .map((candidate) => i18n[candidate])
    .find(Boolean)
  return {
    ...manifest,
    name: localized?.name ?? manifest.name,
    description: localized?.description ?? manifest.description,
    marketplace: mergeMarketplaceI18n(manifest.marketplace, localized?.marketplace),
    help: localized?.help ? { ...(manifest.help ?? {}), ...localized.help } : manifest.help,
  }
}

function redactApp(
  row: Awaited<ReturnType<AppIntegrationDao['findById']>>,
  locale?: string | null,
) {
  if (!row) return null
  const manifest = localizeServerAppManifest(row.manifest, locale)
  return {
    id: row.id,
    serverId: row.serverId,
    appKey: row.appKey,
    name: manifest.name,
    description: manifest.description ?? row.description,
    iconUrl: row.iconUrl,
    manifestUrl: row.manifestUrl,
    manifest,
    manifestVersion: row.manifestVersion ?? row.manifest.version ?? null,
    manifestUpdatedAt: row.manifestUpdatedAt,
    manifestFetchedAt: row.manifestFetchedAt,
    iframeEntry: row.iframeEntry,
    allowedOrigins: row.allowedOrigins,
    apiBaseUrl: row.apiBaseUrl,
    defaultPermissions: row.defaultPermissions,
    defaultApprovalMode: row.defaultApprovalMode,
    status: row.status,
    installedByUserId: row.installedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function redactCatalogEntry(
  row: Awaited<ReturnType<AppIntegrationDao['findCatalogEntryById']>>,
  locale?: string | null,
) {
  if (!row) return null
  const manifest = localizeServerAppManifest(row.manifest, locale)
  return {
    id: row.id,
    appKey: row.appKey,
    name: manifest.name,
    description: manifest.description ?? row.description,
    iconUrl: row.iconUrl,
    manifestUrl: row.manifestUrl,
    manifest,
    status: row.status,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function compactStringList(values: string[] | undefined, limit = 12) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, limit)
}

function catalogEntryMetadata(
  manifest: ServerAppManifestInput | ServerAppManifest,
  locale?: string | null,
) {
  const localizedManifest = localizeServerAppManifest(manifest, locale)
  const marketplace = localizedManifest.marketplace
  const gallery =
    marketplace?.gallery?.map((item) => ({
      url: item.url,
      type: item.type ?? 'image',
      alt: item.alt ?? null,
    })) ?? []
  const coverImageUrl = marketplace?.coverImageUrl ?? gallery[0]?.url ?? localizedManifest.iconUrl
  const links =
    marketplace?.links?.map((link) => ({
      label: link.label,
      url: link.url,
      type: link.type ?? 'website',
    })) ?? []

  return {
    tagline: marketplace?.tagline ?? null,
    summary:
      marketplace?.summary ??
      localizedManifest.help?.overview ??
      localizedManifest.description ??
      null,
    categories: compactStringList(marketplace?.categories, 8),
    supportedLanguages: compactStringList(marketplace?.supportedLanguages, 24),
    coverImageUrl,
    gallery,
    links,
    publisher: marketplace?.publisher
      ? {
          name: marketplace.publisher.name ?? null,
          websiteUrl: marketplace.publisher.websiteUrl ?? null,
        }
      : null,
  }
}

function catalogEntryResponse(
  row: NonNullable<Awaited<ReturnType<AppIntegrationDao['findCatalogEntryById']>>>,
  serverCount = 0,
  locale?: string | null,
) {
  const manifest = localizeServerAppManifest(row.manifest, locale)
  return {
    ...redactCatalogEntry(row, locale)!,
    ...catalogEntryMetadata(manifest),
    commandCount: manifest.commands.length,
    skillCount: manifest.skills?.length ?? 0,
    serverCount,
  }
}

function catalogEntryMatchesQuery(
  row: NonNullable<Awaited<ReturnType<AppIntegrationDao['findCatalogEntryById']>>>,
  query: string,
  locale?: string | null,
) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  const manifest = localizeServerAppManifest(row.manifest, locale)
  const metadata = catalogEntryMetadata(manifest)
  return [
    row.appKey,
    manifest.name,
    manifest.description,
    metadata.tagline,
    metadata.summary,
    metadata.publisher?.name,
    ...metadata.categories,
    ...metadata.supportedLanguages,
    ...row.manifest.commands.map((command) => command.title ?? command.name),
    ...(row.manifest.skills?.map((skill) => skill.name) ?? []),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .some((value) => value.toLowerCase().includes(normalized))
}

type CatalogEntryRow = NonNullable<Awaited<ReturnType<AppIntegrationDao['findCatalogEntryById']>>>

interface LaunchTokenPayload {
  serverId: string
  serverAppId: string
  appKey: string
  actorKind?: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  exp: number
}

type ServerAppAuthType = 'oauth2-bearer'
type ApprovalMode = 'none' | 'first_time' | 'every_time' | 'policy'
type CommandSubject = {
  subjectKind: 'user' | 'buddy'
  subjectKey: string
  subjectUserId: string | null
  buddyAgentId: string | null
}
type TaskCommandContext = Awaited<ReturnType<BuddyInboxService['assertTaskCommandAccess']>>['task']

type InboxTaskOutbox = ShadowServerAppInboxTaskOutbox
type ChannelMessageOutbox = ShadowServerAppChannelMessageOutbox

const RESTRICTED_DATA_CLASSES = new Set(['financial', 'secret', 'cloud-secret'])
const TASK_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent'])

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function optionalInboxResource(value: unknown): InboxTaskOutbox['resource'] | undefined {
  if (!isRecord(value)) return undefined
  const kind = optionalString(value.kind)
  const id = optionalString(value.id)
  if (!kind || !id) return undefined
  return {
    ...value,
    kind,
    id,
    ...(optionalString(value.label) ? { label: optionalString(value.label) } : {}),
    ...(optionalString(value.url) ? { url: optionalString(value.url) } : {}),
  }
}

function optionalInboxTaskTags(value: unknown): InboxTaskOutbox['tags'] | undefined {
  if (!Array.isArray(value)) return undefined
  const tags = value
    .map((tag) => {
      if (typeof tag === 'string') return optionalString(tag)
      if (!isRecord(tag)) return null
      const label = optionalString(tag.label)
      if (!label) return null
      return {
        ...tag,
        label,
        ...(optionalString(tag.id) ? { id: optionalString(tag.id) } : {}),
        ...(optionalString(tag.color) ? { color: optionalString(tag.color) } : {}),
      }
    })
    .filter((tag): tag is NonNullable<InboxTaskOutbox['tags']>[number] => Boolean(tag))
  return tags.length > 0 ? tags : undefined
}

function optionalInboxTaskPrivacy(value: unknown): InboxTaskOutbox['privacy'] | undefined {
  if (!isRecord(value)) return undefined
  const dataClass = optionalString(value.dataClass)
  if (!dataClass) return undefined
  return {
    ...value,
    dataClass: dataClass as NonNullable<InboxTaskOutbox['privacy']>['dataClass'],
    ...(typeof value.redactionRequired === 'boolean'
      ? { redactionRequired: value.redactionRequired }
      : {}),
  }
}

function parseInboxTaskOutbox(value: unknown): InboxTaskOutbox | null {
  if (!isRecord(value)) return null
  const title = optionalString(value.title)
  if (!title) return null
  const priority = optionalString(value.priority)
  return {
    title,
    ...(optionalString(value.body) ? { body: optionalString(value.body) } : {}),
    ...(priority && TASK_PRIORITIES.has(priority)
      ? { priority: priority as InboxTaskOutbox['priority'] }
      : {}),
    ...(optionalString(value.agentId) ? { agentId: optionalString(value.agentId) } : {}),
    ...(optionalString(value.agentUserId)
      ? { agentUserId: optionalString(value.agentUserId) }
      : {}),
    ...(optionalString(value.assigneeLabel)
      ? { assigneeLabel: optionalString(value.assigneeLabel) }
      : {}),
    ...(optionalString(value.idempotencyKey)
      ? { idempotencyKey: optionalString(value.idempotencyKey) }
      : {}),
    ...(optionalInboxTaskTags(value.tags) ? { tags: optionalInboxTaskTags(value.tags) } : {}),
    ...(optionalInboxResource(value.resource)
      ? { resource: optionalInboxResource(value.resource) }
      : {}),
    ...(optionalRecord(value.requirements)
      ? { requirements: optionalRecord(value.requirements) }
      : {}),
    ...(optionalRecord(value.outputContract)
      ? { outputContract: optionalRecord(value.outputContract) }
      : {}),
    ...(optionalInboxTaskPrivacy(value.privacy)
      ? { privacy: optionalInboxTaskPrivacy(value.privacy) }
      : {}),
    ...(optionalRecord(value.data) ? { data: optionalRecord(value.data) } : {}),
    ...(value.required === true ? { required: true } : {}),
  }
}

function parseChannelMessageOutbox(value: unknown): ChannelMessageOutbox | null {
  if (!isRecord(value)) return null
  const content = optionalString(value.content)
  if (!content) return null
  return {
    content,
    ...(optionalString(value.channelId) ? { channelId: optionalString(value.channelId) } : {}),
    ...(optionalString(value.channelName)
      ? { channelName: optionalString(value.channelName) }
      : {}),
    ...(optionalRecord(value.metadata) ? { metadata: optionalRecord(value.metadata) } : {}),
    ...(optionalString(value.idempotencyKey)
      ? { idempotencyKey: optionalString(value.idempotencyKey) }
      : {}),
  }
}

function channelMessageIdempotencyFromMetadata(metadata: unknown) {
  if (!isRecord(metadata)) return null
  const custom = optionalRecord(metadata.custom)
  const serverApp = optionalRecord(custom?.serverAppChannelMessage)
  return optionalString(serverApp?.idempotencyKey)
}

function withChannelMessageIdempotencyMetadata(
  metadata: Record<string, unknown> | undefined,
  idempotencyKey: string | undefined,
) {
  if (!idempotencyKey) return metadata
  const custom = optionalRecord(metadata?.custom) ?? {}
  const serverAppChannelMessage = optionalRecord(custom.serverAppChannelMessage) ?? {}
  return {
    ...(metadata ?? {}),
    custom: {
      ...custom,
      serverAppChannelMessage: {
        ...serverAppChannelMessage,
        idempotencyKey,
      },
    },
  }
}

function optionalShadowMeta(value: unknown): ShadowServerAppResultShadow | null {
  if (!isRecord(value)) return null
  if (value.protocol !== SHADOW_SERVER_APP_PROTOCOL) return null
  return value as unknown as ShadowServerAppResultShadow
}

function inboxTaskListFromRecord(record: Record<string, unknown>) {
  const shadow = optionalShadowMeta(record.shadow)
  const raw = shadow?.outbox?.inboxTasks ?? []
  return raw.map(parseInboxTaskOutbox).filter((task): task is InboxTaskOutbox => Boolean(task))
}

function channelMessageListFromRecord(record: Record<string, unknown>) {
  const shadow = optionalShadowMeta(record.shadow)
  const raw = shadow?.outbox?.channelMessages ?? []
  return raw
    .map(parseChannelMessageOutbox)
    .filter((message): message is ChannelMessageOutbox => Boolean(message))
}

function collectInboxTaskOutbox(payload: unknown, depth = 0): InboxTaskOutbox[] {
  if (depth > 4 || !isRecord(payload)) return []
  const tasks = [...inboxTaskListFromRecord(payload)]
  const nested = optionalRecord(payload.result)
  if (nested) tasks.push(...collectInboxTaskOutbox(nested, depth + 1))
  return tasks
}

function collectChannelMessageOutbox(payload: unknown, depth = 0): ChannelMessageOutbox[] {
  if (depth > 4 || !isRecord(payload)) return []
  const messages = [...channelMessageListFromRecord(payload)]
  const nested = optionalRecord(payload.result)
  if (nested) messages.push(...collectChannelMessageOutbox(nested, depth + 1))
  return messages
}

function extractInboxTaskOutbox(payload: unknown) {
  if (!isRecord(payload)) return []
  const tasks = collectInboxTaskOutbox(payload)

  const seen = new Set<string>()
  return tasks.filter((task) => {
    const key = [
      task.idempotencyKey,
      task.agentId,
      task.agentUserId,
      task.assigneeLabel,
      task.title,
    ]
      .filter(Boolean)
      .join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function extractChannelMessageOutbox(payload: unknown) {
  if (!isRecord(payload)) return []
  const messages = collectChannelMessageOutbox(payload)

  const seen = new Set<string>()
  return messages.filter((message) => {
    const key = [message.idempotencyKey, message.channelId, message.channelName, message.content]
      .filter(Boolean)
      .join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeAgentLabel(value: string) {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

function attachInboxDeliveryResult(
  payload: Record<string, unknown>,
  deliveries: ShadowServerAppInboxDelivery[],
  errors: ShadowServerAppInboxDeliveryError[],
): Record<string, unknown> {
  const withDeliveryMeta = (value: Record<string, unknown>) => {
    const shadow = optionalShadowMeta(value.shadow)
    return {
      ...value,
      shadow: {
        protocol: SHADOW_SERVER_APP_PROTOCOL,
        outbox: {
          ...(shadow?.outbox ?? {}),
          ...(deliveries.length > 0 ? { deliveries } : {}),
          ...(errors.length > 0 ? { errors } : {}),
        },
      },
    }
  }
  const nested = optionalRecord(payload.result)
  if (!nested) return withDeliveryMeta(payload)
  return {
    ...withDeliveryMeta(payload),
    result: withDeliveryMeta(nested),
  }
}

function attachChannelMessageDeliveryResult(
  payload: Record<string, unknown>,
  deliveries: ShadowServerAppChannelMessageDelivery[],
  errors: ShadowServerAppChannelMessageDeliveryError[],
): Record<string, unknown> {
  const withDeliveryMeta = (value: Record<string, unknown>) => {
    const shadow = optionalShadowMeta(value.shadow)
    return {
      ...value,
      shadow: {
        protocol: SHADOW_SERVER_APP_PROTOCOL,
        outbox: {
          ...(shadow?.outbox ?? {}),
          ...(deliveries.length > 0 ? { channelMessageDeliveries: deliveries } : {}),
          ...(errors.length > 0 ? { channelMessageErrors: errors } : {}),
        },
      },
    }
  }
  const nested = optionalRecord(payload.result)
  if (!nested) return withDeliveryMeta(payload)
  return {
    ...withDeliveryMeta(payload),
    result: withDeliveryMeta(nested),
  }
}

function safeDefaultPermissions(manifest: {
  commands: Array<{ permission: string; action: string; dataClass: string }>
}) {
  return Array.from(
    new Set(
      manifest.commands
        .filter(
          (command) => command.action === 'read' && !RESTRICTED_DATA_CLASSES.has(command.dataClass),
        )
        .map((command) => command.permission),
    ),
  )
}

function manifestDefaultPermissions(manifest: {
  access?: { defaultPermissions?: string[] }
  commands: Array<{ permission: string; action: string; dataClass: string }>
}) {
  return manifest.access?.defaultPermissions ?? safeDefaultPermissions(manifest)
}

function manifestDefaultApprovalMode(manifest: {
  access?: { defaultApprovalMode?: ApprovalMode }
}) {
  return manifest.access?.defaultApprovalMode ?? 'none'
}

function serverAppAuthType(manifest: { api: { auth?: { type?: ServerAppAuthType } } }) {
  return manifest.api.auth?.type ?? 'oauth2-bearer'
}

function hashOpaqueToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function hashManifest(manifest: unknown) {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
}

function manifestTimestamp(manifest: { updatedAt?: string }) {
  return manifest.updatedAt ? new Date(manifest.updatedAt) : null
}

function manifestUrlFromApiBaseUrl(apiBaseUrl: string | null | undefined) {
  if (!apiBaseUrl) return null
  try {
    return new URL('/.well-known/shadow-app.json', apiBaseUrl).toString()
  } catch {
    return null
  }
}

export class AppIntegrationService {
  constructor(
    private deps: {
      appIntegrationDao: AppIntegrationDao
      agentDao: AgentDao
      channelDao: ChannelDao
      messageDao: MessageDao
      userDao: UserDao
      appIntegrationEventBus: AppIntegrationEventBus
      buddyInboxService: BuddyInboxService
      messageService: MessageService
      serverDao: ServerDao
      policyService: PolicyService
      mediaService: MediaService
      safeHttpClient: SafeHttpClient
      io: SocketIOServer
      logger: Logger
    },
  ) {}

  private async resolveServerId(idOrSlug: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
    if (isUuid) return idOrSlug
    const server = await this.deps.serverDao.findBySlug(idOrSlug)
    if (!server) throw Object.assign(new Error('Server not found'), { status: 404 })
    return server.id
  }

  private async requireServerAdmin(actor: Actor, serverId: string) {
    await this.deps.policyService.requireServerRole(actor, serverId, 'admin')
  }

  private async fetchManifest(manifestUrl: string) {
    const url = new URL(manifestUrl)
    const response =
      shouldAllowDevDirectFetch() || isAllowlistedServerAppHost(url)
        ? await fetch(manifestUrl, { redirect: 'manual' })
        : await this.deps.safeHttpClient.fetch(manifestUrl, {}, { maxRedirects: 0 })
    if (!response.ok) {
      throw Object.assign(new Error(`Manifest returned ${response.status}`), { status: 422 })
    }
    const raw = await response.text()
    if (Buffer.byteLength(raw, 'utf8') > MANIFEST_LIMITS.maxBytes) {
      throw Object.assign(new Error('Manifest is too large'), { status: 413 })
    }
    return JSON.parse(raw) as unknown
  }

  private validateManifest(input: unknown) {
    const limits = validateJsonLimits(input, MANIFEST_LIMITS)
    if (!limits.ok) throw Object.assign(new Error(limits.error), { status: 413 })
    const parsed = serverAppManifestSchema.safeParse(input)
    if (!parsed.success) {
      throw Object.assign(new Error(formatZodError(parsed.error)), { status: 422 })
    }
    const manifest = parsed.data
    const commandNames = new Set<string>()
    if (manifest.iframe) {
      const entryOrigin = normalizeOrigin(manifest.iframe.entry)
      const allowedOrigins = manifest.iframe.allowedOrigins.map((origin) => normalizeOrigin(origin))
      if (!allowedOrigins.includes(entryOrigin)) {
        throw Object.assign(new Error('iframe.allowedOrigins must include iframe.entry origin'), {
          status: 422,
        })
      }
    }
    for (const command of manifest.commands) {
      if (commandNames.has(command.name)) {
        throw Object.assign(new Error(`Duplicate command: ${command.name}`), { status: 422 })
      }
      commandNames.add(command.name)
    }
    const allowedPermissions = new Set(manifest.commands.map((command) => command.permission))
    for (const permission of manifest.access?.defaultPermissions ?? []) {
      if (permission !== '*' && !allowedPermissions.has(permission)) {
        throw Object.assign(new Error(`Unknown default app permission: ${permission}`), {
          status: 422,
        })
      }
    }
    return manifest
  }

  private appFieldsFromManifest(manifest: ServerAppManifestInput) {
    const iframeEntry = manifest.iframe?.entry ?? null
    const allowedOrigins =
      manifest.iframe?.allowedOrigins ?? (iframeEntry ? [normalizeOrigin(iframeEntry)] : [])
    return {
      name: manifest.name,
      description: manifest.description ?? null,
      iconUrl: manifest.iconUrl,
      manifest,
      manifestVersion: manifest.version ?? null,
      manifestUpdatedAt: manifestTimestamp(manifest),
      manifestFetchedAt: new Date(),
      manifestHash: hashManifest(manifest),
      iframeEntry,
      allowedOrigins,
      apiBaseUrl: manifest.api.baseUrl.replace(/\/$/, ''),
    }
  }

  private async refreshInstalledManifest<
    TApp extends NonNullable<Awaited<ReturnType<AppIntegrationDao['findById']>>>,
  >(app: TApp, options: { throwOnError?: boolean; inferManifestUrl?: boolean } = {}) {
    const manifestUrl =
      app.manifestUrl ??
      (options.inferManifestUrl ? manifestUrlFromApiBaseUrl(app.apiBaseUrl) : null)
    if (!manifestUrl) return app
    let manifest: ServerAppManifestInput
    try {
      const rawManifest = await this.fetchManifest(manifestUrl)
      manifest = this.validateManifest(rawManifest)
    } catch (error) {
      if (options.throwOnError) throw error
      this.deps.logger.warn(
        { appKey: app.appKey, serverAppId: app.id, error },
        'App manifest refresh failed',
      )
      return app
    }
    if (manifest.appKey !== app.appKey) {
      const error = Object.assign(new Error('Manifest appKey cannot change during app refresh'), {
        status: 422,
      })
      if (options.throwOnError) throw error
      this.deps.logger.warn({ appKey: app.appKey, serverAppId: app.id }, error.message)
      return app
    }

    const nextFields = this.appFieldsFromManifest(manifest)
    if (app.manifestHash && app.manifestHash === nextFields.manifestHash && app.manifestUrl) {
      return app
    }

    const updated = await this.deps.appIntegrationDao.updateManifest(app.id, {
      ...nextFields,
      manifestUrl,
    })
    return (updated ?? app) as TApp
  }

  private async refreshCatalogEntry<TEntry extends CatalogEntryRow>(
    row: TEntry,
    options: { throwOnError?: boolean } = {},
  ) {
    if (!row.manifestUrl) return row
    let manifest: ServerAppManifestInput
    try {
      const rawManifest = await this.fetchManifest(row.manifestUrl)
      manifest = this.validateManifest(rawManifest)
    } catch (error) {
      if (options.throwOnError) throw error
      this.deps.logger.warn(
        { appKey: row.appKey, catalogEntryId: row.id, error },
        'App catalog manifest refresh failed',
      )
      return row
    }
    if (manifest.appKey !== row.appKey) {
      const error = Object.assign(
        new Error('Manifest appKey cannot change during catalog refresh'),
        {
          status: 422,
        },
      )
      if (options.throwOnError) throw error
      this.deps.logger.warn({ appKey: row.appKey, catalogEntryId: row.id }, error.message)
      return row
    }
    if (hashManifest(row.manifest) === hashManifest(manifest)) return row

    const updated = await this.deps.appIntegrationDao.updateCatalogEntryManifest(row.id, {
      name: manifest.name,
      description: manifest.description ?? null,
      iconUrl: manifest.iconUrl,
      manifestUrl: row.manifestUrl,
      manifest,
    })
    return (updated ?? row) as TEntry
  }

  private async refreshCatalogEntries<TEntry extends CatalogEntryRow>(rows: TEntry[]) {
    return Promise.all(rows.map((row) => this.refreshCatalogEntry(row)))
  }

  private async findFreshApp(
    serverId: string,
    appKey: string,
    options: { throwOnRefreshError?: boolean } = {},
  ) {
    const app = await this.deps.appIntegrationDao.findByServerAndKey(serverId, appKey)
    if (!app) return null
    return this.refreshInstalledManifest(app, { throwOnError: options.throwOnRefreshError })
  }

  private launchSecret() {
    return process.env.JWT_SECRET ?? 'shadow-dev-jwt-secret-do-not-use-in-production'
  }

  private signLaunchPayload(payload: string) {
    return createHmac('sha256', this.launchSecret()).update(payload).digest('base64url')
  }

  private createLaunchToken(payload: LaunchTokenPayload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = this.signLaunchPayload(body)
    return `sat_v1.${body}.${signature}`
  }

  private parseLaunchToken(token: string): LaunchTokenPayload {
    const parts = token.split('.')
    if (parts.length !== 3 || parts[0] !== 'sat_v1') {
      throw Object.assign(new Error('Invalid app launch token'), { status: 401 })
    }
    const body = parts[1]!
    const signature = parts[2]!
    const expected = this.signLaunchPayload(body)
    if (!this.assertSignature(signature, expected)) {
      throw Object.assign(new Error('Invalid app launch token'), { status: 401 })
    }
    let payload: unknown
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown
    } catch {
      throw Object.assign(new Error('Invalid app launch token payload'), { status: 401 })
    }
    if (
      !isRecord(payload) ||
      typeof payload.serverId !== 'string' ||
      typeof payload.serverAppId !== 'string' ||
      typeof payload.appKey !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      throw Object.assign(new Error('Invalid app launch token payload'), { status: 401 })
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw Object.assign(new Error('App launch token expired'), { status: 401 })
    }
    return payload as unknown as LaunchTokenPayload
  }

  async discover(serverIdOrSlug: string, actor: Actor, input: DiscoverServerAppInput) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireServerAdmin(actor, serverId)

    const rawManifest = input.manifest ?? (await this.fetchManifest(input.manifestUrl!))
    const manifest = this.validateManifest(rawManifest)
    const installed = await this.deps.appIntegrationDao.findByServerAndKey(
      serverId,
      manifest.appKey,
    )

    return {
      manifest,
      installed: installed ? redactApp(installed) : null,
      permissions: manifest.commands.map((command) => ({
        name: command.name,
        title: command.title ?? command.name,
        description: command.description ?? null,
        permission: command.permission,
        action: command.action,
        dataClass: command.dataClass,
        approvalMode: command.approvalMode ?? 'none',
      })),
    }
  }

  private async buildCatalogPreview(
    input: CreateServerAppCatalogEntryInput | DiscoverServerAppInput,
  ) {
    if ('sourceServerAppId' in input && input.sourceServerAppId) {
      const installedRow = await this.deps.appIntegrationDao.findById(input.sourceServerAppId)
      const installed = installedRow
        ? await this.refreshInstalledManifest(installedRow, {
            throwOnError: true,
            inferManifestUrl: true,
          })
        : null
      if (!installed) {
        throw Object.assign(new Error('Installed app not found'), { status: 404 })
      }
      const manifest = this.validateManifest(installed.manifest)
      return {
        manifest,
        manifestUrl: input.manifestUrl ?? installed.manifestUrl ?? null,
        permissions: manifest.commands.map((command) => ({
          name: command.name,
          title: command.title ?? command.name,
          description: command.description ?? null,
          permission: command.permission,
          action: command.action,
          dataClass: command.dataClass,
          approvalMode: command.approvalMode ?? 'none',
        })),
      }
    }

    const rawManifest = input.manifest ?? (await this.fetchManifest(input.manifestUrl!))
    const manifest = this.validateManifest(rawManifest)
    return {
      manifest,
      manifestUrl: 'manifestUrl' in input ? (input.manifestUrl ?? null) : null,
      permissions: manifest.commands.map((command) => ({
        name: command.name,
        title: command.title ?? command.name,
        description: command.description ?? null,
        permission: command.permission,
        action: command.action,
        dataClass: command.dataClass,
        approvalMode: command.approvalMode ?? 'none',
      })),
    }
  }

  async refreshInstalledAppForAdmin(serverAppId: string) {
    const app = await this.deps.appIntegrationDao.findById(serverAppId)
    if (!app) throw Object.assign(new Error('Installed app not found'), { status: 404 })
    return redactApp(
      await this.refreshInstalledManifest(app, { throwOnError: true, inferManifestUrl: true }),
    )!
  }

  async refreshCatalogEntryForAdmin(catalogEntryId: string) {
    const row = await this.deps.appIntegrationDao.findCatalogEntryById(catalogEntryId)
    if (!row) throw Object.assign(new Error('App catalog entry not found'), { status: 404 })
    if (row.manifestUrl)
      return catalogEntryResponse(await this.refreshCatalogEntry(row, { throwOnError: true }))

    const installed = await this.deps.appIntegrationDao.findLatestByAppKey(row.appKey)
    if (!installed) {
      throw Object.assign(
        new Error('Catalog entry has no manifest URL and no installed app source'),
        {
          status: 422,
        },
      )
    }
    const freshInstalled = await this.refreshInstalledManifest(installed, {
      throwOnError: true,
      inferManifestUrl: true,
    })
    const manifest = this.validateManifest(freshInstalled.manifest)
    const updated = await this.deps.appIntegrationDao.updateCatalogEntryManifest(row.id, {
      name: manifest.name,
      description: manifest.description ?? null,
      iconUrl: manifest.iconUrl,
      manifestUrl: freshInstalled.manifestUrl,
      manifest,
    })
    return catalogEntryResponse(updated ?? row)
  }

  async listCatalog(
    serverIdOrSlug: string,
    actor: Actor,
    options: { locale?: string | null } = {},
  ) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.deps.policyService.requireServerMember(actor, serverId)
    const [catalogRows, installedRows] = await Promise.all([
      this.deps.appIntegrationDao.listCatalogEntries(),
      this.deps.appIntegrationDao.listByServer(serverId),
    ])
    const freshCatalogRows = await this.refreshCatalogEntries(catalogRows)
    const installedByKey = new Map(
      installedRows.map((row) => [row.appKey, redactApp(row, options.locale)!]),
    )
    return freshCatalogRows.map((row) => ({
      ...redactCatalogEntry(row, options.locale)!,
      installed: installedByKey.get(row.appKey) ?? null,
      permissions: row.manifest.commands.map((command) => ({
        name: command.name,
        title: command.title ?? command.name,
        description: command.description ?? null,
        permission: command.permission,
        action: command.action,
        dataClass: command.dataClass,
        approvalMode: command.approvalMode ?? 'none',
      })),
    }))
  }

  async listAdminCatalog(options: { locale?: string | null } = {}) {
    const rows = await this.deps.appIntegrationDao.listCatalogEntries({ includeInactive: true })
    const freshRows = await this.refreshCatalogEntries(rows)
    const installCounts = await this.deps.appIntegrationDao.countInstallationsByAppKeys(
      freshRows.map((row) => row.appKey),
    )
    const serverCountByAppKey = new Map(installCounts.map((row) => [row.appKey, Number(row.count)]))
    return freshRows.map((row) =>
      catalogEntryResponse(row, serverCountByAppKey.get(row.appKey) ?? 0, options.locale),
    )
  }

  async listDiscoverCatalog(
    input: { q?: string | null; limit?: number; offset?: number; locale?: string | null } = {},
  ) {
    const rows = await this.deps.appIntegrationDao.listCatalogEntries()
    const freshRows = await this.refreshCatalogEntries(rows)
    const query = input.q?.trim() ?? ''
    const matchedRows = query
      ? freshRows.filter((row) => catalogEntryMatchesQuery(row, query, input.locale))
      : freshRows
    const installCounts = await this.deps.appIntegrationDao.countInstallationsByAppKeys(
      matchedRows.map((row) => row.appKey),
    )
    const serverCountByAppKey = new Map(installCounts.map((row) => [row.appKey, Number(row.count)]))
    const limit = Math.max(1, Math.min(input.limit ?? 48, 96))
    const offset = Math.max(0, input.offset ?? 0)
    const items = matchedRows
      .slice(offset, offset + limit)
      .map((row) =>
        catalogEntryResponse(row, serverCountByAppKey.get(row.appKey) ?? 0, input.locale),
      )
    return {
      apps: items,
      total: matchedRows.length,
      hasMore: offset + items.length < matchedRows.length,
    }
  }

  async getDiscoverCatalogEntry(appKey: string, options: { locale?: string | null } = {}) {
    const existing = await this.deps.appIntegrationDao.findCatalogEntryByAppKey(appKey)
    if (!existing || existing.status !== 'active') {
      throw Object.assign(new Error('App catalog entry not found'), { status: 404 })
    }
    const row = await this.refreshCatalogEntry(existing)
    const installCounts = await this.deps.appIntegrationDao.countInstallationsByAppKeys([
      row.appKey,
    ])
    const serverCount = Number(installCounts[0]?.count ?? 0)
    return catalogEntryResponse(row, serverCount, options.locale)
  }

  async upsertCatalogEntry(actor: Actor, input: CreateServerAppCatalogEntryInput) {
    const preview = await this.buildCatalogPreview(input)
    const row = await this.deps.appIntegrationDao.upsertCatalogEntry({
      appKey: preview.manifest.appKey,
      name: preview.manifest.name,
      description: preview.manifest.description ?? null,
      iconUrl: preview.manifest.iconUrl,
      manifestUrl: preview.manifestUrl,
      manifest: preview.manifest,
      status: input.status ?? 'active',
      createdByUserId: actor.kind === 'system' ? null : actor.userId,
    })
    return {
      ...catalogEntryResponse(row),
      permissions: preview.permissions,
    }
  }

  async deleteCatalogEntry(id: string) {
    await this.deps.appIntegrationDao.deleteCatalogEntryById(id)
    return { ok: true }
  }

  async installFromCatalog(
    serverIdOrSlug: string,
    catalogEntryId: string,
    actor: Actor,
    input: InstallServerAppFromCatalogInput,
  ) {
    void input
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireServerAdmin(actor, serverId)
    const entry = await this.deps.appIntegrationDao.findCatalogEntryById(catalogEntryId)
    if (!entry || entry.status !== 'active') {
      throw Object.assign(new Error('App catalog entry not found'), { status: 404 })
    }
    if (entry.manifestUrl) {
      return this.install(serverId, actor, { manifestUrl: entry.manifestUrl })
    }
    return this.install(serverId, actor, {
      manifest: this.validateManifest(entry.manifest),
    })
  }

  async install(serverIdOrSlug: string, actor: Actor, input: InstallServerAppInput) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireServerAdmin(actor, serverId)

    const rawManifest = input.manifest ?? (await this.fetchManifest(input.manifestUrl!))
    const manifest = this.validateManifest(rawManifest)
    const manifestFields = this.appFieldsFromManifest(manifest)
    const app = await this.deps.appIntegrationDao.upsert({
      serverId,
      appKey: manifest.appKey,
      manifestUrl: input.manifestUrl ?? null,
      ...manifestFields,
      defaultPermissions: manifestDefaultPermissions(manifest),
      defaultApprovalMode: manifestDefaultApprovalMode(manifest),
      installedByUserId: requireUserBoundActor(actor),
    })

    return redactApp(app)!
  }

  async createLaunch(serverIdOrSlug: string, appKey: string, actor: Actor) {
    const app = await this.get(serverIdOrSlug, appKey, actor)
    const buddyAgentId = await this.actorBuddyAgentId(actor)
    const ownerId = await this.actorOwnerUserId(actor, buddyAgentId)
    const exp = Math.floor(Date.now() / 1000) + 600
    const launchToken = this.createLaunchToken({
      serverId: app.serverId,
      serverAppId: app.id,
      appKey: app.appKey,
      actorKind: actor.kind,
      userId: actor.kind === 'system' ? null : actor.userId,
      buddyAgentId,
      ownerId,
      exp,
    })
    const eventStreamPath = `/api/servers/${encodeURIComponent(app.serverId)}/apps/${encodeURIComponent(
      app.appKey,
    )}/events?token=${encodeURIComponent(launchToken)}`

    return {
      serverId: app.serverId,
      serverAppId: app.id,
      appKey: app.appKey,
      iframeEntry: app.iframeEntry,
      allowedOrigins: app.allowedOrigins,
      launchToken,
      eventStreamPath,
      expiresIn: 600,
    }
  }

  async getEventStreamContext(serverIdOrSlug: string, appKey: string, token: string) {
    const payload = this.parseLaunchToken(token)
    const serverId = await this.resolveServerId(serverIdOrSlug)
    if (payload.serverId !== serverId || payload.appKey !== appKey) {
      throw Object.assign(new Error('Launch token does not match app'), { status: 401 })
    }
    const app = await this.deps.appIntegrationDao.findById(payload.serverAppId)
    if (!app || app.serverId !== serverId || app.appKey !== appKey) {
      throw Object.assign(new Error('App integration not found'), { status: 404 })
    }
    return {
      app: redactApp(app)!,
      payload,
    }
  }

  async introspectLaunchToken(serverIdOrSlug: string, appKey: string, token: string) {
    try {
      const { app, payload } = await this.getEventStreamContext(serverIdOrSlug, appKey, token)
      return {
        active: true,
        token_type: 'Bearer',
        client_id: app.appKey,
        exp: payload.exp,
        shadow: {
          protocol: 'shadow.app/1',
          serverId: payload.serverId,
          serverAppId: payload.serverAppId,
          appKey: payload.appKey,
          actor: {
            kind: payload.actorKind ?? 'unknown',
            userId: payload.userId ?? null,
            buddyAgentId: payload.buddyAgentId ?? null,
            ownerId: payload.ownerId ?? null,
          },
        },
      }
    } catch {
      return { active: false }
    }
  }

  private actorFromLaunchPayload(payload: LaunchTokenPayload): Actor {
    if (payload.actorKind === 'agent' && payload.userId) {
      return {
        kind: 'agent',
        userId: payload.userId,
        agentId: payload.buddyAgentId ?? undefined,
        ownerId: payload.ownerId ?? undefined,
        scopes: [],
      }
    }
    if (payload.userId) {
      return {
        kind: 'user',
        userId: payload.userId,
        authMethod: 'jwt',
        scopes: [],
      }
    }
    throw Object.assign(new Error('Launch token is not bound to a user actor'), { status: 401 })
  }

  async listLaunchBuddyInboxes(serverIdOrSlug: string, appKey: string, token: string) {
    const { payload } = await this.getEventStreamContext(serverIdOrSlug, appKey, token)
    const actor = this.actorFromLaunchPayload(payload)
    return this.deps.buddyInboxService.listForServer(payload.serverId, actor)
  }

  async deliverLaunchOutbox(
    serverIdOrSlug: string,
    appKey: string,
    token: string,
    input: { commandName?: string | null; result?: unknown },
  ) {
    const { app, payload } = await this.getEventStreamContext(serverIdOrSlug, appKey, token)
    const actor = this.actorFromLaunchPayload(payload)
    const result = isRecord(input.result) ? input.result : {}
    const commandName = input.commandName?.trim() || 'local'
    const inboxResult = await this.attachInboxTaskDeliveries({
      result,
      serverId: payload.serverId,
      app: { id: app.id, appKey: app.appKey, name: app.name },
      commandName,
      actor,
      authorization: { waitMs: DEFAULT_COMMAND_AUTHORIZATION_WAIT_MS },
    })
    return this.attachChannelMessageDeliveries({
      result: inboxResult,
      serverId: payload.serverId,
      actor,
    })
  }

  async list(serverIdOrSlug: string, actor: Actor, options: { locale?: string | null } = {}) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.deps.policyService.requireServerMember(actor, serverId)
    const rows = await this.deps.appIntegrationDao.listByServer(serverId)
    return rows.map((row) => redactApp(row, options.locale)!)
  }

  async listSummaries(
    serverIdOrSlug: string,
    actor: Actor,
    options?: {
      locale?: string | null
      serverMember?: Awaited<ReturnType<PolicyService['requireServerMember']>> | null
    },
  ) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    const verifiedMember = options?.serverMember
    if (!verifiedMember || verifiedMember.serverId !== serverId) {
      await this.deps.policyService.requireServerMember(actor, serverId)
    }
    const rows = await this.deps.appIntegrationDao.listSummariesByServer(serverId)
    return rows.map((row) => {
      const manifest = localizeServerAppManifest(row.manifest, options?.locale)
      return {
        id: row.id,
        serverId: row.serverId,
        appKey: row.appKey,
        name: manifest.name,
        iconUrl: row.iconUrl,
        status: row.status,
      }
    })
  }

  async get(
    serverIdOrSlug: string,
    appKey: string,
    actor: Actor,
    options: { locale?: string | null } = {},
  ) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.deps.policyService.requireServerMember(actor, serverId)
    const app = await this.findFreshApp(serverId, appKey)
    if (!app) throw Object.assign(new Error('App integration not found'), { status: 404 })
    const grants = await this.deps.appIntegrationDao.listBuddyGrants(app.id)
    return {
      ...redactApp(app, options.locale)!,
      grants,
    }
  }

  async delete(serverIdOrSlug: string, appKey: string, actor: Actor) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireServerAdmin(actor, serverId)
    await this.deps.appIntegrationDao.deleteByServerAndKey(serverId, appKey)
    return { ok: true }
  }

  async grant(
    serverIdOrSlug: string,
    appKey: string,
    actor: Actor,
    input: GrantServerAppBuddyInput,
  ) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireServerAdmin(actor, serverId)
    const app = await this.findFreshApp(serverId, appKey)
    if (!app) throw Object.assign(new Error('App integration not found'), { status: 404 })

    const agent = await this.deps.agentDao.findById(input.buddyAgentId)
    if (!agent) throw Object.assign(new Error('Buddy not found'), { status: 404 })
    await this.deps.policyService.requireServerMember(
      {
        kind: 'agent',
        userId: agent.userId,
        agentId: agent.id,
        ownerId: agent.ownerId,
        scopes: [],
      },
      serverId,
    )

    this.validateKnownPermissions(app, input.permissions, {
      allowBuddyInboxPlatformPermissions: true,
    })

    const existingGrant = input.mergePermissions
      ? await this.deps.appIntegrationDao.findBuddyGrant(app.id, input.buddyAgentId)
      : null
    const permissions = input.mergePermissions
      ? Array.from(new Set([...(existingGrant?.permissions ?? []), ...input.permissions]))
      : input.permissions
    const resourceRules =
      input.resourceRules ??
      (input.mergePermissions && isRecord(existingGrant?.resourceRules)
        ? existingGrant.resourceRules
        : {})
    const existingExpiresAt = existingGrant?.expiresAt ? new Date(existingGrant.expiresAt) : null
    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt)
      : existingExpiresAt && existingExpiresAt.getTime() > Date.now()
        ? existingExpiresAt
        : null

    return this.deps.appIntegrationDao.upsertBuddyGrant({
      serverAppId: app.id,
      buddyAgentId: input.buddyAgentId,
      permissions,
      resourceRules,
      approvalMode: input.approvalMode ?? existingGrant?.approvalMode ?? 'none',
      createdByUserId: requireUserBoundActor(actor),
      expiresAt,
    })
  }

  private validateKnownPermissions(
    app: { manifest: { commands: Array<{ permission: string }> } },
    permissions: string[],
    options: { allowBuddyInboxPlatformPermissions?: boolean } = {},
  ) {
    const allowedPermissions = new Set(app.manifest.commands.map((command) => command.permission))
    for (const permission of permissions) {
      if (permission === '*' || allowedPermissions.has(permission)) continue
      if (
        options.allowBuddyInboxPlatformPermissions &&
        isBuddyInboxPlatformPermission(permission)
      ) {
        continue
      }
      throw Object.assign(new Error(`Unknown app permission: ${permission}`), { status: 422 })
    }
  }

  async updateAccessPolicy(
    serverIdOrSlug: string,
    appKey: string,
    actor: Actor,
    input: UpdateServerAppAccessPolicyInput,
  ) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireServerAdmin(actor, serverId)
    const app = await this.findFreshApp(serverId, appKey)
    if (!app) throw Object.assign(new Error('App integration not found'), { status: 404 })
    this.validateKnownPermissions(app, input.defaultPermissions)

    const updated = await this.deps.appIntegrationDao.updateAccessPolicy(app.id, {
      defaultPermissions: input.defaultPermissions,
      defaultApprovalMode: input.defaultApprovalMode ?? 'none',
    })
    if (!updated) throw Object.assign(new Error('App integration not found'), { status: 404 })
    return {
      ...redactApp(updated)!,
      grants: await this.deps.appIntegrationDao.listBuddyGrants(updated.id),
    }
  }

  async approveCommandAccess(
    serverIdOrSlug: string,
    appKey: string,
    actor: Actor,
    input: ApproveServerAppCommandInput,
  ) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.deps.policyService.requireServerMember(actor, serverId)
    const app = await this.findFreshApp(serverId, appKey)
    if (!app) throw Object.assign(new Error('App integration not found'), { status: 404 })
    const command = app.manifest.commands.find((item) => item.name === input.commandName)
    if (!command) throw Object.assign(new Error('App command not found'), { status: 404 })
    const restricted = RESTRICTED_DATA_CLASSES.has(command.dataClass)
    if (restricted) await this.requireServerAdmin(actor, serverId)

    let subject: CommandSubject
    if (input.buddyAgentId) {
      const approverUserId = requireUserBoundActor(actor)
      const agent = await this.deps.agentDao.findById(input.buddyAgentId)
      if (!agent) throw Object.assign(new Error('Buddy not found'), { status: 404 })
      await this.deps.policyService.requireServerMember(
        {
          kind: 'agent',
          userId: agent.userId,
          agentId: agent.id,
          ownerId: agent.ownerId,
          scopes: [],
        },
        serverId,
      )
      if (agent.ownerId !== approverUserId) {
        await this.requireServerAdmin(actor, serverId)
      }
      subject = {
        subjectKind: 'buddy',
        subjectKey: agent.id,
        subjectUserId: agent.userId,
        buddyAgentId: agent.id,
      }
    } else {
      if (actor.kind === 'agent') {
        throw Object.assign(new Error('Buddy command approval must be confirmed by a person'), {
          status: 403,
        })
      }
      subject = {
        subjectKind: 'user',
        subjectKey: requireUserBoundActor(actor),
        subjectUserId: requireUserBoundActor(actor),
        buddyAgentId: null,
      }
    }

    const approvalMode = command.approvalMode ?? (app.defaultApprovalMode as ApprovalMode) ?? 'none'
    const expiresAt =
      input.remember === false || approvalMode === 'every_time'
        ? new Date(Date.now() + 10 * 60 * 1000)
        : null
    const consent = await this.deps.appIntegrationDao.upsertCommandConsent({
      serverAppId: app.id,
      serverId,
      appKey: app.appKey,
      command: command.name,
      permission: command.permission,
      subjectKind: subject.subjectKind,
      subjectKey: subject.subjectKey,
      subjectUserId: subject.subjectUserId,
      buddyAgentId: subject.buddyAgentId,
      grantedByUserId: requireUserBoundActor(actor),
      approvalMode: approvalMode === 'none' ? 'first_time' : approvalMode,
      expiresAt,
    })

    return {
      ok: true,
      consent: {
        id: consent.id,
        serverAppId: consent.serverAppId,
        appKey: consent.appKey,
        command: consent.command,
        permission: consent.permission,
        subjectKind: consent.subjectKind,
        subjectUserId: consent.subjectUserId,
        buddyAgentId: consent.buddyAgentId,
        expiresAt: consent.expiresAt,
      },
    }
  }

  private async actorBuddyAgentId(actor: Actor) {
    if (actor.kind !== 'agent') return null
    if (actor.agentId) return actor.agentId
    const agent = await this.deps.agentDao.findByUserId(actor.userId)
    return agent?.id ?? null
  }

  private async actorOwnerUserId(actor: Actor, buddyAgentId?: string | null) {
    if (actor.kind !== 'agent') return null
    if (actor.ownerId) return actor.ownerId
    const agent =
      (buddyAgentId ? await this.deps.agentDao.findById(buddyAgentId) : null) ??
      (await this.deps.agentDao.findByUserId(actor.userId))
    return agent?.ownerId ?? null
  }

  private async serverAppResourceContext(serverId: string) {
    const members = await this.deps.serverDao.getMembers(serverId)
    const buddies = members.flatMap((member) => {
      if (!member.agent?.id || !member.user) return []
      const config = isRecord(member.agent.config) ? member.agent.config : {}
      const description = optionalString(config.description)
      return [
        {
          agentId: member.agent.id,
          userId: member.user.id,
          username: member.user.username,
          displayName: member.user.displayName ?? member.user.username ?? member.agent.id,
          description: description ? description.slice(0, 1000) : null,
          avatarUrl: this.deps.mediaService.resolveMediaUrl(member.user.avatarUrl, 'image/png', {
            variant: 'avatar',
          }),
          ownerId: member.agent.ownerId ?? null,
          status: member.user.status,
          agentStatus: member.agent.status,
        },
      ]
    })
    return { buddies }
  }

  private async createCommandBearerToken(input: {
    actor: Actor
    serverId: string
    serverAppId: string
    appKey: string
    command: string
    permission: string
    action: string
    dataClass: string
    channelId: string | null
    buddyAgentId?: string | null
    ownerId?: string | null
    task?: TaskCommandContext | null
  }) {
    if (input.actor.kind === 'system') {
      throw Object.assign(new Error('System actor cannot call server apps'), { status: 403 })
    }
    const buddyAgentId = input.buddyAgentId ?? (await this.actorBuddyAgentId(input.actor))
    const ownerId =
      input.ownerId ??
      (input.actor.kind === 'agent' ? await this.actorOwnerUserId(input.actor, buddyAgentId) : null)
    const token = `sat_cmd_v1_${randomBytes(32).toString('base64url')}`
    const scopes = Array.from(new Set([input.permission, ...(input.task?.scopes ?? [])]))
    await this.deps.appIntegrationDao.createCommandToken({
      tokenHash: hashOpaqueToken(token),
      scopes,
      userId: input.actor.userId,
      serverId: input.serverId,
      serverAppId: input.serverAppId,
      appKey: input.appKey,
      command: input.command,
      actorKind: input.actor.kind,
      buddyAgentId,
      ownerId,
      channelId: input.channelId,
      taskMessageId: input.task?.messageId ?? null,
      taskCardId: input.task?.cardId ?? null,
      taskClaimId: input.task?.claimId ?? null,
      taskWorkspaceId: input.task?.workspaceId ?? null,
      permission: input.permission,
      action: input.action,
      dataClass: input.dataClass,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    })
    return token
  }

  private permissionsInclude(permissions: string[] | null | undefined, permission: string) {
    return Boolean(permissions?.includes('*') || permissions?.includes(permission))
  }

  private async commandSubject(actor: Actor): Promise<CommandSubject> {
    if (actor.kind === 'system') {
      throw Object.assign(new Error('System actor cannot call server apps'), { status: 403 })
    }
    if (actor.kind === 'agent') {
      const buddyAgentId = await this.actorBuddyAgentId(actor)
      if (!buddyAgentId) {
        throw Object.assign(new Error('Buddy actor is missing agent identity'), { status: 403 })
      }
      return {
        subjectKind: 'buddy',
        subjectKey: buddyAgentId,
        subjectUserId: actor.userId,
        buddyAgentId,
      }
    }
    return {
      subjectKind: 'user',
      subjectKey: actor.userId,
      subjectUserId: actor.userId,
      buddyAgentId: null,
    }
  }

  private commandApprovalRequired(input: {
    app: {
      serverId: string
      id: string
      appKey: string
      name: string
    }
    command: {
      name: string
      title?: string
      description?: string
      permission: string
      action: string
      dataClass: string
    }
    actor: Actor
    subject: CommandSubject
    approvalMode: ApprovalMode
    reason: 'not_default' | 'first_time' | 'every_time' | 'restricted' | 'policy'
    channelId?: string | null
  }) {
    return Object.assign(new Error('Server App command approval required'), {
      status: 428,
      code: 'SERVER_APP_COMMAND_APPROVAL_REQUIRED',
      params: {
        approval: {
          serverId: input.app.serverId,
          serverAppId: input.app.id,
          appKey: input.app.appKey,
          appName: input.app.name,
          commandName: input.command.name,
          commandTitle: input.command.title ?? input.command.name,
          commandDescription: input.command.description ?? null,
          permission: input.command.permission,
          action: input.command.action,
          dataClass: input.command.dataClass,
          actorKind: input.actor.kind,
          subjectKind: input.subject.subjectKind,
          buddyAgentId: input.subject.buddyAgentId,
          approvalMode: input.approvalMode,
          reason: input.reason,
          channelId: input.channelId ?? null,
        },
      },
    })
  }

  private async requireCommandAccess(input: CommandAccessRequest) {
    const subject = await this.commandSubject(input.actor)
    const defaultAllowed = this.permissionsInclude(
      input.app.defaultPermissions,
      input.command.permission,
    )
    let explicitBuddyGrantAllows = false
    let grantApprovalMode: ApprovalMode | null = null

    if (subject.subjectKind === 'buddy') {
      const grant = await this.deps.appIntegrationDao.findBuddyGrant(
        input.app.id,
        subject.buddyAgentId!,
      )
      if (grant?.expiresAt && new Date() > grant.expiresAt) {
        throw Object.assign(new Error('Buddy app grant expired'), { status: 403 })
      }
      explicitBuddyGrantAllows = this.permissionsInclude(
        grant?.permissions,
        input.command.permission,
      )
      grantApprovalMode = explicitBuddyGrantAllows
        ? ((grant!.approvalMode as ApprovalMode | null) ?? 'none')
        : null
    }

    const baseAllowed =
      subject.subjectKind === 'buddy' ? defaultAllowed || explicitBuddyGrantAllows : defaultAllowed

    const restricted = RESTRICTED_DATA_CLASSES.has(input.command.dataClass)
    const manifestApprovalMode = (input.command.approvalMode ??
      (input.app.defaultApprovalMode as ApprovalMode) ??
      'none') as ApprovalMode
    let approvalMode = grantApprovalMode ?? manifestApprovalMode

    let reason: 'not_default' | 'first_time' | 'every_time' | 'restricted' | 'policy' = 'first_time'
    if (restricted && approvalMode === 'none') {
      approvalMode = 'first_time'
      reason = 'restricted'
    } else if (!baseAllowed && approvalMode === 'none') {
      approvalMode = 'first_time'
      reason = 'not_default'
    } else if (approvalMode === 'every_time') {
      reason = 'every_time'
    } else if (approvalMode === 'policy') {
      reason = 'policy'
      approvalMode = 'first_time'
    }

    if (baseAllowed && approvalMode === 'none') {
      return { subject, approvalMode, transientConsentId: null }
    }

    const consent = await this.deps.appIntegrationDao.findCommandConsent({
      serverAppId: input.app.id,
      command: input.command.name,
      subjectKind: subject.subjectKind,
      subjectKey: subject.subjectKey,
    })
    const consentValid =
      consent &&
      !consent.consumedAt &&
      (!consent.expiresAt || consent.expiresAt.getTime() > Date.now())
    if (!consentValid) {
      throw this.commandApprovalRequired({
        app: input.app,
        command: input.command,
        actor: input.actor,
        subject,
        approvalMode,
        reason,
        channelId: input.channelId ?? null,
      })
    }

    return {
      subject,
      approvalMode,
      transientConsentId: approvalMode === 'every_time' ? consent.id : null,
    }
  }

  private async requireCommandAccessWithAuthorizationWait(
    input: CommandAccessRequest,
    options?: CommandAuthorizationWaitOptions,
  ) {
    try {
      return await this.requireCommandAccess(input)
    } catch (error) {
      if (!this.isCommandApprovalRequiredError(error)) throw error
      return this.waitForAuthorization({
        initialError: error,
        options,
        isPendingError: (candidate) => this.isCommandApprovalRequiredError(candidate),
        retry: () => this.requireCommandAccess(input),
        onRequired: options?.onCommandApprovalRequired,
      })
    }
  }

  private async taskCommandContext(input: {
    actor: Actor
    task?: CallServerAppCommandInput['task']
  }): Promise<TaskCommandContext | null> {
    if (!input.task) return null
    const result = await this.deps.buddyInboxService.assertTaskCommandAccess(
      {
        messageId: input.task.messageId,
        cardId: input.task.cardId,
        claimId: input.task.claimId,
      },
      input.actor,
    )
    return result.task
  }

  private async consumeTransientCommandConsent(access: { transientConsentId: string | null }) {
    if (access.transientConsentId) {
      await this.deps.appIntegrationDao.markCommandConsentConsumed(access.transientConsentId)
    }
  }

  private commandUrl(baseUrl: string, path: string) {
    return new URL(path.replace(/^\/+/u, ''), `${baseUrl.replace(/\/$/, '')}/`)
  }

  private async fetchCommand(url: URL, init: RequestInit) {
    if (
      shouldAllowDevLoopback(url) ||
      shouldAllowDevServerAppHost(url) ||
      isAllowlistedServerAppHost(url)
    ) {
      return fetch(url, { ...init, redirect: 'manual' })
    }
    return this.deps.safeHttpClient.fetch(url.toString(), init, { maxRedirects: 0 })
  }

  private authorizationWaitOptions(options?: CommandAuthorizationWaitOptions) {
    return {
      waitMs: Math.max(0, options?.waitMs ?? DEFAULT_COMMAND_AUTHORIZATION_WAIT_MS),
      pollMs: Math.max(1, options?.pollMs ?? DEFAULT_COMMAND_AUTHORIZATION_POLL_MS),
    }
  }

  private async waitForAuthorization<TResult>(input: {
    initialError: unknown
    options?: CommandAuthorizationWaitOptions
    isPendingError: (error: unknown) => boolean
    retry: () => Promise<TResult>
    onRequired?: (error: unknown) => void | Promise<void>
  }) {
    // Product contract: server App commands from the iframe or shadow-cli wait briefly for
    // human/bridge authorization so the original command can continue after approval.
    const { waitMs, pollMs } = this.authorizationWaitOptions(input.options)
    if (waitMs <= 0) throw input.initialError

    if (input.onRequired) {
      try {
        await input.onRequired(input.initialError)
      } catch (error) {
        this.deps.logger.warn({ error }, 'Server App authorization request notification failed')
      }
    }

    const deadline = Date.now() + waitMs
    let lastError = input.initialError
    while (Date.now() < deadline) {
      await sleep(Math.min(pollMs, Math.max(1, deadline - Date.now())))
      try {
        return await input.retry()
      } catch (error) {
        if (!input.isPendingError(error)) throw error
        lastError = error
      }
    }
    throw lastError
  }

  private isCommandApprovalRequiredError(error: unknown) {
    return errorCode(error) === 'SERVER_APP_COMMAND_APPROVAL_REQUIRED'
  }

  private isBuddyGrantPendingError(error: unknown) {
    return (
      errorCode(error) === 'SERVER_APP_BUDDY_GRANT_REQUIRED' ||
      errorCode(error) === 'SERVER_APP_BUDDY_GRANT_EXPIRED' ||
      errorCode(error) === 'SERVER_APP_BUDDY_GRANT_PERMISSION_REQUIRED'
    )
  }

  private async resolveInboxTaskAgent(serverId: string, task: InboxTaskOutbox) {
    let agent = task.agentId ? await this.deps.agentDao.findById(task.agentId) : null
    if (!agent && task.agentUserId) {
      agent = await this.deps.agentDao.findByUserId(task.agentUserId)
    }
    if (agent) {
      const member = await this.deps.serverDao.getMember(serverId, agent.userId)
      return member ? agent : null
    }

    const label = task.assigneeLabel ? normalizeAgentLabel(task.assigneeLabel) : ''
    if (!label) return null
    const members = await this.deps.serverDao.getMembers(serverId)
    const match = members.find((member) => {
      if (!member.agent || !member.user) return false
      const labels = [
        member.user.displayName,
        member.user.username,
        member.agent.id,
        member.user.id,
      ]
        .filter((item): item is string => typeof item === 'string')
        .map(normalizeAgentLabel)
      return labels.includes(label)
    })
    return match?.agent ? await this.deps.agentDao.findById(match.agent.id) : null
  }

  // App backends and CLI/tooling surfaces use this structured error to ask an
  // admin for the missing Buddy delivery grant without parsing message text.
  private createBuddyGrantError(input: {
    app: { id: string; serverId?: string | null; appKey?: string | null; name?: string | null }
    agentId: string
    commandName?: string | null
    reason: 'missing' | 'expired' | 'permission'
    code: string
    message: string
  }) {
    return Object.assign(new Error(input.message), {
      status: 403,
      code: input.code,
      params: {
        grant: {
          serverId: input.app.serverId ?? null,
          serverAppId: input.app.id,
          appKey: input.app.appKey ?? null,
          appName: input.app.name ?? null,
          commandName: input.commandName ?? null,
          buddyAgentId: input.agentId,
          permissions: [BUDDY_INBOX_DELIVERY_PERMISSION],
          reason: input.reason,
        },
      },
    })
  }

  private async readInboxTaskDeliveryGrant(input: {
    app: { id: string; serverId?: string | null; appKey?: string | null; name?: string | null }
    agentId: string
    commandName?: string | null
  }) {
    const grant = await this.deps.appIntegrationDao.findBuddyGrant(input.app.id, input.agentId)
    if (!grant) {
      throw this.createBuddyGrantError({
        app: input.app,
        agentId: input.agentId,
        commandName: input.commandName,
        reason: 'missing',
        code: 'SERVER_APP_BUDDY_GRANT_REQUIRED',
        message: 'Server App is not authorized to deliver Inbox tasks to this Buddy',
      })
    }
    if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now()) {
      throw this.createBuddyGrantError({
        app: input.app,
        agentId: input.agentId,
        commandName: input.commandName,
        reason: 'expired',
        code: 'SERVER_APP_BUDDY_GRANT_EXPIRED',
        message: 'Server App Buddy grant expired',
      })
    }
    if (!this.permissionsInclude(grant.permissions, BUDDY_INBOX_DELIVERY_PERMISSION)) {
      throw this.createBuddyGrantError({
        app: input.app,
        agentId: input.agentId,
        commandName: input.commandName,
        reason: 'permission',
        code: 'SERVER_APP_BUDDY_GRANT_PERMISSION_REQUIRED',
        message: `Server App Buddy grant is missing ${BUDDY_INBOX_DELIVERY_PERMISSION}`,
      })
    }
    return grant
  }

  private async requireInboxTaskDeliveryGrant(
    input: {
      app: { id: string; serverId?: string | null; appKey?: string | null; name?: string | null }
      agentId: string
      commandName?: string | null
    },
    options?: CommandAuthorizationWaitOptions,
  ) {
    try {
      return await this.readInboxTaskDeliveryGrant(input)
    } catch (error) {
      if (!this.isBuddyGrantPendingError(error)) throw error
      return this.waitForAuthorization({
        initialError: error,
        options,
        isPendingError: (candidate) => this.isBuddyGrantPendingError(candidate),
        retry: () => this.readInboxTaskDeliveryGrant(input),
      })
    }
  }

  private async attachInboxTaskDeliveries(input: {
    result: Record<string, unknown>
    serverId: string
    app: { id: string; appKey: string; name: string }
    commandName: string
    actor: Actor
    authorization?: CommandAuthorizationWaitOptions
  }) {
    const tasks = extractInboxTaskOutbox(input.result)
    if (tasks.length === 0) return input.result

    const deliveries: ShadowServerAppInboxDelivery[] = []
    const errors: ShadowServerAppInboxDeliveryError[] = []
    for (const task of tasks) {
      let targetAgentId = task.agentId
      let targetAgentUserId = task.agentUserId
      let deliveryIdempotencyKey = task.idempotencyKey
      try {
        const agent = await this.resolveInboxTaskAgent(input.serverId, task)
        if (!agent) {
          throw Object.assign(new Error('Inbox task target Buddy was not found in this server'), {
            status: 404,
          })
        }
        targetAgentId = agent.id
        targetAgentUserId = agent.userId
        await this.requireInboxTaskDeliveryGrant(
          {
            app: { ...input.app, serverId: input.serverId },
            agentId: agent.id,
            commandName: input.commandName,
          },
          task.required ? input.authorization : { waitMs: 0 },
        )
        const idempotencyKey =
          task.idempotencyKey ??
          [
            input.app.appKey,
            input.commandName,
            task.resource?.kind,
            task.resource?.id,
            agent.id,
            task.title,
          ]
            .filter(Boolean)
            .join(':')
        deliveryIdempotencyKey = idempotencyKey
        const inboxRequest = buildShadowServerAppInboxTaskRequest({
          serverIdOrSlug: input.serverId,
          target: { agentId: agent.id },
          task: { ...task, idempotencyKey },
          app: {
            id: input.app.id,
            appKey: input.app.appKey,
            serverId: input.serverId,
            name: input.app.name,
          },
          commandName: input.commandName,
        })
        const message = await this.deps.buddyInboxService.enqueueTaskForAgent(
          input.serverId,
          agent.id,
          inboxRequest.body,
          input.actor,
        )
        deliveries.push({
          agentId: agent.id,
          agentUserId: agent.userId,
          channelId: message.channelId,
          messageId: message.id,
          cardId: getShadowServerAppTaskCardId(message),
          idempotencyKey,
        })
        this.deps.io.to(`channel:${message.channelId}`).emit('message:new', message)
      } catch (err) {
        const pendingId =
          err && typeof err === 'object' && 'pendingId' in err
            ? optionalString((err as { pendingId?: unknown }).pendingId)
            : undefined
        const pendingChannelId =
          err && typeof err === 'object' && 'channelId' in err
            ? optionalString((err as { channelId?: unknown }).channelId)
            : undefined
        if (pendingId) {
          deliveries.push({
            ...(targetAgentId ? { agentId: targetAgentId } : {}),
            ...(targetAgentUserId ? { agentUserId: targetAgentUserId } : {}),
            ...(pendingChannelId ? { channelId: pendingChannelId } : {}),
            pendingId,
            idempotencyKey: deliveryIdempotencyKey,
          })
          continue
        }
        if (task.required) throw err
        errors.push({
          title: task.title,
          ...(task.assigneeLabel ? { assigneeLabel: task.assigneeLabel } : {}),
          ...(task.agentId ? { agentId: task.agentId } : {}),
          ...(task.agentUserId ? { agentUserId: task.agentUserId } : {}),
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return attachInboxDeliveryResult(input.result, deliveries, errors)
  }

  private async resolveChannelMessageTarget(serverId: string, message: ChannelMessageOutbox) {
    if (message.channelId) {
      const channel = await this.deps.channelDao.findById(message.channelId)
      if (channel?.serverId === serverId) return channel
      return null
    }
    const channelName = message.channelName?.trim()
    if (!channelName) return null
    const channels = await this.deps.channelDao.findByServerId(serverId)
    const normalized = channelName.toLowerCase()
    return channels.find((channel) => channel.name.toLowerCase() === normalized) ?? null
  }

  private async findMessageByChannelMessageIdempotencyKey(
    channelId: string,
    idempotencyKey?: string,
  ) {
    const key = idempotencyKey?.trim()
    if (!key) return null
    const recent = await this.deps.messageDao.findByChannelId(channelId, 100)
    return (
      recent.messages.find(
        (message) => channelMessageIdempotencyFromMetadata(message.metadata) === key,
      ) ?? null
    )
  }

  private async attachChannelMessageDeliveries(input: {
    result: Record<string, unknown>
    serverId: string
    actor: Actor
  }) {
    const messages = extractChannelMessageOutbox(input.result)
    if (messages.length === 0) return input.result
    if (input.actor.kind === 'system') {
      const errors = messages.map((message) => ({
        ...(message.channelId ? { channelId: message.channelId } : {}),
        ...(message.channelName ? { channelName: message.channelName } : {}),
        ...(message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : {}),
        error: 'System actor cannot send channel messages',
      }))
      return attachChannelMessageDeliveryResult(input.result, [], errors)
    }

    const deliveries: ShadowServerAppChannelMessageDelivery[] = []
    const errors: ShadowServerAppChannelMessageDeliveryError[] = []
    for (const message of messages) {
      try {
        const channel = await this.resolveChannelMessageTarget(input.serverId, message)
        if (!channel) {
          throw Object.assign(new Error('Channel message target was not found in this server'), {
            status: 404,
          })
        }
        const existing = await this.findMessageByChannelMessageIdempotencyKey(
          channel.id,
          message.idempotencyKey,
        )
        if (existing) {
          deliveries.push({
            channelId: channel.id,
            messageId: existing.id,
            ...(message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : {}),
          })
          continue
        }
        const created = await this.deps.messageService.send(channel.id, input.actor.userId, {
          content: message.content,
          ...(message.metadata || message.idempotencyKey
            ? {
                metadata: withChannelMessageIdempotencyMetadata(
                  message.metadata,
                  message.idempotencyKey,
                ),
              }
            : {}),
        })
        deliveries.push({
          channelId: channel.id,
          messageId: created.id,
          ...(message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : {}),
        })
        this.deps.io.to(`channel:${channel.id}`).emit('message:new', created)
      } catch (err) {
        errors.push({
          ...(message.channelId ? { channelId: message.channelId } : {}),
          ...(message.channelName ? { channelName: message.channelName } : {}),
          ...(message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : {}),
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return attachChannelMessageDeliveryResult(input.result, deliveries, errors)
  }

  private assertSignature(signature: string, expected: string) {
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private publishCommandEvent(input: {
    serverId: string
    serverAppId: string
    appKey: string
    command: string
    actorKind: string
    action: string
    dataClass: string
  }) {
    this.deps.appIntegrationEventBus.publish({
      type: SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT,
      serverId: input.serverId,
      serverAppId: input.serverAppId,
      appKey: input.appKey,
      command: input.command,
      actorKind: input.actorKind,
      action: input.action,
      dataClass: input.dataClass,
      timestamp: new Date().toISOString(),
    })
  }

  async callCommand(input: {
    serverIdOrSlug: string
    appKey: string
    commandName: string
    actor: Actor
    body: CallServerAppCommandInput
    multipart?: {
      fields: Record<string, string>
      files: Array<{ field: string; name: string; type: string; value: Blob }>
    }
    authorization?: CommandAuthorizationWaitOptions
  }) {
    const serverId = await this.resolveServerId(input.serverIdOrSlug)
    await this.deps.policyService.requireServerMember(input.actor, serverId)
    let app = await this.findFreshApp(serverId, input.appKey)
    if (!app) throw Object.assign(new Error('App integration not found'), { status: 404 })
    let command = app.manifest.commands.find((item) => item.name === input.commandName)
    if (!command && app.manifestUrl) {
      app = await this.refreshInstalledManifest(app, { throwOnError: true })
      command = app.manifest.commands.find((item) => item.name === input.commandName)
    }
    if (!command) throw Object.assign(new Error('App command not found'), { status: 404 })
    if (input.multipart) {
      if (command.input !== 'multipart' && command.binary?.supported !== true) {
        throw Object.assign(new Error('App command does not accept multipart input'), {
          status: 415,
        })
      }
      const maxBytes = command.binary?.maxBytes ?? app.manifest.binary?.maxBytes
      const contentTypes = command.binary?.contentTypes ?? app.manifest.binary?.contentTypes
      for (const file of input.multipart.files) {
        if (maxBytes && file.value.size > maxBytes) {
          throw Object.assign(new Error('Uploaded file exceeds app command limit'), { status: 413 })
        }
        if (contentTypes?.length && !contentTypes.includes(file.type)) {
          throw Object.assign(new Error('Uploaded file type is not accepted by this app command'), {
            status: 415,
          })
        }
      }
    }
    const commandAccess = await this.requireCommandAccessWithAuthorizationWait(
      {
        actor: input.actor,
        app,
        command,
        channelId: input.body.channelId ?? null,
      },
      input.authorization,
    )
    const taskContext = await this.taskCommandContext({
      actor: input.actor,
      task: input.body.task,
    })

    const jsonLimits = validateJsonLimits(safeJson(input.body.input), COMMAND_INPUT_LIMITS)
    if (!jsonLimits.ok) throw Object.assign(new Error(jsonLimits.error), { status: 413 })

    const buddyAgentId = await this.actorBuddyAgentId(input.actor)
    const ownerId = await this.actorOwnerUserId(input.actor, buddyAgentId)
    const resources = await this.serverAppResourceContext(serverId)
    const context = {
      protocol: 'shadow.app/1',
      serverId,
      serverAppId: app.id,
      appKey: app.appKey,
      command: command.name,
      actor: {
        kind: input.actor.kind,
        userId: input.actor.kind === 'system' ? null : input.actor.userId,
        buddyAgentId,
        ownerId,
      },
      channelId: input.body.channelId ?? null,
      resources,
      permission: command.permission,
      action: command.action,
      dataClass: command.dataClass,
      ...(taskContext
        ? {
            task: {
              messageId: taskContext.messageId,
              cardId: taskContext.cardId,
              claimId: taskContext.claimId,
              channelId: taskContext.channelId,
              workspaceId: taskContext.workspaceId,
              scopes: taskContext.scopes,
            },
          }
        : {}),
    }

    const authType = serverAppAuthType(app.manifest)
    const timestamp = new Date().toISOString()
    const url = this.commandUrl(app.apiBaseUrl, command.path)
    const headers: Record<string, string> = {
      'X-Shadow-Protocol': 'shadow.app/1',
      'X-Shadow-Server-Id': serverId,
      'X-Shadow-Server-App-Id': app.id,
      'X-Shadow-App-Key': app.appKey,
      'X-Shadow-Command': command.name,
      'X-Shadow-Actor-Kind': input.actor.kind,
      'X-Shadow-Timestamp': timestamp,
    }
    if (authType === 'oauth2-bearer') {
      headers.Authorization = `Bearer ${await this.createCommandBearerToken({
        actor: input.actor,
        serverId,
        serverAppId: app.id,
        appKey: app.appKey,
        command: command.name,
        permission: command.permission,
        action: command.action,
        dataClass: command.dataClass,
        channelId: input.body.channelId ?? null,
        buddyAgentId,
        ownerId,
        task: taskContext,
      })}`
    }

    let body: BodyInit
    if (input.multipart) {
      const form = new FormData()
      form.set('context', JSON.stringify(context))
      form.set('input', JSON.stringify(input.body.input ?? {}))
      for (const [key, value] of Object.entries(input.multipart.fields)) form.set(key, value)
      for (const file of input.multipart.files) form.set(file.field, file.value, file.name)
      body = form
    } else {
      const payload = Buffer.from(
        JSON.stringify({
          input: input.body.input ?? {},
          context,
        }),
      )
      headers['Content-Type'] = 'application/json'
      body = payload
    }

    const response = await this.fetchCommand(url, {
      method: 'POST',
      headers,
      body,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      this.deps.logger.warn({ status: response.status, appKey: app.appKey }, 'App command failed')
      throw Object.assign(new Error(text || `App command failed with ${response.status}`), {
        status: response.status,
      })
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      const buffer = Buffer.from(await response.arrayBuffer())
      this.publishCommandEvent({
        serverId,
        serverAppId: app.id,
        appKey: app.appKey,
        command: command.name,
        actorKind: input.actor.kind,
        action: command.action,
        dataClass: command.dataClass,
      })
      await this.consumeTransientCommandConsent(commandAccess)
      return {
        type: 'binary',
        contentType: contentType || 'application/octet-stream',
        filename: response.headers.get('content-disposition') ?? null,
        size: buffer.byteLength,
        dataBase64: buffer.toString('base64'),
      }
    }

    const result = (await response.json()) as unknown
    if (!isRecord(result)) {
      this.publishCommandEvent({
        serverId,
        serverAppId: app.id,
        appKey: app.appKey,
        command: command.name,
        actorKind: input.actor.kind,
        action: command.action,
        dataClass: command.dataClass,
      })
      await this.consumeTransientCommandConsent(commandAccess)
      return { ok: true, result }
    }
    const deliveredInboxResult = await this.attachInboxTaskDeliveries({
      result,
      serverId,
      app: { id: app.id, appKey: app.appKey, name: app.name },
      commandName: command.name,
      actor: input.actor,
      authorization: input.authorization,
    })
    const deliveredResult = await this.attachChannelMessageDeliveries({
      result: deliveredInboxResult,
      serverId,
      actor: input.actor,
    })
    this.publishCommandEvent({
      serverId,
      serverAppId: app.id,
      appKey: app.appKey,
      command: command.name,
      actorKind: input.actor.kind,
      action: command.action,
      dataClass: command.dataClass,
    })
    await this.consumeTransientCommandConsent(commandAccess)
    return deliveredResult
  }

  async introspectCommandToken(serverIdOrSlug: string, appKey: string, token: string) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    const app = await this.deps.appIntegrationDao.findByServerAndKey(serverId, appKey)
    if (!app) return { active: false }

    const payload = await this.deps.appIntegrationDao.findCommandTokenByHash(hashOpaqueToken(token))
    if (!payload || payload.expiresAt.getTime() <= Date.now()) return { active: false }
    if (
      payload.serverId !== serverId ||
      payload.serverAppId !== app.id ||
      payload.appKey !== app.appKey
    ) {
      return { active: false }
    }

    const actorProfile = payload.userId ? await this.commandActorProfile(payload.userId) : null
    const resources = await this.serverAppResourceContext(serverId)

    return {
      active: true,
      token_type: 'Bearer',
      iss: 'shadow',
      aud: 'shadow:server_app',
      sub:
        payload.actorKind === 'agent' && payload.buddyAgentId
          ? `agent:${payload.buddyAgentId}`
          : `user:${payload.userId}`,
      scope: payload.scopes.join(' '),
      client_id: app.appKey,
      exp: Math.floor(payload.expiresAt.getTime() / 1000),
      iat: Math.floor(payload.createdAt.getTime() / 1000),
      shadow: {
        protocol: 'shadow.app/1',
        serverId,
        serverAppId: app.id,
        appKey: app.appKey,
        command: payload.command,
        actor: {
          kind: payload.actorKind,
          userId: payload.userId,
          buddyAgentId: payload.buddyAgentId ?? null,
          ownerId: payload.ownerId ?? null,
          profile: actorProfile,
        },
        channelId: payload.channelId ?? null,
        resources,
        ...(payload.taskMessageId && payload.taskCardId
          ? {
              task: {
                messageId: payload.taskMessageId,
                cardId: payload.taskCardId,
                claimId: payload.taskClaimId ?? null,
                workspaceId: payload.taskWorkspaceId ?? null,
                scopes: payload.scopes.filter((scope) => scope.startsWith('task:')),
              },
            }
          : {}),
        permission: payload.permission,
        action: payload.action,
        dataClass: payload.dataClass,
      },
    }
  }

  private async commandActorProfile(userId: string) {
    const user = await this.deps.userDao.findById(userId)
    if (!user) return null
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: this.deps.mediaService.resolveMediaUrl(user.avatarUrl, 'image/png', {
        variant: 'avatar',
      }),
    }
  }

  async skills(serverIdOrSlug: string, appKey: string, actor: Actor) {
    const app = await this.get(serverIdOrSlug, appKey, actor)
    const manifest = app.manifest
    const realtimeHelp = manifest.realtime
      ? [
          '',
          'Realtime:',
          manifest.realtime.subscribe?.help
            ? `- Subscribe: ${manifest.realtime.subscribe.help}`
            : '- Subscribe with `shadowob app events <appKey> --server "<server>" --json`.',
          manifest.realtime.publish?.help ? `- Publish: ${manifest.realtime.publish.help}` : '',
          manifest.realtime.stateSync?.help
            ? `- State sync: ${manifest.realtime.stateSync.help}`
            : '',
        ].filter(Boolean)
      : []
    const binaryHelp = manifest.binary?.supported
      ? [
          '',
          'Binary uploads:',
          `- This app accepts binary uploads up to ${manifest.binary.maxBytes ?? 'the app limit'} bytes.`,
          '- Use `shadowob app call <appKey> <command> --server "<server>" --file "<path>" --json-input \'<input-json>\' --json` for commands whose help says they accept files.',
        ]
      : []
    const lines = [
      `# ${manifest.name} App Skill`,
      '',
      `Use when working with ${manifest.name} resources inside this Shadow server.`,
      `Installed server id: ${app.serverId}`,
      ...(manifest.help?.overview ? ['', manifest.help.overview] : []),
      '',
      'Always call through the Shadow CLI:',
      '',
      '```bash',
      `shadowob app call ${manifest.appKey} <command> --server "${app.serverId}" --channel-id "<current-channel-id>" --json-input '<raw-command-input-json>' --json`,
      '```',
      '',
      'The `--json-input` value is the raw command input object, for example `{"title":"Example","priority":"high"}`. The CLI wraps the HTTP request for you.',
      'Use `shadowob app call <appKey> <command> --server "<server>" --help` only when the command list is not enough; command schemas and examples are disclosed there.',
      '',
      'Do not call this App through curl, fetch, raw HTTP routes, or the JavaScript SDK. Use `shadowob app call` so Shadow can apply the server App identity, grant, and command policy path consistently.',
      'If the CLI says command approval is required, do not send a chat form or approve it yourself. Shadow will show the approval popup to a person; wait for that person to confirm before retrying.',
      ...binaryHelp,
      ...realtimeHelp,
      '',
      'Available commands:',
      ...manifest.commands.map(
        (command) =>
          `- ${manifest.appKey} ${command.name}: ${command.help?.summary ?? command.description ?? command.title ?? command.permission}`,
      ),
    ]
    return {
      appKey: manifest.appKey,
      markdown: lines.join('\n'),
      skills: manifest.skills ?? [],
    }
  }
}
