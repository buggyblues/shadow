/**
 * Shadow config resolution — reads and writes account configs
 * from the OpenClaw configuration object.
 *
 * Config shape (simplified — server/channel info is fetched remotely):
 *   channels:
 *     shadowob:
 *       accounts:
 *         <accountId>:
 *           token: "..."
 *           serverUrl: "https://shadowob.com"
 *           enabled: true
 */

import type { OpenClawConfig, ShadowAccountConfig } from './types.js'

export const DEFAULT_ACCOUNT_ID = 'default'

/** Extract the raw shadowob config block from OpenClaw config. */
function getShadowBlock(cfg: OpenClawConfig): Record<string, unknown> | undefined {
  return (cfg.channels?.shadowob ?? cfg.channels?.shadow) as Record<string, unknown> | undefined
}

/** Get a single account config by ID. */
export function getAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): ShadowAccountConfig | null {
  const shadow = getShadowBlock(cfg)
  if (!shadow) return null

  const accounts = shadow.accounts as Record<string, ShadowAccountConfig> | undefined

  // For the default account, also check base-level properties
  if (accountId === DEFAULT_ACCOUNT_ID) {
    const fromAccounts = accounts?.[DEFAULT_ACCOUNT_ID]
    const baseLevel: Partial<ShadowAccountConfig> = {
      token: typeof shadow.token === 'string' ? shadow.token : undefined,
      serverUrl: typeof shadow.serverUrl === 'string' ? shadow.serverUrl : undefined,
      enabled: typeof shadow.enabled === 'boolean' ? shadow.enabled : undefined,
    }

    const merged: Partial<ShadowAccountConfig> = {
      ...fromAccounts,
      // Base-level fields take precedence (convenience shorthand)
      ...Object.fromEntries(Object.entries(baseLevel).filter(([, v]) => v !== undefined)),
    }

    if (merged.token) {
      return {
        token: merged.token,
        serverUrl: merged.serverUrl ?? 'https://shadowob.com',
        enabled: merged.enabled,
      }
    }

    return fromAccounts ?? null
  }

  return accounts?.[accountId] ?? null
}

/** List all configured account IDs. */
export function listAccountIds(cfg: OpenClawConfig): string[] {
  const shadow = getShadowBlock(cfg)
  if (!shadow) return []

  const accounts = shadow.accounts as Record<string, unknown> | undefined
  const ids: string[] = []

  if (accounts) {
    ids.push(...Object.keys(accounts))
  }

  // Check if base-level config exists (shorthand for single-account)
  const hasBaseLevelConfig =
    typeof shadow.token === 'string' || typeof shadow.serverUrl === 'string'
  if (hasBaseLevelConfig && !ids.includes(DEFAULT_ACCOUNT_ID)) {
    ids.push(DEFAULT_ACCOUNT_ID)
  }

  return ids
}
