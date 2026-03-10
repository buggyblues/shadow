import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PriceDisplay } from './ui/currency'
import { ShoppingCart, Trash2, Minus, Plus, ShoppingBag, ShieldCheck } from 'lucide-react'
import { useState, useMemo } from 'react'
import { fetchApi } from '../../lib/api'

interface CartItem {
  id: string
  userId: string
  shopId: string
  productId: string
  skuId?: string
  quantity: number
  product: { id: string; name: string; status: string; basePrice: number } | null
  sku: { id: string; specValues: string[]; price: number; stock: number; imageUrl?: string } | null
  imageUrl: string | null
  unitPrice: number
}

interface ShopCartProps {
  serverId: string
  onCheckout?: () => void
}

export function ShopCart({ serverId, onCheckout }: ShopCartProps) {
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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
      // Auto remove from selection
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.clear() // Or just remove the specific one to be safe
        return next
      })
    },
  })

  const updateQty = useMutation({
    mutationFn: (data: { productId: string; skuId?: string; quantity: number }) =>
      fetchApi(`/api/servers/${serverId}/shop/cart`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-cart', serverId] }),
  })

  const placeOrder = useMutation({
    mutationFn: (items: Array<{ productId: string; skuId?: string; quantity: number }>) =>
      fetchApi(`/api/servers/${serverId}/shop/orders`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-cart', serverId] })
      queryClient.invalidateQueries({ queryKey: ['shop-orders', serverId] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      setSelectedIds(new Set())
      if (onCheckout) onCheckout()
    },
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
      skuId: item.skuId,
      quantity: item.quantity,
    }))
    placeOrder.mutate(items)
  }

  if (cartItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F9FAFB] dark:bg-bg-primary h-full">
        <div className="w-32 h-32 mb-6 rounded-full bg-cyan-50 dark:bg-cyan-900/10 flex items-center justify-center shadow-inner relative">
           <ShoppingCart size={48} className="text-cyan-300 dark:text-cyan-800" strokeWidth={1.5} />
           <div className="absolute w-8 h-8 rounded-full bg-white dark:bg-bg-secondary flex items-center justify-center bottom-2 right-2 shadow-md">
              <span className="text-gray-400">0</span>
           </div>
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-text-primary mb-2">购物车空空如也</h3>
        <p className="text-sm text-gray-500 dark:text-text-muted mb-8">去挑选一些心仪的商品吧</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#F9FAFB] dark:bg-bg-primary font-sans relative">
      
      {/* ── Security Banner ── */}
      <div className="flex items-center justify-center gap-1.5 py-2 bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-500 text-[10px] sm:text-xs">
        <ShieldCheck size={14} />
        官方担保交易，支付安全无忧
      </div>

      {/* ── List Header ── */}
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100 dark:border-border-subtle bg-white dark:bg-bg-secondary sticky top-0 z-10 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-text-secondary cursor-pointer group">
          <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
            selectedIds.size === cartItems.length 
              ? 'bg-cyan-500 border-cyan-500 shadow-sm' 
              : 'border-2 border-gray-300 dark:border-border-dim group-hover:border-cyan-400'
          }`}>
            {selectedIds.size === cartItems.length && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
          </div>
          <input
            type="checkbox"
            checked={selectedIds.size === cartItems.length}
            onChange={toggleAll}
            className="hidden"
          />
          全选全部
        </label>
        <span className="text-xs font-medium px-2 py-1 bg-gray-100 dark:bg-bg-tertiary rounded-full text-gray-500 dark:text-text-muted">
          共 {cartItems.length} 件
        </span>
      </div>

      {/* ── Cart Items ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {cartItems.map((item) => {
          const isSelected = selectedIds.has(item.id)
          return (
            <div
              key={item.id}
              className={`flex items-start gap-4 p-4 bg-white dark:bg-bg-secondary rounded-2xl transition-all duration-300 border ${
                isSelected 
                  ? 'border-cyan-200 dark:border-cyan-800 shadow-md shadow-cyan-900/5' 
                  : 'border-transparent shadow-sm hover:shadow-md'
              }`}
            >
              {/* Checkbox */}
              <label className="mt-5 cursor-pointer relative pb-10">
                <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                  isSelected 
                    ? 'bg-cyan-500 border-cyan-500 shadow-sm' 
                    : 'border-2 border-gray-300 dark:border-border-dim hover:border-cyan-400'
                }`}>
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
              <div className="w-20 h-20 bg-gray-50 dark:bg-bg-tertiary rounded-xl overflow-hidden shrink-0 border border-gray-100 dark:border-border-dim relative">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingBag size={24} className="text-gray-300 dark:text-text-muted opacity-30" />
                  </div>
                )}
              </div>

              {/* Info & Operations */}
              <div className="flex-1 min-w-0 flex flex-col justify-between h-full pt-0.5">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-gray-900 dark:text-text-primary text-sm font-bold line-clamp-2 leading-snug">
                      {item.product?.name || '商品已下架'}
                    </h4>
                    <button
                      type="button"
                      onClick={() => removeItem.mutate(item.id)}
                      className="text-gray-400 hover:text-rose-500 transition-colors p-1 bg-gray-50 hover:bg-rose-50 dark:bg-bg-tertiary dark:hover:bg-rose-900/20 rounded-lg shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  
                  {item.sku && item.sku.specValues.length > 0 && (
                    <div className="inline-flex mt-1.5 px-2 py-0.5 bg-gray-100 dark:bg-bg-tertiary rounded text-[11px] text-gray-500 dark:text-text-muted font-medium">
                      {item.sku.specValues.join(' / ')}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3">
                  <span className="text-rose-500 dark:text-rose-400 text-base font-black flex items-baseline gap-0.5">
                    <PriceDisplay amount={item.unitPrice} />
                  </span>
                  
                  {/* Quantity Control */}
                  <div className="flex items-center bg-gray-50 dark:bg-bg-tertiary rounded-lg p-0.5 border border-gray-100 dark:border-border-subtle">
                    <button
                      type="button"
                      onClick={() =>
                        updateQty.mutate({
                          productId: item.productId,
                          skuId: item.skuId,
                          quantity: Math.max(1, item.quantity - 1),
                        })
                      }
                      className="w-7 h-7 flex items-center justify-center rounded-md bg-white dark:bg-bg-secondary text-gray-600 dark:text-text-muted shadow-sm hover:shadow hover:text-cyan-600 active:scale-95 transition-all"
                    >
                      <Minus size={12} strokeWidth={3} />
                    </button>
                    <span className="text-gray-900 dark:text-text-primary text-xs font-bold w-7 text-center">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateQty.mutate({
                          productId: item.productId,
                          skuId: item.skuId,
                          quantity: item.quantity + 1,
                        })
                      }
                      className="w-7 h-7 flex items-center justify-center rounded-md bg-white dark:bg-bg-secondary text-gray-600 dark:text-text-muted shadow-sm hover:shadow hover:text-cyan-600 active:scale-95 transition-all"
                    >
                      <Plus size={12} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Bottom Checkout Bar ── */}
      <div className="shrink-0 p-4 border-t border-gray-100 dark:border-border-subtle bg-white/90 dark:bg-bg-secondary/90 backdrop-blur-xl flex items-center gap-4 z-20 pb-safe shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-xs text-gray-500 dark:text-text-muted font-medium mb-0.5">
            已选 {selectedItems.length} 件
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-bold text-gray-900 dark:text-white">合计:</span>
            <span className="text-rose-500 dark:text-rose-400 font-black text-xl flex items-baseline gap-0.5 tracking-tight">
               <PriceDisplay amount={totalAmount} size={24} />
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCheckout}
          disabled={selectedItems.length === 0 || placeOrder.isPending}
          className="px-8 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {placeOrder.isPending ? '处理中...' : `去结算 (${selectedItems.length})`}
        </button>
      </div>
    </div>
  )
}
