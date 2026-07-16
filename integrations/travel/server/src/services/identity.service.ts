import { createHash, randomBytes } from 'node:crypto'
import type { IdentityDao } from '../dao/identity.dao.js'
import { createId } from '../lib/id.js'
import { decryptSecret, encryptSecret } from '../lib/secrets.js'
import { nowIso } from '../lib/time.js'
import type { TravelOAuthProfile, TravelOAuthSession } from '../security/oauth.js'
import type { TravelAppAccount, TravelAppSession, TravelIdentityLink } from '../types.js'

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

const SESSION_CACHE_TTL_MS = 10_000

interface SessionCacheEntry {
  cacheExpiresAt: number
  value: TravelOAuthSession
}

export interface TravelSessionIssueOptions {
  authSource?: 'launch' | 'oauth'
  serverId?: string | null
  spaceAppId?: string | null
  appKey?: string | null
  channelId?: string | null
  actorKind?: string | null
  actorUserId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  launchToken?: string | null
  launchExpiresAt?: number | null
  oauthAccessToken?: string | null
  oauthAccessTokenExpiresAt?: number | null
  existingToken?: string | null
}

export class IdentityService {
  private readonly sessionCache = new Map<string, SessionCacheEntry>()

  constructor(private readonly identityDao: IdentityDao) {}

  private sessionValue(session: TravelAppSession, account: TravelAppAccount): TravelOAuthSession {
    return {
      profile: {
        id: account.primaryShadowUserId,
        username: account.username,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
      },
      scope: session.scope,
      expiresAt: Date.parse(session.expiresAt),
      authSource: session.authSource ?? 'oauth',
      serverId: session.serverId ?? null,
      spaceAppId: session.spaceAppId ?? null,
      appKey: session.appKey ?? null,
      channelId: session.channelId ?? null,
      launchActor: session.actorKind
        ? {
            kind: session.actorKind,
            userId: session.actorUserId ?? null,
            buddyAgentId: session.buddyAgentId ?? null,
            ownerId: session.ownerId ?? null,
          }
        : null,
      launchToken: decryptSecret(session.launchTokenEncrypted),
      launchExpiresAt: session.launchExpiresAt ? Date.parse(session.launchExpiresAt) : null,
      oauthAccessToken: decryptSecret(session.oauthAccessTokenEncrypted),
      oauthAccessTokenExpiresAt: session.oauthAccessTokenExpiresAt
        ? Date.parse(session.oauthAccessTokenExpiresAt)
        : null,
    }
  }

