import type { OpenClawConfig } from 'openclaw/plugin-sdk/core'
import { DEFAULT_ACCOUNT_ID, getAccountConfig } from '../config.js'
import type { ShadowAccountConfig } from '../types.js'

export function resolveAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): ShadowAccountConfig {
  const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID)
  if (!account) {
    return { token: '', serverUrl: 'https://shadowob.com', enabled: false }
  }
  return account
}

export function inspectAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): { enabled: boolean; configured: boolean; tokenStatus: string } {
  const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID)
  return {
    enabled: account?.enabled !== false,
    configured: !!account?.token?.trim(),
    tokenStatus: account?.token?.trim() ? 'available' : 'missing',
  }
}
