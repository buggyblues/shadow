import { Badge, Button, Card } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Heart,
  MessageSquare,
  Minus,
  Plus,
  Share,
  Shield,
  Star,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { OrderConfirm } from './order-confirm'
import type { Product, ProductMediaItem, SkuItem } from './shop-page'
import { PriceDisplay } from './ui/currency'

interface ProductDetailProps {
  serverId: string
  productId: string
  isAdmin?: boolean
  onBack: () => void
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

export function ProductDetail({
  serverId,
  productId,
  isAdmin: _isAdmin,
  onBack,
}: ProductDetailProps) {
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
    onError: (err: Error) => showToast(err.message || '加入购物车失败', 'error'),
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
          showToast('已自动拉入 Buddy 并就绪，请直接在频道沟通', 'success')
        } else {
          showToast('已自动拉入 Buddy，正在等待 Buddy 就绪，请稍候', 'info')
        }
      } else {
        showToast('已联系店主和客服，请耐心等待回复', 'success')
      }
    },
    onError: (err: Error) => showToast(err.message || '联系客服失败', 'error'),
  })

  if (isLoading || !product) {
    return (
      <div className="flex-1 flex flex-col bg-bg-primary h-full">
        <div className="h-14 flex items-center px-4">
          <div className="w-8 h-8 rounded-xl bg-bg-tertiary animate-pulse" />
        </div>
        <div className="w-full aspect-square bg-bg-tertiary animate-pulse" />
      </div>
    )
  }

  const selectedSku = product.skus?.find((s) => s.id === selectedSkuId)
  const price = selectedSku?.price ?? product.basePrice
  const stock = selectedSku?.stock ?? product.skus?.[0]?.stock ?? 999
  const hasSpecs = product.specNames.length > 0 && (product.skus?.length ?? 0) > 0

  const handleAddToCart = () => {
    addToCart.mutate({ productId: product.id, skuId: selectedSkuId ?? undefined, quantity })
  }

  const handleBuyNow = async () => {
    if ((!hasSpecs || !!selectedSkuId) && quantity === 1) {
      try {
        await fetchApi<{ id: string }>(`/api/servers/${serverId}/shop/orders`, {
          method: 'POST',
          body: JSON.stringify({
            items: [{ productId: product.id, skuId: selectedSkuId ?? undefined, quantity }],
          }),
        })
        showToast('购买成功！', 'success')
        queryClient.invalidateQueries({ queryKey: ['shop-orders', serverId] })
        queryClient.invalidateQueries({ queryKey: ['wallet'] })
        queryClient.invalidateQueries({ queryKey: ['shop-cart', serverId] })
      } catch (err) {
        showToast((err as Error)?.message || '购买失败，请检查余额或库存', 'error')
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
    showToast(next.includes(product.id) ? '已加入收藏' : '已取消收藏', 'success')
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
        showToast('分享已发起', 'success')
        return
      }
      await navigator.clipboard.writeText(shareText)
      showToast('分享链接已复制', 'success')
    } catch {
      showToast('暂时无法分享，请稍后重试', 'error')
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
          const res = await fetchApi<{ url: string }>('/api/media/upload', {
            method: 'POST',
            body: formData,
          })
          return res.url
        }),
      )
      setSupportImages((prev) => [...prev, ...uploaded].slice(0, 6))
    } catch (err) {
      showToast((err as Error).message || '上传图片失败', 'error')
    } finally {
      setUploadingCount(0)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-hidden h-full relative z-30 font-sans">
      {/* ── Top Header ── */}
      <div className="flex items-center justify-between p-4 bg-bg-tertiary/50 backdrop-blur-xl border-b border-border-subtle shrink-0 sticky top-0 z-50">
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
      <div className="flex-1 overflow-y-auto scrollbar-hidden relative">
        <div className="max-w-[1200px] mx-auto w-full pb-28 md:pb-10 pt-0 md:pt-6 md:px-6">
          <div className="flex flex-col md:flex-row gap-0 md:gap-8 lg:gap-12">
            {/* ═══ Left Column: Media Gallery ═══ */}
            <div className="w-full md:w-1/2 lg:w-[45%] shrink-0">
              <div className="md:sticky md:top-6">
                {media.length > 0 ? (
                  <div className="relative w-full bg-bg-tertiary aspect-square md:rounded-3xl flex items-center justify-center overflow-hidden border border-border-subtle shadow-sm">
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
                  <div className="w-full aspect-square bg-bg-tertiary md:rounded-3xl flex items-center justify-center border border-border-subtle shadow-sm">
                    <span className="text-text-muted">无图片</span>
                  </div>
                )}

                {/* Thumbnails below main image (PC only) */}
                {media.length > 1 && (
                  <div className="hidden md:flex gap-3 mt-4 overflow-x-auto pb-2 scrollbar-hidden">
                    {media.map((m, i) => (
                      <button
                        type="button"
                        key={`thumb-${m.id}`}
                        onClick={() => goToMedia(i)}
                        className={`w-20 h-20 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
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
            <div className="w-full md:w-1/2 lg:w-[55%] flex flex-col border-t md:border-t-0 border-border-subtle bg-bg-primary md:bg-transparent">
              <div className="p-5 md:p-0">
                <div className="flex flex-col gap-2 mb-4">
                  <div className="flex items-end justify-between">
                    <span className="text-danger font-black text-3xl flex items-baseline gap-1">
                      <PriceDisplay amount={price} size={32} />
                    </span>
                    <span className="text-sm text-text-muted font-medium bg-bg-tertiary px-2.5 py-1 rounded-lg">
                      已售 {product.salesCount}
                    </span>
                  </div>
                  {product.basePrice !== price && (
                    <span className="text-text-muted line-through text-sm flex items-center gap-0.5">
                      <PriceDisplay amount={product.basePrice} size={14} />
                    </span>
                  )}
                </div>

                <h1 className="text-text-primary font-black text-xl md:text-3xl leading-snug tracking-tight mb-3">
                  {product.name}
                </h1>

                {product.summary && (
                  <p className="text-text-muted text-sm md:text-base leading-relaxed mb-5">
                    {product.summary}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mb-6">
                  {product.type === 'entitlement' && (
                    <Badge variant="warning" size="sm" className="flex items-center gap-1.5">
                      <Shield size={14} />
                      虚拟权益
                    </Badge>
                  )}
                  {product.tags?.map((tag: string) => (
                    <Badge key={tag} variant="neutral" size="sm">
                      #{tag}
                    </Badge>
                  ))}
                </div>

                {/* Separator */}
                <div className="w-full h-px bg-border-dim mb-6" />

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

                    <div className="flex items-center justify-between mt-6 bg-bg-tertiary p-4 rounded-2xl border border-border-subtle">
                      <span className="text-text-secondary text-sm font-bold">购买数量</span>
                      <div className="flex items-center gap-4">
                        <span className="text-[11px] text-text-muted font-medium">
                          库存: {stock}件
                        </span>
                        <div className="flex items-center bg-bg-secondary rounded-xl p-1 border border-border-subtle shadow-sm">
                          <button
                            type="button"
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            disabled={quantity <= 1}
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
                            disabled={quantity >= stock}
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
                    const primaryRule = entitlementRules[0]
                    if (!primaryRule) return null
                    return (
                      <div className="bg-primary/5 p-5 rounded-2xl border border-primary/20 mb-6">
                        <div className="flex items-center gap-2 text-primary text-sm font-bold mb-3">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <Shield size={12} strokeWidth={3} />
                          </div>
                          权益说明
                        </div>
                        {primaryRule.privilegeDescription && (
                          <p className="text-primary/80 text-sm leading-relaxed mb-3">
                            {primaryRule.privilegeDescription}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-primary/80 text-sm font-medium border-t border-primary/20 pt-3">
                          <Clock size={14} />
                          有效期：
                          <span className="font-bold">
                            {primaryRule.durationSeconds
                              ? primaryRule.durationSeconds >= 86400
                                ? `${Math.floor(primaryRule.durationSeconds / 86400)} 天`
                                : `${Math.floor(primaryRule.durationSeconds / 3600)} 小时`
                              : '永久有效'}
                          </span>
                        </div>
                        {entitlementRules.length > 1 && (
                          <p className="text-xs text-primary/80 mt-2">
                            共包含 {entitlementRules.length} 条权益规则
                          </p>
                        )}
                      </div>
                    )
                  })()}

                {/* Actions on PC (hidden on mobile, shown in bottom bar instead) */}
                <div className="hidden md:flex gap-4 mt-8">
                  <button
                    type="button"
                    onClick={() => setSupportOpen(true)}
                    className="flex flex-col items-center justify-center text-text-muted hover:text-primary w-14 bg-bg-tertiary/50 border border-border-subtle rounded-2xl transition-colors"
                  >
                    <MessageSquare size={20} />
                    <span className="text-[11px] mt-1 font-black">客服</span>
                  </button>
                  <Button
                    variant="glass"
                    className="flex-1 py-4"
                    onClick={handleAddToCart}
                    disabled={addToCart.isPending || stock === 0}
                  >
                    {addedToCart ? (
                      <span className="flex items-center justify-center gap-2">
                        <CheckCircle2 size={18} /> 已加入
                      </span>
                    ) : (
                      '加入购物车'
                    )}
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1 py-4"
                    onClick={handleBuyNow}
                    disabled={stock === 0}
                  >
                    立即购买
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ Details & Reviews Tabs ═══ */}
          <div className="mt-6 md:mt-12 bg-bg-secondary md:rounded-3xl border-t md:border border-border-subtle shadow-sm overflow-hidden min-h-[500px]">
            <div className="flex border-b border-border-subtle bg-bg-tertiary/50 backdrop-blur-xl px-2 md:px-6">
              <button
                type="button"
                onClick={() => setActiveTab('detail')}
                className={`px-6 py-4 text-sm md:text-base font-bold transition-all relative ${
                  activeTab === 'detail'
                    ? 'text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                商品详情
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
                用户评价 <span className="ml-1 text-xs opacity-60">({reviews?.length || 0})</span>
                {activeTab === 'reviews' && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-t-full" />
                )}
              </button>
            </div>

            <div className="p-6 md:p-10">
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
                      <span className="text-lg font-medium">此商品无图文详情</span>
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
                                ? '匿名用户'
                                : review.authorName || `用户 ${review.userId.slice(0, 6)}`}
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
                      <span className="text-lg font-medium">暂无评价，购买后即可发表评价哦</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
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
              <span className="text-[11px] mt-1 font-black">客服</span>
            </button>
            <div className="w-[1px] h-8 bg-border-subtle mx-1" />
          </div>

          <Button
            variant="glass"
            className="flex-1"
            onClick={handleAddToCart}
            disabled={addToCart.isPending || stock === 0}
          >
            {addedToCart ? '已加入' : '加入购物车'}
          </Button>

          <Button
            variant="primary"
            className="flex-1"
            onClick={handleBuyNow}
            disabled={stock === 0}
          >
            立即购买
          </Button>
        </div>
      </div>

      {supportOpen && (
        <div className="absolute inset-0 z-[60] bg-bg-deep/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
          <Card
            variant="glass"
            className="w-full md:max-w-lg !rounded-t-[24px] md:!rounded-[40px] !p-5 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-text-primary">联系客服</h3>
              <Button variant="ghost" size="icon" icon={X} onClick={() => setSupportOpen(false)} />
            </div>

            <textarea
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              placeholder="请详细描述问题，我们会尽快处理"
              rows={4}
              className="w-full p-3 rounded-xl border border-border-subtle bg-bg-tertiary text-sm"
            />

            <div className="mt-4 space-y-2">
              <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer text-primary">
                <Upload size={15} /> 上传问题截图
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
              {uploadingCount > 0 && <div className="text-xs text-text-muted">图片上传中...</div>}
              {supportImages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {supportImages.map((url, idx) => (
                    <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden">
                      <img src={url} alt="support" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        className="absolute top-0.5 right-0.5 bg-bg-deep/50 text-white rounded-full p-0.5"
                        onClick={() => setSupportImages((prev) => prev.filter((_, i) => i !== idx))}
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
              {contactSupport.isPending ? '正在创建客服会话...' : '提交并进入聊天频道'}
            </Button>
          </Card>
        </div>
      )}
    </div>
  )
}
