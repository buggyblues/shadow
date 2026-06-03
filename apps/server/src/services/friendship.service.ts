import type { AgentDao } from '../dao/agent.dao'
import type { AgentListingDao } from '../dao/agent-listing.dao'
import type { FriendshipDao } from '../dao/friendship.dao'
import type { RentalContractDao } from '../dao/rental-contract.dao'
import type { UserDao } from '../dao/user.dao'
import { resolveAvatarUrl } from '../lib/avatar-url'
import type { MediaService } from './media.service'

export class FriendshipService {
  constructor(
    private deps: {
      friendshipDao: FriendshipDao
      userDao: UserDao
      agentDao: AgentDao
      agentListingDao: AgentListingDao
      rentalContractDao: RentalContractDao
      mediaService?: Pick<MediaService, 'resolveMediaUrl'>
    },
  ) {}

  private resolveUserAvatar(avatarUrl: string | null | undefined) {
    return resolveAvatarUrl(this.deps.mediaService, avatarUrl)
  }

  /** Send a friend request by username */
  async sendRequest(requesterId: string, targetUsername: string) {
    const target = await this.deps.userDao.findByUsername(targetUsername)
    if (!target) {
      throw Object.assign(new Error('User not found'), { status: 404 })
    }
    if (target.id === requesterId) {
      throw Object.assign(new Error('Cannot add yourself as friend'), { status: 400 })
    }

    const existing = await this.deps.friendshipDao.findBetween(requesterId, target.id)
    if (existing) {
      if (existing.status === 'accepted') {
        throw Object.assign(new Error('Already friends'), { status: 409 })
      }
      if (existing.status === 'pending') {
        // If the target already sent a request to us, auto-accept
        if (existing.requesterId === target.id) {
          return this.deps.friendshipDao.accept(existing.id)
        }
        throw Object.assign(new Error('Friend request already sent'), { status: 409 })
      }
    }

    return this.deps.friendshipDao.create(requesterId, target.id)
  }

  /** Accept a pending friend request */
  async acceptRequest(userId: string, friendshipId: string) {
    const friendship = await this.deps.friendshipDao.findById(friendshipId)
    if (!friendship) {
      throw Object.assign(new Error('Friend request not found'), { status: 404 })
    }
    if (friendship.addresseeId !== userId) {
      throw Object.assign(new Error('Not authorized'), { status: 403 })
    }
    if (friendship.status !== 'pending') {
      throw Object.assign(new Error('Request is not pending'), { status: 400 })
    }
    return this.deps.friendshipDao.accept(friendshipId)
  }

  /** Reject a pending friend request */
  async rejectRequest(userId: string, friendshipId: string) {
    const friendship = await this.deps.friendshipDao.findById(friendshipId)
    if (!friendship) {
      throw Object.assign(new Error('Friend request not found'), { status: 404 })
    }
    if (friendship.addresseeId !== userId) {
      throw Object.assign(new Error('Not authorized'), { status: 403 })
    }
    await this.deps.friendshipDao.deleteByUserIdAndId(userId, friendshipId)
  }

