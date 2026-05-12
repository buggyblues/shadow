import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { apps } from '../db/schema'

export class AppDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const r = await this.db.select().from(apps).where(eq(apps.id, id)).limit(1)
    return r[0] ?? null
  }

  async findByServerId(
    serverId: string,
    opts?: { status?: string; limit?: number; offset?: number },
  ) {
    let query = this.db.select().from(apps).where(eq(apps.serverId, serverId))
    if (opts?.status) {
      query = this.db
        .select()
        .from(apps)
        .where(
          and(
            eq(apps.serverId, serverId),
            eq(apps.status, opts.status as 'draft' | 'active' | 'archived'),
          ),
        )
    }
    const result = await query
      .orderBy(apps.createdAt)
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)
    return result
  }

  async findByChannelId(channelId: string) {
    const r = await this.db.select().from(apps).where(eq(apps.channelId, channelId)).limit(1)
    return r[0] ?? null
  }

  async findHomepage(serverId: string) {
    const r = await this.db
      .select()
      .from(apps)
      .where(and(eq(apps.serverId, serverId), eq(apps.isHomepage, true)))
      .limit(1)
    return r[0] ?? null
  }

  async findBySlug(serverId: string, slug: string) {
    const r = await this.db
      .select()
      .from(apps)
      .where(and(eq(apps.serverId, serverId), eq(apps.slug, slug)))
      .limit(1)
    return r[0] ?? null
  }

  async countByServerId(serverId: string, status?: string) {
    const conditions = [eq(apps.serverId, serverId)]
    if (status) conditions.push(eq(apps.status, status as 'draft' | 'active' | 'archived'))
    const r = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(apps)
      .where(and(...conditions))
    return r[0]?.count ?? 0
  }

  async create(data: {
    serverId: string
    publisherId: string
    channelId?: string
    name: string
    slug?: string
    description?: string
    iconUrl?: string
    bannerUrl?: string
    sourceType: 'zip' | 'url'
    sourceUrl: string
    version?: string
    status?: 'draft' | 'active' | 'archived'
    isHomepage?: boolean
    settings?: Record<string, unknown>
  }) {
    const r = await this.db.insert(apps).values(data).returning()
    return r[0] ?? null
  }

  async update(
    id: string,
    data: Partial<{
      name: string
      slug: string | null
      description: string | null
      iconUrl: string | null
      bannerUrl: string | null
      sourceType: 'zip' | 'url'
      sourceUrl: string
      version: string | null
      status: 'draft' | 'active' | 'archived'
      isHomepage: boolean
      channelId: string | null
      settings: Record<string, unknown> | null
    }>,
  ) {
    const r = await this.db
      .update(apps)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(apps.id, id))
      .returning()
    return r[0] ?? null
  }

  async updateByServerIdAndId(
    serverId: string,
    id: string,
    data: Partial<{
      name: string
      slug: string | null
      description: string | null
      iconUrl: string | null
      bannerUrl: string | null
      sourceType: 'zip' | 'url'
      sourceUrl: string
      version: string | null
      status: 'draft' | 'active' | 'archived'
      isHomepage: boolean
      channelId: string | null
      settings: Record<string, unknown> | null
    }>,
  ) {
    const r = await this.db
      .update(apps)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(apps.serverId, serverId), eq(apps.id, id)))
      .returning()
    return r[0] ?? null
  }

  async delete(id: string) {
    await this.db.delete(apps).where(eq(apps.id, id))
  }

  async deleteByServerIdAndId(serverId: string, id: string) {
    await this.db.delete(apps).where(and(eq(apps.serverId, serverId), eq(apps.id, id)))
  }

  async clearHomepage(serverId: string) {
    await this.db
      .update(apps)
      .set({ isHomepage: false, updatedAt: new Date() })
      .where(and(eq(apps.serverId, serverId), eq(apps.isHomepage, true)))
  }

  async incrementViewCount(id: string) {
    await this.db
      .update(apps)
      .set({ viewCount: sql`${apps.viewCount} + 1` })
      .where(eq(apps.id, id))
  }
}
