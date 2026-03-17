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
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  pending: {
    label: '待付款',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    icon: Clock,
  },
  paid: {
    label: '待发货',
    color: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    icon: Package,
  },
  processing: {
    label: '处理中',
    color: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    icon: Package,
  },
  shipped: {
    label: '已发货',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: Truck,
  },
  delivered: {
    label: '已送达',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    icon: CheckCircle,
  },
  completed: {
    label: '已完成',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    icon: ShieldCheck,
  },
  cancelled: {
    label: '已取消',
    color: 'text-gray-500 dark:text-gray-400',
    bg: 'bg-gray-100 dark:bg-gray-800',
    icon: XCircle,
  },
  refunded: {
    label: '已退款',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-900/20',
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
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F9FAFB] dark:bg-bg-primary h-full">
        <div className="w-32 h-32 mb-6 rounded-full bg-cyan-50 dark:bg-cyan-900/10 flex items-center justify-center shadow-inner relative">
          <ClipboardList size={48} className="text-cyan-300 dark:text-cyan-800" strokeWidth={1.5} />
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-text-primary mb-2">
          暂无订单记录
        </h3>
        <p className="text-sm text-gray-500 dark:text-text-muted mb-8">您还没有下过任何订单哦</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#F9FAFB] dark:bg-bg-primary font-sans relative">
      {/* ── Status Filter Tabs ── */}
      <div className="flex px-4 py-2 bg-white dark:bg-bg-secondary sticky top-0 z-10 shadow-sm gap-2 overflow-x-auto no-scrollbar border-b border-gray-100 dark:border-border-subtle">
        {statusTabs.map((tab) => (
          <button
            key={tab.key ?? 'all'}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap transition-all ${
              statusFilter === tab.key
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md'
                : 'bg-gray-100 text-gray-600 dark:bg-bg-tertiary dark:text-text-secondary hover:bg-gray-200 dark:hover:bg-bg-modifier-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Order List ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {orders.length === 0 && statusFilter ? (
          <div className="py-20 text-center text-gray-400 dark:text-text-muted text-sm">
            该状态下暂无订单
          </div>
        ) : (
          orders.map((order) => {
            const statusCfg = (STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending)!
            const isExpanded = effectiveExpandedOrder === order.id
            const StatusIcon = statusCfg.icon

            const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0)

            return (
              <div
                key={order.id}
                className="bg-white dark:bg-bg-secondary rounded-2xl border border-gray-100 dark:border-border-subtle overflow-hidden shadow-sm hover:shadow-md transition-all duration-300"
              >
                {/* Order Header */}
                <button
                  type="button"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left bg-gray-50/50 dark:bg-bg-tertiary/30 hover:bg-gray-50 dark:hover:bg-bg-tertiary transition-colors"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 ${statusCfg.bg} ${statusCfg.color}`}
                      >
                        <StatusIcon size={10} strokeWidth={3} />
                        {statusCfg.label}
                      </span>
                      <span className="text-gray-400 dark:text-text-muted text-[11px] font-medium tracking-wider">
                        #{order.orderNo.slice(-8).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-gray-400 dark:text-text-muted text-[10px]">
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
                      <p className="text-[10px] text-gray-500 dark:text-text-muted mb-0.5">
                        合计 {totalQuantity} 件
                      </p>
                      <span className="text-gray-900 dark:text-text-primary text-sm font-black flex items-baseline justify-end gap-0.5">
                        <PriceDisplay amount={order.totalAmount} />
                      </span>
                    </div>
                    <ChevronRight
                      size={16}
                      className={`text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </div>
                </button>

                {/* Order Items Preview */}
                <div className="px-5 pb-4 pt-2">
                  {order.items.slice(0, isExpanded ? undefined : 1).map((item) => (
                    <div key={item.id} className="flex items-start gap-3 mt-4 first:mt-2">
                      <div className="w-16 h-16 bg-gray-100 dark:bg-bg-tertiary rounded-xl overflow-hidden shrink-0 border border-gray-100 dark:border-border-dim">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                            <Package size={20} className="opacity-50" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-gray-900 dark:text-text-primary text-sm font-bold line-clamp-1 leading-snug">
                          {item.productName}
                        </p>
                        {item.specValues?.length > 0 && (
                          <p className="text-gray-500 dark:text-text-muted text-[11px] mt-1 font-medium bg-gray-50 dark:bg-bg-tertiary inline-block px-1.5 py-0.5 rounded">
                            {item.specValues.join(' / ')}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-gray-900 dark:text-text-primary text-sm font-bold">
                            <PriceDisplay amount={item.price} />
                          </span>
                          <span className="text-gray-400 dark:text-text-muted text-xs font-medium">
                            x{item.quantity}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {!isExpanded && order.items.length > 1 && (
                    <div className="mt-3 text-center">
                      <p className="text-gray-400 dark:text-text-muted text-[11px] font-medium bg-gray-50 dark:bg-bg-tertiary py-1 rounded-lg">
                        以及其他 {order.items.length - 1} 件商品...
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-5 pt-4 border-t border-gray-100 dark:border-border-subtle border-dashed flex items-center justify-end gap-2">
                    {['pending', 'paid'].includes(order.status) && (
                      <button
                        type="button"
                        onClick={() => cancelOrder.mutate(order.id)}
                        disabled={cancelOrder.isPending}
                        className="px-4 py-2 text-xs font-bold text-gray-500 dark:text-text-muted bg-gray-100 dark:bg-bg-tertiary rounded-xl hover:bg-gray-200 dark:hover:bg-bg-modifier-hover transition-all active:scale-95 disabled:opacity-50"
                      >
                        取消订单
                      </button>
                    )}

                    {['delivered', 'completed'].includes(order.status) &&
                      (orderReviews[order.id]?.length || 0) === 0 &&
                      reviewingOrder !== order.id && (
                        <button
                          type="button"
                          onClick={() => setReviewingOrder(order.id)}
                          className="px-4 py-2 text-xs font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-xl hover:bg-cyan-100 dark:hover:bg-cyan-900/40 transition-all active:scale-95 hover:shadow-sm"
                        >
                          我要评价
                        </button>
                      )}
                    {['delivered', 'completed'].includes(order.status) &&
                      (orderReviews[order.id]?.length || 0) > 0 && (
                        <span className="px-4 py-2 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-900/40">
                          已评价
                        </span>
                      )}
                  </div>

                  {isExpanded && (orderReviews[order.id]?.length || 0) > 0 && (
                    <div className="mt-4 p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-900/10 border border-emerald-200/60 dark:border-emerald-900/30 space-y-2">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        我的评价
                      </p>
                      {orderReviews[order.id]!.map((rv) => (
                        <div key={rv.id} className="text-xs text-emerald-700 dark:text-emerald-300">
                          <span className="font-bold">评分 {rv.rating} 星：</span>
                          <span>{rv.content || '（未填写文字）'}</span>
                          {rv.isAnonymous ? <span className="ml-2 text-[10px]">匿名</span> : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-bg-tertiary border border-gray-100 dark:border-border-dim text-xs space-y-1 text-gray-600 dark:text-text-muted">
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
                    <div className="mt-4 p-4 bg-gray-50 dark:bg-bg-tertiary rounded-2xl animate-in slide-in-from-top-2 duration-200">
                      {/* Product selector for multi-item orders */}
                      {order.items.length > 1 && (
                        <div className="mb-3">
                          <span className="text-xs font-bold text-gray-700 dark:text-text-secondary block mb-2">
                            选择要评价的商品
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {order.items.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setReviewProductId(item.productId)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
                                  (reviewProductId || order.items[0]?.productId) === item.productId
                                    ? 'border-cyan-500 bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400'
                                    : 'border-gray-200 dark:border-border-dim text-gray-600 dark:text-gray-400 hover:border-gray-300'
                                }`}
                              >
                                {item.productName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <span className="text-xs font-bold text-gray-700 dark:text-text-secondary block mb-2">
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
                                i < reviewRating
                                  ? 'text-yellow-400 fill-yellow-400'
                                  : 'text-gray-300 dark:text-gray-600'
                              }
                            />
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={reviewContent}
                        onChange={(e) => setReviewContent(e.target.value)}
                        placeholder="商品满足您的期待吗？说说您的真实感受..."
                        className="w-full h-24 p-3 bg-white dark:bg-bg-secondary text-gray-900 dark:text-text-primary text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 resize-none transition-all"
                      />
                      <label className="mt-3 flex items-center gap-2 text-xs text-gray-600 dark:text-text-muted font-medium">
                        <input
                          type="checkbox"
                          checked={reviewAnonymous}
                          onChange={(e) => setReviewAnonymous(e.target.checked)}
                        />
                        匿名评价
                      </label>
                      <div className="flex justify-end gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => setReviewingOrder(null)}
                          className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-200 dark:hover:bg-bg-modifier-hover rounded-xl transition-all active:scale-95"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            submitReview.mutate({
                              orderId: order.id,
                              productId: reviewProductId || (order.items[0]?.productId ?? ''),
                              rating: reviewRating,
                              content: reviewContent || undefined,
                              isAnonymous: reviewAnonymous,
                            })
                          }
                          disabled={submitReview.isPending}
                          className="px-5 py-2 text-xs font-bold bg-cyan-600 text-white rounded-xl shadow-md shadow-cyan-900/20 hover:bg-cyan-700 transition-all active:scale-95 disabled:opacity-50"
                        >
                          提交评价
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
