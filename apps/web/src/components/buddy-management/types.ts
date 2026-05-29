export interface Agent {
  id: string
  userId: string
  kernelType: string
  config: Record<string, unknown>
  ownerId: string
  status: 'running' | 'stopped' | 'error'
  containerId: string | null
  lastHeartbeat: string | null
  totalOnlineSeconds: number
  createdAt: string
  updatedAt: string
  isListed?: boolean
  isRented?: boolean
  accessRole?: 'owner' | 'tenant'
  activeContractId?: string | null
  listingInfo?: {
    listingId: string
    listingStatus: string
    isListed: boolean
  } | null
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    email: string
  } | null
  owner?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

export type BuddyMode = 'private' | 'shareable'

export function getAgentBuddyMode(agent: Pick<Agent, 'config'>): BuddyMode {
  return agent.config?.buddyMode === 'shareable' ? 'shareable' : 'private'
}

export function getAgentAllowedServerIds(agent: Pick<Agent, 'config'>): string[] {
  const value = agent.config?.allowedServerIds
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export interface TokenResponse {
  token: string
  agent: { id: string; userId: string; status: string }
  botUser: { id: string; username: string; displayName: string | null; avatarUrl: string | null }
}

export interface ConnectorRuntimeInfo {
  id: string
  label: string
  kind: 'openclaw' | 'cli'
  status: 'available' | 'missing'
  version?: string | null
  command?: string | null
  detectedAt?: string | null
}

export interface ConnectorComputer {
  id: string
  name: string
  status: 'pending' | 'online' | 'offline'
  hostname: string | null
  os: string | null
  arch: string | null
  daemonVersion: string | null
  runtimes: ConnectorRuntimeInfo[]
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}
