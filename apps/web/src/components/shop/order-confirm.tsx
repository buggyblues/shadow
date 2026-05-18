import { Button, Card } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Package, ReceiptText, Wallet, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import {
  type CommerceDeliveryEntitlement,
  type CommercePurchaseOrder,
  deliveryDetailHref,
  findPurchaseEntitlement,
} from '../../lib/commerce-delivery'
import { showToast } from '../../lib/toast'
import { useRechargeStore } from '../../stores/recharge.store'
import { useShopStore } from '../../stores/shop.store'
import type { Product, ProductMediaItem, SkuItem } from './shop-page'
import { PriceDisplay } from './ui/currency'

function createIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

interface OrderConfirmProps {
  serverId: string
  productId: string
  skuId?: string
  quantity: number
  onBack: () => void
}

export function OrderConfirm({ serverId, productId, skuId, quantity, onBack }: OrderConfirmProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { setActiveProductId, setOverlay } = useShopStore()
  const openRecharge = useRechargeStore((s) => s.openModal)
  const [paid, setPaid] = useState(false)
  const [purchaseResult, setPurchaseResult] = useState<{
    order: CommercePurchaseOrder
    entitlement?: CommerceDeliveryEntitlement | null
  } | null>(null)

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
      fetchApi<CommercePurchaseOrder>(`/api/servers/${serverId}/shop/orders`, {
        method: 'POST',
        body: JSON.stringify({ ...data, idempotencyKey: createIdempotencyKey('shop-order') }),
      }),
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ['shop-orders', serverId] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      queryClient.invalidateQueries({ queryKey: ['shop-cart', serverId] })
      queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      queryClient.invalidateQueries({ queryKey: ['community-assets'] })
      setPaid(true)
      const entitlement = await findPurchaseEntitlement({
        orderId: res.id,
        productId,
      }).catch(() => null)
      setPurchaseResult({ order: res, entitlement })
    },
    onError: (err: Error) => showToast(err.message || t('shop.paymentFailed'), 'error'),
  })

  if (!product) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary h-full">
        <div className="animate-pulse text-text-muted font-bold">{t('common.loading')}</div>
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
    const detailHref = deliveryDetailHref(purchaseResult?.entitlement?.id)
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-primary h-full gap-6">
        <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center animate-in zoom-in duration-300">
          <CheckCircle2 className="w-10 h-10 text-success" />
        </div>
        <div className="max-w-sm text-center">
          <h2 className="text-xl font-black uppercase tracking-tight text-text-primary mb-2">
            {t('shop.paymentSuccessTitle')}
          </h2>
          <p className="text-sm text-text-muted font-bold">{t('shop.paymentSuccessHint')}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href={detailHref}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-success px-4 text-sm font-black text-white transition hover:bg-success/90"
          >
            <ReceiptText size={16} />
            {purchaseResult?.entitlement
              ? t('shop.viewDeliveryDetail')
              : t('shop.viewPurchaseDelivery')}
          </a>
          <a
            href="/app/settings/wallet/entitlements"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-bg-secondary/70 px-4 text-sm font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
          >
            <WalletCards size={16} />
            {t('shop.openPurchaseDelivery')}
          </a>
          <Button
            variant="glass"
            onClick={() => {
              setActiveProductId(null)
              useShopStore.setState({ lastOrderId: purchaseResult?.order.id ?? null })
              setOverlay('orders')
            }}
          >
            {t('shop.openStoreOrders')}
          </Button>
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
        <h2 className="font-black uppercase tracking-tight text-text-primary text-lg">
          {t('shop.confirmOrder')}
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          {/* Product info card */}
          <Card variant="glass" className="!rounded-[40px] !p-5">
            <h3 className="text-sm font-black uppercase tracking-widest text-text-muted mb-4 flex items-center gap-2">
              <Package size={14} />
              {t('shop.orderProductDetails')}
            </h3>
            <div className="flex gap-4">
              <div className="w-20 h-20 rounded-2xl bg-bg-tertiary shrink-0 overflow-hidden border border-border-subtle">
                {imageUrl ? (
                  <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">
                    {t('shop.noImage')}
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
                  <span className="text-sm text-text-muted">
                    {t('shop.quantityMultiplier', { count: quantity })}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Price breakdown */}
          <Card variant="glass" className="!rounded-[40px] !p-5">
            <h3 className="text-sm font-black uppercase tracking-widest text-text-muted mb-4 flex items-center gap-2">
              <Wallet size={14} />
              {t('shop.priceBreakdown')}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">{t('shop.productUnitPrice')}</span>
                <PriceDisplay amount={unitPrice} size={14} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">{t('shop.quantity')}</span>
                <span className="text-sm font-black text-text-primary">{quantity}</span>
              </div>
              <div className="border-t border-border-subtle pt-3 flex items-center justify-between">
                <span className="text-base font-black text-text-primary">
                  {t('shop.orderPayableTotal')}
                </span>
                <span className="text-xl font-black text-danger">
                  <PriceDisplay amount={totalAmount} size={22} />
                </span>
              </div>
            </div>
          </Card>

          {/* Wallet balance */}
          <Card variant="glass" className="!rounded-[40px] !p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{t('shop.walletBalance')}</span>
              <PriceDisplay amount={balance} size={14} />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-text-secondary">{t('shop.balanceAfterPayment')}</span>
              <span className={`text-sm font-black ${sufficient ? 'text-success' : 'text-danger'}`}>
                <PriceDisplay amount={Math.max(0, balance - totalAmount)} size={14} />
              </span>
            </div>
            {!sufficient && (
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-danger font-black">
                  {t('shop.insufficientBalanceHint')}
                </p>
                <Button variant="ghost" size="xs" onClick={openRecharge} className="text-primary">
                  {t('shop.rechargeNow')}
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
            <span className="text-sm text-text-muted">{t('shop.orderTotal')}</span>
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
            {payMutation.isPending ? t('shop.paymentProcessing') : t('shop.confirmPayment')}
          </Button>
        </div>
      </div>
    </div>
  )
}
