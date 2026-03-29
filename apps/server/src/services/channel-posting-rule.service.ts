import type { ChannelPostingRule, ChannelPostingRuleType } from '@shadowob/shared'
import type { AgentDao } from '../dao/agent.dao'
import type { ChannelPostingRuleDao } from '../dao/channel-posting-rule.dao'
import type { UserDao } from '../dao/user.dao'

export interface CanPostResult {
  allowed: boolean
  reason?: string
  ruleType?: ChannelPostingRuleType
}

export class ChannelPostingRuleService {
  constructor(
    private deps: {
      channelPostingRuleDao: ChannelPostingRuleDao
      userDao: UserDao
      agentDao: AgentDao
    },
  ) {}

  /** Get posting rule for a channel */
  async getRule(channelId: string): Promise<ChannelPostingRule | null> {
    return this.deps.channelPostingRuleDao.findByChannelId(channelId)
  }

  /** Set or update posting rule for a channel */
  async setRule(
    channelId: string,
    ruleType: ChannelPostingRuleType,
    config?: { allowedUserIds?: string[] },
  ): Promise<ChannelPostingRule> {
    return this.deps.channelPostingRuleDao.upsert(channelId, ruleType, config)
  }

  /** Remove posting rule from a channel (defaults to everyone) */
  async removeRule(channelId: string): Promise<void> {
    await this.deps.channelPostingRuleDao.deleteByChannelId(channelId)
  }

  /** Check if a user can post in a channel */
  async canPost(channelId: string, userId: string): Promise<CanPostResult> {
    const rule = await this.getRule(channelId)

    // Default: everyone can post
    if (!rule || rule.ruleType === 'everyone') {
      return { allowed: true }
    }

    // Check read_only before fetching user (optimization)
    if (rule.ruleType === 'read_only') {
      return { allowed: false, reason: 'This channel is read-only', ruleType: 'read_only' }
    }

    const user = await this.deps.userDao.findById(userId)
    if (!user) {
      return { allowed: false, reason: 'User not found' }
    }

    switch (rule.ruleType) {
      case 'humans_only':
        if (user.isBot) {
          return {
            allowed: false,
            reason: 'Only humans can post in this channel',
            ruleType: 'humans_only',
          }
        }
        return { allowed: true }

      case 'buddies_only': {
        // Check if user is a buddy agent
        const agent = await this.deps.agentDao.findByUserId(userId)
        if (!agent) {
          return {
            allowed: false,
            reason: 'Only buddies can post in this channel',
            ruleType: 'buddies_only',
          }
        }
        return { allowed: true }
      }

      case 'specific_users': {
        const allowedUserIds = rule.config?.allowedUserIds || []
        if (!allowedUserIds.includes(userId)) {
          return {
            allowed: false,
            reason: 'You are not authorized to post in this channel',
            ruleType: 'specific_users',
          }
        }
        return { allowed: true }
      }

      default:
        return { allowed: true }
    }
  }

  /** Check if a channel has a posting rule */
  async hasRule(channelId: string): Promise<boolean> {
    return this.deps.channelPostingRuleDao.exists(channelId)
  }
}
