import type { InviteCodeDao } from '../dao/invite-code.dao'
import type { UserDao } from '../dao/user.dao'

export type MembershipCapability =
  | 'cloud:deploy'
  | 'cloud:diy_generate'
  | 'server:create'
  | 'invite:create'
  | 'oauth_app:create'
  | string

export type MembershipTierId = 'visitor' | 'member' | string

export interface MembershipTier {
  id: MembershipTierId
  level: number
  label: string
  capabilities: MembershipCapability[]
}

export interface MembershipSnapshot {
  status: MembershipTierId
  tier: MembershipTier
  level: number
  isMember: boolean
  memberSince: Date | null
  inviteCodeId: string | null
  capabilities: MembershipCapability[]
}

const BASE_AUTHENTICATED_CAPABILITIES: MembershipCapability[] = ['server:create']

export const MEMBERSHIP_TIERS = {
  visitor: {
    id: 'visitor',
    level: 0,
    label: 'Visitor',
    capabilities: [],
  },
  member: {
    id: 'member',
    level: 10,
    label: 'Member',
    capabilities: ['cloud:deploy', 'cloud:diy_generate', 'invite:create', 'oauth_app:create'],
  },
} satisfies Record<string, MembershipTier>

export class MembershipService {
  constructor(
    private deps: {
      inviteCodeDao: InviteCodeDao
      userDao: UserDao
    },
  ) {}

  async getMembership(userId: string): Promise<MembershipSnapshot> {
    const user = await this.deps.userDao.findById(userId)
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 })
    }

    const usedInvite = await this.deps.inviteCodeDao.findByUsedBy(userId)
    const tier = user.isAdmin || usedInvite ? MEMBERSHIP_TIERS.member : MEMBERSHIP_TIERS.visitor
    const isMember = tier.level > MEMBERSHIP_TIERS.visitor.level

    return {
      status: tier.id,
      tier,
      level: tier.level,
      isMember,
      memberSince: usedInvite?.usedAt ?? (user.isAdmin ? user.createdAt : null),
      inviteCodeId: usedInvite?.id ?? null,
      capabilities: [...new Set([...BASE_AUTHENTICATED_CAPABILITIES, ...tier.capabilities])],
    }
  }

  async requireMember(userId: string, capability: MembershipCapability) {
    const membership = await this.getMembership(userId)
    if (!membership.capabilities.includes(capability)) {
      throw Object.assign(new Error('Invite code required for this advanced capability'), {
        status: 403,
        code: 'INVITE_REQUIRED',
        capability,
        membership,
      })
    }
    return membership
  }

  async redeemInviteCode(userId: string, code: string) {
    const current = await this.getMembership(userId)
    if (current.isMember) return current

    const inviteCode = await this.deps.inviteCodeDao.findAvailable(code.trim().toUpperCase())
    if (!inviteCode) {
      throw Object.assign(new Error('Invalid or already used invite code'), {
        status: 400,
        code: 'INVALID_INVITE_CODE',
      })
    }

    await this.deps.inviteCodeDao.markUsed(inviteCode.id, userId)
    return this.getMembership(userId)
  }
}
