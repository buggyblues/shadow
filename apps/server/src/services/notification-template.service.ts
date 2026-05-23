export type NotificationKind =
  | 'message.mention'
  | 'message.reply'
  | 'dm.message'
  | 'channel.access_requested'
  | 'channel.access_approved'
  | 'channel.access_rejected'
  | 'channel.member_added'
  | 'server.access_requested'
  | 'server.access_approved'
  | 'server.access_rejected'
  | 'server.member_joined'
  | 'server.invite'
  | 'friendship.request'
  | 'recharge.succeeded'
  | 'commerce.purchase_completed'
  | 'commerce.order_shipped'
  | 'commerce.renewal_failed'
  | 'commerce.subscription_cancelled'
  | 'commerce.refund_issued'
  | 'commerce.force_majeure_decided'
  | 'server_app.command_approval_requested'
  | 'server_app.command_approval_granted'
  | 'system.generic'

type TemplateMetadata = Record<string, unknown>

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function preview(value: unknown, max = 200): string | undefined {
  const raw = text(value)
  if (!raw) return undefined
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw
}

export class NotificationTemplateService {
  render(input: {
    kind: NotificationKind | string
    metadata?: TemplateMetadata | null
    aggregatedCount?: number | null
    fallbackTitle?: string
    fallbackBody?: string | null
  }): { title: string; body?: string | null } {
    const metadata = input.metadata ?? {}
    const count = Math.max(input.aggregatedCount ?? 1, 1)
    const actorName = text(metadata.actorName, 'Someone')
    const channelName = text(metadata.channelName, 'channel')
    const serverName = text(metadata.serverName, 'server')
    const productName = text(metadata.productName, 'service')
    const appName = text(metadata.appName, 'App')
    const commandTitle = text(metadata.commandTitle, text(metadata.commandName, 'command'))

    switch (input.kind) {
      case 'message.mention':
        return {
          title: count > 1 ? `${count} new mentions` : `${actorName} mentioned you`,
          body: preview(metadata.preview) ?? input.fallbackBody,
        }
      case 'message.reply':
        return {
          title: count > 1 ? `${count} new replies` : `${actorName} replied to you`,
          body: preview(metadata.preview) ?? input.fallbackBody,
        }
      case 'dm.message':
        return {
          title: count > 1 ? `${count} new direct messages` : `${actorName} sent you a message`,
          body: preview(metadata.preview) ?? input.fallbackBody,
        }
      case 'channel.access_requested':
        return {
          title: `${actorName} requested access to #${channelName}`,
          body: input.fallbackBody ?? 'Review the private channel access request.',
        }
      case 'channel.access_approved':
        return { title: `Access approved for #${channelName}`, body: input.fallbackBody }
      case 'channel.access_rejected':
        return { title: `Access declined for #${channelName}`, body: input.fallbackBody }
      case 'channel.member_added':
        return { title: `You have been added to #${channelName}`, body: input.fallbackBody }
      case 'server.access_requested':
        return {
          title: `${actorName} requested access to ${serverName}`,
          body: input.fallbackBody ?? 'Review the private server access request.',
        }
      case 'server.access_approved':
        return { title: `Access approved for ${serverName}`, body: input.fallbackBody }
      case 'server.access_rejected':
        return { title: `Access declined for ${serverName}`, body: input.fallbackBody }
      case 'server.member_joined':
        return {
          title:
            count > 1
              ? `${count} people joined ${serverName}`
              : `${actorName} joined ${serverName}`,
          body: input.fallbackBody,
        }
      case 'server.invite':
        return { title: `${actorName} invited you to join ${serverName}`, body: input.fallbackBody }
      case 'friendship.request':
        return { title: `${actorName} sent you a friend request`, body: input.fallbackBody }
      case 'recharge.succeeded':
        return {
          title: 'Recharge succeeded',
          body: input.fallbackBody ?? preview(metadata.preview) ?? undefined,
        }
      case 'commerce.purchase_completed':
        return {
          title: 'Purchase completed',
          body: input.fallbackBody ?? `${productName} is now active.`,
        }
      case 'commerce.order_shipped':
        return {
          title: 'Order shipped',
          body:
            input.fallbackBody ??
            `${productName} has been shipped${text(metadata.trackingNo) ? ` (${text(metadata.trackingNo)})` : ''}.`,
        }
      case 'commerce.renewal_failed':
        return {
          title: 'Subscription renewal failed',
          body: input.fallbackBody ?? `${productName} will not renew when it expires.`,
        }
      case 'commerce.subscription_cancelled':
        return {
          title: 'Subscription cancelled',
          body: input.fallbackBody ?? `${productName} was cancelled and refund processing started.`,
        }
      case 'commerce.refund_issued':
        return {
          title: 'Refund issued',
          body: input.fallbackBody ?? preview(metadata.preview) ?? undefined,
        }
      case 'commerce.force_majeure_decided':
        return {
          title: 'Entitlement review decided',
          body: input.fallbackBody ?? preview(metadata.preview) ?? undefined,
        }
      case 'server_app.command_approval_requested':
        return {
          title: `${appName} command needs approval`,
          body:
            input.fallbackBody ?? `${commandTitle} is waiting for your approval in ${serverName}.`,
        }
      case 'server_app.command_approval_granted':
        return {
          title: `${appName} command approved`,
          body: input.fallbackBody ?? `${commandTitle} can now run in ${serverName}.`,
        }
      default:
        return {
          title: input.fallbackTitle ?? text(metadata.title, 'Notification'),
          body: input.fallbackBody ?? preview(metadata.body),
        }
    }
  }
}
