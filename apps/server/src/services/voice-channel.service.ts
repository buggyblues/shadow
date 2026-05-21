import { createHash } from 'node:crypto'
import * as AgoraAccessToken from 'agora-access-token'
import type { Logger } from 'pino'
import type { RedisClientType } from 'redis'
import type { ChannelDao } from '../dao/channel.dao'
import type { UserDao } from '../dao/user.dao'
import { getRedisClient } from '../lib/redis'
import { type ActorInput, actorUserId } from '../security/actor'
import type { PolicyService } from './policy.service'

const TOKEN_TTL_SECONDS = 60 * 60
const STALE_PARTICIPANT_MS = 90_000
const EMPTY_GRACE_MS = 5 * 60_000
const VOICE_SESSION_TTL_SECONDS = Math.ceil((STALE_PARTICIPANT_MS + EMPTY_GRACE_MS) / 1000)

type AgoraAccessTokenModule = typeof AgoraAccessToken & {
  default?: typeof AgoraAccessToken
}

const agoraTokenModule = AgoraAccessToken as AgoraAccessTokenModule
const RtcTokenBuilder =
  agoraTokenModule.RtcTokenBuilder ?? agoraTokenModule.default?.RtcTokenBuilder
const RtcRole = agoraTokenModule.RtcRole ?? agoraTokenModule.default?.RtcRole

export type VoiceParticipant = {
  id: string
  channelId: string
  userId: string
  uid: number
  screenUid: number
  username: string
  displayName: string | null
  avatarUrl: string | null
  isBot: boolean
  isMuted: boolean
  isDeafened: boolean
  isSpeaking: boolean
  isScreenSharing: boolean
  joinedAt: string
  updatedAt: string
  clientId: string | null
}

export type VoiceChannelCredentials = {
  appId: string
  channelId: string
  agoraChannelName: string
  uid: number
  screenUid: number
  token: string | null
  screenToken: string | null
  expiresAt: string | null
}

export type VoiceChannelState = {
  channelId: string
  agoraChannelName: string
  participants: VoiceParticipant[]
  participantCount: number
  emptySince: string | null
  graceEndsAt: string | null
}

type ParticipantSelector = {
  clientId?: string | null
}

type JoinOptions = ParticipantSelector & {
  muted?: boolean
  deafened?: boolean
}

type ChannelSession = {
  channelId: string
  agoraChannelName: string
  participants: Map<string, VoiceParticipant>
  emptySince: number | null
}

function participantId(userId: string, clientId?: string | null) {
  return `${userId}:${clientId?.trim() || 'default'}`
}

function voiceParticipantsKey(channelId: string) {
  return `voice:channel:${channelId}:participants`
}

