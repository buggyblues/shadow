import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  buildShadowSpaceAppInboxTaskRequest,
  getShadowSpaceAppTaskCardId,
  SHADOW_SPACE_APP_COMMAND_COMPLETED_EVENT,
  SHADOW_SPACE_APP_PROTOCOL,
  type ShadowSpaceAppChannelMessageDelivery,
  type ShadowSpaceAppChannelMessageDeliveryError,
  type ShadowSpaceAppChannelMessageOutbox,
  type ShadowSpaceAppInboxDelivery,
  type ShadowSpaceAppInboxDeliveryError,
  type ShadowSpaceAppInboxTaskOutbox,
  type ShadowSpaceAppResultShadow,
} from '@shadowob/sdk/space-app'
import { BUDDY_INBOX_DELIVERY_PERMISSION, isBuddyInboxPlatformPermission } from '@shadowob/shared'
import type { Logger } from 'pino'
import type { Server as SocketIOServer } from 'socket.io'
import { ZodError } from 'zod'
import type { AgentDao } from '../dao/agent.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { MessageDao } from '../dao/message.dao'
import type { ServerDao } from '../dao/server.dao'
import type { SpaceAppDao } from '../dao/space-app.dao'
import type { UserDao } from '../dao/user.dao'
import type {
  SpaceAppManifest,
  SpaceAppMarketplaceI18nMetadata,
  SpaceAppMarketplaceMetadata,
} from '../db/schema/space-app-installations'
import type { SafeHttpClient } from '../gateways/safe-http-client'
import { rewriteCloudExposureUrlToGateway } from '../lib/cloud-exposure-gateway'
import { validateJsonLimits } from '../lib/json-limits'
import { rewriteSpaceAppManifestToBase } from '../lib/space-app-manifest-urls'
import { type Actor, actorUserId } from '../security/actor'
import {
  type ApproveSpaceAppCommandInput,
  type CallSpaceAppCommandInput,
  type CreateSpaceAppCatalogEntryInput,
  type DiscoverSpaceAppInput,
  type GrantSpaceAppBuddyInput,
  type InstallSpaceAppFromCatalogInput,
  type InstallSpaceAppInput,
  type SpaceAppManifestInput,
  spaceAppManifestSchema,
  type UpdateSpaceAppAccessPolicyInput,
} from '../validators/space-app.schema'
import type { BuddyInboxService } from './buddy-inbox.service'
import type { ChannelService } from './channel.service'
import type { MediaService } from './media.service'
import type { MessageService } from './message.service'
import type { NotificationTriggerService } from './notification-trigger.service'
import type { PolicyService } from './policy.service'
import type { PollService } from './poll.service'
import type { SpaceAppEventBus } from './space-app-event-bus'
import type { SpaceAppNotificationService } from './space-app-notification.service'

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
const DEFAULT_COMMAND_AUTHORIZATION_MAX_WAIT_MS = 60_000
const DEFAULT_INSTALLED_MANIFEST_REFRESH_TTL_MS = 5 * 60 * 1000
const DEFAULT_CATALOG_MANIFEST_REFRESH_TTL_MS = 15 * 60 * 1000

