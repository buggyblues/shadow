import { Badge, Button, cn } from '@shadowob/ui'
import { Store } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'

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

function handleCardKey(event: KeyboardEvent, onOpen: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onOpen()
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
        'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-border-subtle bg-bg-primary text-primary',
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
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => handleCardKey(event, onOpen)}
      className={cn(
        'group cursor-pointer overflow-hidden rounded-[18px] border border-border-subtle bg-bg-secondary/60 text-left shadow-[0_16px_42px_rgba(0,0,0,0.14)] transition hover:border-primary/35 hover:bg-bg-secondary/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
        className,
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden border-b border-border-subtle/70 bg-bg-tertiary',
          compact ? 'h-24' : 'h-28',
        )}
      >
        {shop.bannerUrl ? (
          <img src={shop.bannerUrl} alt={shop.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_78%_18%,rgba(255,51,102,0.20),transparent_28%),radial-gradient(circle_at_18%_18%,rgba(0,209,255,0.20),transparent_30%),linear-gradient(135deg,rgba(0,243,255,0.18),rgba(71,85,105,0.16)_48%,rgba(255,42,85,0.12))]" />
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
            className="hidden bg-bg-primary/65 backdrop-blur-xl sm:flex"
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

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border-subtle/60 pt-3">
          <span className="text-xs font-black text-text-muted">{shop.productCountLabel}</span>
          <Button
            size="sm"
            variant="glass"
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
  )
}
