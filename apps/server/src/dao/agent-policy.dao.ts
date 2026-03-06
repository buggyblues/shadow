import { and, eq, isNull } from 'drizzle-orm'
import type { Database } from '../db'
import { agentPolicies } from '../db/schema'

export class AgentPolicyDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  /** Find all policies for a given agent */
  async findByAgentId(agentId: string) {
    return this.db.select().from(agentPolicies).where(eq(agentPolicies.agentId, agentId))
  }

  /** Find all policies for a given agent in a specific server */
  async findByAgentAndServer(agentId: string, serverId: string) {
    return this.db
      .select()
      .from(agentPolicies)
      .where(and(eq(agentPolicies.agentId, agentId), eq(agentPolicies.serverId, serverId)))
  }

  /** Find the server-wide default policy (channelId is null) */
  async findServerDefault(agentId: string, serverId: string) {
    const result = await this.db
      .select()
      .from(agentPolicies)
      .where(
        and(
          eq(agentPolicies.agentId, agentId),
          eq(agentPolicies.serverId, serverId),
          isNull(agentPolicies.channelId),
        ),
      )
      .limit(1)
    return result[0] ?? null
  }

  /** Find a channel-specific policy */
  async findByChannel(agentId: string, serverId: string, channelId: string) {
    const result = await this.db
      .select()
      .from(agentPolicies)
      .where(
        and(
          eq(agentPolicies.agentId, agentId),
          eq(agentPolicies.serverId, serverId),
          eq(agentPolicies.channelId, channelId),
        ),
      )
      .limit(1)
    return result[0] ?? null
  }

  /** Upsert a policy (insert or update on conflict) */
  async upsert(data: {
    agentId: string
    serverId: string
    channelId?: string | null
    listen?: boolean
    reply?: boolean
    mentionOnly?: boolean
    config?: Record<string, unknown>
  }) {
    // Try to find existing
    const existing = data.channelId
      ? await this.findByChannel(data.agentId, data.serverId, data.channelId)
      : await this.findServerDefault(data.agentId, data.serverId)

    const now = new Date()

    if (existing) {
      const result = await this.db
        .update(agentPolicies)
        .set({
          listen: data.listen ?? existing.listen,
          reply: data.reply ?? existing.reply,
          mentionOnly: data.mentionOnly ?? existing.mentionOnly,
          config: data.config ?? existing.config,
          updatedAt: now,
        })
        .where(eq(agentPolicies.id, existing.id))
        .returning()
      return result[0]
    }

    const result = await this.db
      .insert(agentPolicies)
      .values({
        agentId: data.agentId,
        serverId: data.serverId,
        channelId: data.channelId ?? null,
        listen: data.listen ?? true,
        reply: data.reply ?? true,
        mentionOnly: data.mentionOnly ?? false,
        config: data.config ?? {},
      })
      .returning()
    return result[0]
  }

  /** Batch upsert policies */
  async batchUpsert(
    policies: Array<{
      agentId: string
      serverId: string
      channelId?: string | null
      listen?: boolean
      reply?: boolean
      mentionOnly?: boolean
      config?: Record<string, unknown>
    }>,
  ) {
    const results = []
    for (const policy of policies) {
      const result = await this.upsert(policy)
      results.push(result)
    }
    return results
  }

  /** Delete a specific policy */
  async delete(id: string) {
    await this.db.delete(agentPolicies).where(eq(agentPolicies.id, id))
  }

  /** Delete all policies for an agent in a server */
  async deleteByAgentAndServer(agentId: string, serverId: string) {
    await this.db
      .delete(agentPolicies)
      .where(and(eq(agentPolicies.agentId, agentId), eq(agentPolicies.serverId, serverId)))
  }
}
