export type FriendshipStatus = 'pending' | 'accepted' | 'blocked'

export interface Friendship {
  id: string
  requesterId: string
  addresseeId: string
  status: FriendshipStatus
  createdAt: string
  updatedAt: string
}

export type FriendSource = 'friend' | 'owned_agent' | 'rented_agent'

export interface FriendEntry {
  friendshipId: string
  /** Where this friend entry comes from */
  source: FriendSource
  user: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status: string
    isBot: boolean
  }
  createdAt: string
}
