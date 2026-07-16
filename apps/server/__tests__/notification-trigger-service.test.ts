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

  it('dispatches Space App approval requests with actionable metadata', async () => {
    await service.triggerSpaceAppCommandApprovalRequest({
      ownerId: 'owner-1',
      requesterId: 'bot-1',
      requesterName: 'Strategy Buddy',
      serverId: 'server-1',
      serverName: 'Shadow Plays',
      spaceAppId: 'app-1',
      appKey: 'shadow-cat',
      appName: 'Cloud Cat',
      commandName: 'feed',
      commandTitle: 'Feed cats',
      permission: 'cat.feed',
      action: 'write',
      dataClass: 'server-private',
      subjectKind: 'buddy',
      buddyAgentId: 'agent-1',
      approvalMode: 'first_time',
      channelId: 'channel-1',
    })

    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        type: 'system',
        kind: 'space_app.command_approval_requested',
        referenceId: 'app-1',
        referenceType: 'space_app_command_approval',
        senderId: 'bot-1',
        scopeServerId: 'server-1',
        scopeChannelId: 'channel-1',
        aggregationKey: 'space-app-command-approval:owner-1:server-1:shadow-cat:feed:agent-1',
        delivery: expect.objectContaining({
          aggregate: true,
          bypassPreferences: true,
        }),
        metadata: expect.objectContaining({
          appKey: 'shadow-cat',
          commandName: 'feed',
          buddyAgentId: 'agent-1',
          approvalMode: 'first_time',
        }),
      }),
    )
  })

  it('dispatches Space App approval grants to the approved subject', async () => {
    await service.triggerSpaceAppCommandApprovalGranted({
      userId: 'bot-1',
      reviewerId: 'owner-1',
      serverId: 'server-1',
      serverName: 'Shadow Plays',
      spaceAppId: 'app-1',
      appKey: 'shadow-cat',
      appName: 'Cloud Cat',
      commandName: 'feed',
      commandTitle: 'Feed cats',
      permission: 'cat.feed',
      action: 'write',
      dataClass: 'server-private',
      subjectKind: 'buddy',
      buddyAgentId: 'agent-1',
    })

    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'bot-1',
        type: 'system',
        kind: 'space_app.command_approval_granted',
        referenceId: 'app-1',
        referenceType: 'space_app',
        senderId: 'owner-1',
        scopeServerId: 'server-1',
        delivery: expect.objectContaining({
          aggregate: false,
          bypassPreferences: true,
        }),
        metadata: expect.objectContaining({
          appKey: 'shadow-cat',
          commandName: 'feed',
          subjectKind: 'buddy',
          buddyAgentId: 'agent-1',
        }),
      }),
    )
  })
})
