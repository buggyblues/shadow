import { and, eq } from 'drizzle-orm'
import type { Database } from '../db'
import { commerceIdempotencyKeys } from '../db/schema'
import { apiError } from '../lib/api-error'

type DbLike = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

export class EconomyIdempotencyService {
  constructor(private deps: { db: Database }) {}

  async getCompleted<T = Record<string, unknown>>(input: {
    actorUserId: string
    key: string
    action: string
  }) {
    const rows = await this.deps.db
      .select()
      .from(commerceIdempotencyKeys)
      .where(
        and(
          eq(commerceIdempotencyKeys.actorUserId, input.actorUserId),
          eq(commerceIdempotencyKeys.key, input.key),
          eq(commerceIdempotencyKeys.action, input.action),
        ),
      )
      .limit(1)

    const existing = rows[0]
    if (!existing) return null
    if (existing.status === 'completed') return existing.response as T
    if (existing.status === 'started') {
      throw apiError('ECONOMY_OPERATION_IN_PROGRESS', 409)
    }
    return null
  }

  async begin(
    input: {
      actorUserId: string
      key: string
      action: string
      ttlMs?: number
    },
    db: DbLike = this.deps.db,
  ) {
    if (!input.key || input.key.length < 8 || input.key.length > 200) {
      throw apiError('IDEMPOTENCY_KEY_REQUIRED', 400, { maxLength: 200 })
    }

    const inserted = await db
      .insert(commerceIdempotencyKeys)
      .values({
        actorUserId: input.actorUserId,
        key: input.key,
        action: input.action,
        status: 'started',
        expiresAt: new Date(Date.now() + (input.ttlMs ?? 24 * 60 * 60 * 1000)),
      })
      .onConflictDoNothing()
      .returning({ id: commerceIdempotencyKeys.id })
    if (inserted.length > 0) return inserted[0]!

    const [existing] = await db
      .select()
      .from(commerceIdempotencyKeys)
      .where(
        and(
          eq(commerceIdempotencyKeys.actorUserId, input.actorUserId),
          eq(commerceIdempotencyKeys.key, input.key),
          eq(commerceIdempotencyKeys.action, input.action),
        ),
      )
      .limit(1)

    if (existing?.status === 'failed') {
      const restarted = await db
        .update(commerceIdempotencyKeys)
        .set({
          status: 'started',
          error: null,
          response: null,
          referenceId: null,
          expiresAt: new Date(Date.now() + (input.ttlMs ?? 24 * 60 * 60 * 1000)),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(commerceIdempotencyKeys.actorUserId, input.actorUserId),
            eq(commerceIdempotencyKeys.key, input.key),
            eq(commerceIdempotencyKeys.action, input.action),
            eq(commerceIdempotencyKeys.status, 'failed'),
          ),
        )
        .returning({ id: commerceIdempotencyKeys.id })
      if (restarted.length > 0) return restarted[0]!
    }

    if (existing?.status === 'completed') {
      throw apiError('ECONOMY_OPERATION_COMPLETED', 409)
    }

    throw apiError('ECONOMY_OPERATION_IN_PROGRESS', 409)
  }

  async complete(
    input: {
      actorUserId: string
      key: string
      action: string
      referenceId?: string | null
      response: Record<string, unknown>
    },
    db: DbLike = this.deps.db,
  ) {
    await db
      .update(commerceIdempotencyKeys)
      .set({
        status: 'completed',
        referenceId: input.referenceId ?? undefined,
        response: input.response,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(commerceIdempotencyKeys.actorUserId, input.actorUserId),
          eq(commerceIdempotencyKeys.key, input.key),
          eq(commerceIdempotencyKeys.action, input.action),
        ),
      )
  }

  async fail(
    input: {
      actorUserId: string
      key: string
      action: string
      error: string
    },
    db: DbLike = this.deps.db,
  ) {
    await db
      .update(commerceIdempotencyKeys)
      .set({
        status: 'failed',
        error: input.error,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(commerceIdempotencyKeys.actorUserId, input.actorUserId),
          eq(commerceIdempotencyKeys.key, input.key),
          eq(commerceIdempotencyKeys.action, input.action),
        ),
      )
  }
}
