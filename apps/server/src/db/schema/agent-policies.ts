import { boolean, index, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { agents } from './agents'
import { channels } from './channels'
import { servers } from './servers'

/**
 * Agent policies — per-agent, per-server/channel strategy table.
 *
 * When channelId is null, the policy applies as the server-wide default.
 * Channel-level policies override the server default.
 *
 * The `config` jsonb column is extensible for future strategy fields.
 */
export const agentPolicies = pgTable('agent_policies', {
  id: uuid('id').primaryKey().defaultRandom(),

  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),

  serverId: uuid('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),

  /** null = server-wide default policy */
  channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }),

  /** Whether the agent listens on this server/channel */
  listen: boolean('listen').default(true).notNull(),

  /** Whether the agent replies on this server/channel */
  reply: boolean('reply').default(true).notNull(),

  /** Only reply when the agent is @mentioned */
  mentionOnly: boolean('mention_only').default(false).notNull(),

  /** Extensible config for future strategy fields */
  config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    agentPoliciesAgentIdIdx: index('agent_policies_agent_id_idx').on(t.agentId),
    agentPoliciesServerIdIdx: index('agent_policies_server_id_idx').on(t.serverId),
    agentPoliciesChannelIdIdx: index('agent_policies_channel_id_idx').on(t.channelId),
  }),
)
