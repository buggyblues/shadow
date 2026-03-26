import { index, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const profileComments = pgTable(
  'profile_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileUserId: uuid('profile_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    parentId: uuid('parent_id').references((): typeof profileComments => profileComments, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_profile_comments_profile_user_id').on(t.profileUserId),
    index('idx_profile_comments_author_id').on(t.authorId),
    index('idx_profile_comments_parent_id').on(t.parentId),
  ],
)

export const profileCommentReactions = pgTable(
  'profile_comment_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commentId: uuid('comment_id')
      .notNull()
      .references(() => profileComments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('profile_comment_reactions_unique').on(t.commentId, t.userId, t.emoji),
    index('idx_profile_comment_reactions_comment_id').on(t.commentId),
    index('idx_profile_comment_reactions_user_id').on(t.userId),
  ],
)
