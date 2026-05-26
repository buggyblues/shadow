import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 8,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => undefined,
  })
  const db = drizzle(client, { schema })
  return { db, client }
}

export type SpaceDatabase = ReturnType<typeof createDatabase>['db']
