import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MembershipService } from '../src/services/membership.service'

describe('MembershipService', () => {
  const userDao = {
    findById: vi.fn(),
  }
  const inviteCodeDao = {
    findByUsedBy: vi.fn(),
    findAvailable: vi.fn(),
    markUsed: vi.fn(),
  }

  const service = new MembershipService({
    userDao: userDao as never,
    inviteCodeDao: inviteCodeDao as never,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    userDao.findById.mockResolvedValue({
      id: 'user-1',
      isAdmin: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    inviteCodeDao.findByUsedBy.mockResolvedValue(null)
  })

  it('treats users without a redeemed invite as visitors', async () => {
    const result = await service.getMembership('user-1')

    expect(result.status).toBe('visitor')
    expect(result.level).toBe(0)
    expect(result.tier.id).toBe('visitor')
    expect(result.isMember).toBe(false)
    expect(result.capabilities).toEqual(['server:create'])
  })

  it('grants member capabilities after invite redemption', async () => {
    inviteCodeDao.findAvailable.mockResolvedValue({
      id: 'invite-1',
      usedAt: null,
    })
    inviteCodeDao.findByUsedBy.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'invite-1',
      usedAt: new Date('2026-01-02T00:00:00Z'),
    })

    const result = await service.redeemInviteCode('user-1', 'abc123')

    expect(inviteCodeDao.findAvailable).toHaveBeenCalledWith('ABC123')
    expect(inviteCodeDao.markUsed).toHaveBeenCalledWith('invite-1', 'user-1')
    expect(result.status).toBe('member')
    expect(result.level).toBeGreaterThan(0)
    expect(result.tier.id).toBe('member')
    expect(result.capabilities).toContain('cloud:deploy')
  })

  it('blocks advanced capabilities for visitors', async () => {
    await expect(service.requireMember('user-1', 'cloud:deploy')).rejects.toMatchObject({
      status: 403,
      code: 'INVITE_REQUIRED',
    })
  })

  it('allows visitors to create servers without an invite code', async () => {
    const result = await service.requireMember('user-1', 'server:create')

    expect(result.status).toBe('visitor')
    expect(result.capabilities).toContain('server:create')
  })
})
