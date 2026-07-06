export class ShadowApiError extends Error {
  status: number
  code?: string
  capability?: string
  membership?: unknown
  params?: Record<string, unknown>

  constructor(
    message: string,
    input: {
      status: number
      code?: string
      capability?: string
      membership?: unknown
      params?: Record<string, unknown>
    },
  ) {
    super(message)
    this.name = 'ShadowApiError'
    this.status = input.status
    this.code = input.code
    this.capability = input.capability
    this.membership = input.membership
    this.params = input.params
  }
}

export class InviteCodeRequestCancelled extends Error {
  constructor() {
    super('Invite code request cancelled')
    this.name = 'InviteCodeRequestCancelled'
  }
}

export type ShadowMembership = {
  status: string
  level: number
  isMember: boolean
  capabilities: string[]
}

export const WEBSITE_INVITE_CODE_REQUIRED_EVENT = 'shadow:website-invite-code-required'

let pendingInviteCodeRequest: Promise<void> | null = null

export type WebsiteInviteCodeRequiredDetail = {
  error: ShadowApiError
  handled: boolean
  resolve: () => void
  reject: (error: unknown) => void
}

function authHeaders() {
  const token = typeof window === 'undefined' ? '' : window.localStorage.getItem('accessToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function languageHeader() {
  if (typeof document === 'undefined') return 'zh-CN'
  return document.documentElement.lang || 'zh-CN'
}

function buildApiError(response: Response, body: unknown) {
  let errorMessage = `Request failed (${response.status})`
  let code: string | undefined
  let capability: string | undefined
  let membership: unknown
  let params: Record<string, unknown> | undefined

  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>
    if (typeof b.code === 'string') code = b.code
    if (typeof b.capability === 'string') capability = b.capability
    if ('membership' in b) membership = b.membership
    if (b.params && typeof b.params === 'object' && !Array.isArray(b.params)) {
      params = b.params as Record<string, unknown>
    }
    const message = b.detail ?? b.error ?? b.message
    if (typeof message === 'string') errorMessage = message
  } else if (typeof body === 'string' && body) {
    errorMessage = body
  }

  return new ShadowApiError(errorMessage, {
    status: response.status,
    code,
    capability,
    membership,
    params,
  })
}

export async function requestWebsiteInviteCode(error: ShadowApiError) {
  if (typeof window === 'undefined') throw error
  if (pendingInviteCodeRequest) return pendingInviteCodeRequest

  pendingInviteCodeRequest = new Promise<void>((resolve, reject) => {
    const detail: WebsiteInviteCodeRequiredDetail = {
      error,
      handled: false,
      resolve,
      reject,
    }
    window.dispatchEvent(new CustomEvent(WEBSITE_INVITE_CODE_REQUIRED_EVENT, { detail }))
    if (!detail.handled) reject(error)
  }).finally(() => {
    pendingInviteCodeRequest = null
  })

  return pendingInviteCodeRequest
}

export async function requestJson<T>(
  apiBase: string,
  path: string,
  init?: RequestInit,
  context: { inviteRetry?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Accept-Language', languageHeader())
  for (const [key, value] of Object.entries(authHeaders())) {
    headers.set(key, value)
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') ?? ''
    const body = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : await response.text().catch(() => '')
    const error = buildApiError(response, body)
    if (error.code === 'INVITE_REQUIRED' && !context.inviteRetry) {
      await requestWebsiteInviteCode(error)
      return requestJson<T>(apiBase, path, init, { inviteRetry: true })
    }
    throw error
  }

  return (await response.json()) as T
}

export function redeemInviteCode(apiBase: string, code: string) {
  return requestJson<ShadowMembership>(apiBase, '/api/membership/redeem-invite', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export function fetchMembership(apiBase: string) {
  return requestJson<ShadowMembership>(apiBase, '/api/membership/me')
}
