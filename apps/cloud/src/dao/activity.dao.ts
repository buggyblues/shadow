/**
 * DAO — Activity log data access.
 */

import { desc } from 'drizzle-orm'
import type { CloudDatabase } from '../db/index.js'
import { type Activity, activities, type NewActivity } from '../db/schema.js'

export class ActivityDao {
  constructor(private db: CloudDatabase) {}

  findAll(limit = 500): Activity[] {
    return this.db.select().from(activities).orderBy(desc(activities.createdAt)).limit(limit).all()
  }

  create(data: NewActivity): Activity {
    return this.db.insert(activities).values(data).returning().get()
  }

  clear(): void {
    this.db.delete(activities).run()
  }
}
