import type { MessageCard, MessageCardStatus, TaskMessageCard } from '@shadowob/shared'
import { Button, cn } from '@shadowob/ui'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  AppWindow,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDashed,
  ClipboardList,
  ExternalLink,
  Loader2,
  type LucideIcon,
  RotateCw,
  XCircle,
} from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'
import { MessageMarkdown } from './markdown'

export function isTaskCard(card: MessageCard): card is TaskMessageCard {
  return card.kind === 'task' && typeof card.id === 'string' && typeof card.title === 'string'
}

const statusMeta: Record<
  MessageCardStatus,
  {
    icon: LucideIcon
    marker: string
    badge: string
    border: string
    checkbox: string
  }
> = {
  queued: {
    icon: CircleDashed,
    marker: 'bg-warning',
    badge: 'border-warning/30 bg-warning/10 text-warning',
    border: 'border-border-subtle hover:border-warning/35',
    checkbox: 'border-warning/45 text-warning',
  },
  claimed: {
    icon: Circle,
    marker: 'bg-primary',
    badge: 'border-primary/25 bg-primary/10 text-primary',
    border: 'border-border-subtle hover:border-primary/35',
    checkbox: 'border-primary/45 text-primary',
  },
  running: {
    icon: Loader2,
    marker: 'bg-primary',
    badge: 'border-primary/25 bg-primary/10 text-primary',
    border: 'border-primary/35',
    checkbox: 'border-primary/45 text-primary',
  },
  completed: {
    icon: CheckCircle2,
    marker: 'bg-success',
    badge: 'border-success/25 bg-success/10 text-success',
    border: 'border-success/35',
    checkbox: 'border-success/45 bg-success/15 text-success',
  },
  failed: {
    icon: AlertCircle,
    marker: 'bg-danger',
    badge: 'border-danger/25 bg-danger/10 text-danger',
    border: 'border-danger/35',
    checkbox: 'border-danger/45 bg-danger/10 text-danger',
  },
  canceled: {
    icon: XCircle,
    marker: 'bg-text-muted',
    badge: 'border-text-muted/20 bg-text-muted/10 text-text-muted',
    border: 'border-border-subtle',
    checkbox: 'border-text-muted/35 text-text-muted',
  },
  transferred: {
    icon: ExternalLink,
    marker: 'bg-text-muted',
    badge: 'border-text-muted/20 bg-text-muted/10 text-text-muted',
    border: 'border-border-subtle',
    checkbox: 'border-text-muted/35 text-text-muted',
  },
}

function renderNoMentions(children: ReactNode) {
  return children
}

function sourceMeta(card: TaskMessageCard): {
  label: string | null
  url: string | null
  appKey: string | null
} {
  const source = card.source as
    | (TaskMessageCard['source'] & { appKey?: unknown })
    | null
    | undefined
  const resource =
    source?.resource && typeof source.resource === 'object' && !Array.isArray(source.resource)
      ? (source.resource as { label?: unknown; kind?: unknown; url?: unknown })
      : null
  const resourceLabel = typeof resource?.label === 'string' ? resource.label : null
  const resourceKind = typeof resource?.kind === 'string' ? resource.kind : null
  const resourceUrl = typeof resource?.url === 'string' ? resource.url : null
  const label = typeof source?.label === 'string' ? source.label : null
  const command = typeof source?.command === 'string' ? source.command : null
  const appKey =
    typeof source?.appKey === 'string'
      ? source.appKey
      : typeof card.data?.serverApp === 'object' &&
          card.data.serverApp !== null &&
          !Array.isArray(card.data.serverApp) &&
          typeof (card.data.serverApp as { appKey?: unknown }).appKey === 'string'
        ? ((card.data.serverApp as { appKey: string }).appKey ?? null)
        : null
  return {
    label: label ?? command ?? resourceLabel ?? resourceKind,
    url: resourceUrl,
    appKey,
  }
}

function compactDate(value?: string) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return null
  }
}

function cleanProgressNote(note?: string) {
  if (!note) return null
  const cleaned = note
    .replace(/^Completed by Buddy reply:\s*/i, '')
    .replace(/^OpenClaw runtime completed with reply:\s*/i, '')
    .replace(/^Buddy reply:\s*/i, '')
    .trim()
  return cleaned || null
}

function currentServerSegment() {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/\/(?:app\/)?servers\/([^/]+)/u)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function sourceHref(card: TaskMessageCard, source: ReturnType<typeof sourceMeta>) {
  if (source.url) return source.url
  if (!source.appKey) return null
  const server = currentServerSegment() ?? card.source?.serverId
  return server
    ? `/app/servers/${encodeURIComponent(server)}/apps/${encodeURIComponent(source.appKey)}`
    : null
}

