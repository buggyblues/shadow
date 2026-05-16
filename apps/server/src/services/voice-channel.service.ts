import { createHash } from 'node:crypto'
import * as AgoraAccessToken from 'agora-access-token'
import type { Logger } from 'pino'
import type { ChannelDao } from '../dao/channel.dao'
import type { UserDao } from '../dao/user.dao'
import { type ActorInput, actorUserId } from '../security/actor'
import type { PolicyService } from './policy.service'

const TOKEN_TTL_SECONDS = 60 * 60
const STALE_PARTICIPANT_MS = 90_000
const EMPTY_GRACE_MS = 5 * 60_000

type AgoraAccessTokenModule = typeof AgoraAccessToken & {
  default?: typeof AgoraAccessToken
}

const agoraTokenModule = AgoraAccessToken as AgoraAccessTokenModule
const RtcTokenBuilder =
  agoraTokenModule.RtcTokenBuilder ?? agoraTokenModule.default?.RtcTokenBuilder
const RtcRole = agoraTokenModule.RtcRole ?? agoraTokenModule.default?.RtcRole

export type VoiceParticipant = {
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

type JoinOptions = {
  clientId?: string | null
  muted?: boolean
  deafened?: boolean
}

type ChannelSession = {
  channelId: string
  agoraChannelName: string
  participants: Map<string, VoiceParticipant>
  emptySince: number | null
}

export class VoiceChannelService {
  private sessions = new Map<string, ChannelSession>()

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

  async issueCredentials(actor: ActorInput, channelId: string): Promise<VoiceChannelCredentials> {
    this.assertConfigured()
    await this.requireVoiceChannel(actor, channelId)
    const userId = actorUserId(actor)
    const agoraChannelName = this.agoraChannelName(channelId)
    const uid = this.stableUid(`${channelId}:${userId}:audio`)
    const screenUid = this.stableUid(`${channelId}:${userId}:screen`)
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

  async join(actor: ActorInput, channelId: string, options: JoinOptions = {}) {
    const credentials = await this.issueCredentials(actor, channelId)
    const userId = actorUserId(actor)
    const user = await this.deps.userDao.findById(userId)
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 })
    }

    const now = new Date().toISOString()
    const session = this.getOrCreateSession(channelId)
    const previous = session.participants.get(userId)
    const participant: VoiceParticipant = {
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

    session.emptySince = null
    session.participants.set(userId, participant)
    return { credentials, participant, state: this.serialize(session) }
  }

  async leave(actor: ActorInput, channelId: string) {
    const userId = actorUserId(actor)
    await this.requireVoiceChannel(actor, channelId)
    const session = this.sessions.get(channelId)
    if (!session) return { participant: null, state: this.emptyState(channelId) }
    const participant = session.participants.get(userId) ?? null
    session.participants.delete(userId)
    if (session.participants.size === 0) {
      session.emptySince = Date.now()
    }
    return { participant, state: this.serialize(session) }
  }

  async updateParticipant(
    actor: ActorInput,
    channelId: string,
    patch: Partial<
      Pick<VoiceParticipant, 'isMuted' | 'isDeafened' | 'isSpeaking' | 'isScreenSharing'>
    >,
  ) {
    const userId = actorUserId(actor)
    await this.requireVoiceChannel(actor, channelId)
    const session = this.getOrCreateSession(channelId)
    const current = session.participants.get(userId)
    if (!current) {
      throw Object.assign(new Error('Not connected to this voice channel'), {
        status: 409,
        code: 'VOICE_NOT_CONNECTED',
      })
    }
    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    session.participants.set(userId, next)
    return { participant: next, state: this.serialize(session) }
  }

  async heartbeat(actor: ActorInput, channelId: string) {
    return this.updateParticipant(actor, channelId, {})
  }

  async getState(actor: ActorInput, channelId: string) {
    await this.requireVoiceChannel(actor, channelId)
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
            { channelId: session.channelId, userId: participant.userId },
            'Voice participant timed out',
          )
          session.participants.delete(participant.userId)
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
