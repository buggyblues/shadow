import { createHash, randomBytes } from 'node:crypto'
import { compare, hash } from 'bcryptjs'
import type { OAuthAppDao } from '../dao/oauth.dao'
import type { UserDao } from '../dao/user.dao'
import type {
  AuthorizeApproveInput,
  CreateOAuthAppInput,
  UpdateOAuthAppInput,
} from '../validators/oauth.schema'

function generateToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('hex')}`
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function generateClientId(): string {
  return `shadow_${randomBytes(16).toString('hex')}`
}

function generateClientSecret(): string {
  return `shsec_${randomBytes(32).toString('hex')}`
}

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const AUTH_CODE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export class OAuthService {
  constructor(
    private deps: {
      oauthAppDao: OAuthAppDao
      userDao: UserDao
    },
  ) {}

  // ─── App Management ───────────────────────────────

  async createApp(userId: string, input: CreateOAuthAppInput) {
    const { oauthAppDao } = this.deps
    const clientId = generateClientId()
    const clientSecret = generateClientSecret()
    const clientSecretHash = await hash(clientSecret, 10)

    const app = await oauthAppDao.create({
      userId,
      clientId,
      clientSecretHash,
      name: input.name,
      description: input.description,
      homepageUrl: input.homepageUrl,
      logoUrl: input.logoUrl,
      redirectUris: input.redirectUris,
    })

    return {
      id: app!.id,
      clientId,
      clientSecret, // only returned once
      name: app!.name,
      description: app!.description,
      redirectUris: app!.redirectUris,
      homepageUrl: app!.homepageUrl,
      logoUrl: app!.logoUrl,
      createdAt: app!.createdAt,
    }
  }

  async listApps(userId: string) {
    const { oauthAppDao } = this.deps
    const apps = await oauthAppDao.findByUserId(userId)
    return apps.map((a) => ({
      id: a.id,
      clientId: a.clientId,
      name: a.name,
      description: a.description,
      redirectUris: a.redirectUris,
      homepageUrl: a.homepageUrl,
      logoUrl: a.logoUrl,
      isActive: a.isActive,
      createdAt: a.createdAt,
    }))
  }

  async updateApp(userId: string, appId: string, input: UpdateOAuthAppInput) {
    const { oauthAppDao } = this.deps
    const app = await oauthAppDao.findById(appId)
    if (!app || app.userId !== userId) {
      throw Object.assign(new Error('App not found'), { status: 404 })
    }
    const updated = await oauthAppDao.update(appId, input)
    return {
      id: updated!.id,
      clientId: updated!.clientId,
      name: updated!.name,
      description: updated!.description,
      redirectUris: updated!.redirectUris,
      homepageUrl: updated!.homepageUrl,
      logoUrl: updated!.logoUrl,
      isActive: updated!.isActive,
      createdAt: updated!.createdAt,
    }
  }

  async deleteApp(userId: string, appId: string) {
    const { oauthAppDao } = this.deps
    const app = await oauthAppDao.findById(appId)
    if (!app || app.userId !== userId) {
      throw Object.assign(new Error('App not found'), { status: 404 })
    }
    await oauthAppDao.delete(appId)
  }

  async resetSecret(userId: string, appId: string) {
    const { oauthAppDao } = this.deps
    const app = await oauthAppDao.findById(appId)
    if (!app || app.userId !== userId) {
      throw Object.assign(new Error('App not found'), { status: 404 })
    }
    const clientSecret = generateClientSecret()
    const clientSecretHash = await hash(clientSecret, 10)
    await oauthAppDao.updateSecret(appId, clientSecretHash)
    return { clientSecret }
  }

  // ─── Authorization Flow ───────────────────────────

  async validateAuthorizeRequest(clientId: string, redirectUri: string, scope: string) {
    const { oauthAppDao } = this.deps
    const app = await oauthAppDao.findByClientId(clientId)
    if (!app || !app.isActive) {
      throw Object.assign(new Error('Invalid client_id'), { status: 400 })
    }
    const uris = app.redirectUris as string[]
    if (!uris.includes(redirectUri)) {
      throw Object.assign(new Error('Invalid redirect_uri'), { status: 400 })
    }
    // validate scope
    const validScopes = ['user:read', 'user:email']
    const requestedScopes = scope.split(' ').filter(Boolean)
    for (const s of requestedScopes) {
      if (!validScopes.includes(s)) {
        throw Object.assign(new Error(`Invalid scope: ${s}`), { status: 400 })
      }
    }
    return {
      appId: app.id,
      appName: app.name,
      appLogoUrl: app.logoUrl,
      homepageUrl: app.homepageUrl,
      scope,
    }
  }

  async approveAuthorization(userId: string, input: AuthorizeApproveInput) {
    const { oauthAppDao } = this.deps

    const app = await oauthAppDao.findByClientId(input.clientId)
    if (!app || !app.isActive) {
      throw Object.assign(new Error('Invalid client'), { status: 400 })
    }
    const uris = app.redirectUris as string[]
    if (!uris.includes(input.redirectUri)) {
      throw Object.assign(new Error('Invalid redirect_uri'), { status: 400 })
    }

    // Save consent
    await oauthAppDao.upsertConsent(userId, app.id, input.scope)

    // Generate authorization code
    const code = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS)

    await oauthAppDao.createAuthorizationCode({
      code,
      appId: app.id,
      userId,
      redirectUri: input.redirectUri,
      scope: input.scope,
      expiresAt,
    })

    return { code, state: input.state }
  }

  async exchangeAuthorizationCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ) {
    const { oauthAppDao } = this.deps

    // Verify client credentials
    const app = await oauthAppDao.findByClientId(clientId)
    if (!app || !app.isActive) {
      throw Object.assign(new Error('Invalid client'), { status: 401 })
    }
    const secretValid = await compare(clientSecret, app.clientSecretHash)
    if (!secretValid) {
      throw Object.assign(new Error('Invalid client credentials'), { status: 401 })
    }

    // Verify authorization code
    const authCode = await oauthAppDao.findAuthorizationCode(code)
    if (!authCode) {
      throw Object.assign(new Error('Invalid authorization code'), { status: 400 })
    }
    if (authCode.appId !== app.id) {
      throw Object.assign(new Error('Code does not match client'), { status: 400 })
    }
    if (authCode.used) {
      throw Object.assign(new Error('Authorization code already used'), { status: 400 })
    }
    if (authCode.redirectUri !== redirectUri) {
      throw Object.assign(new Error('redirect_uri mismatch'), { status: 400 })
    }
    if (new Date() > authCode.expiresAt) {
      throw Object.assign(new Error('Authorization code expired'), { status: 400 })
    }

    // Mark code as used
    await oauthAppDao.markAuthorizationCodeUsed(authCode.id)

    // Generate tokens
    return this.issueTokens(app.id, authCode.userId, authCode.scope)
  }

  async refreshAccessToken(refreshTokenValue: string, clientId: string, clientSecret: string) {
    const { oauthAppDao } = this.deps

    // Verify client
    const app = await oauthAppDao.findByClientId(clientId)
    if (!app || !app.isActive) {
      throw Object.assign(new Error('Invalid client'), { status: 401 })
    }
    const secretValid = await compare(clientSecret, app.clientSecretHash)
    if (!secretValid) {
      throw Object.assign(new Error('Invalid client credentials'), { status: 401 })
    }

    // Verify refresh token
    const tokenHash = hashToken(refreshTokenValue)
    const refreshToken = await oauthAppDao.findRefreshTokenByHash(tokenHash)
    if (!refreshToken || refreshToken.revoked) {
      throw Object.assign(new Error('Invalid refresh token'), { status: 401 })
    }
    if (refreshToken.appId !== app.id) {
      throw Object.assign(new Error('Token does not match client'), { status: 401 })
    }
    if (new Date() > refreshToken.expiresAt) {
      throw Object.assign(new Error('Refresh token expired'), { status: 401 })
    }

    // Revoke old refresh token
    await oauthAppDao.revokeRefreshToken(refreshToken.id)

    // Use the same scope as the original consent
    const consent = await oauthAppDao.findConsent(refreshToken.userId, app.id)
    const scope = consent?.scope ?? 'user:read'

    return this.issueTokens(app.id, refreshToken.userId, scope)
  }

  private async issueTokens(appId: string, userId: string, scope: string) {
    const { oauthAppDao } = this.deps

    const accessTokenValue = generateToken('oat')
    const refreshTokenValue = generateToken('ort')

    const accessTokenHash = hashToken(accessTokenValue)
    const refreshTokenHash = hashToken(refreshTokenValue)

    const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS)
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)

    const accessToken = await oauthAppDao.createAccessToken({
      tokenHash: accessTokenHash,
      appId,
      userId,
      scope,
      expiresAt: accessExpiresAt,
    })

    await oauthAppDao.createRefreshToken({
      tokenHash: refreshTokenHash,
      accessTokenId: accessToken!.id,
      appId,
      userId,
      expiresAt: refreshExpiresAt,
    })

    return {
      access_token: accessTokenValue,
      token_type: 'Bearer',
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshTokenValue,
      scope,
    }
  }

  // ─── Resource Access ──────────────────────────────

  async getUserInfo(accessTokenValue: string) {
    const { oauthAppDao, userDao } = this.deps

    const tokenHash = hashToken(accessTokenValue)
    const token = await oauthAppDao.findAccessTokenByHash(tokenHash)
    if (!token) {
      throw Object.assign(new Error('Invalid access token'), { status: 401 })
    }
    if (new Date() > token.expiresAt) {
      throw Object.assign(new Error('Access token expired'), { status: 401 })
    }

    const user = await userDao.findById(token.userId)
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 })
    }

    const scopes = token.scope.split(' ')
    const result: Record<string, unknown> = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    }
    if (scopes.includes('user:email')) {
      result.email = user.email
    }

    return result
  }

  // ─── Consent Management ───────────────────────────

  async listUserConsents(userId: string) {
    const { oauthAppDao } = this.deps
    const consents = await oauthAppDao.findConsentsByUserId(userId)
    const results = []
    for (const consent of consents) {
      const app = await oauthAppDao.findById(consent.appId)
      if (app) {
        results.push({
          appId: app.id,
          appName: app.name,
          appLogoUrl: app.logoUrl,
          scope: consent.scope,
          createdAt: consent.createdAt,
        })
      }
    }
    return results
  }

  async revokeConsent(userId: string, appId: string) {
    const { oauthAppDao } = this.deps

    // Revoke all tokens for this app+user
    await oauthAppDao.revokeRefreshTokensByAppAndUser(appId, userId)
    await oauthAppDao.deleteAccessTokensByAppAndUser(appId, userId)
    await oauthAppDao.deleteConsent(userId, appId)
  }
}
