export type ShadowComputerKind = 'local' | 'cloud'

export type ShadowComputerDeviceClass =
  | 'cloud'
  | 'macbook'
  | 'imac'
  | 'mac-mini'
  | 'mac-studio'
  | 'laptop'
  | 'desktop'
  | 'workstation'
  | 'server'
  | 'unknown'

export type ShadowComputerStatus =
  | 'pending'
  | 'online'
  | 'offline'
  | 'deploying'
  | 'deployed'
  | 'paused'
  | 'resuming'
  | 'destroying'
  | 'cancelling'
  | 'failed'
  | 'unknown'

export interface ShadowComputerDevice {
  class: ShadowComputerDeviceClass
  vendor?: string | null
  model?: string | null
  hostname?: string | null
  os: string | null
  osVersion?: string | null
  arch: string | null
}

export interface ShadowComputerCapabilities {
  buddies: boolean
  runtimes: boolean
  tasks: boolean
  diagnostics: boolean
  files: boolean
  terminal: boolean
  browser: boolean
  desktop: boolean
  backups: boolean
  connectors: boolean
  power: boolean
}

export interface ShadowComputerRuntime {
  id: string
  label: string
  kind?: 'openclaw' | 'cli' | string
  status: string
  version?: string | null
  command?: string | null
  iconId?: string | null
}

export interface ShadowComputerBuddy {
  agentId: string | null
  buddyId: string
  name: string
  username?: string | null
  avatarUrl?: string | null
  status: string
  runtimeId?: string | null
  runtimeLabel?: string | null
  workDir?: string | null
}

export interface ShadowComputer {
  /** Stable product-layer identifier. Source ids remain available for legacy APIs. */
  id: string
  sourceId: string
  kind: ShadowComputerKind
  name: string
  status: ShadowComputerStatus | string
  device: ShadowComputerDevice
  capabilities: ShadowComputerCapabilities
  runtimes: ShadowComputerRuntime[]
  buddies: ShadowComputerBuddy[]
  buddyCount: number
  lastSeenAt?: string | null
  lastActiveAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  local?: {
    installationId?: string | null
    deviceFingerprint?: string | null
    daemonVersion?: string | null
  }
  cloud?: {
    shellColor?: string | null
    hourlyCredits?: number | null
    monthlyCredits?: number | null
  }
}

export interface ShadowAgentComputerPlacement {
  computerId: string
  computerKind: ShadowComputerKind
  computerName: string
  computerStatus: ShadowComputerStatus | string
  deviceClass: ShadowComputerDeviceClass
  deviceModel?: string | null
  runtimeId?: string | null
  runtimeLabel?: string | null
}

export function shadowComputerId(kind: ShadowComputerKind, sourceId: string): string {
  return `${kind}:${sourceId}`
}

export function parseShadowComputerId(
  id: string,
): { kind: ShadowComputerKind; sourceId: string } | null {
  const separator = id.indexOf(':')
  if (separator <= 0) return null
  const kind = id.slice(0, separator)
  const sourceId = id.slice(separator + 1)
  if ((kind !== 'local' && kind !== 'cloud') || !sourceId) return null
  return { kind, sourceId }
}
