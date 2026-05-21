import type { ShadowServerAppTokenIntrospection } from './types.js'

export function shadowServerUrl() {
  return (process.env.SHADOW_SERVER_URL ?? 'http://localhost:3002').replace(/\/$/, '')
}

export function bearerToken(authorization: string | null) {
  if (!authorization?.toLowerCase().startsWith('bearer ')) return null
  return authorization.slice(7).trim() || null
}

export async function introspectShadowBearerToken(input: {
  token: string
  serverId: string
  appKey: string
}) {
  const response = await fetch(
    `${shadowServerUrl()}/api/servers/${encodeURIComponent(input.serverId)}/apps/${encodeURIComponent(
      input.appKey,
    )}/oauth/introspect`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: input.token }),
    },
  )
  if (!response.ok) return null
  const result = (await response.json()) as ShadowServerAppTokenIntrospection
  if (!result.active || !result.shadow) return null
  return result
}
