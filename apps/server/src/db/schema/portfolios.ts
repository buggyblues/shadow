/**
 * Portfolio Schema - Buddy Portfolio Feature
 * 
 * Portfolios enable users and their Buddy (AI agents) to showcase creative works
 * on their profile pages. Works originate from channel attachments.
 */
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { attachments } from './attachments'
import { users } from './users'

export const portfolioVisibilityEnum = pgEnum('portfolio_visibility', [
  'public',
  'private',
  'unlisted',
])

export const portfolioStatusEnum = pgEnum('portfolio_status', [
  'draft',
  'published',
  'archived',
])

/**
 * Portfolio items - creative works displayed on user profiles
 */
export const portfolios = pgTable('portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Owner (user or Buddy's bot user)
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Source attachment (from channel message)
  attachmentId: uuid('attachment_id').references(() => attachments.id, {
    onDelete: 'set null',
  }),

  // Content
  title: varchar('title', { length: 200 }),
  description: text('description'),

  // File metadata (denormalized from attachment for independent updates)
  fileUrl: text('file_url').notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  fileWidth: integer('file_width'),
  fileHeight: integer('file_height'),

  // Thumbnail (generated for previews)
  thumbnailUrl: text('thumbnail_url'),

  // Status & visibility
  visibility: portfolioVisibilityEnum('visibility').notNull().default('public'),
  status: portfolioStatusEnum('status').notNull().default('published'),

  // Denormalized counters (for performance)
  likeCount: integer('like_count').notNull().default(0),
  favoriteCount: integer('favorite_count').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  viewCount: integer('view_count').notNull().default(0),

  // Tags for categorization
  tags: text('tags').array().default([]),

  // Metadata for extensibility
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

/**
 * Like records for portfolio items
 */
export const portfolioLikes = pgTable(
  'portfolio_likes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('portfolio_likes_unique').on(t.portfolioId, t.userId)],
)

/**
 * Favorite/bookmark records for portfolio items
 */
export const portfolioFavorites = pgTable(
  'portfolio_favorites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('portfolio_favorites_unique').on(t.portfolioId, t.userId)],
)

/**
 * Comments on portfolio items (supports nested replies)
 */
export const portfolioComments = pgTable('portfolio_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  isEdited: boolean('is_edited').default(false).notNull(),
})

// Type exports
export type Portfolio = typeof portfolios.$inferSelect
export type NewPortfolio = typeof portfolios.$inferInsert
export type PortfolioLike = typeof portfolioLikes.$inferSelect
export type PortfolioFavorite = typeof portfolioFavorites.$inferSelect
export type PortfolioComment = typeof portfolioComments.$inferSelect