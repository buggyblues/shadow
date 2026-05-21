import type { FlashViewport } from '@shadowob/flash-types/server-app'
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import type { FlashDatabase } from '../db/client.js'
import {
  flashArenas,
  flashBoards,
  flashCards,
  flashCommandEvents,
  flashSelections,
} from '../db/schema.js'

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>
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
      .set({ ...compact(data as Record<string, unknown>), updatedAt: sql`NOW()` })
      .where(and(eq(flashCards.boardId, boardId), eq(flashCards.id, cardId)))
      .returning()
    return rows[0] ?? null
  }

  async updateLayouts(
    boardId: string,
    updates: Array<{ id: string; x: number; y: number; angle?: number }>,
  ) {
    const changed = []
    for (const item of updates) {
      const row = await this.update(boardId, item.id, {
        x: item.x,
        y: item.y,
        angle: item.angle,
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
      .set({ ...compact(data as Record<string, unknown>), updatedAt: sql`NOW()` })
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

  async listByBoard(boardId: string, limit = 40) {
    return this.db
      .select()
      .from(flashCommandEvents)
      .where(eq(flashCommandEvents.boardId, boardId))
      .orderBy(desc(flashCommandEvents.seq))
      .limit(limit)
  }

  async listAfter(boardId: string, after: number, limit = 200) {
    return this.db
      .select()
      .from(flashCommandEvents)
      .where(and(eq(flashCommandEvents.boardId, boardId), gt(flashCommandEvents.seq, after)))
      .orderBy(asc(flashCommandEvents.seq))
      .limit(limit)
  }

  async create(data: typeof flashCommandEvents.$inferInsert) {
    const rows = await this.db.insert(flashCommandEvents).values(data).returning()
    return rows[0]!
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
