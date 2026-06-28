import { Badge, Button, ClickableCard, cn } from '@shadowob/ui'
import { Store } from 'lucide-react'
import type { ReactNode } from 'react'
import { DiscoverPlaceholderVisual } from './discover-placeholder'

export interface DiscoverShopCardData {
  id: string
  name: string
  description?: string | null
  scopeKind?: string | null
  logoUrl?: string | null
  bannerUrl?: string | null
  productCount?: number | null
  ownerName?: string | null
  scopeLabel: string
  productCountLabel: string
  fallbackDescription: string
}

interface DiscoverShopCardProps {
  shop: DiscoverShopCardData
  onOpen: () => void
  variant?: 'feature' | 'compact'
  actionLabel: string
  className?: string
}

function ShopMark({
  imageUrl,
  label,
  icon,
  className,
}: {
  imageUrl?: string | null
  label: string
  icon: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-bg-secondary/80 bg-bg-primary/70 text-primary shadow-[0_8px_22px_rgba(0,0,0,0.24)]',
        className,
      )}
    >
      {imageUrl ? <img src={imageUrl} alt={label} className="h-full w-full object-cover" /> : icon}
    </div>
  )
}

export function DiscoverShopCard({
  shop,
  onOpen,
  variant = 'feature',
  actionLabel,
  className,
}: DiscoverShopCardProps) {
  const description = shop.description?.trim() || shop.fallbackDescription
  const compact = variant === 'compact'

  return (
    <ClickableCard asChild onPress={onOpen}>
      <article
        className={cn(
          'group cursor-pointer overflow-hidden rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/55 text-left shadow-[0_18px_48px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-bg-tertiary/65',
          className,
        )}
      >
        <div
          className={cn(
            'relative overflow-hidden border-b border-white/10 bg-bg-primary/55',
            compact ? 'h-28' : 'h-40',
          )}
        >
          {shop.bannerUrl ? (
            <img src={shop.bannerUrl} alt={shop.name} className="h-full w-full object-cover" />
          ) : (
            <DiscoverPlaceholderVisual className="h-full w-full" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg-secondary/92 via-bg-secondary/20 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
            <h3 className="line-clamp-2 text-base font-black leading-tight text-text-primary">
              {shop.name}
            </h3>
            <ShopMark
              imageUrl={shop.logoUrl}
              label={shop.name}
              icon={<Store size={22} />}
              className="hidden bg-bg-primary/70 sm:flex"
            />
          </div>
        </div>

        <div className={cn('flex flex-col p-4', compact ? 'min-h-[148px]' : 'min-h-[168px]')}>
          <div className="mb-3 flex items-start gap-3">
            <ShopMark imageUrl={shop.logoUrl} label={shop.name} icon={<Store size={20} />} />
            <div className="min-w-0 flex-1">
              <h4 className="truncate text-base font-black text-text-primary transition-colors group-hover:text-primary">
                {shop.name}
              </h4>
              {shop.ownerName ? (
                <p className="mt-1 truncate text-xs font-bold text-text-muted">{shop.ownerName}</p>
              ) : null}
            </div>
            <Badge variant={shop.scopeKind === 'server' ? 'primary' : 'neutral'} size="sm">
              {shop.scopeLabel}
            </Badge>
          </div>

          <p className="line-clamp-2 flex-1 text-sm leading-6 text-text-secondary">{description}</p>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
            <span className="text-xs font-black text-text-muted">{shop.productCountLabel}</span>
            <Button
              size="sm"
              variant="glass"
              className="rounded-[14px]"
              onClick={(event) => {
                event.stopPropagation()
                onOpen()
              }}
            >
              {actionLabel}
            </Button>
          </div>
        </div>
      </article>
    </ClickableCard>
  )
}
