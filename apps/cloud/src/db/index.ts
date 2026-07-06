/**
 * Database — SQLite via Drizzle ORM.
 *
 * Stores templates (seed), secrets (encrypted), configs, deployments, and activity.
 * Data lives at ~/.shadowob/cloud.db by default.
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'

export type CloudDatabase = Awaited<ReturnType<typeof createDatabase>>

export async function createDatabase(dbPath?: string) {
  const resolvedPath = dbPath ?? join(homedir(), '.shadowob', 'cloud.db')
  await mkdir(join(homedir(), '.shadowob'), { recursive: true })
  const sqlite = new Database(resolvedPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}
