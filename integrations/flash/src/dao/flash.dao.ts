import type { FlashViewport } from '@shadowob/flash-types/space-app'
import { and, asc, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm'
import type { FlashDatabase } from '../db/client.js'
import {
  flashArenas,
  flashBoardSnapshots,
  flashBoards,
  flashCards,
  flashCommandEvents,
  flashMutationReceipts,
  flashSelections,
} from '../db/schema.js'

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>
}

export interface FlashDaoBundle {
  boards: FlashBoardDao
  cards: FlashCardDao
  arenas: FlashArenaDao
  events: FlashCommandEventDao
  selections: FlashSelectionDao
  receipts: FlashMutationReceiptDao
}

export function createFlashDaoBundle(db: FlashDatabase): FlashDaoBundle {
  return {
    boards: new FlashBoardDao(db),
    cards: new FlashCardDao(db),
    arenas: new FlashArenaDao(db),
    events: new FlashCommandEventDao(db),
    selections: new FlashSelectionDao(db),
    receipts: new FlashMutationReceiptDao(db),
  }
}

export class FlashBoardDao {
  constructor(private readonly db: FlashDatabase) {}

  async findById(id: string) {
    const rows = await this.db.select().from(flashBoards).where(eq(flashBoards.id, id)).limit(1)
    return rows[0] ?? null
  }

  async findByOwner(serverId: string, ownerUserId: string) {
    const rows = await this.db
      .select()
      .from(flashBoards)
      .where(and(eq(flashBoards.serverId, serverId), eq(flashBoards.ownerUserId, ownerUserId)))
      .limit(1)
    return rows[0] ?? null
  }

  async create(data: typeof flashBoards.$inferInsert) {
    const rows = await this.db
      .insert(flashBoards)
      .values(data)
      .onConflictDoUpdate({
        target: [flashBoards.serverId, flashBoards.ownerUserId],
        set: { updatedAt: sql`NOW()` },
      })
      .returning()
    return rows[0]!
  }

  async updateViewport(id: string, viewport: FlashViewport) {
    const rows = await this.db
      .update(flashBoards)
      .set({ viewport, updatedAt: sql`NOW()` })
      .where(eq(flashBoards.id, id))
      .returning()
    return rows[0] ?? null
  }

  async reassignOwner(id: string, ownerUserId: string, title: string) {
    const rows = await this.db
      .update(flashBoards)
      .set({ ownerUserId, title, updatedAt: sql`NOW()` })
      .where(eq(flashBoards.id, id))
      .returning()
    return rows[0] ?? null
  }

  async touch(id: string) {
    await this.db.update(flashBoards).set({ updatedAt: sql`NOW()` }).where(eq(flashBoards.id, id))
  }
}

export class FlashCardDao {
  constructor(private readonly db: FlashDatabase) {}

  async listByBoard(boardId: string) {
    return this.db
      .select()
      .from(flashCards)
      .where(eq(flashCards.boardId, boardId))
      .orderBy(flashCards.createdAt)
  }

  async findById(boardId: string, cardId: string) {
    const rows = await this.db
      .select()
      .from(flashCards)
      .where(and(eq(flashCards.boardId, boardId), eq(flashCards.id, cardId)))
      .limit(1)
    return rows[0] ?? null
  }

  async create(data: typeof flashCards.$inferInsert) {
    const rows = await this.db.insert(flashCards).values(data).returning()
    return rows[0]!
  }

  async createMany(rows: (typeof flashCards.$inferInsert)[]) {
    if (rows.length === 0) return []
    return this.db.insert(flashCards).values(rows).returning()
  }

  async update(boardId: string, cardId: string, data: Partial<typeof flashCards.$inferInsert>) {
    const rows = await this.db
      .update(flashCards)
      .set({
        ...compact(data as Record<string, unknown>),
        revision: sql`${flashCards.revision} + 1`,
        updatedAt: sql`NOW()`,
      })
      .where(and(eq(flashCards.boardId, boardId), eq(flashCards.id, cardId)))
      .returning()
    return rows[0] ?? null
  }

  async updateIfRevision(
    boardId: string,
    cardId: string,
    data: Partial<typeof flashCards.$inferInsert>,
    revision: number,
  ) {
    const rows = await this.db
      .update(flashCards)
      .set({
        ...compact(data as Record<string, unknown>),
        revision: sql`${flashCards.revision} + 1`,
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(flashCards.boardId, boardId),
          eq(flashCards.id, cardId),
          eq(flashCards.revision, revision),
        ),
      )
      .returning()
    return rows[0] ?? null
  }

