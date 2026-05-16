import type AgoraRTCDefault from 'agora-rtc-sdk-ng'
import type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  ILocalAudioTrack,
  IRemoteAudioTrack,
  IRemoteVideoTrack,
} from 'agora-rtc-sdk-ng'
import type { ShadowClient } from './client'
import type { ShadowVoiceJoinResult } from './types'

type AgoraRTCModule = typeof AgoraRTCDefault

let cachedAgoraRTC: AgoraRTCModule | null = null

async function loadAgoraRTC(): Promise<AgoraRTCModule> {
  if (cachedAgoraRTC) return cachedAgoraRTC
  try {
    const module = await import('agora-rtc-sdk-ng')
    cachedAgoraRTC = module.default
    return cachedAgoraRTC
  } catch (error) {
    throw new Error(
      `Agora RTC SDK is required for ShadowVoiceConsumer. Install agora-rtc-sdk-ng in this app to use browser voice media. ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function createVoiceClientId() {
  return `shadow-sdk-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
}

export interface ShadowVoiceConsumerOptions {
  client: ShadowClient
  channelId: string
  clientId?: string
  muted?: boolean
  onRemoteAudio?: (input: { uid: string | number; track: IRemoteAudioTrack }) => void
  onRemoteScreen?: (input: { uid: string | number; track: IRemoteVideoTrack }) => void
}

export class ShadowVoiceConsumer {
  private rtc: IAgoraRTCClient | null = null
  private screenRtc: IAgoraRTCClient | null = null
  private audioTrack: ILocalAudioTrack | null = null
  private screenTrack: ICameraVideoTrack | null = null
  private session: ShadowVoiceJoinResult | null = null
  private readonly clientId: string
  private tokenRenewTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private options: ShadowVoiceConsumerOptions) {
    this.clientId = options.clientId ?? createVoiceClientId()
  }

  get joinResult(): ShadowVoiceJoinResult | null {
    return this.session
  }

  async join(): Promise<ShadowVoiceJoinResult> {
    const AgoraRTC = await loadAgoraRTC()
    this.session = await this.options.client.joinVoiceChannel(this.options.channelId, {
      muted: this.options.muted,
      clientId: this.clientId,
    })
    const { credentials } = this.session
    const rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
    this.rtc = rtc
    try {
      this.bindTokenRenewal(rtc)
      rtc.on('user-published', async (user, mediaType) => {
        await rtc.subscribe(user, mediaType)
        if (mediaType === 'audio' && user.audioTrack) {
          this.options.onRemoteAudio?.({ uid: user.uid, track: user.audioTrack })
        }
        if (mediaType === 'video' && user.videoTrack) {
          this.options.onRemoteScreen?.({ uid: user.uid, track: user.videoTrack })
        }
      })
      await rtc.join(
        credentials.appId,
        credentials.agoraChannelName,
        credentials.token,
        credentials.uid,
      )
      this.audioTrack = await AgoraRTC.createMicrophoneAudioTrack()
      await this.audioTrack.setEnabled(!this.options.muted)
      await rtc.publish([this.audioTrack])
      this.scheduleTokenRenewal()
      return this.session
    } catch (error) {
      this.clearTokenRenewal()
      this.audioTrack?.stop()
      this.audioTrack?.close()
      this.audioTrack = null
      await rtc.leave().catch(() => undefined)
      this.rtc = null
      await this.options.client
        .leaveVoiceChannel(this.options.channelId, { clientId: this.clientId })
        .catch(() => undefined)
      this.session = null
      throw error
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.audioTrack?.setEnabled(!muted)
    await this.options.client.updateVoiceState(this.options.channelId, {
      clientId: this.clientId,
      muted,
    })
  }

  async startScreenShare(): Promise<void> {
    if (!this.session || this.screenRtc || this.screenTrack) return
    const { credentials } = this.session
    const AgoraRTC = await loadAgoraRTC()
    const screenRtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
    this.screenRtc = screenRtc
    try {
      this.bindTokenRenewal(screenRtc)
      await screenRtc.join(
        credentials.appId,
        credentials.agoraChannelName,
        credentials.screenToken,
        credentials.screenUid,
      )
      const trackResult = await AgoraRTC.createScreenVideoTrack(
        { encoderConfig: '1080p_1' },
        'disable',
      )
      const screenTrack = Array.isArray(trackResult) ? trackResult[0] : trackResult
      this.screenTrack = screenTrack as ICameraVideoTrack
      await screenRtc.publish([this.screenTrack])
      await this.options.client.updateVoiceState(this.options.channelId, {
        clientId: this.clientId,
        screenSharing: true,
      })
    } catch (error) {
      this.screenTrack?.stop()
      this.screenTrack?.close()
      this.screenTrack = null
      await screenRtc.leave().catch(() => undefined)
      this.screenRtc = null
      await this.options.client
        .updateVoiceState(this.options.channelId, {
          clientId: this.clientId,
          screenSharing: false,
        })
        .catch(() => undefined)
      throw error
    }
  }

  async stopScreenShare(): Promise<void> {
    this.screenTrack?.stop()
    this.screenTrack?.close()
    this.screenTrack = null
    await this.screenRtc?.leave()
    this.screenRtc = null
    await this.options.client.updateVoiceState(this.options.channelId, {
      clientId: this.clientId,
      screenSharing: false,
    })
  }

  async leave(): Promise<void> {
    this.clearTokenRenewal()
    await this.stopScreenShare()
    this.audioTrack?.stop()
    this.audioTrack?.close()
    this.audioTrack = null
    await this.rtc?.leave()
    this.rtc = null
    await this.options.client.leaveVoiceChannel(this.options.channelId, { clientId: this.clientId })
    this.session = null
  }

  private bindTokenRenewal(rtc: IAgoraRTCClient) {
    rtc.on('token-privilege-will-expire', () => {
      void this.renewTokens()
    })
    rtc.on('token-privilege-did-expire', () => {
      void this.renewTokens()
    })
  }

  private scheduleTokenRenewal() {
    this.clearTokenRenewal()
    const expiresAt = this.session?.credentials.expiresAt
    if (!expiresAt) return
    const renewAt = new Date(expiresAt).getTime() - 5 * 60_000
    const delay = Math.max(30_000, renewAt - Date.now())
    this.tokenRenewTimer = setTimeout(() => {
      void this.renewTokens()
    }, delay)
  }

  private clearTokenRenewal() {
    if (this.tokenRenewTimer) {
      clearTimeout(this.tokenRenewTimer)
      this.tokenRenewTimer = null
    }
  }

  private async renewTokens() {
    if (!this.session) return
    const result = await this.options.client.renewVoiceCredentials(this.options.channelId, {
      clientId: this.clientId,
    })
    this.session = {
      ...this.session,
      credentials: result.credentials,
      state: result.state,
    }
    if (result.credentials.token) {
      await this.rtc?.renewToken?.(result.credentials.token)
    }
    if (result.credentials.screenToken) {
      await this.screenRtc?.renewToken?.(result.credentials.screenToken)
    }
    this.scheduleTokenRenewal()
  }
}
