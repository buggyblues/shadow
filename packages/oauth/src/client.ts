import type {
  ShadowOAuthConfig,
  ShadowOAuthScope,
  ShadowOAuthTokens,
  ShadowOAuthUser,
} from './types'

const DEFAULT_BASE_URL = 'https://shadowob.com'

/**
 * Shadow OAuth SDK client.
 *
 * Use this in your server-side application to implement
 * "Login with Shadow" via the OAuth 2.0 Authorization Code flow.
 *
 * @example
 * ```ts
 * const oauth = new ShadowOAuth({
 *   clientId: 'shadow_xxx',
 *   clientSecret: 'shsec_xxx',
 *   redirectUri: 'https://myapp.com/callback',
 * })
 *
 * // Step 1: Generate the authorization URL and redirect the user
 * const url = oauth.getAuthorizeUrl({ scope: ['user:read', 'user:email'] })
 *
 * // Step 2: After callback, exchange the code for tokens
 * const tokens = await oauth.getToken(code)
 *
 * // Step 3: Get user info
 * const user = await oauth.getUser(tokens.accessToken)
 * ```
 */
export class ShadowOAuth {
  private baseUrl: string
  private clientId: string
  private clientSecret: string
  private redirectUri: string

  constructor(config: ShadowOAuthConfig) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  /**
   * Generate the authorization URL to redirect users to Shadow for login.
   */
  getAuthorizeUrl(options?: { scope?: ShadowOAuthScope[]; state?: string }): string {
    const scope = options?.scope?.join(' ') ?? 'user:read'
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope,
    })
    if (options?.state) {
      params.set('state', options.state)
    }
    return `${this.baseUrl}/oauth/authorize?${params.toString()}`
  }

  /**
   * Exchange an authorization code for access and refresh tokens.
   */
  async getToken(code: string): Promise<ShadowOAuthTokens> {
    const res = await fetch(`${this.baseUrl}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Shadow OAuth token exchange failed (${res.status}): ${body}`)
    }

    const data = (await res.json()) as {
      access_token: string
      refresh_token: string
      expires_in: number
      token_type: string
      scope: string
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    }
  }

  /**
   * Refresh an access token using a refresh token.
   */
  async refreshToken(refreshToken: string): Promise<ShadowOAuthTokens> {
    const res = await fetch(`${this.baseUrl}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Shadow OAuth token refresh failed (${res.status}): ${body}`)
    }

    const data = (await res.json()) as {
      access_token: string
      refresh_token: string
      expires_in: number
      token_type: string
      scope: string
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    }
  }

  /**
   * Get the authenticated user's information using an access token.
   */
  async getUser(accessToken: string): Promise<ShadowOAuthUser> {
    const res = await fetch(`${this.baseUrl}/api/oauth/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Shadow OAuth userinfo failed (${res.status}): ${body}`)
    }

    return res.json() as Promise<ShadowOAuthUser>
  }
}
