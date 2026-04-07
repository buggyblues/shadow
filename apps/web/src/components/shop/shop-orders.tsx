import { Badge, Button, Card } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle,
  ChevronRight,
  ClipboardList,
  Clock,
  Package,
  ShieldCheck,
  Star,
  Truck,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { useShopStore } from '../../stores/shop.store'
import { PriceDisplay } from './ui/currency'

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
    label: string
    badgeVariant: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
    icon: React.ElementType
  }
> = {
  pending: {
    label: '待付款',
    badgeVariant: 'warning',
    icon: Clock,
  },
  paid: {
    label: '待发货',
    badgeVariant: 'info',
    icon: Package,
  },
  processing: {
    label: '处理中',
    badgeVariant: 'info',
    icon: Package,
  },
  shipped: {
    label: '已发货',
    badgeVariant: 'primary',
    icon: Truck,
  },
  delivered: {
    label: '已送达',
    badgeVariant: 'success',
    icon: CheckCircle,
  },
  completed: {
    label: '已完成',
    badgeVariant: 'success',
    icon: ShieldCheck,
  },
  cancelled: {
    label: '已取消',
    badgeVariant: 'neutral',
    icon: XCircle,
  },
  refunded: {
    label: '已退款',
    badgeVariant: 'danger',
    icon: XCircle,
  },
}

interface ShopOrdersProps {
  serverId: string
}

