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

export type CatStatKey = 'str' | 'agi' | 'int' | 'cha' | 'luk'
export type CatRoute = CatStatKey | 'balanced'
export type CatStage = 'kitten' | 'growth' | 'mature'

export interface CatStats {
  str: number
  agi: number
  int: number
  cha: number
  luk: number
}

export interface DailyTaskReward {
  taskId: number
  label: string
  coins: number
  exp: number
  bond: number
}

export interface CatReward {
  coins?: number
  exp?: number
  bond?: number
  materials?: number
  cores?: number
  rank?: 'B' | 'A' | 'S'
  success?: boolean
  chance?: number
  levelUps?: number
  stats?: Partial<CatStats>
  taskRewards?: DailyTaskReward[]
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
  level: number
  exp: number
  coins: number
  bond: number
  materials: number
  cores: number
  route: CatRoute
  stats: CatStats
  stage: CatStage
  evolutionName?: string
  furnitureLevel: number
  dailyDate: string
  dailyActions: number
  dailyActionCounts: Partial<Record<DailyLimitedAction, number>>
  dailyClaimedTaskIds: number[]
  createdAt: string
  updatedAt: string
  lastFedAt?: string
  lastPlayedAt?: string
}

export type CatCareAction = 'feed' | 'pet' | 'play' | 'clean' | 'rest'
export type DailyLimitedAction =
  | CatCareAction
  | 'train'
  | 'minigame'
  | 'adventure'
  | 'upgrade_furniture'

export type CatAction =
  | CatCareAction
  | 'train'
  | 'minigame'
  | 'adventure'
  | 'upgrade_furniture'
  | 'adopt'

export interface CatActionLog {
  id: string
  catId: string
  catName: string
  actor: CatPerson
  action: CatAction
  note?: string
  reward?: CatReward
  createdAt: string
}

export interface CatLeaderboardEntry {
  catId: string
  name: string
  imageUrl: string
  score: number
  mood: string
  ownerName: string
  level: number
  stage: CatStage
  route: CatRoute
}

export interface RouteDefinition {
  id: CatRoute
  label: string
  shortLabel: string
  description: string
  color: string
}

export interface AdventureMap {
  id: number
  name: string
  unlockLevel: number
  costEnergy: number
  difficulty: number
  recommendAttrs: CatStatKey[]
  baseCoin: number
  baseExp: number
  materialValue: number
  rareRate: number
  rareValue: number
}

export interface DailyTask {
  id: number
  label: string
  requiredActions: number
  rewardCoin: number
  rewardExp: number
  rewardBond: number
  designGoal: string
}

export interface FurnitureUpgrade {
  level: number
  name: string
  cost: number
  bonus: number
}

export interface CatState {
  updatedAt: string
  cats: PetCat[]
  logs: CatActionLog[]
}
