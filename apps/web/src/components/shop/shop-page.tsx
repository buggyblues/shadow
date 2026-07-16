import { Button, Card, cn, EmptyState, GlassPanel, TooltipAnchor } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowLeft,
  ClipboardList,
  Heart,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Wallet,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import {
  type EntitlementOwnership,
  hasActivePurchasedEntitlement,
} from '../../lib/commerce-products'
import { showToast } from '../../lib/toast'
import { useRechargeStore } from '../../stores/recharge.store'
import { useShopStore } from '../../stores/shop.store'
import { useOsWindowHeaderSearch } from '../window/window-header-tools'
import { ProductDetail } from './product-detail'
import { ShopCart } from './shop-cart'
import { ShopOrders } from './shop-orders'
import { PriceDisplay } from './ui/currency'
import { ProductCard } from './ui/product-card'
import { ShopPillBar, ShopPillButton, ShopSearchField } from './ui/shop-layout'

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
  const search = useSearch({ strict: false }) as { product?: string }
  const queryClient = useQueryClient()
  const routeProductId = typeof search.product === 'string' ? search.product : null
  const selectedProductId = routeProductId ?? activeProductId
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

  useEffect(() => {
    setActiveProductId(routeProductId)
  }, [routeProductId, setActiveProductId])

  const openProduct = useCallback(
    (productId: string) => {
      setOverlay(null)
      navigate({
        to: '/servers/$serverSlug/shop',
        params: { serverSlug: serverId },
        search: { product: productId },
      })
    },
    [navigate, serverId, setOverlay],
  )

  const closeProduct = useCallback(() => {
    navigate({
      to: '/servers/$serverSlug/shop',
      params: { serverSlug: serverId },
      search: {},
    })
  }, [navigate, serverId])

  const quickAddToCart = useMutation({
    mutationFn: (data: { productId: string; quantity: number }) =>
      fetchApi(`/api/servers/${serverId}/shop/cart`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-cart', serverId] })
      showToast(t('shop.addedToCart'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('shop.addToCartFailed'), 'error'),
  })

  // Product detail view
  if (selectedProductId) {
    const detail = (
      <ProductDetail
        serverId={serverId}
        productId={selectedProductId}
        isAdmin={isAdmin}
        onBack={closeProduct}
        embedded
        shop={shop}
        server={server}
      />
    )

    if (embedded) {
      return <div className={shellClassName}>{detail}</div>
    }

    return <GlassPanel className={shellClassName}>{detail}</GlassPanel>
  }

  const actionGroupClassName =
    'flex items-center gap-1 rounded-2xl border border-border-subtle bg-bg-secondary/20 p-1 backdrop-blur-xl'

  const actionControls = (
    <>
      {wallet && (
        <TooltipAnchor label={t('recharge.title')}>
          <button
            type="button"
            onClick={() => useRechargeStore.getState().openModal()}
            className="flex items-center gap-1.5 rounded-2xl border border-accent/20 bg-accent/10 px-3 py-2 text-accent transition hover:bg-accent/15"
            aria-label={t('recharge.title')}
          >
            <Wallet size={14} className="text-accent" />
            <PriceDisplay amount={wallet.balance} size={13} />
            <span className="text-xs font-bold text-accent">+</span>
          </button>
        </TooltipAnchor>
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

  const shopShellContent = (
    <>
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
            <div className="min-w-0">
              <h2 className="truncate text-base font-black tracking-tight text-text-primary">
                {shop?.name || (isShopLoading ? t('common.loading') : t('server.settingsShop'))}
              </h2>
              <div className="text-[11px] font-black text-text-muted">
                {t('shop.serverStorefront')}
              </div>
            </div>
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
          embedded={embedded}
          actions={embedded ? actionControls : null}
          onOpenProduct={openProduct}
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
          <ShopOrders serverId={serverId} onOpenProduct={openProduct} />
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
              openProduct(productId)
            }}
          />
        </OverlayContainer>
      )}
    </>
  )

  if (embedded) {
    return <div className={shellClassName}>{shopShellContent}</div>
  }

  return <GlassPanel className={shellClassName}>{shopShellContent}</GlassPanel>
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
  embedded = false,
  actions,
  onOpenProduct,
  onAddToCart,
}: {
  serverId: string
  shop?: Shop | null
  server?: ServerSummary | null
  embedded?: boolean
  actions?: React.ReactNode
  onOpenProduct: (productId: string) => void
  onAddToCart?: (product: Product, e: React.MouseEvent) => void
}) {
  const { t } = useTranslation()
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
  useOsWindowHeaderSearch(
    'shop-search',
    embedded
      ? {
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: t('shop.searchProducts'),
        }
      : null,
  )

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
  const serverName = server?.name ?? server?.slug ?? serverId

  return (
    <div className={cn('flex flex-col pb-24', embedded && 'pb-8')}>
      {/* ── Container for Filters & Grid (PC Friendly Layout) ── */}
      <div
        className={cn(embedded ? 'w-full px-4 pb-6 md:px-6' : 'mx-auto w-full max-w-[1400px] px-5')}
      >
        {/* ── Discovery Bar ── */}
        <div
          className={cn(
            'z-10',
            embedded
              ? 'bg-transparent px-0 py-4'
              : 'sticky top-0 py-4 backdrop-blur-xl md:static md:backdrop-blur-none',
          )}
        >
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            {/* Search */}
            <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
              {!embedded ? (
                <div className="flex-1 lg:max-w-md">
                  <ShopSearchField
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder={t('shop.searchProducts')}
                  />
                </div>
              ) : null}

              {/* Sort Controls */}
              <div className="flex items-center gap-1 rounded-full border border-[var(--glass-line)] bg-bg-primary/45 p-1 backdrop-blur-xl shrink-0 self-start">
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
                      'rounded-full px-4 py-1.5 text-xs font-black transition',
                      sortBy === tab.key
                        ? 'bg-primary text-bg-primary shadow-[0_8px_20px_rgba(0,198,209,0.22)]'
                        : 'text-text-muted hover:bg-bg-tertiary/60 hover:text-text-primary',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setSortBy(sortBy === 'price-asc' ? 'price-desc' : 'price-asc')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-black transition',
                    sortBy === 'price-asc' || sortBy === 'price-desc'
                      ? 'bg-primary text-bg-primary shadow-[0_8px_20px_rgba(0,198,209,0.22)]'
                      : 'text-text-muted hover:bg-bg-tertiary/60 hover:text-text-primary',
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
          <ShopPillBar>
            <ShopPillButton onClick={() => setActiveCategoryId(null)} active={!activeCategoryId}>
              {t('shop.allProducts')}
            </ShopPillButton>
            {topCategories.map((cat) => (
              <ShopPillButton
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                active={activeCategoryId === cat.id}
              >
                {cat.name}
              </ShopPillButton>
            ))}
            <ShopPillButton
              onClick={() => setFavoriteOnly((v) => !v)}
              active={favoriteOnly}
              tone="accent"
            >
              {t('shop.favoritesWithCount', { count: favoriteIds.length })}
            </ShopPillButton>
          </ShopPillBar>
        </div>

        {/* ── Product Grid ── */}
        <div className={cn(embedded ? 'px-0 py-4' : 'py-5')}>
          {isProductsLoading ? (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="animate-pulse overflow-hidden !rounded-[24px]">
                  <div className="aspect-[16/9] bg-bg-modifier-hover" />
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
              <div className="flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-[var(--glass-line)] bg-bg-secondary/30 px-6 py-10">
                <EmptyState
                  icon={ShoppingBag}
                  title={t('shop.noProductsFound')}
                  description={t('shop.noProductsFoundHint')}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
              {filtered.map((product) => {
                const purchased = hasActivePurchasedEntitlement(product, entitlements)
                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={() => onOpenProduct(product.id)}
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
