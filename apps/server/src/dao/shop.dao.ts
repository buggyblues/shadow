import { eq } from 'drizzle-orm'
import type { Database } from '../db'
import { shops } from '../db/schema'

export class ShopDao {
  constructor(private deps: { db: Database }) {}
  private get db() { return this.deps.db }

  async findById(id: string) {
    const r = await this.db.select().from(shops).where(eq(shops.id, id)).limit(1)
    return r[0] ?? null
  }

  async findByServerId(serverId: string) {
    const r = await this.db.select().from(shops).where(eq(shops.serverId, serverId)).limit(1)
    return r[0] ?? null
  }

  async create(data: { serverId: string; name: string; description?: string; logoUrl?: string; bannerUrl?: string }) {
    const r = await this.db.insert(shops).values(data).returning()
    return r[0] ?? null
  }

  async update(id: string, data: Partial<{
    name: string
    description: string | null
    logoUrl: string | null
    bannerUrl: string | null
    status: 'active' | 'suspended' | 'closed'
    settings: Record<string, unknown>
  }>) {
    const r = await this.db.update(shops).set({ ...data, updatedAt: new Date() }).where(eq(shops.id, id)).returning()
    return r[0] ?? null
  }
}
