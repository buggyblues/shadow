import { boolean, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { agents } from './agents'
import { servers } from './servers'
import { channels } from './channels'
import { users } from './users'

/**
 * Visibility levels for Buddies:
 * - public: Visible and interactable by all server members (default)
 * - private: Only visible and interactable by explicitly allowed users
 * - restricted: Future use - visible but with limited interaction
 */
export const buddyVisibilityEnum = pgEnum('buddy_visibility', [
  'public',
  'private',
  'restricted',
])

/**
 * Buddy permissions table - user-level permission grants
 *
 * Controls which users can see, interact with, mention, or manage a Buddy.
 * Supports both server-wide and channel-specific permissions.
 *
 * Permission resolution order:
 * 1. Check Buddy visibility level (public/private)
 * 2. Check channel-specific permission (if exists)
 * 3. Check server-wide permission (if exists)
 * 4. Apply default based on visibility setting
 */
export const buddyPermissions = pgTable('buddy_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),

  // The Buddy being controlled
  buddyId: uuid('buddy_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),

  // The server scope
  serverId: uuid('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),

  // null = server-wide permission; set = channel-specific override
  channelId: uuid('channel_id').references(() => channels.id, {
    onDelete: 'cascade',
  }),

  // The user receiving permissions
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Permission flags
  canView: boolean('can_view').default(true).notNull(),
  canInteract: boolean('can_interact').default(true).notNull(),
  canMention: boolean('can_mention').default(true).notNull(),
  canManage: boolean('can_manage').default(false).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

/**
 * Buddy server settings table - per-server visibility configuration
 *
 * Stores the visibility level and default permissions for a Buddy in a server.
 * When isPrivate is true, the Buddy will only be visible to users with
 * explicit permissions in the buddy_permissions table.
 */
export const buddyServerSettings = pgTable('buddy_server_settings', {
  id: uuid('id').primaryKey().defaultRandom(),

  // The Buddy being configured
  buddyId: uuid('buddy_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),

  // The server scope
  serverId: uuid('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),

  // Visibility level for this server
  visibility: buddyVisibilityEnum('visibility').default('public').notNull(),

  // If true, only users with explicit permissions can see/interact
  isPrivate: boolean('is_private').default(false).notNull(),

  // Default permissions for users when isPrivate is true
  // (used as fallback when no explicit permission exists)
  defaultCanView: boolean('default_can_view').default(false).notNull(),
  defaultCanInteract: boolean('default_can_interact').default(false).notNull(),
  defaultCanMention: boolean('default_can_mention').default(false).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
