import { cn } from '@shadowob/ui'
import { Loader2, MessageCircle, Settings2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { RuntimeIcon } from '../buddy-management/agent-dialogs'
import { UserAvatar } from '../common/avatar'

export function ComputerBuddyRow({
  id,
  name,
  description,
  avatarUrl,
  online,
  runtimeId,
  runtimeLabel,
  runtimeIconId,
  opening = false,
  chatDisabled = false,
  chatLabel,
  configureLabel,
  onOpenChat,
  onConfigure,
  actions,
}: {
  id: string
  name: string
  description?: string | null
  avatarUrl?: string | null
  online: boolean
  runtimeId: string
  runtimeLabel: string
  runtimeIconId?: string | null
  opening?: boolean
  chatDisabled?: boolean
  chatLabel: string
  configureLabel?: string
  onOpenChat: () => void
  onConfigure?: () => void
  actions?: ReactNode
}) {
  return (
    <article className="group flex min-w-0 items-center gap-2 rounded-2xl border border-white/[0.07] bg-bg-deep/40 p-2 transition hover:border-white/[0.12] hover:bg-bg-deep/65">
      <button
        type="button"
        disabled={chatDisabled || opening}
        onClick={onOpenChat}
        aria-label={chatLabel}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-left transition hover:bg-white/[0.035] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="relative shrink-0">
          <UserAvatar userId={id} avatarUrl={avatarUrl} displayName={name} size="sm" />
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-secondary',
              online ? 'bg-success' : 'bg-text-muted/40',
            )}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-text-primary">{name}</span>
          {description ? (
            <span className="block truncate text-xs text-text-muted">{description}</span>
          ) : null}
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
            <RuntimeIcon
              iconId={runtimeIconId}
              runtimeId={runtimeId}
              label={runtimeLabel}
              className="h-3.5 w-3.5 shrink-0"
            />
            <span className="truncate">{runtimeLabel}</span>
          </span>
        </span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-text-muted transition group-hover:bg-primary/10 group-hover:text-primary">
          {opening ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
        </span>
      </button>

      {onConfigure && configureLabel ? (
        <button
          type="button"
          onClick={onConfigure}
          aria-label={configureLabel}
          title={configureLabel}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-text-muted transition hover:bg-white/[0.06] hover:text-text-primary"
        >
          <Settings2 size={14} />
        </button>
      ) : null}
      {actions}
    </article>
  )
}
