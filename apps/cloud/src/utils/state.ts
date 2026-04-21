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
    const prev = mergedPlugins[pluginId] ?? {}
    const merged: Record<string, unknown> = { ...prev }
    for (const [key, value] of Object.entries(pluginState)) {
      const prevValue = prev[key]
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        prevValue !== null &&
        typeof prevValue === 'object' &&
        !Array.isArray(prevValue)
      ) {
        merged[key] = {
          ...(prevValue as Record<string, unknown>),
          ...(value as Record<string, unknown>),
        }
      } else {
        merged[key] = value
      }
    }
    mergedPlugins[pluginId] = merged
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
