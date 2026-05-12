export interface ListingOwner {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
}

export interface Listing {
  id: string
  ownerId: string
  agentId: string | null
  title: string
  description: string | null
  skills: string[]
  deviceTier: 'high_end' | 'mid_range' | 'low_end'
  osType: 'macos' | 'windows' | 'linux'
  deviceInfo: Record<string, string>
  softwareTools: string[]
  hourlyRate: number
  dailyRate: number
  monthlyRate: number
  premiumMarkup: number
  depositAmount: number
  viewCount: number
  rentalCount: number
  tags: string[]
  createdAt: string
  totalOnlineSeconds: number
  owner: ListingOwner | null
}

export const DEVICE_TIER_INFO: Record<string, { label: string; color: string }> = {
  high_end: { label: '高端', color: '#F59E0B' },
  mid_range: { label: '中端', color: '#06B6D4' },
  low_end: { label: '入门', color: '#9CA3AF' },
}

export const OS_LABELS: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
}

export const SORT_OPTIONS = [
  { value: 'popular', label: '热门' },
  { value: 'newest', label: '最新' },
  { value: 'price-asc', label: '价格从低到高' },
  { value: 'price-desc', label: '价格从高到低' },
] as const

export type SortValue = (typeof SORT_OPTIONS)[number]['value']
