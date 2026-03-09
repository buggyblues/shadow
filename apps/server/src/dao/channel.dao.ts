import { and, eq, like } from 'drizzle-orm'
import type { Database } from '../db'
import { channels } from '../db/schema'

export class ChannelDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const result = await this.db.select().from(channels).where(eq(channels.id, id)).limit(1)
    return result[0] ?? null
  }

  async findByServerId(serverId: string) {
    return this.db
      .select()
      .from(channels)
      .where(eq(channels.serverId, serverId))
      .orderBy(channels.position)
  }

  /** Find channels in a server whose name starts with the given prefix (for dedup). */
  async findByServerIdAndNamePrefix(serverId: string, namePrefix: string) {
    return this.db
      .select({ name: channels.name })
      .from(channels)
      .where(and(eq(channels.serverId, serverId), like(channels.name, `${namePrefix}%`)))
  }

  async create(data: {
    name: string
    serverId: string
    type?: 'text' | 'voice' | 'announcement'
    topic?: string
  }) {
    const result = await this.db
      .insert(channels)
      .values({
        name: data.name,
        serverId: data.serverId,
        type: data.type ?? 'text',
        topic: data.topic,
      })
      .returning()
    return result[0]
  }

  async update(
    id: string,
    data: Partial<{
      name: string
      type: 'text' | 'voice' | 'announcement'
      topic: string | null
      position: number
    }>,
  ) {
    const result = await this.db
      .update(channels)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(channels.id, id))
      .returning()
    return result[0] ?? null
  }

  async delete(id: string) {
    await this.db.delete(channels).where(eq(channels.id, id))
  }

  async updatePositions(positions: { id: string; position: number }[]) {
    for (const pos of positions) {
      await this.db
        .update(channels)
        .set({ position: pos.position, updatedAt: new Date() })
        .where(eq(channels.id, pos.id))
    }
  }
}
