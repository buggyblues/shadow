import { cn } from '../utils/class-names.js'

export interface AvatarPerson {
  id: string
  name: string
  avatarUrl?: string
  color?: string
}

type AvatarSize = 'sm' | 'md'

const avatarSizeClasses: Record<AvatarSize, string> = {
  md: 'size-9',
  sm: 'size-7',
}

export function UserAvatar({
  className,
  person,
  size = 'sm',
}: {
  className?: string
  person: AvatarPerson
  size?: AvatarSize
}) {
  const dimension = avatarSizeClasses[size]

  if (person.avatarUrl) {
    return (
      <img
        alt=""
        className={cn(dimension, 'rounded-full object-cover', className)}
        src={person.avatarUrl}
      />
    )
  }

  return (
    <span
      className={cn(
        dimension,
        'grid shrink-0 place-items-center rounded-full font-extrabold text-white text-[11px]',
        className,
      )}
      style={{ backgroundColor: person.color ?? '#737842' }}
    >
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function AvatarGroup({
  className,
  items,
  max = 4,
  size = 'sm',
}: {
  className?: string
  items: AvatarPerson[]
  max?: number
  size?: AvatarSize
}) {
  const visibleItems = items.slice(0, max)
  const overflow = items.length - visibleItems.length

  return (
    <span className={cn('flex -space-x-2', className)}>
      {visibleItems.map((item) => (
        <span className="rounded-full ring-2 ring-white" key={item.id}>
          <UserAvatar person={item} size={size} />
        </span>
      ))}
      {overflow > 0 ? (
        <span className="grid size-7 place-items-center rounded-full bg-paper font-extrabold text-[10px] text-muted ring-2 ring-white">
          +{overflow}
        </span>
      ) : null}
    </span>
  )
}
