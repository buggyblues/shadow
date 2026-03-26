import { integer, jsonb, pgTable, timestamp, uuid, date, varchar } from 'drizzle-orm/pg-core'
import { agents } from './agents'

/**
 * Agent daily activity statistics
 * Tracks daily message counts and online time for dashboard heatmap
 */
export const agentDailyStats = pgTable('agent_daily_stats', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  messageCount: integer('message_count').default(0).notNull(),
  onlineSeconds: integer('online_seconds').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

/**
 * Agent hourly activity distribution
 * Aggregated statistics for hour-of-day activity patterns
 */
export const agentHourlyStats = pgTable('agent_hourly_stats', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  hourOfDay: integer('hour_of_day').notNull(), // 0-23
  messageCount: integer('message_count').default(0).notNull(),
  activityCount: integer('activity_count').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

/**
 * Agent activity events
 * Recent events for activity feed (kept for 90 days)
 */
export const agentActivityEvents = pgTable('agent_activity_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'message', 'status_change', 'rental_start', 'rental_end', 'policy_update'
  eventData: jsonb('event_data').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
