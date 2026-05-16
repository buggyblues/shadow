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
      logger: { info: vi.fn(), warn: vi.fn() } as never,
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
    expect(result.participant.id).toBe('11111111-1111-1111-1111-111111111111:default')
    expect(result.participant.username).toBe('voice-user')
    expect(result.state.participantCount).toBe(1)
  })

  it('keeps separate participants for the same user on different clients', async () => {
    const service = createService()
    const actor = {
      kind: 'user',
      userId: '11111111-1111-1111-1111-111111111111',
      authMethod: 'jwt',
      scopes: [],
    } as const
    const channelId = '22222222-2222-2222-2222-222222222222'

    const first = await service.join(actor, channelId, { clientId: 'web' })
    const second = await service.join(actor, channelId, { clientId: 'cli' })
    const updated = await service.updateParticipant(
      actor,
      channelId,
      { isMuted: true },
      {
        clientId: 'web',
      },
    )
    const left = await service.leave(actor, channelId, { clientId: 'web' })

    expect(first.participant.id).not.toBe(second.participant.id)
    expect(first.credentials.uid).not.toBe(second.credentials.uid)
    expect(second.state.participantCount).toBe(2)
    expect(updated.participant.id).toBe(first.participant.id)
    expect(left.left).toBe(true)
    expect(left.state.participantCount).toBe(1)
    expect(left.state.participants[0]?.id).toBe(second.participant.id)
  })

  it('renews credentials without changing voice presence', async () => {
    const service = createService()
    const actor = {
      kind: 'user',
      userId: '11111111-1111-1111-1111-111111111111',
      authMethod: 'jwt',
      scopes: [],
    } as const
    const channelId = '22222222-2222-2222-2222-222222222222'

    await service.join(actor, channelId, { clientId: 'web' })
    const renewed = await service.renewCredentials(actor, channelId, { clientId: 'web' })

    expect(renewed.credentials.uid).toBeTruthy()
    expect(renewed.state.participantCount).toBe(1)
    expect(renewed.state.participants[0]?.id).toBe('11111111-1111-1111-1111-111111111111:web')
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
