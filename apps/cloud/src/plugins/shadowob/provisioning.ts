/**
 * Shadow provisioning — creates Shadow platform resources (servers, channels, buddies, listings)
 * and binds agents to buddies using the Shadow SDK.
 *
 * Shadow-specific provisioning logic lives here, inside the shadowob plugin.
 * The core deploy pipeline calls `onProvision` which delegates to `provisionShadowResources`.
 *
 * State-based dedup: checks provision-state.json before creating any resource.
 * New resources are created and state is merged on each run.
 */

import { createHash } from 'node:crypto'
import { ShadowClient } from '@shadowob/sdk'
import type {
  CloudConfig,
  ShadowBinding,
  ShadowBuddy,
  ShadowCommercePaidFile,
  ShadowListing,
  ShadowobPluginConfig,
  ShadowServer,
  ShadowServerApp,
} from '../../config/schema.js'
import { log as defaultLog, type Logger } from '../../utils/logger.js'
import type { ProvisionState } from '../../utils/state.js'

type AccessibleShadowServer = {
  id: string
  name?: string | null
  slug?: string | null
}

type AccessibleShadowChannel = {
  id: string
  serverId?: string | null
  name?: string | null
}

type ShadowProvisionScope = {
  deploymentId?: string
  namespace?: string
  scopeKey?: string
}

type ProvisionedBuddyInfo = {
  agentId: string
  token: string
  userId: string
  scopeKey?: string
  deploymentId?: string
  namespace?: string
}

type PersistedBuddyInfo = Omit<ProvisionedBuddyInfo, 'token'> & { token?: string }

// The shadowob plugin's per-plugin state blob (stored under plugins.shadowob in ProvisionState)
type ShadowobState = {
  servers?: Record<string, string>
  channels?: Record<string, string>
  buddies?: Record<string, PersistedBuddyInfo>
  /** buddyId → listingId on the marketplace */
  listings?: Record<string, string>
  /** app config id → provisioned app ids */
  serverApps?: Record<string, { serverAppId: string; appKey: string; serverId: string }>
  /** commerce seed id → provisioned product/offer/file ids */
  commerce?: Record<
    string,
    {
      shopId: string
      productId: string
      offerId: string
      fileId: string
      deliverableId: string
    }
  >
  shadowServerUrl?: string
}

/**
 * Module-level logger reference. Default is the global logger.
 * Overridden per-call by the `logger` option in ProvisionOptions.
 */
let log: Logger = defaultLog

