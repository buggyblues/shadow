import { Badge, Button, ContentImage } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle,
  ChevronRight,
  ClipboardList,
  Clock,
  Eye,
  Package,
  ShieldCheck,
  Star,
  Truck,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { useShopStore } from '../../stores/shop.store'
import { PriceDisplay } from './ui/currency'
import { ProductVisual } from './ui/product-visual'
import { ShopPanel, ShopPillBar, ShopPillButton } from './ui/shop-layout'

interface OrderItem {
  id: string
  productId: string
  productName: string
  specValues: string[]
  price: number
  quantity: number
  imageUrl?: string
}

interface Order {
  id: string
  orderNo: string
  shopId: string
  buyerId: string
  status: string
  totalAmount: number
  currency: string
  trackingNo?: string
  sellerNote?: string
  buyerNote?: string
  paidAt?: string
  shippedAt?: string
  completedAt?: string
  cancelledAt?: string
  createdAt: string
  items: OrderItem[]
}

interface OrderReview {
  id: string
  productId: string
  rating: number
  content?: string
  isAnonymous?: boolean
}

const STATUS_CONFIG: Record<
  string,
  {
    labelKey: string
    badgeVariant: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
    icon: React.ElementType
  }
> = {
  pending: {
    labelKey: 'shop.orderStatus.pending',
    badgeVariant: 'warning',
    icon: Clock,
  },
  paid: {
    labelKey: 'shop.orderStatus.paid',
    badgeVariant: 'info',
    icon: Package,
  },
  processing: {
    labelKey: 'shop.orderStatus.processing',
    badgeVariant: 'info',
    icon: Package,
  },
  shipped: {
    labelKey: 'shop.orderStatus.shipped',
    badgeVariant: 'primary',
    icon: Truck,
  },
  delivered: {
    labelKey: 'shop.orderStatus.delivered',
    badgeVariant: 'success',
    icon: CheckCircle,
  },
  completed: {
    labelKey: 'shop.orderStatus.completed',
    badgeVariant: 'success',
    icon: ShieldCheck,
  },
  cancelled: {
    labelKey: 'shop.orderStatus.cancelled',
    badgeVariant: 'neutral',
    icon: XCircle,
  },
  refunded: {
    labelKey: 'shop.orderStatus.refunded',
    badgeVariant: 'danger',
    icon: XCircle,
  },
}

function OrderFulfillmentNote({ status }: { status: string }) {
  const { t } = useTranslation()
  const isDone = ['delivered', 'completed'].includes(status)
  const isCanceled = ['cancelled', 'refunded'].includes(status)
  return (
    <div className="mt-4 rounded-[18px] border border-[var(--glass-line)] bg-bg-secondary/30 p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {isCanceled ? (
            <XCircle size={17} />
          ) : isDone ? (
            <ShieldCheck size={17} />
          ) : (
            <Truck size={17} />
          )}
        </span>
        <div className="min-w-0">
          <div className="text-xs font-black text-text-primary">
            {t('shop.fulfillmentProgress')}
          </div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {isCanceled
              ? t('shop.fulfillmentCanceledHint')
              : isDone
                ? t('shop.fulfillmentDoneHint')
                : t('shop.fulfillmentPendingHint')}
          </p>
        </div>
      </div>
    </div>
  )
}

