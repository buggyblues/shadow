import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ClipboardList,
  Heart,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { useRechargeStore } from '../../stores/recharge.store'
import { useShopStore } from '../../stores/shop.store'
import { ProductDetail } from './product-detail'
import { ShopCart } from './shop-cart'
import { ShopOrders } from './shop-orders'
import { PriceDisplay } from './ui/currency'

import { ProductCard } from './ui/product-card'

/* ───────── Types ───────── */

export interface ProductMediaItem {
  id: string
  type: string
  url: string
  thumbnailUrl?: string
  position: number
}

export interface SkuItem {
  id: string
  specValues: string[]
  price: number
  stock: number
  imageUrl?: string
  skuCode?: string
  isActive: boolean
}

export interface Product {
  id: string
  shopId: string
  categoryId?: string
  name: string
  slug: string
  type: 'physical' | 'entitlement'
  status: 'draft' | 'active' | 'archived'
  description?: string
  summary?: string
  basePrice: number
  currency: string
  specNames: string[]
  tags: string[]
  salesCount: number
  avgRating: number
  ratingCount: number
  entitlementConfig?:
    | {
        type: string
        targetId?: string
        durationSeconds?: number | null
        privilegeDescription?: string
      }
    | Array<{
        type: string
        targetId?: string
        durationSeconds?: number | null
        privilegeDescription?: string
      }>
  media?: ProductMediaItem[]
  skus?: SkuItem[]
  createdAt: string
}

export interface ProductCategory {
  id: string
  shopId: string
  name: string
  slug: string
  parentId?: string
  position: number
  iconUrl?: string
}

export interface Shop {
  id: string
  serverId: string
  name: string
  description?: string
  logoUrl?: string
  bannerUrl?: string
  status: string
  settings: Record<string, unknown>
}

/* ───────── Main Shop Page ───────── */

interface ShopPageProps {
  serverId: string
  isAdmin?: boolean
  onClose?: () => void
}

