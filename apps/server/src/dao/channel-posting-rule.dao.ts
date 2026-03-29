import type { ChannelPostingRule, ChannelPostingRuleType } from '@shadowob/shared'
import { eq } from 'drizzle-orm'
import type { Database } from '../db'
import { channelPostingRules } from '../db/schema'

export class ChannelPostingRuleDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  /** Find posting rule by channel ID */
  async findByChannelId(channelId: string): Promise<ChannelPostingRule | null> {
    const result = await this.db
      .select({
        ruleType: channelPostingRules.ruleType,
        config: channelPostingRules.config,
      })
      .from(channelPostingRules)
      .where(eq(channelPostingRules.channelId, channelId))
      .limit(1)

    if (result.length === 0 || !result[0]) return null

    return {
      ruleType: result[0].ruleType as ChannelPostingRuleType,
      config: (result[0].config as { allowedUserIds?: string[] }) || undefined,
    }
  }

  /** Find raw rule record by channel ID (for internal use) */
  async findRecordByChannelId(channelId: string) {
    const result = await this.db
      .select()
      .from(channelPostingRules)
      .where(eq(channelPostingRules.channelId, channelId))
      .limit(1)
    return result[0] ?? null
  }

  /** Create or update posting rule for a channel */
  async upsert(
    channelId: string,
    ruleType: ChannelPostingRuleType,
    config?: { allowedUserIds?: string[] },
  ): Promise<ChannelPostingRule> {
    const existing = await this.findRecordByChannelId(channelId)

    if (existing) {
      // Update existing rule
      await this.db
        .update(channelPostingRules)
        .set({
          ruleType,
          config: config || {},
          updatedAt: new Date(),
        })
        .where(eq(channelPostingRules.id, existing.id))
    } else {
      // Create new rule
      await this.db.insert(channelPostingRules).values({
        channelId,
        ruleType,
        config: config || {},
      })
    }

    return {
      ruleType,
      config,
    }
  }

  /** Delete posting rule for a channel */
  async deleteByChannelId(channelId: string): Promise<void> {
    await this.db.delete(channelPostingRules).where(eq(channelPostingRules.channelId, channelId))
  }

  /** Check if a channel has a posting rule */
  async exists(channelId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: channelPostingRules.id })
      .from(channelPostingRules)
      .where(eq(channelPostingRules.channelId, channelId))
      .limit(1)
    return result.length > 0
  }
}
