import { Badge, type BadgeProps } from '@shadowob/ui'
import { StatusDot, type StatusType } from '@/components/StatusDot'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  dotStatus: StatusType
  dotLabel?: string
  pulse?: boolean
  badgeText: string
  badgeVariant: BadgeProps['variant']
  className?: string
}

export function StatusBadge({
  dotStatus,
  dotLabel,
  pulse,
  badgeText,
  badgeVariant,
  className,
}: StatusBadgeProps) {
  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      <StatusDot status={dotStatus} label={dotLabel} pulse={pulse} />
      <Badge
        variant={badgeVariant}
        size="sm"
        className="min-h-[1.3rem] rounded-full text-[0.68rem] font-bold tracking-[0.03em]"
      >
        {badgeText}
      </Badge>
    </div>
  )
}
