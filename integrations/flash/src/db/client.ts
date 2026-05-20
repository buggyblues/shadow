import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 8,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => undefined,
  })
  const db = drizzle(client)
  return { db, client }
}

export type FlashDatabase = ReturnType<typeof createDatabase>['db']
