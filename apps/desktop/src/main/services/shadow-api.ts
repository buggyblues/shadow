import type { SessionService } from './session'

type RequestOptions = RequestInit & {
  auth?: boolean
}

export class ShadowApiService {
  constructor(
    private readonly webOrigin: string,
    private readonly session: SessionService,
  ) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!path.startsWith('/api/')) {
      throw new Error('Only Shadow API paths are allowed')
    }

    const auth = options.auth !== false
    let headers = this.buildHeaders(options.headers, auth)
    let response = await fetch(`${this.webOrigin}${path}`, {
      ...options,
      headers,
    })

    if (response.status === 401 && auth) {
      const accessToken = await this.session.refresh()
      if (accessToken) {
        headers = this.buildHeaders(options.headers, auth, accessToken)
        response = await fetch(`${this.webOrigin}${path}`, {
          ...options,
          headers,
        })
      }
    }

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
      const message =
        typeof record.error === 'string'
          ? record.error
          : typeof record.message === 'string'
            ? record.message
            : `Shadow API request failed (${response.status})`
      throw new Error(message)
    }

    return body as T
  }

  private buildHeaders(input: HeadersInit | undefined, auth: boolean, overrideToken?: string) {
    const headers = new Headers(input)
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    if (auth) {
      const token = overrideToken ?? this.session.getTokenPair()?.accessToken
      if (token) headers.set('Authorization', `Bearer ${token}`)
    }
    return headers
  }
}
