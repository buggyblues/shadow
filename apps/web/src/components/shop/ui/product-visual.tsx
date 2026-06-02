import { cn } from '@shadowob/ui'
import { AppWindow, Award, FileText, Gem, Package, ShieldCheck, Ticket } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isDesktopPetPackTag } from '../../../lib/desktop-pet-marketplace'
import { DiscoverPlaceholderVisual } from '../../discover/discover-placeholder'

type VisualMedia = {
  type?: string | null
  url?: string | null
  thumbnailUrl?: string | null
}

type VisualKind =
  | 'service'
  | 'file'
  | 'desktop_pet_pack'
  | 'badge'
  | 'gift'
  | 'ticket'
  | 'asset'
  | 'app'
  | 'physical'

const visualConfig: Record<
  VisualKind,
  {
    icon: typeof ShieldCheck
    className: string
    iconClassName: string
  }
> = {
  service: {
    icon: ShieldCheck,
    className: 'border-cyan-300/18 bg-[#13272d] text-cyan-100',
    iconClassName: 'bg-cyan-300/12 ring-cyan-200/18 text-cyan-100',
  },
  file: {
    icon: FileText,
    className: 'border-sky-300/18 bg-[#172235] text-sky-100',
    iconClassName: 'bg-sky-300/12 ring-sky-200/18 text-sky-100',
  },
  desktop_pet_pack: {
    icon: Package,
    className: 'border-cyan-200/20 bg-[#112b31] text-cyan-100',
    iconClassName: 'bg-cyan-200/14 ring-cyan-100/20 text-cyan-100',
  },
  badge: {
    icon: Award,
    className: 'border-amber-200/20 bg-[#2b261b] text-amber-100',
    iconClassName: 'bg-amber-200/14 ring-amber-100/20 text-amber-100',
  },
  gift: {
    icon: Gem,
    className: 'border-rose-200/18 bg-[#2a1d27] text-rose-100',
    iconClassName: 'bg-rose-200/12 ring-rose-100/18 text-rose-100',
  },
  ticket: {
    icon: Ticket,
    className: 'border-emerald-200/18 bg-[#1d2a24] text-emerald-100',
    iconClassName: 'bg-emerald-200/12 ring-emerald-100/18 text-emerald-100',
  },
  asset: {
    icon: Package,
    className: 'border-violet-200/18 bg-[#1f2234] text-violet-100',
    iconClassName: 'bg-violet-200/12 ring-violet-100/18 text-violet-100',
  },
  app: {
    icon: AppWindow,
    className: 'border-blue-200/18 bg-[#172436] text-blue-100',
    iconClassName: 'bg-blue-200/12 ring-blue-100/18 text-blue-100',
  },
  physical: {
    icon: Package,
    className: 'border-orange-200/18 bg-[#2b241b] text-orange-100',
    iconClassName: 'bg-orange-200/12 ring-orange-100/18 text-orange-100',
  },
}

export function resolveProductVisualKind(input: {
  productType?: string | null
  resourceType?: string | null
  assetType?: string | null
}): VisualKind {
  if (input.productType === 'physical') return 'physical'
  if (input.assetType && isDesktopPetPackTag(input.assetType)) return 'desktop_pet_pack'
  if (input.resourceType === 'workspace_file') return 'file'
  if (input.assetType === 'badge') return 'badge'
  if (input.assetType === 'gift' || input.assetType === 'collectible') return 'gift'
  if (input.assetType === 'service_ticket' || input.assetType === 'coupon') return 'ticket'
  if (input.resourceType === 'community_asset') return 'asset'
  if (input.resourceType === 'external_app') return 'app'
  return 'service'
}

export function pickProductImage(input: {
  imageUrl?: string | null
  media?: VisualMedia[] | null
}) {
  if (input.imageUrl) return input.imageUrl
  const primary = input.media?.find((item) => item.type === 'image') ?? input.media?.[0]
  return primary?.thumbnailUrl ?? primary?.url ?? null
}

export function ProductVisual({
  name,
  imageUrl,
  media,
  productType,
  resourceType,
  assetType,
  className,
  iconClassName,
  labelClassName,
  showLabel = true,
}: {
  name?: string | null
  imageUrl?: string | null
  media?: VisualMedia[] | null
  productType?: string | null
  resourceType?: string | null
  assetType?: string | null
  className?: string
  iconClassName?: string
  labelClassName?: string
  showLabel?: boolean
  showCaption?: boolean
}) {
  const { t } = useTranslation()
  const resolvedImage = pickProductImage({ imageUrl, media })
  const kind = resolveProductVisualKind({ productType, resourceType, assetType })
  const config = visualConfig[kind]
  const Icon = config.icon
  const label = t(`commerce.visual.${kind}`)

  if (resolvedImage) {
    return (
      <div
        className={cn('relative self-start overflow-hidden rounded-lg bg-bg-tertiary', className)}
      >
        <img src={resolvedImage} alt={name ?? ''} className="h-full w-full object-cover" />
        {showLabel && (
          <span
            className={cn(
              'absolute left-2 top-2 rounded-full bg-bg-deep/55 px-2 py-1 text-[10px] font-black text-white',
              labelClassName,
            )}
          >
            {label}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative isolate flex self-start items-center justify-center overflow-hidden rounded-lg border',
        config.className,
        className,
      )}
      aria-label={name ?? label}
    >
      <DiscoverPlaceholderVisual className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/18 to-transparent" />
      <div
        className={cn(
          'relative flex h-14 w-14 items-center justify-center rounded-2xl ring-1 sm:h-16 sm:w-16',
          config.iconClassName,
          iconClassName,
        )}
      >
        <Icon size={28} strokeWidth={2.2} />
      </div>
    </div>
  )
}
