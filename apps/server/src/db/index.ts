import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@localhost:5432/shadow'

const queryClient = postgres(connectionString)
export const workerLockClient = postgres(connectionString, { max: 1 })

export const db = drizzle(queryClient, { schema })

export type Database = typeof db
