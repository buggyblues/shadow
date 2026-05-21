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

export const REQUIRED_CLOUD_TEMPLATE_REVIEW_STATUS_VALUES = [
  'pending',
  'approved',
  'rejected',
  'draft',
] as const

export const REQUIRED_CLOUD_ACTIVITY_TYPE_VALUES = ['template_delete'] as const

export const REQUIRED_CLOUD_TEMPLATE_COLUMNS = ['review_note'] as const

type EnumLabelRow = {
  enumlabel: string
}

type ColumnNameRow = {
  column_name: string
}

/**
 * Fail fast when a database has drifted from the application state machine.
 * This keeps the cloud deployment processor from starting and repeatedly
 * polling with enum values the database cannot parse.
 */
export async function assertCloudDeploymentStatusEnumValues(
  database: Pick<Database, 'execute'>,
): Promise<void> {
  await assertEnumValues(
    database,
    'cloud_deployment_status',
    REQUIRED_CLOUD_DEPLOYMENT_STATUS_VALUES,
  )
}

export async function assertDatabaseSchemaInvariants(
  database: Pick<Database, 'execute'>,
): Promise<void> {
  await assertCloudDeploymentStatusEnumValues(database)
  await assertEnumValues(
    database,
    'cloud_template_review_status',
    REQUIRED_CLOUD_TEMPLATE_REVIEW_STATUS_VALUES,
  )
  await assertEnumValues(database, 'cloud_activity_type', REQUIRED_CLOUD_ACTIVITY_TYPE_VALUES)
  await assertTableColumns(database, 'cloud_templates', REQUIRED_CLOUD_TEMPLATE_COLUMNS)
}

async function assertEnumValues(
  database: Pick<Database, 'execute'>,
  enumName: string,
  requiredValues: readonly string[],
): Promise<void> {
  const rows = await database.execute<EnumLabelRow>(sql`
    SELECT e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = ${enumName}
  `)
  const actual = new Set(rows.map((row) => row.enumlabel))
  const missing = requiredValues.filter((value) => !actual.has(value))
  if (missing.length === 0) return

  throw new Error(
    `${enumName} enum is missing value(s): ${missing.join(', ')}. ` +
      'Run pending database migrations before starting the server.',
  )
}

async function assertTableColumns(
  database: Pick<Database, 'execute'>,
  tableName: string,
  requiredColumns: readonly string[],
): Promise<void> {
  const rows = await database.execute<ColumnNameRow>(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
  `)
  const actual = new Set(rows.map((row) => row.column_name))
  const missing = requiredColumns.filter((column) => !actual.has(column))
  if (missing.length === 0) return

  throw new Error(
    `${tableName} table is missing column(s): ${missing.join(', ')}. ` +
      'Run pending database migrations before starting the server.',
  )
}
