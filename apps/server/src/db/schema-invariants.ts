import { sql } from 'drizzle-orm'
import type { Database } from './index'

export const REQUIRED_CLOUD_DEPLOYMENT_STATUS_VALUES = [
  'pending',
  'deploying',
  'deployed',
  'paused',
  'resuming',
  'failed',
  'destroying',
  'destroyed',
  'cancelling',
] as const

type EnumLabelRow = {
  enumlabel: string
}

/**
 * Fail fast when a database has drifted from the application state machine.
 * This keeps the cloud deployment processor from starting and repeatedly
 * polling with enum values the database cannot parse.
 */
export async function assertCloudDeploymentStatusEnumValues(
  database: Pick<Database, 'execute'>,
): Promise<void> {
  const rows = await database.execute<EnumLabelRow>(sql`
    SELECT e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'cloud_deployment_status'
  `)
  const actual = new Set(rows.map((row) => row.enumlabel))
  const missing = REQUIRED_CLOUD_DEPLOYMENT_STATUS_VALUES.filter((value) => !actual.has(value))
  if (missing.length === 0) return

  throw new Error(
    `cloud_deployment_status enum is missing value(s): ${missing.join(', ')}. ` +
      'Run pending database migrations before starting the server.',
  )
}
