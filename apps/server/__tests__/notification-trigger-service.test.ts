import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationTriggerService } from '../src/services/notification-trigger.service'

describe('NotificationTriggerService', () => {
  const notificationService = {
    create: vi.fn(),
  }
  const notificationTemplateService = {
    render: vi.fn(),
  }
  const notificationPlatformService = {
    deliver: vi.fn(),
  }

  let service: NotificationTriggerService

  beforeEach(() => {
    vi.clearAllMocks()
    notificationTemplateService.render.mockReturnValue({
      title: 'Rendered title',
      body: 'Rendered body',
    })
    notificationService.create.mockImplementation(async (input: any) => ({
      id: `notif-${input.userId}`,
      ...input,
    }))
    service = new NotificationTriggerService({
      notificationService: notificationService as any,
      notificationTemplateService: notificationTemplateService as any,
      notificationPlatformService: notificationPlatformService as any,
    })
  })

  it('dispatches channel access requests to reviewers except the requester', async () => {
    const notifications = await service.triggerChannelAccessRequest({
      reviewerIds: ['owner-1', 'requester-1', 'member-1'],
      requesterId: 'requester-1',
      requesterName: 'Alice',
      requestId: 'request-1',
      channelId: 'channel-1',
      channelName: 'ops',
      serverId: 'server-1',
      serverName: 'GStack',
    })

    expect(notifications).toHaveLength(2)
    expect(notificationService.create).toHaveBeenCalledTimes(2)
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        type: 'system',
        kind: 'channel.access_requested',
        referenceId: 'request-1',
        referenceType: 'channel_join_request',
        senderId: 'requester-1',
        scopeServerId: 'server-1',
        scopeChannelId: 'channel-1',
        delivery: expect.objectContaining({
          aggregate: false,
          bypassPreferences: true,
        }),
        metadata: expect.objectContaining({
          actorName: 'Alice',
          channelName: 'ops',
          requestId: 'request-1',
        }),
      }),
    )
    expect(notificationService.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'requester-1' }),
    )
    expect(notificationPlatformService.deliver).toHaveBeenCalledTimes(2)
  })

  it('uses stable scope and aggregation keys for mentions', async () => {
    await service.triggerMention({
      userId: 'target-1',
      actorId: 'actor-1',
      actorName: 'Alice',
      messageId: 'message-1',
      channelId: 'channel-1',
      serverId: 'server-1',
      channelName: 'general',
      serverName: 'GStack',
      preview: 'hello',
    })

    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'target-1',
        type: 'mention',
        kind: 'message.mention',
        referenceId: 'message-1',
        referenceType: 'message',
        scopeServerId: 'server-1',
        scopeChannelId: 'channel-1',
        aggregationKey: 'mention:target-1:channel-1',
      }),
    )
  })

  it('dispatches commerce shipment notifications through platform delivery', async () => {
    await service.triggerCommerceOrderShipped({
      userId: 'buyer-1',
      orderId: 'order-1',
      orderNo: 'SH123',
      productName: 'VIP pass',
      trackingNo: 'TRACK-1',
    })

    expect(notificationTemplateService.render).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'commerce.order_shipped',
        metadata: expect.objectContaining({
          orderNo: 'SH123',
          productName: 'VIP pass',
          trackingNo: 'TRACK-1',
        }),
      }),
    )
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'buyer-1',
        type: 'system',
        kind: 'commerce.order_shipped',
        referenceId: 'order-1',
        referenceType: 'order',
        aggregationKey: 'commerce:order-shipped:order-1',
      }),
    )
    expect(notificationPlatformService.deliver).toHaveBeenCalledTimes(1)
  })
})