function shadowPublicBaseUrl() {
  return (process.env.OAUTH_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

function absoluteShadowUrl(value: string | null): string | null {
  if (!value || !value.startsWith('/')) return value
  return `${shadowPublicBaseUrl()}${value}`
}

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

function shouldAllowDevSpaceAppHost(url: URL) {
  const host = normalizeHostname(url.hostname)
  return (
    process.env.NODE_ENV !== 'production' &&
    (isLoopbackHost(host) || host === 'host.docker.internal' || host === 'host.lima.internal')
  )
}

function shouldAllowDevDirectFetch() {
  return process.env.NODE_ENV !== 'production'
}

function isAllowlistedSpaceAppHost(url: URL) {
  const allowedHosts = (process.env.SHADOWOB_SPACE_APP_ALLOW_PRIVATE_HOSTS ?? '')
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

function spaceAppCommandIngressPath(command: unknown) {
  if (!isRecord(command)) return null
  const ingress = command.ingress
  if (!isRecord(ingress) || typeof ingress.path !== 'string') return null
  const path = ingress.path.trim()
  return path.startsWith('/') ? path : null
}

function spaceAppCommandIngressMissingError(appKey: string, commandName: string) {
  return Object.assign(
    new Error(
      `Space App command ${appKey}/${commandName} is missing a gateway ingress. Refresh or republish the Space App manifest.`,
    ),
    { status: 409, reason: 'command_ingress_missing' },
  )
}

function errorCode(value: unknown) {
  return isRecord(value) && typeof value.code === 'string' ? value.code : null
}

function errorStatus(value: unknown) {
  return isRecord(value) && typeof value.status === 'number' ? value.status : null
}

function spaceAppTokenIntrospectionError(error: unknown, fallback: string) {
  if (isRecord(error) && typeof error.reason === 'string' && error.reason) return error.reason
  const status = errorStatus(error)
  if (status === 404) return 'space_app_not_installed'
  if (status === 401) return fallback
  return fallback
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function envDurationMs(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function dateMs(value: Date | string | null | undefined) {
  if (!value) return 0
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function isRefreshDue(value: Date | string | null | undefined, ttlMs: number) {
  if (ttlMs <= 0) return true
  const ms = dateMs(value)
  return !ms || Date.now() - ms >= ttlMs
}

function safeJson(value: unknown) {
  if (value === undefined) return null
  return value
}

function hasResourceRules(value: unknown) {
  return isRecord(value) && Object.keys(value).length > 0
}

function formatZodError(error: ZodError) {
  const first = error.issues[0]
  if (!first) return 'Invalid Space App manifest'
  const path = first.path.length ? first.path.join('.') : 'manifest'
  return `Invalid Space App manifest: ${path}: ${first.message}`
}

function requireUserBoundActor(actor: Actor) {
  if (actor.kind === 'system') {
    throw Object.assign(new Error('System actor cannot manage Space Apps'), { status: 403 })
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
  base: SpaceAppMarketplaceMetadata | undefined,
  override: SpaceAppMarketplaceI18nMetadata | undefined,
): SpaceAppMarketplaceMetadata | undefined {
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

function localizeSpaceAppManifest<TManifest extends SpaceAppManifestInput | SpaceAppManifest>(
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

function redactApp(row: Awaited<ReturnType<SpaceAppDao['findById']>>, locale?: string | null) {
  if (!row) return null
  const manifest = localizeSpaceAppManifest(row.manifest, locale)
  const gatewayManifest = rewriteManifestGatewayUrls(manifest)
  return {
    id: row.id,
    serverId: row.serverId,
    appKey: row.appKey,
    name: manifest.name,
    description: manifest.description ?? row.description,
    iconUrl: rewriteCloudExposureUrlToGateway(row.iconUrl),
    manifestUrl: rewriteCloudExposureUrlToGateway(row.manifestUrl),
    manifest: gatewayManifest,
    manifestVersion: row.manifestVersion ?? row.manifest.version ?? null,
    manifestUpdatedAt: row.manifestUpdatedAt,
    manifestFetchedAt: row.manifestFetchedAt,
    iframeEntry: rewriteCloudExposureUrlToGateway(row.iframeEntry),
    allowedOrigins: gatewayManifest.iframe?.allowedOrigins ?? row.allowedOrigins,
    apiBaseUrl: rewriteCloudExposureUrlToGateway(row.apiBaseUrl),
    defaultPermissions: row.defaultPermissions,
    defaultApprovalMode: row.defaultApprovalMode,
    status: row.status,
    installedByUserId: row.installedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function rewriteManifestGatewayUrls(manifest: SpaceAppManifest) {
  const iframeEntry = rewriteCloudExposureUrlToGateway(manifest.iframe?.entry)
  const apiBaseUrl = rewriteCloudExposureUrlToGateway(manifest.api.baseUrl)
  const allowedOrigins = iframeEntry
    ? [new URL(iframeEntry).origin]
    : manifest.iframe?.allowedOrigins
  return {
    ...manifest,
    iconUrl: rewriteCloudExposureUrlToGateway(manifest.iconUrl),
    iframe: manifest.iframe
      ? {
          ...manifest.iframe,
          entry: iframeEntry ?? manifest.iframe.entry,
          allowedOrigins: allowedOrigins ?? manifest.iframe.allowedOrigins,
        }
      : manifest.iframe,
    api: {
      ...manifest.api,
      baseUrl: apiBaseUrl ?? manifest.api.baseUrl,
    },
  }
}

function redactCatalogEntry(
  row: Awaited<ReturnType<SpaceAppDao['findCatalogEntryById']>>,
  locale?: string | null,
) {
  if (!row) return null
  const manifest = localizeSpaceAppManifest(row.manifest, locale)
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
  manifest: SpaceAppManifestInput | SpaceAppManifest,
  locale?: string | null,
) {
  const localizedManifest = localizeSpaceAppManifest(manifest, locale)
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
  row: NonNullable<Awaited<ReturnType<SpaceAppDao['findCatalogEntryById']>>>,
  serverCount = 0,
  locale?: string | null,
) {
  const manifest = localizeSpaceAppManifest(row.manifest, locale)
  return {
    ...redactCatalogEntry(row, locale)!,
    ...catalogEntryMetadata(manifest),
    commandCount: manifest.commands.length,
    skillCount: manifest.skills?.length ?? 0,
    serverCount,
  }
}

function catalogEntryMatchesQuery(
  row: NonNullable<Awaited<ReturnType<SpaceAppDao['findCatalogEntryById']>>>,
  query: string,
  locale?: string | null,
) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  const manifest = localizeSpaceAppManifest(row.manifest, locale)
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

type CatalogEntryRow = NonNullable<Awaited<ReturnType<SpaceAppDao['findCatalogEntryById']>>>

interface LaunchTokenPayload {
  serverId: string
  spaceAppId: string
  appKey: string
  actorKind?: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  exp: number
}

type ApprovalMode = 'none' | 'first_time' | 'every_time' | 'policy'
type CommandSubject = {
  subjectKind: 'user' | 'buddy'
  subjectKey: string
  subjectUserId: string | null
  buddyAgentId: string | null
}
type TaskCommandContext = Awaited<ReturnType<BuddyInboxService['assertTaskCommandAccess']>>['task']

type InboxTaskOutbox = ShadowSpaceAppInboxTaskOutbox
type ChannelMessageOutbox = ShadowSpaceAppChannelMessageOutbox

const RESTRICTED_DATA_CLASSES = new Set(['financial', 'secret', 'cloud-secret'])
const TASK_PRIORITIES = new Set(['low', 'normal', 'medium', 'high'])

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
  if (priority && !TASK_PRIORITIES.has(priority)) {
    throw new Error('Invalid Space App inbox task priority')
  }
  return {
    title,
    ...(optionalString(value.body) ? { body: optionalString(value.body) } : {}),
    ...(priority ? { priority: priority as InboxTaskOutbox['priority'] } : {}),
    ...(optionalString(value.channelId) ? { channelId: optionalString(value.channelId) } : {}),
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
  const spaceApp = optionalRecord(custom?.spaceAppChannelMessage)
  return optionalString(spaceApp?.idempotencyKey)
}

function withChannelMessageIdempotencyMetadata(
  metadata: Record<string, unknown> | undefined,
  idempotencyKey: string | undefined,
) {
  if (!idempotencyKey) return metadata
  const custom = optionalRecord(metadata?.custom) ?? {}
  const spaceAppChannelMessage = optionalRecord(custom.spaceAppChannelMessage) ?? {}
  return {
    ...(metadata ?? {}),
    custom: {
      ...custom,
      spaceAppChannelMessage: {
        ...spaceAppChannelMessage,
        idempotencyKey,
      },
    },
  }
}

function optionalShadowMeta(value: unknown): ShadowSpaceAppResultShadow | null {
  if (!isRecord(value)) return null
  if (value.protocol !== SHADOW_SPACE_APP_PROTOCOL) return null
  return value as unknown as ShadowSpaceAppResultShadow
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
  deliveries: ShadowSpaceAppInboxDelivery[],
  errors: ShadowSpaceAppInboxDeliveryError[],
): Record<string, unknown> {
  const withDeliveryMeta = (value: Record<string, unknown>) => {
    const shadow = optionalShadowMeta(value.shadow)
    return {
      ...value,
      shadow: {
        protocol: SHADOW_SPACE_APP_PROTOCOL,
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
  deliveries: ShadowSpaceAppChannelMessageDelivery[],
  errors: ShadowSpaceAppChannelMessageDeliveryError[],
): Record<string, unknown> {
  const withDeliveryMeta = (value: Record<string, unknown>) => {
    const shadow = optionalShadowMeta(value.shadow)
    return {
      ...value,
      shadow: {
        protocol: SHADOW_SPACE_APP_PROTOCOL,
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
    return new URL('/.well-known/space-app.json', apiBaseUrl).toString()
  } catch {
    return null
  }
}

export class SpaceAppService {
  constructor(
    private deps: {
      spaceAppDao: SpaceAppDao
      agentDao: AgentDao
      channelDao: ChannelDao
      messageDao: MessageDao
      userDao: UserDao
      spaceAppEventBus: SpaceAppEventBus
      buddyInboxService: BuddyInboxService
      channelService: ChannelService
      messageService: MessageService
      serverDao: ServerDao
      policyService: PolicyService
      pollService: PollService
      mediaService: MediaService
      safeHttpClient: SafeHttpClient
      notificationTriggerService: NotificationTriggerService
      spaceAppNotificationService: SpaceAppNotificationService
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

  private async requireSpaceAppManager(actor: Actor, serverId: string) {
    try {
      await this.requireServerAdmin(actor, serverId)
      return
    } catch (error) {
      const status = errorStatus(error)
      if (
        actor.kind !== 'agent' ||
        !actor.ownerId ||
        !actor.agentId ||
        (status !== null && status !== 401 && status !== 403)
      ) {
        throw error
      }
    }

    await this.deps.policyService.requireServerMember(actor, serverId)
    await this.deps.policyService.requireServerRole(actor.ownerId, serverId, 'admin')
  }

  private async notifyAppInstallationChanged(input: {
    actor: Actor
    app: {
      id: string
      serverId: string
      appKey: string
      name: string
      manifestVersion?: string | null
      manifestHash?: string | null
    }
    action: 'installed' | 'updated'
  }) {
    const [server, members] = await Promise.all([
      this.deps.serverDao.findById(input.app.serverId).catch(() => null),
      this.deps.serverDao.getMembers(input.app.serverId).catch(() => []),
    ])
    const recipients = members
      .filter((member) => member.user?.id && !member.user.isBot)
      .map((member) => member.user!.id)
    const uniqueRecipients = [...new Set(recipients)]
    const payload = {
      type: `space_app.${input.action}`,
      serverId: input.app.serverId,
      serverSlug: server?.slug ?? null,
      spaceAppId: input.app.id,
      appKey: input.app.appKey,
      appName: input.app.name,
      manifestVersion: input.app.manifestVersion ?? null,
      manifestHash: input.app.manifestHash ?? null,
      installedByKind: input.actor.kind,
      installedByUserId: input.actor.kind === 'system' ? null : input.actor.userId,
      timestamp: new Date().toISOString(),
    }

    try {
      for (const userId of uniqueRecipients) {
        this.deps.io.to(`user:${userId}`).emit('space-app:list-changed', payload)
      }
    } catch (error) {
      this.deps.logger.warn(
        { error, appKey: input.app.appKey },
        'Space App list refresh event failed',
      )
    }

    try {
      await this.deps.notificationTriggerService.dispatchMany(
        uniqueRecipients.map((userId) => ({
          userId,
          type: 'system' as const,
          kind: input.action === 'installed' ? 'space_app.installed' : 'space_app.updated',
          referenceId: input.app.id,
          referenceType: 'space_app',
          senderId: input.actor.kind === 'system' ? null : input.actor.userId,
          scopeServerId: input.app.serverId,
          aggregate: false,
          bypassPreferences: true,
          metadata: {
            serverId: input.app.serverId,
            serverName: server?.name,
            serverSlug: server?.slug,
            spaceAppId: input.app.id,
            appKey: input.app.appKey,
            appName: input.app.name,
            manifestVersion: input.app.manifestVersion,
            manifestHash: input.app.manifestHash,
            actorKind: input.actor.kind,
          },
        })),
      )
    } catch (error) {
      this.deps.logger.warn(
        { error, appKey: input.app.appKey },
        'Space App install notification failed',
      )
    }
  }

  private async fetchManifest(manifestUrl: string) {
    const fetchUrl = rewriteCloudExposureUrlToGateway(manifestUrl) ?? manifestUrl
    const usesLocalExposureGateway = fetchUrl !== manifestUrl
    const url = new URL(fetchUrl)
    const response =
      usesLocalExposureGateway || shouldAllowDevDirectFetch() || isAllowlistedSpaceAppHost(url)
        ? await fetch(fetchUrl, { redirect: 'manual' })
        : await this.deps.safeHttpClient.fetch(fetchUrl, {}, { maxRedirects: 0 })
    if (!response.ok) {
      throw Object.assign(new Error(`Manifest returned ${response.status}`), { status: 422 })
    }
    const raw = await response.text()
    if (Buffer.byteLength(raw, 'utf8') > MANIFEST_LIMITS.maxBytes) {
      throw Object.assign(new Error('Manifest is too large'), { status: 413 })
    }
    const parsed = JSON.parse(raw) as unknown
    if (usesLocalExposureGateway) {
      const manifest = spaceAppManifestSchema.safeParse(parsed)
      if (manifest.success) {
        return rewriteSpaceAppManifestToBase(
          manifest.data as SpaceAppManifest,
          new URL(manifestUrl).origin,
        )
      }
    }
    return parsed
  }

  private validateManifest(input: unknown) {
    const limits = validateJsonLimits(input, MANIFEST_LIMITS)
    if (!limits.ok) throw Object.assign(new Error(limits.error), { status: 413 })
    const parsed = spaceAppManifestSchema.safeParse(input)
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
    const widgetKeys = new Set<string>()
    for (const widget of manifest.widgets ?? []) {
      if (widgetKeys.has(widget.key)) {
        throw Object.assign(new Error(`Duplicate widget: ${widget.key}`), { status: 422 })
      }
      widgetKeys.add(widget.key)
      const command = manifest.commands.find((item) => item.name === widget.data.command)
      if (!command) {
        throw Object.assign(new Error(`Unknown widget data command: ${widget.data.command}`), {
          status: 422,
        })
      }
      if (command.action !== 'read') {
        throw Object.assign(new Error(`Widget data command must be read-only: ${command.name}`), {
          status: 422,
        })
      }
      let viewNodeCount = 0
      const visitViewNode = (node: typeof widget.view, depth: number) => {
        viewNodeCount += 1
        if (depth > 8 || viewNodeCount > 120) {
          throw Object.assign(new Error(`Widget view is too complex: ${widget.key}`), {
            status: 422,
          })
        }
        if (node.type === 'stack' || node.type === 'row' || node.type === 'grid') {
          for (const child of node.children) visitViewNode(child, depth + 1)
        }
      }
      visitViewNode(widget.view, 1)
      const minimum = widget.size.min
      const maximum = widget.size.max
      const defaultSize = widget.size.default
      if (
        (minimum &&
          (minimum.widthCells > defaultSize.widthCells ||
            minimum.heightCells > defaultSize.heightCells)) ||
        (maximum &&
          (maximum.widthCells < defaultSize.widthCells ||
            maximum.heightCells < defaultSize.heightCells))
      ) {
        throw Object.assign(new Error(`Invalid widget size bounds: ${widget.key}`), { status: 422 })
      }
      const optionKeys = new Set<string>()
      for (const option of widget.options ?? []) {
        if (optionKeys.has(option.key)) {
          throw Object.assign(new Error(`Duplicate widget option: ${widget.key}.${option.key}`), {
            status: 422,
          })
        }
        optionKeys.add(option.key)
        const choiceValues = new Set<string>()
        for (const choice of option.choices) {
          if (choiceValues.has(choice.value)) {
            throw Object.assign(
              new Error(`Duplicate widget option choice: ${widget.key}.${option.key}`),
              { status: 422 },
            )
          }
          choiceValues.add(choice.value)
        }
        if (!option.choices.some((choice) => choice.value === option.defaultValue)) {
          throw Object.assign(
            new Error(`Unknown widget option default: ${widget.key}.${option.key}`),
            { status: 422 },
          )
        }
      }
    }
    return manifest
  }

  private appFieldsFromManifest(manifest: SpaceAppManifestInput) {
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
    TApp extends NonNullable<Awaited<ReturnType<SpaceAppDao['findById']>>>,
  >(
    app: TApp,
    options: { throwOnError?: boolean; inferManifestUrl?: boolean; force?: boolean } = {},
  ) {
    const manifestUrl =
      app.manifestUrl ??
      (options.inferManifestUrl ? manifestUrlFromApiBaseUrl(app.apiBaseUrl) : null)
    if (!manifestUrl) return app
    if (
      !options.force &&
      !isRefreshDue(
        app.manifestFetchedAt,
        envDurationMs(
          'SHADOWOB_SPACE_APP_MANIFEST_REFRESH_TTL_MS',
          DEFAULT_INSTALLED_MANIFEST_REFRESH_TTL_MS,
        ),
      )
    ) {
      return app
    }
    let manifest: SpaceAppManifestInput
    try {
      const rawManifest = await this.fetchManifest(manifestUrl)
      manifest = this.validateManifest(rawManifest)
    } catch (error) {
      if (options.throwOnError) throw error
      this.deps.logger.warn(
        { appKey: app.appKey, spaceAppId: app.id, error },
        'Space App manifest refresh failed',
      )
      return app
    }
    if (manifest.appKey !== app.appKey) {
      const error = Object.assign(new Error('Manifest appKey cannot change during app refresh'), {
        status: 422,
      })
      if (options.throwOnError) throw error
      this.deps.logger.warn({ appKey: app.appKey, spaceAppId: app.id }, error.message)
      return app
    }

    const nextFields = this.appFieldsFromManifest(manifest)
    if (app.manifestHash && app.manifestHash === nextFields.manifestHash && app.manifestUrl) {
      await this.deps.spaceAppNotificationService.syncManifest(app, manifest)
      return app
    }

    const updated = await this.deps.spaceAppDao.updateManifest(app.id, {
      ...nextFields,
      manifestUrl,
    })
    await this.deps.spaceAppNotificationService.syncManifest(updated ?? app, manifest)
    return (updated ?? app) as TApp
  }

  private async refreshCatalogEntry<TEntry extends CatalogEntryRow>(
    row: TEntry,
    options: { throwOnError?: boolean; force?: boolean } = {},
  ) {
    if (!row.manifestUrl) return row
    if (
      !options.force &&
      !isRefreshDue(
        row.updatedAt,
        envDurationMs(
          'SHADOWOB_SPACE_APP_CATALOG_REFRESH_TTL_MS',
          DEFAULT_CATALOG_MANIFEST_REFRESH_TTL_MS,
        ),
      )
    ) {
      return row
    }
    let manifest: SpaceAppManifestInput
    try {
      const rawManifest = await this.fetchManifest(row.manifestUrl)
      manifest = this.validateManifest(rawManifest)
    } catch (error) {
      if (options.throwOnError) throw error
      this.deps.logger.warn(
        { appKey: row.appKey, catalogEntryId: row.id, error },
        'Space App catalog manifest refresh failed',
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

    const updated = await this.deps.spaceAppDao.updateCatalogEntryManifest(row.id, {
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
    const app = await this.deps.spaceAppDao.findByServerAndKey(serverId, appKey)
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
      throw Object.assign(new Error('Invalid app launch token'), {
        status: 401,
        reason: 'invalid_launch_token',
      })
    }
    const body = parts[1]!
    const signature = parts[2]!
    const expected = this.signLaunchPayload(body)
    if (!this.assertSignature(signature, expected)) {
      throw Object.assign(new Error('Invalid app launch token'), {
        status: 401,
        reason: 'invalid_launch_token_signature',
      })
    }
    let payload: unknown
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown
    } catch {
      throw Object.assign(new Error('Invalid app launch token payload'), {
        status: 401,
        reason: 'invalid_launch_token_payload',
      })
    }
    if (
      !isRecord(payload) ||
      typeof payload.serverId !== 'string' ||
      typeof payload.spaceAppId !== 'string' ||
      typeof payload.appKey !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      throw Object.assign(new Error('Invalid app launch token payload'), {
        status: 401,
        reason: 'invalid_launch_token_payload',
      })
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw Object.assign(new Error('Space App launch token expired'), {
        status: 401,
        reason: 'launch_token_expired',
      })
    }
    return payload as unknown as LaunchTokenPayload
  }

  async discover(serverIdOrSlug: string, actor: Actor, input: DiscoverSpaceAppInput) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireSpaceAppManager(actor, serverId)

    const rawManifest = input.manifest ?? (await this.fetchManifest(input.manifestUrl!))
    const manifest = this.validateManifest(rawManifest)
    const installed = await this.deps.spaceAppDao.findByServerAndKey(serverId, manifest.appKey)

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
    input: CreateSpaceAppCatalogEntryInput | DiscoverSpaceAppInput,
  ) {
    if ('sourceSpaceAppId' in input && input.sourceSpaceAppId) {
      const installedRow = await this.deps.spaceAppDao.findById(input.sourceSpaceAppId)
      const installed = installedRow
        ? await this.refreshInstalledManifest(installedRow, {
            throwOnError: true,
            inferManifestUrl: true,
            force: true,
          })
        : null
      if (!installed) {
        throw Object.assign(new Error('Installed Space App not found'), { status: 404 })
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

  async refreshInstalledSpaceAppForAdmin(spaceAppId: string) {
    const app = await this.deps.spaceAppDao.findById(spaceAppId)
    if (!app) throw Object.assign(new Error('Installed Space App not found'), { status: 404 })
    return redactApp(
      await this.refreshInstalledManifest(app, {
        throwOnError: true,
        inferManifestUrl: true,
        force: true,
      }),
    )!
  }

  async refreshCatalogEntryForAdmin(catalogEntryId: string) {
    const row = await this.deps.spaceAppDao.findCatalogEntryById(catalogEntryId)
    if (!row) throw Object.assign(new Error('Space App catalog entry not found'), { status: 404 })
    if (row.manifestUrl)
      return catalogEntryResponse(
        await this.refreshCatalogEntry(row, { throwOnError: true, force: true }),
      )

    const installed = await this.deps.spaceAppDao.findLatestByAppKey(row.appKey)
    if (!installed) {
      throw Object.assign(
        new Error('Catalog entry has no manifest URL and no installed Space App source'),
        {
          status: 422,
        },
      )
    }
    const freshInstalled = await this.refreshInstalledManifest(installed, {
      throwOnError: true,
      inferManifestUrl: true,
      force: true,
    })
    const manifest = this.validateManifest(freshInstalled.manifest)
    const updated = await this.deps.spaceAppDao.updateCatalogEntryManifest(row.id, {
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
      this.deps.spaceAppDao.listCatalogEntries(),
      this.deps.spaceAppDao.listByServer(serverId),
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
    const rows = await this.deps.spaceAppDao.listCatalogEntries({ includeInactive: true })
    const freshRows = await this.refreshCatalogEntries(rows)
    const installCounts = await this.deps.spaceAppDao.countInstallationsByAppKeys(
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
    const rows = await this.deps.spaceAppDao.listCatalogEntries()
    const freshRows = await this.refreshCatalogEntries(rows)
    const query = input.q?.trim() ?? ''
    const matchedRows = query
      ? freshRows.filter((row) => catalogEntryMatchesQuery(row, query, input.locale))
      : freshRows
    const installCounts = await this.deps.spaceAppDao.countInstallationsByAppKeys(
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
    const existing = await this.deps.spaceAppDao.findCatalogEntryByAppKey(appKey)
    if (!existing || existing.status !== 'active') {
      throw Object.assign(new Error('Space App catalog entry not found'), { status: 404 })
    }
    const row = await this.refreshCatalogEntry(existing)
    const installCounts = await this.deps.spaceAppDao.countInstallationsByAppKeys([row.appKey])
    const serverCount = Number(installCounts[0]?.count ?? 0)
    return catalogEntryResponse(row, serverCount, options.locale)
  }

  async upsertCatalogEntry(actor: Actor, input: CreateSpaceAppCatalogEntryInput) {
    const preview = await this.buildCatalogPreview(input)
    const row = await this.deps.spaceAppDao.upsertCatalogEntry({
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
    await this.deps.spaceAppDao.deleteCatalogEntryById(id)
    return { ok: true }
  }

  async installFromCatalog(
    serverIdOrSlug: string,
    catalogEntryId: string,
    actor: Actor,
    input: InstallSpaceAppFromCatalogInput,
  ) {
    void input
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireSpaceAppManager(actor, serverId)
    const entry = await this.deps.spaceAppDao.findCatalogEntryById(catalogEntryId)
    if (!entry || entry.status !== 'active') {
      throw Object.assign(new Error('Space App catalog entry not found'), { status: 404 })
    }
    if (entry.manifestUrl) {
      return this.install(serverId, actor, { manifestUrl: entry.manifestUrl })
    }
    return this.install(serverId, actor, {
      manifest: this.validateManifest(entry.manifest),
    })
  }

  async install(serverIdOrSlug: string, actor: Actor, input: InstallSpaceAppInput) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireSpaceAppManager(actor, serverId)

    const rawManifest = input.manifest ?? (await this.fetchManifest(input.manifestUrl!))
    const manifest = this.validateManifest(rawManifest)
    const existing = await this.deps.spaceAppDao.findByServerAndKey(serverId, manifest.appKey)
    const manifestFields = this.appFieldsFromManifest(manifest)
    const app = await this.deps.spaceAppDao.upsert({
      serverId,
      appKey: manifest.appKey,
      manifestUrl: input.manifestUrl ?? null,
      ...manifestFields,
      defaultPermissions: manifestDefaultPermissions(manifest),
      defaultApprovalMode: manifestDefaultApprovalMode(manifest),
      installedByUserId: requireUserBoundActor(actor),
    })
    await this.deps.spaceAppNotificationService.syncManifest(app, manifest)
    await this.notifyAppInstallationChanged({
      actor,
      app,
      action: existing ? 'updated' : 'installed',
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
      spaceAppId: app.id,
      appKey: app.appKey,
      actorKind: actor.kind,
      userId: actor.kind === 'system' ? null : actor.userId,
      buddyAgentId,
      ownerId,
      exp,
    })
    const eventStreamPath = `/api/servers/${encodeURIComponent(app.serverId)}/space-apps/${encodeURIComponent(
      app.appKey,
    )}/events`

    return {
      serverId: app.serverId,
      spaceAppId: app.id,
      appKey: app.appKey,
      iframeEntry: app.iframeEntry,
      allowedOrigins: app.allowedOrigins,
      mobile: app.manifest.mobile,
      launchToken,
      eventStreamPath,
      expiresIn: 600,
    }
  }

  async getEventStreamContext(serverIdOrSlug: string, appKey: string, token: string) {
    const payload = this.parseLaunchToken(token)
    const serverId = await this.resolveServerId(serverIdOrSlug)
    if (payload.serverId !== serverId || payload.appKey !== appKey) {
      throw Object.assign(new Error('Launch token does not match app'), {
        status: 401,
        reason: 'launch_token_app_mismatch',
      })
    }
    const app = await this.deps.spaceAppDao.findById(payload.spaceAppId)
    if (!app || app.serverId !== serverId || app.appKey !== appKey) {
      throw Object.assign(new Error('Space App installation not found'), {
        status: 404,
        reason: 'space_app_not_installed',
      })
    }
    return {
      app: redactApp(app)!,
      payload,
    }
  }

  async introspectLaunchToken(serverIdOrSlug: string, appKey: string, token: string) {
    try {
      const { app, payload } = await this.getEventStreamContext(serverIdOrSlug, appKey, token)
      const actorProfile = payload.userId ? await this.commandActorProfile(payload.userId) : null
      return {
        active: true,
        token_type: 'Bearer',
        client_id: app.appKey,
        exp: payload.exp,
        shadow: {
          protocol: 'shadow.space-app/1',
          serverId: payload.serverId,
          spaceAppId: payload.spaceAppId,
          appKey: payload.appKey,
          actor: {
            kind: payload.actorKind ?? 'unknown',
            userId: payload.userId ?? null,
            buddyAgentId: payload.buddyAgentId ?? null,
            ownerId: payload.ownerId ?? null,
            ...(actorProfile ? { profile: actorProfile } : {}),
          },
        },
      }
    } catch (error) {
      return {
        active: false,
        error: spaceAppTokenIntrospectionError(error, 'invalid_launch_token'),
      }
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
    throw Object.assign(new Error('Launch token is not bound to a user actor'), {
      status: 401,
      reason: 'launch_token_actor_missing',
    })
  }

  async listLaunchBuddyInboxes(serverIdOrSlug: string, appKey: string, token: string) {
    const { payload } = await this.getEventStreamContext(serverIdOrSlug, appKey, token)
    const actor = this.actorFromLaunchPayload(payload)
    return this.deps.buddyInboxService.listForServer(payload.serverId, actor)
  }

  async listLaunchSpaceMembers(serverIdOrSlug: string, appKey: string, token: string) {
    const { payload } = await this.getEventStreamContext(serverIdOrSlug, appKey, token)
    const actor = this.actorFromLaunchPayload(payload)
    await this.deps.policyService.requireServerMember(actor, payload.serverId)
    const members = await this.deps.serverDao.getMembers(payload.serverId)
    return members.map((member) => ({
      id: member.id,
      userId: member.userId ?? member.user?.id,
      username: member.user?.username,
      displayName:
        member.nickname ?? member.user?.displayName ?? member.user?.username ?? member.user?.id,
      avatarUrl: absoluteShadowUrl(this.deps.mediaService.resolveAvatarUrl(member.user?.avatarUrl)),
      role: member.role,
      kind: member.user?.isBot ? 'bot' : 'user',
      isBot: member.user?.isBot ?? false,
    }))
  }

  async listLaunchChannels(serverIdOrSlug: string, appKey: string, token: string) {
    const { payload } = await this.getEventStreamContext(serverIdOrSlug, appKey, token)
    const actor = this.actorFromLaunchPayload(payload)
    const channels = await this.deps.channelService.getByServerIdForUser(payload.serverId, actor)
    return channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      topic: channel.topic,
      isPrivate: channel.isPrivate,
      isArchived: channel.isArchived,
    }))
  }

  async getLaunchMessage(serverIdOrSlug: string, appKey: string, token: string, messageId: string) {
    const { payload } = await this.getEventStreamContext(serverIdOrSlug, appKey, token)
    const actor = this.actorFromLaunchPayload(payload)
    const message = await this.deps.messageDao.findById(messageId)
    if (!message) {
      throw Object.assign(new Error('Message not found'), {
        status: 404,
        reason: 'message_not_found',
      })
    }
    const access = await this.deps.policyService.requireChannelRead(actor, message.channelId)
    if (access.channel.serverId !== payload.serverId) {
      throw Object.assign(new Error('Message must belong to the current Space'), {
        status: 403,
        reason: 'cross_space_message',
      })
    }
    return this.deps.messageService.getById(messageId, actorUserId(actor))
  }

  async ensureLaunchChannel(
    serverIdOrSlug: string,
    appKey: string,
    token: string,
    input: {
      dedupeKey: string
      name: string
      topic?: string
      isPrivate?: boolean
      memberUserIds?: string[]
      syncMembers?: boolean
    },
  ) {
    const { app, payload } = await this.getEventStreamContext(serverIdOrSlug, appKey, token)
    const actor = this.actorFromLaunchPayload(payload)
    await this.deps.policyService.requireServerMember(actor, payload.serverId)
    const marker = `space-app:${app.appKey}:${input.dedupeKey}`
    const channels = await this.deps.channelDao.findByServerId(payload.serverId)
    let channel = channels.find(
      (candidate) =>
        candidate.topic?.includes(marker) ||
        (!candidate.topic?.includes('space-app:') && candidate.topic?.includes(input.dedupeKey)),
    )
    const created = !channel
    if (!channel) {
      channel = await this.deps.channelService.create(
        payload.serverId,
        {
          name: input.name,
          type: 'text',
          topic: [marker, input.topic].filter(Boolean).join(' · ').slice(0, 1024),
          isPrivate: input.isPrivate ?? true,
        },
        actor,
      )
    }
    if (!channel) throw Object.assign(new Error('Channel could not be created'), { status: 500 })

    if (!created) {
      const authorizedChannel = input.syncMembers
        ? await this.deps.policyService.requireChannelManage(actor, channel.id)
        : (await this.deps.policyService.requireChannelRead(actor, channel.id)).channel
      if (authorizedChannel.serverId !== payload.serverId) {
        throw Object.assign(new Error('Channel must belong to the current Space'), {
          status: 403,
          reason: 'cross_space_channel',
        })
      }
    }

    if (input.syncMembers) {
      const serverMembers = await this.deps.serverDao.getMembers(payload.serverId)
      const allowedUserIds = new Set(serverMembers.map((member) => member.userId))
      const requestedUserIds = input.memberUserIds ?? []
      const invalidUserIds = requestedUserIds.filter((userId) => !allowedUserIds.has(userId))
      if (invalidUserIds.length > 0) {
        throw Object.assign(new Error('Channel members must belong to the current Space'), {
          status: 422,
          reason: 'cross_space_channel_member',
        })
      }
      const desiredUserIds = new Set([...requestedUserIds, actorUserId(actor)])
      const currentMembers = await this.deps.channelService.getChannelMembers(
        channel.id,
        payload.serverId,
        { channel },
      )
      const currentUserIds = new Set(currentMembers.map((member) => member.userId))
      await Promise.all(
        [...desiredUserIds]
          .filter((userId) => !currentUserIds.has(userId))
          .map((userId) => this.deps.channelService.addMember(channel.id, userId)),
      )
      await Promise.all(
        [...currentUserIds]
          .filter((userId) => !desiredUserIds.has(userId))
          .map((userId) => this.deps.channelService.removeMember(channel.id, userId)),
      )
    }

    return { channelId: channel.id, created, name: channel.name }
  }

  async createLaunchPoll(
    serverIdOrSlug: string,
    appKey: string,
    token: string,
    input: {
      channelId: string
      question: string
      answers: Array<{ text: string; emoji?: string }>
      allowMultiselect: boolean
      durationHours: number
      layoutType: 1
    },
  ) {
    const { payload } = await this.getEventStreamContext(serverIdOrSlug, appKey, token)
    const actor = this.actorFromLaunchPayload(payload)
    const access = await this.deps.policyService.requireChannelRead(actor, input.channelId)
    if (access.channel.serverId !== payload.serverId) {
      throw Object.assign(new Error('Poll channel must belong to the current Space'), {
        status: 403,
        reason: 'cross_space_poll_channel',
      })
    }
    const message = await this.deps.pollService.create(input.channelId, actorUserId(actor), input)
    this.deps.io.to(`channel:${input.channelId}`).emit('message:new', message)
    return { channelId: input.channelId, messageId: message.id }
  }

  async ensureLaunchBuddyGrant(
    serverIdOrSlug: string,
    appKey: string,
    token: string,
    input: { buddyAgentId: string; permissions: string[]; reason?: string },
  ) {
    const { payload } = await this.getEventStreamContext(serverIdOrSlug, appKey, token)
    const actor = this.actorFromLaunchPayload(payload)
    return this.grant(payload.serverId, appKey, actor, {
      buddyAgentId: input.buddyAgentId,
      permissions: input.permissions,
      mergePermissions: true,
      approvalMode: 'none',
    })
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
      authorization: { waitMs: 0 },
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
    const rows = await this.deps.spaceAppDao.listByServer(serverId)
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
    const rows = await this.deps.spaceAppDao.listSummariesByServer(serverId)
    return rows.map((row) => {
      const manifest = localizeSpaceAppManifest(row.manifest, options?.locale)
      return {
        id: row.id,
        serverId: row.serverId,
        appKey: row.appKey,
        name: manifest.name,
        iconUrl: rewriteCloudExposureUrlToGateway(row.iconUrl),
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
    if (!app) throw Object.assign(new Error('Space App installation not found'), { status: 404 })
    const grants = await this.deps.spaceAppDao.listBuddyGrants(app.id)
    return {
      ...redactApp(app, options.locale)!,
      grants,
    }
  }

  async delete(serverIdOrSlug: string, appKey: string, actor: Actor) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireSpaceAppManager(actor, serverId)
    await this.deps.spaceAppDao.deleteByServerAndKey(serverId, appKey)
    return { ok: true }
  }

  async grant(
    serverIdOrSlug: string,
    appKey: string,
    actor: Actor,
    input: GrantSpaceAppBuddyInput,
  ) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireSpaceAppManager(actor, serverId)
    const app = await this.findFreshApp(serverId, appKey)
    if (!app) throw Object.assign(new Error('Space App installation not found'), { status: 404 })

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
      ? await this.deps.spaceAppDao.findBuddyGrant(app.id, input.buddyAgentId)
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

    return this.deps.spaceAppDao.upsertBuddyGrant({
      spaceAppId: app.id,
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
    input: UpdateSpaceAppAccessPolicyInput,
  ) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireSpaceAppManager(actor, serverId)
    const app = await this.findFreshApp(serverId, appKey)
    if (!app) throw Object.assign(new Error('Space App installation not found'), { status: 404 })
    this.validateKnownPermissions(app, input.defaultPermissions)

    const updated = await this.deps.spaceAppDao.updateAccessPolicy(app.id, {
      defaultPermissions: input.defaultPermissions,
      defaultApprovalMode: input.defaultApprovalMode ?? 'none',
    })
    if (!updated)
      throw Object.assign(new Error('Space App installation not found'), { status: 404 })
    return {
      ...redactApp(updated)!,
      grants: await this.deps.spaceAppDao.listBuddyGrants(updated.id),
    }
  }

  async approveCommandAccess(
    serverIdOrSlug: string,
    appKey: string,
    actor: Actor,
    input: ApproveSpaceAppCommandInput,
  ) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.deps.policyService.requireServerMember(actor, serverId)
    const app = await this.findFreshApp(serverId, appKey)
    if (!app) throw Object.assign(new Error('Space App installation not found'), { status: 404 })
    const command = app.manifest.commands.find((item) => item.name === input.commandName)
    if (!command) throw Object.assign(new Error('Space App command not found'), { status: 404 })
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
    const consent = await this.deps.spaceAppDao.upsertCommandConsent({
      spaceAppId: app.id,
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
        spaceAppId: consent.spaceAppId,
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

  private async spaceAppResourceContext(serverId: string) {
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
          avatarUrl: absoluteShadowUrl(
            this.deps.mediaService.resolveAvatarUrl(member.user.avatarUrl),
          ),
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
    spaceAppId: string
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
      throw Object.assign(new Error('System actor cannot call Space Apps'), { status: 403 })
    }
    const buddyAgentId = input.buddyAgentId ?? (await this.actorBuddyAgentId(input.actor))
    const ownerId =
      input.ownerId ??
      (input.actor.kind === 'agent' ? await this.actorOwnerUserId(input.actor, buddyAgentId) : null)
    const token = `sat_cmd_v1_${randomBytes(32).toString('base64url')}`
    const scopes = Array.from(new Set([input.permission, ...(input.task?.scopes ?? [])]))
    await this.deps.spaceAppDao.createCommandToken({
      tokenHash: hashOpaqueToken(token),
      scopes,
      userId: input.actor.userId,
      serverId: input.serverId,
      spaceAppId: input.spaceAppId,
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
      throw Object.assign(new Error('System actor cannot call Space Apps'), { status: 403 })
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
    return Object.assign(new Error('Space App command approval required'), {
      status: 428,
      code: 'SPACE_APP_COMMAND_APPROVAL_REQUIRED',
      params: {
        approval: {
          serverId: input.app.serverId,
          spaceAppId: input.app.id,
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
    let grantHasResourceRules = false

    if (subject.subjectKind === 'buddy') {
      const grant = await this.deps.spaceAppDao.findBuddyGrant(input.app.id, subject.buddyAgentId!)
      if (grant?.expiresAt && new Date() > grant.expiresAt) {
        throw Object.assign(new Error('Buddy app grant expired'), { status: 403 })
      }
      explicitBuddyGrantAllows = this.permissionsInclude(
        grant?.permissions,
        input.command.permission,
      )
      grantHasResourceRules = explicitBuddyGrantAllows && hasResourceRules(grant?.resourceRules)
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
      approvalMode = 'every_time'
    }
    if (grantHasResourceRules && approvalMode !== 'every_time') {
      reason = 'policy'
      approvalMode = 'every_time'
    }

    if (baseAllowed && approvalMode === 'none') {
      return { subject, approvalMode, transientConsentId: null }
    }

    const consent = await this.deps.spaceAppDao.findCommandConsent({
      spaceAppId: input.app.id,
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
    task?: CallSpaceAppCommandInput['task']
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
      await this.deps.spaceAppDao.markCommandConsentConsumed(access.transientConsentId)
    }
  }

  private commandUrl(baseUrl: string, path: string) {
    return new URL(path.replace(/^\/+/u, ''), `${baseUrl.replace(/\/$/, '')}/`)
  }

  private async fetchCommand(url: URL, init: RequestInit) {
    if (
      shouldAllowDevLoopback(url) ||
      shouldAllowDevSpaceAppHost(url) ||
      isAllowlistedSpaceAppHost(url)
    ) {
      return fetch(url, { ...init, redirect: 'manual' })
    }
    return this.deps.safeHttpClient.fetch(url.toString(), init, { maxRedirects: 0 })
  }

  private authorizationWaitOptions(options?: CommandAuthorizationWaitOptions) {
    const defaultWaitMs = envDurationMs(
      'SHADOWOB_SPACE_APP_AUTHORIZATION_WAIT_MS',
      DEFAULT_COMMAND_AUTHORIZATION_WAIT_MS,
    )
    const maxWaitMs = envDurationMs(
      'SHADOWOB_SPACE_APP_AUTHORIZATION_MAX_WAIT_MS',
      DEFAULT_COMMAND_AUTHORIZATION_MAX_WAIT_MS,
    )
    return {
      waitMs: Math.min(Math.max(0, options?.waitMs ?? defaultWaitMs), maxWaitMs),
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
    // Product contract: Space App commands from the iframe or shadow-cli wait briefly for
    // human/bridge authorization so the original command can continue after approval.
    const { waitMs, pollMs } = this.authorizationWaitOptions(input.options)
    if (waitMs <= 0) throw input.initialError

    if (input.onRequired) {
      try {
        await input.onRequired(input.initialError)
      } catch (error) {
        this.deps.logger.warn({ error }, 'Space App authorization request notification failed')
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
    return errorCode(error) === 'SPACE_APP_COMMAND_APPROVAL_REQUIRED'
  }

  private isBuddyGrantPendingError(error: unknown) {
    return (
      errorCode(error) === 'SPACE_APP_BUDDY_GRANT_REQUIRED' ||
      errorCode(error) === 'SPACE_APP_BUDDY_GRANT_EXPIRED' ||
      errorCode(error) === 'SPACE_APP_BUDDY_GRANT_PERMISSION_REQUIRED'
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

  // Space App backends and CLI/tooling surfaces use this structured error to ask an
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
          spaceAppId: input.app.id,
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
    const grant = await this.deps.spaceAppDao.findBuddyGrant(input.app.id, input.agentId)
    if (!grant) {
      throw this.createBuddyGrantError({
        app: input.app,
        agentId: input.agentId,
        commandName: input.commandName,
        reason: 'missing',
        code: 'SPACE_APP_BUDDY_GRANT_REQUIRED',
        message: 'Space App is not authorized to deliver Inbox tasks to this Buddy',
      })
    }
    if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now()) {
      throw this.createBuddyGrantError({
        app: input.app,
        agentId: input.agentId,
        commandName: input.commandName,
        reason: 'expired',
        code: 'SPACE_APP_BUDDY_GRANT_EXPIRED',
        message: 'Space App Buddy grant expired',
      })
    }
    if (!this.permissionsInclude(grant.permissions, BUDDY_INBOX_DELIVERY_PERMISSION)) {
      throw this.createBuddyGrantError({
        app: input.app,
        agentId: input.agentId,
        commandName: input.commandName,
        reason: 'permission',
        code: 'SPACE_APP_BUDDY_GRANT_PERMISSION_REQUIRED',
        message: `Space App Buddy grant is missing ${BUDDY_INBOX_DELIVERY_PERMISSION}`,
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

    const deliveries: ShadowSpaceAppInboxDelivery[] = []
    const errors: ShadowSpaceAppInboxDeliveryError[] = []
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
        const inboxRequest = buildShadowSpaceAppInboxTaskRequest({
          serverIdOrSlug: input.serverId,
          target: task.channelId ? { channelId: task.channelId } : { agentId: agent.id },
          task: { ...task, idempotencyKey },
          app: {
            id: input.app.id,
            appKey: input.app.appKey,
            serverId: input.serverId,
            name: input.app.name,
          },
          commandName: input.commandName,
        })
        const message = task.channelId
          ? await this.deps.buddyInboxService.enqueueTask(
              task.channelId,
              inboxRequest.body,
              input.actor,
            )
          : await this.deps.buddyInboxService.enqueueTaskForAgent(
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
          cardId: getShadowSpaceAppTaskCardId(message),
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

    const deliveries: ShadowSpaceAppChannelMessageDelivery[] = []
    const errors: ShadowSpaceAppChannelMessageDeliveryError[] = []
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
    spaceAppId: string
    appKey: string
    command: string
    actorKind: string
    action: string
    dataClass: string
  }) {
    this.deps.spaceAppEventBus.publish({
      type: SHADOW_SPACE_APP_COMMAND_COMPLETED_EVENT,
      serverId: input.serverId,
      spaceAppId: input.spaceAppId,
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
    body: CallSpaceAppCommandInput
    multipart?: {
      fields: Record<string, string>
      files: Array<{ field: string; name: string; type: string; value: Blob }>
    }
    authorization?: CommandAuthorizationWaitOptions
  }) {
    const serverId = await this.resolveServerId(input.serverIdOrSlug)
    await this.deps.policyService.requireServerMember(input.actor, serverId)
    let app = await this.findFreshApp(serverId, input.appKey)
    if (!app) throw Object.assign(new Error('Space App installation not found'), { status: 404 })
    let command = app.manifest.commands.find((item) => item.name === input.commandName)
    let commandPath = spaceAppCommandIngressPath(command)
    if (!command || !commandPath) {
      app = await this.refreshInstalledManifest(app, {
        throwOnError: Boolean(command && !commandPath),
        force: true,
        inferManifestUrl: true,
      })
      command = app.manifest.commands.find((item) => item.name === input.commandName)
      commandPath = spaceAppCommandIngressPath(command)
    }
    if (!command) throw Object.assign(new Error('Space App command not found'), { status: 404 })
    if (!commandPath) throw spaceAppCommandIngressMissingError(app.appKey, command.name)
    if (input.multipart) {
      if (command.input !== 'multipart' && command.binary?.supported !== true) {
        throw Object.assign(new Error('Space App command does not accept multipart input'), {
          status: 415,
        })
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
    const url = this.commandUrl(app.apiBaseUrl, commandPath)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.createCommandBearerToken({
        actor: input.actor,
        serverId,
        spaceAppId: app.id,
        appKey: app.appKey,
        command: command.name,
        permission: command.permission,
        action: command.action,
        dataClass: command.dataClass,
        channelId: input.body.channelId ?? null,
        buddyAgentId,
        ownerId,
        task: taskContext,
      })}`,
    }

    let body: BodyInit
    if (input.multipart) {
      const form = new FormData()
      form.set('input', JSON.stringify(input.body.input ?? {}))
      for (const [key, value] of Object.entries(input.multipart.fields)) form.set(key, value)
      for (const file of input.multipart.files) form.set(file.field, file.value, file.name)
      body = form
    } else {
      const payload = Buffer.from(
        JSON.stringify({
          input: input.body.input ?? {},
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
      this.deps.logger.warn(
        { status: response.status, appKey: app.appKey },
        'Space App command failed',
      )
      throw Object.assign(new Error(text || `Space App command failed with ${response.status}`), {
        status: response.status,
      })
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      const buffer = Buffer.from(await response.arrayBuffer())
      this.publishCommandEvent({
        serverId,
        spaceAppId: app.id,
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
        spaceAppId: app.id,
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
      spaceAppId: app.id,
      appKey: app.appKey,
      command: command.name,
      actorKind: input.actor.kind,
      action: command.action,
      dataClass: command.dataClass,
    })
    await this.consumeTransientCommandConsent(commandAccess)
    return deliveredResult
  }

  async introspectCommandToken(token: string) {
    const payload = await this.deps.spaceAppDao.findCommandTokenByHash(hashOpaqueToken(token))
    if (!payload) return { active: false, error: 'invalid_command_token' }
    if (payload.expiresAt.getTime() <= Date.now()) {
      return { active: false, error: 'command_token_expired' }
    }
    const app = await this.deps.spaceAppDao.findById(payload.spaceAppId)
    if (!app) return { active: false, error: 'space_app_not_installed' }
    if (
      payload.serverId !== app.serverId ||
      payload.spaceAppId !== app.id ||
      payload.appKey !== app.appKey
    ) {
      return { active: false, error: 'command_token_app_mismatch' }
    }

    const actorProfile = payload.userId ? await this.commandActorProfile(payload.userId) : null
    const resources = await this.spaceAppResourceContext(app.serverId)

    return {
      active: true,
      token_type: 'Bearer',
      iss: 'shadow',
      aud: 'shadow:space_app',
      sub:
        payload.actorKind === 'agent' && payload.buddyAgentId
          ? `agent:${payload.buddyAgentId}`
          : `user:${payload.userId}`,
      scope: payload.scopes.join(' '),
      client_id: app.appKey,
      exp: Math.floor(payload.expiresAt.getTime() / 1000),
      iat: Math.floor(payload.createdAt.getTime() / 1000),
      shadow: {
        protocol: 'shadow.space-app/1',
        serverId: app.serverId,
        spaceAppId: app.id,
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
      avatarUrl: absoluteShadowUrl(this.deps.mediaService.resolveAvatarUrl(user.avatarUrl)),
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
            : '- Subscribe with `shadowob space-app events <appKey> --server "<server>" --json`.',
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
          '- This app accepts arbitrary binary uploads. Do not infer a file type or size allowlist from the manifest.',
          '- Use `shadowob space-app call <appKey> <command> --server "<server>" --file "<path>" --json-input \'<input-json>\' --json` for commands whose help says they accept files.',
        ]
      : []
    const lines = [
      `# ${manifest.name} Space App Skill`,
      '',
      `Use when working with ${manifest.name} resources inside this Shadow server.`,
      `Installed server id: ${app.serverId}`,
      ...(manifest.help?.overview ? ['', manifest.help.overview] : []),
      '',
      'Always call through the Shadow CLI:',
      '',
      '```bash',
      `shadowob space-app call ${manifest.appKey} <command> --server "${app.serverId}" --channel-id "<current-channel-id>" --json-input '<raw-command-input-json>' --json`,
      '```',
      '',
      'The `--json-input` value is the raw command input object, for example `{"title":"Example","priority":"high"}`. The CLI wraps the HTTP request for you.',
      'Use `shadowob space-app call <appKey> <command> --server "<server>" --help` only when the command list is not enough; command schemas and examples are disclosed there.',
      '',
      'Do not call this Space App through curl, fetch, raw HTTP routes, or the JavaScript SDK. Use `shadowob space-app call` so Shadow can apply the Space App identity, grant, and command policy path consistently.',
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
