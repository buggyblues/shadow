import { Button, Card, cn, EmptyState, GlassPanel, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ClipboardList,
  Heart,
  Package,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import {
  type EntitlementOwnership,
  hasActivePurchasedEntitlement,
} from '../../lib/commerce-products'
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
  billingMode?: 'one_time' | 'fixed_duration' | 'subscription'
  status: 'draft' | 'active' | 'archived'
  description?: string
  summary?: string
  basePrice: number
  currency: string
  specNames: string[]
  tags: string[]
  globalPublic?: boolean
  salesCount: number
  avgRating: number
  ratingCount: number
  entitlementConfig?:
    | {
        resourceType?: string
        resourceId?: string
        capability?: string
        durationSeconds?: number | null
        renewalPeriodSeconds?: number | null
        repeatable?: boolean | null
        privilegeDescription?: string
      }
    | Array<{
        resourceType?: string
        resourceId?: string
        capability?: string
        durationSeconds?: number | null
        renewalPeriodSeconds?: number | null
        repeatable?: boolean | null
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
  serverId?: string | null
  ownerUserId?: string | null
  scopeKind?: 'server' | 'user'
  name: string
  description?: string
  logoUrl?: string
  bannerUrl?: string
  visibility?: 'private' | 'login_required' | 'public' | string
  status: string
  settings: Record<string, unknown>
}

export interface ServerSummary {
  id: string
  name?: string | null
  slug?: string | null
  ownerId?: string | null
}

/* ───────── Main Shop Page ───────── */

interface ShopPageProps {
  serverId: string
  isAdmin?: boolean
  onClose?: () => void
  embedded?: boolean
}

export function ShopPage({ serverId, isAdmin, onClose, embedded = false }: ShopPageProps) {
  const { t } = useTranslation()
  const { activeProductId, setActiveProductId, overlay, setOverlay } = useShopStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const showEmbeddedHeader = !embedded || !!onClose
  const shellClassName = embedded
    ? 'relative flex flex-1 flex-col overflow-hidden min-h-0 bg-transparent font-sans'
    : 'flex-1 flex flex-col overflow-hidden h-full relative font-sans min-h-0'

  const { data: shop, isLoading: isShopLoading } = useQuery({
    queryKey: ['shop', serverId],
    queryFn: () => fetchApi<Shop>(`/api/servers/${serverId}/shop`),
    enabled: !!serverId,
  })

  const { data: server } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => fetchApi<ServerSummary>(`/api/servers/${serverId}`),
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
      showToast(t('shop.addedToCart', '已加入购物车'), 'success')
    },
    onError: (err: Error) =>
      showToast(err.message || t('shop.addToCartFailed', '加入购物车失败'), 'error'),
  })

  // Product detail view
  if (activeProductId) {
    const detail = (
      <ProductDetail
        serverId={serverId}
        productId={activeProductId}
        isAdmin={isAdmin}
        onBack={() => setActiveProductId(null)}
        embedded={embedded}
        shop={shop}
        server={server}
      />
    )

    if (!embedded) {
      return detail
    }

    return <div className={shellClassName}>{detail}</div>
  }

  const actionGroupClassName =
    'flex items-center gap-1 rounded-2xl border border-border-subtle bg-bg-secondary/20 p-1 backdrop-blur-xl'

  const actionControls = (
    <>
      {wallet && (
        <button
          type="button"
          onClick={() => useRechargeStore.getState().openModal()}
          className="flex items-center gap-1.5 rounded-2xl border border-accent/20 bg-accent/10 px-3 py-2 text-accent transition hover:bg-accent/15"
          title={t('recharge.title', { defaultValue: '充值虾币' })}
        >
          <Wallet size={14} className="text-accent" />
          <PriceDisplay amount={wallet.balance} size={13} />
          <span className="text-xs font-bold text-accent">+</span>
        </button>
      )}

      <div className={actionGroupClassName}>
        <button
          type="button"
          onClick={() => setOverlay(overlay === 'favorites' ? null : 'favorites')}
          className={cn(
            'rounded-xl p-2.5 transition-all duration-200 active:scale-95',
            overlay === 'favorites'
              ? 'bg-accent/10 text-accent ring-1 ring-accent/20 shadow-sm'
              : 'text-text-muted hover:bg-bg-modifier-hover hover:text-text-primary',
          )}
        >
          <Heart
            size={18}
            className={
              overlay === 'favorites'
                ? 'fill-accent scale-110 transition-transform'
                : 'transition-transform'
            }
          />
        </button>

        <button
          type="button"
          onClick={() => setOverlay(overlay === 'cart' ? null : 'cart')}
          className={cn(
            'relative rounded-xl p-2.5 transition-all duration-200 active:scale-95',
            overlay === 'cart'
              ? 'bg-primary/10 text-primary ring-1 ring-primary/20 shadow-sm'
              : 'text-text-muted hover:bg-bg-modifier-hover hover:text-text-primary',
          )}
        >
          <ShoppingCart
            size={18}
            className={
              overlay === 'cart' ? 'scale-110 transition-transform' : 'transition-transform'
            }
          />
          {cartItems.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-bg-primary bg-danger px-1 text-[11px] font-bold text-white shadow-sm animate-in zoom-in duration-200">
              {cartItems.length > 99 ? '99+' : cartItems.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setOverlay(overlay === 'orders' ? null : 'orders')}
          className={cn(
            'rounded-xl p-2.5 transition-all duration-200 active:scale-95',
            overlay === 'orders'
              ? 'bg-primary/10 text-primary ring-1 ring-primary/20 shadow-sm'
              : 'text-text-muted hover:bg-bg-modifier-hover hover:text-text-primary',
          )}
        >
          <ClipboardList
            size={18}
            className={
              overlay === 'orders' ? 'scale-110 transition-transform' : 'transition-transform'
            }
          />
        </button>
      </div>

      {isAdmin && (
        <Button
          variant="ghost"
          size="icon"
          icon={Settings}
          onClick={() =>
            navigate({
              to: '/servers/$serverSlug/shop/admin',
              params: { serverSlug: serverId },
            })
          }
          className="h-11 w-11 rounded-2xl border border-border-subtle bg-bg-secondary/20"
        />
      )}
    </>
  )

  return (
    <GlassPanel
      className={shellClassName}
      style={
        embedded ? { background: 'transparent', border: 'none', boxShadow: 'none' } : undefined
      }
    >
      {/* ── Header ── */}
      {showEmbeddedHeader && (
        <div
          className={cn(
            'flex items-center gap-3 border-b border-border-subtle/80 shrink-0 z-20 sticky top-0 transition-colors',
            embedded
              ? 'bg-bg-secondary/10 px-6 py-4 backdrop-blur-xl'
              : 'app-header desktop-drag-titlebar px-4',
          )}
        >
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              icon={ArrowLeft}
              onClick={onClose}
              className="-ml-2"
            />
          )}
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ShoppingBag size={20} className="text-primary" />
            </div>
            <h2 className="truncate text-base font-black tracking-tight text-text-primary">
              {shop?.name ||
                (isShopLoading
                  ? t('common.loading', { defaultValue: '加载中...' })
                  : t('server.settingsShop', { defaultValue: '官方商城' }))}
            </h2>
          </div>
          <div className="flex-1" />
          <div className="flex flex-wrap items-center justify-end gap-2">{actionControls}</div>
        </div>
      )}

      {/* ── Main content area ── */}
      <div
        className={cn(
          'flex-1 overflow-y-auto scroll-smooth scrollbar-hidden',
          embedded ? 'bg-transparent' : 'server-page-content',
        )}
      >
        <ShopBrowse
          serverId={serverId}
          shop={shop}
          server={server}
          isLoading={isShopLoading}
          embedded={embedded}
          actions={embedded ? actionControls : null}
          onAddToCart={(product, e) => {
            e.stopPropagation()
            quickAddToCart.mutate({ productId: product.id, quantity: 1 })
          }}
        />
      </div>

      {/* Overlays */}
      {overlay === 'cart' && (
        <OverlayContainer onClose={() => setOverlay(null)} title={t('shop.cartTitle')}>
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
        <OverlayContainer onClose={() => setOverlay(null)} title={t('shop.ordersAndAccess')}>
          <ShopOrders serverId={serverId} />
        </OverlayContainer>
      )}

      {overlay === 'favorites' && (
        <OverlayContainer onClose={() => setOverlay(null)} title={t('shop.myFavorites')}>
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
    </GlassPanel>
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
  const { t } = useTranslation()
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

  const { data: entitlements = [] } = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => fetchApi<EntitlementOwnership[]>('/api/entitlements'),
  })

  const products = (productsData?.products || []).filter((p) => favoriteIds.includes(p.id))

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse overflow-hidden !rounded-lg">
              <div className="aspect-[3/2] bg-bg-modifier-hover rounded-t-[40px]" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-bg-modifier-hover rounded w-3/4" />
                <div className="h-3 bg-bg-modifier-hover rounded w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          icon={Heart}
          title={t('shop.noFavorites')}
          description={t('shop.noFavoritesHint')}
        />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-hidden px-4 md:px-8 py-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {products.map((product) => {
          const purchased = hasActivePurchasedEntitlement(product, entitlements)
          return (
            <ProductCard
              key={product.id}
              product={product}
              onClick={() => onOpenProduct(product.id)}
              onAddToCart={purchased ? undefined : onAddToCart}
              purchased={purchased}
            />
          )
        })}
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
    <div className="absolute inset-0 z-50 flex flex-col bg-bg-primary animate-in slide-in-from-bottom-full duration-300">
      <div className="h-14 px-4 flex items-center border-b border-border-subtle bg-bg-primary/80 backdrop-blur-xl shrink-0">
        <Button variant="ghost" size="icon" icon={X} onClick={onClose} className="-ml-2" />
        <span className="font-black text-text-primary ml-2">{title}</span>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}

