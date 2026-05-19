import type { NotificationService, NotificationType } from './notification.service'
import type { NotificationPlatformService } from './notification-platform.service'
import type { NotificationKind, NotificationTemplateService } from './notification-template.service'

type NotificationMetadata = Record<string, unknown>

interface DispatchInput {
  userId: string
  type: NotificationType
  kind: NotificationKind | string
  fallbackTitle?: string
  fallbackBody?: string | null
  referenceId?: string | null
  referenceType?: string | null
  senderId?: string | null
  scopeServerId?: string | null
  scopeChannelId?: string | null
  aggregationKey?: string | null
  aggregate?: boolean
  bypassPreferences?: boolean
  metadata?: NotificationMetadata | null
}

export class NotificationTriggerService {
  constructor(
    private deps: {
      notificationService: NotificationService
      notificationTemplateService: NotificationTemplateService
      notificationPlatformService: NotificationPlatformService
    },
  ) {}

  async dispatch(input: DispatchInput) {
    const rendered = this.deps.notificationTemplateService.render({
      kind: input.kind,
      metadata: input.metadata,
      fallbackTitle: input.fallbackTitle,
      fallbackBody: input.fallbackBody,
    })
    const notification = await this.deps.notificationService.create({
      userId: input.userId,
      type: input.type,
      kind: input.kind,
      title: rendered.title,
      body: rendered.body,
      referenceId: input.referenceId,
      referenceType: input.referenceType,
      senderId: input.senderId,
      scopeServerId: input.scopeServerId,
      scopeChannelId: input.scopeChannelId,
      aggregationKey: input.aggregationKey,
      metadata: input.metadata,
      delivery: {
        aggregate: input.aggregate,
        bypassPreferences: input.bypassPreferences,
      },
    })
    await this.deps.notificationPlatformService.deliver(notification, {
      source: 'notification-trigger',
      bypassPreferences: input.bypassPreferences,
    })
    return notification
  }

