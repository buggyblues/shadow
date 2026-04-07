import { Button, Card } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Package, Wallet } from 'lucide-react'
import { useState } from 'react'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { useRechargeStore } from '../../stores/recharge.store'
import { useShopStore } from '../../stores/shop.store'
import type { Product, ProductMediaItem, SkuItem } from './shop-page'
import { PriceDisplay } from './ui/currency'

interface OrderConfirmProps {
  serverId: string
  productId: string
  skuId?: string
  quantity: number
  onBack: () => void
}

export function OrderConfirm({ serverId, productId, skuId, quantity, onBack }: OrderConfirmProps) {
  const queryClient = useQueryClient()
  const { setActiveProductId, setOverlay } = useShopStore()
  const openRecharge = useRechargeStore((s) => s.openModal)
  const [paid, setPaid] = useState(false)

  const { data: product } = useQuery({
    queryKey: ['shop-product', productId],
    queryFn: () =>
      fetchApi<Product & { media: ProductMediaItem[]; skus: SkuItem[] }>(
        `/api/servers/${serverId}/shop/products/${productId}`,
      ),
  })

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => fetchApi<{ balance: number }>('/api/wallet'),
  })

  const payMutation = useMutation({
    mutationFn: (data: { items: Array<{ productId: string; skuId?: string; quantity: number }> }) =>
      fetchApi<{ id: string }>(`/api/servers/${serverId}/shop/orders`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['shop-orders', serverId] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      queryClient.invalidateQueries({ queryKey: ['shop-cart', serverId] })
      setPaid(true)
      // After 2s, navigate to orders
      setTimeout(() => {
        setActiveProductId(null)
        useShopStore.setState({ lastOrderId: res?.id ?? null })
        setOverlay('orders')
      }, 2000)
    },
    onError: (err: Error) => showToast(err.message || '支付失败，请检查余额或库存', 'error'),
  })

  if (!product) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary h-full">
        <div className="animate-pulse text-text-muted font-bold">加载中...</div>
      </div>
    )
  }

  const selectedSku = product.skus?.find((s) => s.id === skuId)
  const unitPrice = selectedSku?.price ?? product.basePrice
  const totalAmount = unitPrice * quantity
  const balance = wallet?.balance ?? 0
  const sufficient = balance >= totalAmount
  const imageUrl = selectedSku?.imageUrl ?? product.media?.[0]?.url ?? null

  const handlePay = () => {
    payMutation.mutate({
      items: [{ productId: product.id, skuId: skuId ?? undefined, quantity }],
    })
  }

  // Show success state
  if (paid) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-primary h-full gap-6">
        <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center animate-in zoom-in duration-300">
          <CheckCircle2 className="w-10 h-10 text-success" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black uppercase tracking-tight text-text-primary mb-2">
            支付成功！
          </h2>
          <p className="text-sm text-text-muted font-bold italic">正在跳转到订单管理...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-hidden h-full font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-bg-tertiary/50 backdrop-blur-xl border-b border-border-subtle shrink-0 sticky top-0 z-50">
        <Button
          variant="ghost"
          size="icon"
          icon={ArrowLeft}
          onClick={onBack}
          className="!h-10 !w-10"
        />
        <h2 className="font-black uppercase tracking-tight text-text-primary text-lg">确认订单</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          {/* Product info card */}
          <Card variant="glass" className="!rounded-[40px] !p-5">
            <h3 className="text-sm font-black uppercase tracking-widest text-text-muted mb-4 flex items-center gap-2">
              <Package size={14} />
              商品明细
            </h3>
            <div className="flex gap-4">
              <div className="w-20 h-20 rounded-2xl bg-bg-tertiary shrink-0 overflow-hidden border border-border-subtle">
                {imageUrl ? (
                  <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">
                    无图
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-black text-text-primary text-base truncate">{product.name}</h4>
                {selectedSku && selectedSku.specValues.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedSku.specValues.map((v) => (
                      <span
                        key={v}
                        className="text-xs bg-bg-tertiary text-text-muted px-2 py-0.5 rounded-full border border-border-subtle"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between mt-3">
                  <PriceDisplay amount={unitPrice} size={16} />
                  <span className="text-sm text-text-muted">× {quantity}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Price breakdown */}
          <Card variant="glass" className="!rounded-[40px] !p-5">
            <h3 className="text-sm font-black uppercase tracking-widest text-text-muted mb-4 flex items-center gap-2">
              <Wallet size={14} />
              费用详情
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">商品单价</span>
                <PriceDisplay amount={unitPrice} size={14} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">数量</span>
                <span className="text-sm font-black text-text-primary">{quantity}</span>
              </div>
              <div className="border-t border-border-subtle pt-3 flex items-center justify-between">
                <span className="text-base font-black text-text-primary">应付总额</span>
                <span className="text-xl font-black text-danger">
                  <PriceDisplay amount={totalAmount} size={22} />
                </span>
              </div>
            </div>
          </Card>

          {/* Wallet balance */}
          <Card variant="glass" className="!rounded-[40px] !p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">钱包余额</span>
              <PriceDisplay amount={balance} size={14} />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-text-secondary">支付后余额</span>
              <span className={`text-sm font-black ${sufficient ? 'text-success' : 'text-danger'}`}>
                <PriceDisplay amount={Math.max(0, balance - totalAmount)} size={14} />
              </span>
            </div>
            {!sufficient && (
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-danger font-black">余额不足，请先充值虾币</p>
                <Button variant="ghost" size="xs" onClick={openRecharge} className="text-primary">
                  立即充值 →
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Bottom pay bar */}
      <div className="shrink-0 border-t border-border-subtle bg-bg-tertiary/50 backdrop-blur-xl p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-sm text-text-muted">合计：</span>
            <span className="text-xl font-black text-danger ml-1">
              <PriceDisplay amount={totalAmount} size={22} />
            </span>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={handlePay}
            loading={payMutation.isPending}
            disabled={!sufficient}
          >
            {payMutation.isPending ? '支付中...' : '确认支付'}
          </Button>
        </div>
      </div>
    </div>
  )
}