export function ShopOrders({ serverId }: ShopOrdersProps) {
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

  const cancelOrder = useMutation({
    mutationFn: (orderId: string) =>
      fetchApi(`/api/servers/${serverId}/shop/orders/${orderId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-orders', serverId] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      showToast('订单已取消', 'success')
    },
    onError: (err: Error) => showToast(err.message || '取消失败', 'error'),
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
      showToast('评价已提交，感谢您的反馈！', 'success')
    },
    onError: (err: Error) => showToast(err.message || '评价提交失败', 'error'),
  })

  useEffect(() => {
    if (!effectiveExpandedOrder || orderReviews[effectiveExpandedOrder]) return
    setOrderReviews((prev) => ({ ...prev, [effectiveExpandedOrder]: [] }))
  }, [effectiveExpandedOrder, orderReviews])

  const statusTabs = [
    { key: null, label: '全部' },
    { key: 'pending', label: '待付款' },
    { key: 'paid', label: '待发货' },
    { key: 'shipped', label: '待收货' },
    { key: 'completed', label: '已完成' },
  ]

  if (orders.length === 0 && !statusFilter) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-bg-primary h-full">
        <div className="w-32 h-32 mb-6 rounded-full bg-primary/5 flex items-center justify-center relative">
          <ClipboardList size={48} className="text-primary/30" strokeWidth={1.5} />
        </div>
        <h3 className="text-lg font-black uppercase tracking-tight text-text-primary mb-2">
          暂无订单记录
        </h3>
        <p className="text-sm text-text-muted font-bold italic mb-8">您还没有下过任何订单哦</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-bg-primary font-sans relative">
      {/* ── Status Filter Tabs ── */}
      <div className="flex px-4 py-2 bg-bg-tertiary/50 backdrop-blur-xl sticky top-0 z-10 gap-2 overflow-x-auto scrollbar-hidden border-b border-border-subtle">
        {statusTabs.map((tab) => (
          <Button
            key={tab.key ?? 'all'}
            variant={statusFilter === tab.key ? 'primary' : 'ghost'}
            size="xs"
            onClick={() => setStatusFilter(tab.key)}
            className="whitespace-nowrap"
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* ── Order List ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hidden">
        {orders.length === 0 && statusFilter ? (
          <div className="py-20 text-center text-text-muted text-sm font-bold italic">
            该状态下暂无订单
          </div>
        ) : (
          orders.map((order) => {
            const statusCfg = (STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending)!
            const isExpanded = effectiveExpandedOrder === order.id
            const StatusIcon = statusCfg.icon

            const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0)

            return (
              <Card
                key={order.id}
                variant="glass"
                className="!rounded-[40px] hover:shadow-[0_10px_25px_rgba(0,243,255,0.08)] transition-all duration-300"
              >
                {/* Order Header */}
                <button
                  type="button"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-bg-modifier-hover transition-colors"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusCfg.badgeVariant} size="xs">
                        <StatusIcon size={10} strokeWidth={3} className="mr-1" />
                        {statusCfg.label}
                      </Badge>
                      <span className="text-text-muted text-[11px] font-black tracking-widest">
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

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[11px] text-text-muted mb-0.5">合计 {totalQuantity} 件</p>
                      <span className="text-text-primary text-sm font-black flex items-baseline justify-end gap-0.5">
                        <PriceDisplay amount={order.totalAmount} />
                      </span>
                    </div>
                    <ChevronRight
                      size={16}
                      className={`text-text-muted transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </div>
                </button>

                {/* Order Items Preview */}
                <div className="px-5 pb-4 pt-2">
                  {order.items.slice(0, isExpanded ? undefined : 1).map((item) => (
                    <div key={item.id} className="flex items-start gap-3 mt-4 first:mt-2">
                      <div className="w-16 h-16 bg-bg-tertiary rounded-2xl overflow-hidden shrink-0 border border-border-subtle">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-muted">
                            <Package size={20} className="opacity-50" />
                          </div>
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
                        以及其他 {order.items.length - 1} 件商品...
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-5 pt-4 border-t border-border-subtle border-dashed flex items-center justify-end gap-2">
                    {['pending', 'paid'].includes(order.status) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelOrder.mutate(order.id)}
                        loading={cancelOrder.isPending}
                      >
                        取消订单
                      </Button>
                    )}

                    {['delivered', 'completed'].includes(order.status) &&
                      (orderReviews[order.id]?.length || 0) === 0 &&
                      reviewingOrder !== order.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReviewingOrder(order.id)}
                        >
                          我要评价
                        </Button>
                      )}
                    {['delivered', 'completed'].includes(order.status) &&
                      (orderReviews[order.id]?.length || 0) > 0 && (
                        <Badge variant="success">已评价</Badge>
                      )}
                  </div>

                  {isExpanded && (orderReviews[order.id]?.length || 0) > 0 && (
                    <div className="mt-4 p-3 rounded-2xl bg-success/5 border border-success/20 space-y-2 backdrop-blur-sm">
                      <p className="text-xs font-black uppercase tracking-widest text-success">
                        我的评价
                      </p>
                      {orderReviews[order.id]!.map((rv) => (
                        <div key={rv.id} className="text-xs text-success">
                          <span className="font-black">评分 {rv.rating} 星：</span>
                          <span>{rv.content || '（未填写文字）'}</span>
                          {rv.isAnonymous ? <span className="ml-2 text-[11px]">匿名</span> : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-4 p-3 rounded-2xl bg-bg-tertiary/50 border border-border-subtle text-xs space-y-1 text-text-muted">
                      <p>订单号：{order.orderNo}</p>
                      {order.trackingNo ? <p>物流单号：{order.trackingNo}</p> : null}
                      {order.buyerNote ? <p>买家备注：{order.buyerNote}</p> : null}
                      {order.sellerNote ? <p>商家备注：{order.sellerNote}</p> : null}
                      {order.paidAt ? (
                        <p>支付时间：{new Date(order.paidAt).toLocaleString()}</p>
                      ) : null}
                      {order.shippedAt ? (
                        <p>发货时间：{new Date(order.shippedAt).toLocaleString()}</p>
                      ) : null}
                      {order.completedAt ? (
                        <p>完成时间：{new Date(order.completedAt).toLocaleString()}</p>
                      ) : null}
                      {order.cancelledAt ? (
                        <p>取消时间：{new Date(order.cancelledAt).toLocaleString()}</p>
                      ) : null}
                    </div>
                  )}

                  {/* Inline Review Form */}
                  {reviewingOrder === order.id && (
                    <div className="mt-4 p-4 bg-bg-tertiary/50 border border-border-subtle rounded-[24px] animate-in slide-in-from-top-2 duration-200">
                      {/* Product selector for multi-item orders */}
                      {order.items.length > 1 && (
                        <div className="mb-3">
                          <span className="text-xs font-black uppercase tracking-widest text-text-secondary block mb-2">
                            选择要评价的商品
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
                      <span className="text-xs font-black uppercase tracking-widest text-text-secondary block mb-2">
                        商品评分
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
                        placeholder="商品满足您的期待吗？说说您的真实感受..."
                        className="w-full h-24 p-3 bg-bg-tertiary/50 text-text-primary text-sm rounded-2xl border-2 border-border-subtle focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all"
                      />
                      <label className="mt-3 flex items-center gap-2 text-xs text-text-muted font-black">
                        <input
                          type="checkbox"
                          checked={reviewAnonymous}
                          onChange={(e) => setReviewAnonymous(e.target.checked)}
                        />
                        匿名评价
                      </label>
                      <div className="flex justify-end gap-2 mt-3">
                        <Button variant="ghost" size="sm" onClick={() => setReviewingOrder(null)}>
                          取消
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
                          提交评价
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
