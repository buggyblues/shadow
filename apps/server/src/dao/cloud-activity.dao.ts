import { desc, eq } from 'drizzle-orm'
import type { Database } from '../db'
import { cloudActivities } from '../db/schema'

export class CloudActivityDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async listByUser(userId: string, limit = 50, offset = 0) {
    return this.db
      .select()
      .from(cloudActivities)
      .where(eq(cloudActivities.userId, userId))
      .orderBy(desc(cloudActivities.createdAt))
      .limit(limit)
      .offset(offset)
  }

  async log(data: {
    userId: string
    type:
      | 'deploy'
      | 'destroy'
      | 'scale'
      | 'config_update'
      | 'cluster_add'
      | 'cluster_remove'
      | 'envvar_update'
      | 'template_submit'
    namespace?: string
    meta?: Record<string, unknown>
  }) {
    const result = await this.db
      .insert(cloudActivities)
      .values({
        userId: data.userId,
        type: data.type,
        namespace: data.namespace ?? null,
        meta: data.meta ?? null,
      })
      .returning()
    return result[0]
  }
}