  async issueSession(
    profile: TravelOAuthProfile,
    scope: string,
    maxAgeSeconds: number,
    options: TravelSessionIssueOptions = {},
  ) {
    const timestamp = nowIso()
    const existing = await this.identityDao.findAccountByShadowUserId(profile.id)
    const account: TravelAppAccount = {
      id: existing?.id ?? createId('account'),
      primaryShadowUserId: profile.id,
      displayName: profile.displayName ?? undefined,
      username: profile.username ?? undefined,
      avatarUrl: profile.avatarUrl ?? undefined,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
    const link: TravelIdentityLink = {
      id: createId('identity'),
      accountId: account.id,
      shadowUserId: profile.id,
      username: profile.username ?? undefined,
      createdAt: timestamp,
      lastSeenAt: timestamp,
    }
    await this.identityDao.upsertIdentity(account, link)
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString()
    const sessionFields = {
      scope,
      authSource: options.authSource ?? ('oauth' as const),
      ...(options.serverId ? { serverId: options.serverId } : {}),
      ...(options.spaceAppId ? { spaceAppId: options.spaceAppId } : {}),
      ...(options.appKey ? { appKey: options.appKey } : {}),
      ...(options.channelId ? { channelId: options.channelId } : {}),
      ...(options.actorKind ? { actorKind: options.actorKind } : {}),
      ...(options.actorUserId ? { actorUserId: options.actorUserId } : {}),
      ...(options.buddyAgentId ? { buddyAgentId: options.buddyAgentId } : {}),
      ...(options.ownerId ? { ownerId: options.ownerId } : {}),
      ...(options.launchToken ? { launchTokenEncrypted: encryptSecret(options.launchToken) } : {}),
      ...(options.launchExpiresAt
        ? { launchExpiresAt: new Date(options.launchExpiresAt).toISOString() }
        : {}),
      ...(options.oauthAccessToken
        ? { oauthAccessTokenEncrypted: encryptSecret(options.oauthAccessToken) }
        : {}),
      ...(options.oauthAccessTokenExpiresAt
        ? { oauthAccessTokenExpiresAt: new Date(options.oauthAccessTokenExpiresAt).toISOString() }
        : {}),
      expiresAt,
      lastSeenAt: timestamp,
    }
    const existingToken = options.existingToken?.trim()
    const existingHash = existingToken ? tokenHash(existingToken) : null
    const existingSession = existingHash
      ? await this.identityDao.findSessionByTokenHash(existingHash)
      : null
    if (
      existingHash &&
      existingToken &&
      existingSession &&
      !existingSession.session.revokedAt &&
      existingSession.account.id === account.id &&
      existingSession.session.authSource === 'launch' &&
      existingSession.session.serverId === options.serverId
    ) {
      const updated = await this.identityDao.updateSession(existingHash, sessionFields)
      if (updated) {
        const session = this.sessionValue(updated, account)
        this.sessionCache.set(existingHash, {
          cacheExpiresAt: Math.min(Date.now() + SESSION_CACHE_TTL_MS, session.expiresAt),
          value: session,
        })
        return { token: existingToken, expiresAt, account }
      }
    }

    const token = randomBytes(32).toString('base64url')
    const storedSession: TravelAppSession = {
      id: createId('session'),
      accountId: account.id,
      tokenHash: tokenHash(token),
      ...sessionFields,
      createdAt: timestamp,
    }
    await this.identityDao.createSession(storedSession)
    const session = this.sessionValue(storedSession, account)
    this.sessionCache.set(tokenHash(token), {
      cacheExpiresAt: Math.min(Date.now() + SESSION_CACHE_TTL_MS, session.expiresAt),
      value: session,
    })
    return { token, expiresAt, account }
  }

  async readSession(token: string | undefined): Promise<TravelOAuthSession | null> {
    if (!token) return null
    const hash = tokenHash(token)
    const cached = this.sessionCache.get(hash)
    if (cached && cached.cacheExpiresAt > Date.now() && cached.value.expiresAt > Date.now()) {
      return cached.value
    }
    this.sessionCache.delete(hash)
    const resolved = await this.identityDao.findSessionByTokenHash(hash)
    if (
      !resolved ||
      resolved.session.revokedAt ||
      Date.parse(resolved.session.expiresAt) <= Date.now()
    ) {
      return null
    }
    const session = this.sessionValue(resolved.session, resolved.account)
    this.sessionCache.set(hash, {
      cacheExpiresAt: Math.min(Date.now() + SESSION_CACHE_TTL_MS, session.expiresAt),
      value: session,
    })
    return session
  }

  async revokeSession(token: string | undefined) {
    if (!token) return false
    const hash = tokenHash(token)
    this.sessionCache.delete(hash)
    return this.identityDao.revokeSession(hash)
  }

  async bindSessionToServer(token: string | undefined, serverId: string) {
    if (!token || !serverId.trim()) return null
    const hash = tokenHash(token)
    const resolved = await this.identityDao.findSessionByTokenHash(hash)
    if (
      !resolved ||
      resolved.session.revokedAt ||
      Date.parse(resolved.session.expiresAt) <= Date.now()
    ) {
      return null
    }
    const updated = await this.identityDao.updateSession(hash, {
      serverId: serverId.trim(),
      lastSeenAt: nowIso(),
    })
    if (!updated) return null
    const session = this.sessionValue(updated, resolved.account)
    this.sessionCache.set(hash, {
      cacheExpiresAt: Math.min(Date.now() + SESSION_CACHE_TTL_MS, session.expiresAt),
      value: session,
    })
    return session
  }
}