function assigneeHref(card: TaskMessageCard) {
  return card.assignee?.userId ? `/app/profile/${card.assignee.userId}` : null
}

function plainText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTodoItems(markdown?: string) {
  if (!markdown) return []
  const items: Array<{ done: boolean; text: string }> = []
  const pattern = /^\s*[-*]\s+\[([ xX])]\s+(.+?)\s*$/gm
  let match = pattern.exec(markdown)
  while (match) {
    items.push({ done: match[1]?.toLowerCase() === 'x', text: plainText(match[2] ?? '') })
    match = pattern.exec(markdown)
  }
  return items
}

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border-subtle/70 bg-bg-primary/24 px-3 py-2.5">
      <div className="text-[11px] font-bold uppercase text-text-muted">{label}</div>
      <div className="mt-1 min-w-0 truncate text-sm font-black text-text-primary">{children}</div>
    </div>
  )
}

function Section({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="grid gap-2.5">
      <header className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-black text-text-primary">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border-subtle bg-bg-primary/35 text-primary">
            {icon}
          </span>
          <span className="truncate">{title}</span>
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export function TaskCardsView({
  cards,
  messageId,
  channelId,
}: {
  cards: MessageCard[] | undefined
  messageId: string
  channelId?: string
}) {
  const taskCards = useMemo(() => cards?.filter(isTaskCard) ?? [], [cards])
  if (taskCards.length === 0) return null
  return (
    <div className="my-2 flex w-full max-w-[860px] flex-col gap-3">
      {taskCards.map((card) => (
        <TaskCardView key={card.id} card={card} messageId={messageId} channelId={channelId} />
      ))}
    </div>
  )
}

function TaskCardView({
  card,
  messageId,
  channelId,
}: {
  card: TaskMessageCard
  messageId: string
  channelId?: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [retrying, setRetrying] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const latestProgress = card.progress?.[card.progress.length - 1]
  const latestProgressNote = cleanProgressNote(latestProgress?.note)
  const meta = statusMeta[card.status]
  const StatusIcon = meta.icon
  const statusLabel = t(`inbox.task.status.${card.status}`)
  const assigneeLabel = card.assignee?.label ?? t('inbox.task.unassigned')
  const assigneeLink = assigneeHref(card)
  const createdAt = compactDate(card.createdAt)
  const source = sourceMeta(card)
  const sourceLink = sourceHref(card, source)
  const todoItems = useMemo(() => extractTodoItems(card.body), [card.body])
  const doneTodos = todoItems.filter((item) => item.done).length
  const todoPercent = todoItems.length > 0 ? Math.round((doneTodos / todoItems.length) * 100) : 0
  const canRetry = card.status === 'failed'
  const detailPreview = card.body ? plainText(card.body) : ''

  const retryTask = async () => {
    setRetrying(true)
    try {
      await fetchApi(`/api/messages/${messageId}/cards/${card.id}/retry`, { method: 'POST' })
      if (channelId) {
        queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
      }
    } finally {
      setRetrying(false)
    }
  }

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-bg-secondary/92 shadow-[0_10px_30px_rgba(0,0,0,0.14)] transition-colors',
        meta.border,
      )}
    >
      <div className="grid gap-4 p-4 sm:p-5">
        <header className="flex min-w-0 items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border bg-bg-primary/45',
                meta.checkbox,
              )}
              aria-hidden
            >
              <StatusIcon
                size={18}
                className={card.status === 'running' ? 'animate-spin' : undefined}
              />
            </div>
            <div className="min-w-0">
              <h4 className="min-w-0 break-words text-base font-black leading-6 text-text-primary">
                {card.title}
              </h4>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <span
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-black',
                meta.badge,
              )}
            >
              <StatusIcon
                size={13}
                className={card.status === 'running' ? 'animate-spin' : undefined}
              />
              {statusLabel}
            </span>
            {canRetry && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={retrying ? Loader2 : RotateCw}
                disabled={retrying}
                onClick={() => void retryTask()}
                className="h-7 rounded-md border border-danger/25 bg-danger/5 px-2 text-xs text-danger hover:bg-danger/10"
              >
                {retrying ? t('common.loading') : t('inbox.task.retry')}
              </Button>
            )}
          </div>
        </header>

        <div className="border-t border-border-subtle/70" />

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem label={t('inbox.task.assignee')}>
            {assigneeLink ? (
              <a
                href={assigneeLink}
                className="inline-flex max-w-full items-center gap-1 rounded-md text-text-primary transition hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
              >
                <Bot size={14} className="shrink-0" />
                <span className="truncate">{assigneeLabel}</span>
              </a>
            ) : (
              <span className="inline-flex max-w-full items-center gap-1">
                <Bot size={14} className="shrink-0 text-text-muted" />
                <span className="truncate">{assigneeLabel}</span>
              </span>
            )}
          </InfoItem>
          <InfoItem label={t('inbox.task.app')}>
            {source.label ? (
              sourceLink ? (
                <a
                  href={sourceLink}
                  target={sourceLink.startsWith('http') ? '_blank' : undefined}
                  rel={sourceLink.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="inline-flex max-w-full items-center gap-1 rounded-md text-primary transition hover:underline focus:outline-none focus:ring-2 focus:ring-primary/35"
                >
                  <AppWindow size={14} className="shrink-0" />
                  <span className="truncate">{source.label}</span>
                </a>
              ) : (
                <span className="inline-flex max-w-full items-center gap-1">
                  <AppWindow size={14} className="shrink-0 text-text-muted" />
                  <span className="truncate">{source.label}</span>
                </span>
              )
            ) : (
              t('common.unknown')
            )}
          </InfoItem>
          <InfoItem label={t('inbox.task.createdAt')}>
            <span className="inline-flex max-w-full items-center gap-1">
              <CalendarClock size={14} className="shrink-0 text-text-muted" />
              <span className="truncate">{createdAt ?? t('common.unknown')}</span>
            </span>
          </InfoItem>
          <InfoItem label={t('inbox.task.statusLabel')}>{statusLabel}</InfoItem>
        </div>

        <div className="border-t border-border-subtle/70" />

        <Section
          icon={
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                statusMeta[latestProgress?.status ?? card.status].marker,
              )}
            />
          }
          title={t('inbox.task.latestProgress')}
        >
          <p className="min-w-0 truncate text-sm leading-6 text-text-secondary">
            {latestProgressNote ? plainText(latestProgressNote) : t('inbox.task.noProgress')}
          </p>
        </Section>

        <div className="border-t border-border-subtle/70" />

        <Section
          icon={<ClipboardList size={14} />}
          title={t('inbox.task.details')}
          action={
            card.body ? (
              <button
                type="button"
                onClick={() => setDetailsOpen((value) => !value)}
                className="inline-flex items-center gap-1 rounded-md text-xs font-black text-text-muted transition hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
              >
                <ChevronDown
                  size={14}
                  className={cn('transition-transform', detailsOpen && 'rotate-180')}
                />
                {detailsOpen ? t('inbox.task.hideDetails') : t('inbox.task.showDetails')}
              </button>
            ) : null
          }
        >
          {todoItems.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="font-black text-text-secondary">
                {t('inbox.task.todoProgress', { done: doneTodos, total: todoItems.length })}
              </span>
              <span className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-bg-primary/60">
                <span
                  className="block h-full rounded-full bg-success/75 transition-[width]"
                  style={{ width: `${todoPercent}%` }}
                />
              </span>
            </div>
          )}
          {card.body ? (
            detailsOpen ? (
              <div className="rounded-lg border border-border-subtle/70 bg-bg-primary/28 px-3.5 py-3 [&_.contains-task-list]:m-0 [&_.contains-task-list]:list-none [&_.contains-task-list]:pl-0 [&_.msg-markdown]:pt-0 [&_.msg-markdown]:text-sm [&_.msg-markdown]:leading-6 [&_.msg-markdown_h1]:text-lg [&_.msg-markdown_h2]:text-base [&_.msg-markdown_h3]:text-sm [&_.msg-markdown_h3]:leading-5 [&_.msg-markdown_p]:my-1 [&_.task-list-item]:my-1.5 [&_.task-list-item]:flex [&_.task-list-item]:items-start [&_.task-list-item]:gap-2 [&_.task-list-item_input]:mt-1">
                <MessageMarkdown content={card.body} renderMentions={renderNoMentions} />
              </div>
            ) : (
              <p className="line-clamp-2 text-sm leading-6 text-text-secondary">
                {detailPreview || t('inbox.task.noDetails')}
              </p>
            )
          ) : (
            <p className="text-sm leading-6 text-text-muted">{t('inbox.task.noDetails')}</p>
          )}
        </Section>
      </div>
    </article>
  )
}
