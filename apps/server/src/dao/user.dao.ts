import { eq } from 'drizzle-orm'
import type { Database } from '../db'
import { users } from '../db/schema'

export class UserDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    return result[0] ?? null
  }

  async findByEmail(email: string) {
    const result = await this.db.select().from(users).where(eq(users.email, email)).limit(1)
    return result[0] ?? null
  }

  async findByUsername(username: string) {
    const result = await this.db.select().from(users).where(eq(users.username, username)).limit(1)
    return result[0] ?? null
  }

  async create(data: {
    email: string
    username: string
    passwordHash: string
    displayName?: string
  }) {
    const result = await this.db
      .insert(users)
      .values({
        email: data.email,
        username: data.username,
        passwordHash: data.passwordHash,
        displayName: data.displayName ?? data.username,
      })
      .returning()
    return result[0]
  }

  async updateStatus(id: string, status: 'online' | 'idle' | 'dnd' | 'offline') {
    const result = await this.db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
    return result[0] ?? null
  }

  async update(
    id: string,
    data: Partial<{
      displayName: string
      avatarUrl: string | null
    }>,
  ) {
    const result = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
    return result[0] ?? null
  }

  async findAll(limit = 50, offset = 0) {
    return this.db.select().from(users).limit(limit).offset(offset)
  }

  async delete(id: string) {
    await this.db.delete(users).where(eq(users.id, id))
  }
}
