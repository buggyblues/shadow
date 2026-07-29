import { useTranslation } from 'react-i18next'
import type { TravelSyncStatus } from '../hooks/use-persistent-trip-state.js'
import { cn } from '../utils/class-names.js'
import { CheckCircle, Clock, Cloud, CloudBolt } from './icons.js'

export function SyncStatus({ status }: { status: TravelSyncStatus }) {
  const { t } = useTranslation()
  if (status === 'idle') return null
  const Icon =
    status === 'saving'
      ? Clock
      : status === 'error'
        ? CloudBolt
        : status === 'synced'
          ? Cloud
          : CheckCircle
  return (
    <span
      aria-live="polite"
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-white/84 px-3 font-bold text-[11px] shadow-[var(--shadow-control)]',
        status === 'error' ? 'text-coral' : 'text-olive',
      )}
    >
      <Icon className={status === 'saving' ? 'animate-pulse' : undefined} size={14} />
      {t(`sync.${status}`)}
    </span>
  )
}