  async updateLayouts(
    boardId: string,
    updates: Array<{
      id: string
      x?: number
      y?: number
      angle?: number
      flipped?: boolean
      hidden?: boolean
      locked?: boolean
      meta?: Record<string, unknown>
      tags?: string[]
    }>,
  ) {
    const changed = []
    for (const item of updates) {
      const row = await this.update(boardId, item.id, {
        x: item.x,
        y: item.y,
        angle: item.angle,
        flipped: item.flipped,
        hidden: item.hidden,
        locked: item.locked,
        meta: item.meta,
        tags: item.tags,
      })
      if (row) changed.push(row)
    }
    return changed
  }

  async delete(boardId: string, cardId: string) {
    const rows = await this.db
      .delete(flashCards)
      .where(and(eq(flashCards.boardId, boardId), eq(flashCards.id, cardId)))
      .returning()
    return rows[0] ?? null
  }
}

export class FlashArenaDao {
  constructor(private readonly db: FlashDatabase) {}

  async listByBoard(boardId: string) {
    return this.db
      .select()
      .from(flashArenas)
      .where(eq(flashArenas.boardId, boardId))
      .orderBy(flashArenas.createdAt)
  }

  async findById(boardId: string, arenaId: string) {
    const rows = await this.db
      .select()
      .from(flashArenas)
      .where(and(eq(flashArenas.boardId, boardId), eq(flashArenas.id, arenaId)))
      .limit(1)
    return rows[0] ?? null
  }

  async create(data: typeof flashArenas.$inferInsert) {
    const rows = await this.db.insert(flashArenas).values(data).returning()
    return rows[0]!
  }

  async update(boardId: string, arenaId: string, data: Partial<typeof flashArenas.$inferInsert>) {
    const rows = await this.db
      .update(flashArenas)
      .set({
        ...compact(data as Record<string, unknown>),
        revision: sql`${flashArenas.revision} + 1`,
        updatedAt: sql`NOW()`,
      })
      .where(and(eq(flashArenas.boardId, boardId), eq(flashArenas.id, arenaId)))
      .returning()
    return rows[0] ?? null
  }

  async updateCards(boardId: string, arenaId: string, cardIds: string[]) {
    return this.update(boardId, arenaId, { cardIds })
  }
}

export class FlashCommandEventDao {
  constructor(private readonly db: FlashDatabase) {}

