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
  /** Overlay panel: cart / orders / favorites */
  overlay: 'cart' | 'orders' | 'favorites' | null
  setOverlay: (o: ShopState['overlay']) => void
  /** Auto-expand this order ID in ShopOrders after checkout */
  lastOrderId: string | null
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
  lastOrderId: null,
}))
