import { hash } from 'bcryptjs'
import type { OAuthAccountDao } from '../dao/oauth-account.dao'
import type { UserDao } from '../dao/user.dao'
import type { SafeHttpClient } from '../gateways/safe-http-client'
import { randomFixedDigits } from '../lib/id'
import { type JwtPayload, signAccessToken, signRefreshToken } from '../lib/jwt'
import type { MembershipService } from './membership.service'
import type { TaskCenterService } from './task-center.service'

interface OAuthProfile {
  provider: string
  providerAccountId: string
  email: string
  displayName?: string
  avatarUrl?: string
}

interface ProviderConfig {
  clientId: string
  clientSecret: string
  providerName: string
  authorizeUrl: string
  tokenUrl: string
  profileUrl: string
  scopes: string[]
}

const OAUTH_BASE_URL = process.env.OAUTH_BASE_URL ?? 'http://localhost:3000'

function getProviderConfig(provider: string): ProviderConfig {
  switch (provider) {
    case 'google':
      return {
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        providerName: 'google',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        profileUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
        scopes: ['openid', 'email', 'profile'],
      }
    case 'github':
      return {
        clientId: process.env.GITHUB_CLIENT_ID ?? '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
        providerName: 'github',
        authorizeUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        profileUrl: 'https://api.github.com/user',
        scopes: ['read:user', 'user:email'],
      }
    default:
      throw Object.assign(new Error(`Unsupported OAuth provider: ${provider}`), { status: 400 })
  }
}

export class ExternalOAuthService {
  constructor(
    private deps: {
      oauthAccountDao: OAuthAccountDao
      userDao: UserDao
      membershipService: MembershipService
      taskCenterService: TaskCenterService
      safeHttpClient: SafeHttpClient
    },
  ) {}

