/**
 * Provisioning — creates Shadow server resources (servers, channels, buddies)
 * and binds agents to buddies using the Shadow SDK.
 *
 * Uses state-based dedup: checks `.shadowob/provision-state.json` before
 * creating any resource. If a resource exists in state AND on the server,
 * it's skipped. New resources are created and state is merged.
 */

import { ShadowClient } from '@shadowob/sdk'
import type { CloudConfig, ShadowBinding, ShadowBuddy, ShadowServer } from '../config/schema.js'
import { log as defaultLog, type Logger } from '../utils/logger.js'
import type { ProvisionState } from '../utils/state.js'

/**
 * Module-level logger reference. Default is the global logger.
 * Overridden per-call by the `logger` option in ProvisionOptions.
 */
let log: Logger = defaultLog

export interface ProvisionResult {
  servers: Map<string, string> // config id → real server id
  channels: Map<string, string> // config id → real channel id
  buddies: Map<string, { agentId: string; token: string; userId: string }>
}

export interface ProvisionOptions {
  serverUrl: string
  userToken: string
  dryRun?: boolean
  /** Force re-provisioning even when state indicates resources exist */
  force?: boolean
  /** Existing provision state for dedup (if available) */
  existingState?: ProvisionState | null
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
  }

  const shadowobEntry = config.use?.find((u) => u.plugin === 'shadowob')
  const plugin = shadowobEntry?.options as
    | import('../config/schema.js').ShadowobPluginConfig
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

  return result
}

/**
 * Detect resources in state that are no longer in the current config.
 * Logs warnings for orphaned resources (doesn't delete — user must clean up).
 */
function detectOrphans(
  state: ProvisionState,
  plugin: import('../config/schema.js').ShadowobPluginConfig,
): void {
  if (!plugin) return

  const configServerIds = new Set(plugin.servers?.map((s) => s.id) ?? [])
  const configChannelIds = new Set(
    plugin.servers?.flatMap((s) => s.channels?.map((c) => c.id) ?? []) ?? [],
  )
  const configBuddyIds = new Set(plugin.buddies?.map((b) => b.id) ?? [])

  for (const id of Object.keys(state.servers)) {
    if (!configServerIds.has(id)) {
      log.warn(`  Orphaned server in state: "${id}" (not in current config)`)
    }
  }
  for (const id of Object.keys(state.channels)) {
    if (!configChannelIds.has(id)) {
      log.warn(`  Orphaned channel in state: "${id}" (not in current config)`)
    }
  }
  for (const id of Object.keys(state.buddies)) {
    if (!configBuddyIds.has(id)) {
      log.warn(`  Orphaned buddy in state: "${id}" (not in current config)`)
    }
  }
}

async function provisionServer(
  client: ShadowClient,
  serverDef: ShadowServer,
  state: ProvisionState | null,
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
  state: ProvisionState | null,
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
  state: ProvisionState | null,
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
    | import('../config/schema.js').ShadowobPluginConfig
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
