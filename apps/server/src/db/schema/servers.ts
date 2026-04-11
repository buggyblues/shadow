import { boolean, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const servers = pgTable(
  'servers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    slug: varchar('slug', { length: 100 }).unique(),
    iconUrl: text('icon_url'),
    bannerUrl: text('banner_url'),
    homepageHtml: text('homepage_html'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    inviteCode: varchar('invite_code', { length: 8 }).notNull().unique(),
    isPublic: boolean('is_public').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    serversOwnerIdIdx: index('servers_owner_id_idx').on(t.ownerId),
  }),
)
