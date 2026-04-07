import * as AvatarPrimitive from '@radix-ui/react-avatar'
import * as React from 'react'
import { getCatAvatarByUserId } from '../../lib/pixel-cats'
import { cn } from '../../lib/utils'

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & {
    userId?: string
    avatarUrl?: string | null
    displayName?: string | null
    status?: string
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  }
>(({ className, userId, avatarUrl, displayName, status, size = 'md', ...props }, ref) => {
  const sizes = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-11 h-11',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  }

  const indicatorSizes = {
    xs: 'w-2 h-2',
    sm: 'w-2.5 h-2.5',
    md: 'w-3.5 h-3.5',
    lg: 'w-4.5 h-4.5 border-4',
    xl: 'w-6 h-6 border-4',
  }

  const statusColors: Record<string, string> = {
    online: 'bg-success shadow-[0_0_10px_rgba(0,230,118,0.6)]',
    running: 'bg-success shadow-[0_0_10px_rgba(0,230,118,0.6)]',
    idle: 'bg-warning shadow-[0_0_10px_rgba(255,145,0,0.4)]',
    dnd: 'bg-danger shadow-[0_0_10px_rgba(255,42,85,0.4)]',
    error: 'bg-danger shadow-[0_0_10px_rgba(255,42,85,0.4)]',
    offline: 'bg-text-muted',
  }

  return (
    <div className={cn('relative inline-block shrink-0 select-none', sizes[size], className)}>
      <AvatarPrimitive.Root
        ref={ref}
        className={cn(
          'relative flex h-full w-full shrink-0 overflow-hidden rounded-full border border-border-subtle bg-bg-tertiary shadow-xl',
        )}
        {...props}
      >
        <AvatarPrimitive.Image
          src={avatarUrl || (userId ? getCatAvatarByUserId(userId) : undefined)}
          className="aspect-square h-full w-full object-cover"
        />
        <AvatarPrimitive.Fallback className="flex h-full w-full items-center justify-center rounded-full bg-bg-tertiary text-text-muted font-black uppercase text-[0.6em]">
          {displayName?.slice(0, 2) || userId?.slice(0, 2) || '?'}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
      {status && (
        <div
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-bg-secondary ring-2 ring-bg-secondary z-10',
            indicatorSizes[size],
            statusColors[status] || statusColors.offline,
          )}
        />
      )}
    </div>
  )
})
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn('aspect-square h-full w-full', className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-muted',
      className,
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarFallback, AvatarImage }
