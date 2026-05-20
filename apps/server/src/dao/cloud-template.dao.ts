import { and, desc, eq, inArray, ne, not } from 'drizzle-orm'
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
    if (existing) {
      if (existing.source !== 'official') return existing

      const result = await this.db
        .update(cloudTemplates)
        .set({
          name: data.name,
          description: data.description,
          content: data.content as Record<string, unknown>,
          tags: data.tags ?? existing.tags ?? [],
          reviewStatus: 'approved',
          updatedAt: new Date(),
        })
        .where(eq(cloudTemplates.id, existing.id))
        .returning()
      return result[0] ?? existing
    }

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

  async deleteOfficialNotIn(slugs: string[]) {
    if (slugs.length === 0) return []
    return this.db
      .delete(cloudTemplates)
      .where(and(eq(cloudTemplates.source, 'official'), not(inArray(cloudTemplates.slug, slugs))))
      .returning()
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

  async updateReviewStatus(
    id: string,
    reviewStatus: 'draft' | 'pending' | 'approved' | 'rejected',
    reviewNote?: string | null,
  ) {
    const result = await this.db
      .update(cloudTemplates)
      .set({
        reviewStatus,
        reviewNote: reviewNote !== undefined ? reviewNote : null,
        updatedAt: new Date(),
      })
      .where(eq(cloudTemplates.id, id))
      .returning()
    return result[0] ?? null
  }

  async createCommunity(data: {
    slug: string
    name: string
    description?: string | null
    content: unknown
    tags: string[]
    source: 'official' | 'community'
    reviewStatus: 'draft' | 'pending' | 'approved' | 'rejected'
    submittedByUserId: string
    authorId: string
    category?: string | null
    baseCost?: number | null
  }) {
    const result = await this.db
      .insert(cloudTemplates)
      .values({
        slug: data.slug,
        name: data.name,
        description: data.description,
        content: data.content as Record<string, unknown>,
        tags: data.tags,
        source: data.source,
        reviewStatus: data.reviewStatus,
        submittedByUserId: data.submittedByUserId,
        authorId: data.authorId,
        category: data.category ?? null,
        baseCost: data.baseCost ?? null,
      })
      .returning()
    return result[0] ?? null
  }

  async updateBySlug(
    slug: string,
    data: {
      name?: string
      description?: string | null
      content?: Record<string, unknown>
      tags?: string[]
      category?: string | null
      baseCost?: number | null
    },
  ) {
    const result = await this.db
      .update(cloudTemplates)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.content !== undefined && { content: data.content as Record<string, unknown> }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.baseCost !== undefined && { baseCost: data.baseCost }),
        updatedAt: new Date(),
      })
      .where(eq(cloudTemplates.slug, slug))
      .returning()
    return result[0] ?? null
  }

  async deleteBySlug(slug: string) {
    await this.db.delete(cloudTemplates).where(eq(cloudTemplates.slug, slug))
  }

  async listByAuthorId(authorId: string) {
    return this.db
      .select()
      .from(cloudTemplates)
      .where(and(eq(cloudTemplates.authorId, authorId), ne(cloudTemplates.source, 'official')))
      .orderBy(desc(cloudTemplates.updatedAt))
      .limit(100)
  }

  async findBySlugForAuthor(slug: string, authorId: string) {
    const result = await this.db
      .select()
      .from(cloudTemplates)
      .where(
        and(
          eq(cloudTemplates.slug, slug),
          eq(cloudTemplates.authorId, authorId),
          ne(cloudTemplates.source, 'official'),
        ),
      )
      .limit(1)
    return result[0] ?? null
  }
}
