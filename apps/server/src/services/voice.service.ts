import agoraAccessToken from 'agora-access-token'

const { RtcRole, RtcTokenBuilder } = agoraAccessToken

export interface RtcConnectionInfo {
  appId: string
  channelName: string
  uid: number
  token: string
  expireAt: number
}

export class VoiceService {
  private readonly appId: string
  private readonly appCertificate: string
  private readonly tokenExpirationSeconds: number

  constructor() {
    this.appId = process.env.RTC_APP_ID ?? ''
    this.appCertificate = process.env.RTC_APP_CERTIFICATE ?? ''
    this.tokenExpirationSeconds = parseInt(process.env.RTC_TOKEN_EXPIRE_SECONDS ?? '3600', 10)

    if (!this.appId) {
      throw new Error('RTC_APP_ID environment variable is required')
    }
    if (!this.appCertificate) {
      throw new Error('RTC_APP_CERTIFICATE environment variable is required')
    }
  }

  generateConnectionInfo(channelId: string, userId: string): RtcConnectionInfo {
    const seed = `${userId}:${channelId}:${Date.now()}`
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i)
      hash = ((hash << 5) - hash + char) | 0
    }
    const uid = (Math.abs(hash) % (2 ** 31 - 1)) + 1

    const currentTimestamp = Math.floor(Date.now() / 1000)
    const privilegeExpireTimestamp = currentTimestamp + this.tokenExpirationSeconds

    const token = RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.appCertificate,
      channelId,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpireTimestamp,
    )

    return {
      appId: this.appId,
      channelName: channelId,
      uid,
      token,
      expireAt: privilegeExpireTimestamp * 1000,
    }
  }

  getAppId(): string {
    return this.appId
  }
}
