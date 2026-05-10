import { and, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Server as SocketIOServer } from 'socket.io'
import type { WorkspaceNodeDao } from '../dao/workspace-node.dao'
import type { Database } from '../db'
import {
  commerceDeliverables,
  commerceFulfillmentJobs,
  commerceFulfillmentRecords,
} from '../db/schema'
import type { CommunityAssetService } from './community-asset.service'
import type { LedgerService } from './ledger.service'
import type { MessageService } from './message.service'

type FulfillmentJob = typeof commerceFulfillmentJobs.$inferSelect
type CommerceDeliverable = typeof commerceDeliverables.$inferSelect
type FulfillmentResult = {
  resultType: string
  resultId: string | null
  resultMessageId: string | null
}

function errorCode(err: unknown) {
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string'
  ) {
    return (err as { code: string }).code
  }
  return 'COMMERCE_FULFILLMENT_FAILED'
}

function textFromMetadata(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function positiveIntegerFromMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export class CommerceFulfillmentService {
  constructor(
    private deps: {
      db: Database
      messageService: MessageService
      communityAssetService: CommunityAssetService
      ledgerService: LedgerService
      workspaceNodeDao: WorkspaceNodeDao
      io?: SocketIOServer
    },
  ) {}

  private get db() {
    return this.deps.db
  }

  private emit(room: string, event: string, payload: unknown) {
    try {
      this.deps.io?.to(room).emit(event, payload)
    } catch {
      /* io is not registered in some focused service tests */
    }
  }

  private requireDestination(job: FulfillmentJob) {
    if (!job.destinationKind || !job.destinationId) {
      throw Object.assign(new Error('Destination required'), {
        code: 'COMMERCE_FULFILLMENT_DESTINATION_REQUIRED',
      })
    }
    return { kind: job.destinationKind, id: job.destinationId }
  }

  private async sendFulfillmentMessage(
    job: FulfillmentJob,
    senderId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ) {
    const destination = this.requireDestination(job)
    if (destination.kind !== 'channel') {
      throw Object.assign(new Error('Direct message fulfillment destinations must use channel'), {
        code: 'COMMERCE_DM_DESTINATION_REMOVED',
      })
    }
    const message = await this.deps.messageService.send(destination.id, senderId, {
      content,
      metadata,
    })
    this.emit(`channel:${destination.id}`, 'message:new', message)
    return message.id
  }

  private async fulfillPaidFileMessage(
    job: FulfillmentJob,
    deliverable: CommerceDeliverable,
    metadata: Record<string, unknown>,
    senderId: string,
    content: string,
  ): Promise<FulfillmentResult> {
    const file = await this.deps.workspaceNodeDao.findById(deliverable.resourceId)
    if (!file || file.kind !== 'file') {
      throw Object.assign(new Error('Paid file unavailable'), {
        code: 'PAID_FILE_NOT_FOUND',
      })
    }

    const card = {
      id: nanoid(12),
      kind: 'paid_file' as const,
      fileId: file.id,
      entitlementId: job.entitlementId,
      deliverableId: deliverable.id,
      snapshot: {
        name: file.name,
        mime: file.mime,
        sizeBytes: file.sizeBytes,
        previewUrl: file.previewUrl,
        summary: textFromMetadata(metadata, 'summary') ?? null,
      },
      action: { mode: 'open_paid_file' as const },
    }
    const resultMessageId = await this.sendFulfillmentMessage(job, senderId, content, {
      paidFileCards: [card],
      commerceFulfillment: { jobId: job.id, deliverableId: deliverable.id },
    })
    return { resultType: 'message', resultId: resultMessageId, resultMessageId }
  }

  private async fulfillTextMessage(
    job: FulfillmentJob,
    deliverable: CommerceDeliverable,
    senderId: string,
    content: string,
  ): Promise<FulfillmentResult> {
    const resultMessageId = await this.sendFulfillmentMessage(job, senderId, content, {
      commerceFulfillment: { jobId: job.id, deliverableId: deliverable.id },
    })
    return { resultType: 'message', resultId: resultMessageId, resultMessageId }
  }

  private async fulfillCommunityAsset(
    job: FulfillmentJob,
    deliverable: CommerceDeliverable,
    idempotencyKey: string,
  ): Promise<FulfillmentResult> {
    const grant = await this.deps.communityAssetService.grantToUser({
      actor: {
        kind: 'system',
        service: 'commerce-fulfillment',
        capabilities: ['economy:assets:write'],
      },
      ownerUserId: job.buyerId,
      definitionId: deliverable.resourceId,
      sourceKind: 'commerce_fulfillment',
      sourceId: job.id,
      idempotencyKey,
      metadata: { offerDeliverableId: deliverable.id, orderId: job.orderId },
    })
    return { resultType: 'community_asset_grant', resultId: grant.id, resultMessageId: null }
  }

  private async fulfillCurrencyReward(
    job: FulfillmentJob,
    metadata: Record<string, unknown>,
  ): Promise<FulfillmentResult> {
    const amount = positiveIntegerFromMetadata(metadata, 'amount')
    if (amount <= 0) {
      throw Object.assign(new Error('Currency deliverable amount invalid'), {
        code: 'COMMERCE_CURRENCY_DELIVERABLE_INVALID',
      })
    }
    await this.deps.ledgerService.credit({
      userId: job.buyerId,
      amount,
      type: 'reward',
      referenceId: job.id,
      referenceType: 'commerce_fulfillment',
      note: '商品交付奖励',
    })
    return { resultType: 'currency', resultId: job.id, resultMessageId: null }
  }

  private async fulfillDeliverable(
    job: FulfillmentJob,
    deliverable: CommerceDeliverable,
    idempotencyKey: string,
  ): Promise<FulfillmentResult> {
    const metadata = (deliverable.metadata ?? {}) as Record<string, unknown>
    const senderId = job.senderBuddyUserId ?? deliverable.senderBuddyUserId ?? job.buyerId
    const content = textFromMetadata(metadata, 'message') ?? '\u200B'

    switch (deliverable.kind) {
      case 'paid_file':
        return this.fulfillPaidFileMessage(job, deliverable, metadata, senderId, content)
      case 'message':
      case 'external':
        return this.fulfillTextMessage(job, deliverable, senderId, content)
      case 'community_asset':
        return this.fulfillCommunityAsset(job, deliverable, idempotencyKey)
      case 'currency':
        return this.fulfillCurrencyReward(job, metadata)
      default:
        return { resultType: 'entitlement', resultId: job.entitlementId, resultMessageId: null }
    }
  }

  async processJob(jobId: string) {
    const [job] = await this.db
      .update(commerceFulfillmentJobs)
      .set({
        status: 'sending',
        attempts: sql`${commerceFulfillmentJobs.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(commerceFulfillmentJobs.id, jobId),
          inArray(commerceFulfillmentJobs.status, ['pending', 'failed']),
        ),
      )
      .returning()

    if (!job) {
      const [current] = await this.db
        .select()
        .from(commerceFulfillmentJobs)
        .where(eq(commerceFulfillmentJobs.id, jobId))
        .limit(1)
      return current ?? null
    }

    try {
      const [deliverable] = job.deliverableId
        ? await this.db
            .select()
            .from(commerceDeliverables)
            .where(eq(commerceDeliverables.id, job.deliverableId))
            .limit(1)
        : []
      if (!deliverable || deliverable.status !== 'active') {
        throw Object.assign(new Error('Deliverable unavailable'), {
          code: 'COMMERCE_DELIVERABLE_UNAVAILABLE',
        })
      }

      const fulfillmentIdempotencyKey = `${job.id}:${deliverable.id}:${job.buyerId}`
      const [existingRecord] = await this.db
        .select()
        .from(commerceFulfillmentRecords)
        .where(eq(commerceFulfillmentRecords.idempotencyKey, fulfillmentIdempotencyKey))
        .limit(1)
      if (existingRecord?.status === 'succeeded') {
        const [updated] = await this.db
          .update(commerceFulfillmentJobs)
          .set({
            status: 'sent',
            resultMessageId:
              existingRecord.resultType === 'message' ? existingRecord.resultId : null,
            lastErrorCode: null,
            updatedAt: new Date(),
          })
          .where(eq(commerceFulfillmentJobs.id, job.id))
          .returning()
        return updated ?? null
      }

      const fulfillment = await this.fulfillDeliverable(job, deliverable, fulfillmentIdempotencyKey)

      const [updated] = await this.db
        .update(commerceFulfillmentJobs)
        .set({
          status: 'sent',
          resultMessageId: fulfillment.resultMessageId,
          lastErrorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(commerceFulfillmentJobs.id, job.id))
        .returning()
      await this.db
        .insert(commerceFulfillmentRecords)
        .values({
          jobId: job.id,
          orderId: job.orderId,
          deliverableId: deliverable.id,
          recipientUserId: job.buyerId,
          idempotencyKey: fulfillmentIdempotencyKey,
          resultType: fulfillment.resultType,
          resultId: fulfillment.resultId,
          status: 'succeeded',
        })
        .onConflictDoNothing()
      return updated ?? null
    } catch (err) {
      const [updated] = await this.db
        .update(commerceFulfillmentJobs)
        .set({
          status: 'failed',
          lastErrorCode: errorCode(err),
          updatedAt: new Date(),
        })
        .where(eq(commerceFulfillmentJobs.id, job.id))
        .returning()
      return updated ?? null
    }
  }

  async processJobs(jobIds: string[]) {
    const results = []
    for (const jobId of jobIds) {
      results.push(await this.processJob(jobId))
    }
    return results.filter(Boolean)
  }
}
