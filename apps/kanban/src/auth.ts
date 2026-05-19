export function bearerToken(value: string | null) {
  if (!value) return null
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : null
}

export async function introspectShadowBearerToken(input: {
  token: string
  serverId: string
  appKey: string
}) {
  const baseUrl = (process.env.SHADOW_SERVER_URL ?? 'http://localhost:3002').replace(/\/$/, '')
  const response = await fetch(
    `${baseUrl}/api/servers/${encodeURIComponent(input.serverId)}/apps/${encodeURIComponent(
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
  const payload = (await response.json()) as {
    active: boolean
    shadow?: {
      command?: string
      actor: {
        kind: string
        userId: string | null
        buddyAgentId?: string | null
        ownerId?: string | null
      }
      [key: string]: unknown
    }
  }
  return payload.active ? payload : null
}