export function ShopPage({ serverId, isAdmin, onClose }: ShopPageProps) {
  const { activeProductId, setActiveProductId, overlay, setOverlay } = useShopStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: shop, isLoading: isShopLoading } = useQuery({
    queryKey: ['shop', serverId],
    queryFn: () => fetchApi<Shop>(`/api/servers/${serverId}/shop`),
    enabled: !!serverId,
  })

  const { data: cartItems = [] } = useQuery({
    queryKey: ['shop-cart', serverId],
    queryFn: () => fetchApi<{ id: string }[]>(`/api/servers/${serverId}/shop/cart`),
  })

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => fetchApi<{ balance: number }>('/api/wallet'),
  })

  const quickAddToCart = useMutation({
    mutationFn: (data: { productId: string; quantity: number }) =>
      fetchApi(`/api/servers/${serverId}/shop/cart`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-cart', serverId] })
      showToast('已加入购物车', 'success')
    },
    onError: (err: Error) => showToast(err.message || '加入购物车失败', 'error'),
  })

  // Product detail view
  if (activeProductId) {
    return (
      <ProductDetail
        serverId={serverId}
        productId={activeProductId}
        isAdmin={isAdmin}
        onBack={() => setActiveProductId(null)}
      />
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F9FAFB] dark:bg-bg-primary overflow-hidden h-full relative font-sans">
      {/* ── Header ── */}
      <div className="desktop-drag-titlebar h-12 px-4 flex items-center bg-bg-secondary/50 backdrop-blur-sm border-b border-border-subtle shrink-0 gap-3 z-20 transition-colors">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 -ml-2 text-gray-500 hover:text-gray-900 dark:text-text-muted dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-bg-modifier-hover rounded-xl transition-all"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-white shadow-sm">
            <ShoppingBag size={16} strokeWidth={2.5} />
          </div>
          <h2 className="font-bold text-gray-900 dark:text-text-primary text-base truncate tracking-tight">
            {shop?.name || (isShopLoading ? '加载中...' : '官方商城')}
          </h2>
        </div>
        <div className="flex-1" />

        {/* Wallet balance */}
        {wallet && (
          <button
            type="button"
            onClick={() => useRechargeStore.getState().openModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 dark:bg-rose-900/10 rounded-xl border border-rose-100 dark:border-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/20 transition cursor-pointer"
            title="充值虾币"
          >
            <Wallet size={14} className="text-rose-400" />
            <PriceDisplay amount={wallet.balance} size={13} />
            <span className="text-xs text-rose-400 font-bold">+</span>
          </button>
        )}

        {/* Header action icons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOverlay(overlay === 'favorites' ? null : 'favorites')}
            className={`p-2.5 rounded-xl transition-all duration-200 active:scale-95 ${
              overlay === 'favorites'
                ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20 shadow-sm'
                : 'text-gray-500 hover:text-gray-900 dark:text-text-muted dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-bg-modifier-hover'
            }`}
          >
            <Heart
              size={18}
              className={
                overlay === 'favorites'
                  ? 'fill-rose-500 scale-110 transition-transform'
                  : 'transition-transform'
              }
            />
          </button>

          <button
            type="button"
            onClick={() => setOverlay(overlay === 'cart' ? null : 'cart')}
            className={`relative p-2.5 rounded-xl transition-all duration-200 active:scale-95 ${
              overlay === 'cart'
                ? 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20 shadow-sm'
                : 'text-gray-500 hover:text-gray-900 dark:text-text-muted dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-bg-modifier-hover'
            }`}
          >
            <ShoppingCart
              size={18}
              className={
                overlay === 'cart' ? 'scale-110 transition-transform' : 'transition-transform'
              }
            />
            {cartItems.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-rose-500 text-white rounded-full shadow-sm border border-white dark:border-bg-primary animate-in zoom-in duration-200">
                {cartItems.length > 99 ? '99+' : cartItems.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setOverlay(overlay === 'orders' ? null : 'orders')}
            className={`p-2.5 rounded-xl transition-all duration-200 active:scale-95 ${
              overlay === 'orders'
                ? 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20 shadow-sm'
                : 'text-gray-500 hover:text-gray-900 dark:text-text-muted dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-bg-modifier-hover'
            }`}
          >
            <ClipboardList
              size={18}
              className={
                overlay === 'orders' ? 'scale-110 transition-transform' : 'transition-transform'
              }
            />
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: '/servers/$serverSlug/shop/admin',
                  params: { serverSlug: serverId },
                })
              }
              className="p-2.5 text-gray-500 hover:text-gray-900 dark:text-text-muted dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-bg-modifier-hover rounded-xl transition-all duration-200 ml-1 border border-transparent hover:border-gray-200 dark:hover:border-border-subtle active:scale-95"
            >
              <Settings size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ── Main content area ── */}
      <div className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar">
        <ShopBrowse
          serverId={serverId}
          shop={shop}
          isLoading={isShopLoading}
          onAddToCart={(product, e) => {
            e.stopPropagation()
            quickAddToCart.mutate({ productId: product.id, quantity: 1 })
          }}
        />
      </div>

      {/* Overlays */}
      {overlay === 'cart' && (
        <OverlayContainer onClose={() => setOverlay(null)} title="购物车">
          <ShopCart
            serverId={serverId}
            onCheckout={(orderId) => {
              setOverlay('orders')
              useShopStore.setState({ lastOrderId: orderId })
            }}
          />
        </OverlayContainer>
      )}

      {overlay === 'orders' && (
        <OverlayContainer onClose={() => setOverlay(null)} title="订单与权益">
          <ShopOrders serverId={serverId} />
        </OverlayContainer>
      )}

      {overlay === 'favorites' && (
        <OverlayContainer onClose={() => setOverlay(null)} title="我的收藏">
          <FavoriteProducts
            serverId={serverId}
            onAddToCart={(product, e) => {
              e.stopPropagation()
              quickAddToCart.mutate({ productId: product.id, quantity: 1 })
            }}
            onOpenProduct={(productId) => {
              setActiveProductId(productId)
              setOverlay(null)
            }}
          />
        </OverlayContainer>
      )}
    </div>
  )
}

function FavoriteProducts({
  serverId,
  onAddToCart,
  onOpenProduct,
}: {
  serverId: string
  onAddToCart?: (product: Product, e: React.MouseEvent) => void
  onOpenProduct: (productId: string) => void
}) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])

  useEffect(() => {
    const readFavorites = () => {
      const raw = localStorage.getItem(`shop:favorites:${serverId}`)
      setFavoriteIds(raw ? JSON.parse(raw) : [])
    }
    readFavorites()
    window.addEventListener('shop:favorites-changed', readFavorites)
    return () => window.removeEventListener('shop:favorites-changed', readFavorites)
  }, [serverId])

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['shop-products', serverId],
    queryFn: () =>
      fetchApi<{ products: Product[]; total: number }>(`/api/servers/${serverId}/shop/products`),
  })

  const products = (productsData?.products || []).filter((p) => favoriteIds.includes(p.id))

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500">加载收藏中...</div>
  }

  if (products.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-500 dark:text-text-muted">
        你还没有收藏商品，去逛逛并点亮小心心吧 💖
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 md:px-8 py-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onClick={() => onOpenProduct(product.id)}
            onAddToCart={onAddToCart}
          />
        ))}
      </div>
    </div>
  )
}

