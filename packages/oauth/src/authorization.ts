export interface ShadowOAuthAuthorizationRequest {
  responseType: 'code'
  clientId: string
  redirectUri: string
  scope: string
  state?: string
  sourceUrl: string
}

export interface ShadowOAuthAuthorizeUrlOptions {
  allowedOrigins?: string[]
  authorizePathnames?: string[]
}

export const SHADOW_OAUTH_AUTHORIZE_PATHS = ['/app/oauth/authorize', '/oauth/authorize'] as const

export const SHADOW_OAUTH_SCOPE_GROUPS = [
  { key: 'user', scopes: ['user:read', 'user:email'] },
  { key: 'servers', scopes: ['servers:read', 'servers:write'] },
  { key: 'channels', scopes: ['channels:read', 'channels:write'] },
  { key: 'messages', scopes: ['messages:read', 'messages:write'] },
  { key: 'attachments', scopes: ['attachments:read', 'attachments:write'] },
  { key: 'workspaces', scopes: ['workspaces:read', 'workspaces:write'] },
  { key: 'buddies', scopes: ['buddies:create', 'buddies:manage'] },
  { key: 'commerce', scopes: ['commerce:read', 'commerce:write'] },
] as const

function originFor(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function parseShadowOAuthAuthorizeUrl(
  input: string,
  options: ShadowOAuthAuthorizeUrlOptions = {},
): ShadowOAuthAuthorizationRequest | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }

  const allowedOrigins = options.allowedOrigins
    ?.map(originFor)
    .filter((origin): origin is string => Boolean(origin))
  if (allowedOrigins?.length && !allowedOrigins.includes(url.origin)) return null

  const authorizePathnames = options.authorizePathnames ?? [...SHADOW_OAUTH_AUTHORIZE_PATHS]
  if (!authorizePathnames.includes(url.pathname)) return null

  const responseType = url.searchParams.get('response_type') ?? 'code'
  const clientId = url.searchParams.get('client_id')?.trim()
  const redirectUri = url.searchParams.get('redirect_uri')?.trim()
  if (responseType !== 'code' || !clientId || !redirectUri) return null

  return {
    responseType: 'code',
    clientId,
    redirectUri,
    scope: url.searchParams.get('scope')?.trim() || 'user:read',
    state: url.searchParams.get('state') ?? undefined,
    sourceUrl: url.toString(),
  }
}

export function shadowOAuthAuthorizeApiPath(request: ShadowOAuthAuthorizationRequest): string {
  const params = new URLSearchParams({
    response_type: request.responseType,
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    scope: request.scope,
  })
  if (request.state) params.set('state', request.state)
  return `/api/oauth/authorize?${params.toString()}`
}

export function buildShadowOAuthDenyRedirect(
  request: Pick<ShadowOAuthAuthorizationRequest, 'redirectUri' | 'state'>,
  error = 'access_denied',
): string {
  const url = new URL(request.redirectUri)
  url.searchParams.set('error', error)
  if (request.state) url.searchParams.set('state', request.state)
  return url.toString()
}