function ShopBrowse({
  serverId,
  shop,
  server,
  isLoading,
  embedded = false,
  actions,
  onAddToCart,
}: {
  serverId: string
  shop?: Shop | null
  server?: ServerSummary | null
  isLoading?: boolean
  embedded?: boolean
  actions?: React.ReactNode
  onAddToCart?: (product: Product, e: React.MouseEvent) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    activeCategoryId,
    setActiveCategoryId,
    searchQuery,
    setSearchQuery,
    setActiveProductId,
    sortBy,
    setSortBy,
  } = useShopStore()

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

  const { data: entitlements = [] } = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => fetchApi<EntitlementOwnership[]>('/api/entitlements'),
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
  const totalSales = products.reduce((sum, product) => sum + (product.salesCount ?? 0), 0)
  const ratedProducts = products.filter((product) => product.ratingCount > 0)
  const averageRating =
    ratedProducts.length > 0
      ? ratedProducts.reduce((sum, product) => sum + product.avgRating, 0) / ratedProducts.length
      : 0
  const entitlementProducts = products.filter((product) => product.type === 'entitlement').length
  const serverName = server?.name ?? server?.slug ?? serverId
  const ownerProfileId = shop?.ownerUserId ?? server?.ownerId ?? null
  const shopCoverStyle = shop?.bannerUrl
    ? ({ backgroundImage: `url(${shop.bannerUrl})` } as React.CSSProperties)
    : undefined

  return (
    <div className={cn('flex flex-col pb-24', embedded && 'pb-8')}>
      {isLoading ? (
        <div
          className={cn(
            'animate-pulse bg-bg-secondary',
            embedded
              ? 'mx-6 mt-6 h-44 rounded-[28px] border border-border-subtle md:mx-8 md:h-56'
              : 'h-48 md:h-[300px]',
          )}
        />
      ) : (
        <GlassPanel
          className={cn(
            'relative overflow-hidden',
            embedded
              ? 'mx-4 mt-4 rounded-[28px] shadow-[var(--shadow-soft)] md:mx-6'
              : 'mx-auto mt-6 w-full max-w-[1400px] rounded-[32px]',
          )}
        >
          {shopCoverStyle && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-45 blur-[1px]"
              style={shopCoverStyle}
              aria-hidden="true"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-bg-primary/95 via-bg-primary/70 to-bg-primary/30" />
          <div className="relative grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] md:p-6">
            <div className="flex min-w-0 gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-bg-primary/60 text-primary shadow-inner">
                {shop?.logoUrl ? (
                  <img src={shop.logoUrl} alt={shop.name} className="h-full w-full object-cover" />
                ) : (
                  <ShoppingBag size={28} />
                )}
              </div>
              <div className="min-w-0">
                <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                  <ShoppingBag size={13} />
                  <span className="truncate whitespace-nowrap">{t('shop.serverStorefront')}</span>
                </div>
                <h1 className="break-words text-2xl font-black tracking-tight text-text-primary md:text-3xl">
                  {shop?.name ?? t('server.settingsShop', { defaultValue: '店铺' })}
                </h1>
                {shop?.description && (
                  <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-text-secondary">
                    {shop.description}
                  </p>
                )}
                <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/55 px-3 py-1.5 text-xs font-black text-text-muted">
                  <ShieldCheck size={13} className="text-primary" />
                  <span className="truncate">
                    {t('shop.serverProvidedBy', {
                      server: serverName,
                      shop: shop?.name ?? t('server.settingsShop', { defaultValue: '店铺' }),
                    })}
                  </span>
                </div>
                {ownerProfileId && (
                  <div className="mt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="glass"
                      onClick={() =>
                        navigate({
                          to: '/profile/$userId',
                          params: { userId: ownerProfileId },
                        })
                      }
                    >
                      {t('shop.openOwnerProfile')}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
              <ShopSignal
                icon={<Package size={15} />}
                label={t('shop.allProducts')}
                value={String(products.length)}
              />
              <ShopSignal
                icon={<ShieldCheck size={15} />}
                label={t('shop.entitlement')}
                value={String(entitlementProducts)}
              />
              <ShopSignal
                icon={<Star size={15} />}
                label={ratedProducts.length > 0 ? t('shop.reviews') : t('shop.soldCount')}
                value={
                  ratedProducts.length > 0
                    ? averageRating.toFixed(1)
                    : totalSales > 999
                      ? '999+'
                      : String(totalSales)
                }
              />
            </div>
          </div>
        </GlassPanel>
      )}

      {/* ── Container for Filters & Grid (PC Friendly Layout) ── */}
      <div className={cn(embedded ? 'w-full px-4 pb-6 md:px-6' : 'mx-auto w-full max-w-[1400px]')}>
        {/* ── Discovery Bar ── */}
        <div
          className={cn(
            'z-10',
            embedded
              ? 'bg-transparent px-0 py-4'
              : 'sticky top-0 border-b border-border-subtle bg-bg-primary/90 px-4 pb-4 pt-5 backdrop-blur-xl md:static md:px-8',
          )}
        >
          <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            {/* Search */}
            <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-center">
              <div className="flex-1 md:max-w-md">
                <Input
                  icon={Search}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('shop.searchProducts')}
                  className="!rounded-full"
                />
              </div>

              {/* Sort Controls */}
              <div className="flex items-center gap-1 bg-bg-secondary/60 p-1 rounded-full shrink-0 self-start">
                {[
                  { key: 'default' as const, label: t('shop.sortDefault') },
                  { key: 'sales' as const, label: t('shop.sortSales') },
                  { key: 'newest' as const, label: t('shop.sortNewest') },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setSortBy(tab.key)}
                    className={cn(
                      'text-xs font-black uppercase tracking-widest transition-all px-4 py-1.5 rounded-full',
                      sortBy === tab.key
                        ? 'bg-primary text-white shadow-lg shadow-primary/25'
                        : 'text-text-secondary hover:text-text-primary',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setSortBy(sortBy === 'price-asc' ? 'price-desc' : 'price-asc')}
                  className={cn(
                    'text-xs font-black uppercase tracking-widest transition-all px-4 py-1.5 rounded-full flex items-center gap-1.5',
                    sortBy === 'price-asc' || sortBy === 'price-desc'
                      ? 'bg-primary text-white shadow-lg shadow-primary/25'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {t('shop.sortPrice')}
                  <span className="flex flex-col leading-none -space-y-0.5">
                    <span
                      className={`text-[9px] ${sortBy === 'price-asc' ? 'text-accent' : 'opacity-30'}`}
                    >
                      ▲
                    </span>
                    <span
                      className={`text-[9px] ${sortBy === 'price-desc' ? 'text-accent' : 'opacity-30'}`}
                    >
                      ▼
                    </span>
                  </span>
                </button>
              </div>
            </div>

            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>

          {/* Categories Pills */}
          <div className="-mx-2 flex items-center gap-2 overflow-x-auto px-2 pb-2 pt-1 scrollbar-hidden md:-mx-0 md:px-0">
            <button
              type="button"
              onClick={() => setActiveCategoryId(null)}
              className={cn(
                'whitespace-nowrap px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all',
                !activeCategoryId
                  ? 'bg-primary text-white shadow-lg shadow-primary/25'
                  : 'bg-bg-secondary text-text-secondary ring-1 ring-border-subtle hover:bg-bg-modifier-hover',
              )}
            >
              {t('shop.allProducts')}
            </button>
            {topCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={cn(
                  'whitespace-nowrap px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all',
                  activeCategoryId === cat.id
                    ? 'bg-primary text-white shadow-lg shadow-primary/25'
                    : 'bg-bg-secondary text-text-secondary ring-1 ring-border-subtle hover:bg-bg-modifier-hover',
                )}
              >
                {cat.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFavoriteOnly((v) => !v)}
              className={cn(
                'whitespace-nowrap px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all',
                favoriteOnly
                  ? 'bg-accent text-black shadow-lg shadow-accent/25'
                  : 'bg-bg-secondary text-text-secondary ring-1 ring-border-subtle hover:bg-bg-modifier-hover',
              )}
            >
              {t('shop.favoritesWithCount', { count: favoriteIds.length })}
            </button>
          </div>
        </div>

        {/* ── Product Grid ── */}
        <div className={cn(embedded ? 'px-0 py-4' : 'px-4 py-6 md:px-8')}>
          {isProductsLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="animate-pulse overflow-hidden !rounded-lg">
                  <div className="aspect-[3/2] bg-bg-modifier-hover" />
                  <div className="p-4 space-y-3">
                    <div className="h-5 bg-bg-modifier-hover rounded-lg w-3/4" />
                    <div className="h-4 bg-bg-modifier-hover rounded-lg w-1/2" />
                    <div className="h-6 bg-bg-modifier-hover rounded-lg w-1/3 mt-4" />
                  </div>
                </Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className={cn('flex', embedded ? 'min-h-[420px]' : 'min-h-[520px]')}>
              <GlassPanel
                className={cn(
                  'flex flex-1 items-center justify-center rounded-[32px] border-dashed px-6 py-10',
                  embedded ? 'shadow-[var(--shadow-soft)]' : '',
                )}
              >
                <EmptyState
                  icon={ShoppingBag}
                  title={t('shop.noProductsFound')}
                  description={t('shop.noProductsFoundHint')}
                />
              </GlassPanel>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {filtered.map((product) => {
                const purchased = hasActivePurchasedEntitlement(product, entitlements)
                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={() => setActiveProductId(product.id)}
                    onAddToCart={purchased ? undefined : onAddToCart}
                    shopName={shop?.name}
                    serverName={serverName}
                    purchased={purchased}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ShopSignal({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-primary/55 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-primary">
        {icon}
        <span className="text-lg font-black text-text-primary tabular-nums">{value}</span>
      </div>
      <div className="truncate text-xs font-black text-text-muted">{label}</div>
    </div>
  )
}
