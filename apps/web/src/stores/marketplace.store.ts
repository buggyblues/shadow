import { create } from 'zustand'

interface MarketplaceState {
  /** Search keyword */
  searchQuery: string
  /** Device tier filter (multi-select) */
  deviceTiers: string[]
  /** OS type filter (multi-select) */
  osTypes: string[]
  /** Sort mode */
  sortBy: 'popular' | 'newest' | 'price-asc' | 'price-desc'
  /** Active listing detail ID */
  activeListingId: string | null
  setSearchQuery: (q: string) => void
  setDeviceTiers: (tiers: string[]) => void
  toggleDeviceTier: (tier: string) => void
  setOsTypes: (types: string[]) => void
  toggleOsType: (os: string) => void
  setSortBy: (sortBy: 'popular' | 'newest' | 'price-asc' | 'price-desc') => void
  setActiveListingId: (id: string | null) => void
}

export const useMarketplaceStore = create<MarketplaceState>((set) => ({
  searchQuery: '',
  deviceTiers: [],
  osTypes: [],
  sortBy: 'popular',
  activeListingId: null,

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setDeviceTiers: (deviceTiers) => set({ deviceTiers }),
  toggleDeviceTier: (tier) =>
    set((state) => ({
      deviceTiers: state.deviceTiers.includes(tier)
        ? state.deviceTiers.filter((t) => t !== tier)
        : [...state.deviceTiers, tier],
    })),
  setOsTypes: (osTypes) => set({ osTypes }),
  toggleOsType: (os) =>
    set((state) => ({
      osTypes: state.osTypes.includes(os)
        ? state.osTypes.filter((t) => t !== os)
        : [...state.osTypes, os],
    })),
  setSortBy: (sortBy) => set({ sortBy }),
  setActiveListingId: (activeListingId) => set({ activeListingId }),
}))
