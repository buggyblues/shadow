import type { BuddyInboxTaskResultMetadata, MessageCardStatus } from '@shadowob/shared'
import { cn } from '@shadowob/ui'
import { Link } from '@tanstack/react-router'
import {
  ArrowRightLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  LoaderCircle,
  type LucideIcon,
  MessageSquare,
  Square,
  UserCheck,
  XCircle,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageMarkdown } from './markdown'
import type { Message } from './types'

function currentServerSegment() {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/\/(?:app\/)?servers\/([^/]+)/u)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function taskResultStatusMeta(status: MessageCardStatus): {
  Icon: LucideIcon
  className: string
  iconClassName?: string
  borderClassName: string
} {
  switch (status) {
    case 'completed':
      return {
        Icon: CheckCircle2,
        className: 'text-emerald-300 bg-emerald-400/10',
        borderClassName: 'border-emerald-400/25',
      }
    case 'failed':
      return {
        Icon: XCircle,
        className: 'text-rose-300 bg-rose-400/10',
        borderClassName: 'border-rose-400/25',
      }
    case 'canceled':
      return {
        Icon: Ban,
        className: 'text-text-muted bg-white/5',
        borderClassName: 'border-white/10',
      }
    case 'transferred':
      return {
        Icon: ArrowRightLeft,
        className: 'text-violet-300 bg-violet-400/10',
        borderClassName: 'border-violet-400/25',
      }
    case 'running':
      return {
        Icon: LoaderCircle,
        className: 'text-amber-300 bg-amber-400/10',
        iconClassName: 'animate-spin motion-reduce:animate-none',
        borderClassName: 'border-amber-400/25',
      }
    case 'claimed':
      return {
        Icon: UserCheck,
        className: 'text-sky-300 bg-sky-400/10',
        borderClassName: 'border-sky-400/25',
      }
    case 'queued':
      return {
        Icon: Square,
        className: 'text-text-muted bg-white/5',
        borderClassName: 'border-white/10',
      }
  }
}

function sourceTaskRoute(result: BuddyInboxTaskResultMetadata) {
  const server = currentServerSegment()
  const sourceTask = result.sourceTask
  if (!server || !sourceTask?.channelId || !sourceTask.messageId) return null
  return {
    server,
    channelId: sourceTask.channelId,
    search: { msg: sourceTask.messageId },
  }
}

export function TaskResultCardView({
  message,
  onOpenThread,
  renderMentions,
  result,
}: {
  message: Message
  onOpenThread?: (messageId: string) => void
  renderMentions: (children: ReactNode) => ReactNode
  result: BuddyInboxTaskResultMetadata
}) {
  const { t } = useTranslation()
  const statusMeta = taskResultStatusMeta(result.status)
  const StatusIcon = statusMeta.Icon
  const sourceTitle =
    result.sourceTask?.title ?? result.parentTask?.title ?? t('inbox.task.result.untitled')
  const parentTitle = result.parentTask?.title ?? null
  const note = (result.body ?? message.content).trim()
  const route = sourceTaskRoute(result)
  const canOpenParentThread = Boolean(
    onOpenThread &&
      result.parentTask?.messageId &&
      (!message.threadId || message.threadId !== result.parentTask.threadId),
  )

  return (
    <article
      className={cn(
        'my-2 w-full max-w-[min(36rem,100%)] rounded-lg border bg-bg-secondary/40 p-3 text-text-primary shadow-sm',
        statusMeta.borderClassName,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-bold',
            statusMeta.className,
            statusMeta.borderClassName,
          )}
        >
          <StatusIcon size={14} className={cn('shrink-0', statusMeta.iconClassName)} />
          <span className="truncate">{t(`inbox.task.status.${result.status}`)}</span>
        </span>
        <span className="text-xs font-semibold text-text-muted">
          {t('inbox.task.result.label')}
        </span>
      </div>

      <div className="mt-2 min-w-0">
        <div className="truncate text-sm font-black text-text-primary">
          {t('inbox.task.result.from', { title: sourceTitle })}
        </div>
        {parentTitle ? (
          <div className="mt-0.5 truncate text-xs font-semibold text-text-muted">
            {t('inbox.task.result.to', { title: parentTitle })}
          </div>
        ) : null}
      </div>

      <div className="mt-2 [&_.msg-markdown]:pt-0 [&_.msg-markdown]:text-sm [&_.msg-markdown]:leading-6">
        {note ? (
          <MessageMarkdown content={note} renderMentions={renderMentions} />
        ) : (
          <p className="text-sm leading-6 text-text-muted">{t('inbox.task.result.emptyNote')}</p>
        )}
      </div>

      {route || canOpenParentThread ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {route ? (
            <Link
              to="/servers/$serverSlug/channels/$channelId"
              params={{ serverSlug: route.server, channelId: route.channelId }}
              search={route.search}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-subtle/70 bg-bg-primary/35 px-3 py-1.5 text-xs font-bold text-text-muted transition hover:border-primary/30 hover:bg-primary/8 hover:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/35"
            >
              <ArrowUpRight size={14} className="shrink-0 text-primary/85" />
              <span className="truncate">{t('inbox.task.result.openSource')}</span>
            </Link>
          ) : null}
          {canOpenParentThread && result.parentTask?.messageId ? (
            <button
              type="button"
              onClick={() => onOpenThread?.(result.parentTask?.messageId ?? message.id)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-subtle/70 bg-bg-primary/35 px-3 py-1.5 text-xs font-bold text-text-muted transition hover:border-primary/30 hover:bg-primary/8 hover:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/35"
            >
              <MessageSquare size={14} className="shrink-0 text-primary/85" />
              <span className="truncate">{t('inbox.task.result.openParent')}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
