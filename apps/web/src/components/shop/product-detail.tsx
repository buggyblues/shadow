import { Badge, Button, cn, GlassPanel } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Heart,
  MessageSquare,
  Minus,
  Package,
  Plus,
  ReceiptText,
  Share,
  Shield,
  Star,
  Store,
  Upload,
  WalletCards,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { copyToClipboard } from '../../lib/clipboard'
import {
  type CommerceDeliveryEntitlement,
  type CommercePurchaseOrder,
  entitlementHasOpenablePaidFile,
  findPurchaseEntitlement,
} from '../../lib/commerce-delivery'
import {
  type EntitlementOwnership,
  hasActivePurchasedEntitlement,
} from '../../lib/commerce-products'
import {
  DESKTOP_PET_PACK_ASSET_TYPE,
  hasDesktopPetPackTag,
} from '../../lib/desktop-pet-marketplace'
import { showToast } from '../../lib/toast'
import { OrderConfirm } from './order-confirm'
import type { Product, ProductMediaItem, ServerSummary, Shop, SkuItem } from './shop-page'
import { PriceDisplay } from './ui/currency'
import { ProductVisual } from './ui/product-visual'
import { ShopPanel } from './ui/shop-layout'

function createIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

interface ProductDetailProps {
  serverId: string
  productId: string
  isAdmin?: boolean
  onBack: () => void
  embedded?: boolean
  shop?: Shop | null
  server?: ServerSummary | null
}

interface Review {
  id: string
  userId: string
  authorName?: string
  isAnonymous?: boolean
  rating: number
  content?: string
  images?: string[]
  reply?: string
  repliedAt?: string
  createdAt: string
}

function firstEntitlementConfig(product?: Product | null) {
  const config = Array.isArray(product?.entitlementConfig)
    ? product?.entitlementConfig[0]
    : product?.entitlementConfig
  return config ?? null
}

function isInstantDeliveryProduct(product?: Product | null) {
  if (product?.type !== 'entitlement') return false
  const config = firstEntitlementConfig(product)
  return config?.resourceType !== 'service'
}

function productAssetType(product?: Product | null) {
  if (hasDesktopPetPackTag(product?.tags)) return DESKTOP_PET_PACK_ASSET_TYPE
  const config = firstEntitlementConfig(product)
  if (config?.resourceType !== 'community_asset') return null
  return product?.tags?.find((tag) =>
    ['badge', 'gift', 'coupon', 'service_ticket', 'collectible'].includes(tag),
  )
}

