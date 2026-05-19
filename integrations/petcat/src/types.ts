export interface CatPerson {
  kind: string
  id: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  displayName: string
  avatarUrl?: string | null
}

export interface CatAsset {
  id: string
  name: string
  personality: string
  imageUrl: string
}

export interface PetCat {
  id: string
  name: string
  assetId: string
  owner: CatPerson
  hunger: number
  happiness: number
  energy: number
  cleanliness: number
  health: number
  mood: string
  createdAt: string
  updatedAt: string
  lastFedAt?: string
  lastPlayedAt?: string
}

export type CatAction = 'feed' | 'play' | 'clean' | 'rest' | 'auto_feed' | 'adopt'

export interface CatActionLog {
  id: string
  catId: string
  catName: string
  actor: CatPerson
  action: CatAction
  note?: string
  createdAt: string
}

export interface CatLeaderboardEntry {
  catId: string
  name: string
  imageUrl: string
  score: number
  mood: string
  ownerName: string
}

export interface CatState {
  updatedAt: string
  cats: PetCat[]
  logs: CatActionLog[]
}