  getAuthorizeUrl(provider: string, redirectPath?: string, inviteCode?: string) {
    const config = getProviderConfig(provider)
    if (!config.clientId) {
      throw Object.assign(new Error(`${provider} OAuth not configured`), { status: 501 })
    }

    const callbackUrl = `${OAUTH_BASE_URL}/api/auth/oauth/${provider}/callback`
    const statePayload = {
      ...(redirectPath ? { redirect: redirectPath } : {}),
      ...(inviteCode?.trim() ? { inviteCode: inviteCode.trim() } : {}),
    }
    const state = Object.keys(statePayload).length
      ? Buffer.from(JSON.stringify(statePayload)).toString('base64url')
      : ''

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: config.scopes.join(' '),
      ...(state ? { state } : {}),
    })

    return `${config.authorizeUrl}?${params.toString()}`
  }

  async handleCallback(
    provider: string,
    code: string,
    state?: string,
  ): Promise<{ accessToken: string; refreshToken: string; redirect: string; inviteCode?: string }> {
    const config = getProviderConfig(provider)
    const callbackUrl = `${OAUTH_BASE_URL}/api/auth/oauth/${provider}/callback`

    // Exchange code for token
    const tokenRes = await this.deps.safeHttpClient.fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      throw Object.assign(new Error('Failed to exchange OAuth code'), { status: 502 })
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string
      error?: string
      error_description?: string
    }
    const providerAccessToken = tokenData.access_token
    if (!providerAccessToken) {
      const detail = tokenData.error_description ?? tokenData.error ?? 'unknown_error'
      throw Object.assign(new Error(`OAuth token missing access_token: ${detail}`), { status: 502 })
    }

    // Fetch user profile
    const profile = await this.fetchProfile(provider, providerAccessToken)

    // Find or create user
    const { user, isNew } = await this.findOrCreateUser(profile)
    if (isNew) await this.deps.taskCenterService.grantWelcomeReward(user.id)

    // Generate Shadow tokens
    const jwtPayload: JwtPayload = { userId: user.id, email: user.email, username: user.username }
    const accessToken = signAccessToken(jwtPayload)
    const refreshToken = signRefreshToken(jwtPayload)

    // Parse redirect from state
    // Supports:
    // - Web paths starting with '/' (e.g., '/app/settings')
    // - Mobile deep links with custom schemes (e.g., 'shadow://oauth-callback')
    let redirect = '/app/settings'
    if (state) {
      try {
        const parsed = JSON.parse(Buffer.from(state, 'base64url').toString()) as {
          redirect?: string
          inviteCode?: string
        }
        const redirectPath = parsed.redirect
        if (redirectPath) {
          // Allow web paths (/) or custom schemes (://)
          if (redirectPath.startsWith('/') || redirectPath.includes('://')) {
            redirect = redirectPath
          }
        }
        const inviteCode = parsed.inviteCode?.trim()
        if (inviteCode) {
          return { accessToken, refreshToken, redirect, inviteCode }
        }
      } catch {
        // ignore
      }
    }

    return { accessToken, refreshToken, redirect }
  }

  async handleGoogleIdToken(
    credential: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: unknown }> {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? ''
    if (!clientId) {
      throw Object.assign(new Error('Google OAuth not configured'), { status: 501 })
    }

    const tokenInfoRes = await this.deps.safeHttpClient.fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
    )
    if (!tokenInfoRes.ok) {
      throw Object.assign(new Error('Invalid Google credential'), { status: 401 })
    }

    const tokenInfo = (await tokenInfoRes.json()) as {
      aud?: string
      sub?: string
      email?: string
      email_verified?: string
      name?: string
      picture?: string
    }

    if (tokenInfo.aud !== clientId || !tokenInfo.sub || !tokenInfo.email) {
      throw Object.assign(new Error('Invalid Google credential'), { status: 401 })
    }
    if (tokenInfo.email_verified !== 'true') {
      throw Object.assign(new Error('Google email is not verified'), { status: 401 })
    }

    const { user, isNew } = await this.findOrCreateUser({
      provider: 'google',
      providerAccountId: tokenInfo.sub,
      email: tokenInfo.email,
      displayName: tokenInfo.name,
      avatarUrl: tokenInfo.picture,
    })
    if (isNew) await this.deps.taskCenterService.grantWelcomeReward(user.id)

    const jwtPayload: JwtPayload = { userId: user.id, email: user.email, username: user.username }
    return {
      user: await this.serializeUser(user),
      accessToken: signAccessToken(jwtPayload),
      refreshToken: signRefreshToken(jwtPayload),
    }
  }

  private async fetchProfile(provider: string, accessToken: string): Promise<OAuthProfile> {
    const config = getProviderConfig(provider)

    const res = await this.deps.safeHttpClient.fetch(config.profileUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'shadowob-server',
      },
    })

    if (!res.ok) {
      throw Object.assign(new Error('Failed to fetch OAuth profile'), { status: 502 })
    }

    const data = (await res.json()) as Record<string, unknown>

    if (provider === 'google') {
      return {
        provider: 'google',
        providerAccountId: String(data.id),
        email: String(data.email),
        displayName: (data.name as string) ?? undefined,
        avatarUrl: (data.picture as string) ?? undefined,
      }
    }

    if (provider === 'github') {
      let email = data.email as string | null
      // GitHub may not return email in profile, fetch email endpoint
      if (!email) {
        email = await this.fetchGitHubEmail(accessToken)
      }
      return {
        provider: 'github',
        providerAccountId: String(data.id),
        email: email ?? '',
        displayName: (data.name as string) ?? (data.login as string) ?? undefined,
        avatarUrl: (data.avatar_url as string) ?? undefined,
      }
    }

    throw Object.assign(new Error('Unknown provider'), { status: 400 })
  }

  private async fetchGitHubEmail(accessToken: string): Promise<string | null> {
    const res = await this.deps.safeHttpClient.fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'shadowob-server',
      },
    })
    if (!res.ok) return null
    const emails = (await res.json()) as { email: string; primary: boolean; verified: boolean }[]
    const primary = emails.find((e) => e.primary && e.verified)
    return primary?.email ?? emails[0]?.email ?? null
  }

  private async findOrCreateUser(profile: OAuthProfile) {
    const { oauthAccountDao, userDao } = this.deps

    // Check if OAuth account already linked
    const existing = await oauthAccountDao.findByProviderAccount(
      profile.provider,
      profile.providerAccountId,
    )
    if (existing) {
      const user = await userDao.findById(existing.userId)
      if (user) {
        await userDao.updateStatus(user.id, 'online')
        return { user, isNew: false }
      }
    }

    // Check if email matches existing user
    if (profile.email) {
      const userByEmail = await userDao.findByEmail(profile.email)
      if (userByEmail) {
        // Link the account
        await oauthAccountDao.create({
          userId: userByEmail.id,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
          providerEmail: profile.email,
        })
        await userDao.updateStatus(userByEmail.id, 'online')
        return { user: userByEmail, isNew: false }
      }
    }

    // Create new user
    const emailLocalPart = profile.email ? (profile.email.split('@')[0] ?? 'user') : 'user'
    const prefix = emailLocalPart.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24)
    let username = ''
    for (let attempt = 0; attempt < 10; attempt++) {
      const suffix = randomFixedDigits(6)
      const candidate = `${prefix}_${suffix}`
      const existingUser = await userDao.findByUsername(candidate)
      if (!existingUser) {
        username = candidate
        break
      }
    }
    if (!username) {
      throw Object.assign(new Error('Failed to generate unique username'), { status: 500 })
    }

    // OAuth users get a random password hash (they can't login with password)
    const passwordHash = await hash(crypto.randomUUID(), 12)

    const newUser = await userDao.create({
      email: profile.email || `${profile.providerAccountId}@${profile.provider}.oauth`,
      username,
      passwordHash,
      displayName: profile.displayName,
    })

    if (!newUser) {
      throw Object.assign(new Error('Failed to create user'), { status: 500 })
    }

    // Update avatar if provided
    if (profile.avatarUrl) {
      await userDao.update(newUser.id, { avatarUrl: profile.avatarUrl })
    }

    // Link OAuth account
    await oauthAccountDao.create({
      userId: newUser.id,
      provider: profile.provider,
      providerAccountId: profile.providerAccountId,
      providerEmail: profile.email,
    })

    await userDao.updateStatus(newUser.id, 'online')

    return { user: newUser, isNew: true }
  }

  private async serializeUser(user: {
    id: string
    email: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  }) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      membership: await this.deps.membershipService.getMembership(user.id),
    }
  }

  async listLinkedAccounts(userId: string) {
    const { oauthAccountDao } = this.deps
    const accounts = await oauthAccountDao.findByUserId(userId)
    return accounts.map((a) => ({
      id: a.id,
      provider: a.provider,
      providerEmail: a.providerEmail,
      createdAt: a.createdAt,
    }))
  }

  async unlinkAccount(userId: string, accountId: string) {
    const { oauthAccountDao } = this.deps
    const accounts = await oauthAccountDao.findByUserId(userId)
    const account = accounts.find((a) => a.id === accountId)
    if (!account) {
      throw Object.assign(new Error('Linked account not found'), { status: 404 })
    }
    if (account.userId !== userId) {
      throw Object.assign(new Error('Not authorized'), { status: 403 })
    }
    await oauthAccountDao.delete(accountId)
  }
}