function shadowEnvKey(prefix: string, id: string) {
  return `${prefix}_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
}

function normalizedOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function normalizeProvisionScope(scope: ShadowProvisionScope | undefined): ShadowProvisionScope {
  const deploymentId = normalizedOptionalText(scope?.deploymentId)
  const namespace = normalizedOptionalText(scope?.namespace)
  return {
    ...(deploymentId ? { deploymentId } : {}),
    ...(namespace ? { namespace } : {}),
    scopeKey:
      normalizedOptionalText(scope?.scopeKey) ??
      (deploymentId
        ? `deployment:${deploymentId}`
        : namespace
          ? `namespace:${namespace}`
          : undefined),
  }
}

function scopedHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8)
}

function usernameBase(id: string): string {
  return (
    id
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/, '') || 'buddy'
  )
}

function usernameForBuddy(buddyDef: ShadowBuddy, scope: ShadowProvisionScope): string {
  const base = usernameBase(buddyDef.id)
  if (!scope.scopeKey) return base.slice(0, 30)
  const suffix = scopedHash(`${scope.scopeKey}:${buddyDef.id}`)
  return `${base.slice(0, 23)}-${suffix}`.replace(/^-|-$/g, '')
}

function scopedBuddyMetadata(
  buddyDef: ShadowBuddy,
  scope: ShadowProvisionScope,
): Record<string, string> {
  return {
    buddyId: buddyDef.id,
    ...(scope.scopeKey ? { scopeKey: scope.scopeKey } : {}),
    ...(scope.deploymentId ? { deploymentId: scope.deploymentId } : {}),
    ...(scope.namespace ? { namespace: scope.namespace } : {}),
  }
}

function shadowobMetadata(agent: unknown): Record<string, unknown> {
  const config = (agent as { config?: Record<string, unknown> })?.config
  const shadowob = config?.shadowob
  return shadowob && typeof shadowob === 'object' && !Array.isArray(shadowob)
    ? (shadowob as Record<string, unknown>)
    : {}
}

function buddyMatchesScope(
  agent: unknown,
  buddyDef: ShadowBuddy,
  scope: ShadowProvisionScope,
): boolean {
  const metadata = shadowobMetadata(agent)
  if (metadata.buddyId !== buddyDef.id) return false
  if (scope.scopeKey) return metadata.scopeKey === scope.scopeKey
  return metadata.scopeKey === undefined && metadata.deploymentId === undefined
}

function persistedBuddyMatchesScope(
  buddy: PersistedBuddyInfo,
  scope: ShadowProvisionScope,
): boolean {
  if (scope.scopeKey) return buddy.scopeKey === scope.scopeKey
  return buddy.scopeKey === undefined && buddy.deploymentId === undefined
}

function withBuddyScope<T extends { agentId: string; userId: string; token: string }>(
  info: T,
  scope: ShadowProvisionScope,
): ProvisionedBuddyInfo {
  return {
    ...info,
    ...(scope.scopeKey ? { scopeKey: scope.scopeKey } : {}),
    ...(scope.deploymentId ? { deploymentId: scope.deploymentId } : {}),
    ...(scope.namespace ? { namespace: scope.namespace } : {}),
  }
}

export interface ProvisionResult {
  servers: Map<string, string> // config id → real server id
  channels: Map<string, string> // config id → real channel id
  buddies: Map<string, ProvisionedBuddyInfo>
  /** buddyId → listingId on the marketplace */
  listings: Map<string, string>
  serverApps: Map<string, { serverAppId: string; appKey: string; serverId: string }>
  commerce: Map<
    string,
    {
      shopId: string
      productId: string
      offerId: string
      fileId: string
      deliverableId: string
    }
  >
}

export interface ProvisionOptions {
  serverUrl: string
  userToken: string
  dryRun?: boolean
  /** Force re-provisioning even when state indicates resources exist */
  force?: boolean
  /** Existing shadowob plugin state for dedup (if available) */
  existingState?: ShadowobState | null
  /** Deployment scope used to isolate provisioned Buddy identities. */
  scope?: ShadowProvisionScope
  /** Optional logger — defaults to the global console logger */
  logger?: Logger
}

/**
 * Provision all Shadow resources declared in the cloud config.
 *
 * State-based approach:
 * 1. Load existing state (servers, channels, buddies)
 * 2. For each declared resource, check if it exists in state
 * 3. If in state, verify it still exists on the server (lightweight check)
 * 4. If not in state or missing on server, create it
 * 5. Detect orphaned resources (in state but not in config) and warn
 * 6. Return mapping of config IDs to real IDs + tokens
 */
export async function provisionShadowResources(
  config: CloudConfig,
  options: ProvisionOptions,
): Promise<ProvisionResult> {
  log = options.logger ?? defaultLog
  const client = new ShadowClient(options.serverUrl, options.userToken)
  const result: ProvisionResult = {
    servers: new Map(),
    channels: new Map(),
    buddies: new Map(),
    listings: new Map(),
    serverApps: new Map(),
    commerce: new Map(),
  }

  const shadowobEntry = config.use?.find((u) => u.plugin === 'shadowob')
  const plugin = shadowobEntry?.options as
    | import('../../config/schema.js').ShadowobPluginConfig
    | undefined
  if (!plugin) {
    log.dim('No shadowob plugin in use array, skipping provisioning')
    return result
  }

  if (options.dryRun) {
    log.info('Dry run — would provision:')
    if (plugin.servers?.length) {
      log.dim(`  ${plugin.servers.length} server(s)`)
      for (const s of plugin.servers) {
        log.dim(`    - ${s.name} (${s.channels?.length ?? 0} channels)`)
      }
    }
    if (plugin.buddies?.length) {
      log.dim(`  ${plugin.buddies.length} buddy/buddies`)
    }
    if (plugin.bindings?.length) {
      log.dim(`  ${plugin.bindings.length} binding(s)`)
    }
    if (plugin.serverApps?.length) {
      log.dim(`  ${plugin.serverApps.length} app(s)`)
    }
    if (plugin.listings?.length) {
      log.dim(`  ${plugin.listings.length} rental listing(s)`)
      for (const l of plugin.listings) {
        log.dim(`    - "${l.title}" for buddy "${l.buddyId}" @ ${l.pricePerHour}/hr`)
      }
    }
    return result
  }

  const state = options.force ? null : (options.existingState ?? null)
  const scope = normalizeProvisionScope(options.scope)

  // Detect orphaned resources (in state but not in current config)
  if (state) {
    detectOrphans(state, plugin)
  }

  // 1. Provision servers
  if (plugin.servers?.length) {
    for (const serverDef of plugin.servers) {
      const serverId = await provisionServer(client, serverDef, state)
      result.servers.set(serverDef.id, serverId)

      // 2. Provision channels
      if (serverDef.channels?.length) {
        for (const channelDef of serverDef.channels) {
          const channelId = await provisionChannel(client, serverId, channelDef, state)
          result.channels.set(channelDef.id, channelId)
        }
      }
    }
  }

  // 3. Provision buddies
  const buddyAllowedServerIds = buildBuddyAllowedServerIds(plugin, result)
  if (plugin.buddies?.length) {
    for (const buddyDef of plugin.buddies) {
      const buddyInfo = await provisionBuddy(
        client,
        buddyDef,
        state,
        buddyAllowedServerIds.get(buddyDef.id) ?? [],
        scope,
      )
      result.buddies.set(buddyDef.id, buddyInfo)
    }
  }

  // 4. Process bindings — add buddies to servers
  if (plugin.bindings?.length) {
    for (const binding of plugin.bindings) {
      await processBinding(client, binding, result)
    }
  }

  // 5. Provision Apps and Buddy grants
  if (plugin.serverApps?.length) {
    for (const appDef of plugin.serverApps) {
      const installed = await provisionServerApp(client, appDef, result, state)
      if (installed) result.serverApps.set(appDef.id, installed)
    }
  }

  // 6. Provision rental listings on the marketplace
  if (plugin.listings?.length) {
    for (const listingDef of plugin.listings) {
      const listingId = await provisionListing(client, listingDef, result, state)
      if (listingId) {
        result.listings.set(listingDef.buddyId, listingId)
      }
    }
  }

  // 7. Provision commerce paid-file seeds for MVP templates
  if (plugin.commerce?.paidFiles?.length) {
    for (const paidFileDef of plugin.commerce.paidFiles) {
      const commerceIds = await provisionPaidFileCommerce(client, paidFileDef, result, state)
      if (commerceIds) result.commerce.set(paidFileDef.id, commerceIds)
    }
  }

  return result
}

/**
 * Detect resources in state that are no longer in the current config.
 * Logs warnings for orphaned resources (doesn't delete — user must clean up).
 */
function detectOrphans(
  state: ShadowobState,
  plugin: import('../../config/schema.js').ShadowobPluginConfig,
): void {
  if (!plugin) return

  const configServerIds = new Set(plugin.servers?.map((s) => s.id) ?? [])
  const configChannelIds = new Set(
    plugin.servers?.flatMap((s) => s.channels?.map((c) => c.id) ?? []) ?? [],
  )
  const configBuddyIds = new Set(plugin.buddies?.map((b) => b.id) ?? [])
  const configServerAppIds = new Set(plugin.serverApps?.map((app) => app.id) ?? [])

  for (const id of Object.keys(state.servers ?? {})) {
    if (!configServerIds.has(id)) {
      log.warn(`  Orphaned server in state: "${id}" (not in current config)`)
    }
  }
  for (const id of Object.keys(state.channels ?? {})) {
    if (!configChannelIds.has(id)) {
      log.warn(`  Orphaned channel in state: "${id}" (not in current config)`)
    }
  }
  for (const id of Object.keys(state.buddies ?? {})) {
    if (!configBuddyIds.has(id)) {
      log.warn(`  Orphaned buddy in state: "${id}" (not in current config)`)
    }
  }

  for (const id of Object.keys(state.serverApps ?? {})) {
    if (!configServerAppIds.has(id)) {
      log.warn(`  Orphaned App in state: "${id}" (not in current config)`)
    }
  }

  const configListingBuddyIds = new Set(plugin.listings?.map((l) => l.buddyId) ?? [])
  for (const id of Object.keys(state.listings ?? {})) {
    if (!configListingBuddyIds.has(id)) {
      log.warn(
        `  Orphaned rental listing in state for buddy "${id}" (no listing config found — listing may still be active on marketplace)`,
      )
    }
  }

  const configCommerceIds = new Set(plugin.commerce?.paidFiles?.map((item) => item.id) ?? [])
  for (const id of Object.keys(state.commerce ?? {})) {
    if (!configCommerceIds.has(id)) {
      log.warn(`  Orphaned commerce seed in state: "${id}" (not in current config)`)
    }
  }
}

async function provisionServerApp(
  client: ShadowClient,
  appDef: ShadowServerApp,
  result: ProvisionResult,
  state: ShadowobState | null,
): Promise<{ serverAppId: string; appKey: string; serverId: string } | null> {
  const serverId = result.servers.get(appDef.serverId) ?? appDef.serverId
  const existing = state?.serverApps?.[appDef.id]
  if (existing) {
    log.dim(`  App "${appDef.id}" found in state (${existing.appKey}); refreshing install`)
  } else {
    log.step(`Provisioning App: ${appDef.id}`)
  }

  if (!appDef.catalogEntryId && !appDef.catalogAppKey && !appDef.manifestUrl && !appDef.manifest) {
    log.warn(
      `  App "${appDef.id}" skipped: catalogEntryId, catalogAppKey, manifestUrl, or manifest is required`,
    )
    return null
  }

  const installed =
    appDef.catalogEntryId || appDef.catalogAppKey
      ? await installCatalogServerApp(client, serverId, appDef)
      : await client.installServerApp(serverId, {
          manifestUrl: appDef.manifestUrl,
          manifest: appDef.manifest as never,
        })
  log.success(`  Installed App "${installed.appKey}" on server "${appDef.serverId}"`)

  for (const grant of appDef.grants ?? []) {
    const buddy = result.buddies.get(grant.buddyId)
    if (!buddy) {
      log.warn(`  App "${appDef.id}" grant skipped: buddy "${grant.buddyId}" not found`)
      continue
    }
    await client.grantServerAppToBuddy(serverId, installed.appKey, {
      buddyAgentId: buddy.agentId,
      permissions: grant.permissions ?? ['*'],
      resourceRules: grant.resourceRules,
      approvalMode: grant.approvalMode ?? 'none',
    })
    log.success(`  Granted App "${installed.appKey}" to buddy "${grant.buddyId}"`)
  }

  return { serverAppId: installed.id, appKey: installed.appKey, serverId }
}

async function installCatalogServerApp(
  client: ShadowClient,
  serverId: string,
  appDef: ShadowServerApp,
) {
  const catalogEntryId =
    appDef.catalogEntryId ?? (await resolveCatalogEntryId(client, serverId, appDef))
  return client.installServerAppFromCatalog(serverId, catalogEntryId)
}

async function resolveCatalogEntryId(
  client: ShadowClient,
  serverId: string,
  appDef: ShadowServerApp,
) {
  const catalogAppKey = appDef.catalogAppKey?.trim()
  if (!catalogAppKey) throw new Error(`App "${appDef.id}" catalogAppKey is empty`)
  const catalog = await client.listServerAppCatalog(serverId)
  const entry = catalog.find(
    (item: { id?: string; appKey?: string }) =>
      item.appKey === catalogAppKey || item.id === catalogAppKey,
  )
  if (!entry?.id) {
    throw new Error(`App catalog entry not found for "${catalogAppKey}"`)
  }
  return entry.id
}

async function provisionPaidFileCommerce(
  client: ShadowClient,
  paidFileDef: ShadowCommercePaidFile,
  result: ProvisionResult,
  state: ShadowobState | null,
): Promise<{
  shopId: string
  productId: string
  offerId: string
  fileId: string
  deliverableId: string
} | null> {
  const existing = state?.commerce?.[paidFileDef.id]
  if (existing) {
    log.dim(`  Commerce paid file "${paidFileDef.id}" found in state (${existing.offerId})`)
    return existing
  }

  const serverId = result.servers.get(paidFileDef.serverId) ?? paidFileDef.serverId
  const sellerBuddyId = paidFileDef.sellerBuddyId ?? paidFileDef.shop.buddyId
  const sellerBuddy = sellerBuddyId ? result.buddies.get(sellerBuddyId) : undefined

  let shopId: string | undefined
  if (paidFileDef.shop.kind === 'buddy') {
    if (!sellerBuddy) {
      log.warn(`  Commerce paid file "${paidFileDef.id}" skipped: seller buddy not provisioned`)
      return null
    }
    const shop = await client.getManagedUserShop(sellerBuddy.userId)
    shopId = shop.id
  } else {
    const shopServerId = paidFileDef.shop.serverId
      ? (result.servers.get(paidFileDef.shop.serverId) ?? paidFileDef.shop.serverId)
      : serverId
    const shop = await client.getShop(shopServerId)
    shopId = shop.id
  }
  if (!shopId) throw new Error(`Commerce shop could not be resolved for ${paidFileDef.id}`)

  log.step(`Provisioning commerce paid file: ${paidFileDef.name}`)
  const mime = paidFileDef.mime ?? 'text/html; charset=utf-8'
  const media = await client.uploadMedia(
    new Blob([paidFileDef.html], { type: mime }),
    paidFileDef.fileName,
    mime,
  )
  const file = await client.createWorkspaceFile(serverId, {
    name: paidFileDef.fileName,
    mime,
    sizeBytes: media.size,
    contentRef: media.url,
    previewUrl: null,
    metadata: {
      paywall: true,
      paidFile: true,
      commerceSeedId: paidFileDef.id,
    },
  })
  const fileId = typeof file.id === 'string' ? file.id : null
  if (!fileId) throw new Error(`Workspace file create returned no id for ${paidFileDef.id}`)

  const product = await client.createShopProduct(shopId, {
    name: paidFileDef.name,
    slug: paidFileDef.slug,
    type: 'entitlement',
    status: 'active',
    summary: paidFileDef.summary,
    description: paidFileDef.description,
    basePrice: paidFileDef.price,
    billingMode: paidFileDef.durationSeconds ? 'fixed_duration' : 'one_time',
    entitlementConfig: {
      resourceType: 'workspace_file',
      resourceId: fileId,
      capability: 'view',
      durationSeconds: paidFileDef.durationSeconds ?? null,
      privilegeDescription: paidFileDef.summary,
    },
  })
  const productId = typeof product.id === 'string' ? product.id : null
  if (!productId) throw new Error(`Product create returned no id for ${paidFileDef.id}`)

  const offers = await client.listCommerceOffers(shopId, { limit: 50 })
  const offer =
    offers.offers.find((item) => item.productId === productId) ??
    (await client.createCommerceOffer(shopId, {
      productId,
      allowedSurfaces: paidFileDef.offerSurfaces ?? ['dm', 'channel'],
      sellerBuddyUserId: sellerBuddy?.userId,
      status: 'active',
      metadata: { commerceSeedId: paidFileDef.id },
    }))
  const offerId = typeof offer.id === 'string' ? offer.id : null
  if (!offerId) throw new Error(`Offer create returned no id for ${paidFileDef.id}`)

  const deliverable = await client.createCommerceDeliverable(shopId, offerId, {
    kind: 'paid_file',
    resourceType: 'workspace_file',
    resourceId: fileId,
    senderBuddyUserId: sellerBuddy?.userId,
    metadata: {
      commerceSeedId: paidFileDef.id,
      summary: paidFileDef.summary,
      message:
        paidFileDef.fulfillmentMessage ?? '火柴已经点亮。打开这份付费文件，看看火光里的小小动画。',
    },
  })
  const deliverableId = typeof deliverable.id === 'string' ? deliverable.id : null
  if (!deliverableId) throw new Error(`Deliverable create returned no id for ${paidFileDef.id}`)

  log.success(`  Created paid-file offer "${paidFileDef.name}" (${offerId})`)
  return { shopId, productId, offerId, fileId, deliverableId }
}

async function provisionServer(
  client: ShadowClient,
  serverDef: ShadowServer,
  state: ShadowobState | null,
): Promise<string> {
  const accessibleServers = await listAccessibleServers(client)
  const accessibleServerIds = new Set(accessibleServers.map((server) => server.id))

  // Check state first — if server exists in state, verify via API
  const existingId = state?.servers?.[serverDef.id]
  if (existingId) {
    try {
      const existing = await client.getServer(existingId)
      if (existing && accessibleServerIds.has(existing.id)) {
        log.dim(`  Server "${serverDef.name}" found in state (${existingId})`)
        return existingId
      }
      if (existing) {
        log.dim(
          `  Server "${serverDef.name}" in state (${existingId}) is not visible to this token, creating a user-owned server...`,
        )
      }
    } catch {
      log.dim(`  Server "${serverDef.name}" in state but not found on server, recreating...`)
    }
  }

  log.step(`Provisioning server: ${serverDef.name}`)

  // Try to find existing server by slug
  if (serverDef.slug) {
    const existing = accessibleServers.find((server) => server.slug === serverDef.slug)
    if (existing) {
      log.dim(`  Server "${serverDef.name}" already exists (${existing.id})`)
      return existing.id
    }
    log.dim(
      `  No accessible server found for slug "${serverDef.slug}"; creating a user-owned server`,
    )
  }

  const server = await client.createServer({
    name: serverDef.name,
    slug: serverDef.slug,
    description: serverDef.description,
    isPublic: serverDef.isPublic,
  })
  log.success(`  Created server: ${server.name} (${server.id})`)
  return server.id
}

async function provisionChannel(
  client: ShadowClient,
  serverId: string,
  channelDef: {
    id: string
    title: string
    type?: string
    description?: string
    isPrivate?: boolean
  },
  state: ShadowobState | null,
): Promise<string> {
  // Check state first
  const existingId = state?.channels?.[channelDef.id]
  if (existingId) {
    try {
      const existing = (await client.getChannel(existingId)) as AccessibleShadowChannel
      if (existing.serverId === serverId) {
        log.dim(`    Channel "${channelDef.title}" found in state (${existingId})`)
        return existingId
      }
      log.dim(`    Channel "${channelDef.title}" in state belongs to another server, recreating...`)
    } catch {
      log.dim(`    Channel "${channelDef.title}" in state but not found, recreating...`)
    }
  }

  log.step(`  Provisioning channel: ${channelDef.title}`)

  // Check existing channels
  try {
    const channels = await client.getServerChannels(serverId)
    const expectedKeys = new Set([
      ...channelMatchKeys(channelDef.title),
      ...channelMatchKeys(channelDef.id),
    ])
    const existing = channels.find((c) => {
      return channelMatchKeys(c.name).some((key) => expectedKeys.has(key))
    })
    if (existing) {
      log.dim(`    Channel "${channelDef.title}" already exists (${existing.id})`)
      return existing.id
    }
  } catch {
    // Continue to create
  }

  const createChannel = client.createChannel.bind(client) as (
    targetServerId: string,
    data: { name: string; type?: string; description?: string; isPrivate?: boolean },
  ) => Promise<AccessibleShadowChannel>
  const channel = await createChannel(serverId, {
    name: channelDef.title,
    type: channelDef.type,
    description: channelDef.description,
    isPrivate: channelDef.isPrivate,
  })
  log.success(`    Created channel: ${channelDef.title} (${channel.id})`)
  return channel.id
}

async function provisionBuddy(
  client: ShadowClient,
  buddyDef: ShadowBuddy,
  state: ShadowobState | null,
  allowedServerIds: string[],
  scope: ShadowProvisionScope,
): Promise<ProvisionedBuddyInfo> {
  // Check state first, but mint a fresh token so restarted/community servers
  // do not keep handing old runtimes an expired JWT.
  const existingBuddy = state?.buddies?.[buddyDef.id]
  if (existingBuddy?.agentId) {
    if (persistedBuddyMatchesScope(existingBuddy, scope)) {
      log.dim(`  Buddy "${buddyDef.name}" found in state (agent: ${existingBuddy.agentId})`)
      try {
        await ensureBuddyServerAccess(client, existingBuddy.agentId, allowedServerIds)
        const tokenResult = await client.generateAgentToken(existingBuddy.agentId)
        return withBuddyScope(
          {
            agentId: existingBuddy.agentId,
            token: tokenResult.token,
            userId: existingBuddy.userId,
          },
          scope,
        )
      } catch (err) {
        log.dim(
          `  Buddy "${
            buddyDef.name
          }" in state could not mint a fresh token, recreating or looking up existing scoped buddy: ${formatErrorMessage(
            err,
          )}`,
        )
      }
    } else {
      log.dim(`  Ignoring legacy or out-of-scope Buddy state for "${buddyDef.name}"`)
    }
  }

  log.step(`Provisioning buddy: ${buddyDef.name}`)

  const username = usernameForBuddy(buddyDef, scope)
  const buddyConfig = { shadowob: scopedBuddyMetadata(buddyDef, scope) }

  let agentId: string
  let token: string
  let userId: string

  let agents: Awaited<ReturnType<ShadowClient['listAgents']>> = []
  try {
    agents = (await client.listAgents()) ?? []
  } catch {
    agents = []
  }
  const existing = agents.find((agent) => {
    return buddyMatchesScope(agent, buddyDef, scope)
  })
  if (existing) {
    agentId = existing.id
    await ensureBuddyServerAccess(
      client,
      agentId,
      allowedServerIds,
      (existing as { config?: Record<string, unknown> }).config,
    )
    const tokenResult = await client.generateAgentToken(agentId)
    token = tokenResult.token
    userId =
      (existing as { userId?: string; botUser?: { id?: string } }).userId ??
      (existing as { botUser?: { id?: string } }).botUser?.id ??
      ''
    log.dim(`  Reusing buddy: ${buddyDef.name} (agent: ${agentId})`)
    return withBuddyScope({ agentId, token, userId }, scope)
  }

  try {
    const agent = await client.createAgent({
      name: buddyDef.name,
      username,
      displayName: buddyDef.name,
      avatarUrl: buddyDef.avatarUrl,
      buddyMode: 'private',
      allowedServerIds,
      config: buddyConfig,
    })
    agentId = agent.id
    userId = agent.userId
    // createAgent response does not include a token — generate one immediately
    const newTokenResult = await client.generateAgentToken(agentId)
    token = newTokenResult.token
    log.success(`  Created buddy: ${buddyDef.name} (agent: ${agentId})`)
  } catch (err) {
    const msg = (err as Error).message ?? ''
    // Handle "already exists" only when the existing agent is in the same scoped
    // provisioning identity. Display names are not identity and must not be used
    // for cross-deployment reuse.
    if (/already|conflict|duplicate|unique/i.test(msg)) {
      log.dim(`  Buddy "${buddyDef.name}" already exists, looking up scoped identity...`)
      const fallbackAgents = await client.listAgents()
      const fallback = fallbackAgents.find((agent) => buddyMatchesScope(agent, buddyDef, scope))
      if (!fallback) {
        throw new Error(`Cannot find existing scoped buddy "${buddyDef.name}": ${msg}`)
      }

      agentId = fallback.id
      await ensureBuddyServerAccess(
        client,
        agentId,
        allowedServerIds,
        (fallback as { config?: Record<string, unknown> }).config,
      )
      // Generate a fresh token for the existing agent
      const tokenResult = await client.generateAgentToken(agentId)
      token = tokenResult.token
      userId = (fallback as { userId?: string }).userId ?? ''
      log.dim(`  Found existing scoped buddy: ${buddyDef.name} (agent: ${agentId})`)
    } else {
      throw err
    }
  }

  return withBuddyScope({ agentId, token, userId }, scope)
}

async function processBinding(
  client: ShadowClient,
  binding: ShadowBinding,
  result: ProvisionResult,
): Promise<void> {
  const buddyInfo = result.buddies.get(binding.targetId)
  if (!buddyInfo) {
    log.warn(`  Binding target "${binding.targetId}" not found in provisioned buddies`)
    return
  }

  // Add buddy agent to each server referenced in binding
  for (const serverConfigId of binding.servers) {
    const serverId = result.servers.get(serverConfigId)
    if (!serverId) {
      log.warn(`  Server "${serverConfigId}" not found in provisioned servers`)
      continue
    }

    try {
      const result = await client.addAgentsToServer(serverId, [buddyInfo.agentId])
      const failed = Array.isArray(result?.failed) ? result.failed : []
      const blockingFailures = failed.filter(
        (item) => !/already (a )?server member/i.test(String(item?.error ?? '')),
      )
      if (blockingFailures.length > 0) {
        throw new Error(
          blockingFailures
            .map((item) => item?.error)
            .filter(Boolean)
            .join('; '),
        )
      }
      log.success(`  Added buddy "${binding.targetId}" to server "${serverConfigId}"`)
    } catch (err) {
      throw new Error(
        `Could not add buddy "${binding.targetId}" to server "${serverConfigId}": ${formatErrorMessage(
          err,
        )}`,
      )
    }
  }

  // Add buddy to each channel referenced in binding.
  // Bots are NOT auto-added to channels when they join a server —
  // they must be explicitly registered as channel members so the
  // WebSocket channel:join handshake succeeds.
  for (const channelConfigId of binding.channels) {
    const channelId = result.channels.get(channelConfigId)
    if (!channelId) {
      log.warn(`  Channel "${channelConfigId}" not found in provisioned channels`)
      continue
    }

    try {
      await client.addChannelMember(channelId, buddyInfo.userId)
      log.success(`  Added buddy "${binding.targetId}" to channel "${channelConfigId}"`)
    } catch (err) {
      log.dim(
        `  Buddy already in channel "${channelConfigId}" (or error: ${formatErrorMessage(err)})`,
      )
    }
  }

  const policyMode = binding.replyPolicy?.mode ?? 'default'
  const policyConfig: Record<string, unknown> = {}
  if (binding.replyPolicy?.mode === 'custom' && binding.replyPolicy.custom) {
    Object.assign(policyConfig, binding.replyPolicy.custom)
  }
  const channelPolicy = {
    listen: binding.replyPolicy?.mode !== 'disabled',
    reply: binding.replyPolicy?.mode !== 'disabled',
    mentionOnly: binding.replyPolicy?.mode === 'mentionOnly',
    config: policyConfig,
  }

  for (const serverConfigId of binding.servers) {
    const serverId = result.servers.get(serverConfigId)
    if (!serverId) continue

    if (binding.channels.length > 0) {
      // A channel-scoped binding must not leave the server-wide default permissive,
      // otherwise the Buddy listens/replies in every channel when runtime config
      // falls back to the server default.
      try {
        await client.upsertPolicy(buddyInfo.agentId, serverId, {
          channelId: null,
          listen: false,
          reply: false,
          mentionOnly: false,
          config: {},
        })
        log.success(
          `  Disabled server-wide default for channel-scoped buddy "${binding.targetId}" in server "${serverConfigId}"`,
        )
      } catch {
        log.dim(
          `  Could not disable server-wide default for buddy "${binding.targetId}" in server "${serverConfigId}"`,
        )
      }

      for (const channelConfigId of binding.channels) {
        const channelId = result.channels.get(channelConfigId)
        if (!channelId) continue
        try {
          await client.upsertPolicy(buddyInfo.agentId, serverId, {
            channelId,
            ...channelPolicy,
          })
          log.success(
            `  Applied channel-scoped replyPolicy "${policyMode}" to buddy "${binding.targetId}" in channel "${channelConfigId}"`,
          )
        } catch (err) {
          log.dim(
            `  Could not apply channel-scoped replyPolicy for "${channelConfigId}": ${formatErrorMessage(err)}`,
          )
        }
      }
      continue
    }

    if (binding.replyPolicy) {
      try {
        await client.upsertPolicy(buddyInfo.agentId, serverId, {
          channelId: null,
          ...channelPolicy,
        })
        log.success(
          `  Applied replyPolicy "${binding.replyPolicy.mode}" to buddy "${binding.targetId}" in server "${serverConfigId}"`,
        )
      } catch {
        log.dim(
          `  Could not apply replyPolicy to buddy "${binding.targetId}" in server "${serverConfigId}"`,
        )
      }
    }
  }
}

function buildBuddyAllowedServerIds(
  plugin: import('../../config/schema.js').ShadowobPluginConfig,
  result: ProvisionResult,
): Map<string, string[]> {
  const allowed = new Map<string, Set<string>>()
  for (const binding of plugin.bindings ?? []) {
    if (binding.targetType !== 'buddy') continue
    const servers = allowed.get(binding.targetId) ?? new Set<string>()
    for (const serverConfigId of binding.servers) {
      const serverId = result.servers.get(serverConfigId) ?? serverConfigId
      if (serverId) servers.add(serverId)
    }
    allowed.set(binding.targetId, servers)
  }
  return new Map([...allowed].map(([buddyId, serverIds]) => [buddyId, [...serverIds]]))
}

function configuredAllowedServerIds(config: Record<string, unknown> | undefined): string[] {
  const raw = config?.allowedServerIds ?? config?.serverWhitelist
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

async function ensureBuddyServerAccess(
  client: ShadowClient,
  agentId: string,
  allowedServerIds: string[],
  currentConfig?: Record<string, unknown>,
): Promise<void> {
  if (allowedServerIds.length === 0) return
  const merged = Array.from(
    new Set([...configuredAllowedServerIds(currentConfig), ...allowedServerIds]),
  )
  await client.updateAgent(agentId, {
    buddyMode: 'private',
    allowedServerIds: merged,
  })
}

async function listAccessibleServers(client: ShadowClient): Promise<AccessibleShadowServer[]> {
  try {
    const response = (await client.listServers()) as unknown
    if (!Array.isArray(response)) return []

    return response
      .map((entry) => {
        const server =
          entry && typeof entry === 'object' && 'server' in entry
            ? (entry as { server?: unknown }).server
            : entry
        if (!server || typeof server !== 'object') return null
        const candidate = server as AccessibleShadowServer
        return typeof candidate.id === 'string' ? candidate : null
      })
      .filter((server): server is AccessibleShadowServer => server !== null)
  } catch (err) {
    log.dim(`  Could not list accessible servers before provisioning: ${formatErrorMessage(err)}`)
    return []
  }
}

function channelMatchKeys(value: string | null | undefined): string[] {
  const raw = (value ?? '').toLowerCase().normalize('NFKC').trim().replace(/^#/, '')
  const keys = new Set<string>()
  const unicodeKey = raw.replace(/\s+/g, ' ')
  if (unicodeKey) keys.add(unicodeKey)

  // ASCII slugs are useful for matching config ids like "code-review" against
  // user-visible names, but pure non-Latin names must never collapse to "".
  const asciiSlug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (asciiSlug) keys.add(asciiSlug)

  return [...keys]
}

function formatErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Provision a rental listing on the Shadow claw marketplace.
 *
 * State-based dedup: if a listingId is already stored in state for this buddyId,
 * we update the listing instead of creating a new one. If the listing no longer
 * exists on the server it is re-created.
 */
async function provisionListing(
  client: ShadowClient,
  listingDef: ShadowListing,
  result: ProvisionResult,
  state: ShadowobState | null,
): Promise<string | null> {
  const buddyInfo = result.buddies.get(listingDef.buddyId)
  if (!buddyInfo) {
    log.warn(`  Listing references unknown buddy "${listingDef.buddyId}" — skipping`)
    return null
  }

  const existingListingId = state?.listings?.[listingDef.buddyId]

  if (existingListingId) {
    // Try to update the existing listing
    try {
      await client.updateListing(existingListingId, {
        title: listingDef.title,
        description: listingDef.description,
        pricePerHour: listingDef.pricePerHour,
        tags: listingDef.tags,
      })
      log.success(
        `  Updated rental listing for buddy "${listingDef.buddyId}" (${existingListingId})`,
      )
      return existingListingId
    } catch {
      log.dim(
        `  Listing ${existingListingId} not found on server — will re-create for buddy "${listingDef.buddyId}"`,
      )
    }
  }

  // Create new listing
  try {
    const created = await client.createListing({
      agentId: buddyInfo.agentId,
      title: listingDef.title,
      description: listingDef.description,
      pricePerHour: listingDef.pricePerHour,
      tags: listingDef.tags,
    })
    log.success(
      `  Created rental listing "${listingDef.title}" for buddy "${listingDef.buddyId}" (${created.id})`,
    )

    // Activate or deactivate according to config (default: active)
    if (listingDef.active === false) {
      try {
        await client.toggleListing(created.id) // newly-created listings are active by default → toggle to inactive
      } catch {
        log.dim(`  Could not deactivate listing ${created.id}`)
      }
    }

    return created.id
  } catch (err) {
    log.warn(
      `  Failed to create rental listing for buddy "${listingDef.buddyId}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return null
  }
}

