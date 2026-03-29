import type {
  ShadowOAuthBuddy,
  ShadowOAuthChannel,
  ShadowOAuthConfig,
  ShadowOAuthMessage,
  ShadowOAuthScope,
  ShadowOAuthServer,
  ShadowOAuthTokens,
  ShadowOAuthUser,
  ShadowOAuthWorkspace,
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

  /**
   * Get user's server list. Requires `servers:read` scope.
   */
  async getServers(accessToken: string): Promise<ShadowOAuthServer[]> {
    return this.oauthGet<ShadowOAuthServer[]>('/api/oauth/servers', accessToken)
  }

  /**
   * Create a server. Requires `servers:write` scope.
   */
  async createServer(
    accessToken: string,
    data: { name: string; description?: string },
  ): Promise<ShadowOAuthServer> {
    return this.oauthPost<ShadowOAuthServer>('/api/oauth/servers', accessToken, data)
  }

  /**
   * Invite a user to a server. Requires `servers:write` scope.
   */
  async inviteToServer(
    accessToken: string,
    serverId: string,
    data: { userId: string },
  ): Promise<{ ok: boolean }> {
    return this.oauthPost<{ ok: boolean }>(
      `/api/oauth/servers/${serverId}/invite`,
      accessToken,
      data,
    )
  }

  /**
   * Get channels for a server. Requires `channels:read` scope.
   */
  async getChannels(accessToken: string, serverId: string): Promise<ShadowOAuthChannel[]> {
    return this.oauthGet<ShadowOAuthChannel[]>(
      `/api/oauth/servers/${serverId}/channels`,
      accessToken,
    )
  }

  /**
   * Create a channel in a server. Requires `channels:write` scope.
   */
  async createChannel(
    accessToken: string,
    data: { serverId: string; name: string; type?: string },
  ): Promise<ShadowOAuthChannel> {
    return this.oauthPost<ShadowOAuthChannel>('/api/oauth/channels', accessToken, data)
  }

  /**
   * Get message history for a channel. Requires `messages:read` scope.
   */
  async getMessages(
    accessToken: string,
    channelId: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ messages: ShadowOAuthMessage[]; hasMore: boolean }> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.cursor) params.set('cursor', options.cursor)
    const qs = params.toString()
    const path = `/api/oauth/channels/${channelId}/messages${qs ? `?${qs}` : ''}`
    return this.oauthGet(path, accessToken)
  }

  /**
   * Send a message to a channel. Requires `messages:write` scope.
   */
  async sendMessage(
    accessToken: string,
    channelId: string,
    data: { content: string },
  ): Promise<ShadowOAuthMessage> {
    return this.oauthPost<ShadowOAuthMessage>(
      `/api/oauth/channels/${channelId}/messages`,
      accessToken,
      data,
    )
  }

  /**
   * Get workspace info. Requires `workspaces:read` scope.
   */
  async getWorkspace(accessToken: string, workspaceId: string): Promise<ShadowOAuthWorkspace> {
    return this.oauthGet<ShadowOAuthWorkspace>(`/api/oauth/workspaces/${workspaceId}`, accessToken)
  }

  /**
   * Create a Buddy bot. Requires `buddies:create` scope.
   */
  async createBuddy(
    accessToken: string,
    data: { name: string; kernelType?: string },
  ): Promise<ShadowOAuthBuddy> {
    return this.oauthPost<ShadowOAuthBuddy>('/api/oauth/buddies', accessToken, data)
  }

  /**
   * Send a message as a Buddy. Requires `buddies:manage` scope.
   */
  async sendBuddyMessage(
    accessToken: string,
    buddyId: string,
    data: { channelId: string; content: string },
  ): Promise<ShadowOAuthMessage> {
    return this.oauthPost<ShadowOAuthMessage>(
      `/api/oauth/buddies/${buddyId}/messages`,
      accessToken,
      data,
    )
  }

  // ─── Private helpers ─────────────────────────────

  private async oauthGet<T>(path: string, accessToken: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Shadow OAuth API failed (${res.status}): ${body}`)
    }
    return res.json() as Promise<T>
  }

  private async oauthPost<T>(path: string, accessToken: string, data: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Shadow OAuth API failed (${res.status}): ${body}`)
    }
    return res.json() as Promise<T>
  }
}
