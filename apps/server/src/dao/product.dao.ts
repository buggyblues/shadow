import { and, desc, eq, ilike, notInArray, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { productMedia, products, skus } from '../db/schema'

type EntitlementConfig = {
  resourceType?: string
  resourceId?: string
  capability?: string
  durationSeconds?: number | null
  renewalPeriodSeconds?: number | null
  privilegeDescription?: string
}

type EntitlementConfigInput = EntitlementConfig | EntitlementConfig[]

export class ProductDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const r = await this.db.select().from(products).where(eq(products.id, id)).limit(1)
    return r[0] ?? null
  }

  async findByShopId(
    shopId: string,
    opts?: {
      status?: 'draft' | 'active' | 'archived'
      categoryId?: string
      keyword?: string
      limit?: number
      offset?: number
    },
  ) {
    const conditions = [eq(products.shopId, shopId)]
    if (opts?.status) conditions.push(eq(products.status, opts.status))
    if (opts?.categoryId) conditions.push(eq(products.categoryId, opts.categoryId))
    if (opts?.keyword) conditions.push(ilike(products.name, `%${opts.keyword}%`))

    return this.db
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(desc(products.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)
  }

  async countByShopId(
    shopId: string,
    opts?: { status?: 'draft' | 'active' | 'archived'; categoryId?: string; keyword?: string },
  ) {
    const conditions = [eq(products.shopId, shopId)]
    if (opts?.status) conditions.push(eq(products.status, opts.status))
    if (opts?.categoryId) conditions.push(eq(products.categoryId, opts.categoryId))
    if (opts?.keyword) conditions.push(ilike(products.name, `%${opts.keyword}%`))

    const r = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(and(...conditions))
    return r[0]?.count ?? 0
  }

  async create(data: {
    shopId: string
    name: string
    slug: string
    type?: 'physical' | 'entitlement'
    billingMode?: 'one_time' | 'fixed_duration' | 'subscription'
    status?: 'draft' | 'active' | 'archived'
    description?: string
    summary?: string
    basePrice?: number
    specNames?: string[]
    tags?: string[]
    entitlementConfig?: EntitlementConfigInput
    categoryId?: string
  }) {
    const r = await this.db.insert(products).values(data).returning()
    return r[0] ?? null
  }

  async update(
    id: string,
    data: Partial<{
      name: string
      slug: string
      type: 'physical' | 'entitlement'
      billingMode: 'one_time' | 'fixed_duration' | 'subscription'
      status: 'draft' | 'active' | 'archived'
      description: string | null
      summary: string | null
      basePrice: number
      specNames: string[]
      tags: string[]
      entitlementConfig: EntitlementConfigInput | null
      categoryId: string | null
    }>,
  ) {
    const r = await this.db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning()
    return r[0] ?? null
  }

  async updateByShopIdAndId(
    shopId: string,
    id: string,
    data: Partial<{
      name: string
      slug: string
      type: 'physical' | 'entitlement'
      billingMode: 'one_time' | 'fixed_duration' | 'subscription'
      status: 'draft' | 'active' | 'archived'
      description: string | null
      summary: string | null
      basePrice: number
      specNames: string[]
      tags: string[]
      entitlementConfig: EntitlementConfigInput | null
      categoryId: string | null
    }>,
  ) {
    const r = await this.db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(products.shopId, shopId), eq(products.id, id)))
      .returning()
    return r[0] ?? null
  }

  async incrementSalesCount(id: string, qty: number) {
    await this.db
      .update(products)
      .set({ salesCount: sql`${products.salesCount} + ${qty}` })
      .where(eq(products.id, id))
  }

  async updateRatingStats(id: string, avgRating: number, ratingCount: number) {
    await this.db
      .update(products)
      .set({ avgRating, ratingCount, updatedAt: new Date() })
      .where(eq(products.id, id))
  }

  async delete(id: string) {
    await this.db
      .update(products)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(products.id, id))
  }

  async deleteByShopIdAndId(shopId: string, id: string) {
    await this.db
      .update(products)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(and(eq(products.shopId, shopId), eq(products.id, id)))
  }
}

/* ═══════════════════ Product Media ═══════════════════ */

export class ProductMediaDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findByProductId(productId: string) {
    return this.db
      .select()
      .from(productMedia)
      .where(eq(productMedia.productId, productId))
      .orderBy(productMedia.position)
  }

  async create(data: {
    productId: string
    type?: string
    url: string
    thumbnailUrl?: string
    position?: number
  }) {
    const r = await this.db.insert(productMedia).values(data).returning()
    return r[0] ?? null
  }

  async deleteByProductId(productId: string) {
    await this.db.delete(productMedia).where(eq(productMedia.productId, productId))
  }

  async delete(id: string) {
    await this.db.delete(productMedia).where(eq(productMedia.id, id))
  }
}

/* ═══════════════════ SKU ═══════════════════ */

export class SkuDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findByProductId(productId: string) {
    return this.db.select().from(skus).where(eq(skus.productId, productId))
  }

  async findById(id: string) {
    const r = await this.db.select().from(skus).where(eq(skus.id, id)).limit(1)
    return r[0] ?? null
  }

  async create(data: {
    productId: string
    specValues?: string[]
    price: number
    stock?: number
    imageUrl?: string
    skuCode?: string
    isActive?: boolean
  }) {
    const r = await this.db.insert(skus).values(data).returning()
    return r[0] ?? null
  }

  async update(
    id: string,
    data: Partial<{
      specValues: string[]
      price: number
      stock: number
      imageUrl: string | null
      skuCode: string | null
      isActive: boolean
    }>,
  ) {
    const r = await this.db
      .update(skus)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(skus.id, id))
      .returning()
    return r[0] ?? null
  }

  async decrementStock(id: string, qty: number) {
    const r = await this.db
      .update(skus)
      .set({ stock: sql`GREATEST(${skus.stock} - ${qty}, 0)`, updatedAt: new Date() })
      .where(and(eq(skus.id, id), sql`${skus.stock} >= ${qty}`))
      .returning()
    return r[0] ?? null
  }

  async deleteByProductId(productId: string) {
    await this.db.delete(skus).where(eq(skus.productId, productId))
  }

  async deactivateMissing(productId: string, activeIds: string[]) {
    const filters = [eq(skus.productId, productId)]
    if (activeIds.length > 0) filters.push(notInArray(skus.id, activeIds))
    await this.db
      .update(skus)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(...filters))
  }
}
