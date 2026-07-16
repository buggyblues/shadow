import type { ShadowGateway } from '../gateways/shadow.gateway.js'
import { createId } from '../lib/id.js'
import type { AccessPolicy } from '../security/access-policy.js'
import type { AttachmentService } from '../services/attachment.service.js'
import type { CollaborationService } from '../services/collaboration.service.js'
import type { RequestContext } from '../types.js'
import type {
  CreateAttachmentInput,
  CreateDecisionRefInput,
  CreateDiscussionRefInput,
  CreateShareLinkInput,
  StartDiscussionInput,
} from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class CollaborationUseCase {
  constructor(
    private readonly collaborationService: CollaborationService,
    private readonly attachmentService: AttachmentService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
    private readonly shadowGateway: ShadowGateway,
  ) {}

  async listAttachments(
    ctx: RequestContext,
    tripId: string,
    subjectType?: string,
    subjectId?: string,
  ) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.attachmentService.listAttachments(tripId, subjectType, subjectId)
  }

  async createAttachment(ctx: RequestContext, tripId: string, input: CreateAttachmentInput) {
    const access = await this.accessPolicy.requireTripWrite(ctx, tripId)
    const attachment = await this.attachmentService.createAttachment(
      ctx,
      tripId,
      input,
      access.member?.id ?? undefined,
    )
    this.eventBus.emit({ type: 'attachment.created', tripId, payload: { attachment } })
    return attachment
  }

  async deleteAttachment(ctx: RequestContext, tripId: string, attachmentId: string) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const attachment = await this.attachmentService.deleteAttachment(tripId, attachmentId)
    this.eventBus.emit({ type: 'attachment.deleted', tripId, payload: { attachmentId } })
    return attachment
  }

  async getAttachmentContent(ctx: RequestContext, tripId: string, attachmentId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.attachmentService.getAttachmentContent(tripId, attachmentId)
  }

  async listShareLinks(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    return this.collaborationService.listShareLinks(tripId)
  }

  async createShareLink(ctx: RequestContext, tripId: string, input: CreateShareLinkInput) {
    const access = await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const result = await this.collaborationService.createShareLink(
      tripId,
      input,
      access.member?.id ?? undefined,
    )
    this.eventBus.emit({ type: 'share.created', tripId, payload: { link: result.link } })
    return result
  }

  async revokeShareLink(ctx: RequestContext, tripId: string, linkId: string) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const link = await this.collaborationService.revokeShareLink(linkId)
    this.eventBus.emit({ type: 'share.revoked', tripId, payload: { link } })
    return link
  }

  async listDiscussionRefs(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.collaborationService.listDiscussionRefs(tripId)
  }

  async createDiscussionRef(ctx: RequestContext, tripId: string, input: CreateDiscussionRefInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const ref = await this.collaborationService.createDiscussionRef(tripId, input)
    this.eventBus.emit({ type: 'discussion.ref.created', tripId, payload: { ref } })
    return ref
  }

  async startDiscussion(ctx: RequestContext, tripId: string, input: StartDiscussionInput) {
    const access = await this.accessPolicy.requireTripWrite(ctx, tripId)
    const existing = (await this.collaborationService.listDiscussionRefs(tripId)).find(
      (ref) =>
        ref.subjectType === input.subjectType &&
        ref.subjectId === input.subjectId &&
        (!input.channelId || ref.channelId === input.channelId) &&
        Boolean(ref.channelId),
    )
    if (existing) return existing
    const channel = await this.shadowGateway.ensureDiscussionChannel(ctx, {
      preferredChannelId: input.channelId,
      tripId,
      tripTitle: access.trip.title,
    })
    const delivery = await this.shadowGateway.shareToChannel(ctx, {
      channelId: channel.id,
      channelName: channel.name,
      idempotencyKey: `travel:discussion:${createId('message')}`,
      content: `💬 ${input.title}${input.body ? `\n${input.body}` : ''}`,
      metadata: {
        cards: [
          {
            type: 'travel.discussion',
            title: input.title,
            description: input.body,
            url: `/shadow/server/trips/${tripId}`,
            data: {
              appKey: 'travel',
              tripId,
              subjectType: input.subjectType,
              subjectId: input.subjectId,
            },
          },
        ],
      },
    })
    const ref = await this.collaborationService.createDiscussionRef(tripId, {
      channelId: delivery.channelId,
      messageId: delivery.messageId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      title: input.title,
    })
    this.eventBus.emit({ type: 'discussion.ref.created', tripId, payload: { ref } })
    return ref
  }

  async listDecisionRefs(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.collaborationService.listDecisionRefs(tripId)
  }

  async createDecisionRef(ctx: RequestContext, tripId: string, input: CreateDecisionRefInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const ref = await this.collaborationService.createDecisionRef(tripId, input)
    this.eventBus.emit({ type: 'decision.ref.created', tripId, payload: { ref } })
    return ref
  }
}
