import { RtcRole, RtcTokenBuilder } from 'agora-access-token'

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

  /**
   * Generate RTC connection info for a buddy/agent joining a voice channel.
   *
   * The server assigns a unique UID and generates a time-limited token,
   * so the buddy doesn't need to know any vendor-specific configuration.
   */
  generateConnectionInfo(channelId: string, userId: string): RtcConnectionInfo {
    // Generate deterministic but unique UID from userId + channelId
    const seed = `${userId}:${channelId}:${Date.now()}`
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i)
      hash = ((hash << 5) - hash + char) | 0
    }
    // Ensure positive number and within RTC UID range (1 to 2^32-1, excluding 0)
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
      expireAt: privilegeExpireTimestamp * 1000, // Convert to milliseconds
    }
  }

  /**
   * Get the RTC App ID (for health check / config verification)
   */
  getAppId(): string {
    return this.appId
  }
}
