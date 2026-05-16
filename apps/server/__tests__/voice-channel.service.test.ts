import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoiceChannelService } from '../src/services/voice-channel.service'

describe('VoiceChannelService', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.AGORA_APP_ID = 'test-agora-app'
    process.env.AGORA_APP_CERTIFICATE = '0123456789abcdef0123456789abcdef'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  function createService(channelType: 'text' | 'voice' = 'voice') {
    return new VoiceChannelService({
      channelDao: {} as never,
      userDao: {
        findById: vi.fn().mockResolvedValue({
          id: '11111111-1111-1111-1111-111111111111',
          username: 'voice-user',
          displayName: 'Voice User',
          avatarUrl: null,
          isBot: false,
        }),
      } as never,
      policyService: {
        requireChannelRead: vi.fn().mockResolvedValue({
          channel: {
            id: '22222222-2222-2222-2222-222222222222',
            kind: 'server',
            serverId: '33333333-3333-3333-3333-333333333333',
            type: channelType,
          },
        }),
      } as never,
      logger: { info: vi.fn() } as never,
    })
  }

  it('issues Agora credentials for a readable voice channel', async () => {
    const service = createService()

    const result = await service.join(
      {
        kind: 'user',
        userId: '11111111-1111-1111-1111-111111111111',
        authMethod: 'jwt',
        scopes: [],
      },
      '22222222-2222-2222-2222-222222222222',
    )

    expect(result.credentials.appId).toBe('test-agora-app')
    expect(result.credentials.token).toMatch(/^006/)
    expect(result.participant.username).toBe('voice-user')
    expect(result.state.participantCount).toBe(1)
  })

  it('rejects non-voice channels', async () => {
    const service = createService('text')

    await expect(
      service.issueCredentials(
        {
          kind: 'user',
          userId: '11111111-1111-1111-1111-111111111111',
          authMethod: 'jwt',
          scopes: [],
        },
        '22222222-2222-2222-2222-222222222222',
      ),
    ).rejects.toMatchObject({ code: 'VOICE_CHANNEL_REQUIRED' })
  })
})
