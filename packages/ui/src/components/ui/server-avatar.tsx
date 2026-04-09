import * as AvatarPrimitive from '@radix-ui/react-avatar'
import * as React from 'react'
import { cn } from '../../lib/utils'

/** Deterministic color for server avatar fallback based on name — Neon Frost palette (Cyan/Yellow core) */
const SERVER_AVATAR_COLORS = [
  'bg-[#00c6d1]', // Primary Cyan
  'bg-[#0891b2]', // Cyan Deep
  'bg-[#06b6d4]', // Cyan Bright
  'bg-[#00a3b0]', // Cyan Muted
  'bg-[#ffb300]', // Accent Yellow
  'bg-[#e0a800]', // Yellow Muted
  'bg-[#1565c0]', // Deep Blue
  'bg-[#0d47a1]', // Navy
  'bg-[#00897B]', // Teal Muted
  'bg-[#FF2A55]', // Danger Crimson
  'bg-[#37474f]', // Slate
  'bg-[#455a64]', // Blue Grey
] as const

function getServerAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return SERVER_AVATAR_COLORS[Math.abs(hash) % SERVER_AVATAR_COLORS.length]!
}

interface ServerAvatarProps {
  iconUrl?: string | null
  name: string
  className?: string
}

export const ServerAvatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  ServerAvatarProps
>(({ iconUrl, name, className, ...props }, ref) => (
  <div className={cn('relative inline-block shrink-0 select-none w-[56px] h-[56px]', className)}>
    <AvatarPrimitive.Root
      ref={ref}
      className="relative flex h-full w-full shrink-0 overflow-hidden rounded-3xl border border-border-subtle bg-bg-tertiary shadow-xl"
      {...props}
    >
      {iconUrl && (
        <AvatarPrimitive.Image
          src={iconUrl}
          alt={name}
          className="aspect-square h-full w-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback
        className={cn(
          'flex h-full w-full items-center justify-center rounded-3xl text-[#050508] font-bold text-[18px]',
          getServerAvatarColor(name),
        )}
      >
        {name.charAt(0).toUpperCase()}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  </div>
))
ServerAvatar.displayName = 'ServerAvatar'
