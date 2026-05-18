import { Button, Card } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Minus,
  Plus,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  WalletCards,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import {
  type CommerceDeliveryEntitlement,
  type CommercePurchaseOrder,
  deliveryDetailHref,
  findPurchaseEntitlement,
} from '../../lib/commerce-delivery'
import { showToast } from '../../lib/toast'
import { PriceDisplay } from './ui/currency'

function createIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

interface CartItem {
  id: string
  userId: string
  shopId: string
  productId: string
  skuId?: string | null
  quantity: number
  product: { id: string; name: string; status: string; basePrice: number } | null
  sku: { id: string; specValues: string[]; price: number; stock: number; imageUrl?: string } | null
  imageUrl: string | null
  unitPrice: number
}

interface ShopCartProps {
  serverId: string
  onCheckout?: (orderId: string) => void
}

export function ShopCart({ serverId, onCheckout }: ShopCartProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [checkoutResult, setCheckoutResult] = useState<{
    order: CommercePurchaseOrder
    entitlement?: CommerceDeliveryEntitlement | null
  } | null>(null)

  const { data: cartItems = [] } = useQuery({
    queryKey: ['shop-cart', serverId],
    queryFn: () => fetchApi<CartItem[]>(`/api/servers/${serverId}/shop/cart`),
  })

  // Ensure default full selection if cart is first loaded and no changes made yet
  // We'll leave it as user-driven for now

  const removeItem = useMutation({
    mutationFn: (itemId: string) =>
      fetchApi(`/api/servers/${serverId}/shop/cart/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-cart', serverId] })
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.clear()
        return next
      })
    },
    onError: (err: Error) => showToast(err.message || t('shop.deleteFailed'), 'error'),
  })

  const updateQty = useMutation({
    mutationFn: (data: { productId: string; skuId?: string; quantity: number }) =>
      fetchApi(`/api/servers/${serverId}/shop/cart`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-cart', serverId] }),
    onError: (err: Error) => showToast(err.message || t('shop.updateQuantityFailed'), 'error'),
  })

  const placeOrder = useMutation({
    mutationFn: (items: Array<{ productId: string; skuId?: string; quantity: number }>) =>
      fetchApi<CommercePurchaseOrder>(`/api/servers/${serverId}/shop/orders`, {
        method: 'POST',
        body: JSON.stringify({ items, idempotencyKey: createIdempotencyKey('shop-order') }),
      }),
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['shop-cart', serverId] })
      queryClient.invalidateQueries({ queryKey: ['shop-orders', serverId] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      queryClient.invalidateQueries({ queryKey: ['community-assets'] })
      setSelectedIds(new Set())
      showToast(t('shop.orderSuccess'), 'success')
      const entitlement = await findPurchaseEntitlement({ orderId: data.id }).catch(() => null)
      setCheckoutResult({ order: data, entitlement })
    },
    onError: (err: Error) => showToast(err.message || t('shop.orderFailed'), 'error'),
  })

  const selectedItems = useMemo(
    () => cartItems.filter((item) => selectedIds.has(item.id)),
    [cartItems, selectedIds],
  )

  const totalAmount = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [selectedItems],
  )

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === cartItems.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(cartItems.map((i) => i.id)))
    }
  }

  const handleCheckout = () => {
    if (selectedItems.length === 0) return
    const items = selectedItems.map((item) => ({
      productId: item.productId,
      ...(item.skuId ? { skuId: item.skuId } : {}),
      quantity: item.quantity,
    }))
    placeOrder.mutate(items)
  }

  if (checkoutResult) {
    const detailHref = deliveryDetailHref(checkoutResult.entitlement?.id)
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-5 bg-bg-primary p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 size={42} />
        </div>
        <div className="max-w-sm">
          <h3 className="text-xl font-black text-text-primary">{t('shop.paymentSuccessTitle')}</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-text-muted">
            {t('shop.paymentSuccessHint')}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href={detailHref}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-success px-4 text-sm font-black text-white transition hover:bg-success/90"
          >
            <ReceiptText size={16} />
            {checkoutResult.entitlement
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
          {onCheckout && (
            <Button variant="glass" onClick={() => onCheckout(checkoutResult.order.id)}>
              {t('shop.openStoreOrders')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (cartItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-bg-primary h-full">
        <div className="w-32 h-32 mb-6 rounded-full bg-primary/5 flex items-center justify-center relative">
          <ShoppingCart size={48} className="text-primary/30" strokeWidth={1.5} />
          <div className="absolute w-8 h-8 rounded-full bg-bg-tertiary/50 backdrop-blur-xl border border-border-subtle flex items-center justify-center bottom-2 right-2">
            <span className="text-text-muted font-black">0</span>
          </div>
        </div>
        <h3 className="text-lg font-black uppercase tracking-tight text-text-primary mb-2">
          {t('shop.cartEmptyTitle')}
        </h3>
        <p className="text-sm text-text-muted font-bold mb-8">{t('shop.cartEmptyHint')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-bg-primary font-sans relative">
      {/* ── Security Banner ── */}
      <div className="flex items-center justify-center gap-1.5 py-2 bg-success/5 text-success text-[11px] sm:text-xs font-black uppercase tracking-widest">
        <ShieldCheck size={14} />
        {t('shop.secureCheckoutBanner')}
      </div>

      {/* ── List Header ── */}
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-border-subtle bg-bg-tertiary/50 backdrop-blur-xl sticky top-0 z-10">
        <label className="flex items-center gap-2 text-sm font-black text-text-secondary cursor-pointer group">
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
              selectedIds.size === cartItems.length
                ? 'bg-primary border-primary shadow-sm'
                : 'border-2 border-border-subtle group-hover:border-primary'
            }`}
          >
            {selectedIds.size === cartItems.length && (
              <div className="w-2.5 h-2.5 bg-white rounded-sm" />
            )}
          </div>
          <input
            type="checkbox"
            checked={selectedIds.size === cartItems.length}
            onChange={toggleAll}
            className="hidden"
          />
          {t('shop.selectAll')}
        </label>
        <span className="text-xs font-black px-2 py-1 bg-primary/5 border border-primary/20 rounded-full text-text-muted uppercase tracking-widest">
          {t('shop.cartCount', { count: cartItems.length })}
        </span>
      </div>

      {/* ── Cart Items ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hidden">
        {cartItems.map((item) => {
          const isSelected = selectedIds.has(item.id)
          return (
            <Card
              key={item.id}
              variant="glass"
              className={`!rounded-[40px] transition-all duration-300 ${
                isSelected ? '!border-primary/30 shadow-[0_10px_25px_rgba(0,243,255,0.1)]' : ''
              }`}
            >
              <div className="flex items-start gap-4 p-4">
                {/* Checkbox */}
                <label className="mt-5 cursor-pointer relative pb-10">
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-primary border-primary shadow-sm'
                        : 'border-2 border-border-subtle hover:border-primary'
                    }`}
                  >
                    {isSelected && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(item.id)}
                    className="hidden"
                  />
                </label>

                {/* Image */}
                <div className="w-20 h-20 bg-bg-tertiary rounded-2xl overflow-hidden shrink-0 border border-border-subtle relative">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag size={24} className="text-text-muted opacity-30" />
                    </div>
                  )}
                </div>

                {/* Info & Operations */}
                <div className="flex-1 min-w-0 flex flex-col justify-between h-full pt-0.5">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-text-primary text-sm font-black line-clamp-2 leading-snug">
                        {item.product?.name || t('shop.productUnavailable')}
                      </h4>
                      <Button
                        variant="ghost"
                        size="icon"
                        icon={Trash2}
                        onClick={() => removeItem.mutate(item.id)}
                        className="!h-7 !w-7 text-text-muted hover:text-danger shrink-0"
                      />
                    </div>

                    {item.sku && item.sku.specValues.length > 0 && (
                      <div className="inline-flex mt-1.5 px-2 py-0.5 bg-bg-tertiary border border-border-subtle rounded-full text-[11px] text-text-muted font-black">
                        {item.sku.specValues.join(' / ')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <span className="text-danger text-base font-black flex items-baseline gap-0.5">
                      <PriceDisplay amount={item.unitPrice} />
                    </span>

                    {/* Quantity Control */}
                    <div className="flex items-center bg-bg-tertiary/50 rounded-2xl p-0.5 border border-border-subtle">
                      <button
                        type="button"
                        onClick={() =>
                          updateQty.mutate({
                            productId: item.productId,
                            skuId: item.skuId ?? undefined,
                            quantity: Math.max(1, item.quantity - 1),
                          })
                        }
                        className="w-7 h-7 flex items-center justify-center rounded-[8px] bg-bg-modifier-hover text-text-muted hover:text-primary active:scale-95 transition-all"
                      >
                        <Minus size={12} strokeWidth={3} />
                      </button>
                      <span className="text-text-primary text-xs font-black w-7 text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateQty.mutate({
                            productId: item.productId,
                            skuId: item.skuId ?? undefined,
                            quantity: Math.min(99, item.quantity + 1),
                          })
                        }
                        className="w-7 h-7 flex items-center justify-center rounded-[8px] bg-bg-modifier-hover text-text-muted hover:text-primary active:scale-95 transition-all"
                      >
                        <Plus size={12} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* ── Bottom Checkout Bar ── */}
      <div className="shrink-0 p-4 border-t border-border-subtle bg-bg-tertiary/50 backdrop-blur-xl flex items-center gap-4 z-20 pb-safe">
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-xs text-text-muted font-black uppercase tracking-widest mb-0.5">
            {t('shop.selectedCartCount', { count: selectedItems.length })}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-black text-text-primary">{t('shop.orderTotal')}</span>
            <span className="text-danger font-black text-xl flex items-baseline gap-0.5 tracking-tight">
              <PriceDisplay amount={totalAmount} size={24} />
            </span>
          </div>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={handleCheckout}
          loading={placeOrder.isPending}
          disabled={selectedItems.length === 0}
        >
          {placeOrder.isPending
            ? t('shop.checkoutProcessing')
            : t('shop.checkoutSelected', { count: selectedItems.length })}
        </Button>
      </div>
    </div>
  )
}