  async transaction<T>(fn: (daos: FlashDaoBundle) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => fn(createFlashDaoBundle(tx as FlashDatabase)))
  }

  async lockBoardForMutation(boardId: string) {
    await this.db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${boardId}))`)
  }

  async listByBoard(boardId: string, limit = 40) {
    return this.db
      .select()
      .from(flashCommandEvents)
      .where(eq(flashCommandEvents.boardId, boardId))
      .orderBy(desc(flashCommandEvents.boardSeq))
      .limit(limit)
  }

  async listAfter(boardId: string, after: number, limit = 200) {
    return this.db
      .select()
      .from(flashCommandEvents)
      .where(and(eq(flashCommandEvents.boardId, boardId), gt(flashCommandEvents.boardSeq, after)))
      .orderBy(asc(flashCommandEvents.boardSeq))
      .limit(limit)
  }

  async listRange(boardId: string, after: number, through: number, limit = 500) {
    return this.db
      .select()
      .from(flashCommandEvents)
      .where(
        and(
          eq(flashCommandEvents.boardId, boardId),
          gt(flashCommandEvents.boardSeq, after),
          lte(flashCommandEvents.boardSeq, through),
        ),
      )
      .orderBy(asc(flashCommandEvents.boardSeq))
      .limit(limit)
  }

  async latestCursor(boardId: string): Promise<number> {
    const rows = await this.db
      .select({ cursor: sql<number>`COALESCE(MAX(${flashCommandEvents.boardSeq}), 0)` })
      .from(flashCommandEvents)
      .where(eq(flashCommandEvents.boardId, boardId))
      .limit(1)
    return Number(rows[0]?.cursor ?? 0)
  }

  async findByClientMutationId(boardId: string, clientMutationId: string | null | undefined) {
    if (!clientMutationId) return null
    const rows = await this.db
      .select()
      .from(flashCommandEvents)
      .where(
        and(
          eq(flashCommandEvents.boardId, boardId),
          eq(flashCommandEvents.clientMutationId, clientMutationId),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async create(
    data: Omit<typeof flashCommandEvents.$inferInsert, 'boardSeq'> & { boardSeq?: number },
  ) {
    const values = {
      ...data,
      boardSeq:
        data.boardSeq && data.boardSeq > 0
          ? data.boardSeq
          : (sql<number>`(
              SELECT COALESCE(MAX(${flashCommandEvents.boardSeq}), 0) + 1
              FROM ${flashCommandEvents}
              WHERE ${flashCommandEvents.boardId} = ${data.boardId}
            )` as unknown as number),
      causalLag:
        data.baseCursor === null || data.baseCursor === undefined
          ? 0
          : (sql<number>`GREATEST(0, (
              SELECT COALESCE(MAX(${flashCommandEvents.boardSeq}), 0)
              FROM ${flashCommandEvents}
              WHERE ${flashCommandEvents.boardId} = ${data.boardId}
            ) - ${data.baseCursor})` as unknown as number),
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const rows = await this.db.insert(flashCommandEvents).values(values).returning()
        return rows[0]!
      } catch (err) {
        if (attempt === 3) throw err
      }
    }
    throw new Error('flash_event_append_failed')
  }
}

export class FlashMutationReceiptDao {
  constructor(private readonly db: FlashDatabase) {}

  async find(boardId: string, clientMutationId: string) {
    const rows = await this.db
      .select()
      .from(flashMutationReceipts)
      .where(
        and(
          eq(flashMutationReceipts.boardId, boardId),
          eq(flashMutationReceipts.clientMutationId, clientMutationId),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async begin(input: {
    boardId: string
    clientMutationId: string
    actor: unknown
  }): Promise<
    | { state: 'reserved'; row: typeof flashMutationReceipts.$inferSelect }
    | { state: 'pending'; row: typeof flashMutationReceipts.$inferSelect }
    | { state: 'completed'; row: typeof flashMutationReceipts.$inferSelect }
  > {
    const rows = await this.db
      .insert(flashMutationReceipts)
      .values({
        boardId: input.boardId,
        clientMutationId: input.clientMutationId,
        status: 'pending',
        actor: input.actor,
      })
      .onConflictDoNothing()
      .returning()
    if (rows[0]) return { state: 'reserved', row: rows[0] }

    const existing = await this.find(input.boardId, input.clientMutationId)
    if (!existing) throw new Error('mutation_receipt_not_found')
    if (existing.status === 'completed') return { state: 'completed', row: existing }
    if (existing.status === 'failed') {
      const reset = await this.db
        .update(flashMutationReceipts)
        .set({
          status: 'pending',
          eventId: null,
          result: null,
          error: null,
          actor: input.actor,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(flashMutationReceipts.boardId, input.boardId),
            eq(flashMutationReceipts.clientMutationId, input.clientMutationId),
          ),
        )
        .returning()
      return { state: 'reserved', row: reset[0] ?? existing }
    }
    return { state: 'pending', row: existing }
  }

  async complete(boardId: string, clientMutationId: string, eventId: string, result: unknown) {
    const rows = await this.db
      .update(flashMutationReceipts)
      .set({
        status: 'completed',
        eventId,
        result,
        error: null,
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(flashMutationReceipts.boardId, boardId),
          eq(flashMutationReceipts.clientMutationId, clientMutationId),
        ),
      )
      .returning()
    return rows[0] ?? null
  }

  async fail(boardId: string, clientMutationId: string, error: string) {
    const rows = await this.db
      .update(flashMutationReceipts)
      .set({
        status: 'failed',
        error,
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(flashMutationReceipts.boardId, boardId),
          eq(flashMutationReceipts.clientMutationId, clientMutationId),
        ),
      )
      .returning()
    return rows[0] ?? null
  }
}

export class FlashSelectionDao {
  constructor(private readonly db: FlashDatabase) {}

  async listByBoard(boardId: string) {
    return this.db
      .select()
      .from(flashSelections)
      .where(eq(flashSelections.boardId, boardId))
      .orderBy(desc(flashSelections.updatedAt))
  }

  async findByActor(boardId: string, actorId: string) {
    const rows = await this.db
      .select()
      .from(flashSelections)
      .where(and(eq(flashSelections.boardId, boardId), eq(flashSelections.actorId, actorId)))
      .limit(1)
    return rows[0] ?? null
  }

  async upsert(data: typeof flashSelections.$inferInsert) {
    const rows = await this.db
      .insert(flashSelections)
      .values(data)
      .onConflictDoUpdate({
        target: [flashSelections.boardId, flashSelections.actorId],
        set: {
          actor: data.actor,
          selectedCardIds: data.selectedCardIds ?? [],
          anchorCardId: data.anchorCardId,
          revision: data.revision ?? 0,
          updatedAt: sql`NOW()`,
        },
      })
      .returning()
    return rows[0]!
  }
}

export async function deleteCardsById(db: FlashDatabase, boardId: string, cardIds: string[]) {
  if (cardIds.length === 0) return []
  return db
    .delete(flashCards)
    .where(and(eq(flashCards.boardId, boardId), inArray(flashCards.id, cardIds)))
    .returning()
}
