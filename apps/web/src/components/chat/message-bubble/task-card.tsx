import type { MessageCard, MessageCardStatus, TaskMessageCard } from '@shadowob/shared'
import { cn, DecorativeImage } from '@shadowob/ui'
import {
  AppWindow,
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardList,
  LoaderCircle,
  type LucideIcon,
  MessageSquare,
  Square,
  UserCheck,
  XCircle,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'
import { getApiUrl } from '../../../lib/api-url'
import { MessageMarkdown } from './markdown'
import type { ThreadPreview } from './types'

export function isTaskCard(card: MessageCard): card is TaskMessageCard {
  return card.kind === 'task' && typeof card.id === 'string' && typeof card.title === 'string'
}

function renderNoMentions(children: ReactNode) {
  return children
}

function resolveImageUrl(value: string | null) {
  if (!value) return null
  if (value.startsWith('data:') || /^https?:\/\//u.test(value)) return value
  return getApiUrl(value.startsWith('/') ? value : `/${value}`)
}

function TaskAppIcon({ iconUrl }: { iconUrl: string | null }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const resolvedIconUrl = resolveImageUrl(iconUrl)
  const shouldLoadIcon = Boolean(resolvedIconUrl && !failed)

  useEffect(() => {
    setFailed(false)
    setLoaded(false)
  }, [iconUrl])

  if (!shouldLoadIcon) {
    return <AppWindow size={14} className="shrink-0 text-white/60" />
  }

  return (
    <span className="relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded">
      {!loaded && <AppWindow size={14} className="absolute inset-0 h-3.5 w-3.5 text-white/60" />}
      <DecorativeImage
        src={resolvedIconUrl ?? ''}
        className={cn('h-full w-full object-cover', !loaded && 'invisible')}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function firstStringValue(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value)
    if (text) return text
  }
  return null
}

function taskStatusMeta(status: MessageCardStatus): {
  Icon: LucideIcon
  className: string
  iconClassName?: string
} {
  switch (status) {
    case 'queued':
      return {
        Icon: Square,
        className: 'text-[#AAB2C0]/90 hover:text-[#D7DEE8]',
      }
    case 'claimed':
      return {
        Icon: UserCheck,
        className: 'text-[#38BDF8]/90 hover:text-[#38BDF8]',
      }
    case 'running':
      return {
        Icon: LoaderCircle,
        className: 'text-[#FFB020]/90 hover:text-[#FFB020]',
        iconClassName: 'animate-spin motion-reduce:animate-none',
      }
    case 'completed':
      return {
        Icon: CheckCircle2,
        className: 'text-[#22C55E]/90 hover:text-[#22C55E]',
      }
    case 'failed':
      return {
        Icon: XCircle,
        className: 'text-[#FF2A55]/90 hover:text-[#FF2A55]',
      }
    case 'canceled':
      return {
        Icon: Ban,
        className: 'text-[#94A3B8]/90 hover:text-[#CBD5E1]',
      }
    case 'transferred':
      return {
        Icon: ArrowRightLeft,
        className: 'text-[#A78BFA]/90 hover:text-[#A78BFA]',
      }
  }
  return {
    Icon: Square,
    className: 'text-[#AAB2C0]/90 hover:text-[#D7DEE8]',
  }
}

function imageUrlFromRecord(record: Record<string, unknown> | null) {
  return firstStringValue(
    record?.iconUrl,
    record?.logoUrl,
    record?.avatarUrl,
    record?.imageUrl,
    record?.icon,
    record?.logo,
    record?.icon_url,
    record?.logo_url,
    record?.avatar_url,
    record?.image_url,
  )
}

function sourceMeta(card: TaskMessageCard): {
  label: string | null
  url: string | null
  appKey: string | null
  iconUrl: string | null
} {
  const source = card.source as
    | (TaskMessageCard['source'] & {
        appKey?: unknown
        icon_url?: unknown
        avatar_url?: unknown
        logo_url?: unknown
        image_url?: unknown
      })
    | null
    | undefined
  const app = asRecord(card.app)
  const resource = asRecord(source?.resource)
  const spaceApp = asRecord(card.data?.spaceApp)
  const resourceLabel = firstStringValue(resource?.label, resource?.name)
  const resourceKind = stringValue(resource?.kind)
  const resourceUrl = firstStringValue(resource?.url, resource?.href)
  const label = firstStringValue(app?.name, app?.label, source?.appName, source?.label) ?? null
  const command = stringValue(source?.command)
  const appKey = firstStringValue(app?.appKey, source?.appKey, spaceApp?.appKey)
  const iconUrl =
    imageUrlFromRecord(app) ??
    firstStringValue(
      source?.iconUrl,
      source?.avatarUrl,
      source?.logoUrl,
      source?.imageUrl,
      source?.icon_url,
      source?.avatar_url,
      source?.logo_url,
      source?.image_url,
    ) ??
    imageUrlFromRecord(spaceApp) ??
    imageUrlFromRecord(resource)
  return {
    label: label ?? command ?? resourceLabel ?? resourceKind ?? appKey,
    url: firstStringValue(app?.url, app?.href) ?? resourceUrl,
    appKey,
    iconUrl,
  }
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
    ? `/app/servers/${encodeURIComponent(server)}/space-apps/${encodeURIComponent(source.appKey)}`
    : null
}

function taskTagLabel(tag: NonNullable<TaskMessageCard['tags']>[number]) {
  if (typeof tag === 'string') return tag.trim().replace(/^#+/u, '')
  return tag.label?.trim().replace(/^#+/u, '') ?? ''
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

function stripTodoItems(markdown?: string) {
  if (!markdown) return ''
  return markdown
    .replace(/^\s*[-*]\s+\[[ xX]\]\s+.+?\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function TaskCardsView({
  cards,
  messageId,
  onOpenThread,
  thread,
}: {
  cards: MessageCard[] | undefined
  messageId: string
  onOpenThread?: (messageId: string) => void
  thread?: ThreadPreview | null
}) {
  const taskCards = useMemo(() => cards?.filter(isTaskCard) ?? [], [cards])
  if (taskCards.length === 0) return null
  return (
    <div className="my-2 flex w-full max-w-[min(960px,100%)] flex-col gap-3">
      {taskCards.map((card) => (
        <TaskCardView
          key={card.id}
          card={card}
          messageId={messageId}
          onOpenThread={onOpenThread}
          thread={thread}
        />
      ))}
    </div>
  )
}

function taskCardHasActivity(card: TaskMessageCard) {
  const progress = Array.isArray(card.progress) ? card.progress : []
  return card.status !== 'queued' || progress.length > 1
}

function timeFromValue(value: string | null | undefined) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function latestTaskActivityTime(card: TaskMessageCard, thread?: ThreadPreview | null) {
  const progress = Array.isArray(card.progress) ? card.progress : []
  return Math.max(
    timeFromValue(card.updatedAt),
    timeFromValue(card.createdAt),
    timeFromValue(thread?.updatedAt),
    timeFromValue(thread?.createdAt),
    ...progress.map((entry) => timeFromValue(entry.at)),
  )
}

function taskViewerReadAt(card: TaskMessageCard) {
  const task = asRecord(card.data?.task)
  return timeFromValue(stringValue(task?.viewerReadAt))
}

function TaskCardView({
  card,
  messageId,
  onOpenThread,
  thread,
}: {
  card: TaskMessageCard
  messageId: string
  onOpenThread?: (messageId: string) => void
  thread?: ThreadPreview | null
}) {
  const { t } = useTranslation()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const persistedReadAt = taskViewerReadAt(card)
  const [readActivityAt, setReadActivityAt] = useState(persistedReadAt)
  const statusLabel = t(`inbox.task.status.${card.status}`)
  const statusMeta = taskStatusMeta(card.status)
  const StatusIcon = statusMeta.Icon
  const priority = card.priority ?? 'normal'
  const priorityLabel = t(`inbox.task.priority.${priority}`)
  const source = sourceMeta(card)
  const sourceLink = sourceHref(card, source)
  const tags = useMemo(() => (card.tags ?? []).map(taskTagLabel).filter(Boolean), [card.tags])
  const todoItems = useMemo(() => extractTodoItems(card.body), [card.body])
  const descriptionMarkdown = useMemo(() => stripTodoItems(card.body), [card.body])
  const doneTodos = todoItems.filter((item) => item.done).length
  const detailPreview = descriptionMarkdown ? plainText(descriptionMarkdown) : ''
  const progressEntries = Array.isArray(card.progress) ? card.progress : []
  const latestProgress =
    [...progressEntries].reverse().find((entry) => entry.status !== 'queued' || entry.note) ??
    progressEntries.at(-1)
  const latestProgressNote = latestProgress?.note ? plainText(latestProgress.note) : ''
  const latestProgressMeta = latestProgress ? taskStatusMeta(latestProgress.status) : statusMeta
  const progressLabel =
    todoItems.length > 0
      ? t('inbox.task.todoProgress', { done: doneTodos, total: todoItems.length })
      : latestProgressNote
        ? latestProgressNote
        : progressEntries.length > 1 && latestProgress
          ? t(`inbox.task.status.${latestProgress.status}`)
          : card.status !== 'queued'
            ? statusLabel
            : t('inbox.task.noProgress')
  const progressTone =
    todoItems.length > 0 || progressEntries.length > 1 || card.status !== 'queued'
      ? latestProgressMeta.className
      : 'text-white/45'
  const threadMessageCount =
    typeof thread?.messageCount === 'number' && Number.isFinite(thread.messageCount)
      ? Math.max(0, thread.messageCount)
      : null
  const latestActivityAt = latestTaskActivityTime(card, thread)
  const hasActivity = taskCardHasActivity(card) && latestActivityAt > readActivityAt
  const priorityDot =
    priority === 'high'
      ? 'bg-[#FF2A55] shadow-[0_0_6px_rgba(255,42,85,0.8)]'
      : priority === 'medium'
        ? 'bg-[#FFB020] shadow-[0_0_6px_rgba(255,176,32,0.75)]'
        : priority === 'normal'
          ? 'bg-[#00F3FF] shadow-[0_0_6px_rgba(0,243,255,0.7)]'
          : 'bg-white/45'
  const priorityTone =
    priority === 'high'
      ? 'text-[#FF2A55]/90 hover:text-[#FF2A55] hover:drop-shadow-[0_0_8px_rgba(255,42,85,0.4)]'
      : priority === 'medium'
        ? 'text-[#FFB020]/90 hover:text-[#FFB020] hover:drop-shadow-[0_0_8px_rgba(255,176,32,0.35)]'
        : priority === 'normal'
          ? 'text-[#00F3FF]/90 hover:text-[#00F3FF] hover:drop-shadow-[0_0_8px_rgba(0,243,255,0.35)]'
          : 'text-white/50 hover:text-white/70'
  const expanded = detailsOpen

  useEffect(() => {
    setReadActivityAt((current) => Math.max(current, persistedReadAt))
  }, [persistedReadAt])

  return (
    <>
      <article
        className={cn(
          'group relative z-10 w-full overflow-hidden rounded-[40px] border border-white/10 bg-[#12121A]/60 p-7 text-white shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-[24px] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-2 hover:border-white/20 hover:shadow-[0_20px_60px_rgba(0,243,255,0.15)]',
          expanded ? 'max-w-[min(960px,100%)]' : 'max-w-[420px]',
        )}
        style={{
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex max-w-[85%] flex-wrap items-center gap-3.5 font-mono text-[13px] font-bold tracking-wide">
            <span
              className={cn(
                'flex cursor-default items-center gap-1.5 transition-all drop-shadow-[0_0_8px_rgba(0,230,118,0)] hover:drop-shadow-[0_0_8px_rgba(0,243,255,0.28)]',
                statusMeta.className,
              )}
            >
              <StatusIcon
                size={15}
                strokeWidth={2.4}
                className={cn('shrink-0', statusMeta.iconClassName)}
              />
              {statusLabel}
            </span>

            <span
              className={cn(
                'flex cursor-help items-center gap-1.5 transition-all drop-shadow-[0_0_8px_rgba(255,42,85,0)]',
                priorityTone,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', priorityDot)} />
              {priorityLabel}
            </span>

            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="cursor-pointer text-[#00F3FF]/90 transition-all drop-shadow-[0_0_8px_rgba(0,243,255,0)] hover:text-[#00F3FF] hover:drop-shadow-[0_0_8px_rgba(0,243,255,0.4)]"
              >
                #{tag}
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDetailsOpen((value) => !value)}
            className={cn(
              '-mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-transparent bg-white/5 p-2 text-white/40 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:border-[#00F3FF]/20 hover:bg-[#00F3FF]/10 hover:text-[#00F3FF] focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50',
              detailsOpen && 'border-[#00F3FF]/20 bg-[#00F3FF]/10',
            )}
            aria-label={detailsOpen ? t('inbox.task.hideDetails') : t('inbox.task.showDetails')}
          >
            <ChevronDown
              size={20}
              className={cn(
                'transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                detailsOpen && 'rotate-180 text-[#00F3FF]',
              )}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          className="mb-5 block w-full cursor-pointer text-left"
        >
          <h4 className="break-words text-[22px] font-black leading-[1.7] tracking-[0.05em] text-white transition-colors duration-300 group-hover:text-[#00F3FF] group-hover:drop-shadow-[0_0_12px_rgba(0,243,255,0.4)]">
            {card.title}
          </h4>
          {!detailsOpen && detailPreview ? (
            <p className="mt-2 line-clamp-2 text-sm font-medium leading-[1.7] tracking-[0.05em] text-white/50">
              {detailPreview}
            </p>
          ) : null}
        </button>

        <div
          className={cn(
            'grid transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
            detailsOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className="overflow-hidden">
            <div className="mb-5 rounded-[22px] border border-white/5 bg-white/[0.025] p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] backdrop-blur-md">
              {descriptionMarkdown ? (
                <div className="[&_.contains-task-list]:m-0 [&_.contains-task-list]:list-none [&_.contains-task-list]:pl-0 [&_.msg-markdown]:pt-0 [&_.msg-markdown]:text-sm [&_.msg-markdown]:leading-[1.7] [&_.msg-markdown]:tracking-[0.05em] [&_.msg-markdown]:text-white/70 [&_.msg-markdown_p]:my-1">
                  <MessageMarkdown
                    content={descriptionMarkdown}
                    renderMentions={renderNoMentions}
                  />
                </div>
              ) : (
                <p className="text-sm leading-[1.7] tracking-[0.05em] text-white/50">
                  {t('inbox.task.noDetails')}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mb-2 mt-4 flex items-center justify-between gap-3 text-xs font-mono text-white/60">
          <span className={cn('flex shrink-0 items-center gap-1.5 font-semibold', progressTone)}>
            <ClipboardList size={16} className="shrink-0" />
            {t('inbox.task.progress')}
          </span>
          <span
            className={cn(
              'min-w-0 max-w-[12rem] truncate text-right font-bold tracking-wider',
              progressTone,
            )}
          >
            {progressLabel}
          </span>
        </div>

        {todoItems.length > 0 ? (
          <div
            className={cn(
              'grid transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
              detailsOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
          >
            <div className="overflow-hidden">
              <div className="pb-1 pt-4">
                <div className="rounded-[20px] border border-white/5 bg-white/[0.02] p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)] backdrop-blur-md">
                  <ul className="space-y-3 font-mono text-[13px] text-white/60">
                    {todoItems.map((item) => (
                      <li
                        key={`${item.done ? 'done' : 'open'}:${item.text}`}
                        className="group/todo flex cursor-pointer items-start gap-3"
                      >
                        <span className="relative mt-0.5">
                          {item.done ? (
                            <CheckCircle2
                              size={16}
                              className="text-[#00E676] drop-shadow-[0_0_4px_rgba(0,230,118,0.5)]"
                            />
                          ) : (
                            <Circle
                              size={16}
                              className="text-[#F8E71C] transition-colors group-hover/todo:text-[#00F3FF]"
                            />
                          )}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 break-words leading-[1.7] tracking-[0.05em] transition-colors',
                            item.done
                              ? 'text-white/30 line-through group-hover/todo:text-white/50'
                              : 'text-white/90 group-hover/todo:text-[#00F3FF]',
                          )}
                        >
                          {item.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <footer className="relative z-10 mt-6 border-t border-white/10 pt-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 font-mono text-[13px] text-white/50">
              {source.label ? (
                sourceLink ? (
                  <a
                    href={sourceLink}
                    target={sourceLink.startsWith('http') ? '_blank' : undefined}
                    rel={sourceLink.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className={cn(
                      'group/app flex min-w-0 items-center gap-1.5 rounded-full border border-transparent bg-white/[0.03] px-2.5 py-1.5 transition-all duration-300 hover:border-[#00F3FF]/20 hover:bg-[#00F3FF]/10 focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50',
                      expanded ? 'max-w-[220px]' : 'max-w-[120px]',
                    )}
                  >
                    <TaskAppIcon iconUrl={source.iconUrl} />
                    <span className="min-w-0 truncate pt-px text-[12px] font-medium text-white/60 transition-colors group-hover/app:text-[#00F3FF]">
                      {source.label}
                    </span>
                  </a>
                ) : (
                  <div
                    className={cn(
                      'flex min-w-0 items-center gap-1.5 rounded-full border border-transparent bg-white/[0.03] px-2.5 py-1.5',
                      expanded ? 'max-w-[220px]' : 'max-w-[120px]',
                    )}
                  >
                    <TaskAppIcon iconUrl={source.iconUrl} />
                    <span className="min-w-0 truncate pt-px text-[12px] font-medium text-white/60">
                      {source.label}
                    </span>
                  </div>
                )
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => {
                setReadActivityAt(Math.max(Date.now(), latestActivityAt))
                void fetchApi(`/api/messages/${messageId}/cards/${card.id}/read`, {
                  method: 'POST',
                }).catch(() => undefined)
                onOpenThread?.(messageId)
              }}
              className="group/reply relative flex shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-white/[0.03] px-3 py-1.5 transition-all duration-300 hover:border-[#7C4DFF]/30 hover:bg-[#7C4DFF]/20 focus:outline-none focus:ring-2 focus:ring-[#7C4DFF]/50"
              aria-label={t('inbox.task.replies')}
            >
              <MessageSquare
                size={16}
                className="text-white/50 transition-colors group-hover/reply:text-[#7C4DFF]"
              />
              {threadMessageCount !== null ? (
                <span className="min-w-[1ch] pt-px font-mono text-[11px] font-black leading-none text-white/55 transition-colors group-hover/reply:text-[#7C4DFF]">
                  {threadMessageCount > 99 ? '99+' : threadMessageCount}
                </span>
              ) : null}
              {hasActivity ? (
                <span
                  aria-hidden="true"
                  className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-[#FF2A55] shadow-[0_0_8px_rgba(255,42,85,0.75)]"
                />
              ) : null}
            </button>
          </div>
        </footer>
      </article>
    </>
  )
}