function resolveShadowobPluginConfig(config: CloudConfig): ShadowobPluginConfig | undefined {
  return (
    (config.use?.find((u) => u.plugin === 'shadowob')?.options as
      | ShadowobPluginConfig
      | undefined) ?? config.plugins?.shadowob?.config
  )
}

/**
 * Build environment variables for an agent's container from provisioned resources
 * and agent integration credentials.
 */
export function buildProvisionedEnvVars(
  agentId: string,
  config: CloudConfig,
  provision: ProvisionResult,
  serverUrl: string,
): Record<string, string> {
  const env: Record<string, string> = {}
  const plugin = resolveShadowobPluginConfig(config)
  if (!plugin) return env

  env.SHADOWOB_SERVER_URL = serverUrl

  // Find bindings for this agent
  const bindings = plugin.bindings?.filter((b) => b.agentId === agentId) ?? []
  const boundBuddyAgentIds = new Set<string>()

  for (const binding of bindings) {
    const buddyInfo = provision.buddies.get(binding.targetId)
    if (!buddyInfo) continue

    if (buddyInfo.agentId) {
      boundBuddyAgentIds.add(buddyInfo.agentId)
    }

    const envKey = `SHADOWOB_TOKEN_${binding.targetId.toUpperCase().replace(/-/g, '_')}`
    env[envKey] = buddyInfo.token
  }

  if (boundBuddyAgentIds.size === 1) {
    env.SHADOWOB_AGENT_ID = [...boundBuddyAgentIds][0]!
  }

  for (const [seedId, ids] of provision.commerce ?? new Map()) {
    env[shadowEnvKey('SHADOWOB_COMMERCE_SHOP', seedId)] = ids.shopId
    env[shadowEnvKey('SHADOWOB_COMMERCE_PRODUCT', seedId)] = ids.productId
    env[shadowEnvKey('SHADOWOB_COMMERCE_OFFER', seedId)] = ids.offerId
    env[shadowEnvKey('SHADOWOB_COMMERCE_FILE', seedId)] = ids.fileId
    env[shadowEnvKey('SHADOWOB_COMMERCE_DELIVERABLE', seedId)] = ids.deliverableId
  }

  for (const [appId, ids] of provision.serverApps ?? new Map()) {
    env[shadowEnvKey('SHADOWOB_SERVER_APP_SERVER', appId)] = ids.serverId
    env[shadowEnvKey('SHADOWOB_SERVER_APP_ID', appId)] = ids.serverAppId
    env[shadowEnvKey('SHADOWOB_SERVER_APP_KEY', appId)] = ids.appKey
  }

  // Inject plugin credentials from agent's use entries as env vars
  const agent = config.deployments?.agents?.find((a) => a.id === agentId)
  if (agent?.use) {
    for (const useEntry of agent.use) {
      if (!useEntry.options) continue
      for (const [key, value] of Object.entries(useEntry.options)) {
        if (typeof value !== 'string') continue
        // Only inject string values that look like credentials
        const envKey = key.includes('_')
          ? key
          : `${useEntry.plugin.toUpperCase().replace(/-/g, '_')}_${key.toUpperCase()}`
        env[envKey] = value
      }
    }
  }

  return env
}

