import { getCatAvatarByUserId } from '@shadowob/shared'

interface AvatarProps {
  userId?: string
  avatarUrl?: string | null
  displayName?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  loading?: 'eager' | 'lazy'
}

const sizeMap = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-20 h-20',
}

export function UserAvatar({
  userId,
  avatarUrl,
  displayName,
  size = 'md',
  className = '',
  loading = 'lazy',
}: AvatarProps) {
  const sizeClass = sizeMap[size]
  const fallbackSeed = userId?.trim() || displayName?.trim() || 'default'
  const src = avatarUrl?.trim() || getCatAvatarByUserId(fallbackSeed)

  return (
    <img
      src={src}
      alt={displayName ?? ''}
      loading={loading}
      decoding="async"
      className={`${sizeClass} rounded-full bg-bg-secondary object-cover shrink-0 ${className}`}
    />
  )
}
