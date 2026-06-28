import { Badge, Card, CardContent, ClickableCard, cn, TooltipIconButton } from '@shadowob/ui'
import { Plus, ShieldCheck, Star, Store } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import {
  DESKTOP_PET_PACK_ASSET_TYPE,
  hasDesktopPetPackTag,
} from '../../../lib/desktop-pet-marketplace'
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
  repeatable?: boolean | null
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
  purchased?: boolean
  className?: string
}

export function ProductCard<TProduct extends ProductCardProduct>({
  product,
  onClick,
  onAddToCart,
  onShopClick,
  shopName,
  serverName,
  purchased,
  className,
}: ProductCardProps<TProduct>) {
  const { t } = useTranslation()
  const entitlementConfig = Array.isArray(product.entitlementConfig)
    ? product.entitlementConfig[0]
    : product.entitlementConfig
  const resourceType = entitlementConfig?.resourceType
  const assetType = hasDesktopPetPackTag(product.tags)
    ? DESKTOP_PET_PACK_ASSET_TYPE
    : resourceType === 'community_asset'
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
    <ClickableCard asChild onPress={() => onClick(product.id)}>
      <Card
        variant="glass"
        hoverable
        className={cn(
          'group flex cursor-pointer flex-col overflow-hidden !rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/48 shadow-[0_18px_48px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-bg-tertiary/55',
          className,
        )}
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-white/10 bg-bg-primary/55">
          <ProductVisual
            name={product.name}
            imageUrl={product.imageUrl}
            media={product.media}
            productType={product.type}
            resourceType={resourceType}
            assetType={assetType}
            className="h-full w-full rounded-none border-0 transition-transform duration-700 group-hover:scale-[1.04]"
          />

          {purchased && (
            <div className="absolute left-3 top-3 z-10 rounded-full border border-success/25 bg-success/90 px-2.5 py-1 text-[11px] font-black text-white shadow-lg">
              {t('shop.purchased')}
            </div>
          )}

          {onAddToCart && !purchased && (
            <div className="absolute bottom-4 right-4 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 z-10 hidden md:block">
              <TooltipIconButton
                label={t('shop.addToCart')}
                variant="glass"
                size="icon"
                onClick={(e) => onAddToCart(product, e)}
              >
                <Plus size={18} />
              </TooltipIconButton>
            </div>
          )}
        </div>

        <CardContent className="flex min-h-[172px] flex-1 flex-col p-4">
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

            {(product.ratingCount ?? 0) > 0 && (
              <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-bold text-text-muted">
                <span className="inline-flex items-center gap-1 text-amber-200">
                  <Star size={11} fill="currentColor" />
                  {(product.avgRating ?? 0).toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </ClickableCard>
  )
}
