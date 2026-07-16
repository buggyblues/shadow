import { cn } from '../utils/class-names.js'
import { AvatarGroup, type AvatarPerson, UserAvatar } from './avatar-group.js'

interface ParticipantPickerProps {
  className?: string
  max?: number
  members: AvatarPerson[]
  onToggle?: (id: string) => void
  selectedIds: string[]
  size?: 'sm' | 'md'
}

export function ParticipantPicker({
  className,
  max = 4,
  members,
  onToggle,
  selectedIds,
  size = 'sm',
}: ParticipantPickerProps) {
  if (!onToggle) {
    return (
      <AvatarGroup
        className={className}
        items={members.filter((member) => selectedIds.includes(member.id))}
        max={max}
        size={size}
      />
    )
  }

  return (
    <div className={cn('flex min-w-0 flex-wrap gap-1.5', className)}>
      {members.map((member) => {
        const selected = selectedIds.includes(member.id)
        return (
          <button
            aria-pressed={selected}
            className={cn(
              'inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-1.5 pr-2 font-bold text-[11px] transition',
              selected
                ? 'border-olive/20 bg-sage text-olive'
                : 'border-line bg-white text-muted hover:border-olive/30 hover:text-ink',
            )}
            key={member.id}
            onClick={() => onToggle(member.id)}
            type="button"
          >
            <UserAvatar person={member} size={size} />
            <span className="min-w-0 truncate">{member.name}</span>
          </button>
        )
      })}
    </div>
  )
}
