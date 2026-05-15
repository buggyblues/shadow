import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Logger } from 'pino'
import type { AgentDao } from '../dao/agent.dao'
import type { AppIntegrationDao } from '../dao/app-integration.dao'
import type { ServerDao } from '../dao/server.dao'
import type { SafeHttpClient } from '../gateways/safe-http-client'
import { validateJsonLimits } from '../lib/json-limits'
import type { Actor } from '../security/actor'
import {
  type CallServerAppCommandInput,
  type CreateServerAppCatalogEntryInput,
  type DiscoverServerAppInput,
  type GrantServerAppBuddyInput,
  type InstallServerAppFromCatalogInput,
  type InstallServerAppInput,
  serverAppManifestSchema,
} from '../validators/app-integration.schema'
import type { AppIntegrationEventBus } from './app-integration-event-bus'
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

function normalizeOrigin(value: string) {
  const url = new URL(value)
  return url.origin
}

function isLoopbackHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function shouldAllowDevLoopback(url: URL) {
  return process.env.NODE_ENV !== 'production' && isLoopbackHost(url.hostname)
}

function shouldAllowDevDirectFetch() {
  return process.env.NODE_ENV !== 'production'
}

function isAllowlistedServerAppHost(url: URL) {
  const hosts = (process.env.SHADOW_SERVER_APP_ALLOW_PRIVATE_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  return hosts.includes(url.hostname.toLowerCase())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function safeJson(value: unknown) {
  if (value === undefined) return null
  return value
}

function compactJson(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function requireUserBoundActor(actor: Actor) {
  if (actor.kind === 'system') {
    throw Object.assign(new Error('System actor cannot manage server apps'), { status: 403 })
  }
  return actor.userId
}

function redactApp(row: Awaited<ReturnType<AppIntegrationDao['findById']>>) {
  if (!row) return null
  return {
    id: row.id,
    serverId: row.serverId,
    appKey: row.appKey,
    name: row.name,
    description: row.description,
    iconUrl: row.iconUrl,
    manifestUrl: row.manifestUrl,
    manifest: row.manifest,
    iframeEntry: row.iframeEntry,
    allowedOrigins: row.allowedOrigins,
    apiBaseUrl: row.apiBaseUrl,
    status: row.status,
    installedByUserId: row.installedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function redactCatalogEntry(row: Awaited<ReturnType<AppIntegrationDao['findCatalogEntryById']>>) {
  if (!row) return null
  return {
    id: row.id,
    appKey: row.appKey,
    name: row.name,
    description: row.description,
    iconUrl: row.iconUrl,
    manifestUrl: row.manifestUrl,
    manifest: row.manifest,
    status: row.status,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

interface LaunchTokenPayload {
  serverId: string
  serverAppId: string
  appKey: string
  exp: number
}

type ServerAppAuthType = 'oauth2-bearer'

function serverAppAuthType(manifest: { api: { auth?: { type?: ServerAppAuthType } } }) {
  return manifest.api.auth?.type ?? 'oauth2-bearer'
}

function hashOpaqueToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export class AppIntegrationService {
  constructor(
    private deps: {
      appIntegrationDao: AppIntegrationDao
      agentDao: AgentDao
      appIntegrationEventBus: AppIntegrationEventBus
      serverDao: ServerDao
      policyService: PolicyService
      safeHttpClient: SafeHttpClient
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
    const manifest = serverAppManifestSchema.parse(input)
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
    return manifest
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

  private async buildCatalogPreview(input: DiscoverServerAppInput) {
    const rawManifest = input.manifest ?? (await this.fetchManifest(input.manifestUrl!))
    const manifest = this.validateManifest(rawManifest)
    return {
      manifest,
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

  async listCatalog(serverIdOrSlug: string, actor: Actor) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.deps.policyService.requireServerMember(actor, serverId)
    const [catalogRows, installedRows] = await Promise.all([
      this.deps.appIntegrationDao.listCatalogEntries(),
      this.deps.appIntegrationDao.listByServer(serverId),
    ])
    const installedByKey = new Map(installedRows.map((row) => [row.appKey, redactApp(row)!]))
    return catalogRows.map((row) => ({
      ...redactCatalogEntry(row)!,
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

  async listAdminCatalog() {
    const rows = await this.deps.appIntegrationDao.listCatalogEntries({ includeInactive: true })
    return rows.map((row) => ({
      ...redactCatalogEntry(row)!,
      commandCount: row.manifest.commands.length,
      skillCount: row.manifest.skills?.length ?? 0,
    }))
  }

  async upsertCatalogEntry(actor: Actor, input: CreateServerAppCatalogEntryInput) {
    const preview = await this.buildCatalogPreview(input)
    const row = await this.deps.appIntegrationDao.upsertCatalogEntry({
      appKey: preview.manifest.appKey,
      name: preview.manifest.name,
      description: preview.manifest.description ?? null,
      iconUrl: preview.manifest.iconUrl,
      manifestUrl: input.manifestUrl ?? null,
      manifest: preview.manifest,
      status: input.status ?? 'active',
      createdByUserId: actor.kind === 'system' ? null : actor.userId,
    })
    return {
      ...redactCatalogEntry(row)!,
      commandCount: row.manifest.commands.length,
      skillCount: row.manifest.skills?.length ?? 0,
      permissions: preview.permissions,
    }
  }

  async seedCatalogEntry(input: CreateServerAppCatalogEntryInput) {
    const preview = await this.buildCatalogPreview(input)
    const existing = await this.deps.appIntegrationDao.findCatalogEntryByAppKey(
      preview.manifest.appKey,
    )
    if (existing) return { seeded: false, entry: redactCatalogEntry(existing)! }
    const row = await this.deps.appIntegrationDao.upsertCatalogEntry({
      appKey: preview.manifest.appKey,
      name: preview.manifest.name,
      description: preview.manifest.description ?? null,
      iconUrl: preview.manifest.iconUrl,
      manifestUrl: input.manifestUrl ?? null,
      manifest: preview.manifest,
      status: input.status ?? 'active',
      createdByUserId: null,
    })
    return { seeded: true, entry: redactCatalogEntry(row)! }
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
    return this.install(serverId, actor, {
      manifestUrl: entry.manifestUrl ?? undefined,
      manifest: serverAppManifestSchema.parse(entry.manifest),
    })
  }

  async install(serverIdOrSlug: string, actor: Actor, input: InstallServerAppInput) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.requireServerAdmin(actor, serverId)

    const rawManifest = input.manifest ?? (await this.fetchManifest(input.manifestUrl!))
    const manifest = this.validateManifest(rawManifest)
    const iframeEntry = manifest.iframe?.entry ?? null
    const allowedOrigins =
      manifest.iframe?.allowedOrigins ?? (iframeEntry ? [normalizeOrigin(iframeEntry)] : [])
    const app = await this.deps.appIntegrationDao.upsert({
      serverId,
      appKey: manifest.appKey,
      name: manifest.name,
      description: manifest.description ?? null,
      iconUrl: manifest.iconUrl,
      manifestUrl: input.manifestUrl ?? null,
      manifest,
      iframeEntry,
      allowedOrigins,
      apiBaseUrl: manifest.api.baseUrl.replace(/\/$/, ''),
      installedByUserId: requireUserBoundActor(actor),
    })

    return redactApp(app)!
  }

  async createLaunch(serverIdOrSlug: string, appKey: string, actor: Actor) {
    const app = await this.get(serverIdOrSlug, appKey, actor)
    const exp = Math.floor(Date.now() / 1000) + 600
    const launchToken = this.createLaunchToken({
      serverId: app.serverId,
      serverAppId: app.id,
      appKey: app.appKey,
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

  async list(serverIdOrSlug: string, actor: Actor) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.deps.policyService.requireServerMember(actor, serverId)
    const rows = await this.deps.appIntegrationDao.listByServer(serverId)
    return rows.map((row) => redactApp(row)!)
  }

  async get(serverIdOrSlug: string, appKey: string, actor: Actor) {
    const serverId = await this.resolveServerId(serverIdOrSlug)
    await this.deps.policyService.requireServerMember(actor, serverId)
    const app = await this.deps.appIntegrationDao.findByServerAndKey(serverId, appKey)
    if (!app) throw Object.assign(new Error('App integration not found'), { status: 404 })
    const grants = await this.deps.appIntegrationDao.listBuddyGrants(app.id)
    return {
      ...redactApp(app)!,
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
    const app = await this.deps.appIntegrationDao.findByServerAndKey(serverId, appKey)
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

    const allowedPermissions = new Set(app.manifest.commands.map((command) => command.permission))
    for (const permission of input.permissions) {
      if (permission !== '*' && !allowedPermissions.has(permission)) {
        throw Object.assign(new Error(`Unknown app permission: ${permission}`), { status: 422 })
      }
    }

    return this.deps.appIntegrationDao.upsertBuddyGrant({
      serverAppId: app.id,
      buddyAgentId: input.buddyAgentId,
      permissions: input.permissions,
      resourceRules: input.resourceRules ?? {},
      approvalMode: input.approvalMode ?? 'none',
      createdByUserId: requireUserBoundActor(actor),
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
  }

  private async actorBuddyAgentId(actor: Actor) {
    if (actor.kind !== 'agent') return null
    if (actor.agentId) return actor.agentId
    const agent = await this.deps.agentDao.findByUserId(actor.userId)
    return agent?.id ?? null
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
  }) {
    if (input.actor.kind === 'system') {
      throw Object.assign(new Error('System actor cannot call server apps'), { status: 403 })
    }
    const buddyAgentId = await this.actorBuddyAgentId(input.actor)
    const token = `sat_cmd_v1_${randomBytes(32).toString('base64url')}`
    await this.deps.appIntegrationDao.createCommandToken({
      tokenHash: hashOpaqueToken(token),
      scopes: [input.permission],
      userId: input.actor.userId,
      serverId: input.serverId,
      serverAppId: input.serverAppId,
      appKey: input.appKey,
      command: input.command,
      actorKind: input.actor.kind,
      buddyAgentId,
      ownerId: input.actor.kind === 'agent' ? input.actor.ownerId : null,
      channelId: input.channelId,
      permission: input.permission,
      action: input.action,
      dataClass: input.dataClass,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    })
    return token
  }

  private async requireCommandGrant(actor: Actor, serverAppId: string, permission: string) {
    if (actor.kind !== 'agent') return
    const buddyAgentId = await this.actorBuddyAgentId(actor)
    if (!buddyAgentId) {
      throw Object.assign(new Error('Buddy actor is missing agent identity'), { status: 403 })
    }
    const grant = await this.deps.appIntegrationDao.findBuddyGrant(serverAppId, buddyAgentId)
    if (!grant) {
      throw Object.assign(new Error('Buddy is not granted to use this app'), { status: 403 })
    }
    if (grant.expiresAt && new Date() > grant.expiresAt) {
      throw Object.assign(new Error('Buddy app grant expired'), { status: 403 })
    }
    if (!grant.permissions.includes('*') && !grant.permissions.includes(permission)) {
      throw Object.assign(new Error(`Buddy app grant lacks permission: ${permission}`), {
        status: 403,
      })
    }
  }

  private commandUrl(baseUrl: string, path: string) {
    return new URL(path, `${baseUrl.replace(/\/$/, '')}/`)
  }

  private async fetchCommand(url: URL, init: RequestInit) {
    if (shouldAllowDevLoopback(url) || isAllowlistedServerAppHost(url)) {
      return fetch(url, { ...init, redirect: 'manual' })
    }
    return this.deps.safeHttpClient.fetch(url.toString(), init, { maxRedirects: 0 })
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
      type: 'server_app.command.completed',
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
  }) {
    const serverId = await this.resolveServerId(input.serverIdOrSlug)
    await this.deps.policyService.requireServerMember(input.actor, serverId)
    const app = await this.deps.appIntegrationDao.findByServerAndKey(serverId, input.appKey)
    if (!app) throw Object.assign(new Error('App integration not found'), { status: 404 })
    const command = app.manifest.commands.find((item) => item.name === input.commandName)
    if (!command) throw Object.assign(new Error('App command not found'), { status: 404 })
    if (
      command.dataClass === 'financial' ||
      command.dataClass === 'secret' ||
      command.dataClass === 'cloud-secret'
    ) {
      throw Object.assign(new Error('Restricted app data class requires an approval workflow'), {
        status: 403,
      })
    }
    await this.requireCommandGrant(input.actor, app.id, command.permission)

    const jsonLimits = validateJsonLimits(safeJson(input.body.input), COMMAND_INPUT_LIMITS)
    if (!jsonLimits.ok) throw Object.assign(new Error(jsonLimits.error), { status: 413 })

    const buddyAgentId = await this.actorBuddyAgentId(input.actor)
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
      },
      channelId: input.body.channelId ?? null,
      permission: command.permission,
      action: command.action,
      dataClass: command.dataClass,
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
      return { ok: true, result }
    }
    this.publishCommandEvent({
      serverId,
      serverAppId: app.id,
      appKey: app.appKey,
      command: command.name,
      actorKind: input.actor.kind,
      action: command.action,
      dataClass: command.dataClass,
    })
    return result
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
        },
        channelId: payload.channelId ?? null,
        permission: payload.permission,
        action: payload.action,
        dataClass: payload.dataClass,
      },
    }
  }

  async skills(serverIdOrSlug: string, appKey: string, actor: Actor) {
    const app = await this.get(serverIdOrSlug, appKey, actor)
    const manifest = app.manifest
    const lines = [
      `# ${manifest.name} App Skill`,
      '',
      `Use when working with ${manifest.name} resources inside this Shadow server.`,
      `Installed server id: ${app.serverId}`,
      '',
      'Always call through the Shadow CLI:',
      '',
      '```bash',
      `shadowob app call ${manifest.appKey} <command> --server "${app.serverId}" --json-input '<raw-command-input-json>' --json`,
      '```',
      '',
      'The `--json-input` value is the raw command input object, for example `{"title":"Example","priority":"high"}`. The CLI wraps the HTTP request for you.',
      '',
      'Do not call this App through curl, fetch, raw HTTP routes, or the JavaScript SDK. Use `shadowob app call` so Shadow can apply the server App identity, grant, and command policy path consistently.',
      '',
      'Available commands:',
      ...manifest.commands.flatMap((command) => {
        const lines = [
          `- ${manifest.appKey} ${command.name}: ${command.description ?? command.title ?? command.permission}`,
        ]
        const schema = compactJson(command.inputSchema)
        if (schema) lines.push(`  input schema: \`${schema}\``)
        return lines
      }),
    ]
    return {
      appKey: manifest.appKey,
      markdown: lines.join('\n'),
      skills: manifest.skills ?? [],
    }
  }
}