function OverlayContainer({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode
  onClose: () => void
  title: string
}) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-white dark:bg-bg-primary animate-in slide-in-from-bottom-full duration-300">
      <div className="h-14 px-4 flex items-center border-b border-gray-200 dark:border-border-subtle bg-white/80 dark:bg-bg-primary/80 backdrop-blur-md shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="p-2 -ml-2 text-gray-500 hover:text-gray-900 dark:text-text-muted dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-bg-modifier-hover rounded-xl transition-all"
        >
          <X size={20} />
        </button>
        <span className="font-bold text-gray-900 dark:text-text-primary ml-2">{title}</span>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}

function ShopBrowse({
  serverId,
  shop,
  isLoading,
  onAddToCart,
}: {
  serverId: string
  shop?: Shop | null
  isLoading?: boolean
  onAddToCart?: (product: Product, e: React.MouseEvent) => void
}) {
  const {
    activeCategoryId,
    setActiveCategoryId,
    searchQuery,
    setSearchQuery,
    setActiveProductId,
    sortBy,
    setSortBy,
  } = useShopStore()

  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])

  useEffect(() => {
    const readFavorites = () => {
      const raw = localStorage.getItem(`shop:favorites:${serverId}`)
      setFavoriteIds(raw ? JSON.parse(raw) : [])
    }
    readFavorites()
    window.addEventListener('shop:favorites-changed', readFavorites)
    return () => window.removeEventListener('shop:favorites-changed', readFavorites)
  }, [serverId])

  const { data: categoriesData } = useQuery({
    queryKey: ['shop-categories', serverId],
    queryFn: () => fetchApi<ProductCategory[]>(`/api/servers/${serverId}/shop/categories`),
  })

  const { data: productsData, isLoading: isProductsLoading } = useQuery({
    queryKey: ['shop-products', serverId, activeCategoryId],
    queryFn: () =>
      fetchApi<{ products: Product[]; total: number }>(
        `/api/servers/${serverId}/shop/products${activeCategoryId ? `?categoryId=${activeCategoryId}` : ''}`,
      ),
  })

  const categories = categoriesData || []
  const products = productsData?.products || []

  // Filter + sort
  const filtered = useMemo(() => {
    let result = products
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.summary?.toLowerCase().includes(q) ||
          p.tags?.some((t) => t.toLowerCase().includes(q)),
      )
    }
    if (favoriteOnly) {
      result = result.filter((p) => favoriteIds.includes(p.id))
    }

    switch (sortBy) {
      case 'sales':
        return [...result].sort((a, b) => b.salesCount - a.salesCount)
      case 'newest':
        return [...result].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
      case 'price-asc':
        return [...result].sort((a, b) => a.basePrice - b.basePrice)
      case 'price-desc':
        return [...result].sort((a, b) => b.basePrice - a.basePrice)
      default:
        return result
    }
  }, [products, searchQuery, sortBy, favoriteOnly, favoriteIds])

  const topCategories = categories.slice(0, 8)

  return (
    <div className="flex flex-col pb-24">
      {/* ── Shop Banner / Header ── */}
      {shop?.bannerUrl ? (
        <div className="relative h-48 md:h-[300px] w-full group overflow-hidden bg-gray-100 dark:bg-bg-tertiary">
          <img
            src={shop.bannerUrl}
            alt="Banner"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute bottom-6 left-6 md:left-10 md:bottom-10 right-6 flex items-end gap-5">
            {shop.logoUrl && (
              <div className="relative w-20 h-20 md:w-28 md:h-28 rounded-2xl md:rounded-3xl overflow-hidden border-[3px] md:border-4 border-white/20 shadow-2xl backdrop-blur-sm shrink-0">
                <img src={shop.logoUrl} alt="Logo" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1 pb-1 md:pb-2">
              <h3 className="text-white text-2xl md:text-4xl font-black drop-shadow-md tracking-tight mb-1 md:mb-2">
                {shop.name}
              </h3>
              {shop.description && (
                <p className="text-white/80 text-xs md:text-base line-clamp-2 md:line-clamp-3 font-medium drop-shadow-sm max-w-2xl leading-relaxed">
                  {shop.description}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : shop?.description ? (
        <div className="px-6 md:px-10 py-5 md:py-8 bg-white dark:bg-[#1A1A1A] border-b border-gray-100 dark:border-white/5">
          <h1 className="text-2xl md:text-3xl font-black mb-2">{shop.name}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base max-w-3xl leading-relaxed">
            {shop.description}
          </p>
        </div>
      ) : isLoading ? (
        <div className="h-48 md:h-[300px] bg-gray-100 dark:bg-white/5 animate-pulse" />
      ) : null}

      {/* ── Container for Filters & Grid (PC Friendly Layout) ── */}
      <div className="max-w-[1400px] mx-auto w-full">
        {/* ── Discovery Bar ── */}
        <div className="bg-white/90 dark:bg-bg-primary/90 backdrop-blur-md pt-5 pb-4 px-4 md:px-8 border-b md:border-none border-gray-200 dark:border-border-subtle sticky top-0 z-10 md:static">
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
            {/* Search */}
            <div
              className={`relative flex-1 md:max-w-md transition-all duration-300 ease-out ${isSearchFocused ? 'scale-[1.01]' : ''}`}
            >
              <div
                className={`absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none transition-colors ${isSearchFocused ? 'text-cyan-600' : 'text-gray-400'}`}
              >
                <Search size={18} strokeWidth={2.5} />
              </div>
              <input
                type="text"
                placeholder="搜索商品..."
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-10 py-3 bg-gray-50 dark:bg-[#1A1A1A] text-gray-900 dark:text-text-primary text-sm md:text-base rounded-2xl md:rounded-full border border-gray-100 dark:border-white/10 focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 placeholder:text-gray-400 transition-all font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setIsSearchFocused(false)
                  }}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-text-primary transition-colors"
                >
                  <X size={18} className="bg-gray-200 dark:bg-white/10 rounded-full p-0.5" />
                </button>
              )}
            </div>

            {/* Sort Controls (Desktop moves to side) */}
            <div className="flex items-center gap-4 bg-gray-50 dark:bg-[#1A1A1A] p-1 rounded-2xl md:rounded-full md:border md:border-gray-100 md:dark:border-white/10 shrink-0 self-start">
              {[
                { key: 'default' as const, label: '综合' },
                { key: 'sales' as const, label: '销量' },
                { key: 'newest' as const, label: '最新' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSortBy(tab.key)}
                  className={`text-sm md:text-[15px] font-bold transition-all px-4 py-2 rounded-xl md:rounded-full ${
                    sortBy === tab.key
                      ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setSortBy(sortBy === 'price-asc' ? 'price-desc' : 'price-asc')}
                className={`text-sm md:text-[15px] font-bold transition-all px-4 py-2 rounded-xl md:rounded-full flex items-center gap-1.5 ${
                  sortBy === 'price-asc' || sortBy === 'price-desc'
                    ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                价格
                <span className="flex flex-col leading-none -space-y-0.5">
                  <span
                    className={`text-[9px] ${sortBy === 'price-asc' ? 'text-cyan-500' : 'text-gray-300 dark:text-gray-600'}`}
                  >
                    ▲
                  </span>
                  <span
                    className={`text-[9px] ${sortBy === 'price-desc' ? 'text-cyan-500' : 'text-gray-300 dark:text-gray-600'}`}
                  >
                    ▼
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* Categories Pills */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 pt-1 -mx-2 px-2 md:-mx-0 md:px-0">
            <button
              type="button"
              onClick={() => setActiveCategoryId(null)}
              className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-bold transition-all ${
                !activeCategoryId
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md'
                  : 'bg-white dark:bg-bg-secondary text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              全部
            </button>
            {topCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-bold transition-all ${
                  activeCategoryId === cat.id
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md'
                    : 'bg-white dark:bg-bg-secondary text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                {cat.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFavoriteOnly((v) => !v)}
              className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-bold transition-all ${
                favoriteOnly
                  ? 'bg-rose-500 text-white shadow-md'
                  : 'bg-white dark:bg-bg-secondary text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              收藏({favoriteIds.length})
            </button>
          </div>
        </div>

        {/* ── Product Grid ── */}
        <div className="px-4 md:px-8 py-6">
          {isProductsLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-[#1A1A1A] rounded-2xl md:rounded-3xl animate-pulse flex flex-col overflow-hidden border border-gray-100 dark:border-white/5"
                >
                  <div className="aspect-[4/5] bg-gray-100 dark:bg-white/5 w-full" />
                  <div className="p-4 space-y-3">
                    <div className="h-5 bg-gray-100 dark:bg-white/5 rounded-lg w-3/4" />
                    <div className="h-4 bg-gray-100 dark:bg-white/5 rounded-lg w-1/2" />
                    <div className="h-6 bg-gray-100 dark:bg-white/5 rounded-lg w-1/3 mt-4" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-40 md:py-52 text-gray-400 dark:text-gray-500">
              <div className="w-24 h-24 mb-6 rounded-full bg-white dark:bg-white/5 flex items-center justify-center shadow-sm border border-gray-100 dark:border-white/5">
                <ShoppingBag size={48} strokeWidth={1.5} />
              </div>
              <p className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                未找到相关商品
              </p>
              <p className="text-sm">尝试更换搜索词或分类</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {filtered.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => setActiveProductId(product.id)}
                  onAddToCart={onAddToCart}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