  async triggerCommerceRenewalFailed(input: {
    userId: string
    entitlementId: string
    productName?: string | null
    expiresAt?: Date | null
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'system',
      kind: 'commerce.renewal_failed',
      referenceId: input.entitlementId,
      referenceType: 'entitlement',
      aggregate: false,
      bypassPreferences: true,
      metadata: {
        productName: input.productName,
        expiresAt: input.expiresAt?.toISOString(),
      },
    })
  }

  async triggerCommercePurchaseCompleted(input: {
    userId: string
    orderId: string
    orderNo: string
    productName?: string | null
    entitlementId?: string | null
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'system',
      kind: 'commerce.purchase_completed',
      referenceId: input.orderId,
      referenceType: 'order',
      aggregate: false,
      bypassPreferences: true,
      metadata: {
        orderNo: input.orderNo,
        productName: input.productName,
        entitlementId: input.entitlementId,
      },
    })
  }

  async triggerCommerceOrderShipped(input: {
    userId: string
    orderId: string
    orderNo: string
    productName?: string | null
    entitlementId?: string | null
    trackingNo?: string | null
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'system',
      kind: 'commerce.order_shipped',
      referenceId: input.orderId,
      referenceType: 'order',
      aggregationKey: `commerce:order-shipped:${input.orderId}`,
      aggregate: false,
      bypassPreferences: false,
      metadata: {
        orderNo: input.orderNo,
        productName: input.productName,
        entitlementId: input.entitlementId,
        trackingNo: input.trackingNo,
      },
    })
  }

  async triggerCommerceSubscriptionCancelled(input: {
    userId: string
    entitlementId: string
    refundAmount: number
    productName?: string | null
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'system',
      kind: 'commerce.subscription_cancelled',
      referenceId: input.entitlementId,
      referenceType: 'entitlement',
      aggregate: false,
      bypassPreferences: true,
      metadata: {
        productName: input.productName,
        refundAmount: input.refundAmount,
      },
    })
  }

  async dispatchMany(inputs: DispatchInput[]) {
    const notifications = await Promise.all(inputs.map((input) => this.dispatch(input)))
    return notifications.filter((notification) => Boolean(notification))
  }

  async triggerMention(input: {
    userId: string
    actorId: string
    actorName: string
    messageId: string
    channelId: string
    serverId: string
    channelName?: string | null
    serverName?: string | null
    preview: string
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'mention',
      kind: 'message.mention',
      referenceId: input.messageId,
      referenceType: 'message',
      senderId: input.actorId,
      scopeServerId: input.serverId,
      scopeChannelId: input.channelId,
      aggregationKey: `mention:${input.userId}:${input.channelId}`,
      metadata: {
        actorName: input.actorName,
        channelName: input.channelName,
        serverName: input.serverName,
        preview: input.preview,
      },
    })
  }

  async triggerReply(input: {
    userId: string
    actorId: string
    actorName: string
    messageId: string
    channelId: string
    serverId?: string | null
    channelName?: string | null
    preview: string
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'reply',
      kind: 'message.reply',
      referenceId: input.messageId,
      referenceType: 'message',
      senderId: input.actorId,
      scopeServerId: input.serverId,
      scopeChannelId: input.channelId,
      aggregationKey: `reply:${input.userId}:${input.channelId}`,
      metadata: {
        actorName: input.actorName,
        channelName: input.channelName,
        preview: input.preview,
      },
    })
  }

  async triggerDirectMessage(input: {
    userId: string
    actorId: string
    actorName: string
    channelId: string
    preview: string
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'dm',
      kind: 'dm.message',
      referenceId: input.channelId,
      referenceType: 'channel',
      senderId: input.actorId,
      scopeChannelId: input.channelId,
      aggregationKey: `direct:${input.userId}:${input.channelId}`,
      metadata: {
        actorName: input.actorName,
        preview: input.preview,
      },
    })
  }

  async triggerChannelAccessRequest(input: {
    reviewerIds: string[]
    requesterId: string
    requesterName: string
    requestId: string
    channelId: string
    channelName: string
    serverId: string
    serverName?: string | null
  }) {
    return this.dispatchMany(
      input.reviewerIds
        .filter((reviewerId) => reviewerId !== input.requesterId)
        .map((reviewerId) => ({
          userId: reviewerId,
          type: 'system' as const,
          kind: 'channel.access_requested',
          referenceId: input.requestId,
          referenceType: 'channel_join_request',
          senderId: input.requesterId,
          scopeServerId: input.serverId,
          scopeChannelId: input.channelId,
          aggregate: false,
          bypassPreferences: true,
          metadata: {
            actorName: input.requesterName,
            channelName: input.channelName,
            serverName: input.serverName,
            requestId: input.requestId,
          },
        })),
    )
  }

  async triggerChannelAccessDecision(input: {
    userId: string
    reviewerId: string
    approved: boolean
    channelId: string
    channelName: string
    serverId: string
    serverName?: string | null
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'system',
      kind: input.approved ? 'channel.access_approved' : 'channel.access_rejected',
      referenceId: input.channelId,
      referenceType: 'channel_invite',
      senderId: input.reviewerId,
      scopeServerId: input.serverId,
      scopeChannelId: input.channelId,
      aggregate: false,
      bypassPreferences: true,
      metadata: {
        channelName: input.channelName,
        serverName: input.serverName,
        approved: input.approved,
      },
    })
  }

  async triggerServerAccessRequest(input: {
    reviewerIds: string[]
    requesterId: string
    requesterName: string
    requestId: string
    serverId: string
    serverName: string
  }) {
    return this.dispatchMany(
      input.reviewerIds
        .filter((reviewerId) => reviewerId !== input.requesterId)
        .map((reviewerId) => ({
          userId: reviewerId,
          type: 'system' as const,
          kind: 'server.access_requested',
          referenceId: input.requestId,
          referenceType: 'server_join_request',
          senderId: input.requesterId,
          scopeServerId: input.serverId,
          aggregate: false,
          bypassPreferences: true,
          metadata: {
            actorName: input.requesterName,
            serverName: input.serverName,
            requestId: input.requestId,
          },
        })),
    )
  }

  async triggerServerAccessDecision(input: {
    userId: string
    reviewerId: string
    approved: boolean
    serverId: string
    serverName: string
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'system',
      kind: input.approved ? 'server.access_approved' : 'server.access_rejected',
      referenceId: input.serverId,
      referenceType: 'server_join',
      senderId: input.reviewerId,
      scopeServerId: input.serverId,
      aggregate: false,
      bypassPreferences: true,
      metadata: {
        serverName: input.serverName,
        approved: input.approved,
      },
    })
  }

  async triggerChannelMemberAdded(input: {
    userId: string
    actorId: string
    channelId: string
    channelName: string
    serverId: string
    serverName?: string | null
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'system',
      kind: 'channel.member_added',
      referenceId: input.channelId,
      referenceType: 'channel_invite',
      senderId: input.actorId,
      scopeServerId: input.serverId,
      scopeChannelId: input.channelId,
      aggregate: false,
      metadata: {
        channelName: input.channelName,
        serverName: input.serverName,
      },
    })
  }

  async triggerServerMemberJoined(input: {
    ownerId: string
    actorId: string
    actorName: string
    serverId: string
    serverName: string
  }) {
    return this.dispatch({
      userId: input.ownerId,
      type: 'system',
      kind: 'server.member_joined',
      referenceId: input.serverId,
      referenceType: 'server_join',
      senderId: input.actorId,
      scopeServerId: input.serverId,
      aggregationKey: `server-member-joined:${input.ownerId}:${input.serverId}`,
      metadata: {
        actorName: input.actorName,
        serverName: input.serverName,
      },
    })
  }

  async triggerServerInvite(input: {
    userId: string
    actorId: string
    actorName: string
    serverId: string
    serverName: string
    inviteCode?: string | null
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'system',
      kind: 'server.invite',
      referenceId: input.serverId,
      referenceType: 'server_invite',
      senderId: input.actorId,
      scopeServerId: input.serverId,
      aggregate: false,
      metadata: {
        actorName: input.actorName,
        serverName: input.serverName,
        inviteCode: input.inviteCode,
        serverId: input.serverId,
      },
    })
  }

  async triggerFriendRequest(input: {
    userId: string
    actorId: string
    actorName: string
    friendshipId: string
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'system',
      kind: 'friendship.request',
      referenceId: input.friendshipId,
      referenceType: 'friendship',
      senderId: input.actorId,
      aggregate: false,
      metadata: {
        actorName: input.actorName,
      },
    })
  }

  async triggerRechargeSucceeded(input: {
    userId: string
    orderId: string
    orderNo: string
    shrimpCoins: number
    newBalance: number
  }) {
    return this.dispatch({
      userId: input.userId,
      type: 'system',
      kind: 'recharge.succeeded',
      referenceId: input.orderId,
      referenceType: 'payment_order',
      aggregate: false,
      bypassPreferences: true,
      metadata: {
        orderNo: input.orderNo,
        shrimpCoins: input.shrimpCoins,
        newBalance: input.newBalance,
        preview: `${input.shrimpCoins} shrimp coins have arrived`,
      },
    })
  }
}