  /** Remove a friend (either party can remove) */
  async removeFriend(userId: string, friendshipId: string) {
    const friendship = await this.deps.friendshipDao.findById(friendshipId)
    if (!friendship) {
      throw Object.assign(new Error('Friendship not found'), { status: 404 })
    }
    if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
      throw Object.assign(new Error('Not authorized'), { status: 403 })
    }
    await this.deps.friendshipDao.deleteByUserIdAndId(userId, friendshipId)
  }

  /** Get friend list with user profiles (includes virtual agent friends) */
  async getFriends(userId: string) {
    const friendships = await this.deps.friendshipDao.getFriends(userId)
    const results: Array<{
      friendshipId: string
      source: 'friend' | 'owned_agent' | 'rented_agent'
      user: {
        id: string
        username: string
        displayName: string | null
        avatarUrl: string | null
        status: string
        isBot: boolean
      }
      agentStatus?: 'available' | 'listed' | 'rented_out'
      rentalExpiresAt?: Date | null
      createdAt: Date
    }> = []

    // Track bot user IDs already added to avoid duplicates
    const addedUserIds = new Set<string>()

    // 1. Real friends from friendships table
    for (const f of friendships) {
      const otherId = f.requesterId === userId ? f.addresseeId : f.requesterId
      const user = await this.deps.userDao.findById(otherId)
      if (user) {
        addedUserIds.add(user.id)
        results.push({
          friendshipId: f.id,
          source: 'friend',
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: this.resolveUserAvatar(user.avatarUrl),
            status: user.status,
            isBot: user.isBot,
          },
          createdAt: f.createdAt,
        })
      }
    }

    // 2. Owned agents where user is the owner
    const ownedAgents = await this.deps.agentDao.findByOwnerId(userId)
    for (const agent of ownedAgents) {
      if (addedUserIds.has(agent.userId)) continue
      const botUser = await this.deps.userDao.findById(agent.userId)
      if (botUser) {
        addedUserIds.add(botUser.id)

        // Determine marketplace status for the agent listing.
        let agentStatus: 'available' | 'listed' | 'rented_out' = 'available'
        const listings = await this.deps.agentListingDao.findByAgentIds([agent.id])
        const activeListing = listings.find((l) => l.listingStatus === 'active' && l.isListed)
        if (activeListing) {
          const activeContract = await this.deps.rentalContractDao.findActiveByListingId(
            activeListing.id,
          )
          agentStatus = activeContract ? 'rented_out' : 'listed'
        }

        results.push({
          friendshipId: `agent:owned:${agent.id}`,
          source: 'owned_agent',
          agentStatus,
          user: {
            id: botUser.id,
            username: botUser.username,
            displayName: botUser.displayName,
            avatarUrl: this.resolveUserAvatar(botUser.avatarUrl),
            status: botUser.status,
            isBot: botUser.isBot,
          },
          createdAt: agent.createdAt,
        })
      }
    }

    // 3. Actively rented agents where user is the tenant
    const activeRentals = await this.deps.rentalContractDao.findByTenantId(userId, {
      status: 'active',
    })
    const now = new Date()
    for (const contract of activeRentals) {
      // Validate contract is within time range
      if (contract.startsAt > now) continue
      if (contract.expiresAt && contract.expiresAt < now) continue
      if (contract.terminatedAt) continue

      const listing = await this.deps.agentListingDao.findById(contract.listingId)
      if (!listing?.agentId) continue

      const agent = await this.deps.agentDao.findById(listing.agentId)
      if (!agent || addedUserIds.has(agent.userId)) continue

      const botUser = await this.deps.userDao.findById(agent.userId)
      if (botUser) {
        addedUserIds.add(botUser.id)
        results.push({
          friendshipId: `agent:rented:${contract.id}`,
          source: 'rented_agent',
          rentalExpiresAt: contract.expiresAt,
          user: {
            id: botUser.id,
            username: botUser.username,
            displayName: botUser.displayName,
            avatarUrl: this.resolveUserAvatar(botUser.avatarUrl),
            status: botUser.status,
            isBot: botUser.isBot,
          },
          createdAt: contract.createdAt,
        })
      }
    }

    return results
  }

  /** Get pending friend requests received */
  async getPendingReceived(userId: string) {
    const requests = await this.deps.friendshipDao.getPendingReceived(userId)
    const results = []

    for (const f of requests) {
      const user = await this.deps.userDao.findById(f.requesterId)
      if (user) {
        results.push({
          friendshipId: f.id,
          source: 'friend' as const,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: this.resolveUserAvatar(user.avatarUrl),
            status: user.status,
            isBot: user.isBot,
          },
          createdAt: f.createdAt,
        })
      }
    }

    return results
  }

  /** Get pending friend requests sent */
  async getPendingSent(userId: string) {
    const requests = await this.deps.friendshipDao.getPendingSent(userId)
    const results = []

    for (const f of requests) {
      const user = await this.deps.userDao.findById(f.addresseeId)
      if (user) {
        results.push({
          friendshipId: f.id,
          source: 'friend' as const,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: this.resolveUserAvatar(user.avatarUrl),
            status: user.status,
            isBot: user.isBot,
          },
          createdAt: f.createdAt,
        })
      }
    }

    return results
  }
}
