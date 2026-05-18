import { Badge, Button, Card, CardContent, cn } from '@shadowob/ui'
import { Plus, ShieldCheck, Star, Store } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { PriceDisplay } from './currency'
import { ProductVisual, resolveProductVisualKind } from './product-visual'

type ProductCardMedia = {
  type?: string | null
  url?: string | null
  thumbnailUrl?: string | null
}

type ProductCardEntitlementConfig = {
  resourceType?: string | null
  resourceId?: string | null
  capability?: string | null
  durationSeconds?: number | null
  renewalPeriodSeconds?: number | null
  privilegeDescription?: string | null
} | null

export interface ProductCardProduct {
  id: string
  name: string
  type: 'physical' | 'entitlement' | string
  summary?: string | null
  description?: string | null
  basePrice?: number | null
  currency?: string | null
  tags?: string[] | null
  salesCount?: number | null
  avgRating?: number | null
  ratingCount?: number | null
  imageUrl?: string | null
  media?: ProductCardMedia[] | null
  entitlementConfig?: ProductCardEntitlementConfig | ProductCardEntitlementConfig[] | null
}

interface ProductCardProps<TProduct extends ProductCardProduct> {
  product: TProduct
  onClick: (id: string) => void
  onAddToCart?: (product: TProduct, e: React.MouseEvent) => void
  onShopClick?: (e: React.MouseEvent) => void
  shopName?: string | null
  serverName?: string | null
  className?: string
}

export function ProductCard<TProduct extends ProductCardProduct>({
  product,
  onClick,
  onAddToCart,
  onShopClick,
  shopName,
  serverName,
  className,
}: ProductCardProps<TProduct>) {
  const { t } = useTranslation()
  const entitlementConfig = Array.isArray(product.entitlementConfig)
    ? product.entitlementConfig[0]
    : product.entitlementConfig
  const resourceType = entitlementConfig?.resourceType
  const assetType =
    resourceType === 'community_asset'
      ? product.tags?.find((tag) =>
          ['badge', 'gift', 'coupon', 'service_ticket', 'collectible'].includes(tag),
        )
      : undefined
  const visualKind = resolveProductVisualKind({
    productType: product.type,
    resourceType,
    assetType,
  })

  return (
    <Card
      role="button"
      tabIndex={0}
      variant="glass"
      hoverable
      className={cn(
        'group flex cursor-pointer flex-col overflow-hidden !rounded-[18px] border border-border-subtle bg-bg-secondary/60 shadow-[0_16px_42px_rgba(0,0,0,0.14)] transition hover:border-primary/35 hover:bg-bg-secondary/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
        className,
      )}
      onClick={() => onClick(product.id)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onClick(product.id)
      }}
    >
      <div className="relative h-36 w-full overflow-hidden border-b border-border-subtle/70 bg-bg-tertiary/30">
        <ProductVisual
          name={product.name}
          imageUrl={product.imageUrl}
          media={product.media}
          productType={product.type}
          resourceType={resourceType}
          assetType={assetType}
          className="h-full w-full rounded-none border-0 transition-transform duration-500 group-hover:scale-[1.03]"
        />

        {onAddToCart && (
          <div className="absolute bottom-4 right-4 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 z-10 hidden md:block">
            <Button
              variant="glass"
              size="icon"
              title={t('shop.addToCart')}
              onClick={(e) => onAddToCart(product, e)}
              icon={Plus}
            />
          </div>
        )}
      </div>

      <CardContent className="flex min-h-[184px] flex-1 flex-col p-4">
        {(shopName || serverName) && (
          <div className="mb-2 flex min-w-0 items-center gap-1.5 text-[11px] font-black text-text-muted">
            <Store size={12} className="shrink-0 text-primary" />
            {onShopClick ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onShopClick(event)
                }}
                className="min-w-0 truncate text-left transition hover:text-primary"
              >
                {shopName ?? t('commerce.consumerStorefront')}
              </button>
            ) : (
              <span className="truncate">{shopName ?? t('commerce.consumerStorefront')}</span>
            )}
            {serverName && (
              <>
                <span className="shrink-0 text-text-muted/45">·</span>
                <span className="truncate">{serverName}</span>
              </>
            )}
          </div>
        )}
        <h3 className="mb-1 line-clamp-2 text-base font-black leading-tight text-text-primary transition-colors group-hover:text-primary">
          {product.name}
        </h3>

        {product.summary && (
          <p className="mb-3 line-clamp-2 text-sm leading-5 text-text-secondary">
            {product.summary}
          </p>
        )}

        <div className="mb-3 flex max-w-full flex-wrap gap-1.5">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-black text-primary">
            <ShieldCheck size={12} className="shrink-0" />
            <span className="truncate">{t(`commerce.visualPromise.${visualKind}`)}</span>
          </span>
          {product.type === 'entitlement' && (
            <Badge variant="warning" size="xs" className="max-w-full">
              <span className="truncate">{t('shop.entitlement')}</span>
            </Badge>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <PriceDisplay amount={product.basePrice ?? 0} size={18} showFree />

          <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-bold text-text-muted">
            {(product.ratingCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-200">
                <Star size={11} fill="currentColor" />
                {(product.avgRating ?? 0).toFixed(1)}
              </span>
            )}
            <span>
              {t('shop.soldCount')}{' '}
              {(product.salesCount ?? 0) > 999 ? '999+' : (product.salesCount ?? 0)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