function splitPrivilegeLines(value?: string | null) {
  return (value ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function FulfillmentPanel({ product }: { product: Product }) {
  const { t } = useTranslation()
  const config = firstEntitlementConfig(product)
  const isAsset = config?.resourceType === 'community_asset'
  const isFile = config?.resourceType === 'workspace_file'
  const isExternalApp = config?.resourceType === 'external_app'

  return (
    <ShopPanel className="mb-4 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {isAsset ? <Package size={18} /> : <Shield size={18} />}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-black text-text-primary">
            {isAsset
              ? t('shop.fulfillmentAssetTitle')
              : isFile
                ? t('shop.fulfillmentFileTitle')
                : isExternalApp
                  ? t('shop.fulfillmentExternalAppTitle')
                  : t('shop.fulfillmentServiceTitle')}
          </div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {isAsset
              ? t('shop.fulfillmentAssetHint')
              : isFile
                ? t('shop.fulfillmentFileHint')
                : isExternalApp
                  ? t('shop.fulfillmentExternalAppHint')
                  : t('shop.fulfillmentServiceHint')}
          </p>
        </div>
      </div>
    </ShopPanel>
  )
}

function PurchaseNextPanel({
  order,
  entitlement,
}: {
  order: CommercePurchaseOrder
  entitlement?: CommerceDeliveryEntitlement | null
}) {
  const { t } = useTranslation()
  const hasDeliveryDetail = Boolean(entitlement?.id)
  const openContent = entitlementHasOpenablePaidFile(entitlement)

  return (
    <ShopPanel className="mb-4 border-success/25 bg-success/10 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
          <CheckCircle2 size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-text-primary">
            {hasDeliveryDetail ? t('shop.purchaseNextReadyTitle') : t('shop.purchaseNextTitle')}
          </div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {hasDeliveryDetail ? t('shop.purchaseNextReadyHint') : t('shop.purchaseNextHint')}
          </p>
          <div className="mt-2 text-xs font-bold text-text-muted">
            {t('shop.orderNo')}: {order.orderNo ?? order.id.slice(0, 8)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to={
                hasDeliveryDetail
                  ? '/settings/wallet/orders/$entitlementId'
                  : '/settings/wallet/entitlements'
              }
              params={hasDeliveryDetail ? { entitlementId: entitlement!.id } : undefined}
              search={hasDeliveryDetail && openContent ? { open: '1' } : undefined}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-success px-3 text-xs font-black text-white transition hover:bg-success/90"
            >
              <ReceiptText size={14} />
              {hasDeliveryDetail ? t('shop.viewDeliveryDetail') : t('shop.viewPurchaseDelivery')}
            </Link>
            <Link
              to="/settings/wallet/entitlements"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/60 px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
            >
              <WalletCards size={14} />
              {t('shop.openPurchaseDelivery')}
            </Link>
          </div>
        </div>
      </div>
    </ShopPanel>
  )
}

function AssetTrustPanel({ product }: { product: Product }) {
  const { t } = useTranslation()
  const config = firstEntitlementConfig(product)

  return (
    <ShopPanel className="mb-4 border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Shield size={18} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-black text-text-primary">{t('shop.assetProfileTitle')}</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {config?.privilegeDescription || product.summary || t('shop.assetProfileHint')}
          </p>
        </div>
      </div>
    </ShopPanel>
  )
}

function ProductSourcePanel({
  product,
  shop,
  server,
}: {
  product: Product
  shop?: Shop | null
  server?: ServerSummary | null
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const shopName = shop?.name ?? t('commerce.consumerStorefront')
  const serverName = server?.name ?? server?.slug ?? null
  const isInstant = isInstantDeliveryProduct(product)
  const shopServerSlug = server?.slug ?? server?.id ?? shop?.serverId ?? null
  const ownerProfileId = shop?.ownerUserId ?? server?.ownerId ?? null
  const canOpenShop = Boolean(shopServerSlug || shop?.ownerUserId)
  const openShop = () => {
    if (shopServerSlug) {
      navigate({
        to: '/servers/$serverSlug/shop',
        params: { serverSlug: shopServerSlug },
      })
      return
    }
    if (shop?.ownerUserId) {
      navigate({
        to: '/shop/users/$userId',
        params: { userId: shop.ownerUserId },
        search: { view: 'buyer' },
      })
    }
  }
  const openOwnerProfile = () => {
    if (!ownerProfileId) return
    navigate({
      to: '/profile/$userId',
      params: { userId: ownerProfileId },
    })
  }

  return (
    <ShopPanel className="mb-4 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
          {shop?.logoUrl ? (
            <img src={shop.logoUrl} alt={shopName} className="h-full w-full object-cover" />
          ) : (
            <Store size={18} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-black text-text-primary">
            <span className="truncate">{t('shop.productSourceTitle', { shop: shopName })}</span>
          </div>
          {serverName && (
            <div className="mt-1 text-xs font-bold text-text-muted">
              {t('shop.productSourceServer', { server: serverName })}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
              <Shield size={12} />
              <span className="truncate">
                {isInstant ? t('commerce.immediateDelivery') : t('commerce.manualDelivery')}
              </span>
            </span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--glass-line)] pt-3">
        {canOpenShop && (
          <Button type="button" variant="glass" size="sm" onClick={openShop}>
            <Store size={15} />
            {t('shop.openShop')}
          </Button>
        )}
        {ownerProfileId && (
          <Button type="button" variant="glass" size="sm" onClick={openOwnerProfile}>
            {t('shop.openOwnerProfile')}
          </Button>
        )}
      </div>
    </ShopPanel>
  )
}

export function ProductDetail({
  serverId,
  productId,
  isAdmin: _isAdmin,
  onBack,
  embedded = false,
  shop,
  server,
}: ProductDetailProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: product, isLoading } = useQuery({
    queryKey: ['shop-product', productId],
    queryFn: () =>
      fetchApi<Product & { media: ProductMediaItem[]; skus: SkuItem[] }>(
        `/api/servers/${serverId}/shop/products/${productId}`,
      ),
  })

  const { data: reviews } = useQuery({
    queryKey: ['product-reviews', productId],
    queryFn: () =>
      fetchApi<Review[]>(`/api/servers/${serverId}/shop/products/${productId}/reviews`),
  })

  const { data: entitlements = [] } = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => fetchApi<EntitlementOwnership[]>('/api/entitlements'),
  })

  // Cart operations
  const addToCart = useMutation({
    mutationFn: (data: { productId: string; skuId?: string; quantity: number }) =>
      fetchApi(`/api/servers/${serverId}/shop/cart`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-cart', serverId] })
      setAddedToCart(true)
      setTimeout(() => setAddedToCart(false), 2000)
    },
    onError: (err: Error) => showToast(err.message || t('shop.addToCartError'), 'error'),
  })

  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [addedToCart, setAddedToCart] = useState(false)
  const [showOrderConfirm, setShowOrderConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState<'detail' | 'reviews'>('detail')
  const [isFavorite, setIsFavorite] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [supportMessage, setSupportMessage] = useState('')
  const [supportImages, setSupportImages] = useState<string[]>([])
  const [uploadingCount, setUploadingCount] = useState(0)
  const [buyingNow, setBuyingNow] = useState(false)
  const [lastPurchase, setLastPurchase] = useState<{
    order: CommercePurchaseOrder
    entitlement?: CommerceDeliveryEntitlement | null
  } | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem(`shop:favorites:${serverId}`)
    const ids: string[] = raw ? JSON.parse(raw) : []
    setIsFavorite(ids.includes(productId))
  }, [productId, serverId])

  // Media carousel
  const media = product?.media || []
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)
  const carouselTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (media.length <= 1) return
    carouselTimerRef.current = setInterval(() => {
      setCurrentMediaIndex((prev) => (prev + 1) % media.length)
    }, 5000)
    return () => {
      if (carouselTimerRef.current) clearInterval(carouselTimerRef.current)
    }
  }, [media.length])

  const goToMedia = useCallback(
    (index: number) => {
      setCurrentMediaIndex(index)
      if (carouselTimerRef.current) clearInterval(carouselTimerRef.current)
      carouselTimerRef.current = setInterval(() => {
        setCurrentMediaIndex((prev) => (prev + 1) % media.length)
      }, 5000)
    },
    [media.length],
  )

  const contactSupport = useMutation({
    mutationFn: (payload: { message: string; images: string[] }) =>
      fetchApi<{
        channelId: string
        channelName: string
        buddyUserId?: string | null
        buddyReady?: boolean
        buddyStatus?: 'running' | 'stopped' | 'error' | null
      }>(`/api/servers/${serverId}/shop/support`, {
        method: 'POST',
        body: JSON.stringify({
          productId,
          message: payload.message,
          images: payload.images,
        }),
      }),
    onSuccess: (res) => {
      setSupportOpen(false)
      setSupportMessage('')
      setSupportImages([])
      navigate({
        to: '/servers/$serverSlug/channels/$channelId',
        params: { serverSlug: serverId, channelId: res.channelId },
      })
      if (res.buddyUserId) {
        if (res.buddyReady) {
          showToast(t('shop.buddyReady'), 'success')
        } else {
          showToast(t('shop.buddyWaiting'), 'info')
        }
      } else {
        showToast(t('shop.contactSellerDone'), 'success')
      }
    },
    onError: (err: Error) => showToast(err.message || t('shop.contactSupportError'), 'error'),
  })

  if (isLoading || !product) {
    return (
      <div className="flex-1 flex flex-col bg-bg-primary h-full">
        <div className="h-14 flex items-center px-4">
          <div className="w-8 h-8 rounded-xl bg-bg-tertiary animate-pulse" />
        </div>
        <div className="w-full aspect-[3/2] bg-bg-tertiary animate-pulse" />
      </div>
    )
  }

  const selectedSku = product.skus?.find((s) => s.id === selectedSkuId)
  const price = selectedSku?.price ?? product.basePrice
  const stock = selectedSku?.stock ?? product.skus?.[0]?.stock ?? 999
  const hasSpecs = product.specNames.length > 0 && (product.skus?.length ?? 0) > 0
  const entitlementConfig = firstEntitlementConfig(product)
  const alreadyPurchased = hasActivePurchasedEntitlement(product, entitlements)

  const handleAddToCart = () => {
    if (alreadyPurchased) {
      showToast(t('shop.alreadyPurchased'), 'info')
      return
    }
    addToCart.mutate({ productId: product.id, skuId: selectedSkuId ?? undefined, quantity })
  }

  const handleBuyNow = async () => {
    if (alreadyPurchased) {
      showToast(t('shop.alreadyPurchased'), 'info')
      return
    }
    if (buyingNow) return
    if ((!hasSpecs || !!selectedSkuId) && quantity === 1) {
      setBuyingNow(true)
      try {
        const order = await fetchApi<CommercePurchaseOrder>(
          `/api/servers/${serverId}/shop/orders`,
          {
            method: 'POST',
            body: JSON.stringify({
              idempotencyKey: createIdempotencyKey('shop-order'),
              items: [{ productId: product.id, skuId: selectedSkuId ?? undefined, quantity }],
            }),
          },
        )
        showToast(t('shop.purchaseSuccess'), 'success')
        queryClient.invalidateQueries({ queryKey: ['shop-orders', serverId] })
        queryClient.invalidateQueries({ queryKey: ['wallet'] })
        queryClient.invalidateQueries({ queryKey: ['shop-cart', serverId] })
        queryClient.invalidateQueries({ queryKey: ['entitlements'] })
        queryClient.invalidateQueries({ queryKey: ['community-assets'] })
        const entitlement = await findPurchaseEntitlement({
          orderId: order.id,
          productId: product.id,
        }).catch(() => null)
        if (entitlement && entitlementHasOpenablePaidFile(entitlement)) {
          navigate({
            to: '/settings/wallet/orders/$entitlementId',
            params: { entitlementId: entitlement.id },
            search: { open: '1' },
          })
          return
        }
        setLastPurchase({ order, entitlement })
      } catch (err) {
        showToast((err as Error)?.message || t('shop.purchaseError'), 'error')
      } finally {
        setBuyingNow(false)
      }
      return
    }
    setShowOrderConfirm(true)
  }

  // Show order confirmation view
  if (showOrderConfirm) {
    return (
      <OrderConfirm
        serverId={serverId}
        productId={product.id}
        skuId={selectedSkuId ?? undefined}
        quantity={quantity}
        onBack={() => setShowOrderConfirm(false)}
      />
    )
  }

  const handleToggleFavorite = () => {
    const raw = localStorage.getItem(`shop:favorites:${serverId}`)
    const ids: string[] = raw ? JSON.parse(raw) : []
    const next = ids.includes(product.id)
      ? ids.filter((id) => id !== product.id)
      : [...ids, product.id]
    localStorage.setItem(`shop:favorites:${serverId}`, JSON.stringify(next))
    setIsFavorite(next.includes(product.id))
    window.dispatchEvent(new Event('shop:favorites-changed'))
    showToast(
      next.includes(product.id) ? t('shop.favoriteAdded') : t('shop.favoriteRemoved'),
      'success',
    )
  }

  const handleShare = async () => {
    const shareText = `${product.name} - ${window.location.origin}/app/servers/${serverId}/shop?product=${product.id}`
    try {
      if (navigator.share) {
        await navigator.share({
          title: product.name,
          text: product.summary || product.name,
          url: shareText.split(' - ')[1],
        })
        showToast(t('shop.shareStarted'), 'success')
        return
      }
      await copyToClipboard(shareText, {
        successMessage: t('shop.shareLinkCopied'),
        errorMessage: t('shop.shareUnavailable'),
      })
    } catch {
      showToast(t('shop.shareUnavailable'), 'error')
    }
  }

  const uploadSupportImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingCount(files.length)
    try {
      const uploaded = await Promise.all(
        Array.from(files).map(async (file) => {
          const formData = new FormData()
          formData.append('file', file)
          const res = await fetchApi<{ url: string; signedUrl?: string }>('/api/media/upload', {
            method: 'POST',
            body: formData,
          })
          return res.url
        }),
      )
      setSupportImages((prev) => [...prev, ...uploaded].slice(0, 6))
    } catch (err) {
      showToast((err as Error).message || t('shop.uploadImageError'), 'error')
    } finally {
      setUploadingCount(0)
    }
  }

  return (
    <div
      className={cn(
        'relative z-30 flex h-full flex-1 flex-col overflow-hidden font-sans',
        embedded ? 'bg-transparent' : 'bg-bg-primary',
      )}
    >
      {/* ── Top Header ── */}
      <div
        className={cn(
          'sticky top-0 z-50 flex shrink-0 items-center justify-between border-b border-border-subtle backdrop-blur-xl',
          embedded ? 'bg-bg-secondary/10 px-5 py-4' : 'bg-bg-tertiary/50 p-4',
        )}
      >
        <Button variant="ghost" size="icon" icon={ArrowLeft} onClick={onBack} />
        <span className="font-black text-text-primary truncate max-w-[200px]">{product.name}</span>
        <div className="flex gap-1 items-center">
          <Button variant="ghost" size="icon" onClick={handleToggleFavorite}>
            <Heart size={18} className={isFavorite ? 'fill-danger text-danger' : ''} />
          </Button>
          <Button variant="ghost" size="icon" icon={Share} onClick={handleShare} />
        </div>
      </div>

      {/* ── Main Content Area ── */}
      <div className="relative flex-1 overflow-y-auto overflow-x-hidden scrollbar-hidden">
        <div
          className={cn(
            'mx-auto w-full max-w-[1200px] pb-28 md:pb-10 md:px-6',
            embedded ? 'px-5 pt-5 md:pt-6' : 'pt-0',
          )}
        >
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)] lg:items-start">
            {/* ═══ Left Column: Media Gallery ═══ */}
            <div className="min-w-0 w-full lg:sticky lg:top-6">
              <div className="mx-auto w-full max-w-[760px] lg:max-w-none">
                {media.length > 0 ? (
                  <div className="relative flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/40 shadow-sm">
                    {media[currentMediaIndex]?.type === 'video' ? (
                      <video
                        src={media[currentMediaIndex].url}
                        className="w-full h-full object-cover"
                        controls
                        autoPlay
                        muted
                      />
                    ) : (
                      <img
                        src={media[currentMediaIndex]?.url}
                        alt={product.name}
                        className="w-full h-full object-cover transition-opacity duration-500"
                      />
                    )}

                    {/* Dots indicator */}
                    {media.length > 1 && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-bg-deep/30 backdrop-blur-xl rounded-full">
                        {media.map((m, i) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => goToMedia(i)}
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              i === currentMediaIndex
                                ? 'w-5 bg-white'
                                : 'w-1.5 bg-bg-tertiary/500 hover:bg-white/80'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <ProductVisual
                    name={product.name}
                    media={product.media}
                    productType={product.type}
                    resourceType={entitlementConfig?.resourceType}
                    assetType={productAssetType(product)}
                    className="aspect-[3/2] w-full rounded-[24px]"
                  />
                )}

                {/* Thumbnails below main image (PC only) */}
                {media.length > 1 && (
                  <div className="mt-4 hidden min-w-0 gap-3 overflow-x-auto pb-2 scrollbar-hidden md:flex">
                    {media.map((m, i) => (
                      <button
                        type="button"
                        key={`thumb-${m.id}`}
                        onClick={() => goToMedia(i)}
                        className={`aspect-[3/2] w-24 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                          i === currentMediaIndex
                            ? 'border-primary p-0.5'
                            : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <div className="w-full h-full rounded-lg overflow-hidden bg-bg-tertiary">
                          {m.type === 'video' ? (
                            <div className="w-full h-full flex items-center justify-center bg-bg-tertiary">
                              <span className="text-[11px]">VIDEO</span>
                            </div>
                          ) : (
                            <img src={m.url} className="w-full h-full object-cover" alt="" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ═══ Right Column: Product Info & Actions ═══ */}
            <div className="flex min-w-0 w-full flex-col">
              <div className="min-w-0">
                <ShopPanel className="mb-4 grid gap-4 p-4 md:p-5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="flex items-baseline gap-1 text-3xl font-black text-danger">
                      <PriceDisplay amount={price} size={32} />
                    </span>
                    {product.basePrice !== price && (
                      <span className="flex items-center gap-0.5 text-sm text-text-muted line-through">
                        <PriceDisplay amount={product.basePrice} size={14} />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h1 className="break-words text-xl font-black leading-snug text-text-primary md:text-3xl">
                      {product.name}
                    </h1>

                    {product.summary && (
                      <p className="mt-2 text-sm leading-relaxed text-text-muted md:text-base">
                        {product.summary}
                      </p>
                    )}
                  </div>

                  <div className="hidden gap-3 md:flex">
                    <button
                      type="button"
                      onClick={() => setSupportOpen(true)}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--glass-line)] bg-bg-secondary/45 text-text-muted transition-colors hover:text-primary"
                      aria-label={t('shop.customerService')}
                      title={t('shop.customerService')}
                    >
                      <MessageSquare size={20} />
                    </button>
                    <Button
                      variant="glass"
                      className="flex-1 py-4"
                      onClick={handleAddToCart}
                      disabled={alreadyPurchased || addToCart.isPending || stock === 0}
                    >
                      {alreadyPurchased ? (
                        t('shop.purchased')
                      ) : addedToCart ? (
                        <span className="flex items-center justify-center gap-2">
                          <CheckCircle2 size={18} /> {t('shop.addedToCart')}
                        </span>
                      ) : (
                        t('shop.addToCart')
                      )}
                    </Button>
                    <Button
                      variant="primary"
                      className="flex-1 py-4"
                      onClick={handleBuyNow}
                      disabled={alreadyPurchased || stock === 0 || buyingNow}
                    >
                      {alreadyPurchased
                        ? t('shop.purchased')
                        : buyingNow
                          ? t('shop.paymentProcessing')
                          : t('shop.buyNow')}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {product.type === 'entitlement' && (
                      <Badge variant="warning" size="sm" className="flex items-center gap-1.5">
                        <Shield size={14} />
                        {t('shop.entitlement')}
                      </Badge>
                    )}
                    {product.tags?.map((tag: string) => (
                      <Badge key={tag} variant="neutral" size="sm">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </ShopPanel>

                <ProductSourcePanel product={product} shop={shop} server={server} />
                <AssetTrustPanel product={product} />
                <FulfillmentPanel product={product} />
                {lastPurchase && (
                  <PurchaseNextPanel
                    order={lastPurchase.order}
                    entitlement={lastPurchase.entitlement}
                  />
                )}

                {/* ═══ SKU Selection ═══ */}
                {(hasSpecs || true) && (
                  <div className="mb-6">
                    {hasSpecs &&
                      product.specNames.map((specName, specIndex) => {
                        const uniqueValues = [
                          ...new Set(
                            product.skus?.map((s) => s.specValues[specIndex]).filter(Boolean),
                          ),
                        ]
                        return (
                          <div key={specName} className="mb-5">
                            <p className="text-text-secondary text-sm font-bold mb-3">{specName}</p>
                            <div className="flex flex-wrap gap-3">
                              {uniqueValues.map((val) => {
                                const isSelected = selectedSku?.specValues[specIndex] === val
                                return (
                                  <button
                                    key={String(val)}
                                    type="button"
                                    onClick={() => {
                                      const baseSpecValues =
                                        selectedSku?.specValues ??
                                        product.skus?.[0]?.specValues ??
                                        []
                                      const newSpecValues = [...baseSpecValues]
                                      if (typeof val !== 'string') return
                                      newSpecValues[specIndex] = val
                                      const matchingSku = product.skus?.find((s) =>
                                        s.specValues.every((v, i) => v === newSpecValues[i]),
                                      )
                                      if (matchingSku) setSelectedSkuId(matchingSku.id)
                                    }}
                                    className={`px-5 py-2.5 text-sm font-bold rounded-xl transition-all border-2 ${
                                      isSelected
                                        ? 'bg-primary/10 text-primary border-primary'
                                        : 'bg-bg-secondary text-text-secondary border-border-subtle hover:border-border-subtle'
                                    }`}
                                  >
                                    {val}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[var(--glass-line)] bg-bg-secondary/30 p-4">
                      <span className="text-text-secondary text-sm font-bold">
                        {t('shop.quantity')}
                      </span>
                      <div className="flex min-w-0 flex-wrap items-center gap-3">
                        <span className="text-[11px] text-text-muted font-medium">
                          {t('shop.stock')}: {stock} {t('shop.unit')}
                        </span>
                        <div className="flex items-center rounded-xl border border-[var(--glass-line)] bg-bg-primary/45 p-1 shadow-sm">
                          <button
                            type="button"
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            disabled={alreadyPurchased || quantity <= 1}
                            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-white disabled:opacity-30 rounded-lg transition-all"
                          >
                            <Minus size={14} strokeWidth={3} />
                          </button>
                          <div className="w-10 text-center text-sm font-bold text-white">
                            {quantity}
                          </div>
                          <button
                            type="button"
                            onClick={() => setQuantity(Math.min(stock, quantity + 1))}
                            disabled={alreadyPurchased || quantity >= stock}
                            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-white disabled:opacity-30 rounded-lg transition-all"
                          >
                            <Plus size={14} strokeWidth={3} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ Entitlement Special Section ═══ */}
                {product.type === 'entitlement' &&
                  product.entitlementConfig &&
                  (() => {
                    const entitlementRules = Array.isArray(product.entitlementConfig)
                      ? product.entitlementConfig
                      : [product.entitlementConfig]
                    if (entitlementRules.length === 0) return null
                    return (
                      <ShopPanel className="mb-4 border-primary/20 bg-primary/5 p-4">
                        <div className="flex items-center gap-2 text-primary text-sm font-bold mb-3">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <Shield size={12} strokeWidth={3} />
                          </div>
                          {t('shop.entitlementDesc')}
                        </div>
                        <div className="space-y-2">
                          {entitlementRules.map((rule, index) => (
                            <div
                              key={`${rule.resourceType ?? 'service'}-${rule.resourceId ?? index}`}
                              className="rounded-xl border border-primary/15 bg-bg-primary/45 p-3"
                            >
                              {(() => {
                                const lines = splitPrivilegeLines(rule.privilegeDescription)
                                if (lines.length <= 1) {
                                  return (
                                    <p className="text-sm font-bold leading-relaxed text-primary/85">
                                      {lines[0] || t('shop.entitlementRuleFallback')}
                                    </p>
                                  )
                                }
                                return (
                                  <ul className="grid gap-1.5 text-sm font-bold leading-relaxed text-primary/85">
                                    {lines.map((line) => (
                                      <li key={line} className="flex gap-2">
                                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                                        <span>{line}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )
                              })()}
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-primary/75">
                                <span>
                                  {t('shop.entitlementRuleTarget', {
                                    resource:
                                      rule.resourceType ??
                                      t('commerce.resourceTypes.service', {
                                        defaultValue: 'service',
                                      }),
                                  })}
                                </span>
                                <span className="text-primary/35">·</span>
                                <span className="inline-flex items-center gap-1">
                                  <Clock size={13} />
                                  {rule.durationSeconds
                                    ? rule.durationSeconds >= 86400
                                      ? `${Math.floor(rule.durationSeconds / 86400)}${t('shop.days')}`
                                      : `${Math.floor(rule.durationSeconds / 3600)}${t('shop.hours')}`
                                    : t('shop.permanent')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ShopPanel>
                    )
                  })()}
              </div>
            </div>
          </div>

          {/* ═══ Details & Reviews Tabs ═══ */}
          <ShopPanel className="mt-6 min-h-[360px] overflow-hidden md:mt-8">
            <div className="flex max-w-full overflow-x-auto border-b border-[var(--glass-line)] bg-bg-secondary/30 px-2 scrollbar-hidden md:px-4">
              <button
                type="button"
                onClick={() => setActiveTab('detail')}
                className={`px-6 py-4 text-sm md:text-base font-bold transition-all relative ${
                  activeTab === 'detail'
                    ? 'text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {t('shop.productDetail')}
                {activeTab === 'detail' && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-t-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('reviews')}
                className={`px-6 py-4 text-sm md:text-base font-bold transition-all relative ${
                  activeTab === 'reviews'
                    ? 'text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {t('shop.reviews')}{' '}
                <span className="ml-1 text-xs opacity-60">({reviews?.length || 0})</span>
                {activeTab === 'reviews' && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-t-full" />
                )}
              </button>
            </div>

            <div className="p-5 md:p-8">
              {activeTab === 'detail' ? (
                <div className="prose dark:prose-invert max-w-none">
                  {product.description ? (
                    <div className="text-text-secondary text-sm md:text-base leading-relaxed whitespace-pre-wrap">
                      {product.description}
                    </div>
                  ) : (
                    <div className="py-20 text-center text-text-muted flex flex-col items-center gap-4">
                      <div className="w-20 h-20 rounded-full bg-bg-tertiary flex items-center justify-center">
                        <Heart className="opacity-20" size={32} />
                      </div>
                      <span className="text-lg font-medium">{t('shop.noDescription')}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  {reviews?.length ? (
                    reviews.map((review) => (
                      <div
                        key={review.id}
                        className="border-b border-border-subtle pb-8 last:border-0"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-full bg-bg-tertiary" />
                          <div>
                            <p className="text-sm font-bold text-text-primary">
                              {review.isAnonymous
                                ? t('shop.anonymousUser')
                                : review.authorName ||
                                  `${t('shop.userPrefix')}${review.userId.slice(0, 6)}`}
                            </p>
                            <div className="flex text-warning mt-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={`${review.id}-${star}`}
                                  size={14}
                                  className={
                                    star <= review.rating ? 'fill-current' : 'text-text-muted/30'
                                  }
                                />
                              ))}
                            </div>
                          </div>
                          <span className="ml-auto text-xs text-text-muted">
                            {new Date(review.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-text-secondary text-sm md:text-base leading-relaxed pl-13">
                          {review.content}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center text-text-muted flex flex-col items-center gap-4">
                      <div className="w-20 h-20 rounded-full bg-bg-tertiary flex items-center justify-center">
                        <MessageSquare className="opacity-20" size={32} />
                      </div>
                      <span className="text-lg font-medium">{t('shop.noReviews')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ShopPanel>
        </div>
      </div>

      {/* ── Bottom Fixed Action Bar (Mobile Only) ── */}
      <div className="md:hidden absolute bottom-0 left-0 right-0 bg-bg-tertiary/50 backdrop-blur-xl border-t border-border-subtle p-3 pb-safe px-4 z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pr-2">
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="flex flex-col items-center justify-center text-text-muted hover:text-primary w-10"
            >
              <MessageSquare size={18} />
              <span className="text-[11px] mt-1 font-black">{t('shop.customerService')}</span>
            </button>
            <div className="w-[1px] h-8 bg-border-subtle mx-1" />
          </div>

          <Button
            variant="glass"
            className="flex-1"
            onClick={handleAddToCart}
            disabled={alreadyPurchased || addToCart.isPending || stock === 0}
          >
            {alreadyPurchased
              ? t('shop.purchased')
              : addedToCart
                ? t('shop.addedToCart')
                : t('shop.addToCart')}
          </Button>

          <Button
            variant="primary"
            className="flex-1"
            onClick={handleBuyNow}
            disabled={alreadyPurchased || stock === 0 || buyingNow}
          >
            {alreadyPurchased
              ? t('shop.purchased')
              : buyingNow
                ? t('shop.paymentProcessing')
                : t('shop.buyNow')}
          </Button>
        </div>
      </div>

      {supportOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-bg-deep/40 p-0 backdrop-blur-sm md:items-center md:p-4"
            onClick={() => setSupportOpen(false)}
          >
            <GlassPanel
              className="max-h-[80vh] w-full overflow-y-auto !rounded-t-[24px] p-5 md:max-w-lg md:!rounded-[24px]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-black text-text-primary">{t('shop.contactSeller')}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  icon={X}
                  onClick={() => setSupportOpen(false)}
                />
              </div>

              <textarea
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                placeholder={t('shop.contactPlaceholder')}
                rows={4}
                className="w-full rounded-xl border border-border-subtle bg-bg-tertiary p-3 text-sm"
              />

              <div className="mt-4 space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary">
                  <Upload size={15} /> {t('shop.uploadScreenshot')}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      uploadSupportImages(e.target.files)
                      e.currentTarget.value = ''
                    }}
                  />
                </label>
                {uploadingCount > 0 && (
                  <div className="text-xs text-text-muted">{t('shop.uploading')}</div>
                )}
                {supportImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {supportImages.map((url, idx) => (
                      <div key={url} className="relative h-16 w-16 overflow-hidden rounded-lg">
                        <img src={url} alt="support" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          className="absolute right-0.5 top-0.5 rounded-full bg-bg-deep/50 p-0.5 text-white"
                          onClick={() =>
                            setSupportImages((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                variant="primary"
                className="mt-5 w-full"
                onClick={() =>
                  contactSupport.mutate({ message: supportMessage.trim(), images: supportImages })
                }
                disabled={!supportMessage.trim() || contactSupport.isPending || uploadingCount > 0}
                loading={contactSupport.isPending}
              >
                {contactSupport.isPending ? t('shop.creatingSupport') : t('shop.submitSupport')}
              </Button>
            </GlassPanel>
          </div>,
          document.body,
        )}
    </div>
  )
}
