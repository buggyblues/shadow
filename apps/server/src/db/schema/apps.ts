import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { channels } from './channels'
import { servers } from './servers'
import { users } from './users'

export const appSourceEnum = pgEnum('app_source', ['zip', 'url'])
export const appStatusEnum = pgEnum('app_status', ['draft', 'active', 'archived'])

/**
 * Server apps — each app belongs to a server and has an associated hidden channel
 * for WebSocket messaging (Buddy interaction, real-time state broadcast).
 *
 * sourceType:
 *   - 'zip'  → uploaded Web application (contentRef points to MinIO object)
 *   - 'url'  → external Web URL loaded in iframe
 *
 * The special `isHomepage` flag designates the app as the server homepage,
 * replacing the legacy servers.homepageHtml field.
 */
export const apps = pgTable('apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  serverId: uuid('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  /** The user who published this app */
  publisherId: uuid('publisher_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Hidden channel associated with this app (not shown in sidebar) */
  channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),

  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 200 }),
  description: text('description'),
  iconUrl: text('icon_url'),
  bannerUrl: text('banner_url'),

  sourceType: appSourceEnum('source_type').notNull(),
  /** For 'url' → the external URL; for 'zip' → MinIO object key */
  sourceUrl: text('source_url').notNull(),
  /** Version string for zip apps (incremented on re-publish) */
  version: varchar('version', { length: 50 }),

  status: appStatusEnum('status').default('draft').notNull(),
  /** When true, this app is rendered as the server homepage */
  isHomepage: boolean('is_homepage').default(false).notNull(),

  /** Flexible settings (e.g. permissions, display preferences) */
  settings: jsonb('settings').$type<Record<string, unknown>>(),

  /** Denormalized counters */
  viewCount: integer('view_count').default(0).notNull(),
  userCount: integer('user_count').default(0).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    appsServerIdIdx: index('apps_server_id_idx').on(t.serverId),
    appsChannelIdIdx: index('apps_channel_id_idx').on(t.channelId),
  }),
)
