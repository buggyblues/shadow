export interface WheelPerson {
  kind: string
  id: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  displayName: string
  avatarUrl?: string | null
}

export interface WheelPrize {
  id: string
  animal: string
  label: string
  score: number
  weight: number
  color: string
}

export interface WheelSpin {
  id: string
  prizeId: string
  animal: string
  label: string
  score: number
  index: number
}

export interface WheelRun {
  id: string
  participant: WheelPerson
  spins: WheelSpin[]
  totalScore: number
  createdAt: string
}

export interface WheelLeaderboardEntry {
  participantId: string
  displayName: string
  avatarUrl?: string | null
  totalScore: number
  bestRunScore: number
  rounds: number
  lastPlayedAt: string
}

export interface WheelState {
  updatedAt: string
  runs: WheelRun[]
}
