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
  /** My rentals tab view */
  rentalsTab: 'renting' | 'renting-out'
  /** Sub-tab within renting-out */
  rentalsSubTab: 'contracts' | 'listings'

  setSearchQuery: (q: string) => void
  setDeviceTiers: (tiers: string[]) => void
  toggleDeviceTier: (tier: string) => void
  setOsTypes: (types: string[]) => void
  toggleOsType: (os: string) => void
  setSortBy: (sortBy: 'popular' | 'newest' | 'price-asc' | 'price-desc') => void
  setActiveListingId: (id: string | null) => void
  setRentalsTab: (tab: 'renting' | 'renting-out') => void
  setRentalsSubTab: (tab: 'contracts' | 'listings') => void
}

export const useMarketplaceStore = create<MarketplaceState>((set) => ({
  searchQuery: '',
  deviceTiers: [],
  osTypes: [],
  sortBy: 'popular',
  activeListingId: null,
  rentalsTab: 'renting',
  rentalsSubTab: 'contracts',

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
  setRentalsTab: (rentalsTab) => set({ rentalsTab }),
  setRentalsSubTab: (rentalsSubTab) => set({ rentalsSubTab }),
}))
