import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './users'

export const configEnvEnum = pgEnum('config_env', ['dev', 'staging', 'prod'])

// ── Schema registry ───────────────────────────────────────────────────────────
export const configSchemas = pgTable('config_schemas', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(), // e.g. "homepage-plays"
  displayName: text('display_name').notNull(),
  description: text('description'),
  jsonSchema: jsonb('json_schema').notNull(), // JSON Schema definition
  uiSchema: jsonb('ui_schema').notNull().default({}), // RJSF UISchema
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── Config values with versioning ─────────────────────────────────────────────
export const configValues = pgTable(
  'config_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schemaId: uuid('schema_id')
      .notNull()
      .references(() => configSchemas.id, { onDelete: 'cascade' }),
    environment: configEnvEnum('environment').notNull(),
    version: integer('version').notNull(), // auto-increment per schema+env
    data: jsonb('data').notNull(), // actual config payload
    isPublished: boolean('is_published').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    schemaEnvVersionUniq: unique('config_values_schema_env_version_uniq').on(
      t.schemaId,
      t.environment,
      t.version,
    ),
    schemaEnvIdx: index('config_values_schema_env_idx').on(t.schemaId, t.environment),
  }),
)

// ── Feature flags ─────────────────────────────────────────────────────────────
export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(), // e.g. "enable-new-onboarding"
  description: text('description'),
  // { dev: boolean, staging: boolean, prod: boolean }
  envs: jsonb('envs')
    .notNull()
    .default({ dev: false, staging: false, prod: false })
    .$type<{ dev: boolean; staging: boolean; prod: boolean }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
