export type ResourceKind =
  | 'server'
  | 'shop'
  | 'app'
  | 'product'
  | 'order'
  | 'deployment'
  | 'namespace'
  | 'attachment'
  | 'wallet'
  | 'rental-contract'
  | 'agent'
  | 'channel'
  | 'user'
  | 'message'
  | 'inviteCode'
  | 'backup'
  | 'envvar'
  | 'cluster'
  | 'config'
  | 'profileComment'

export type ScopeKind = 'platform' | 'server' | 'shop' | 'workspace' | 'user' | 'deployment' | 'channel'

export type ResourceRef = {
  kind: ResourceKind
  id: string
}

export type ScopeRef = {
  kind: ScopeKind
  id?: string
}

export type ScopedResourceRef = {
  scope: ScopeRef
  resource: ResourceRef
}

export const RESOURCE_SCOPE_PARENT: Partial<Record<ResourceKind, ScopeKind[]>> = {
  app: ['server'],
  product: ['shop'],
  order: ['shop', 'user'],
  deployment: ['user', 'platform'],
  namespace: ['platform', 'deployment'],
  attachment: ['server', 'workspace', 'user'],
  wallet: ['user'],
  'rental-contract': ['user', 'server'],
  agent: ['user', 'server'],
  channel: ['server', 'user'],
}
