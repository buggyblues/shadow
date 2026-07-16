import type { ShadowComputerKind } from '@shadowob/shared'
import { cn } from '@shadowob/ui'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const AVAILABLE_STATUSES = new Set(['online', 'deployed', 'running', 'ready'])
const PROGRESSING_STATUSES = new Set([
  'pending',
  'deploying',
  'resuming',
  'destroying',
  'cancelling',
])

export function isComputerStatusAvailable(status: string) {
  return AVAILABLE_STATUSES.has(status)
}

export function isComputerStatusProgressing(status: string) {
  return PROGRESSING_STATUSES.has(status)
}

export function computerStatusClasses(status: string) {
  if (isComputerStatusAvailable(status)) {
    return {
      badge: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
      dot: 'bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.75)]',
    }
  }
  if (status === 'failed' || status === 'error') {
    return {
      badge: 'border-rose-400/25 bg-rose-400/10 text-rose-300',
      dot: 'bg-rose-400 shadow-[0_0_9px_rgba(251,113,133,0.72)]',
    }
  }
  if (status === 'paused') {
    return {
      badge: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
      dot: 'bg-sky-400 shadow-[0_0_9px_rgba(56,189,248,0.68)]',
    }
  }
  if (isComputerStatusProgressing(status)) {
    return {
      badge: 'border-amber-300/25 bg-amber-300/10 text-amber-200',
      dot: 'bg-amber-300 shadow-[0_0_9px_rgba(252,211,77,0.72)]',
    }
  }
  return {
    badge: 'border-white/[0.09] bg-black/20 text-text-muted',
    dot: 'bg-zinc-400',
  }
}

function computerStatusTranslationKey(kind: ShadowComputerKind, status: string) {
  if (kind === 'cloud') return `cloudComputers.status.${status}`
  return `computers.status.${isComputerStatusAvailable(status) ? 'available' : status}`
}

export function ComputerStatusDot({
  status,
  kind,
  decorative = false,
  className,
}: {
  status: string
  kind: ShadowComputerKind
  decorative?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const label = t(computerStatusTranslationKey(kind, status), {
    defaultValue: t('computers.status.unknown'),
  })

  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      title={decorative ? undefined : label}
      className={cn(
        'h-2.5 w-2.5 shrink-0 rounded-full',
        computerStatusClasses(status).dot,
        className,
      )}
    />
  )
}

export function ComputerStatusBadge({
  status,
  kind,
  className,
}: {
  status: string
  kind: ShadowComputerKind
  className?: string
}) {
  const { t } = useTranslation()
  const tone = computerStatusClasses(status)
  const progressing = isComputerStatusProgressing(status)
  const label = t(computerStatusTranslationKey(kind, status), {
    defaultValue: t('computers.status.unknown'),
  })

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-black backdrop-blur-md',
        tone.badge,
        className,
      )}
    >
      {progressing ? (
        <Loader2 size={11} aria-hidden className="shrink-0 animate-spin" />
      ) : (
        <ComputerStatusDot status={status} kind={kind} decorative className="h-2 w-2" />
      )}
      {label}
    </span>
  )
}
