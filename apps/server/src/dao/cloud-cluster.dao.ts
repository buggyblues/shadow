import { and, eq } from 'drizzle-orm'
import type { Database } from '../db'
import { cloudClusters } from '../db/schema'

export class CloudClusterDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findById(id: string, userId: string) {
    const result = await this.db
      .select()
      .from(cloudClusters)
      .where(and(eq(cloudClusters.id, id), eq(cloudClusters.userId, userId)))
      .limit(1)
    return result[0] ?? null
  }

  async findByIdOnly(id: string) {
    const result = await this.db
      .select()
      .from(cloudClusters)
      .where(eq(cloudClusters.id, id))
      .limit(1)
    return result[0] ?? null
  }

  async listByUser(userId: string) {
    return this.db
      .select()
      .from(cloudClusters)
      .where(eq(cloudClusters.userId, userId))
      .orderBy(cloudClusters.createdAt)
  }

  async create(data: {
    userId: string
    name: string
    kubeconfigEncrypted?: string | null
    kubeconfigKmsRef?: string | null
    isDefault?: boolean
    isPlatform?: boolean
  }) {
    const result = await this.db
      .insert(cloudClusters)
      .values({
        userId: data.userId,
        name: data.name,
        kubeconfigEncrypted: data.kubeconfigEncrypted ?? null,
        kubeconfigKmsRef: data.kubeconfigKmsRef ?? null,
        isDefault: data.isDefault ?? false,
        isPlatform: data.isPlatform ?? false,
      })
      .returning()
    return result[0]
  }

  async delete(id: string, userId: string) {
    await this.db
      .delete(cloudClusters)
      .where(and(eq(cloudClusters.id, id), eq(cloudClusters.userId, userId)))
  }
}
