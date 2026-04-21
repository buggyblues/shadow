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

import { ShadowClient } from '@shadowob/sdk'
import type {
  CloudConfig,
  ShadowBinding,
  ShadowBuddy,
  ShadowListing,
  ShadowServer,
} from '../../config/schema.js'
import { log as defaultLog, type Logger } from '../../utils/logger.js'
import type { ProvisionState } from '../../utils/state.js'

// The shadowob plugin's per-plugin state blob (stored under plugins.shadowob in ProvisionState)
type ShadowobState = {
  servers?: Record<string, string>
  channels?: Record<string, string>
  buddies?: Record<string, { agentId: string; userId: string; token: string }>
  /** buddyId → listingId on the marketplace */
  listings?: Record<string, string>
  shadowServerUrl?: string
}

/**
 * Module-level logger reference. Default is the global logger.
 * Overridden per-call by the `logger` option in ProvisionOptions.
 */
let log: Logger = defaultLog

export interface ProvisionResult {
  servers: Map<string, string> // config id → real server id
  channels: Map<string, string> // config id → real channel id
  buddies: Map<string, { agentId: string; token: string; userId: string }>
  /** buddyId → listingId on the marketplace */
  listings: Map<string, string>
}

export interface ProvisionOptions {
  serverUrl: string
  userToken: string
  dryRun?: boolean
  /** Force re-provisioning even when state indicates resources exist */
  force?: boolean
  /** Existing shadowob plugin state for dedup (if available) */
  existingState?: ShadowobState | null
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
    if (plugin.listings?.length) {
      log.dim(`  ${plugin.listings.length} rental listing(s)`)
      for (const l of plugin.listings) {
        log.dim(`    - "${l.title}" for buddy "${l.buddyId}" @ ${l.pricePerHour}/hr`)
      }
    }
    return result
  }

  const state = options.force ? null : (options.existingState ?? null)

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
  if (plugin.buddies?.length) {
    for (const buddyDef of plugin.buddies) {
      const buddyInfo = await provisionBuddy(client, buddyDef, state)
      result.buddies.set(buddyDef.id, buddyInfo)
    }
  }

  // 4. Process bindings — add buddies to servers
  if (plugin.bindings?.length) {
    for (const binding of plugin.bindings) {
      await processBinding(client, binding, result)
    }
  }

  // 5. Provision rental listings on the marketplace
  if (plugin.listings?.length) {
    for (const listingDef of plugin.listings) {
      const listingId = await provisionListing(client, listingDef, result, state)
      if (listingId) {
        result.listings.set(listingDef.buddyId, listingId)
      }
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

  const configListingBuddyIds = new Set(plugin.listings?.map((l) => l.buddyId) ?? [])
  for (const id of Object.keys(state.listings ?? {})) {
    if (!configListingBuddyIds.has(id)) {
      log.warn(
        `  Orphaned rental listing in state for buddy "${id}" (no listing config found — listing may still be active on marketplace)`,
      )
    }
  }
}

async function provisionServer(
  client: ShadowClient,
  serverDef: ShadowServer,
  state: ShadowobState | null,
): Promise<string> {
  // Check state first — if server exists in state, verify via API
  const existingId = state?.servers?.[serverDef.id]
  if (existingId) {
    try {
      const existing = await client.getServer(existingId)
      if (existing) {
        log.dim(`  Server "${serverDef.name}" found in state (${existingId})`)
        return existingId
      }
    } catch {
      log.dim(`  Server "${serverDef.name}" in state but not found on server, recreating...`)
    }
  }

  log.step(`Provisioning server: ${serverDef.name}`)

  // Try to find existing server by slug
  if (serverDef.slug) {
    try {
      const existing = await client.getServer(serverDef.slug)
      if (existing) {
        log.dim(`  Server "${serverDef.name}" already exists (${existing.id})`)
        return existing.id
      }
    } catch {
      // Not found, create new
    }
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
  channelDef: { id: string; title: string; type?: string; description?: string },
  state: ShadowobState | null,
): Promise<string> {
  // Check state first
  const existingId = state?.channels?.[channelDef.id]
  if (existingId) {
    // Trust state — channels don't move between servers
    log.dim(`    Channel "${channelDef.title}" found in state (${existingId})`)
    return existingId
  }

  log.step(`  Provisioning channel: ${channelDef.title}`)

  // Check existing channels
  try {
    const channels = await client.getServerChannels(serverId)
    const existing = channels.find((c) => c.name === channelDef.title)
    if (existing) {
      log.dim(`    Channel "${channelDef.title}" already exists (${existing.id})`)
      return existing.id
    }
  } catch {
    // Continue to create
  }

  const channel = await client.createChannel(serverId, {
    name: channelDef.title,
    type: channelDef.type,
    description: channelDef.description,
  })
  log.success(`    Created channel: ${channelDef.title} (${channel.id})`)
  return channel.id
}

async function provisionBuddy(
  client: ShadowClient,
  buddyDef: ShadowBuddy,
  state: ShadowobState | null,
): Promise<{ agentId: string; token: string; userId: string }> {
  // Check state first — reuse existing token to avoid invalidating old ones
  const existingBuddy = state?.buddies?.[buddyDef.id]
  if (existingBuddy?.agentId && existingBuddy?.token) {
    log.dim(`  Buddy "${buddyDef.name}" found in state (agent: ${existingBuddy.agentId})`)
    return {
      agentId: existingBuddy.agentId,
      token: existingBuddy.token,
      userId: existingBuddy.userId,
    }
  }

  log.step(`Provisioning buddy: ${buddyDef.name}`)

  // Generate a URL-safe username from the buddy id
  const username = buddyDef.id
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/, '')
    .slice(0, 30)

  let agentId: string
  let token: string
  let userId: string

  try {
    const agent = await client.createAgent({
      name: buddyDef.name,
      username,
      displayName: buddyDef.name,
      avatarUrl: buddyDef.avatarUrl,
    })
    agentId = agent.id
    userId = agent.userId
    // createAgent response does not include a token — generate one immediately
    const newTokenResult = await client.generateAgentToken(agentId)
    token = newTokenResult.token
    log.success(`  Created buddy: ${buddyDef.name} (agent: ${agentId})`)
  } catch (err) {
    const msg = (err as Error).message ?? ''
    // Handle "already exists" — list agents and find by name
    if (/already|conflict|duplicate|unique/i.test(msg)) {
      log.dim(`  Buddy "${buddyDef.name}" already exists, looking up...`)
      const agents = await client.listAgents()
      const existing = agents.find((a: { name: string }) => a.name === buddyDef.name)
      if (!existing) throw new Error(`Cannot find existing buddy "${buddyDef.name}": ${msg}`)

      agentId = existing.id
      // Generate a fresh token for the existing agent
      const tokenResult = await client.generateAgentToken(agentId)
      token = tokenResult.token
      userId = (existing as { userId?: string }).userId ?? ''
      log.dim(`  Found existing buddy: ${buddyDef.name} (agent: ${agentId})`)
    } else {
      throw err
    }
  }

  return { agentId, token, userId }
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
      await client.addAgentsToServer(serverId, [buddyInfo.agentId])
      log.success(`  Added buddy "${binding.targetId}" to server "${serverConfigId}"`)
    } catch {
      log.dim(`  Buddy already in server "${serverConfigId}" (or error)`)
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
    } catch {
      log.dim(`  Buddy already in channel "${channelConfigId}" (or error)`)
    }
  }

  // Apply replyPolicy per channel via upsertPolicy (if specified in binding)
  if (binding.replyPolicy) {
    const policy = binding.replyPolicy
    const mentionOnly = policy.mode === 'mentionOnly'
    const reply = policy.mode !== 'disabled'
    const policyConfig: Record<string, unknown> = {}
    if (policy.mode === 'custom' && policy.custom) {
      Object.assign(policyConfig, policy.custom)
    }

    for (const serverConfigId of binding.servers) {
      const serverId = result.servers.get(serverConfigId)
      if (!serverId) continue

      // Apply server-level policy (no channelId = default for all channels)
      try {
        await client.upsertPolicy(buddyInfo.agentId, serverId, {
          channelId: null,
          mentionOnly,
          reply,
          config: policyConfig,
        })
        log.success(
          `  Applied replyPolicy "${policy.mode}" to buddy "${binding.targetId}" in server "${serverConfigId}"`,
        )
      } catch {
        log.dim(
          `  Could not apply replyPolicy to buddy "${binding.targetId}" in server "${serverConfigId}"`,
        )
      }

      // Override per-channel if channels are explicitly listed
      for (const channelConfigId of binding.channels) {
        const channelId = result.channels.get(channelConfigId)
        if (!channelId) continue
        try {
          await client.upsertPolicy(buddyInfo.agentId, serverId, {
            channelId,
            mentionOnly,
            reply,
            config: policyConfig,
          })
        } catch {
          log.dim(
            `  Could not apply per-channel replyPolicy for "${channelConfigId}" — server policy applies`,
          )
        }
      }
    }
  }
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
      `  Failed to create rental listing for buddy "${listingDef.buddyId}": ${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }
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
  const shadowobEntry = config.use?.find((u) => u.plugin === 'shadowob')
  const plugin = shadowobEntry?.options as
    | import('../../config/schema.js').ShadowobPluginConfig
    | undefined
  if (!plugin) return env

  // SHADOW_AGENT_SERVER_URL lets callers specify a different URL for in-cluster use
  // (e.g. http://host.docker.internal:3000) while still using localhost for provisioning API calls.
  env.SHADOW_SERVER_URL = process.env.SHADOW_AGENT_SERVER_URL ?? serverUrl

  // Find bindings for this agent
  const bindings = plugin.bindings?.filter((b) => b.agentId === agentId) ?? []

  for (const binding of bindings) {
    const buddyInfo = provision.buddies.get(binding.targetId)
    if (!buddyInfo) continue

    const envKey = `SHADOW_TOKEN_${binding.targetId.toUpperCase().replace(/-/g, '_')}`
    env[envKey] = buddyInfo.token
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
            { agentId: info.agentId, userId: info.userId, token: info.token },
          ]),
        ),
        ...(result.listings?.size > 0 ? { listings: Object.fromEntries(result.listings) } : {}),
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
    buddies?: Record<string, { agentId: string; userId: string; token: string }>
    listings?: Record<string, string>
  }
  return {
    servers: new Map(Object.entries(s.servers ?? {})),
    channels: new Map(Object.entries(s.channels ?? {})),
    buddies: new Map(Object.entries(s.buddies ?? {})),
    listings: new Map(Object.entries(s.listings ?? {})),
  }
}