function voiceMetaKey(channelId: string) {
  return `voice:channel:${channelId}:meta`
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const timestamp = Number(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function parseParticipant(raw: string): VoiceParticipant | null {
  try {
    const parsed = JSON.parse(raw) as Partial<VoiceParticipant>
    if (!parsed.id || !parsed.userId || !parsed.channelId) return null
    return parsed as VoiceParticipant
  } catch {
    return null
  }
}

export class VoiceChannelService {
  private sessions = new Map<string, ChannelSession>()
  private redisFailureLogged = false

  constructor(
    private deps: {
      channelDao: ChannelDao
      userDao: UserDao
      policyService: PolicyService
      logger: Logger
    },
  ) {}

  private get appId() {
    return process.env.AGORA_APP_ID ?? ''
  }

  private get appCertificate() {
    return process.env.AGORA_APP_CERTIFICATE ?? ''
  }

  private async redis(): Promise<RedisClientType | null> {
    if (!process.env.REDIS_URL?.trim()) return null
    try {
      return await getRedisClient()
    } catch (err) {
      if (!this.redisFailureLogged) {
        this.deps.logger.warn(
          { err },
          'Redis unavailable for voice presence; using memory fallback',
        )
        this.redisFailureLogged = true
      }
      return null
    }
  }

  private assertConfigured() {
    if (!this.appId) {
      throw Object.assign(new Error('Agora RTC is not configured'), {
        status: 503,
        code: 'VOICE_RTC_NOT_CONFIGURED',
      })
    }
    if (!RtcTokenBuilder || !RtcRole) {
      throw Object.assign(new Error('Agora token builder is unavailable'), {
        status: 503,
        code: 'VOICE_RTC_NOT_CONFIGURED',
      })
    }
  }

  private agoraChannelName(channelId: string) {
    return `shadow_${channelId.replaceAll('-', '')}`
  }

  private stableUid(seed: string) {
    const hash = createHash('sha256').update(seed).digest()
    const value = hash.readUInt32BE(0)
    return value === 0 ? 1 : value
  }

  private buildToken(channelName: string, uid: number) {
    if (!this.appCertificate) return null
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
    return RtcTokenBuilder!.buildTokenWithUid(
      this.appId,
      this.appCertificate,
      channelName,
      uid,
      RtcRole!.PUBLISHER,
      expiresAtSeconds,
    )
  }

  private tokenExpiry() {
    if (!this.appCertificate) return null
    return new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString()
  }

  private getOrCreateSession(channelId: string) {
    let session = this.sessions.get(channelId)
    if (!session) {
      session = {
        channelId,
        agoraChannelName: this.agoraChannelName(channelId),
        participants: new Map(),
        emptySince: null,
      }
      this.sessions.set(channelId, session)
    }
    return session
  }

  private serialize(session: ChannelSession): VoiceChannelState {
    const participants = [...session.participants.values()].sort((a, b) =>
      a.joinedAt.localeCompare(b.joinedAt),
    )
    return {
      channelId: session.channelId,
      agoraChannelName: session.agoraChannelName,
      participants,
      participantCount: participants.length,
      emptySince: session.emptySince ? new Date(session.emptySince).toISOString() : null,
      graceEndsAt: session.emptySince
        ? new Date(session.emptySince + EMPTY_GRACE_MS).toISOString()
        : null,
    }
  }

  private async serializeRedis(
    redis: RedisClientType,
    channelId: string,
  ): Promise<VoiceChannelState> {
    const [rawParticipants, rawEmptySince] = await Promise.all([
      redis.hGetAll(voiceParticipantsKey(channelId)),
      redis.hGet(voiceMetaKey(channelId), 'emptySince'),
    ])
    const now = Date.now()
    const staleIds: string[] = []
    const participants = new Map<string, VoiceParticipant>()

    for (const [id, raw] of Object.entries(rawParticipants)) {
      const participant = parseParticipant(raw)
      if (!participant) {
        staleIds.push(id)
        continue
      }
      if (now - new Date(participant.updatedAt).getTime() > STALE_PARTICIPANT_MS) {
        staleIds.push(id)
        continue
      }
      participants.set(id, participant)
    }

    if (staleIds.length > 0) {
      await redis.hDel(voiceParticipantsKey(channelId), staleIds)
    }

    let emptySince = participants.size === 0 ? parseTimestamp(rawEmptySince) : null
    if (participants.size === 0) {
      emptySince ??= now
      if (now - emptySince > EMPTY_GRACE_MS) {
        await redis.del([voiceParticipantsKey(channelId), voiceMetaKey(channelId)])
        return this.emptyState(channelId)
      }
      await redis.hSet(voiceMetaKey(channelId), 'emptySince', String(emptySince))
      await this.refreshRedisTtl(redis, channelId)
    } else {
      await redis.hDel(voiceMetaKey(channelId), 'emptySince')
      await this.refreshRedisTtl(redis, channelId)
    }

    return this.serialize({
      channelId,
      agoraChannelName: this.agoraChannelName(channelId),
      participants,
      emptySince,
    })
  }

  private async refreshRedisTtl(redis: RedisClientType, channelId: string) {
    await Promise.all([
      redis.expire(voiceParticipantsKey(channelId), VOICE_SESSION_TTL_SECONDS),
      redis.expire(voiceMetaKey(channelId), VOICE_SESSION_TTL_SECONDS),
    ])
  }

  private async requireVoiceChannel(actor: ActorInput, channelId: string) {
    const { channel } = await this.deps.policyService.requireChannelRead(actor, channelId)
    if (channel.kind !== 'server' || !channel.serverId) {
      throw Object.assign(new Error('Voice calls are only supported in server voice channels'), {
        status: 400,
        code: 'VOICE_CHANNEL_REQUIRED',
      })
    }
    if (channel.type !== 'voice') {
      throw Object.assign(new Error('Channel is not a voice channel'), {
        status: 400,
        code: 'VOICE_CHANNEL_REQUIRED',
      })
    }
    return channel
  }

  async issueCredentials(
    actor: ActorInput,
    channelId: string,
    options: ParticipantSelector = {},
  ): Promise<VoiceChannelCredentials> {
    this.assertConfigured()
    await this.requireVoiceChannel(actor, channelId)
    const userId = actorUserId(actor)
    const id = participantId(userId, options.clientId)
    const agoraChannelName = this.agoraChannelName(channelId)
    const uid = this.stableUid(`${channelId}:${id}:audio`)
    const screenUid = this.stableUid(`${channelId}:${id}:screen`)
    return {
      appId: this.appId,
      channelId,
      agoraChannelName,
      uid,
      screenUid,
      token: this.buildToken(agoraChannelName, uid),
      screenToken: this.buildToken(agoraChannelName, screenUid),
      expiresAt: this.tokenExpiry(),
    }
  }

  async renewCredentials(actor: ActorInput, channelId: string, options: ParticipantSelector = {}) {
    const credentials = await this.issueCredentials(actor, channelId, options)
    const state = await this.getState(actor, channelId)
    return { credentials, state }
  }

  async join(actor: ActorInput, channelId: string, options: JoinOptions = {}) {
    const credentials = await this.issueCredentials(actor, channelId, options)
    const userId = actorUserId(actor)
    const user = await this.deps.userDao.findById(userId)
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 })
    }

    const id = participantId(userId, options.clientId)
    const now = new Date().toISOString()
    const redis = await this.redis()
    if (redis) {
      const rawParticipants = await redis.hGetAll(voiceParticipantsKey(channelId))
      const duplicateIds = Object.entries(rawParticipants)
        .map(([candidateId, raw]) => [candidateId, parseParticipant(raw)] as const)
        .filter(
          ([candidateId, participant]) => candidateId !== id && participant?.userId === userId,
        )
        .map(([candidateId]) => candidateId)
      if (duplicateIds.length > 0) {
        await redis.hDel(voiceParticipantsKey(channelId), duplicateIds)
      }
      const previousRaw = rawParticipants[id]
      const previous = previousRaw ? parseParticipant(previousRaw) : null
      const participant = this.buildParticipant(
        channelId,
        id,
        userId,
        credentials,
        user,
        options,
        previous,
        now,
      )
      await Promise.all([
        redis.hSet(voiceParticipantsKey(channelId), id, JSON.stringify(participant)),
        redis.hSet(voiceMetaKey(channelId), 'agoraChannelName', credentials.agoraChannelName),
        redis.hDel(voiceMetaKey(channelId), 'emptySince'),
      ])
      await this.refreshRedisTtl(redis, channelId)
      const state = await this.serializeRedis(redis, channelId)
      return { credentials, participant, state, joined: !previous }
    }

    const session = this.getOrCreateSession(channelId)
    for (const [candidateId, participant] of session.participants.entries()) {
      if (candidateId !== id && participant.userId === userId) {
        session.participants.delete(candidateId)
      }
    }
    const previous = session.participants.get(id) ?? null
    const participant = this.buildParticipant(
      channelId,
      id,
      userId,
      credentials,
      user,
      options,
      previous,
      now,
    )
    session.emptySince = null
    session.participants.set(id, participant)
    return { credentials, participant, state: this.serialize(session), joined: !previous }
  }

  private buildParticipant(
    channelId: string,
    id: string,
    userId: string,
    credentials: VoiceChannelCredentials,
    user: Awaited<ReturnType<UserDao['findById']>>,
    options: JoinOptions,
    previous: VoiceParticipant | null,
    now: string,
  ): VoiceParticipant {
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 })
    }
    return {
      id,
      channelId,
      userId,
      uid: credentials.uid,
      screenUid: credentials.screenUid,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isBot: user.isBot ?? false,
      isMuted: options.muted ?? previous?.isMuted ?? false,
      isDeafened: options.deafened ?? previous?.isDeafened ?? false,
      isSpeaking: previous?.isSpeaking ?? false,
      isScreenSharing: previous?.isScreenSharing ?? false,
      joinedAt: previous?.joinedAt ?? now,
      updatedAt: now,
      clientId: options.clientId ?? previous?.clientId ?? null,
    }
  }

  async leave(actor: ActorInput, channelId: string, options: ParticipantSelector = {}) {
    const userId = actorUserId(actor)
    await this.requireVoiceChannel(actor, channelId)
    const redis = await this.redis()
    if (redis) {
      const rawParticipants = await redis.hGetAll(voiceParticipantsKey(channelId))
      const candidates = Object.entries(rawParticipants)
        .map(([id, raw]) => [id, parseParticipant(raw)] as const)
        .filter(([, participant]) => participant?.userId === userId)
      const selected =
        options.clientId !== undefined
          ? candidates.filter(([id]) => id === participantId(userId, options.clientId))
          : candidates
      const ids = selected.map(([id]) => id)
      if (ids.length > 0) {
        await redis.hDel(voiceParticipantsKey(channelId), ids)
      }
      const state = await this.serializeRedis(redis, channelId)
      return { participant: selected[0]?.[1] ?? null, state, left: ids.length > 0 }
    }

    const session = this.sessions.get(channelId)
    if (!session) return { participant: null, state: this.emptyState(channelId), left: false }
    const candidates = [...session.participants.entries()].filter(
      ([, participant]) => participant.userId === userId,
    )
    const selected =
      options.clientId !== undefined
        ? candidates.filter(([id]) => id === participantId(userId, options.clientId))
        : candidates
    for (const [id] of selected) {
      session.participants.delete(id)
    }
    if (session.participants.size === 0) {
      session.emptySince = Date.now()
    }
    return {
      participant: selected[0]?.[1] ?? null,
      state: this.serialize(session),
      left: selected.length > 0,
    }
  }

  async updateParticipant(
    actor: ActorInput,
    channelId: string,
    patch: Partial<
      Pick<VoiceParticipant, 'isMuted' | 'isDeafened' | 'isSpeaking' | 'isScreenSharing'>
    >,
    options: ParticipantSelector = {},
  ) {
    const userId = actorUserId(actor)
    await this.requireVoiceChannel(actor, channelId)
    const redis = await this.redis()
    if (redis) {
      const [id, current] = await this.findCurrentRedisParticipant(
        redis,
        channelId,
        userId,
        options,
      )
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
      await redis.hSet(voiceParticipantsKey(channelId), id, JSON.stringify(next))
      await this.refreshRedisTtl(redis, channelId)
      return { participant: next, state: await this.serializeRedis(redis, channelId) }
    }

    const session = this.getOrCreateSession(channelId)
    const [id, current] = this.findCurrentMemoryParticipant(session, userId, options)
    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    session.participants.set(id, next)
    return { participant: next, state: this.serialize(session) }
  }

  private async findCurrentRedisParticipant(
    redis: RedisClientType,
    channelId: string,
    userId: string,
    options: ParticipantSelector,
  ): Promise<[string, VoiceParticipant]> {
    const rawParticipants = await redis.hGetAll(voiceParticipantsKey(channelId))
    const candidates = Object.entries(rawParticipants)
      .map(([id, raw]) => [id, parseParticipant(raw)] as const)
      .filter(([, participant]) => participant?.userId === userId)
    const selected =
      options.clientId !== undefined
        ? candidates.find(([id]) => id === participantId(userId, options.clientId))
        : candidates.length === 1
          ? candidates[0]
          : null
    if (!selected?.[1]) {
      throw Object.assign(new Error('Not connected to this voice channel'), {
        status: 409,
        code: 'VOICE_NOT_CONNECTED',
      })
    }
    return [selected[0], selected[1]]
  }

  private findCurrentMemoryParticipant(
    session: ChannelSession,
    userId: string,
    options: ParticipantSelector,
  ): [string, VoiceParticipant] {
    const candidates = [...session.participants.entries()].filter(
      ([, participant]) => participant.userId === userId,
    )
    const selected =
      options.clientId !== undefined
        ? candidates.find(([id]) => id === participantId(userId, options.clientId))
        : candidates.length === 1
          ? candidates[0]
          : null
    if (!selected) {
      throw Object.assign(new Error('Not connected to this voice channel'), {
        status: 409,
        code: 'VOICE_NOT_CONNECTED',
      })
    }
    return selected
  }

  async heartbeat(actor: ActorInput, channelId: string, options: ParticipantSelector = {}) {
    return this.updateParticipant(actor, channelId, {}, options)
  }

  async getState(actor: ActorInput, channelId: string) {
    await this.requireVoiceChannel(actor, channelId)
    const redis = await this.redis()
    if (redis) return this.serializeRedis(redis, channelId)

    this.cleanupStaleParticipants()
    const session = this.sessions.get(channelId)
    return session ? this.serialize(session) : this.emptyState(channelId)
  }

  cleanupStaleParticipants() {
    const now = Date.now()
    for (const session of this.sessions.values()) {
      for (const participant of session.participants.values()) {
        if (now - new Date(participant.updatedAt).getTime() > STALE_PARTICIPANT_MS) {
          this.deps.logger.info(
            {
              channelId: session.channelId,
              userId: participant.userId,
              participantId: participant.id,
            },
            'Voice participant timed out',
          )
          session.participants.delete(participant.id)
        }
      }
      if (session.participants.size === 0 && !session.emptySince) {
        session.emptySince = now
      }
      if (session.emptySince && now - session.emptySince > EMPTY_GRACE_MS) {
        this.sessions.delete(session.channelId)
      }
    }
  }

  emptyState(channelId: string): VoiceChannelState {
    return {
      channelId,
      agoraChannelName: this.agoraChannelName(channelId),
      participants: [],
      participantCount: 0,
      emptySince: null,
      graceEndsAt: null,
    }
  }
}
