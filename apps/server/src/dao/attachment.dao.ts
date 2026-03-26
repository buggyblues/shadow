import { eq } from 'drizzle-orm'
import type { Database } from '../db'
import { attachments } from '../db/schema'

export class AttachmentDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const result = await this.db.select().from(attachments).where(eq(attachments.id, id)).limit(1)
    return result[0] ?? null
  }

  async findByMessageId(messageId: string) {
    return this.db.select().from(attachments).where(eq(attachments.messageId, messageId))
  }

  async create(data: {
    messageId: string
    filename: string
    url: string
    contentType: string
    size: number
    width?: number
    height?: number
  }) {
    const result = await this.db.insert(attachments).values(data).returning()
    return result[0]
  }

  async delete(id: string) {
    await this.db.delete(attachments).where(eq(attachments.id, id))
  }
}
