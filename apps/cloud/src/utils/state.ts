/**
 * Provision state — persists provisioned resource IDs to disk.
 *
 * State is saved to `.shadowob/provision-state.json` relative to the config file.
 * This allows follow-up commands (status, logs, scale, down) to reference
 * real IDs without re-provisioning.
 *
 * State file is gitignored (.shadowob/).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { ProvisionResult } from '../provisioning/index.js'

// ─── State Types ──────────────────────────────────────────────────────────────

export interface ProvisionState {
  /** ISO timestamp of when provisioning last ran */
  provisionedAt: string
  /** Stack name used during deployment (if any) */
  stackName?: string
  /** K8s namespace deployed to (if any) */
  namespace?: string
  /**
   * Plugin-keyed state blobs. Each plugin owns its own schema under its plugin ID.
   * e.g. plugins.shadowob = { servers: {...}, channels: {...}, buddies: {...} }
   */
  plugins: Record<string, Record<string, unknown>>
}

// ─── Path Resolution ─────────────────────────────────────────────────────────

/**
 * Get the state directory for a given config file path.
 * Defaults to .shadowob/ next to the config file.
 */
export function getStateDir(configFilePath: string, stateSubdir = '.shadowob'): string {
  return join(dirname(resolve(configFilePath)), stateSubdir)
}

export function getStatePath(configFilePath: string, stateSubdir = '.shadowob'): string {
  return join(getStateDir(configFilePath, stateSubdir), 'provision-state.json')
}

// ─── Load / Save ──────────────────────────────────────────────────────────────

/**
 * Load provision state from disk. Returns null if file doesn't exist.
 */
export function loadProvisionState(
  configFilePath: string,
  stateSubdir = '.shadowob',
): ProvisionState | null {
  const statePath = getStatePath(configFilePath, stateSubdir)
  if (!existsSync(statePath)) return null

  try {
    const raw = readFileSync(statePath, 'utf-8')
    return JSON.parse(raw) as ProvisionState
  } catch {
    return null
  }
}

/**
 * Save provision state to disk. Creates directory if needed.
 */
export function saveProvisionState(
  configFilePath: string,
  state: ProvisionState,
  stateSubdir = '.shadowob',
): string {
  const stateDir = getStateDir(configFilePath, stateSubdir)
  const statePath = getStatePath(configFilePath, stateSubdir)

  mkdirSync(stateDir, { recursive: true })
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
  return statePath
}

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
  }
  return {
    servers: new Map(Object.entries(s.servers ?? {})),
    channels: new Map(Object.entries(s.channels ?? {})),
    buddies: new Map(Object.entries(s.buddies ?? {})),
  }
}

/**
 * Merge new provision result into existing state.
 * Plugin states are merged per plugin ID — new values overwrite old keys.
 */
export function mergeProvisionState(
  existing: ProvisionState | null,
  newState: ProvisionState,
): ProvisionState {
  if (!existing) return newState

  const mergedPlugins: Record<string, Record<string, unknown>> = {}
  for (const [pluginId, pluginState] of Object.entries(existing.plugins ?? {})) {
    mergedPlugins[pluginId] = { ...pluginState }
  }
  for (const [pluginId, pluginState] of Object.entries(newState.plugins ?? {})) {
    mergedPlugins[pluginId] = { ...(mergedPlugins[pluginId] ?? {}), ...pluginState }
  }

  return { ...newState, plugins: mergedPlugins }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/**
 * Format provision state as a human-readable table of resource IDs.
 */
export function formatProvisionState(state: ProvisionState): string {
  const lines: string[] = []

  lines.push(`Provisioned at  : ${new Date(state.provisionedAt).toLocaleString()}`)
  if (state.namespace) lines.push(`K8s Namespace   : ${state.namespace}`)
  if (state.stackName) lines.push(`Pulumi Stack    : ${state.stackName}`)

  const shadowob = state.plugins?.shadowob as
    | {
        shadowServerUrl?: string
        servers?: Record<string, string>
        channels?: Record<string, string>
        buddies?: Record<string, { agentId: string; userId: string }>
      }
    | undefined

  if (shadowob) {
    if (shadowob.shadowServerUrl) lines.push(`Shadow Server URL: ${shadowob.shadowServerUrl}`)
    lines.push('')

    if (shadowob.servers && Object.keys(shadowob.servers).length > 0) {
      lines.push('Servers:')
      for (const [configId, realId] of Object.entries(shadowob.servers)) {
        lines.push(`  ${configId.padEnd(24)} → ${realId}`)
      }
    }

    if (shadowob.channels && Object.keys(shadowob.channels).length > 0) {
      lines.push('Channels:')
      for (const [configId, realId] of Object.entries(shadowob.channels)) {
        lines.push(`  ${configId.padEnd(24)} → ${realId}`)
      }
    }

    if (shadowob.buddies && Object.keys(shadowob.buddies).length > 0) {
      lines.push('Buddies:')
      for (const [configId, info] of Object.entries(shadowob.buddies)) {
        lines.push(`  ${configId.padEnd(24)} → agent: ${info.agentId}  user: ${info.userId}`)
      }
    }
  }

  return lines.join('\n')
}