// ─── State Helpers ────────────────────────────────────────────────────────────

/**
 * Convert a ProvisionResult (Maps) into a ProvisionState for the shadowob plugin.
 * Stored under plugins.shadowob.
 */
export function provisionResultToState(
  result: ProvisionResult,
  shadowServerUrl: string,
  opts?: { stackName?: string; namespace?: string },
): ProvisionState {
  return {
    provisionedAt: new Date().toISOString(),
    stackName: opts?.stackName,
    namespace: opts?.namespace,
    plugins: {
      shadowob: {
        shadowServerUrl,
        servers: Object.fromEntries(result.servers),
        channels: Object.fromEntries(result.channels),
        buddies: Object.fromEntries(
          Array.from(result.buddies.entries()).map(([id, info]) => [
            id,
            {
              agentId: info.agentId,
              userId: info.userId,
              ...(info.scopeKey ? { scopeKey: info.scopeKey } : {}),
              ...(info.deploymentId ? { deploymentId: info.deploymentId } : {}),
              ...(info.namespace ? { namespace: info.namespace } : {}),
            },
          ]),
        ),
        ...(result.listings?.size > 0 ? { listings: Object.fromEntries(result.listings) } : {}),
        ...(result.commerce?.size > 0 ? { commerce: Object.fromEntries(result.commerce) } : {}),
        ...(result.serverApps?.size > 0
          ? { serverApps: Object.fromEntries(result.serverApps) }
          : {}),
      },
    },
  }
}

