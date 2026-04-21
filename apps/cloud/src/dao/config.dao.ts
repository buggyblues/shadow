/**
 * DAO — Config data access with version history.
 */

import { desc, eq } from 'drizzle-orm'
import type { CloudDatabase } from '../db/index.js'
import { type Config, configs, configVersions, type NewConfig } from '../db/schema.js'

export class ConfigDao {
  constructor(private db: CloudDatabase) {}

  findByName(name: string): Config | undefined {
    return this.db.select().from(configs).where(eq(configs.name, name)).get()
  }

  findAll(): Config[] {
    return this.db.select().from(configs).all()
  }

  upsert(name: string, content: unknown, templateSlug?: string): Config {
    const existing = this.findByName(name)
    if (existing) {
      // Save current version to history before overwriting
      this.db
        .insert(configVersions)
        .values({
          configName: name,
          version: existing.version ?? 1,
          content: existing.content as never,
        })
        .run()

      const newVersion = (existing.version ?? 1) + 1
      return this.db
        .update(configs)
        .set({
          content: content as never,
          templateSlug,
          version: newVersion,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(configs.name, name))
        .returning()
        .get()
    }
    return this.db
      .insert(configs)
      .values({ name, content: content as never, templateSlug, version: 1 })
      .returning()
      .get()
  }

  getVersionHistory(name: string): Array<{
    version: number
    content: unknown
    message: string | null
    createdAt: string | null
  }> {
    return this.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.configName, name))
      .orderBy(desc(configVersions.version))
      .all()
  }

  getVersion(
    name: string,
    version: number,
  ): { version: number; content: unknown; createdAt: string | null } | undefined {
    return this.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.configName, name))
      .all()
      .find((v) => v.version === version)
  }

  delete(name: string): void {
    this.db.delete(configs).where(eq(configs.name, name)).run()
    this.db.delete(configVersions).where(eq(configVersions.configName, name)).run()
  }
}
