import type { OpenClawConfig } from 'openclaw/plugin-sdk/core'

export function resolveSessionStore(cfg: OpenClawConfig): string | undefined {
  const raw = (cfg as { session?: { store?: unknown } }).session?.store
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const pathValue = (raw as { path?: unknown }).path
    if (typeof pathValue === 'string') return pathValue
  }
  return undefined
}