/**
 * Convert the shadowob plugin state back to ProvisionResult (Maps).
 * Used when loading state for follow-up operations.
 */
export function stateToProvisionResult(state: ProvisionState): ProvisionResult {
  const s = (state.plugins?.shadowob ?? {}) as {
    servers?: Record<string, string>
    channels?: Record<string, string>
    buddies?: Record<string, PersistedBuddyInfo>
    listings?: Record<string, string>
    serverApps?: Record<string, { serverAppId: string; appKey: string; serverId: string }>
    commerce?: Record<
      string,
      {
        shopId: string
        productId: string
        offerId: string
        fileId: string
        deliverableId: string
      }
    >
  }
  return {
    servers: new Map(Object.entries(s.servers ?? {})),
    channels: new Map(Object.entries(s.channels ?? {})),
    buddies: new Map(
      Object.entries(s.buddies ?? {}).map(([id, info]) => [
        id,
        {
          agentId: info.agentId,
          userId: info.userId,
          token: info.token ?? '',
          ...(info.scopeKey ? { scopeKey: info.scopeKey } : {}),
          ...(info.deploymentId ? { deploymentId: info.deploymentId } : {}),
          ...(info.namespace ? { namespace: info.namespace } : {}),
        },
      ]),
    ),
    listings: new Map(Object.entries(s.listings ?? {})),
    serverApps: new Map(Object.entries(s.serverApps ?? {})),
    commerce: new Map(Object.entries(s.commerce ?? {})),
  }
}
