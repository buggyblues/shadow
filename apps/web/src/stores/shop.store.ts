import { create } from 'zustand'

interface ShopState {
  /** Active category filter */
  activeCategoryId: string | null
  setActiveCategoryId: (id: string | null) => void
  /** Search query */
  searchQuery: string
  setSearchQuery: (q: string) => void
  /** Currently viewing product detail ID */
  activeProductId: string | null
  setActiveProductId: (id: string | null) => void
  /** Sort mode */
  sortBy: 'default' | 'sales' | 'newest' | 'price-asc' | 'price-desc'
  setSortBy: (s: ShopState['sortBy']) => void
  /** Overlay panel: cart or orders */
  overlay: 'cart' | 'orders' | null
  setOverlay: (o: ShopState['overlay']) => void
}

export const useShopStore = create<ShopState>((set) => ({
  activeCategoryId: null,
  setActiveCategoryId: (id) => set({ activeCategoryId: id }),
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  activeProductId: null,
  setActiveProductId: (id) => set({ activeProductId: id }),
  sortBy: 'default',
  setSortBy: (s) => set({ sortBy: s }),
  overlay: null,
  setOverlay: (o) => set({ overlay: o }),
}))
