import { cn, ServerAvatar } from '@shadowob/ui'
import { Lock } from 'lucide-react'

type ServerIconSize = 'xs' | 'sm' | 'md' | 'lg'
export type ServerIconVariant = 'framed' | 'plain'

const sizeClass: Record<ServerIconSize, string> = {
  xs: 'h-7 w-7',
  sm: 'h-9 w-9',
  md: 'h-14 w-14',
  lg: 'h-16 w-16',
}

const plainStyleBySize: Record<
  ServerIconSize,
  { fallbackText: string; lockBadge: string; lockIcon: number; radius: string }
> = {
  xs: {
    fallbackText: 'text-xs',
    lockBadge: 'h-3.5 w-3.5 -right-1 -top-1',
    lockIcon: 8,
    radius: 'rounded-lg',
  },
  sm: {
    fallbackText: 'text-sm',
    lockBadge: 'h-4 w-4 -right-1 -top-1',
    lockIcon: 9,
    radius: 'rounded-xl',
  },
  md: {
    fallbackText: 'text-lg',
    lockBadge: 'h-[18px] w-[18px] -right-1 -top-1',
    lockIcon: 10,
    radius: 'rounded-[14px]',
  },
  lg: {
    fallbackText: 'text-xl',
    lockBadge: 'h-5 w-5 -right-1 -top-1',
    lockIcon: 11,
    radius: 'rounded-2xl',
  },
}

export interface ServerIconProps {
  iconUrl?: string | null
  name: string
  size?: ServerIconSize
  variant?: ServerIconVariant
  fallbackTextClassName?: string
  lockBadgeClassName?: string
  lockIconSize?: number
  radiusClassName?: string
  active?: boolean
  isPublic?: boolean
  unreadCount?: number
  isMuted?: boolean
  className?: string
}

export function ServerIcon({
  iconUrl,
  name,
  size = 'md',
  variant = 'framed',
  fallbackTextClassName,
  lockBadgeClassName,
  lockIconSize,
  radiusClassName,
  active = false,
  isPublic = true,
  unreadCount = 0,
  isMuted = false,
  className,
}: ServerIconProps) {
  const showUnread = unreadCount > 0 && !isMuted
  const initial = name.charAt(0).toUpperCase()
  const plainStyle = plainStyleBySize[size]
  const radius = radiusClassName ?? plainStyle.radius

  if (variant === 'plain') {
    return (
      <span
        className={cn(
          'relative inline-grid shrink-0 place-items-center overflow-visible transition-all duration-300',
          sizeClass[size],
          active &&
            'ring-[3px] ring-primary ring-offset-2 ring-offset-bg-deep shadow-[0_0_24px_rgba(0,243,255,0.4)]',
          className,
        )}
      >
        {iconUrl ? (
          <span className={cn('h-full w-full overflow-hidden', radius)}>
            <img
              src={iconUrl}
              alt={name}
              draggable={false}
              className="h-full w-full object-cover"
            />
          </span>
        ) : (
          <span
            className={cn(
              'grid h-full w-full place-items-center overflow-hidden bg-primary/18 font-black text-primary',
              radius,
              plainStyle.fallbackText,
              fallbackTextClassName,
            )}
          >
            {initial}
          </span>
        )}
        {isPublic === false && (
          <span
            className={cn(
              'absolute z-10 flex items-center justify-center rounded-full bg-bg-deep/90 shadow-sm ring-1 ring-white/14 backdrop-blur',
              plainStyle.lockBadge,
              lockBadgeClassName,
            )}
          >
            <Lock size={lockIconSize ?? plainStyle.lockIcon} className="text-text-muted" />
          </span>
        )}
        {showUnread && (
          <span className="absolute -bottom-0.5 -right-0.5 z-10 h-3 min-w-[12px] rounded-full border-2 border-[#12121a] bg-danger shadow-[0_0_8px_rgba(239,68,68,0.45)]" />
        )}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'relative inline-grid shrink-0 place-items-center overflow-visible rounded-3xl transition-all duration-300',
        sizeClass[size],
        active
          ? 'ring-[3px] ring-primary ring-offset-2 ring-offset-bg-deep shadow-[0_0_24px_rgba(0,243,255,0.4)]'
          : 'ring-0',
        className,
      )}
    >
      <ServerAvatar iconUrl={iconUrl} name={name} className="h-full w-full" />
      {isPublic === false && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-bg-deep/85 shadow-sm ring-1 ring-white/10 backdrop-blur">
          <Lock size={10} className="text-text-muted" />
        </span>
      )}
      {showUnread && (
        <span className="absolute -bottom-0.5 -right-0.5 z-10 h-3 min-w-[12px] rounded-full border-2 border-[#12121a] bg-danger shadow-[0_0_8px_rgba(239,68,68,0.45)]" />
      )}
    </span>
  )
}
