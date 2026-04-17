import { and, eq } from 'drizzle-orm'
import type { Database } from '../db'
import { cloudTemplates } from '../db/schema'

export class CloudTemplateDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findBySlug(slug: string) {
    const result = await this.db
      .select()
      .from(cloudTemplates)
      .where(eq(cloudTemplates.slug, slug))
      .limit(1)
    return result[0] ?? null
  }

  async listApproved() {
    return this.db
      .select()
      .from(cloudTemplates)
      .where(eq(cloudTemplates.reviewStatus, 'approved'))
      .orderBy(cloudTemplates.createdAt)
  }

  async listPendingReview() {
    return this.db
      .select()
      .from(cloudTemplates)
      .where(
        and(eq(cloudTemplates.source, 'community'), eq(cloudTemplates.reviewStatus, 'pending')),
      )
  }

  async upsertOfficial(data: {
    slug: string
    name: string
    description?: string
    content: unknown
    tags?: string[]
  }) {
    const existing = await this.findBySlug(data.slug)
    if (existing) return existing
    const result = await this.db
      .insert(cloudTemplates)
      .values({
        slug: data.slug,
        name: data.name,
        description: data.description,
        content: data.content as Record<string, unknown>,
        tags: data.tags ?? [],
        source: 'official',
        reviewStatus: 'approved',
      })
      .returning()
    return result[0]
  }

  async submitCommunity(data: {
    slug: string
    name: string
    description?: string
    content: unknown
    tags?: string[]
    submittedByUserId: string
  }) {
    const result = await this.db
      .insert(cloudTemplates)
      .values({
        slug: data.slug,
        name: data.name,
        description: data.description,
        content: data.content as Record<string, unknown>,
        tags: data.tags ?? [],
        source: 'community',
        reviewStatus: 'pending',
        submittedByUserId: data.submittedByUserId,
      })
      .returning()
    return result[0]
  }

  async updateReviewStatus(id: string, reviewStatus: 'pending' | 'approved' | 'rejected') {
    const result = await this.db
      .update(cloudTemplates)
      .set({ reviewStatus, updatedAt: new Date() })
      .where(eq(cloudTemplates.id, id))
      .returning()
    return result[0] ?? null
  }
}
