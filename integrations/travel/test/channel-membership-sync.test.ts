import { describe, expect, it, vi } from 'vitest'
import { ChannelMembershipSyncService } from '../server/src/services/channel-membership-sync.service.js'

describe('trip member channel reconciliation', () => {
  it('uses only persisted trip members and stores the deduplicated private channel', async () => {
    const recruitment = {
      id: 'recruitment_1',
      serverId: 'space_1',
      tripId: 'trip_1',
      status: 'open',
      maxMembers: 4,
      flexibleDates: false,
      currency: 'CNY',
      styles: [],
      questions: [],
      requiresApproval: true,
      createdAt: '2026-07-12T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z',
    } as const
    const recruitmentDao = {
      findByTrip: vi.fn().mockResolvedValue(recruitment),
      upsertRecruitment: vi.fn().mockImplementation(async (value) => value),
      listForChannelReconciliation: vi.fn().mockResolvedValue([recruitment]),
    }
    const tripDao = {
      findTrip: vi.fn().mockResolvedValue({ id: 'trip_1', serverId: 'space_1', title: '川西秋游' }),
      listMembers: vi
        .fn()
        .mockResolvedValue([
          { id: 'member_1', userId: 'user_1' },
          { id: 'member_2', userId: 'user_2' },
          { id: 'guest_without_account' },
        ]),
    }
    const shadowGateway = {
      ensureTripMemberChannel: vi.fn().mockResolvedValue({
        channelId: 'channel_trip_1',
        name: '旅行-川西秋游',
      }),
    }
    const service = new ChannelMembershipSyncService(
      recruitmentDao as never,
      tripDao as never,
      shadowGateway as never,
    )

    await service.syncTrip({ launch: { token: 'launch-token' } } as never, 'trip_1')

    expect(shadowGateway.ensureTripMemberChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        memberUserIds: ['user_1', 'user_2'],
        serverId: 'space_1',
        tripId: 'trip_1',
      }),
      expect.objectContaining({ launch: { token: 'launch-token' } }),
    )
    expect(recruitmentDao.upsertRecruitment).toHaveBeenCalledWith(
      expect.objectContaining({ memberChannelId: 'channel_trip_1' }),
    )
  })
})