function OrderTimeline({ order }: { order: Order }) {
  const { t } = useTranslation()
  const timeline = [
    {
      key: 'paid',
      icon: CheckCircle,
      done: Boolean(order.paidAt),
      time: order.paidAt,
      label: t('shop.timelinePaid'),
    },
    {
      key: 'processing',
      icon: Package,
      done: ['processing', 'shipped', 'delivered', 'completed'].includes(order.status),
      time: undefined,
      label: t('shop.timelineProcessing'),
    },
    {
      key: 'delivered',
      icon: Truck,
      done: ['delivered', 'completed'].includes(order.status),
      time: order.shippedAt,
      label: t('shop.timelineDelivered'),
    },
    {
      key: 'completed',
      icon: ShieldCheck,
      done: order.status === 'completed',
      time: order.completedAt,
      label: t('shop.timelineCompleted'),
    },
  ]

  if (['cancelled', 'refunded'].includes(order.status)) {
    timeline.push({
      key: order.status,
      icon: XCircle,
      done: true,
      time: order.cancelledAt,
      label: t(`shop.orderStatus.${order.status}`),
    })
  }

  return (
    <div className="mt-4 grid gap-2 rounded-[18px] border border-[var(--glass-line)] bg-bg-secondary/30 p-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
      {timeline.map((step) => {
        const Icon = step.icon
        return (
          <div
            key={step.key}
            className={`rounded-xl border px-3 py-2 ${
              step.done
                ? 'border-success/20 bg-success/5 text-success'
                : 'border-border-subtle bg-bg-primary/35 text-text-muted'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-black">
              <Icon size={14} />
              {step.label}
            </div>
            <p className="mt-1 text-[11px] leading-4 opacity-80">
              {step.time ? new Date(step.time).toLocaleString() : t('shop.timelinePending')}
            </p>
          </div>
        )
      })}
    </div>
  )
}

interface ShopOrdersProps {
  serverId: string
  onOpenProduct?: (productId: string) => void
}

export function ShopOrders({ serverId, onOpenProduct }: ShopOrdersProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const lastOrderId = useShopStore((s) => s.lastOrderId)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [reviewingOrder, setReviewingOrder] = useState<string | null>(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewContent, setReviewContent] = useState('')
  const [reviewProductId, setReviewProductId] = useState<string | null>(null)
  const [reviewAnonymous, setReviewAnonymous] = useState(false)
  const [orderReviews, setOrderReviews] = useState<Record<string, OrderReview[]>>({})

  // Clear lastOrderId after consuming it
  useEffect(() => {
    if (lastOrderId) {
      useShopStore.setState({ lastOrderId: null })
    }
  }, [lastOrderId])
  const { data: orders = [] } = useQuery({
    queryKey: ['shop-orders', serverId, statusFilter],
    queryFn: () =>
      fetchApi<Order[]>(
        `/api/servers/${serverId}/shop/orders${statusFilter ? `?status=${statusFilter}` : ''}`,
      ),
  })

  useEffect(() => {
    if (lastOrderId) {
      setExpandedOrder(lastOrderId)
    }
  }, [lastOrderId])

  const effectiveExpandedOrder =
    expandedOrder && orders.some((o) => o.id === expandedOrder) ? expandedOrder : null

  const { data: expandedReviews = [] } = useQuery({
    queryKey: ['shop-order-reviews', serverId, effectiveExpandedOrder],
    queryFn: () =>
      fetchApi<OrderReview[]>(
        `/api/servers/${serverId}/shop/orders/${effectiveExpandedOrder}/reviews`,
      ),
    enabled: Boolean(effectiveExpandedOrder),
  })

  const cancelOrder = useMutation({
    mutationFn: (orderId: string) =>
      fetchApi(`/api/servers/${serverId}/shop/orders/${orderId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-orders', serverId] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      showToast(t('shop.orderCancelled'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('shop.cancelFailed'), 'error'),
  })

  const confirmOrder = useMutation({
    mutationFn: (orderId: string) =>
      fetchApi(`/api/servers/${serverId}/shop/orders/${orderId}/complete`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-orders', serverId] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      showToast(t('shop.orderCompleted'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('shop.orderCompleteFailed'), 'error'),
  })

  const submitReview = useMutation({
    mutationFn: (data: {
      orderId: string
      productId: string
      rating: number
      content?: string
      isAnonymous?: boolean
    }) =>
      fetchApi(`/api/servers/${serverId}/shop/orders/${data.orderId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          productId: data.productId,
          rating: data.rating,
          content: data.content,
          isAnonymous: data.isAnonymous,
        }),
      }),
    onSuccess: (review, vars) => {
      setReviewingOrder(null)
      setReviewRating(5)
      setReviewContent('')
      setReviewProductId(null)
      setReviewAnonymous(false)
      setOrderReviews((prev) => ({
        ...prev,
        [vars.orderId]: [...(prev[vars.orderId] || []), review as OrderReview],
      }))
      queryClient.invalidateQueries({ queryKey: ['shop-orders', serverId] })
      queryClient.invalidateQueries({ queryKey: ['shop-order-reviews', serverId, vars.orderId] })
      showToast(t('shop.reviewSubmitted'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('shop.reviewSubmitFailed'), 'error'),
  })

  useEffect(() => {
    if (!effectiveExpandedOrder || orderReviews[effectiveExpandedOrder]) return
    setOrderReviews((prev) => ({ ...prev, [effectiveExpandedOrder]: [] }))
  }, [effectiveExpandedOrder, orderReviews])

  const statusTabs = [
    { key: null, label: t('shop.orderFilterAll') },
    { key: 'pending', label: t('shop.orderStatus.pending') },
    { key: 'paid', label: t('shop.orderStatus.paid') },
    { key: 'shipped', label: t('shop.orderStatus.shipped') },
    { key: 'completed', label: t('shop.orderStatus.completed') },
  ]

  if (orders.length === 0 && !statusFilter) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center bg-transparent p-8">
        <div className="w-32 h-32 mb-6 rounded-full bg-primary/5 flex items-center justify-center relative">
          <ClipboardList size={48} className="text-primary/30" strokeWidth={1.5} />
        </div>
        <h3 className="text-lg font-black uppercase tracking-tight text-text-primary mb-2">
          {t('shop.noOrders')}
        </h3>
        <p className="text-sm text-text-muted font-bold italic mb-8">{t('shop.noOrdersHint')}</p>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden bg-transparent font-sans">
      {/* ── Status Filter Tabs ── */}
      <ShopPillBar className="sticky top-0 z-10 shrink-0 border-b border-[var(--glass-line)] bg-bg-primary/35 px-4 pt-3 backdrop-blur-xl">
        {statusTabs.map((tab) => (
          <ShopPillButton
            key={tab.key ?? 'all'}
            active={statusFilter === tab.key}
            className="h-9 px-4 text-xs"
            onClick={() => setStatusFilter(tab.key)}
          >
            {tab.label}
          </ShopPillButton>
        ))}
      </ShopPillBar>

      {/* ── Order List ── */}
      <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4 scrollbar-hidden">
        {orders.length === 0 && statusFilter ? (
          <div className="py-20 text-center text-text-muted text-sm font-bold italic">
            {t('shop.noFilteredOrders')}
          </div>
        ) : (
          orders.map((order) => {
            const statusCfg = (STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending)!
            const isExpanded = effectiveExpandedOrder === order.id
            const StatusIcon = statusCfg.icon
            const currentReviews = isExpanded ? expandedReviews : (orderReviews[order.id] ?? [])
            const hasReviewed = currentReviews.length > 0

            const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0)

            return (
              <ShopPanel
                key={order.id}
                className="overflow-hidden transition-all duration-200 hover:border-primary/30 hover:bg-bg-secondary/40"
              >
                {/* Order Header */}
                <button
                  type="button"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                  className="flex w-full min-w-0 items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-bg-modifier-hover"
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusCfg.badgeVariant} size="xs">
                        <StatusIcon size={10} strokeWidth={3} className="mr-1" />
                        {t(statusCfg.labelKey)}
                      </Badge>
                      <span className="truncate text-[11px] font-black text-text-muted">
                        #{order.orderNo.slice(-8).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-text-muted text-[11px]">
                      {new Date(order.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <p className="mb-0.5 text-[11px] text-text-muted">
                        {t('shop.orderItemTotal', { count: totalQuantity })}
                      </p>
                      <span className="text-text-primary text-sm font-black flex items-baseline justify-end gap-0.5">
                        <PriceDisplay amount={order.totalAmount} />
                      </span>
                    </div>
                    <ChevronRight
                      size={16}
                      className={`shrink-0 text-text-muted transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </div>
                </button>

                {/* Order Items Preview */}
                <div className="min-w-0 px-5 pb-4 pt-2">
                  {order.items.slice(0, isExpanded ? undefined : 1).map((item) => (
                    <div key={item.id} className="flex items-start gap-3 mt-4 first:mt-2">
                      <div className="aspect-[3/2] w-20 shrink-0 overflow-hidden rounded-2xl border border-border-subtle bg-bg-tertiary">
                        {item.imageUrl ? (
                          <ContentImage
                            src={item.imageUrl}
                            alt={item.productName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ProductVisual
                            name={item.productName}
                            productType="entitlement"
                            showLabel={false}
                            className="h-full w-full rounded-none"
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-text-primary text-sm font-black line-clamp-1 leading-snug">
                          {item.productName}
                        </p>
                        {item.specValues?.length > 0 && (
                          <p className="text-text-muted text-[11px] mt-1 font-black bg-bg-tertiary inline-block px-1.5 py-0.5 rounded-full border border-border-subtle">
                            {item.specValues.join(' / ')}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-text-primary text-sm font-black">
                            <PriceDisplay amount={item.price} />
                          </span>
                          <span className="text-text-muted text-xs font-black">
                            x{item.quantity}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {!isExpanded && order.items.length > 1 && (
                    <div className="mt-3 text-center">
                      <p className="text-text-muted text-[11px] font-black bg-bg-tertiary py-1 rounded-2xl border border-border-subtle">
                        {t('shop.moreOrderItems', { count: order.items.length - 1 })}
                      </p>
                    </div>
                  )}

                  <OrderFulfillmentNote status={order.status} />
                  {isExpanded && <OrderTimeline order={order} />}

                  {/* Actions */}
                  <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-dashed border-[var(--glass-line)] pt-4">
                    {order.items[0] && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenProduct?.(order.items[0]!.productId)}
                      >
                        <Eye size={14} />
                        {t('shop.viewPurchasedProduct')}
                      </Button>
                    )}
                    {['pending', 'paid'].includes(order.status) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelOrder.mutate(order.id)}
                        loading={cancelOrder.isPending}
                      >
                        {t('shop.cancelOrder')}
                      </Button>
                    )}

                    {order.status === 'delivered' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => confirmOrder.mutate(order.id)}
                        loading={confirmOrder.isPending}
                      >
                        {t('shop.confirmReceipt')}
                      </Button>
                    )}

                    {['delivered', 'completed'].includes(order.status) &&
                      !hasReviewed &&
                      reviewingOrder !== order.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReviewingOrder(order.id)}
                        >
                          {t('shop.writeReview')}
                        </Button>
                      )}
                    {['delivered', 'completed'].includes(order.status) && hasReviewed && (
                      <Badge variant="success">{t('shop.reviewed')}</Badge>
                    )}
                  </div>

                  {isExpanded && currentReviews.length > 0 && (
                    <div className="mt-4 space-y-2 rounded-[18px] border border-success/20 bg-success/5 p-3 backdrop-blur-sm">
                      <p className="text-xs font-black text-success">{t('shop.myReview')}</p>
                      {currentReviews.map((rv) => (
                        <div key={rv.id} className="text-xs text-success">
                          <span className="font-black">
                            {t('shop.reviewScore', { rating: rv.rating })}
                          </span>
                          <span>{rv.content || t('shop.reviewNoContent')}</span>
                          {rv.isAnonymous ? (
                            <span className="ml-2 text-[11px]">{t('shop.anonymousReview')}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-4 space-y-1 rounded-[18px] border border-[var(--glass-line)] bg-bg-secondary/30 p-3 text-xs text-text-muted">
                      <p>
                        {t('shop.orderNo')}: {order.orderNo}
                      </p>
                      {order.trackingNo ? (
                        <p>
                          {t('shop.trackingNo')}: {order.trackingNo}
                        </p>
                      ) : null}
                      {order.buyerNote ? (
                        <p>
                          {t('shop.buyerNote')}: {order.buyerNote}
                        </p>
                      ) : null}
                      {order.sellerNote ? (
                        <p>
                          {t('shop.sellerNote')}: {order.sellerNote}
                        </p>
                      ) : null}
                      {order.paidAt ? (
                        <p>
                          {t('shop.paidAt')}: {new Date(order.paidAt).toLocaleString()}
                        </p>
                      ) : null}
                      {order.shippedAt ? (
                        <p>
                          {t('shop.shippedAt')}: {new Date(order.shippedAt).toLocaleString()}
                        </p>
                      ) : null}
                      {order.completedAt ? (
                        <p>
                          {t('shop.completedAt')}: {new Date(order.completedAt).toLocaleString()}
                        </p>
                      ) : null}
                      {order.cancelledAt ? (
                        <p>
                          {t('shop.cancelledAt')}: {new Date(order.cancelledAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                  )}

                  {/* Inline Review Form */}
                  {reviewingOrder === order.id && (
                    <div className="mt-4 animate-in rounded-[18px] border border-[var(--glass-line)] bg-bg-secondary/30 p-4 duration-200 slide-in-from-top-2">
                      {/* Product selector for multi-item orders */}
                      {order.items.length > 1 && (
                        <div className="mb-3">
                          <span className="mb-2 block text-xs font-black text-text-secondary">
                            {t('shop.selectReviewProduct')}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {order.items.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setReviewProductId(item.productId)}
                                className={`px-3 py-1.5 text-xs font-black rounded-full transition-all border ${
                                  (reviewProductId || order.items[0]?.productId) === item.productId
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border-subtle text-text-muted hover:border-primary/30'
                                }`}
                              >
                                {item.productName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <span className="mb-2 block text-xs font-black text-text-secondary">
                        {t('shop.productRating')}
                      </span>
                      <div className="flex items-center gap-1.5 mb-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <button
                            key={`review-star-${order.id}-${i}`}
                            type="button"
                            onClick={() => setReviewRating(i + 1)}
                            className="p-1 hover:scale-110 transition-transform"
                          >
                            <Star
                              size={22}
                              className={
                                i < reviewRating ? 'text-warning fill-warning' : 'text-text-muted'
                              }
                            />
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={reviewContent}
                        onChange={(e) => setReviewContent(e.target.value)}
                        placeholder={t('shop.reviewPlaceholder')}
                        className="w-full h-24 p-3 bg-bg-tertiary/50 text-text-primary text-sm rounded-2xl border-2 border-border-subtle focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all"
                      />
                      <label className="mt-3 flex items-center gap-2 text-xs text-text-muted font-black">
                        <input
                          type="checkbox"
                          checked={reviewAnonymous}
                          onChange={(e) => setReviewAnonymous(e.target.checked)}
                        />
                        {t('shop.anonymousReviewLabel')}
                      </label>
                      <div className="flex justify-end gap-2 mt-3">
                        <Button variant="ghost" size="sm" onClick={() => setReviewingOrder(null)}>
                          {t('common.cancel')}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            submitReview.mutate({
                              orderId: order.id,
                              productId: reviewProductId || (order.items[0]?.productId ?? ''),
                              rating: reviewRating,
                              content: reviewContent || undefined,
                              isAnonymous: reviewAnonymous,
                            })
                          }
                          loading={submitReview.isPending}
                        >
                          {t('shop.submitReview')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </ShopPanel>
            )
          })
        )}
      </div>
    </div>
  )
}
