import { describe, expect, it, vi } from 'vitest'
import type { AgentDao } from '../../dao/agent.dao'
import type { ChannelPostingRuleDao } from '../../dao/channel-posting-rule.dao'
import type { UserDao } from '../../dao/user.dao'
import { ChannelPostingRuleService } from '../channel-posting-rule.service'

describe('ChannelPostingRuleService', () => {
  // Mock DAOs
  const createMockChannelPostingRuleDao = () => ({
    findByChannelId: vi.fn(),
    findRecordByChannelId: vi.fn(),
    upsert: vi.fn(),
    deleteByChannelId: vi.fn(),
    exists: vi.fn(),
  })

  const createMockUserDao = () => ({
    findById: vi.fn(),
  })

  const createMockAgentDao = () => ({
    findByUserId: vi.fn(),
  })

  const createService = () => {
    const channelPostingRuleDao = createMockChannelPostingRuleDao()
    const userDao = createMockUserDao()
    const agentDao = createMockAgentDao()

    const service = new ChannelPostingRuleService({
      channelPostingRuleDao: channelPostingRuleDao as unknown as ChannelPostingRuleDao,
      userDao: userDao as unknown as UserDao,
      agentDao: agentDao as unknown as AgentDao,
    })

    return {
      service,
      channelPostingRuleDao,
      userDao,
      agentDao,
    }
  }

  describe('getRule', () => {
    it('should return null when no rule exists', async () => {
      const { service, channelPostingRuleDao } = createService()
      channelPostingRuleDao.findByChannelId.mockResolvedValue(null)

      const result = await service.getRule('channel-1')

      expect(result).toBeNull()
      expect(channelPostingRuleDao.findByChannelId).toHaveBeenCalledWith('channel-1')
    })

    it('should return rule when it exists', async () => {
      const { service, channelPostingRuleDao } = createService()
      const mockRule = { ruleType: 'read_only', config: {} }
      channelPostingRuleDao.findByChannelId.mockResolvedValue(mockRule)

      const result = await service.getRule('channel-1')

      expect(result).toEqual(mockRule)
    })
  })

  describe('setRule', () => {
    it('should create a new rule', async () => {
      const { service, channelPostingRuleDao } = createService()
      const newRule = { ruleType: 'humans_only', config: {} }
      channelPostingRuleDao.upsert.mockResolvedValue(newRule)

      const result = await service.setRule('channel-1', 'humans_only')

      expect(result).toEqual(newRule)
      expect(channelPostingRuleDao.upsert).toHaveBeenCalledWith(
        'channel-1',
        'humans_only',
        undefined,
      )
    })

    it('should create rule with config for specific_users', async () => {
      const { service, channelPostingRuleDao } = createService()
      const config = { allowedUserIds: ['user-1', 'user-2'] }
      const newRule = { ruleType: 'specific_users', config }
      channelPostingRuleDao.upsert.mockResolvedValue(newRule)

      const result = await service.setRule('channel-1', 'specific_users', config)

      expect(result).toEqual(newRule)
      expect(channelPostingRuleDao.upsert).toHaveBeenCalledWith(
        'channel-1',
        'specific_users',
        config,
      )
    })
  })

  describe('removeRule', () => {
    it('should delete the rule', async () => {
      const { service, channelPostingRuleDao } = createService()
      channelPostingRuleDao.deleteByChannelId.mockResolvedValue(undefined)

      await service.removeRule('channel-1')

      expect(channelPostingRuleDao.deleteByChannelId).toHaveBeenCalledWith('channel-1')
    })
  })

  describe('canPost', () => {
    it('should allow post when no rule exists (default everyone)', async () => {
      const { service, channelPostingRuleDao, userDao } = createService()
      channelPostingRuleDao.findByChannelId.mockResolvedValue(null)

      const result = await service.canPost('channel-1', 'user-1')

      expect(result).toEqual({ allowed: true })
      expect(userDao.findById).not.toHaveBeenCalled()
    })

    it('should allow post for everyone rule', async () => {
      const { service, channelPostingRuleDao } = createService()
      channelPostingRuleDao.findByChannelId.mockResolvedValue({ ruleType: 'everyone' })

      const result = await service.canPost('channel-1', 'user-1')

      expect(result).toEqual({ allowed: true })
    })

    it('should deny post for read_only rule', async () => {
      const { service, channelPostingRuleDao } = createService()
      channelPostingRuleDao.findByChannelId.mockResolvedValue({ ruleType: 'read_only' })

      const result = await service.canPost('channel-1', 'user-1')

      expect(result).toEqual({
        allowed: false,
        reason: 'This channel is read-only',
        ruleType: 'read_only',
      })
    })

    it('should deny post for humans_only when user is bot', async () => {
      const { service, channelPostingRuleDao, userDao } = createService()
      channelPostingRuleDao.findByChannelId.mockResolvedValue({ ruleType: 'humans_only' })
      userDao.findById.mockResolvedValue({ id: 'user-1', isBot: true })

      const result = await service.canPost('channel-1', 'user-1')

      expect(result).toEqual({
        allowed: false,
        reason: 'Only humans can post in this channel',
        ruleType: 'humans_only',
      })
      expect(userDao.findById).toHaveBeenCalledWith('user-1')
    })

    it('should allow post for humans_only when user is human', async () => {
      const { service, channelPostingRuleDao, userDao } = createService()
      channelPostingRuleDao.findByChannelId.mockResolvedValue({ ruleType: 'humans_only' })
      userDao.findById.mockResolvedValue({ id: 'user-1', isBot: false })

      const result = await service.canPost('channel-1', 'user-1')

      expect(result).toEqual({ allowed: true })
    })

    it('should deny post for buddies_only when user is not a buddy', async () => {
      const { service, channelPostingRuleDao, userDao, agentDao } = createService()
      channelPostingRuleDao.findByChannelId.mockResolvedValue({ ruleType: 'buddies_only' })
      userDao.findById.mockResolvedValue({ id: 'user-1', isBot: false })
      agentDao.findByUserId.mockResolvedValue(null)

      const result = await service.canPost('channel-1', 'user-1')

      expect(result).toEqual({
        allowed: false,
        reason: 'Only buddies can post in this channel',
        ruleType: 'buddies_only',
      })
      expect(agentDao.findByUserId).toHaveBeenCalledWith('user-1')
    })

    it('should allow post for buddies_only when user is a buddy', async () => {
      const { service, channelPostingRuleDao, userDao, agentDao } = createService()
      channelPostingRuleDao.findByChannelId.mockResolvedValue({ ruleType: 'buddies_only' })
      userDao.findById.mockResolvedValue({ id: 'user-1', isBot: false })
      agentDao.findByUserId.mockResolvedValue({ id: 'agent-1', userId: 'user-1' })

      const result = await service.canPost('channel-1', 'user-1')

      expect(result).toEqual({ allowed: true })
    })

    it('should deny post for specific_users when user not in list', async () => {
      const { service, channelPostingRuleDao, userDao } = createService()
      channelPostingRuleDao.findByChannelId.mockResolvedValue({
        ruleType: 'specific_users',
        config: { allowedUserIds: ['user-2', 'user-3'] },
      })
      userDao.findById.mockResolvedValue({ id: 'user-1', isBot: false })

      const result = await service.canPost('channel-1', 'user-1')

      expect(result).toEqual({
        allowed: false,
        reason: 'You are not authorized to post in this channel',
        ruleType: 'specific_users',
      })
    })

    it('should allow post for specific_users when user is in list', async () => {
      const { service, channelPostingRuleDao, userDao } = createService()
      channelPostingRuleDao.findByChannelId.mockResolvedValue({
        ruleType: 'specific_users',
        config: { allowedUserIds: ['user-1', 'user-2'] },
      })
      userDao.findById.mockResolvedValue({ id: 'user-1', isBot: false })

      const result = await service.canPost('channel-1', 'user-1')

      expect(result).toEqual({ allowed: true })
    })

    it('should return error when user not found', async () => {
      const { service, channelPostingRuleDao, userDao } = createService()
      channelPostingRuleDao.findByChannelId.mockResolvedValue({ ruleType: 'humans_only' })
      userDao.findById.mockResolvedValue(null)

      const result = await service.canPost('channel-1', 'user-1')

      expect(result).toEqual({
        allowed: false,
        reason: 'User not found',
      })
    })
  })

  describe('hasRule', () => {
    it('should return true when rule exists', async () => {
      const { service, channelPostingRuleDao } = createService()
      channelPostingRuleDao.exists.mockResolvedValue(true)

      const result = await service.hasRule('channel-1')

      expect(result).toBe(true)
      expect(channelPostingRuleDao.exists).toHaveBeenCalledWith('channel-1')
    })

    it('should return false when rule does not exist', async () => {
      const { service, channelPostingRuleDao } = createService()
      channelPostingRuleDao.exists.mockResolvedValue(false)

      const result = await service.hasRule('channel-1')

      expect(result).toBe(false)
    })
  })
})
