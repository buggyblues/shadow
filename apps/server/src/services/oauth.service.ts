import { createHash, randomBytes } from 'node:crypto'
import { compare, hash } from 'bcryptjs'
import type { OAuthAppDao } from '../dao/oauth.dao'
import type { UserDao } from '../dao/user.dao'
import type {
  AuthorizeApproveInput,
  CreateOAuthAppInput,
  UpdateOAuthAppInput,
} from '../validators/oauth.schema'
import type { AgentService } from './agent.service'
import type { ChannelService } from './channel.service'
import type { MessageService } from './message.service'
import type { ServerService } from './server.service'
import type { WorkspaceService } from './workspace.service'

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

export const VALID_OAUTH_SCOPES = [
  'user:read',
  'user:email',
  'servers:read',
  'servers:write',
  'channels:read',
  'channels:write',
  'messages:read',
  'messages:write',
  'attachments:read',
  'attachments:write',
  'workspaces:read',
  'workspaces:write',
  'buddies:create',
  'buddies:manage',
] as const

export class OAuthService {
  constructor(
    private deps: {
      oauthAppDao: OAuthAppDao
      userDao: UserDao
      serverService: ServerService
      channelService: ChannelService
      messageService: MessageService
      workspaceService: WorkspaceService
      agentService: AgentService
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
    const requestedScopes = scope.split(' ').filter(Boolean)
    for (const s of requestedScopes) {
      if (!(VALID_OAUTH_SCOPES as readonly string[]).includes(s)) {
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

  // ─── OAuth API: Servers ───────────────────────────

  async getServers(userId: string) {
    const { serverService } = this.deps
    const servers = await serverService.getUserServers(userId)
    return servers.map((s) => ({
      id: s.server.id,
      name: s.server.name,
      slug: s.server.slug,
      iconUrl: s.server.iconUrl,
      isPublic: s.server.isPublic,
    }))
  }

  async createServer(userId: string, input: { name: string; description?: string }) {
    const { serverService } = this.deps
    const server = await serverService.create(
      { name: input.name, description: input.description },
      userId,
    )
    if (!server) {
      throw Object.assign(new Error('Failed to create server'), { status: 500 })
    }
    return {
      id: server.id,
      name: server.name,
      slug: server.slug,
      iconUrl: server.iconUrl,
      isPublic: server.isPublic,
    }
  }

  async inviteToServer(serverId: string, targetUserId: string) {
    const { serverService } = this.deps
    // Get server to verify it exists and get the invite code
    const server = await serverService.getById(serverId)
    if (!server) {
      throw Object.assign(new Error('Server not found'), { status: 404 })
    }
    // Add user as a member
    await serverService.join(server.inviteCode, targetUserId)
    return { ok: true }
  }

  // ─── OAuth API: Channels ──────────────────────────

  async getChannels(serverId: string) {
    const { channelService } = this.deps
    const channels = await channelService.getByServerId(serverId)
    return channels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      topic: ch.topic,
    }))
  }

  async createChannel(userId: string, input: { serverId: string; name: string; type?: string }) {
    const { channelService } = this.deps
    const channel = await channelService.create(
      input.serverId,
      {
        name: input.name,
        type: (input.type as 'text' | 'voice' | 'announcement') ?? 'text',
      },
      userId,
    )
    if (!channel) {
      throw Object.assign(new Error('Failed to create channel'), { status: 500 })
    }
    return {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      topic: channel.topic,
    }
  }

  // ─── OAuth API: Messages ──────────────────────────

  async getMessages(channelId: string, limit?: number, cursor?: string) {
    const { messageService } = this.deps
    const result = await messageService.getByChannelId(channelId, limit, cursor)
    return {
      messages: result.messages.map((m) => ({
        id: m.id,
        content: m.content,
        channelId: m.channelId,
        authorId: m.authorId,
        createdAt: m.createdAt,
      })),
      hasMore: result.hasMore,
    }
  }

  async sendMessage(channelId: string, authorId: string, input: { content: string }) {
    const { messageService } = this.deps
    const message = await messageService.send(channelId, authorId, { content: input.content })
    return {
      id: message.id,
      content: message.content,
      channelId: message.channelId,
      authorId: message.authorId,
      createdAt: message.createdAt,
    }
  }

  // ─── OAuth API: Workspaces ────────────────────────

  async getWorkspace(workspaceId: string) {
    const { workspaceService } = this.deps
    const workspace = await workspaceService.getById(workspaceId)
    if (!workspace) {
      throw Object.assign(new Error('Workspace not found'), { status: 404 })
    }
    return {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      serverId: workspace.serverId,
    }
  }

  // ─── OAuth API: Buddies ───────────────────────────

  async createBuddy(userId: string, appId: string, input: { name: string; kernelType?: string }) {
    const { agentService, userDao } = this.deps

    // Create bot sub-account
    const botUsername = `buddy_${randomBytes(4).toString('hex')}`
    const botEmail = `${botUsername}@buddy.shadowob.internal`
    const botUser = await userDao.create({
      email: botEmail,
      username: botUsername,
      passwordHash: 'oauth-buddy-no-login',
      displayName: input.name,
    })
    if (!botUser) {
      throw Object.assign(new Error('Failed to create buddy user'), { status: 500 })
    }

    // Mark as bot with oauth app association (via direct DB update since UserDao.create doesn't support these)
    const { oauthAppDao } = this.deps
    await oauthAppDao.updateBuddyUser(botUser.id, {
      isBot: true,
      oauthAppId: appId,
      parentUserId: userId,
    })

    // Create agent
    const agent = await agentService.create({
      name: input.name,
      username: botUsername,
      kernelType: input.kernelType ?? 'buddy',
      config: {},
      ownerId: userId,
    })

    // Update agent with buddy fields
    await oauthAppDao.updateBuddyAgent(agent.id, { oauthAppId: appId, buddyUserId: botUser.id })

    return {
      id: agent.id,
      userId: botUser.id,
      agentId: agent.id,
    }
  }

  async sendBuddyMessage(buddyAgentId: string, input: { channelId: string; content: string }) {
    const { agentService, messageService, oauthAppDao } = this.deps

    // Verify the agent exists and is a buddy
    const agent = await agentService.getById(buddyAgentId)
    if (!agent) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }

    const buddyUserId = await oauthAppDao.getBuddyUserId(buddyAgentId)
    if (!buddyUserId) {
      throw Object.assign(new Error('Buddy user not found'), { status: 404 })
    }

    const message = await messageService.send(input.channelId, buddyUserId, {
      content: input.content,
    })
    return {
      id: message.id,
      content: message.content,
      channelId: message.channelId,
      authorId: message.authorId,
      createdAt: message.createdAt,
    }
  }
}
